import type { MediaAsset } from '@swave/shared';
import { resolveOrtBaseUrl } from './autoSubtitleEngine';
import { probeAndRegisterMediaFile } from './mediaProbe';

export interface CutoutProgressInfo {
  progress: number;
  message: string;
}

export interface DetectedBorderColor {
  hex: string;
  r: number;
  g: number;
  b: number;
  isDark: boolean;
  isLight: boolean;
}

async function loadVisualSourceCanvas(
  kind: MediaAsset['kind'],
  objectUrl: string,
  timeSec = 0,
  maxDimension?: number
): Promise<{ canvas: HTMLCanvasElement; origWidth: number; origHeight: number }> {
  if (kind === 'image') {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Gagal memuat gambar overlay.'));
      el.src = objectUrl;
    });
    const origWidth = img.naturalWidth || img.width || 1080;
    const origHeight = img.naturalHeight || img.height || 1080;
    const scale =
      maxDimension && Math.max(origWidth, origHeight) > maxDimension
        ? maxDimension / Math.max(origWidth, origHeight)
        : 1;
    const w = Math.max(16, Math.round(origWidth * scale));
    const h = Math.max(16, Math.round(origHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D tidak tersedia.');
    ctx.drawImage(img, 0, 0, w, h);
    return { canvas, origWidth, origHeight };
  }

  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('Gagal memuat frame video overlay.'));
    video.src = objectUrl;
  });

  const targetTime = Math.max(
    0,
    Math.min(Math.max(0, (video.duration || 1) - 0.05), timeSec)
  );
  if (Math.abs(video.currentTime - targetTime) > 0.04) {
    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked);
      video.currentTime = targetTime;
    });
  }

  const origWidth = video.videoWidth || 1280;
  const origHeight = video.videoHeight || 720;
  const scale =
    maxDimension && Math.max(origWidth, origHeight) > maxDimension
      ? maxDimension / Math.max(origWidth, origHeight)
      : 1;
  const w = Math.max(16, Math.round(origWidth * scale));
  const h = Math.max(16, Math.round(origHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D tidak tersedia.');
  ctx.drawImage(video, 0, 0, w, h);
  return { canvas, origWidth, origHeight };
}

function runCutoutWorker(options: {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  preferCdnWasm?: boolean;
  onProgress?: (info: CutoutProgressInfo) => void;
}): Promise<{ rgba: Uint8ClampedArray; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./cutoutWorker.ts', import.meta.url), {
      type: 'module',
    });
    const ortBaseUrl = resolveOrtBaseUrl();

    worker.onmessage = (
      e: MessageEvent<
        | { type: 'progress'; progress: number; message: string }
        | { type: 'result'; rgba: Uint8ClampedArray; width: number; height: number }
        | { type: 'error'; error: string }
      >
    ) => {
      const msg = e.data;
      if (!msg) return;
      if (msg.type === 'progress') {
        options.onProgress?.({ progress: msg.progress, message: msg.message });
      } else if (msg.type === 'result') {
        worker.terminate();
        resolve({ rgba: msg.rgba, width: msg.width, height: msg.height });
      } else if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.error));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(err.message || 'Cutout worker mengalami error.'));
    };

    const copy = new Uint8ClampedArray(options.rgba);
    worker.postMessage(
      {
        type: 'cutout',
        rgba: copy,
        width: options.width,
        height: options.height,
        ortBaseUrl,
        preferCdnWasm: options.preferCdnWasm,
      },
      [copy.buffer]
    );
  });
}

function buildCutoutPngBlob(
  fullCanvas: HTMLCanvasElement,
  maskResult: { rgba: Uint8ClampedArray; width: number; height: number }
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = maskResult.width;
    maskCanvas.height = maskResult.height;
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) {
      reject(new Error('Mask canvas tidak tersedia.'));
      return;
    }

    const maskImg = new ImageData(
      new Uint8ClampedArray(maskResult.rgba),
      maskResult.width,
      maskResult.height
    );
    maskCtx.putImageData(maskImg, 0, 0);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = fullCanvas.width;
    outCanvas.height = fullCanvas.height;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) {
      reject(new Error('Output canvas tidak tersedia.'));
      return;
    }

    outCtx.clearRect(0, 0, outCanvas.width, outCanvas.height);
    outCtx.drawImage(fullCanvas, 0, 0, outCanvas.width, outCanvas.height);
    outCtx.globalCompositeOperation = 'destination-in';
    outCtx.drawImage(maskCanvas, 0, 0, outCanvas.width, outCanvas.height);
    outCtx.globalCompositeOperation = 'source-over';

    outCanvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Gagal membuat file PNG transparan.'));
          return;
        }
        resolve(blob);
      },
      'image/png',
      1.0
    );
  });
}

/**
 * Runs CapCut-style 1-tap AI Auto Cutout on an image or captured video frame,
 * returning a newly registered transparent PNG MediaAsset.
 */
export async function runAiCutoutOnClipAsset(options: {
  asset: MediaAsset;
  objectUrl: string;
  timeSec?: number;
  onProgress?: (info: CutoutProgressInfo) => void;
}): Promise<MediaAsset> {
  const { asset, objectUrl, timeSec = 0, onProgress } = options;
  if (asset.kind === 'audio') {
    throw new Error('Potong latar hanya berlaku untuk klip video/gambar.');
  }

  onProgress?.({ progress: 3, message: 'Membaca frame untuk Potong Latar AI...' });

  const full = await loadVisualSourceCanvas(asset.kind, objectUrl, timeSec, 1920);
  const workerCanvas = document.createElement('canvas');
  const maxAiDim = 896;
  const aiScale =
    Math.max(full.canvas.width, full.canvas.height) > maxAiDim
      ? maxAiDim / Math.max(full.canvas.width, full.canvas.height)
      : 1;
  workerCanvas.width = Math.max(16, Math.round(full.canvas.width * aiScale));
  workerCanvas.height = Math.max(16, Math.round(full.canvas.height * aiScale));
  const wCtx = workerCanvas.getContext('2d');
  if (!wCtx) throw new Error('Canvas worker tidak tersedia.');
  wCtx.drawImage(full.canvas, 0, 0, workerCanvas.width, workerCanvas.height);
  const inputImageData = wCtx.getImageData(
    0,
    0,
    workerCanvas.width,
    workerCanvas.height
  );

  let maskResult: { rgba: Uint8ClampedArray; width: number; height: number };
  try {
    maskResult = await runCutoutWorker({
      rgba: inputImageData.data,
      width: workerCanvas.width,
      height: workerCanvas.height,
      onProgress,
    });
  } catch (err) {
    const msg = (err as Error)?.message || '';
    const isOrtWasmError = /ort|wasm|backend|import/i.test(msg);
    if (!isOrtWasmError) throw err;
    onProgress?.({
      progress: 12,
      message: 'Mencoba ulang runtime AI via CDN...',
    });
    maskResult = await runCutoutWorker({
      rgba: inputImageData.data,
      width: workerCanvas.width,
      height: workerCanvas.height,
      preferCdnWasm: true,
      onProgress,
    });
  }

  onProgress?.({ progress: 96, message: 'Menyimpan hasil PNG transparan...' });
  const pngBlob = await buildCutoutPngBlob(full.canvas, maskResult);
  const baseName = asset.name.replace(/\.[^.]+$/, '');
  const pngName = `${baseName}-cutout.png`;
  const newAsset = await probeAndRegisterMediaFile(pngBlob, pngName, 'image/png');
  onProgress?.({ progress: 100, message: 'Latar belakang berhasil dihapus!' });
  return newAsset;
}

/**
 * 100% offline corner/edge background color detector for solid/studio backgrounds.
 */
export async function detectDominantBorderColor(
  kind: MediaAsset['kind'],
  objectUrl: string,
  timeSec = 0
): Promise<DetectedBorderColor> {
  const { canvas } = await loadVisualSourceCanvas(kind, objectUrl, timeSec, 192);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D tidak tersedia.');
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;

  const samples: Array<[number, number, number]> = [];
  const samplePixel = (x: number, y: number) => {
    const cx = Math.max(0, Math.min(width - 1, x));
    const cy = Math.max(0, Math.min(height - 1, y));
    const idx = (cy * width + cx) * 4;
    if (data[idx + 3] < 32) return;
    samples.push([data[idx], data[idx + 1], data[idx + 2]]);
  };

  for (let i = 0; i < 8; i++) {
    const tx = Math.round(((width - 1) * i) / 7);
    const ty = Math.round(((height - 1) * i) / 7);
    samplePixel(tx, 2);
    samplePixel(tx, height - 3);
    samplePixel(2, ty);
    samplePixel(width - 3, ty);
  }

  if (samples.length === 0) {
    return { hex: '#00b140', r: 0, g: 177, b: 64, isDark: false, isLight: false };
  }

  // Quantize into 16-unit buckets to pick the true border mode rather than murky average
  const buckets = new Map<string, { count: number; rSum: number; gSum: number; bSum: number }>();
  for (const [r, g, b] of samples) {
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const entry = buckets.get(key) || { count: 0, rSum: 0, gSum: 0, bSum: 0 };
    entry.count++;
    entry.rSum += r;
    entry.gSum += g;
    entry.bSum += b;
    buckets.set(key, entry);
  }

  let best = { count: 0, rSum: 0, gSum: 0, bSum: 0 };
  for (const entry of buckets.values()) {
    if (entry.count > best.count) best = entry;
  }

  const r = Math.round(best.rSum / best.count);
  const g = Math.round(best.gSum / best.count);
  const b = Math.round(best.bSum / best.count);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return {
    hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`,
    r,
    g,
    b,
    isDark: luma < 0.18,
    isLight: luma > 0.84,
  };
}
