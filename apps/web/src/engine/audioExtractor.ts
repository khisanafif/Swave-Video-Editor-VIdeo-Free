import type { Clip, ProjectDocument } from '@velocut/shared';
import { mediaRegistry } from './opfsStorage';
import { resolveServerUrl } from './serverOffloadClient';

export interface SpeechSegment {
  start: number;
  end: number;
}

export function encodeMonoWav16k(
  samples: Float32Array,
  sampleRate = 16000
): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
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
