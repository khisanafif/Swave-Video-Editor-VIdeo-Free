import { useEffect, useRef, useState } from 'react';
import {
  Captions,
  CheckCircle2,
  Cpu,
  Download,
  Film,
  Loader2,
  Server,
  Share2,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import {
  PRESET_RESOLUTIONS,
  type RenderJobRecord,
  type RenderMode,
  type ServerCapabilities,
} from '@swave/shared';
import {
  type ClientExportProgress,
  exportProjectClientSide,
} from '../engine/clientExporter';
import {
  canShareFilesOnDevice,
  saveBlobToDevice,
  shareBlobWithSystemSheet,
} from '../engine/localPersistence';
import { mediaRegistry } from '../engine/opfsStorage';
import {
  fetchRenderJobStatus,
  fetchServerCapabilities,
  saveProjectToServer,
  startServerRenderJob,
  uploadBlobInChunks,
} from '../engine/serverOffloadClient';
import {
  exportSubtitlesToSrt,
  exportSubtitlesToVtt,
  selectExportableSubtitleClips,
} from '../engine/subtitleUtils';
import { useTimelineStore } from '../stores/timelineStore';
import { useUiStore } from '../stores/uiStore';

interface ExportModalProps {
  isOpen: boolean;
  onOpenModeSettings?: () => void;
  onClose: () => void;
}

export function ExportModal({
  isOpen,
  onOpenModeSettings,
  onClose,
}: ExportModalProps) {
  const abortRef = useRef<AbortController | null>(null);
  const experienceMode = useUiStore((s) => s.experienceMode);
  const runtimeMode = useUiStore((s) => s.runtimeMode);
  const projectName = useTimelineStore((s) => s.projectName);
  const resolution = useTimelineStore((s) => s.resolution);
  const clips = useTimelineStore((s) => s.clips);

  const [renderMode, setRenderMode] = useState<RenderMode>('client-webcodecs');
  const [quality, setQuality] = useState<'draft' | 'standard' | 'high'>('standard');
  const [serverCaps, setServerCaps] = useState<ServerCapabilities | null>(null);
  const [clientProgress, setClientProgress] =
    useState<ClientExportProgress | null>(null);
  const [downloadInfo, setDownloadInfo] = useState<{
    url: string;
    ext: 'mp4' | 'webm';
    blob: Blob;
    filename: string;
  } | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [serverJob, setServerJob] = useState<RenderJobRecord | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const subtitleCount = selectExportableSubtitleClips(Object.values(clips)).length;

  useEffect(() => {
    if (isOpen && runtimeMode === 'server') {
      void fetchServerCapabilities().then(setServerCaps);
    } else if (isOpen) {
      setServerCaps(null);
      setRenderMode('client-webcodecs');
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [isOpen, runtimeMode]);

  if (!isOpen) return null;

  const applyQuickExportPreset = (
    resIndex: number,
    targetQuality: 'draft' | 'standard' | 'high'
  ) => {
    const preset = PRESET_RESOLUTIONS[resIndex];
    if (preset) {
      useTimelineStore.getState().setResolution(preset);
    }
    setQuality(targetQuality);
  };

  const handleCancelExport = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsExporting(false);
    setClientProgress(null);
  };

  const handleExport = async () => {
    setErrorMsg(null);
    setDownloadInfo((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setServerJob(null);
    setIsExporting(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (renderMode === 'client-webcodecs') {
        const project = useTimelineStore.getState().exportProjectDocument();
        const blob = await exportProjectClientSide({
          project,
          quality,
          onProgress: setClientProgress,
          signal: controller.signal,
        });
        const ext = blob.type.includes('webm') ? 'webm' : 'mp4';
        const safeBase = (projectName || 'swave-export').replace(
          /[^\w.-]/g,
          '_'
        );
        setSaveNotice(null);
        setDownloadInfo({
          url: URL.createObjectURL(blob),
          ext,
          blob,
          filename: `${safeBase}.${ext}`,
        });
        setIsExporting(false);
      } else {
        const store = useTimelineStore.getState();
        for (const clip of Object.values(store.clips)) {
          if (controller.signal.aborted) throw new Error('Export dibatalkan.');
          if (clip.type === 'text') continue;
          const asset = store.assets[clip.assetId];
          if (!asset || asset.serverUrl) continue;
          const blob = mediaRegistry.getBlob(asset.id);
          if (!blob) continue;

          const uploaded = await uploadBlobInChunks({
            blob,
            asset,
            signal: controller.signal,
            onProgress: (pct) =>
              store.updateAsset(asset.id, { uploadProgress: pct }),
          });
          store.updateAsset(asset.id, {
            source: 'hybrid',
            serverAssetId: uploaded.assetId,
            serverUrl: uploaded.mediaUrl,
            uploadProgress: 100,
          });
        }

        const project = useTimelineStore.getState().exportProjectDocument();
        await saveProjectToServer(project);
        const job = await startServerRenderJob({ project, quality });
        setServerJob(job);

        if (job.status === 'queued' || job.status === 'processing') {
          const poll = async () => {
            if (controller.signal.aborted) return;
            const latest = await fetchRenderJobStatus(job.id);
            setServerJob(latest);
            if (latest.status === 'queued' || latest.status === 'processing') {
              setTimeout(() => void poll(), 900);
            } else {
              setIsExporting(false);
            }
          };
          setTimeout(() => void poll(), 900);
        } else {
          setIsExporting(false);
        }
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
      setIsExporting(false);
    }
  };

  const handleDownloadSubs = (ext: 'srt' | 'vtt') => {
    const all = Object.values(useTimelineStore.getState().clips);
    const body =
      ext === 'srt' ? exportSubtitlesToSrt(all) : exportSubtitlesToVtt(all);
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const filename = `${(projectName || 'swave-video').replace(/[^\w.-]/g, '_')}.${ext}`;
    void saveBlobToDevice(blob, filename);
  };

  const activeProgress =
    renderMode === 'client-webcodecs'
      ? clientProgress?.progress ?? 0
      : serverJob?.progress ?? 0;

  return (
    <div
      role="dialog"
      aria-label="Ekspor Video Studio"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4"
    >
      <div className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 text-xs shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white">
              Ekspor Video MP4 (100% Gratis Tanpa Watermark)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* Quick 1-Click Export Presets (Super Easy for Amateurs) */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
              Pilih Preset Tujuan Cepat
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => applyQuickExportPreset(1, 'standard')}
                className={`rounded-xl border p-2.5 text-left transition ${
                  resolution.width === 1080 && resolution.height === 1920
                    ? 'border-cyan-400 bg-cyan-950/30'
                    : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
                }`}
              >
                <Smartphone className="mb-1 h-4 w-4 text-cyan-400" />
                <p className="font-bold text-white">TikTok / Reels</p>
                <p className="text-[10px] text-zinc-400">1080×1920 · HD</p>
              </button>

              <button
                type="button"
                onClick={() => applyQuickExportPreset(0, 'high')}
                className={`rounded-xl border p-2.5 text-left transition ${
                  resolution.width === 1920 &&
                  resolution.height === 1080 &&
                  quality === 'high'
                    ? 'border-emerald-400 bg-emerald-950/30'
                    : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
                }`}
              >
                <Sparkles className="mb-1 h-4 w-4 text-emerald-400" />
                <p className="font-bold text-white">YouTube Full HD</p>
                <p className="text-[10px] text-zinc-400">1920×1080 · Tajam</p>
              </button>

              <button
                type="button"
                onClick={() => applyQuickExportPreset(3, 'draft')}
                className={`rounded-xl border p-2.5 text-left transition ${
                  resolution.width === 1280 && quality === 'draft'
                    ? 'border-violet-400 bg-violet-950/30'
                    : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
                }`}
              >
                <Download className="mb-1 h-4 w-4 text-violet-400" />
                <p className="font-bold text-white">Hemat WhatsApp</p>
                <p className="text-[10px] text-zinc-400">720p · Cepat & Ringan</p>
              </button>
            </div>
          </div>

          {/* Pro Quality & Resolution Fine-tuning */}
          {experienceMode === 'pro' && (
            <div className="grid grid-cols-2 gap-2.5 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <div>
                <label className="mb-1 block text-[10px] text-zinc-400">
                  Resolusi Kanvas
                </label>
                <select
                  value={`${resolution.width}x${resolution.height}x${resolution.fps}`}
                  onChange={(e) => {
                    const found = PRESET_RESOLUTIONS.find(
                      (r) => `${r.width}x${r.height}x${r.fps}` === e.target.value
                    );
                    if (found) useTimelineStore.getState().setResolution(found);
                  }}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-100"
                >
                  {PRESET_RESOLUTIONS.map((r) => (
                    <option
                      key={`${r.width}x${r.height}x${r.fps}`}
                      value={`${r.width}x${r.height}x${r.fps}`}
                    >
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-zinc-400">
                  Kualitas Encode (CRF)
                </label>
                <select
                  value={quality}
                  onChange={(e) =>
                    setQuality(e.target.value as 'draft' | 'standard' | 'high')
                  }
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-100"
                >
                  <option value="draft">Draft Cepat (CRF 28)</option>
                  <option value="standard">Standar Seimbang (CRF 21)</option>
                  <option value="high">Tinggi Studio (CRF 17)</option>
                </select>
              </div>
            </div>
          )}

          {/* Render Engine Choice */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRenderMode('client-webcodecs')}
              className={`rounded-xl border p-2.5 text-left transition ${
                renderMode === 'client-webcodecs'
                  ? 'border-cyan-400 bg-cyan-950/25'
                  : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold text-white">
                <Cpu className="h-3.5 w-3.5 text-cyan-400" />
                <span>Di Perangkat Ini</span>
              </div>
              <p className="mt-1 text-[10px] text-zinc-400">
                Langsung di browser tanpa unggah ulang.
              </p>
            </button>

            <button
              type="button"
              disabled={runtimeMode !== 'server' || serverCaps?.status !== 'online'}
              onClick={() => setRenderMode('server-ffmpeg')}
              className={`rounded-xl border p-2.5 text-left transition disabled:opacity-60 ${
                renderMode === 'server-ffmpeg'
                  ? 'border-emerald-400 bg-emerald-950/25'
                  : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between gap-1 font-bold text-white">
                <div className="flex items-center gap-1.5">
                  <Server className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Server PC FFmpeg</span>
                </div>
              </div>
              <p className="mt-1 text-[10px] text-zinc-400">
                {runtimeMode !== 'server'
                  ? 'Mode Mandiri aktif (buka Mode Operasi jika ingin pakai Server PC)'
                  : serverCaps?.status === 'online'
                    ? `Aktif (${serverCaps.preferredEncoder || 'libx264'})`
                    : 'Server PC tidak terhubung'}
              </p>
            </button>
          </div>

          {runtimeMode !== 'server' && onOpenModeSettings && (
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-1.5 text-[10px] text-zinc-400">
              <span>Ingin render cepat di PC/Laptop lain via WiFi?</span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenModeSettings();
                }}
                className="font-semibold text-cyan-300 hover:underline"
              >
                Hubungkan Server PC
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={isExporting || Object.keys(clips).length === 0}
              onClick={() => void handleExport()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 py-2.5 text-xs font-extrabold text-zinc-950 shadow-lg transition hover:brightness-110 disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Merender Video ({activeProgress}%)...</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  <span>Mulai Ekspor MP4 Sekarang</span>
                </>
              )}
            </button>

            {isExporting && (
              <button
                type="button"
                onClick={handleCancelExport}
                className="rounded-xl border border-rose-500/50 bg-rose-950/40 px-4 py-2.5 text-xs font-bold text-rose-200 hover:bg-rose-900/50"
              >
                Batal
              </button>
            )}
          </div>

          {isExporting && (
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all"
                style={{ width: `${activeProgress}%` }}
              />
            </div>
          )}

          {downloadInfo && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void saveBlobToDevice(
                      downloadInfo.blob,
                      downloadInfo.filename
                    ).then((how) => {
                      setSaveNotice(
                        how === 'native-saved'
                          ? `Tersimpan ke folder Downloads/SWAVE-VIDEO/${downloadInfo.filename}`
                          : `File ${downloadInfo.filename} mulai diunduh!`
                      );
                    });
                  }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-400/50 bg-emerald-500/20 px-3 py-2.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/30"
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span>Unduh Video (.{downloadInfo.ext})</span>
                </button>

                {canShareFilesOnDevice() && (
                  <button
                    type="button"
                    onClick={() => {
                      void shareBlobWithSystemSheet(
                        downloadInfo.blob,
                        downloadInfo.filename,
                        projectName || 'SWAVE Video'
                      ).catch(() => {});
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-cyan-400/50 bg-cyan-500/20 px-3 py-2.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/30"
                    title="Simpan ke Galeri / Photos (iOS & Android) atau Bagikan"
                  >
                    <Share2 className="h-4 w-4" />
                    <span>Simpan / Bagikan</span>
                  </button>
                )}
              </div>

              {saveNotice && (
                <p className="text-center text-[10px] text-emerald-300">
                  {saveNotice}
                </p>
              )}

              {downloadInfo.ext === 'webm' && serverCaps?.status === 'online' && (
                <p className="text-center text-[10px] text-amber-300">
                  Browser HTTP LAN menghasilkan format .webm. Untuk MP4 H.264 universal (WhatsApp/iOS), pilih mode <strong>Server PC FFmpeg</strong>.
                </p>
              )}
            </div>
          )}

          {serverJob?.outputUrl && (
            <a
              href={serverJob.outputUrl}
              download
              className="flex items-center justify-center gap-2 rounded-xl border border-emerald-400/50 bg-emerald-500/20 py-2.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/30"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>Render Server Selesai! Unduh Output (.mp4)</span>
            </a>
          )}

          {(errorMsg || serverJob?.error) && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 p-2.5 text-[11px] text-rose-200">
              {errorMsg || serverJob?.error}
            </div>
          )}

          {/* Optional Separate Subtitle File Export */}
          {subtitleCount > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2">
              <div className="flex items-center gap-2 text-[11px] text-zinc-300">
                <Captions className="h-4 w-4 text-violet-400" />
                <span>Ekspor file teks subtitle terpisah ({subtitleCount} cue):</span>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => handleDownloadSubs('srt')}
                  className="rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[10px] font-bold text-zinc-200 hover:border-cyan-400"
                >
                  .SRT
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadSubs('vtt')}
                  className="rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[10px] font-bold text-zinc-200 hover:border-violet-400"
                >
                  .VTT
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
