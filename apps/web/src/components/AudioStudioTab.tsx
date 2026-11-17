import { useEffect, useRef, useState } from 'react';
import {
  Download,
  FileAudio,
  Mic,
  Music,
  Plus,
  Square,
  Upload,
  Volume2,
} from 'lucide-react';
import { extractAudioFromMediaAsset } from '../engine/audioExtractor';
import {
  SFX_PRESETS,
  type SfxPresetId,
  synthesizeAudioAsset,
} from '../engine/editorPresets';
import { saveBlobToDevice } from '../engine/localPersistence';
import { probeAndRegisterMediaFile } from '../engine/mediaProbe';
import { mediaRegistry } from '../engine/opfsStorage';
import { usePlaybackStore } from '../stores/playbackStore';
import { useTimelineStore } from '../stores/timelineStore';
import { formatBytes } from '../utils/format';

interface AudioStudioTabProps {
  onImportAudioFiles: (files: FileList | null) => Promise<void>;
  onSyncAsset?: (assetId: string) => void;
  onClipAdded?: () => void;
}

function formatRecDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function AudioStudioTab({
  onImportAudioFiles,
  onSyncAsset,
  onClipAdded,
}: AudioStudioTabProps) {
  const audioUploadRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const assets = useTimelineStore((s) => s.assets);
  const clips = useTimelineStore((s) => s.clips);
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds);

  const videoAssets = Object.values(assets).filter((a) => a.kind === 'video');
  const audioAssets = Object.values(assets).filter((a) => a.kind === 'audio');

  const selectedVideoClip =
    selectedClipIds
      .map((id) => clips[id])
      .find((c) => c && c.type === 'video') ||
    Object.values(clips).find((c) => c.type === 'video');

  const [selectedExtractAssetId, setSelectedExtractAssetId] = useState<string>('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [busySfxId, setBusySfxId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const effectiveVideoAssetId =
    (selectedExtractAssetId && assets[selectedExtractAssetId]?.kind === 'video'
      ? selectedExtractAssetId
      : selectedVideoClip?.assetId) ||
    videoAssets[0]?.id ||
    '';

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch {
          // Ignore unmount stop errors
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const showTempStatus = (msg: string) => {
    setErrorMessage(null);
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleAudioUploadChange = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploadingAudio(true);
    setErrorMessage(null);
    try {
      await onImportAudioFiles(files);
      showTempStatus(`${files.length} file audio berhasil ditambahkan ke Track Audio!`);
    } catch (err) {
      setErrorMessage((err as Error).message || 'Gagal mengimpor file audio.');
    } finally {
      setIsUploadingAudio(false);
    }
  };

  const handleExtractAudio = async (mode: 'track' | 'download') => {
    const asset = assets[effectiveVideoAssetId];
    if (!asset) {
      setErrorMessage('Pilih atau impor video terlebih dahulu untuk mengekstrak audio.');
      return;
    }

    setIsExtracting(true);
    setErrorMessage(null);

    const matchingClip =
      selectedVideoClip?.assetId === asset.id
        ? selectedVideoClip
        : Object.values(clips).find((c) => c.type === 'video' && c.assetId === asset.id);

    try {
      const { wavBlob, filename } = await extractAudioFromMediaAsset(asset, {
        clip: matchingClip,
      });
      const wavAsset = await probeAndRegisterMediaFile(wavBlob, filename, 'audio/wav');
      const store = useTimelineStore.getState();

      if (mode === 'download') {
        store.registerAsset(wavAsset);
        await saveBlobToDevice(wavBlob, filename);
        showTempStatus(`File audio ${filename} diekstrak & mulai diunduh!`);
      } else {
        const audioClipId = store.linkExtractedAudioAsset(
          matchingClip?.id || null,
          wavAsset,
          usePlaybackStore.getState().currentTime
        );
        if (audioClipId) {
          onSyncAsset?.(wavAsset.id);
          onClipAdded?.();
          showTempStatus(
            `Audio "${filename}" berhasil diekstrak ke Track Audio${
              matchingClip ? ' (suara video asli dimute)' : ''
            }!`
          );
        }
      }
    } catch (err) {
      if (mode === 'track' && matchingClip) {
        const fallbackId = useTimelineStore
          .getState()
          .detachAudioFromClip(matchingClip.id);
        if (fallbackId) {
          onClipAdded?.();
          showTempStatus(
            'Audio dipisah langsung ke Track Audio sebagai klip independen (codec video diproses stream langsung).'
          );
          return;
        }
      }
      setErrorMessage((err as Error).message || 'Gagal mengekstrak audio dari video.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleToggleVoiceover = async () => {
    if (isRecording && recorderRef.current) {
      recorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErrorMessage(
        'Rekam mikrofon tidak tersedia di browser ini (butuh HTTPS / localhost / izin mikrofon).'
      );
      return;
    }

    try {
      setErrorMessage(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (chunksRef.current.length === 0) return;

        const outType = recorder.mimeType || 'audio/webm';
        const ext = outType.includes('mp4') ? 'm4a' : 'webm';
        const blob = new Blob(chunksRef.current, { type: outType });
        const filename = `voiceover-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.${ext}`;

        const asset = await probeAndRegisterMediaFile(blob, filename, outType);
        const store = useTimelineStore.getState();
        store.registerAsset(asset);
        store.addClipFromAsset(
          asset.id,
          undefined,
          usePlaybackStore.getState().currentTime
        );
        onSyncAsset?.(asset.id);
        onClipAdded?.();
        showTempStatus(`Rekaman suara "${filename}" ditambahkan ke Track Audio!`);
      };

      recorder.start(250);
      setRecordSeconds(0);
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setErrorMessage('Izin mikrofon ditolak atau perangkat audio tidak ditemukan.');
    }
  };

  const handleAddBuiltInSfx = async (presetId: SfxPresetId) => {
    setBusySfxId(presetId);
    try {
      const audioAsset = await synthesizeAudioAsset(presetId);
      const store = useTimelineStore.getState();
      store.registerAsset(audioAsset);
      store.addClipFromAsset(
        audioAsset.id,
        undefined,
        usePlaybackStore.getState().currentTime
      );
      onSyncAsset?.(audioAsset.id);
      onClipAdded?.();
      showTempStatus(`Efek suara ${audioAsset.name} ditambahkan ke Track Audio.`);
    } finally {
      setBusySfxId(null);
    }
  };

  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-3">
      {/* 1. Dedicated Audio Upload */}
      <input
        ref={audioUploadRef}
        type="file"
        multiple
        accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac,.flac,.opus"
        className="hidden"
        onChange={(e) => {
          void handleAudioUploadChange(e.target.files);
          e.target.value = '';
        }}
      />
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleAudioUploadChange(e.dataTransfer.files);
        }}
        onClick={() => audioUploadRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            audioUploadRef.current?.click();
          }
        }}
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-emerald-500/50 bg-emerald-950/20 px-3 py-3 text-center transition hover:border-emerald-400 hover:bg-emerald-950/35"
      >
        <Upload className="mb-1 h-5 w-5 text-emerald-400" />
        <p className="text-xs font-bold text-emerald-100">
          {isUploadingAudio
            ? 'Mengimpor Audio...'
            : 'Upload Musik & Audio (MP3, WAV, M4A, OGG)'}
        </p>
        <p className="mt-0.5 text-[10px] text-emerald-300/75">
          Pilih atau seret file audio musik latar / dubbing langsung ke Track Audio
        </p>
      </div>

      {/* 2. Extract Audio from Video */}
      <div className="space-y-2 rounded-xl border border-cyan-500/35 bg-cyan-950/15 p-2.5 text-[11px]">
        <div className="flex items-center gap-1.5 font-semibold text-cyan-200">
          <FileAudio className="h-3.5 w-3.5 text-cyan-400" />
          <span>Ekstrak Audio dari Video (.WAV)</span>
        </div>

        {videoAssets.length === 0 ? (
          <p className="text-[10px] text-zinc-400">
            Impor file video terlebih dahulu di tab Media untuk mengekstrak suara menjadi track atau file `.wav`.
          </p>
        ) : (
          <>
            <select
              aria-label="Pilih video sumber untuk ekstrak audio"
              value={effectiveVideoAssetId}
              onChange={(e) => setSelectedExtractAssetId(e.target.value)}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-100"
            >
              {videoAssets.map((va) => (
                <option key={va.id} value={va.id}>
                  {va.name} ({va.duration.toFixed(1)}s)
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                disabled={isExtracting || !effectiveVideoAssetId}
                onClick={() => void handleExtractAudio('track')}
                className="inline-flex items-center justify-center gap-1 rounded-lg bg-cyan-500 px-2 py-1.5 text-[10px] font-bold text-zinc-950 hover:bg-cyan-400 disabled:opacity-50"
              >
                <Volume2 className="h-3.5 w-3.5" />
                <span>{isExtracting ? 'Memproses...' : 'Ekstrak ke Track'}</span>
              </button>
              <button
                type="button"
                disabled={isExtracting || !effectiveVideoAssetId}
                onClick={() => void handleExtractAudio('download')}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-2 py-1.5 text-[10px] font-bold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Unduh Audio .WAV</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* 3. Voiceover Microphone Recorder */}
      <div className="space-y-2 rounded-xl border border-rose-500/30 bg-rose-950/15 p-2.5 text-[11px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-semibold text-rose-200">
            <Mic className="h-3.5 w-3.5 text-rose-400" />
            <span>Rekam Voiceover / Sulih Suara</span>
          </div>
          {isRecording && (
            <span className="animate-pulse rounded bg-rose-500/30 px-1.5 py-0.5 font-mono text-[10px] font-bold text-rose-200">
              REC {formatRecDuration(recordSeconds)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void handleToggleVoiceover()}
          className={`flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-bold transition ${
            isRecording
              ? 'bg-rose-500 text-white hover:bg-rose-400'
              : 'border border-rose-400/40 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30'
          }`}
        >
          {isRecording ? (
            <>
              <Square className="h-3 w-3 fill-current" />
              <span>Stop & Masukkan ke Timeline</span>
            </>
          ) : (
            <>
              <Mic className="h-3.5 w-3.5" />
              <span>Mulai Rekam Mikrofon</span>
            </>
          )}
        </button>
      </div>

      {statusMessage && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-2.5 py-1.5 text-[11px] text-emerald-200">
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-2.5 py-1.5 text-[11px] text-rose-200">
          {errorMessage}
        </div>
      )}

      {/* 4. Project Audio Files List */}
      {audioAssets.length > 0 && (
        <div className="space-y-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-2.5">
          <p className="text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
            Koleksi Audio Proyek ({audioAssets.length})
          </p>
          {audioAssets.map((aud) => (
            <div
              key={aud.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/70 px-2 py-1.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Music className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-medium text-zinc-100">
                    {aud.name}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {aud.duration.toFixed(1)}s · {formatBytes(aud.size)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {mediaRegistry.getBlob(aud.id) && (
                  <button
                    type="button"
                    onClick={() => {
                      const b = mediaRegistry.getBlob(aud.id);
                      if (b) void saveBlobToDevice(b, aud.name);
                    }}
                    className="rounded border border-zinc-700 p-1 text-zinc-300 hover:border-cyan-400 hover:text-cyan-300"
                    title="Unduh file audio"
                  >
                    <Download className="h-3 w-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    useTimelineStore
                      .getState()
                      .addClipFromAsset(
                        aud.id,
                        undefined,
                        usePlaybackStore.getState().currentTime
                      );
                    onClipAdded?.();
                  }}
                  className="inline-flex items-center gap-0.5 rounded bg-emerald-500/20 px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500 hover:text-zinc-950"
                >
                  <Plus className="h-3 w-3" />
                  <span>Track</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 5. Auto-Duck & Built-In Royalty-Free SFX / BGM */}
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-2.5 text-[11px] text-emerald-200">
        <p className="font-semibold">Sound Effects & Musik BGM Gratis</p>
        <p className="mt-0.5 text-[10px] text-emerald-300/80">
          Bebas hak cipta (synthesized). Klik untuk langsung masuk ke Track Audio.
        </p>
        <button
          type="button"
          onClick={() => {
            const count = useTimelineStore.getState().autoDuckAudioTracks(0.22);
            showTempStatus(
              count > 0
                ? `Volume ${count} musik latar diturunkan otomatis ke 22% agar suara utama jelas!`
                : 'Tambahkan musik ke Track Audio terlebih dahulu.'
            );
          }}
          className="mt-2 w-full rounded-md border border-emerald-400/40 bg-emerald-500/20 py-1.5 text-[10px] font-bold text-emerald-200 hover:bg-emerald-500/30"
        >
          Auto-Duck BGM (Pelankan Musik Saat Bicara)
        </button>
      </div>

      <div className="space-y-1.5">
        {SFX_PRESETS.map((sfx) => (
          <div
            key={sfx.id}
            className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 hover:border-emerald-500/40"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                    sfx.category === 'bgm'
                      ? 'bg-violet-500/20 text-violet-300'
                      : 'bg-emerald-500/20 text-emerald-300'
                  }`}
                >
                  {sfx.category}
                </span>
                <p className="truncate text-xs font-medium text-zinc-100">
                  {sfx.name}
                </p>
              </div>
              <p className="mt-0.5 text-[10px] text-zinc-500">
                Durasi: {sfx.durationLabel} · Stereo WAV 44.1kHz
              </p>
            </div>
            <button
              type="button"
              disabled={busySfxId === sfx.id}
              onClick={() => void handleAddBuiltInSfx(sfx.id)}
              className="shrink-0 rounded-md bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500 hover:text-zinc-950 disabled:opacity-50"
            >
              {busySfxId === sfx.id ? '...' : '+ Pakai'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
