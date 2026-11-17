import { useEffect, useRef, useState } from 'react';
import type { BlendMode } from '@swave/shared';
import {
  Captions,
  CloudUpload,
  CheckCircle2,
  Film,
  Image as ImageIcon,
  Layers,
  Music,
  Plus,
  RefreshCw,
  Server,
  Smile,
  Sparkles,
  Trash2,
  Type,
  Upload,
  Volume2,
  Wand2,
  X,
} from 'lucide-react';
import {
  FILTER_PRESETS,
  STICKER_PRESETS,
  TEXT_PRESETS,
} from '../engine/editorPresets';
import {
  generateSyntheticDemoMedia,
  probeAndRegisterMediaFile,
} from '../engine/mediaProbe';
import { mediaRegistry } from '../engine/opfsStorage';
import {
  fetchServerCapabilities,
  fetchServerMediaAssets,
  type ServerMediaAssetItem,
  uploadBlobInChunks,
} from '../engine/serverOffloadClient';
import { usePlaybackStore } from '../stores/playbackStore';
import { useTimelineStore } from '../stores/timelineStore';
import { useUiStore, type MediaBinCategory } from '../stores/uiStore';
import { formatBytes } from '../utils/format';
import { AudioStudioTab } from './AudioStudioTab';
import { OverlayStudioTab } from './OverlayStudioTab';
import { SubtitleStudioTab } from './SubtitleStudioTab';

interface MediaBinPanelProps {
  mode?: 'sidebar' | 'drawer' | 'sheet';
  hideRail?: boolean;
  onClipAdded?: () => void;
  onCloseDrawer?: () => void;
}

export const STUDIO_CATEGORIES: ReadonlyArray<{
  id: MediaBinCategory;
  label: string;
  icon: typeof Film;
}> = [
  { id: 'media', label: 'Media', icon: Film },
  { id: 'overlay', label: 'Overlay', icon: Layers },
  { id: 'subtitle', label: 'Subtitle', icon: Captions },
  { id: 'audio', label: 'Audio', icon: Volume2 },
  { id: 'text', label: 'Teks', icon: Type },
  { id: 'sticker', label: 'Stiker', icon: Smile },
  { id: 'effects', label: 'Efek', icon: Wand2 },
];

export function MediaBinPanel({
  mode = 'sidebar',
  hideRail = false,
  onClipAdded,
  onCloseDrawer,
}: MediaBinPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeCategory = useUiStore((s) => s.activeMediaCategory);
  const setActiveCategory = useUiStore((s) => s.setActiveMediaCategory);
  const runtimeMode = useUiStore((s) => s.runtimeMode);
  const [isImporting, setIsImporting] = useState(false);
  const [isGeneratingDemo, setIsGeneratingDemo] = useState(false);
  const [captionScript, setCaptionScript] = useState(
    'Halo semuanya! Selamat datang di SWAVE Video.\nEdit visual & subtitle otomatis 100% gratis tanpa watermark!'
  );
  const [captionPresetId, setCaptionPresetId] = useState('bold-yellow');
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [autoSyncServer, setAutoSyncServer] = useState(false);
  const [serverAssets, setServerAssets] = useState<ServerMediaAssetItem[]>([]);
  const [isServerOnline, setIsServerOnline] = useState(false);

  const assets = useTimelineStore((s) => s.assets);
  const clips = useTimelineStore((s) => s.clips);
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds);
  const assetList = Object.values(assets);

  const targetVisualClip =
    (selectedClipIds[0] ? clips[selectedClipIds[0]] : undefined) ||
    Object.values(clips).find((c) => c.type === 'video' || c.type === 'overlay');

  const refreshServerAssets = async () => {
    if (useUiStore.getState().runtimeMode !== 'server') {
      setIsServerOnline(false);
      setServerAssets([]);
      return;
    }
    const caps = await fetchServerCapabilities();
    if (!caps) {
      setIsServerOnline(false);
      return;
    }
    setIsServerOnline(true);
    const remoteList = await fetchServerMediaAssets();
    setServerAssets(remoteList);
  };

  useEffect(() => {
    if (runtimeMode === 'server') {
      setAutoSyncServer(true);
      void refreshServerAssets();
    } else {
      setAutoSyncServer(false);
      setIsServerOnline(false);
      setServerAssets([]);
    }
  }, [runtimeMode]);

  const handleChunkedUpload = async (assetId: string, blobOverride?: Blob) => {
    const asset = useTimelineStore.getState().assets[assetId];
    const blob = blobOverride || mediaRegistry.getBlob(assetId);
    if (!asset || !blob) return;

    try {
      setUploadStatus(`Sinkronisasi ${asset.name} ke Server PC...`);
      const res = await uploadBlobInChunks({
        blob,
        asset,
        onProgress: (pct) => {
          useTimelineStore
            .getState()
            .updateAsset(assetId, { uploadProgress: pct });
        },
      });
      useTimelineStore.getState().updateAsset(assetId, {
        source: 'hybrid',
        serverAssetId: res.assetId,
        serverUrl: res.mediaUrl,
        uploadProgress: 100,
      });
      setUploadStatus(`Tersinkron ke Server: ${asset.name}`);
      void refreshServerAssets();
      setTimeout(() => setUploadStatus(null), 2500);
    } catch (err) {
      setUploadStatus(`Info: tersimpan lokal (${(err as Error).message})`);
      setTimeout(() => setUploadStatus(null), 3000);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsImporting(true);
    try {
      for (const file of Array.from(files)) {
        const asset = await probeAndRegisterMediaFile(
          file,
          file.name,
          file.type
        );
        useTimelineStore.getState().registerAsset(asset);
        useTimelineStore.getState().addClipFromAsset(asset.id);
        if (autoSyncServer && isServerOnline) {
          void handleChunkedUpload(asset.id, file);
        }
      }
      onClipAdded?.();
    } finally {
      setIsImporting(false);
    }
  };

  const handleLoadDemo = async () => {
    setIsGeneratingDemo(true);
    try {
      const { visualAsset, audioAsset } = await generateSyntheticDemoMedia();
      const store = useTimelineStore.getState();
      store.registerAsset(visualAsset);
      store.registerAsset(audioAsset);
      store.addClipFromAsset(visualAsset.id, 'track-1', 0);
      store.addTextClip(
        'SWAVE Video Studio\n60 FPS WebGL2 + Multi-Device',
        0.4,
        'track-2'
      );
      store.addClipFromAsset(audioAsset.id, 'track-3', 0);
      usePlaybackStore.getState().seekTo(0);

      if (autoSyncServer && isServerOnline) {
        void handleChunkedUpload(visualAsset.id);
        void handleChunkedUpload(audioAsset.id);
      }
      onClipAdded?.();
    } finally {
      setIsGeneratingDemo(false);
    }
  };

  const handleImportFromServerLibrary = (remote: ServerMediaAssetItem) => {
    const store = useTimelineStore.getState();
    const existing = Object.values(store.assets).find(
      (a) => a.serverAssetId === remote.id || a.id === remote.id
    );
    if (existing) {
      store.addClipFromAsset(
        existing.id,
        undefined,
        usePlaybackStore.getState().currentTime
      );
      onClipAdded?.();
      return;
    }

    mediaRegistry.registerRemoteAsset(remote.id, remote.mediaUrl);
    store.registerAsset({
      id: remote.id,
      name: remote.filename,
      kind: remote.kind,
      mimeType: remote.mimeType,
      size: remote.size,
      duration: remote.duration || (remote.kind === 'image' ? 4 : 5),
      width: remote.width || 1280,
      height: remote.height || 720,
      hasAudio: remote.kind !== 'image',
      source: 'server',
      serverAssetId: remote.id,
      serverUrl: remote.mediaUrl,
      uploadProgress: 100,
    });
    store.addClipFromAsset(
      remote.id,
      undefined,
      usePlaybackStore.getState().currentTime
    );
    onClipAdded?.();
  };

  const unlinkedServerAssets = serverAssets.filter(
    (sa) =>
      !assetList.some((local) => local.serverAssetId === sa.id || local.id === sa.id)
  );

  const showVerticalRail = (mode === 'sidebar' || mode === 'drawer') && !hideRail;

  return (
    <aside
      className={`flex h-full w-full overflow-hidden ${
        mode === 'sheet' ? 'flex-col bg-[#202026]' : 'flex-row bg-[#18181C]'
      }`}
    >
      {/* Desktop / Sidebar Vertical Category Rail (52px) */}
      {showVerticalRail && (
        <div
          aria-label="Kategori Studio"
          className="flex w-[52px] shrink-0 flex-col items-center gap-1 border-r border-[#2A2A32] bg-[#111114] py-2"
        >
          {STUDIO_CATEGORIES.map((tab) => {
            const Icon = tab.icon;
            const active = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                title={`Kategori ${tab.label}`}
                onClick={() => setActiveCategory(tab.id)}
                className={`flex w-[44px] flex-col items-center justify-center gap-0.5 rounded-lg py-2 text-[9px] font-medium transition ${
                  active
                    ? 'bg-[#00E5FF]/20 text-[#00E5FF]'
                    : 'text-zinc-400 hover:bg-[#242429] hover:text-zinc-100'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Content Area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header + Free Badge + Demo Button + Optional Drawer Close */}
        <div className="flex items-center justify-between border-b border-[#2A2A32] px-3 py-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 className="truncate text-xs font-semibold tracking-wider text-zinc-200 uppercase">
              Media Bin
            </h2>
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
              GRATIS
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={isGeneratingDemo}
              onClick={handleLoadDemo}
              className="inline-flex items-center gap-1 rounded bg-[#00E5FF]/15 px-2 py-1 text-[11px] font-medium text-[#00E5FF] hover:bg-[#00E5FF]/25 active:scale-95 disabled:opacity-50"
            >
              <Sparkles className="h-3 w-3" />
              <span>{isGeneratingDemo ? 'Membuat...' : 'Muat Demo'}</span>
            </button>
            {onCloseDrawer && (
              <button
                type="button"
                onClick={onCloseDrawer}
                className="rounded p-1 text-zinc-400 hover:bg-[#242429] hover:text-white"
                title="Tutup panel aset"
                aria-label="Tutup panel aset"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Sheet Mode Horizontal Category Bar */}
        {mode === 'sheet' && (
          <div className="grid grid-cols-7 border-b border-[#2A2A32] bg-[#18181C] p-1">
            {STUDIO_CATEGORIES.map((tab) => {
              const Icon = tab.icon;
              const active = activeCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  title={`Kategori ${tab.label}`}
                  onClick={() => setActiveCategory(tab.id)}
                  className={`flex flex-col items-center justify-center gap-0.5 rounded py-1.5 text-[9.5px] font-medium transition ${
                    active
                      ? 'bg-[#00E5FF]/20 text-[#00E5FF]'
                      : 'text-zinc-400 hover:bg-[#242429] hover:text-zinc-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Quick Add Text Overlay button always accessible */}
        <div className="border-b border-[#2A2A32] px-3 py-2">
          <button
            type="button"
            onClick={() => {
              useTimelineStore
                .getState()
                .addTextClip(
                  'Judul Overlay',
                  usePlaybackStore.getState().currentTime
                );
              onClipAdded?.();
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[#2A2A32] bg-[#242429] py-1.5 text-xs font-medium text-zinc-200 hover:border-violet-400/60 hover:bg-[#2c2c34]"
          >
            <Type className="h-3.5 w-3.5 text-violet-400" />
            <span>Tambah Teks Overlay</span>
          </button>
        </div>

      {/* Tab 1: MEDIA */}
      {activeCategory === 'media' && (
        <>
          <div className="space-y-2 border-b border-zinc-800/80 p-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="video/*,audio/*,image/*"
              className="hidden"
              onChange={(e) => {
                void handleFiles(e.target.files);
                e.target.value = '';
              }}
            />

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void handleFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 px-3 py-3 text-center transition hover:border-cyan-500/60 hover:bg-zinc-900/80 active:bg-zinc-800/80"
            >
              <Upload className="mb-1 h-5 w-5 text-cyan-400" />
              <p className="text-xs font-medium text-zinc-200">
                {isImporting ? 'Memproses Media...' : 'Impor Video, Audio, Gambar'}
              </p>
              <p className="mt-0.5 text-[10px] text-zinc-500">
                {runtimeMode === 'server'
                  ? 'Dari perangkat ini + sinkron ke Server PC'
                  : '100% disimpan & diproses lokal di perangkat Anda'}
              </p>
            </div>

            {runtimeMode === 'server' && (
              <div className="flex items-center justify-between px-0.5 text-[11px]">
                <label className="flex cursor-pointer items-center gap-1.5 text-zinc-400">
                  <input
                    type="checkbox"
                    checked={autoSyncServer}
                    onChange={(e) => setAutoSyncServer(e.target.checked)}
                    className="accent-cyan-400"
                  />
                  <span>Auto-Sync ke Server PC (Multi-Device)</span>
                </label>
              </div>
            )}

            {uploadStatus && (
              <div className="rounded bg-zinc-900 px-2 py-1 text-[11px] text-cyan-300">
                {uploadStatus}
              </div>
            )}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {assetList.length === 0 ? (
              <p className="py-4 text-center text-xs text-zinc-500">
                Belum ada aset media di proyek ini. Impor file atau ketuk Muat Demo.
              </p>
            ) : (
              <div className="space-y-2">
                {assetList.map((asset) => {
                  const Icon =
                    asset.kind === 'audio'
                      ? Music
                      : asset.kind === 'image'
                        ? ImageIcon
                        : Film;

                  return (
                    <div
                      key={asset.id}
                      className="rounded-lg border border-zinc-800/90 bg-zinc-900/60 p-2.5 transition hover:border-zinc-700"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          {asset.thumbnailUrl ? (
                            <img
                              src={asset.thumbnailUrl}
                              alt={asset.name}
                              className="h-9 w-12 shrink-0 rounded border border-zinc-700 object-cover"
                            />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-zinc-800 text-cyan-400">
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-zinc-100">
                              {asset.name}
                            </p>
                            <p className="text-[10px] text-zinc-500">
                              {asset.duration.toFixed(1)}s · {formatBytes(asset.size)}
                              {asset.width > 0 ? ` · ${asset.width}×${asset.height}` : ''}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            void mediaRegistry.deleteAsset(asset.id, asset.opfsPath);
                            useTimelineStore.getState().removeAsset(asset.id);
                          }}
                          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-rose-400"
                          title="Hapus aset"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-1.5">
                        {asset.serverUrl ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            Siap di Semua Perangkat
                          </span>
                        ) : runtimeMode === 'server' ? (
                          <button
                            type="button"
                            onClick={() => void handleChunkedUpload(asset.id)}
                            className="inline-flex items-center gap-1 rounded border border-zinc-700/80 px-2 py-1 text-[10px] text-zinc-300 hover:border-cyan-500/60 hover:text-cyan-300"
                            title="Unggah ke server PC (10MB chunks) agar bisa diedit di HP/Tablet/Laptop lain"
                          >
                            <CloudUpload className="h-3 w-3" />
                            <span>
                              {asset.uploadProgress !== undefined &&
                                asset.uploadProgress < 100
                                ? `${asset.uploadProgress}%`
                                : 'Sync ke Server PC'}
                            </span>
                          </button>
                        ) : (
                          <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-400">
                            Lokal Perangkat
                          </span>
                        )}

                        <div className="flex items-center gap-1">
                          {asset.kind === 'video' && (
                            <button
                              type="button"
                              onClick={() => setActiveCategory('audio')}
                              className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300 hover:bg-emerald-500/20"
                              title="Buka tab Audio untuk ekstrak suara video ini ke .WAV atau Track Audio"
                            >
                              <Music className="h-3 w-3" />
                              <span>Ekstrak</span>
                            </button>
                          )}
                          {(asset.kind === 'image' || asset.kind === 'video') && (
                            <button
                              type="button"
                              onClick={() => {
                                useTimelineStore
                                  .getState()
                                  .addOverlayClipFromAsset(
                                    asset.id,
                                    usePlaybackStore.getState().currentTime
                                  );
                                onClipAdded?.();
                              }}
                              className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-200 hover:bg-amber-400 hover:text-zinc-950 active:scale-95"
                              title="Tambahkan sebagai Overlay / Gambar PIP di atas Video Utama"
                            >
                              <Layers className="h-3 w-3" />
                              <span>+ Overlay</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              useTimelineStore
                                .getState()
                                .addClipFromAsset(
                                  asset.id,
                                  undefined,
                                  usePlaybackStore.getState().currentTime
                                );
                              onClipAdded?.();
                            }}
                            className="inline-flex items-center gap-1 rounded bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-200 hover:bg-cyan-500 hover:text-zinc-950 active:scale-95"
                          >
                            <Plus className="h-3 w-3" />
                            <span>Timeline</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {isServerOnline && (
              <div className="border-t border-zinc-800/80 pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
                    <Server className="h-3.5 w-3.5" />
                    <span>Pustaka Server PC ({unlinkedServerAssets.length})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refreshServerAssets()}
                    className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                    title="Segarkan pustaka server"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                </div>

                {unlinkedServerAssets.length === 0 ? (
                  <p className="text-[10px] text-zinc-500">
                    Semua media di server PC sudah ada di proyek ini.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {unlinkedServerAssets.map((remote) => (
                      <div
                        key={remote.id}
                        className="flex items-center justify-between rounded border border-zinc-800/80 bg-zinc-900/40 px-2.5 py-1.5"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="truncate text-[11px] font-medium text-zinc-200">
                            {remote.filename}
                          </p>
                          <p className="text-[10px] text-zinc-500">
                            {formatBytes(remote.size)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleImportFromServerLibrary(remote)}
                          className="shrink-0 rounded bg-emerald-500/20 px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/30"
                        >
                          + Pakai
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Tab 2: OVERLAY GAMBAR & MULTI-LAYER PIP */}
      {activeCategory === 'overlay' && (
        <OverlayStudioTab
          onSyncAsset={(assetId, file) => {
            if (autoSyncServer && isServerOnline) {
              void handleChunkedUpload(assetId, file);
            }
          }}
          onClipAdded={onClipAdded}
        />
      )}

      {/* Tab 3: DEDICATED AI AUTO-SUBTITLE STUDIO */}
      {activeCategory === 'subtitle' && (
        <SubtitleStudioTab onClipAdded={onClipAdded} />
      )}

      {/* Tab 3: AUDIO UPLOAD, EXTRACT AUDIO, VOICEOVER & SFX */}
      {activeCategory === 'audio' && (
        <AudioStudioTab
          onImportAudioFiles={handleFiles}
          onSyncAsset={(assetId) => {
            if (autoSyncServer && isServerOnline) {
              void handleChunkedUpload(assetId);
            }
          }}
          onClipAdded={onClipAdded}
        />
      )}

      {/* Tab 3: TEKS & AUTO-CAPTION CAPCUT */}
      {activeCategory === 'text' && (
        <div className="flex-1 space-y-4 overflow-y-auto p-3">
          {/* Auto-Caption Generator */}
          <div className="space-y-2 rounded-xl border border-violet-500/30 bg-violet-950/15 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-violet-300">
                Auto-Caption / Subtitle Otomatis
              </span>
              <button
                type="button"
                onClick={() => setActiveCategory('subtitle')}
                className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[9px] font-bold text-cyan-300 hover:bg-cyan-500/30"
              >
                Studio AI Whisper &rarr;
              </button>
            </div>
            <p className="text-[10px] text-zinc-400">
              Tempel naskah/transkrip suara. Otomatis dipecah per kalimat dan dipasang berurutan di Timeline lengkap dengan animasi Pop!
            </p>
            <textarea
              rows={3}
              value={captionScript}
              onChange={(e) => setCaptionScript(e.target.value)}
              placeholder="Ketik kalimat subtitle di sini..."
              className="w-full rounded border border-zinc-700 bg-zinc-900 p-2 text-xs text-zinc-100 outline-none focus:border-violet-400"
            />
            <div className="flex items-center gap-2">
              <select
                value={captionPresetId}
                onChange={(e) => setCaptionPresetId(e.target.value)}
                className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-200"
              >
                {TEXT_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const ids = useTimelineStore
                    .getState()
                    .generateAutoCaptions(captionScript, captionPresetId);
                  if (ids.length > 0) {
                    const first = useTimelineStore.getState().clips[ids[0]];
                    if (first) {
                      usePlaybackStore.getState().seekTo(first.start);
                    }
                  }
                  onClipAdded?.();
                }}
                className="rounded-md bg-violet-500 px-3 py-1.5 text-xs font-bold text-zinc-950 hover:bg-violet-400 active:scale-95"
              >
                Buat Auto-Caption
              </button>
            </div>
          </div>

          {/* Quick Text Templates */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-zinc-300 uppercase">
              Template Teks Cepat (1-Klik)
            </p>
            <div className="grid grid-cols-1 gap-2">
              {TEXT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    useTimelineStore
                      .getState()
                      .addPresetTextClip(
                        preset.id,
                        undefined,
                        usePlaybackStore.getState().currentTime
                      );
                    onClipAdded?.();
                  }}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition hover:scale-[1.01] active:scale-95 ${preset.previewBg}`}
                >
                  <div>
                    <p className="text-xs font-extrabold tracking-wide">
                      {preset.sampleText}
                    </p>
                    <p className="mt-0.5 text-[10px] opacity-80">
                      {preset.label} · Animasi: {preset.defaultAnimation}
                    </p>
                  </div>
                  <Plus className="h-4 w-4 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: STIKER & EMOJI OVERLAY */}
      {activeCategory === 'sticker' && (
        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          <p className="text-[11px] text-zinc-400">
            Ketuk stiker untuk menambahkan ke Timeline dengan animasi Pop Zoom otomatis:
          </p>
          <div className="grid grid-cols-2 gap-2">
            {STICKER_PRESETS.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  useTimelineStore
                    .getState()
                    .addStickerClip(
                      st.emoji,
                      st.label,
                      usePlaybackStore.getState().currentTime
                    );
                  onClipAdded?.();
                }}
                className="flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/70 p-2.5 text-left transition hover:border-cyan-500/50 hover:bg-zinc-800 active:scale-95"
              >
                <span className="text-2xl">{st.emoji}</span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-zinc-100">
                    {st.label}
                  </p>
                  <p className="text-[10px] text-cyan-400">+ Pop Zoom</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tab 5: FILTER LUT & EFEK GLSL CAPCUT */}
      {activeCategory === 'effects' && (
        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {!targetVisualClip ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200">
              Tambahkan atau pilih klip Video/Gambar di Timeline terlebih dahulu untuk menerapkan Filter & Efek GLSL.
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 px-2.5 py-2 text-[11px] text-cyan-200">
                Target Klip Aktif:{' '}
                <span className="font-bold text-white">{targetVisualClip.name}</span>
              </div>

              <p className="text-[11px] font-semibold text-zinc-300 uppercase">
                Preset Filter Warna (LUT Gratis)
              </p>
              <div className="grid grid-cols-2 gap-2">
                {FILTER_PRESETS.map((preset) => {
                  const isSelected =
                    (targetVisualClip.filterPreset || 'normal') === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        useTimelineStore
                          .getState()
                          .applyFilterPreset(
                            targetVisualClip.id,
                            preset.id,
                            preset.effects
                          );
                        onClipAdded?.();
                      }}
                      className={`flex flex-col justify-between rounded-xl border p-2.5 text-left transition active:scale-95 ${isSelected
                        ? 'border-cyan-400 bg-cyan-950/40 ring-1 ring-cyan-400/40'
                        : 'border-zinc-800 bg-zinc-900/70 hover:border-zinc-700'
                        }`}
                    >
                      <div
                        className={`mb-2 h-8 w-full rounded-md bg-gradient-to-r ${preset.badgeColor}`}
                      />
                      <p className="truncate text-xs font-semibold text-zinc-100">
                        {preset.name}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2 border-t border-zinc-800 pt-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300 uppercase">
                  <Layers className="h-3.5 w-3.5 text-violet-400" />
                  <span>Blend Mode Layer & Chroma Key</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'normal', label: 'Normal' },
                      { id: 'screen', label: 'Screen' },
                      { id: 'multiply', label: 'Multiply' },
                      { id: 'overlay', label: 'Overlay' },
                      { id: 'lighten', label: 'Lighten' },
                      { id: 'darken', label: 'Darken' },
                    ] as Array<{ id: BlendMode; label: string }>
                  ).map((bm) => (
                    <button
                      key={bm.id}
                      type="button"
                      onClick={() => {
                        useTimelineStore
                          .getState()
                          .setClipBlendMode(targetVisualClip.id, bm.id);
                        onClipAdded?.();
                      }}
                      className={`rounded border px-2 py-1 text-[10px] font-medium ${
                        (targetVisualClip.blendMode || 'normal') === bm.id
                          ? 'border-violet-400 bg-violet-500/20 text-violet-200'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {bm.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
      </div>
    </aside>
  );
}
