import type { ProjectDocument, SubtitleCue } from '@swave/shared';
import {
  detectSpeechSegmentsVad,
  extractProjectAudioPcm16k,
} from './audioExtractor';
import { transcribeOnServer } from './serverOffloadClient';
import {
  alignTranscriptToSpeechSegments,
  chunkSubtitleCues,
} from './subtitleUtils';

export type AutoSubtitleEngineId =
  | 'browser-whisper'
  | 'server-whisper'
  | 'groq'
  | 'openai'
  | 'vad-script';

export interface AutoSubtitleProgress {
  progress: number;
  message: string;
}

export interface AutoSubtitleOptions {
  project: ProjectDocument;
  engine: AutoSubtitleEngineId;
  language: string;
  modelSize?: 'tiny' | 'base';
  maxWordsPerCue?: number;
  targetClipId?: string;
  apiKey?: string;
  fallbackScript?: string;
  onProgress?: (info: AutoSubtitleProgress) => void;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = typeof reader.result === 'string' ? reader.result : '';
      const comma = res.indexOf(',');
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.onerror = () => reject(new Error('Gagal mengonversi audio ke base64.'));
    reader.readAsDataURL(blob);
  });
}

function resolveOrtBaseUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const dir = new URL('.', window.location.href);
    return new URL('./ort/', dir).href;
  } catch {
    return undefined;
  }
}

function runBrowserWhisperWorker(options: {
  audio: Float32Array;
  modelId: string;
  language: string;
  startOffsetSec: number;
  audioDurationSec: number;
  preferCdnWasm?: boolean;
  onProgress?: (info: AutoSubtitleProgress) => void;
}): Promise<SubtitleCue[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./whisperWorker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (
      ev: MessageEvent<
        | { type: 'progress'; progress: number; message: string }
        | { type: 'result'; cues: SubtitleCue[] }
        | { type: 'error'; error: string }
      >
    ) => {
      const msg = ev.data;
      if (msg.type === 'progress') {
        options.onProgress?.({ progress: msg.progress, message: msg.message });
      } else if (msg.type === 'result') {
        worker.terminate();
        resolve(msg.cues);
      } else if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.error));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(err.message || 'Worker AI Whisper gagal dijalankan.'));
    };

    const copy = new Float32Array(options.audio);
    worker.postMessage(
      {
        type: 'transcribe',
        audio: copy,
        modelId: options.modelId,
        language: options.language,
        startOffsetSec: options.startOffsetSec,
        audioDurationSec: options.audioDurationSec,
        ortBaseUrl: resolveOrtBaseUrl(),
        preferCdnWasm: options.preferCdnWasm,
      },
      [copy.buffer]
    );
  });
}

export async function generateAutoSubtitles(
  options: AutoSubtitleOptions
): Promise<{
  cues: SubtitleCue[];
  engineUsed: string;
  warning?: string;
}> {
  const {
    project,
    engine,
    language,
    modelSize = 'tiny',
    maxWordsPerCue = 5,
    targetClipId,
    apiKey,
    fallbackScript,
    onProgress,
  } = options;

  onProgress?.({ progress: 5, message: 'Mengekstrak audio 16kHz dari timeline...' });

  const extracted = await extractProjectAudioPcm16k(project, targetClipId);

  if (engine === 'vad-script') {
    onProgress?.({ progress: 45, message: 'Mendeteksi segmen suara aktif (VAD)...' });
    const segments = detectSpeechSegmentsVad(extracted.pcm, extracted.sampleRate).map(
      (s) => ({
        start: Number((s.start + extracted.startOffsetSec).toFixed(3)),
        end: Number((s.end + extracted.startOffsetSec).toFixed(3)),
      })
    );

    if (fallbackScript && fallbackScript.trim()) {
      const aligned = alignTranscriptToSpeechSegments(
        fallbackScript,
        segments,
        maxWordsPerCue
      );
      onProgress?.({ progress: 100, message: 'Sinkronisasi naskah selesai!' });
      return { cues: aligned, engineUsed: 'vad-script-sync' };
    }

    const placeholders: SubtitleCue[] = segments.map((s, idx) => ({
      start: s.start,
      end: s.end,
      text: `[Teks Segmen ${idx + 1}]`,
    }));
    onProgress?.({ progress: 100, message: 'Deteksi segmen suara selesai!' });
    return {
      cues: placeholders,
      engineUsed: 'vad-segments',
      warning:
        'Terdeteksi segmen bicara otomatis (VAD). Edit teks tiap blok atau jalankan AI Whisper untuk transkripsi otomatis penuh.',
    };
  }

  if (engine === 'browser-whisper') {
    const modelId =
      modelSize === 'base' ? 'Xenova/whisper-base' : 'Xenova/whisper-tiny';
    let rawCues: SubtitleCue[];
    try {
      rawCues = await runBrowserWhisperWorker({
        audio: extracted.pcm,
        modelId,
        language,
        startOffsetSec: extracted.startOffsetSec,
        audioDurationSec: extracted.duration,
        onProgress,
      });
    } catch {
      onProgress?.({
        progress: 12,
        message: 'Mencoba ulang dengan CDN ONNX fallback...',
      });
      rawCues = await runBrowserWhisperWorker({
        audio: extracted.pcm,
        modelId,
        language,
        startOffsetSec: extracted.startOffsetSec,
        audioDurationSec: extracted.duration,
        preferCdnWasm: true,
        onProgress,
      });
    }
    const chunked = chunkSubtitleCues(rawCues, maxWordsPerCue);
    return { cues: chunked, engineUsed: modelId };
  }

  // Server Whisper, Groq, or OpenAI via local PC Server (or direct fallback)
  onProgress?.({
    progress: 35,
    message:
      engine === 'server-whisper'
        ? 'Mengirim audio ke Server PC untuk transkripsi...'
        : `Mengirim audio ke ${engine.toUpperCase()} Whisper...`,
  });

  const audioBase64 = await blobToBase64(extracted.wavBlob);
  const targetClip = targetClipId ? project.clips[targetClipId] : undefined;
  const targetAsset = targetClip ? project.assets[targetClip.assetId] : undefined;

  const provider =
    engine === 'groq'
      ? 'groq'
      : engine === 'openai'
      ? 'openai'
      : 'auto';

  const res = await transcribeOnServer({
    audioBase64,
    assetId: !audioBase64 ? targetAsset?.serverAssetId : undefined,
    language,
    provider,
    apiKey,
    model: modelSize,
  });

  let rawCues = res.cues.map((c) => ({
    ...c,
    start: Number((c.start + extracted.startOffsetSec).toFixed(3)),
    end: Number((c.end + extracted.startOffsetSec).toFixed(3)),
  }));

  // If server fell back to VAD-only segments and user provided a script, align it!
  if (
    res.engine === 'server-vad' &&
    fallbackScript &&
    fallbackScript.trim() &&
    rawCues.every((c) => !c.text)
  ) {
    rawCues = alignTranscriptToSpeechSegments(
      fallbackScript,
      rawCues.map((c) => ({ start: c.start, end: c.end })),
      maxWordsPerCue
    );
  } else {
    rawCues = rawCues.map((c, idx) => ({
      ...c,
      text: c.text || `[Bicara ${idx + 1}]`,
    }));
  }

  onProgress?.({ progress: 100, message: 'Subtitle selesai dibuat!' });
  return {
    cues: chunkSubtitleCues(rawCues, maxWordsPerCue),
    engineUsed: res.engine,
    warning: res.warning,
  };
}

export interface LiveDictationController {
  stop: () => void;
}

export function isWebSpeechSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function startLiveMicDictation(options: {
  language: string;
  getPlayheadSec: () => number;
  onPhrase: (cue: SubtitleCue) => void;
  onInterim?: (text: string) => void;
  onError?: (msg: string) => void;
  onEnd?: () => void;
}): LiveDictationController {
  const w = window as unknown as {
    SpeechRecognition?: new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      start: () => void;
      stop: () => void;
      onresult: ((ev: {
        resultIndex: number;
        results: ArrayLike<{
          isFinal: boolean;
          0: { transcript: string };
        }>;
      }) => void) | null;
      onerror: ((ev: { error: string }) => void) | null;
      onend: (() => void) | null;
    };
    webkitSpeechRecognition?: new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      start: () => void;
      stop: () => void;
      onresult: ((ev: {
        resultIndex: number;
        results: ArrayLike<{
          isFinal: boolean;
          0: { transcript: string };
        }>;
      }) => void) | null;
      onerror: ((ev: { error: string }) => void) | null;
      onend: (() => void) | null;
    };
  };

  const RecCtor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!RecCtor) {
    throw new Error(
      'Browser ini tidak mendukung Live Dikte Suara (Web Speech API). Gunakan AI Whisper atau Chrome/Edge.'
    );
  }

  const recognition = new RecCtor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang =
    options.language === 'auto' || options.language === 'id'
      ? 'id-ID'
      : options.language === 'en'
      ? 'en-US'
      : options.language;

  let phraseStart = options.getPlayheadSec();
  let stopped = false;

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      const text = (res[0]?.transcript || '').trim();
      if (!text) continue;

      if (res.isFinal) {
        const nowSec = Math.max(phraseStart + 0.6, options.getPlayheadSec());
        const estDur = Math.max(1.0, Math.min(4.0, text.split(/\s+/).length * 0.45));
        const endSec =
          nowSec - phraseStart > 0.4 ? nowSec : phraseStart + estDur;
        options.onPhrase({
          start: Number(phraseStart.toFixed(3)),
          end: Number(endSec.toFixed(3)),
          text,
        });
        phraseStart = endSec;
        options.onInterim?.('');
      } else {
        interim += `${text} `;
      }
    }
    if (interim) options.onInterim?.(interim.trim());
  };

  recognition.onerror = (ev) => {
    options.onError?.(`Kesalahan mikrofon: ${ev.error}`);
  };

  recognition.onend = () => {
    if (!stopped) options.onEnd?.();
  };

  recognition.start();

  return {
    stop: () => {
      stopped = true;
      try {
        recognition.stop();
      } catch {
        // Ignore
      }
      options.onEnd?.();
    },
  };
}
