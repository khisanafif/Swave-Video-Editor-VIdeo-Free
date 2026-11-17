import { useRef, useState } from 'react';
import {
  Captions,
  Check,
  Download,
  FileUp,
  Loader2,
  Merge,
  Mic,
  MicOff,
  Scissors,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import type { Clip } from '@velocut/shared';
import {
  generateAutoSubtitles,
  isWebSpeechSupported,
  startLiveMicDictation,
  type AutoSubtitleEngineId,
  type LiveDictationController,
} from '../engine/autoSubtitleEngine';
import { TEXT_PRESETS } from '../engine/capcutPresets';
import { mediaRuntime } from '../engine/mediaRuntime';
import {
  chunkSubtitleCues,
  exportSubtitlesToSrt,
  exportSubtitlesToVtt,
  parseSubtitlesAuto,
  selectExportableSubtitleClips,
} from '../engine/subtitleUtils';
import { usePlaybackStore } from '../stores/playbackStore';
import { useTimelineStore } from '../stores/timelineStore';
import { useUiStore } from '../stores/uiStore';

interface SubtitleStudioTabProps {
  onClipAdded?: () => void;
}

const LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'Deteksi Otomatis' },
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'en', label: 'English (Inggris)' },
  { value: 'ms', label: 'Bahasa Melayu' },
  { value: 'jv', label: 'Basa Jawa' },
  { value: 'ja', label: 'Jepang (日本語)' },
  { value: 'ko', label: 'Korea (한국어)' },
  { value: 'zh', label: 'Mandarin (中文)' },
  { value: 'ar', label: 'Arab (العربية)' },
];

const API_KEY_STORAGE_KEY = 'velocut_stt_api_key';

function formatCueTime(sec: number): string {
  const safe = Math.max(0, sec);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const cs = Math.floor((safe % 1) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(
    2,
    '0'
  )}.${String(cs).padStart(2, '0')}`;
}

export function SubtitleStudioTab({ onClipAdded }: SubtitleStudioTabProps) {
  const srtInputRef = useRef<HTMLInputElement>(null);
  const micControllerRef = useRef<LiveDictationController | null>(null);

  const experienceMode = useUiStore((s) => s.experienceMode);
  const clips = useTimelineStore((s) => s.clips);
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds);
  const currentTime = usePlaybackStore((s) => s.currentTime);

  const [engine, setEngine] = useState<AutoSubtitleEngineId>('browser-whisper');
  const [modelSize, setModelSize] = useState<'tiny' | 'base'>('tiny');
  const [language, setLanguage] = useState('id');
  const [maxWords, setMaxWords] = useState(4);
  const [presetId, setPresetId] = useState('hormozi-karaoke');
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [onlySelectedClip, setOnlySelectedClip] = useState(false);
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      return sessionStorage.getItem(API_KEY_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [scriptText, setScriptText] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isDictating, setIsDictating] = useState(false);
  const [interimText, setInterimText] = useState('');

  const subtitleClips = selectExportableSubtitleClips(Object.values(clips));
  const selectedMediaClip =
    selectedClipIds.length === 1 &&
    clips[selectedClipIds[0]] &&
    clips[selectedClipIds[0]].type !== 'text'
      ? clips[selectedClipIds[0]]
      : undefined;

  const handleSaveApiKey = (val: string) => {
    setApiKey(val);
    try {
      if (val.trim()) {
        sessionStorage.setItem(API_KEY_STORAGE_KEY, val.trim());
      } else {
        sessionStorage.removeItem(API_KEY_STORAGE_KEY);
      }
    } catch {
      // Ignore
    }
  };

  const handleGenerate = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    setIsGenerating(true);
    setProgress(5);

    try {
      const project = useTimelineStore.getState().exportProjectDocument();
      const result = await generateAutoSubtitles({
        project,
        engine,
        language,
        modelSize,
        maxWordsPerCue: maxWords,
        targetClipId:
          onlySelectedClip && selectedMediaClip ? selectedMediaClip.id : undefined,
        apiKey: apiKey.trim() || undefined,
        fallbackScript: scriptText,
        onProgress: (info) => {
          setProgress(info.progress);
          setStatusMsg(info.message);
        },
      });

      if (result.cues.length === 0) {
        setErrorMsg(
          'Tidak ditemukan ucapan yang jelas pada audio. Coba periksa volume klip atau gunakan mode Naskah + VAD.'
        );
        return;
      }

      const ids = useTimelineStore
        .getState()
        .addSubtitleCues(result.cues, presetId, { replaceExisting });
      if (ids.length > 0) {
        const first = useTimelineStore.getState().clips[ids[0]];
        if (first) {
          usePlaybackStore.getState().seekTo(first.start);
          mediaRuntime.renderFrameAt(first.start, false);
        }
      }
      setStatusMsg(
        result.warning ||
          `Berhasil membuat ${ids.length} blok subtitle (${result.engineUsed})!`
      );
      onClipAdded?.();
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleToggleMicDictation = () => {
    if (isDictating) {
      micControllerRef.current?.stop();
      micControllerRef.current = null;
      setIsDictating(false);
      setInterimText('');
      return;
    }

    setErrorMsg(null);
    try {
      const ctrl = startLiveMicDictation({
        language,
        getPlayheadSec: () => usePlaybackStore.getState().currentTime,
        onPhrase: (cue) => {
          const chunked = chunkSubtitleCues([cue], maxWords);
          useTimelineStore
            .getState()
            .addSubtitleCues(chunked, presetId, { replaceExisting: false });
          mediaRuntime.renderFrameAt(
            usePlaybackStore.getState().currentTime,
            usePlaybackStore.getState().isPlaying
          );
        },
        onInterim: setInterimText,
        onError: (msg) => {
          setErrorMsg(msg);
          setIsDictating(false);
        },
        onEnd: () => {
          setIsDictating(false);
          setInterimText('');
        },
      });
      micControllerRef.current = ctrl;
      setIsDictating(true);
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleImportSubtitleFile = async (
    files: FileList | null
  ): Promise<void> => {
    if (!files || files.length === 0) return;
    setErrorMsg(null);
    try {
      const file = files[0];
      const text = await file.text();
      const parsed = parseSubtitlesAuto(text, file.name);
      if (parsed.length === 0) {
        setErrorMsg('File SRT/VTT tidak berisi cue subtitle yang valid.');
        return;
      }
      const chunked = chunkSubtitleCues(parsed, maxWords);
      const ids = useTimelineStore
        .getState()
        .addSubtitleCues(chunked, presetId, { replaceExisting });
      if (ids.length > 0) {
        const first = useTimelineStore.getState().clips[ids[0]];
        if (first) {
          usePlaybackStore.getState().seekTo(first.start);
          mediaRuntime.renderFrameAt(first.start, false);
        }
      }
      setStatusMsg(`Berhasil mengimpor ${ids.length} subtitle dari ${file.name}.`);
      onClipAdded?.();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleDownloadSubtitleFile = (format: 'srt' | 'vtt') => {
    const allClips = Object.values(useTimelineStore.getState().clips);
    const content =
      format === 'srt'
        ? exportSubtitlesToSrt(allClips)
        : exportSubtitlesToVtt(allClips);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `velocut-subtitles.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const applyBatchPreset = (targetPresetId: string) => {
    setPresetId(targetPresetId);
    const preset =
      TEXT_PRESETS.find((p) => p.id === targetPresetId) || TEXT_PRESETS[0];
    useTimelineStore.getState().applySubtitleStyleToAll(
      preset.style,
      { y: preset.defaultY },
      { in: preset.defaultAnimation, inDuration: 0.2 }
    );
    mediaRuntime.renderFrameAt(usePlaybackStore.getState().currentTime, false);
    setStatusMsg(`Gaya "${preset.label}" diterapkan ke semua subtitle.`);
  };

  return (
    <div className="flex-1 space-y-3.5 overflow-y-auto p-3">
      {/* Header Banner */}
      <div className="rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-950/40 to-cyan-950/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Captions className="h-4 w-4 text-violet-300" />
            <h3 className="text-xs font-bold text-white">
              Subtitle Otomatis (AI Speech-to-Text)
            </h3>
          </div>
          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
            GRATIS
          </span>
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-zinc-300">
          {experienceMode === 'beginner'
            ? 'Ubah suara video menjadi subtitle otomatis dalam 1 klik. Tinggal pilih gaya & langsung tampil rapi!'
            : 'Ekstrak audio 16kHz, transkripsi AI Whisper (Browser/Server/API), edit per-cue, hingga ekspor .SRT/.VTT & burn-in ASS.'}
        </p>
      </div>

      {/* Auto-Generate Controls */}
      <div className="space-y-2.5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-zinc-400">
            Mesin Transkripsi
          </label>
          <select
            aria-label="Mesin Transkripsi Subtitle"
            value={engine}
            onChange={(e) => setEngine(e.target.value as AutoSubtitleEngineId)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-violet-400"
          >
            <option value="browser-whisper">
              AI Whisper di Browser (100% Gratis, Tanpa Server)
            </option>
            <option value="server-whisper">
              Server PC Lokal (Whisper / VAD Gratis)
            </option>
            <option value="vad-script">
              Sinkronisasi Naskah + Deteksi Suara (100% Offline)
            </option>
            <option value="groq">
              Opsional: Groq Whisper API (Pakai Key Sendiri)
            </option>
            <option value="openai">
              Opsional: OpenAI Whisper API (Pakai Key Sendiri)
            </option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-zinc-400">
              Bahasa Audio
            </label>
            <select
              aria-label="Bahasa Audio"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-100 outline-none focus:border-violet-400"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-zinc-400">
              Panjang Kalimat
            </label>
            <select
              aria-label="Panjang Kata Per Subtitle"
              value={maxWords}
              onChange={(e) => setMaxWords(Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-100 outline-none focus:border-violet-400"
            >
              <option value={3}>Pendek Viral (3 kata)</option>
              <option value={5}>Standar CapCut (5 kata)</option>
              <option value={10}>Kalimat Panjang (10 kata)</option>
            </select>
          </div>
        </div>

        {engine === 'browser-whisper' && experienceMode === 'pro' && (
          <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/70 px-2.5 py-1.5 text-[11px]">
            <span className="text-zinc-400">Ukuran Model Whisper:</span>
            <div className="flex gap-1">
              {(['tiny', 'base'] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setModelSize(sz)}
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                    modelSize === sz
                      ? 'bg-violet-500 text-zinc-950'
                      : 'bg-zinc-800 text-zinc-300'
                  }`}
                >
                  {sz === 'tiny' ? 'Tiny (~40MB)' : 'Base (~75MB)'}
                </button>
              ))}
            </div>
          </div>
        )}

        {(engine === 'groq' || engine === 'openai') && (
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-zinc-400">
              API Key {engine === 'groq' ? 'Groq' : 'OpenAI'} (disimpan di sesi browser)
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => handleSaveApiKey(e.target.value)}
              placeholder={
                engine === 'groq' ? 'gsk_...' : 'sk-...'
              }
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 font-mono text-[11px] text-zinc-100 outline-none focus:border-cyan-400"
            />
          </div>
        )}

        {engine === 'vad-script' && (
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-zinc-400">
              Tempel Naskah / Lirik (Otomatis disinkronkan ke suara aktif)
            </label>
            <textarea
              rows={3}
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              placeholder="Tempel kalimat naskah di sini, atau biarkan kosong untuk mendeteksi titik suara otomatis..."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-xs text-zinc-100 outline-none focus:border-violet-400"
            />
          </div>
        )}

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-zinc-400">
            Gaya Tampilan Subtitle
          </label>
          <select
            aria-label="Gaya Tampilan Subtitle"
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-violet-400"
          >
            {TEXT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
              className="accent-violet-400"
            />
            <span>Ganti subtitle lama</span>
          </label>

          {selectedMediaClip && (
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={onlySelectedClip}
                onChange={(e) => setOnlySelectedClip(e.target.checked)}
                className="accent-cyan-400"
              />
              <span className="truncate max-w-[120px]">
                Hanya klip: {selectedMediaClip.name}
              </span>
            </label>
          )}
        </div>

        <button
          type="button"
          disabled={isGenerating}
          onClick={() => void handleGenerate()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-cyan-500 py-2 text-xs font-bold text-zinc-950 shadow-md transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Memproses ({progress}%)...</span>
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4" />
              <span>Generate Subtitle Otomatis</span>
            </>
          )}
        </button>

        {/* Live Microphone Dictation */}
        {isWebSpeechSupported() && (
          <button
            type="button"
            onClick={handleToggleMicDictation}
            className={`flex w-full items-center justify-center gap-1.5 rounded-lg border py-1.5 text-[11px] font-semibold transition ${
              isDictating
                ? 'border-rose-400 bg-rose-500/20 text-rose-200 animate-pulse'
                : 'border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-cyan-400 hover:text-cyan-200'
            }`}
          >
            {isDictating ? (
              <>
                <MicOff className="h-3.5 w-3.5" />
                <span>Stop Dikte Suara (Mikrofon Aktif)</span>
              </>
            ) : (
              <>
                <Mic className="h-3.5 w-3.5 text-cyan-400" />
                <span>Dikte Subtitle Langsung via Mikrofon</span>
              </>
            )}
          </button>
        )}

        {interimText && (
          <div className="rounded border border-cyan-500/30 bg-cyan-950/30 px-2.5 py-1.5 text-[11px] italic text-cyan-200">
            Mendengar: &ldquo;{interimText}&rdquo;
          </div>
        )}

        {isGenerating && (
          <div className="space-y-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full bg-gradient-to-r from-violet-400 to-cyan-400 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {statusMsg && (
          <div className="flex items-start gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-2.5 py-1.5 text-[11px] text-emerald-200">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span>{statusMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-2.5 py-1.5 text-[11px] text-rose-200">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Import / Export SRT & VTT */}
      <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
            File Subtitle (.SRT / .VTT)
          </span>
          <span className="font-mono text-[10px] text-zinc-500">
            {subtitleClips.length} cue
          </span>
        </div>
        <input
          ref={srtInputRef}
          type="file"
          accept=".srt,.vtt,text/plain"
          className="hidden"
          onChange={(e) => {
            void handleImportSubtitleFile(e.target.files);
            e.target.value = '';
          }}
        />
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => srtInputRef.current?.click()}
            className="inline-flex items-center justify-center gap-1 rounded border border-zinc-700 bg-zinc-950 py-1.5 text-[10px] font-semibold text-zinc-200 hover:border-cyan-400"
          >
            <FileUp className="h-3 w-3 text-cyan-400" />
            <span>Impor</span>
          </button>
          <button
            type="button"
            disabled={subtitleClips.length === 0}
            onClick={() => handleDownloadSubtitleFile('srt')}
            className="inline-flex items-center justify-center gap-1 rounded border border-zinc-700 bg-zinc-950 py-1.5 text-[10px] font-semibold text-zinc-200 hover:border-emerald-400 disabled:opacity-40"
          >
            <Download className="h-3 w-3 text-emerald-400" />
            <span>.SRT</span>
          </button>
          <button
            type="button"
            disabled={subtitleClips.length === 0}
            onClick={() => handleDownloadSubtitleFile('vtt')}
            className="inline-flex items-center justify-center gap-1 rounded border border-zinc-700 bg-zinc-950 py-1.5 text-[10px] font-semibold text-zinc-200 hover:border-emerald-400 disabled:opacity-40"
          >
            <Download className="h-3 w-3 text-violet-400" />
            <span>.VTT</span>
          </button>
        </div>
      </div>

      {/* 1-Click Batch Style Switcher when subtitles exist */}
      {subtitleClips.length > 0 && (
        <div className="space-y-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-300">
            <Sparkles className="h-3 w-3 text-yellow-400" />
            <span>Ubah Gaya Semua Subtitle (1-Klik)</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TEXT_PRESETS.slice(0, 4).map((tp) => (
              <button
                key={tp.id}
                type="button"
                onClick={() => applyBatchPreset(tp.id)}
                className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition ${
                  presetId === tp.id
                    ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                    : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600'
                }`}
              >
                {tp.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chronological Cue List Editor */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-zinc-300 uppercase">
            Editor Teks Subtitle ({subtitleClips.length})
          </span>
        </div>

        {subtitleClips.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-800 py-5 text-center text-[11px] text-zinc-500">
            Belum ada subtitle. Klik <strong>Generate Subtitle Otomatis</strong> atau impor file <code>.srt</code>.
          </p>
        ) : (
          <div className="space-y-1.5">
            {subtitleClips.map((clip: Clip, idx: number) => {
              const isActive =
                currentTime >= clip.start &&
                currentTime < clip.start + clip.duration;
              return (
                <div
                  key={clip.id}
                  onClick={() => {
                    useTimelineStore.getState().selectClip(clip.id, false);
                    usePlaybackStore.getState().seekTo(clip.start + 0.02);
                    mediaRuntime.renderFrameAt(clip.start + 0.02, false);
                  }}
                  className={`cursor-pointer rounded-lg border p-2 transition ${
                    isActive
                      ? 'border-cyan-400 bg-cyan-950/25'
                      : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-1 text-[10px]">
                    <span className="font-mono text-cyan-300">
                      #{idx + 1} · {formatCueTime(clip.start)} →{' '}
                      {formatCueTime(clip.start + clip.duration)}
                    </span>
                    <div
                      className="flex items-center gap-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          useTimelineStore.getState().updateSubtitleCue(clip.id, {
                            start: Math.max(0, clip.start - 0.2),
                          });
                          mediaRuntime.renderFrameAt(
                            usePlaybackStore.getState().currentTime,
                            false
                          );
                        }}
                        title="Majukan waktu mulai -0.2 detik"
                        className="rounded px-1 py-0.5 font-mono text-[9px] text-zinc-400 hover:bg-zinc-800 hover:text-cyan-300"
                      >
                        -0.2s
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          useTimelineStore.getState().updateSubtitleCue(clip.id, {
                            start: clip.start + 0.2,
                          });
                          mediaRuntime.renderFrameAt(
                            usePlaybackStore.getState().currentTime,
                            false
                          );
                        }}
                        title="Mundurkan waktu mulai +0.2 detik"
                        className="rounded px-1 py-0.5 font-mono text-[9px] text-zinc-400 hover:bg-zinc-800 hover:text-cyan-300"
                      >
                        +0.2s
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          useTimelineStore.getState().splitSubtitleCue(clip.id)
                        }
                        title="Pecah cue jadi 2"
                        className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-cyan-300"
                      >
                        <Scissors className="h-3 w-3" />
                      </button>
                      {idx < subtitleClips.length - 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            useTimelineStore
                              .getState()
                              .mergeSubtitleWithNext(clip.id)
                          }
                          title="Gabung dengan subtitle berikutnya"
                          className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-emerald-300"
                        >
                          <Merge className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          useTimelineStore.getState().deleteClips([clip.id])
                        }
                        title="Hapus cue"
                        className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-rose-400"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={clip.textStyle?.content || ''}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      useTimelineStore
                        .getState()
                        .updateSubtitleCue(clip.id, { text: e.target.value });
                      mediaRuntime.renderFrameAt(
                        usePlaybackStore.getState().currentTime,
                        false
                      );
                    }}
                    className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs font-medium text-white outline-none focus:border-violet-400"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
