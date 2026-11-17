import {
  env,
  pipeline,
  type AutomaticSpeechRecognitionOutput,
  type AutomaticSpeechRecognitionPipeline,
  type ProgressInfo,
} from '@huggingface/transformers';
import type { SubtitleCue } from '@velocut/shared';

env.allowLocalModels = false;
env.useBrowserCache = true;

interface WorkerTranscribeMessage {
  type: 'transcribe';
  audio: Float32Array;
  modelId: string;
  language?: string;
  startOffsetSec?: number;
  audioDurationSec?: number;
}

const pipelineCache = new Map<string, AutomaticSpeechRecognitionPipeline>();

async function getTranscriber(
  modelId: string,
  onProgress: (pct: number, statusText: string) => void
): Promise<AutomaticSpeechRecognitionPipeline> {
  const cached = pipelineCache.get(modelId);
  if (cached) return cached;

  const progress_callback = (info: ProgressInfo) => {
    if (info.status === 'progress' && typeof info.progress === 'number') {
      const pct = Math.max(2, Math.min(95, Math.round(info.progress)));
      const fileLabel = 'file' in info && info.file ? ` (${info.file})` : '';
      onProgress(pct, `Mengunduh model AI Whisper${fileLabel}...`);
    } else if (info.status === 'ready') {
      onProgress(96, 'Model AI siap. Memproses audio...');
    }
  };

  let device: 'webgpu' | 'wasm' = 'wasm';
  if (
    typeof navigator !== 'undefined' &&
    'gpu' in navigator &&
    typeof (navigator as unknown as { gpu?: { requestAdapter?: () => Promise<unknown> } })
      .gpu?.requestAdapter === 'function'
  ) {
    try {
      const adapter = await (
        navigator as unknown as { gpu: { requestAdapter: () => Promise<unknown> } }
      ).gpu.requestAdapter();
      if (adapter) device = 'webgpu';
    } catch {
      device = 'wasm';
    }
  }

  let pipe: AutomaticSpeechRecognitionPipeline;
  try {
    pipe = await pipeline('automatic-speech-recognition', modelId, {
      device,
      dtype: device === 'webgpu' ? 'fp32' : 'q8',
      progress_callback,
    });
  } catch {
    pipe = await pipeline('automatic-speech-recognition', modelId, {
      device: 'wasm',
      dtype: 'q8',
      progress_callback,
    });
  }

  pipelineCache.set(modelId, pipe);
  return pipe;
}

function chunksToCues(
  output: AutomaticSpeechRecognitionOutput,
  offsetSec: number,
  maxDurationSec?: number
): SubtitleCue[] {
  const maxEnd =
    maxDurationSec && maxDurationSec > 0
      ? offsetSec + maxDurationSec
      : Number.POSITIVE_INFINITY;
  const chunks = output.chunks || [];
  if (chunks.length === 0) {
    const clean = (output.text || '').trim();
    return clean
      ? [
          {
            start: offsetSec,
            end: Math.min(maxEnd, offsetSec + 3),
            text: clean,
          },
        ]
      : [];
  }

  const cues: SubtitleCue[] = [];
  for (const ch of chunks) {
    const text = (ch.text || '').trim();
    if (!text) continue;
    const rawStart = Array.isArray(ch.timestamp) ? ch.timestamp[0] : 0;
    const rawEnd = Array.isArray(ch.timestamp) ? ch.timestamp[1] : null;
    const start = Math.max(0, (typeof rawStart === 'number' ? rawStart : 0) + offsetSec);
    const computedEnd =
      typeof rawEnd === 'number' && rawEnd > (typeof rawStart === 'number' ? rawStart : 0)
        ? rawEnd + offsetSec
        : start + Math.max(0.8, text.split(/\s+/).length * 0.42);
    const end = Math.max(start + 0.25, Math.min(maxEnd, computedEnd));
    cues.push({
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      text,
    });
  }
  return cues;
}

self.onmessage = async (event: MessageEvent<WorkerTranscribeMessage>) => {
  const msg = event.data;
  if (!msg || msg.type !== 'transcribe') return;

  const postProgress = (progress: number, message: string) => {
    self.postMessage({ type: 'progress', progress, message });
  };

  try {
    postProgress(5, 'Menyiapkan mesin AI Whisper di browser...');
    const transcriber = await getTranscriber(msg.modelId, postProgress);
    postProgress(65, 'Mentranskripsi suara menjadi subtitle...');

    const langOpt =
      msg.language && msg.language !== 'auto' ? msg.language : undefined;

    const baseOpts = {
      chunk_length_s: 30,
      stride_length_s: 5,
      task: 'transcribe' as const,
      ...(langOpt ? { language: langOpt } : {}),
    };

    let result: AutomaticSpeechRecognitionOutput;
    try {
      result = (await transcriber(msg.audio, {
        ...baseOpts,
        return_timestamps: true,
      })) as AutomaticSpeechRecognitionOutput;
    } catch {
      result = (await transcriber(msg.audio, {
        ...baseOpts,
        return_timestamps: false,
      })) as AutomaticSpeechRecognitionOutput;
    }

    const cues = chunksToCues(
      result,
      msg.startOffsetSec || 0,
      msg.audioDurationSec
    );
    postProgress(100, 'Transkripsi selesai!');
    self.postMessage({ type: 'result', cues, rawText: result.text || '' });
  } catch (err) {
    const rawMsg = (err as Error).message || '';
    const friendly =
      /fetch|network|offline|ENOTFOUND|Failed to/i.test(rawMsg)
        ? 'Gagal mengunduh model AI Whisper untuk pemakaian pertama. Periksa internet Anda, atau gunakan mode "Sinkronisasi Naskah + Deteksi Suara" / "Dikte Mikrofon" yang 100% offline.'
        : rawMsg || 'Gagal menjalankan Whisper di browser.';
    self.postMessage({
      type: 'error',
      error: friendly,
    });
  }
};
