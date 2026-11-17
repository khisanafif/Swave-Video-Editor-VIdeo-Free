import { useEffect, useRef, useState } from 'react';
import {
  Captions,
  CloudUpload,
  CheckCircle2,
  Film,
  Image as ImageIcon,
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
} from 'lucide-react';
import {
  FILTER_PRESETS,
  SFX_PRESETS,
  STICKER_PRESETS,
  TEXT_PRESETS,
  type SfxPresetId,
  synthesizeCapCutAudioAsset,
} from '../engine/capcutPresets';
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
import { SubtitleStudioTab } from './SubtitleStudioTab';

interface MediaBinPanelProps {
  mode?: 'sidebar' | 'sheet';
  onClipAdded?: () => void;
}

export function MediaBinPanel({
  mode = 'sidebar',
  onClipAdded,
}: MediaBinPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeCategory = useUiStore((s) => s.activeMediaCategory);
  const setActiveCategory = useUiStore((s) => s.setActiveMediaCategory);
  const runtimeMode = useUiStore((s) => s.runtimeMode);
  const [isImporting, setIsImporting] = useState(false);
  const [isGeneratingDemo, setIsGeneratingDemo] = useState(false);
  const [busySfxId, setBusySfxId] = useState<string | null>(null);
  const [duckFeedback, setDuckFeedback] = useState<string | null>(null);
  const [captionScript, setCaptionScript] = useState(
    'Halo semuanya! Selamat datang di VeloCut Studio.\nEdit video gaya CapCut 100% gratis tanpa watermark!'
  );
  const [captionPresetId, setCaptionPresetId] = useState('capcut-yellow');
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
        'VeloCut Hybrid-Edge Studio\n60 FPS WebGL2 + Multi-Device',
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

  const handleAddBuiltInSfx = async (presetId: SfxPresetId) => {
    setBusySfxId(presetId);
    try {
      const audioAsset = await synthesizeCapCutAudioAsset(presetId);
      const store = useTimelineStore.getState();
      store.registerAsset(audioAsset);
      store.addClipFromAsset(
        audioAsset.id,
        undefined,
        usePlaybackStore.getState().currentTime
      );
      if (autoSyncServer && isServerOnline) {
        void handleChunkedUpload(audioAsset.id);
      }
      onClipAdded?.();
    } finally {
      setBusySfxId(null);
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

  const containerClass =
    mode === 'sheet'
      ? 'flex h-full w-full flex-col bg-zinc-950'
      : 'flex w-80 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950';

  return (
    <aside className={containerClass}>
      {/* Header + Free CapCut Badge + Demo Button */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <h2 className="text-xs font-semibold tracking-wider text-zinc-200 uppercase">
            Media Bin
          </h2>
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
            GRATIS
          </span>
        </div>
        <button
          type="button"
          disabled={isGeneratingDemo}
          onClick={handleLoadDemo}
          className="inline-flex items-center gap-1 rounded bg-cyan-500/15 px-2.5 py-1 text-[11px] font-medium text-cyan-300 hover:bg-cyan-500/25 active:scale-95 disabled:opacity-50"
        >
          <Sparkles className="h-3 w-3" />
          <span>{isGeneratingDemo ? 'Membuat...' : 'Muat Demo'}</span>
        </button>
      </div>

      {/* CapCut Creative Category Bar */}
      <div className="grid grid-cols-6 border-b border-zinc-800/80 bg-zinc-900/50 p-1">
        {(
          [
            { id: 'media', label: 'Media', icon: Film },
            { id: 'subtitle', label: 'Subtitle', icon: Captions },
            { id: 'audio', label: 'Audio', icon: Volume2 },
            { id: 'text', label: 'Teks', icon: Type },
            { id: 'sticker', label: 'Stiker', icon: Smile },
            { id: 'effects', label: 'Efek', icon: Wand2 },
          ] as ReadonlyArray<{
            id: MediaBinCategory;
            label: string;
            icon: typeof Film;
          }>
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeCategory === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              title={`Kategori ${tab.label}`}
              onClick={() => setActiveCategory(tab.id)}
              className={`flex flex-col items-center justify-center gap-0.5 rounded py-1.5 text-[10px] font-medium transition ${active
                ? 'bg-cyan-500/20 text-cyan-300 shadow-xs'
                : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Quick Add Text Overlay button always accessible */}
      <div className="border-b border-zinc-800/80 px-3 py-2">
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
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 py-1.5 text-xs font-medium text-zinc-200 hover:border-violet-500/50 hover:bg-zinc-800 active:bg-zinc-800"
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

      {/* Tab 2: DEDICATED AI AUTO-SUBTITLE STUDIO */}
      {activeCategory === 'subtitle' && (
        <SubtitleStudioTab onClipAdded={onClipAdded} />
      )}

      {/* Tab 3: AUDIO & SFX (CapCut Built-in Sound Library) */}
      {activeCategory === 'audio' && (
        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-2.5 text-[11px] text-emerald-200">
            <p className="font-semibold">Sound Effects & Musik BGM Gratis</p>
            <p className="mt-0.5 text-[10px] text-emerald-300/80">
              Bebas hak cipta (synthesized). Klik untuk langsung masuk ke Track Audio.
            </p>
            <button
              type="button"
              onClick={() => {
                const count = useTimelineStore
                  .getState()
                  .autoDuckAudioTracks(0.22);
                setDuckFeedback(
                  count > 0
                    ? `Volume ${count} musik latar diturunkan otomatis ke 22% agar suara utama jelas!`
                    : 'Tambahkan musik ke Track Audio terlebih dahulu.'
                );
                setTimeout(() => setDuckFeedback(null), 3000);
              }}
              className="mt-2 w-full rounded-md border border-emerald-400/40 bg-emerald-500/20 py-1.5 text-[10px] font-bold text-emerald-200 hover:bg-emerald-500/30"
            >
              Auto-Duck BGM (Pelankan Musik Saat Bicara)
            </button>
            {duckFeedback && (
              <p className="mt-1.5 text-[10px] text-cyan-200">{duckFeedback}</p>
            )}
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
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${sfx.category === 'bgm'
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

          {/* CapCut Text Templates */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-zinc-300 uppercase">
              Template Teks CapCut (1-Klik)
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
              Tambahkan atau pilih klip Video/Gambar di Timeline terlebih dahulu untuk menerapkan Filter & Efek CapCut.
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
            </>
          )}
        </div>
      )}
    </aside>
  );
}
