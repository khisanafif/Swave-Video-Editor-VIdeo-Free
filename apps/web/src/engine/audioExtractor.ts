import type { Clip, MediaAsset, ProjectDocument } from '@swave/shared';
import { mediaRegistry } from './opfsStorage';
import { resolveServerUrl } from './serverOffloadClient';

export interface SpeechSegment {
  start: number;
  end: number;
}

/**
 * Encodes 1 (mono) or 2 (stereo) Float32 PCM channels into a 16-bit PCM WAV Blob.
 */
export function encodeWavFromChannels(
  channels: Float32Array[],
  sampleRate = 44100
): Blob {
  const numChannels = channels.length >= 2 ? 2 : 1;
  const ch0 = channels[0] || new Float32Array(0);
  const ch1 = numChannels === 2 ? channels[1] || ch0 : ch0;
  const numSamples = ch0.length;
  const blockAlign = numChannels * 2;
  const dataBytes = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const l = Math.max(-1, Math.min(1, ch0[i]));
    view.setInt16(offset, l < 0 ? l * 0x8000 : l * 0x7fff, true);
    if (numChannels === 2) {
      const r = Math.max(-1, Math.min(1, ch1[i]));
      view.setInt16(offset + 2, r < 0 ? r * 0x8000 : r * 0x7fff, true);
    }
    offset += blockAlign;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export function encodeMonoWav16k(
  samples: Float32Array,
  sampleRate = 16000
): Blob {
  return encodeWavFromChannels([samples], sampleRate);
}

export function detectSpeechSegmentsVad(
  pcm: Float32Array,
  sampleRate = 16000,
  options?: { minSpeechSec?: number; minSilenceSec?: number }
): SpeechSegment[] {
  if (pcm.length === 0 || sampleRate <= 0) return [];

  const minSpeechSec = options?.minSpeechSec ?? 0.25;
  const minSilenceSec = options?.minSilenceSec ?? 0.3;
  const windowSec = 0.04;
  const step = Math.max(1, Math.floor(sampleRate * windowSec));
  const energies: number[] = [];

  for (let i = 0; i < pcm.length; i += step) {
    const end = Math.min(pcm.length, i + step);
    let sumSq = 0;
    for (let j = i; j < end; j++) {
      sumSq += pcm[j] * pcm[j];
    }
    energies.push(Math.sqrt(sumSq / Math.max(1, end - i)));
  }

  if (energies.length === 0) return [];
  const sorted = [...energies].sort((a, b) => a - b);
  const noiseFloor = sorted[Math.floor(sorted.length * 0.2)] || 0.005;
  const peak = sorted[Math.floor(sorted.length * 0.95)] || 0.05;
  const threshold = Math.max(0.014, noiseFloor * 2.4, peak * 0.16);

  const hangoverFrames = Math.max(2, Math.round(minSilenceSec / windowSec));
  const segments: SpeechSegment[] = [];
  let activeStart: number | null = null;
  let silenceRun = 0;

  for (let idx = 0; idx < energies.length; idx++) {
    const isSpeech = energies[idx] >= threshold;
    if (isSpeech) {
      if (activeStart === null) {
        activeStart = idx * windowSec;
      }
      silenceRun = 0;
    } else if (activeStart !== null) {
      silenceRun++;
      if (silenceRun >= hangoverFrames) {
        const end = Math.max(
          activeStart + minSpeechSec,
          (idx - silenceRun + 2) * windowSec
        );
        if (end - activeStart >= minSpeechSec) {
          segments.push({
            start: Number(activeStart.toFixed(3)),
            end: Number(end.toFixed(3)),
          });
        }
        activeStart = null;
        silenceRun = 0;
      }
    }
  }

  if (activeStart !== null) {
    const end = energies.length * windowSec;
    if (end - activeStart >= minSpeechSec) {
      segments.push({
        start: Number(activeStart.toFixed(3)),
        end: Number(end.toFixed(3)),
      });
    }
  }

  return segments;
}

export async function extractProjectAudioPcm16k(
  project: ProjectDocument,
  targetClipId?: string
): Promise<{
  pcm: Float32Array;
  sampleRate: number;
  duration: number;
  startOffsetSec: number;
  wavBlob: Blob;
}> {
  const sampleRate = 16000;
  const clipsToInclude: Clip[] = [];

  if (targetClipId && project.clips[targetClipId]) {
    clipsToInclude.push(project.clips[targetClipId]);
  } else {
    for (const tid of project.trackOrder) {
      const tr = project.tracks[tid];
      if (!tr || tr.isMuted) continue;
      for (const cid of tr.clipIds) {
        const c = project.clips[cid];
        if (!c || c.type === 'text' || c.duration <= 0) continue;
        const asset = project.assets[c.assetId];
        if (!asset || (!asset.hasAudio && asset.kind !== 'audio')) continue;
        clipsToInclude.push(c);
      }
    }
  }

  if (clipsToInclude.length === 0) {
    throw new Error(
      'Tidak ada klip video/audio bersuara yang aktif untuk dibuatkan subtitle.'
    );
  }

  const startOffsetSec = targetClipId ? clipsToInclude[0].start : 0;
  const totalDuration = targetClipId
    ? Math.max(0.5, clipsToInclude[0].duration)
    : Math.max(
        0.5,
        clipsToInclude.reduce((m, c) => Math.max(m, c.start + c.duration), 0)
      );

  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;

  if (!OfflineCtx) {
    throw new Error(
      'OfflineAudioContext tidak tersedia pada browser ini untuk mengekstrak audio.'
    );
  }

  const totalFrames = Math.max(1, Math.ceil(totalDuration * sampleRate));
  const offline = new OfflineCtx(1, totalFrames, sampleRate);
  let decodedAny = false;

  for (const clip of clipsToInclude) {
    const asset = project.assets[clip.assetId];
    if (!asset) continue;

    try {
      const blob = mediaRegistry.getBlob(asset.id);
      const buf = blob
        ? await blob.arrayBuffer()
        : asset.serverUrl
        ? await (await fetch(resolveServerUrl(asset.serverUrl))).arrayBuffer()
        : null;
      if (!buf) continue;

      const decoded = await offline.decodeAudioData(buf.slice(0));
      const src = offline.createBufferSource();
      src.buffer = decoded;
      const speed = Math.max(0.25, Math.min(4, clip.speed || 1));
      src.playbackRate.value = speed;

      const gain = offline.createGain();
      gain.gain.value = clip.volume ?? 1;
      src.connect(gain);
      gain.connect(offline.destination);

      const when = targetClipId ? 0 : Math.max(0, clip.start);
      const sourceDur = Math.max(0.05, clip.duration * speed);
      src.start(when, clip.offset, sourceDur);
      decodedAny = true;
    } catch {
      // Skip non-decodable clips
    }
  }

  if (!decodedAny) {
    throw new Error(
      'Audio dari klip tidak dapat didekode. Pastikan video memiliki trek suara.'
    );
  }

  const rendered = await offline.startRendering();
  const pcm = new Float32Array(rendered.getChannelData(0));
  const wavBlob = encodeMonoWav16k(pcm, sampleRate);

  return {
    pcm,
    sampleRate,
    duration: totalDuration,
    startOffsetSec,
    wavBlob,
  };
}

/**
 * Extracts stereo/mono high-quality WAV audio directly from a video/audio MediaAsset
 * (or a specific trimmed Clip slice), ready to register in Media Bin or download.
 */
export async function extractAudioFromMediaAsset(
  asset: MediaAsset,
  options?: { clip?: Clip }
): Promise<{
  wavBlob: Blob;
  filename: string;
  duration: number;
  sampleRate: number;
}> {
  const blob = mediaRegistry.getBlob(asset.id);
  const buf = blob
    ? await blob.arrayBuffer()
    : asset.serverUrl
    ? await (await fetch(resolveServerUrl(asset.serverUrl))).arrayBuffer()
    : null;

  if (!buf) {
    throw new Error(
      `File media "${asset.name}" belum tersedia di memori perangkat atau server.`
    );
  }

  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;

  if (!OfflineCtx) {
    throw new Error(
      'Browser/WebView ini belum mendukung OfflineAudioContext untuk ekstrak audio.'
    );
  }

  // Decode source audio using a temporary small OfflineAudioContext
  const probeCtx = new OfflineCtx(2, 1, 44100);
  let decoded: AudioBuffer;
  try {
    decoded = await probeCtx.decodeAudioData(buf.slice(0));
  } catch {
    throw new Error(
      `Track audio tidak ditemukan atau codec tidak didukung pada "${asset.name}".`
    );
  }

  const sampleRate = decoded.sampleRate || 44100;
  const outChannels = decoded.numberOfChannels >= 2 ? 2 : 1;
  const clip = options?.clip;
  const speed = clip ? Math.max(0.25, Math.min(4, clip.speed || 1)) : 1;
  const offsetSec = clip ? Math.max(0, clip.offset) : 0;
  const durationSec = clip
    ? Math.max(0.2, clip.duration)
    : Math.max(0.2, decoded.duration);

  const totalFrames = Math.max(1, Math.ceil(durationSec * sampleRate));
  const offline = new OfflineCtx(outChannels, totalFrames, sampleRate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.playbackRate.value = speed;

  const gain = offline.createGain();
  gain.gain.value = clip ? Math.max(0.05, Math.min(2, clip.volume ?? 1)) : 1;
  src.connect(gain);
  gain.connect(offline.destination);
  src.start(0, offsetSec, durationSec * speed);

  const rendered = await offline.startRendering();
  const channels: Float32Array[] = [new Float32Array(rendered.getChannelData(0))];
  if (outChannels === 2 && rendered.numberOfChannels >= 2) {
    channels.push(new Float32Array(rendered.getChannelData(1)));
  }

  const wavBlob = encodeWavFromChannels(channels, sampleRate);
  const baseName = asset.name.replace(/\.[^.]+$/, '') || 'audio-ekstrak';
  const filename = `${baseName}_audio.wav`;

  return {
    wavBlob,
    filename,
    duration: Number(rendered.duration.toFixed(3)),
    sampleRate,
  };
}
