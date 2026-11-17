import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import type { MediaAsset, MediaKind } from '@velocut/shared';
import { mediaRegistry } from './opfsStorage';

export function inferMediaKind(file: { type: string; name: string }): MediaKind {
  if (file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac)$/i.test(file.name)) {
    return 'audio';
  }
  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name)) {
    return 'image';
  }
  return 'video';
}

export async function extractWaveformPeaks(
  blob: Blob,
  barCount = 64
): Promise<number[]> {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return [];

    const ctx = new AudioCtx();
    try {
      const arrayBuf = await blob.slice(0, 20 * 1024 * 1024).arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      const channel = audioBuf.getChannelData(0);
      const step = Math.max(1, Math.floor(channel.length / barCount));
      const peaks: number[] = [];

      for (let i = 0; i < barCount; i++) {
        const start = i * step;
        const end = Math.min(channel.length, start + step);
        let peak = 0;
        for (let j = start; j < end; j++) {
          const abs = Math.abs(channel[j]);
          if (abs > peak) peak = abs;
        }
        peaks.push(Number(Math.min(1, peak).toFixed(3)));
      }
      return peaks;
    } finally {
      await ctx.close();
    }
  } catch {
    return [];
  }
}

function captureThumbnailDataUrl(
  source: HTMLVideoElement | HTMLImageElement,
  srcW: number,
  srcH: number
): string | undefined {
  try {
    if (typeof document === 'undefined' || srcW <= 0 || srcH <= 0) return undefined;
    const canvas = document.createElement('canvas');
    const maxW = 160;
    const maxH = 90;
    const scale = Math.min(maxW / srcW, maxH / srcH, 1);
    canvas.width = Math.max(16, Math.round(srcW * scale));
    canvas.height = Math.max(16, Math.round(srcH * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.65);
  } catch {
    return undefined;
  }
}

export async function probeAndRegisterMediaFile(
  file: File | Blob,
  name: string,
  mimeType: string
): Promise<MediaAsset> {
  const assetId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `asset-${crypto.randomUUID().slice(0, 8)}`
      : `asset-${Date.now().toString(36)}`;

  const kind = inferMediaKind({ type: mimeType, name });
  const { objectUrl, opfsPath } = await mediaRegistry.saveAssetFile(
    assetId,
    file,
    name
  );

  let duration = kind === 'image' ? 4 : 5;
  let width = 1280;
  let height = 720;
  let hasAudio = kind === 'audio';
  let thumbnailUrl: string | undefined;

  if (kind === 'video') {
    const meta = await new Promise<{
      duration: number;
      width: number;
      height: number;
      thumbnailUrl?: string;
    }>((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.src = objectUrl;
      let settled = false;
      const finish = (thumb?: string) => {
        if (settled) return;
        settled = true;
        resolve({
          duration:
            Number.isFinite(video.duration) && video.duration > 0
              ? video.duration
              : 5,
          width: video.videoWidth || 1280,
          height: video.videoHeight || 720,
          thumbnailUrl: thumb,
        });
      };
      video.onloadeddata = () => {
        const w = video.videoWidth || 1280;
        const h = video.videoHeight || 720;
        finish(captureThumbnailDataUrl(video, w, h));
      };
      video.onseeked = () => {
        const w = video.videoWidth || 1280;
        const h = video.videoHeight || 720;
        finish(captureThumbnailDataUrl(video, w, h));
      };
      video.onloadedmetadata = () => {
        try {
          if (video.currentTime === 0) video.currentTime = 0.05;
        } catch {
          // Ignore seek errors before data arrives
        }
        setTimeout(() => finish(), 450);
      };
      video.onerror = () => finish();
    });
    duration = meta.duration;
    width = meta.width;
    height = meta.height;
    thumbnailUrl = meta.thumbnailUrl;
    hasAudio = true;
  } else if (kind === 'audio') {
    duration = await new Promise<number>((resolve) => {
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      audio.src = objectUrl;
      audio.onloadedmetadata = () => {
        resolve(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 5);
      };
      audio.onerror = () => resolve(5);
    });
  } else if (kind === 'image') {
    const dims = await new Promise<{
      width: number;
      height: number;
      thumbnailUrl?: string;
    }>((resolve) => {
      const img = new Image();
      img.src = objectUrl;
      img.onload = () => {
        const w = img.naturalWidth || 1280;
        const h = img.naturalHeight || 720;
        resolve({
          width: w,
          height: h,
          thumbnailUrl: captureThumbnailDataUrl(img, w, h),
        });
      };
      img.onerror = () => resolve({ width: 1280, height: 720 });
    });
    width = dims.width;
    height = dims.height;
    thumbnailUrl = dims.thumbnailUrl;
    hasAudio = false;
  }

  const waveform =
    kind === 'audio' || kind === 'video' ? await extractWaveformPeaks(file) : [];
  if (kind === 'video') {
    hasAudio = waveform.length > 0;
  }

  return {
    id: assetId,
    name,
    kind,
    mimeType: mimeType || file.type || 'application/octet-stream',
    size: file.size,
    duration: Number(duration.toFixed(3)),
    width,
    height,
    hasAudio,
    source: 'local',
    opfsPath,
    waveform,
    thumbnailUrl,
  };
}

function encodeFloat32Wav(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number
): Blob {
  const numSamples = left.length;
  const buffer = new ArrayBuffer(44 + numSamples * 4);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 4, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 4, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    view.setInt16(offset, l * 0x7fff, true);
    view.setInt16(offset + 2, r * 0x7fff, true);
    offset += 4;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export async function generateSyntheticDemoMedia(): Promise<{
  visualAsset: MediaAsset;
  audioAsset: MediaAsset;
}> {
  // 1. Synthesize a warm ambient chord progression WAV (5 seconds)
  const sampleRate = 44100;
  const durationSec = 5;
  const totalSamples = sampleRate * durationSec;
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  const freqs = [220, 277.18, 329.63, 440];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const pulse = 0.35 + 0.25 * Math.sin(2 * Math.PI * 1.5 * t);
    const fadeIn = Math.min(1, t / 0.2);
    const fadeOut = Math.min(1, (durationSec - t) / 0.3);
    const env = pulse * fadeIn * fadeOut;

    let sampleL = 0;
    let sampleR = 0;
    for (let f = 0; f < freqs.length; f++) {
      const phase = 2 * Math.PI * freqs[f] * t;
      sampleL += Math.sin(phase) * (0.14 - f * 0.02);
      sampleR += Math.sin(phase + 0.35 * f) * (0.14 - f * 0.02);
    }
    left[i] = sampleL * env;
    right[i] = sampleR * env;
  }
  const wavBlob = encodeFloat32Wav(left, right, sampleRate);
  const audioAsset = await probeAndRegisterMediaFile(
    wavBlob,
    'velocut_ambient_demo.wav',
    'audio/wav'
  );

  // 2. Generate a real 5s H.264 MP4 using WebCodecs + mp4-muxer when supported,
  //    or fallback to a crisp procedural PNG card if running without WebCodecs.
  if (
    typeof VideoEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined'
  ) {
    try {
      const width = 1280;
      const height = 720;
      const fps = 24;
      const totalFrames = durationSec * fps;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;

      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        video: { codec: 'avc', width, height },
        fastStart: 'in-memory',
      });

      const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: () => {
          // Handled by fallback below
        },
      });

      encoder.configure({
        codec: 'avc1.42001f',
        width,
        height,
        bitrate: 2_500_000,
        framerate: fps,
      });

      for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
        const t = frameIdx / fps;
        const grad = ctx.createLinearGradient(0, 0, width, height);
        const hueA = (195 + t * 28) % 360;
        const hueB = (265 + t * 20) % 360;
        grad.addColorStop(0, `hsl(${hueA}, 72%, 22%)`);
        grad.addColorStop(0.55, `hsl(${(hueA + 40) % 360}, 65%, 14%)`);
        grad.addColorStop(1, `hsl(${hueB}, 70%, 24%)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        // Animated studio grid + orb
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        for (let gx = 0; gx < width; gx += 80) {
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, height);
          ctx.stroke();
        }
        const orbX = width * (0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.4)));
        const orbY = height * (0.5 + 0.18 * Math.cos(t * 2.1));
        const orb = ctx.createRadialGradient(orbX, orbY, 10, orbX, orbY, 220);
        orb.addColorStop(0, 'rgba(34, 211, 238, 0.72)');
        orb.addColorStop(1, 'rgba(34, 211, 238, 0)');
        ctx.fillStyle = orb;
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#f8fafc';
        ctx.font = '700 54px Inter, system-ui, sans-serif';
        ctx.fillText('VELOCUT V-HESA DEMO', 86, 136);
        ctx.fillStyle = '#38bdf8';
        ctx.font = '600 28px ui-monospace, monospace';
        ctx.fillText(`60FPS Hybrid-Edge Studio  |  t = ${t.toFixed(2)}s`, 86, 188);

        const frame = new VideoFrame(canvas, {
          timestamp: Math.round(t * 1_000_000),
          duration: Math.round((1 / fps) * 1_000_000),
        });
        encoder.encode(frame, { keyFrame: frameIdx % fps === 0 });
        frame.close();
      }

      await encoder.flush();
      encoder.close();
      muxer.finalize();

      const mp4Blob = new Blob([target.buffer], { type: 'video/mp4' });
      const visualAsset = await probeAndRegisterMediaFile(
        mp4Blob,
        'velocut_studio_demo.mp4',
        'video/mp4'
      );
      visualAsset.hasAudio = false;
      return { visualAsset, audioAsset };
    } catch {
      // Fall back to procedural PNG overlay card
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 1280, 720);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#164e63');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '700 52px system-ui, sans-serif';
    ctx.fillText('VELOCUT STUDIO DEMO', 90, 340);
  }
  const pngBlob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b || new Blob()), 'image/png')
  );
  const visualAsset = await probeAndRegisterMediaFile(
    pngBlob,
    'velocut_demo_card.png',
    'image/png'
  );
  return { visualAsset, audioAsset };
}

