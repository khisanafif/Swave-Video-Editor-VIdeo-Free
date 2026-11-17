import {
  env,
  pipeline,
  RawImage,
  type BackgroundRemovalPipeline,
  type ProgressInfo,
} from '@huggingface/transformers';
import { configureOnnxWasmRuntime } from './ortRuntime';

env.allowLocalModels = false;
env.useBrowserCache = typeof caches !== 'undefined';

interface WorkerCutoutMessage {
  type: 'cutout';
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  modelId?: string;
  ortBaseUrl?: string;
  preferCdnWasm?: boolean;
}

const DEFAULT_CUTOUT_MODEL = 'Xenova/modnet';
const pipelineCache = new Map<string, BackgroundRemovalPipeline>();

async function getSegmenter(
  modelId: string,
  ortBaseUrl: string | undefined,
  preferCdnWasm: boolean | undefined,
  onProgress: (pct: number, message: string) => void
): Promise<BackgroundRemovalPipeline> {
  const cacheKey = `${modelId}::${preferCdnWasm ? 'cdn' : 'local'}`;
  const cached = pipelineCache.get(cacheKey);
  if (cached) return cached;

  configureOnnxWasmRuntime({ ortBaseUrl, preferCdnWasm });

  const progress_callback = (info: ProgressInfo) => {
    if (info.status === 'progress' && typeof info.progress === 'number') {
      const pct = Math.max(8, Math.min(88, Math.round(info.progress)));
      const fileLabel = 'file' in info && info.file ? ` (${info.file})` : '';
      onProgress(pct, `Mengunduh model AI Potong Latar${fileLabel}...`);
    } else if (info.status === 'ready') {
      onProgress(90, 'Model AI siap. Memisahkan subjek dari latar...');
    }
  };

  const segmenter = await pipeline('background-removal', modelId, {
    device: 'wasm',
    dtype: 'q8',
    progress_callback,
  });
  pipelineCache.set(cacheKey, segmenter);
  return segmenter;
}

self.onmessage = async (event: MessageEvent<WorkerCutoutMessage>) => {
  const msg = event.data;
  if (!msg || msg.type !== 'cutout') return;

  const postProgress = (progress: number, message: string) => {
    self.postMessage({ type: 'progress', progress, message });
  };

  try {
    postProgress(5, 'Menyiapkan AI Potongan Otomatis (MODNet)...');
    const segmenter = await getSegmenter(
      msg.modelId || DEFAULT_CUTOUT_MODEL,
      msg.ortBaseUrl,
      msg.preferCdnWasm,
      postProgress
    );

    postProgress(92, 'Menghapus latar belakang secara otomatis...');
    const inputImage = new RawImage(msg.rgba, msg.width, msg.height, 4);
    const output = (await segmenter(inputImage)) as RawImage;

    const rgba =
      output.channels === 4
        ? new Uint8ClampedArray(output.data)
        : new Uint8ClampedArray(output.width * output.height * 4);

    if (output.channels !== 4) {
      const pixelCount = output.width * output.height;
      for (let i = 0; i < pixelCount; i++) {
        rgba[i * 4] = output.data[i * output.channels] ?? 0;
        rgba[i * 4 + 1] = output.data[i * output.channels + 1] ?? 0;
        rgba[i * 4 + 2] = output.data[i * output.channels + 2] ?? 0;
        rgba[i * 4 + 3] = 255;
      }
    }

    postProgress(100, 'Potongan latar belakang selesai!');
    const postTransfer = self as unknown as {
      postMessage(message: unknown, transfer?: Transferable[]): void;
    };
    postTransfer.postMessage(
      {
        type: 'result',
        rgba,
        width: output.width,
        height: output.height,
      },
      [rgba.buffer]
    );
  } catch (err) {
    const rawMsg = (err as Error)?.message || String(err || '');
    const friendly =
      /fetch|network|offline|ENOTFOUND|Failed to/i.test(rawMsg)
        ? 'Gagal mengunduh model AI Potong Latar untuk pemakaian pertama. Periksa koneksi internet Anda, atau gunakan mode Hapus Instan (Hitam/Putih/Chroma) yang 100% offline.'
        : rawMsg || 'Gagal memproses AI Potongan Otomatis.';
    self.postMessage({ type: 'error', error: friendly });
  }
};
