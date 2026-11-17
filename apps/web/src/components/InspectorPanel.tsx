import { useEffect, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Bold,
  Check,
  ClipboardPaste,
  Copy,
  Cpu,
  Crop,
  Download,
  FileAudio,
  FlipHorizontal2,
  FlipVertical2,
  Gauge,
  Globe,
  Layers,
  Loader2,
  Move,
  Palette,
  Pipette,
  RotateCw,
  Scissors,
  Server,
  Share2,
  SlidersHorizontal,
  Snowflake,
  Sparkles,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from 'lucide-react';
import {
  DEFAULT_CHROMA_KEY,
  DEFAULT_CLIP_ANIMATION,
  DEFAULT_CLIP_CROP,
  type BlendMode,
  type RenderJobRecord,
  type RenderMode,
  type ServerCapabilities,
} from '@swave/shared';
import {
  detectSpeechSegmentsVad,
  extractAudioFromMediaAsset,
  extractProjectAudioPcm16k,
} from '../engine/audioExtractor';
import { probeAndRegisterMediaFile } from '../engine/mediaProbe';
import {
  ANIMATION_PRESETS,
  CANVAS_BG_PRESETS,
  FILTER_PRESETS,
  TEXT_PRESETS,
} from '../engine/editorPresets';
import {
  type ClientExportProgress,
  exportProjectClientSide,
} from '../engine/clientExporter';
import {
  canShareFilesOnDevice,
  saveBlobToDevice,
  shareBlobWithSystemSheet,
} from '../engine/localPersistence';
import { mediaRuntime } from '../engine/mediaRuntime';
import { mediaRegistry } from '../engine/opfsStorage';
import {
  fetchRenderJobStatus,
  fetchServerCapabilities,
  getServerBaseUrl,
  saveProjectToServer,
  startServerRenderJob,
  testAndConnectServer,
  uploadBlobInChunks,
} from '../engine/serverOffloadClient';
import { usePlaybackStore } from '../stores/playbackStore';
import { getMainVideoTrackId, useTimelineStore } from '../stores/timelineStore';
import { useUiStore } from '../stores/uiStore';

const TEXT_SWATCHES = [
  { label: 'Putih', color: '#ffffff' },
  { label: 'Kuning Terang', color: '#facc15' },
  { label: 'Cyan Neon', color: '#22d3ee' },
  { label: 'Merah', color: '#f43f5e' },
  { label: 'Hijau', color: '#4ade80' },
  { label: 'Oranye', color: '#fb923c' },
  { label: 'Pink', color: '#ec4899' },
  { label: 'Hitam', color: '#09090b' },
];

const BG_SWATCHES = [
  { label: 'Tanpa Latar', color: 'transparent' },
  { label: 'Hitam Semi', color: 'rgba(9, 9, 11, 0.75)' },
  { label: 'Merah News', color: 'rgba(220, 38, 38, 0.92)' },
  { label: 'Biru Cyber', color: 'rgba(8, 51, 68, 0.88)' },
  { label: 'Putih Solid', color: 'rgba(255, 255, 255, 0.92)' },
];

const STUDIO_FONTS = [
  { label: 'Modern Sans (Inter)', value: 'Inter, system-ui, sans-serif' },
  { label: 'Impact Tebal', value: 'Impact, Arial Black, sans-serif' },
  { label: 'Sinematik Serif', value: 'Georgia, serif' },
  { label: 'Komik Casual', value: '"Comic Sans MS", cursive, sans-serif' },
  { label: 'Monospace Kode', value: '"JetBrains Mono", monospace' },
];

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (val: number) => void;
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  onChange,
}: SliderRowProps) {
  return (
    <label className="grid grid-cols-[78px_1fr_46px] items-center gap-2">
      <span className="truncate text-[11px] text-zinc-400" title={label}>
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={() => useTimelineStore.temporal.getState().pause()}
        onPointerUp={() => useTimelineStore.temporal.getState().resume()}
        onPointerCancel={() => useTimelineStore.temporal.getState().resume()}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-5 w-full accent-[#00E5FF]"
      />
      <span className="rounded bg-[#242429] px-1.5 py-0.5 text-right font-mono text-[10px] text-zinc-200">
        {Number(value).toFixed(step < 1 ? 2 : 0)}
        {suffix}
      </span>
    </label>
  );
}

interface InspectorPanelProps {
  mode?: 'sidebar' | 'drawer' | 'sheet';
  initialTab?: 'inspector' | 'export';
  onClosePanel?: () => void;
}

export function InspectorPanel({
  mode = 'sidebar',
  initialTab = 'inspector',
  onClosePanel,
}: InspectorPanelProps) {
  const [activeTab, setActiveTab] = useState<'inspector' | 'export'>(initialTab);
  const [renderMode, setRenderMode] = useState<RenderMode>('client-webcodecs');
  const [serverCaps, setServerCaps] = useState<ServerCapabilities | null>(null);
  const [serverUrlInput, setServerUrlInput] = useState<string>(() =>
    getServerBaseUrl()
  );
  const [clientProgress, setClientProgress] =
    useState<ClientExportProgress | null>(null);
  const [clientExportFile, setClientExportFile] = useState<{
    blob: Blob;
    ext: 'mp4' | 'webm';
    filename: string;
  } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [serverJob, setServerJob] = useState<RenderJobRecord | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isCuttingSilence, setIsCuttingSilence] = useState(false);
  const [isExtractingAudio, setIsExtractingAudio] = useState(false);

  const experienceMode = useUiStore((s) => s.experienceMode);
  const runtimeMode = useUiStore((s) => s.runtimeMode);
  const setRuntimeMode = useUiStore((s) => s.setRuntimeMode);
  const clipboardStyle = useUiStore((s) => s.clipboardStyle);
  const setClipboardStyle = useUiStore((s) => s.setClipboardStyle);

  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds);
  const clips = useTimelineStore((s) => s.clips);
  const tracks = useTimelineStore((s) => s.tracks);
  const trackOrder = useTimelineStore((s) => s.trackOrder);
  const resolution = useTimelineStore((s) => s.resolution);
  const canvasBackground = useTimelineStore((s) => s.canvasBackground);
  const selectedClip =
    selectedClipIds.length === 1 ? clips[selectedClipIds[0]] : undefined;
  const mainTrackId = getMainVideoTrackId(trackOrder, tracks);
  const upperVisualTrackIds = trackOrder.filter(
    (tid) => tid !== mainTrackId && tracks[tid]?.type !== 'audio'
  );
  const selectedLayerIdx = selectedClip
    ? upperVisualTrackIds.indexOf(selectedClip.trackId)
    : -1;

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (runtimeMode === 'server') {
      void fetchServerCapabilities().then(setServerCaps);
    } else {
      setServerCaps(null);
      setRenderMode('client-webcodecs');
    }
  }, [runtimeMode]);

  const handleSaveServerUrl = async () => {
    const caps = await testAndConnectServer(serverUrlInput);
    setServerCaps(caps);
    if (caps?.status === 'online') {
      setRuntimeMode('server', true);
    }
  };

  const getEffect = (type: string, fallback: number) => {
    const found = selectedClip?.effects.find((e) => e.type === type);
    return found ? found.value : fallback;
  };

  const refreshCanvasPreview = () => {
    const pb = usePlaybackStore.getState();
    mediaRuntime.renderFrameAt(pb.currentTime, pb.isPlaying);
  };

  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 2600);
  };

  const handleAutoCutSilence = async () => {
    if (!selectedClip) return;
    setIsCuttingSilence(true);
    try {
      const doc = useTimelineStore.getState().exportProjectDocument();
      const extracted = await extractProjectAudioPcm16k(doc, selectedClip.id);
      const segs = detectSpeechSegmentsVad(extracted.pcm, extracted.sampleRate, {
        minSpeechSec: 0.25,
        minSilenceSec: 0.35,
      });
      if (segs.length === 0) {
        showNotice('Tidak ada suara terdeteksi pada klip ini.');
        return;
      }
      const kept = useTimelineStore
        .getState()
        .autoCutSilenceOnClip(selectedClip.id, segs);
      showNotice(
        kept > 0
          ? `Bagian hening dipotong! Tersisa ${kept} klip bicara rapat.`
          : 'Klip sudah bersih tanpa jeda panjang.'
      );
      refreshCanvasPreview();
    } catch (err) {
      showNotice((err as Error).message);
    } finally {
      setIsCuttingSilence(false);
    }
  };

  const handleExtractClipAudioWav = async (downloadToo = false) => {
    if (!selectedClip) return;
    const store = useTimelineStore.getState();
    const asset = store.assets[selectedClip.assetId];
    if (!asset) return;

    setIsExtractingAudio(true);
    try {
      const { wavBlob, filename } = await extractAudioFromMediaAsset(asset, {
        clip: selectedClip,
      });
      const wavAsset = await probeAndRegisterMediaFile(wavBlob, filename, 'audio/wav');
      store.linkExtractedAudioAsset(selectedClip.id, wavAsset, selectedClip.start);
      if (downloadToo) {
        await saveBlobToDevice(wavBlob, filename);
      }
      showNotice(
        downloadToo
          ? `Audio ${filename} diekstrak & diunduh!`
          : `Audio ${filename} diekstrak ke Track Audio!`
      );
    } catch {
      const audId = store.detachAudioFromClip(selectedClip.id);
      if (audId) {
        showNotice('Audio dipisah ke Track Audio (mode track langsung)!');
      }
    } finally {
      setIsExtractingAudio(false);
    }
  };

  // 9-Grid CapCut Quick Placement helper
  const applyGridPosition = (col: -1 | 0 | 1, row: -1 | 0 | 1) => {
    if (!selectedClip) return;
    const cw = resolution.width || 1920;
    const ch = resolution.height || 1080;
    const x = Math.round(col * cw * 0.28);
    const y = Math.round(row * ch * 0.32);
    useTimelineStore.getState().updateClipTransform(selectedClip.id, { x, y });
    refreshCanvasPreview();
  };

  const handleClientExport = async () => {
    setExportError(null);
    setClientExportFile(null);
    setIsExporting(true);
    try {
      const project = useTimelineStore.getState().exportProjectDocument();
      const blob = await exportProjectClientSide({
        project,
        onProgress: setClientProgress,
      });
      const ext = blob.type.includes('webm') ? 'webm' : 'mp4';
      const safeName = (project.name || 'swave-export').replace(
        /[^\w.-]/g,
        '_'
      );
      setClientExportFile({
        blob,
        ext,
        filename: `${safeName}.${ext}`,
      });
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleServerExport = async () => {
    setExportError(null);
    setIsExporting(true);
    try {
      const store = useTimelineStore.getState();
      for (const clip of Object.values(store.clips)) {
        if (clip.type === 'text') continue;
        const asset = store.assets[clip.assetId];
        if (!asset || asset.serverUrl) continue;
        const blob = mediaRegistry.getBlob(asset.id);
        if (!blob) continue;

        const uploaded = await uploadBlobInChunks({
          blob,
          asset,
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
      const job = await startServerRenderJob({ project, quality: 'standard' });
      setServerJob(job);

      if (job.status === 'queued' || job.status === 'processing') {
        const poll = async () => {
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
    } catch (err) {
      setExportError((err as Error).message);
      setIsExporting(false);
    }
  };

  const containerClass =
    mode === 'sheet'
      ? 'flex h-full w-full flex-col bg-[#202026]'
      : 'flex h-full w-full flex-col bg-[#18181C]';

  const clipAnim = selectedClip?.animation || DEFAULT_CLIP_ANIMATION;
  const clipSpeed = selectedClip?.speed || 1;
  const clipVolume = selectedClip?.volume ?? 1;
  const clipFadeIn = selectedClip?.fadeIn ?? 0;
  const clipFadeOut = selectedClip?.fadeOut ?? 0;

  return (
    <aside className={containerClass}>
      {/* Tab Header (omitted inside mobile inspector sheet to maximize slider space) */}
      {(mode !== 'sheet' || initialTab === 'export') && (
        <div className="flex items-center border-b border-[#2A2A32] bg-[#18181C]">
          <div className="grid flex-1 grid-cols-2">
            <button
              type="button"
              onClick={() => setActiveTab('inspector')}
              className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition ${
                activeTab === 'inspector'
                  ? 'border-b-2 border-[#00E5FF] bg-[#242429]/60 text-[#00E5FF]'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Inspektor</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('export')}
              className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition ${
                activeTab === 'export'
                  ? 'border-b-2 border-[#00E5FF] bg-[#242429]/60 text-[#00E5FF]'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Download className="h-3.5 w-3.5" />
              <span>Hybrid Export</span>
            </button>
          </div>
          {onClosePanel && (
            <button
              type="button"
              onClick={onClosePanel}
              className="mr-2 rounded p-1.5 text-zinc-400 hover:bg-[#242429] hover:text-white"
              title="Tutup panel inspektor"
              aria-label="Tutup panel inspektor"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto p-3.5">
        {activeTab === 'inspector' ? (
          !selectedClip ? (
            <div className="space-y-5 py-3">
              <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4 text-center text-xs text-zinc-400">
                <SlidersHorizontal className="mb-2 h-6 w-6 text-cyan-400" />
                <p>
                  Ketuk langsung teks/video di kanvas atau di timeline untuk
                  menggeser, memperbesar, memutar, atau mengedit gaya &amp; efek.
                </p>
              </div>

              {/* Canvas Background Picker */}
              <div className="space-y-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="flex items-center gap-1.5">
                  <Palette className="h-3.5 w-3.5 text-cyan-400" />
                  <h3 className="text-[11px] font-semibold tracking-wider text-zinc-300 uppercase">
                    Warna Latar Kanvas
                  </h3>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {CANVAS_BG_PRESETS.map((bg) => (
                    <button
                      key={bg.id}
                      type="button"
                      onClick={() =>
                        useTimelineStore.getState().setCanvasBackground(bg.color)
                      }
                      className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition ${
                        canvasBackground === bg.color
                          ? 'border-cyan-400 bg-cyan-950/30 text-cyan-200'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/20"
                        style={{ backgroundColor: bg.color }}
                      />
                      <span className="truncate">{bg.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 1. IF TEXT / STICKER CLIP: Put CapCut Text Editor & 9-Grid Placement RIGHT AT THE TOP! */}
              {selectedClip.type === 'text' && selectedClip.textStyle && (
                <div className="space-y-3.5 rounded-xl border border-violet-500/30 bg-violet-950/15 p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[11px] font-bold tracking-wider text-violet-300 uppercase">
                      Konten &amp; Gaya Teks
                    </h3>
                    <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-violet-200">
                      Geser Langsung di Video
                    </span>
                  </div>

                  {/* Direct Text Input */}
                  <textarea
                    rows={2}
                    value={selectedClip.textStyle.content}
                    onChange={(e) => {
                      useTimelineStore
                        .getState()
                        .updateClipTextStyle(selectedClip.id, {
                          content: e.target.value,
                        });
                      refreshCanvasPreview();
                    }}
                    placeholder="Ketik teks overlay atau subtitle..."
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2.5 text-sm font-semibold text-white outline-none focus:border-violet-400"
                  />

                  {/* 1-Click CapCut Position Presets (9-Grid Penempatan Cepat) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-zinc-300">
                      <span className="flex items-center gap-1 font-semibold">
                        <Move className="h-3 w-3 text-cyan-400" />
                        Penempatan Cepat (Atau Geser di Layar Video)
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => applyGridPosition(-1, -1)}
                        className="rounded border border-zinc-800 bg-zinc-900 py-1.5 text-[10px] text-zinc-300 hover:border-cyan-400 hover:text-white"
                      >
                        ↖ Kiri Atas
                      </button>
                      <button
                        type="button"
                        onClick={() => applyGridPosition(0, -1)}
                        className="rounded border border-zinc-800 bg-zinc-900 py-1.5 text-[10px] font-semibold text-cyan-300 hover:border-cyan-400"
                      >
                        ↑ Judul Atas
                      </button>
                      <button
                        type="button"
                        onClick={() => applyGridPosition(1, -1)}
                        className="rounded border border-zinc-800 bg-zinc-900 py-1.5 text-[10px] text-zinc-300 hover:border-cyan-400 hover:text-white"
                      >
                        ↗ Kanan Atas
                      </button>
                      <button
                        type="button"
                        onClick={() => applyGridPosition(-1, 0)}
                        className="rounded border border-zinc-800 bg-zinc-900 py-1.5 text-[10px] text-zinc-300 hover:border-cyan-400 hover:text-white"
                      >
                        ← Kiri Tengah
                      </button>
                      <button
                        type="button"
                        onClick={() => applyGridPosition(0, 0)}
                        className="rounded border border-zinc-800 bg-zinc-900 py-1.5 text-[10px] font-semibold text-white hover:border-cyan-400"
                      >
                        ● Tengah Layar
                      </button>
                      <button
                        type="button"
                        onClick={() => applyGridPosition(1, 0)}
                        className="rounded border border-zinc-800 bg-zinc-900 py-1.5 text-[10px] text-zinc-300 hover:border-cyan-400 hover:text-white"
                      >
                        → Kanan Tengah
                      </button>
                      <button
                        type="button"
                        onClick={() => applyGridPosition(-1, 1)}
                        className="rounded border border-zinc-800 bg-zinc-900 py-1.5 text-[10px] text-zinc-300 hover:border-cyan-400 hover:text-white"
                      >
                        ↙ Kiri Bawah
                      </button>
                      <button
                        type="button"
                        onClick={() => applyGridPosition(0, 1)}
                        className="rounded border border-yellow-500/40 bg-yellow-500/15 py-1.5 text-[10px] font-bold text-yellow-300 hover:border-yellow-400"
                      >
                        ↓ Subtitle Bawah
                      </button>
                      <button
                        type="button"
                        onClick={() => applyGridPosition(1, 1)}
                        className="rounded border border-zinc-800 bg-zinc-900 py-1.5 text-[10px] text-zinc-300 hover:border-cyan-400 hover:text-white"
                      >
                        ↘ Kanan Bawah
                      </button>
                    </div>
                  </div>

                  {/* Font Family, Size Slider & Alignment */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <select
                        value={selectedClip.textStyle.fontFamily}
                        onChange={(e) => {
                          useTimelineStore
                            .getState()
                            .updateClipTextStyle(selectedClip.id, {
                              fontFamily: e.target.value,
                            });
                          refreshCanvasPreview();
                        }}
                        className="min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-violet-400"
                      >
                        {STUDIO_FONTS.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => {
                          useTimelineStore
                            .getState()
                            .updateClipTextStyle(selectedClip.id, {
                              bold: !selectedClip.textStyle?.bold,
                            });
                          refreshCanvasPreview();
                        }}
                        className={`rounded border p-1.5 ${
                          selectedClip.textStyle.bold
                            ? 'border-violet-400 bg-violet-500/25 text-violet-200'
                            : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                        }`}
                        title="Tebal (Bold)"
                      >
                        <Bold className="h-3.5 w-3.5" />
                      </button>

                      {(
                        [
                          { id: 'left', icon: AlignLeft },
                          { id: 'center', icon: AlignCenter },
                          { id: 'right', icon: AlignRight },
                        ] as const
                      ).map((al) => {
                        const Icon = al.icon;
                        return (
                          <button
                            key={al.id}
                            type="button"
                            onClick={() => {
                              useTimelineStore
                                .getState()
                                .updateClipTextStyle(selectedClip.id, {
                                  align: al.id,
                                });
                              refreshCanvasPreview();
                            }}
                            className={`rounded border p-1.5 ${
                              selectedClip.textStyle?.align === al.id
                                ? 'border-violet-400 bg-violet-500/25 text-violet-200'
                                : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </button>
                        );
                      })}
                    </div>

                    <SliderRow
                      label="Ukuran Teks (Font Size)"
                      value={selectedClip.textStyle.fontSize}
                      min={18}
                      max={160}
                      step={2}
                      suffix="px"
                      onChange={(fontSize) => {
                        useTimelineStore
                          .getState()
                          .updateClipTextStyle(selectedClip.id, { fontSize });
                        refreshCanvasPreview();
                      }}
                    />
                  </div>

                  {/* 1-Click Color Swatches */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-zinc-400">
                      <span>Warna Teks Cepat:</span>
                      <input
                        type="color"
                        value={selectedClip.textStyle.color}
                        onChange={(e) => {
                          useTimelineStore
                            .getState()
                            .updateClipTextStyle(selectedClip.id, {
                              color: e.target.value,
                            });
                          refreshCanvasPreview();
                        }}
                        className="h-5 w-8 cursor-pointer rounded border border-zinc-700 bg-zinc-900"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {TEXT_SWATCHES.map((sw) => (
                        <button
                          key={sw.color}
                          type="button"
                          onClick={() => {
                            useTimelineStore
                              .getState()
                              .updateClipTextStyle(selectedClip.id, {
                                color: sw.color,
                              });
                            refreshCanvasPreview();
                          }}
                          style={{ backgroundColor: sw.color }}
                          title={sw.label}
                          className={`h-6 w-6 rounded-full border transition ${
                            selectedClip.textStyle?.color === sw.color
                              ? 'scale-110 border-white ring-2 ring-cyan-400'
                              : 'border-white/30 hover:scale-105'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Stroke Outline (Garis Tepi CapCut) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-zinc-400">
                      <span>Garis Tepi (Outline Stroke):</span>
                      <input
                        type="color"
                        value={selectedClip.textStyle.strokeColor || '#000000'}
                        onChange={(e) => {
                          useTimelineStore
                            .getState()
                            .updateClipTextStyle(selectedClip.id, {
                              strokeColor: e.target.value,
                            });
                          refreshCanvasPreview();
                        }}
                        className="h-5 w-8 cursor-pointer rounded border border-zinc-700 bg-zinc-900"
                      />
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { label: 'Tanpa', val: 0 },
                        { label: 'Tipis', val: 4 },
                        { label: 'Sedang', val: 8 },
                        { label: 'Tebal', val: 12 },
                      ].map((st) => (
                        <button
                          key={st.label}
                          type="button"
                          onClick={() => {
                            useTimelineStore
                              .getState()
                              .updateClipTextStyle(selectedClip.id, {
                                strokeWidth: st.val,
                              });
                            refreshCanvasPreview();
                          }}
                          className={`rounded border py-1 text-[10px] font-medium ${
                            (selectedClip.textStyle?.strokeWidth ?? 0) === st.val
                              ? 'border-violet-400 bg-violet-500/20 text-violet-200'
                              : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Background Box / Bubble (Kotak Latar Teks) */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-zinc-400">
                      Kotak Latar (Background Bubble):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {BG_SWATCHES.map((bg) => (
                        <button
                          key={bg.label}
                          type="button"
                          onClick={() => {
                            useTimelineStore
                              .getState()
                              .updateClipTextStyle(selectedClip.id, {
                                backgroundColor: bg.color,
                              });
                            refreshCanvasPreview();
                          }}
                          className={`rounded border px-2 py-1 text-[10px] font-medium ${
                            selectedClip.textStyle?.backgroundColor === bg.color
                              ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                              : 'border-zinc-800 bg-zinc-900 text-zinc-300'
                          }`}
                        >
                          {bg.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quick CapCut Style Templates */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-zinc-400">
                      Ganti Template Gaya Teks (1-Klik):
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {TEXT_PRESETS.map((tp) => (
                        <button
                          key={tp.id}
                          type="button"
                          onClick={() => {
                            useTimelineStore
                              .getState()
                              .updateClipTextStyle(selectedClip.id, tp.style);
                            refreshCanvasPreview();
                          }}
                          className="truncate rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-left text-[10px] font-semibold text-zinc-200 hover:border-violet-400"
                        >
                          {tp.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Karaoke Word Highlight + Apply Style to All Subtitles */}
                  <div className="space-y-2 border-t border-violet-500/20 pt-2.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-zinc-300">Sorot Kata Aktif (Karaoke):</span>
                      <button
                        type="button"
                        onClick={() => {
                          useTimelineStore
                            .getState()
                            .updateClipTextStyle(selectedClip.id, {
                              highlightColor: selectedClip.textStyle?.highlightColor
                                ? undefined
                                : '#facc15',
                            });
                          refreshCanvasPreview();
                        }}
                        className={`rounded border px-2 py-0.5 font-semibold ${
                          selectedClip.textStyle.highlightColor
                            ? 'border-yellow-400 bg-yellow-500/20 text-yellow-200'
                            : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                        }`}
                      >
                        {selectedClip.textStyle.highlightColor ? 'Aktif' : 'Nonaktif'}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const { content: _c, ...styleWithoutContent } =
                          selectedClip.textStyle!;
                        useTimelineStore.getState().applySubtitleStyleToAll(
                          styleWithoutContent,
                          {
                            x: selectedClip.transforms.x,
                            y: selectedClip.transforms.y,
                            scale: selectedClip.transforms.scale,
                          },
                          selectedClip.animation
                        );
                        refreshCanvasPreview();
                        showNotice('Gaya & posisi diterapkan ke semua subtitle!');
                      }}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 py-1.5 text-[11px] font-bold text-cyan-200 hover:bg-cyan-500/25"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Terapkan Gaya ke Semua Subtitle</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Overlay PIP & Layer Stack Ordering (>1 Overlay CapCut Control) */}
              {selectedClip.type !== 'audio' && selectedLayerIdx >= 0 && (
                <div className="space-y-2.5 rounded-xl border border-amber-500/30 bg-amber-950/15 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-amber-400" />
                      <h3 className="text-[11px] font-bold tracking-wider text-amber-200 uppercase">
                        Lapisan Overlay (Layer {selectedLayerIdx + 1}/
                        {upperVisualTrackIds.length})
                      </h3>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={selectedLayerIdx >= upperVisualTrackIds.length - 1}
                        onClick={() => {
                          useTimelineStore
                            .getState()
                            .moveClipLayer(selectedClip.id, 'up');
                          refreshCanvasPreview();
                        }}
                        className="inline-flex items-center gap-0.5 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-200 hover:border-cyan-400 disabled:opacity-35"
                        title="Majukan overlay ini ke depan overlay lain"
                      >
                        <ArrowUp className="h-3 w-3 text-[#00E5FF]" />
                        <span>Depan</span>
                      </button>
                      <button
                        type="button"
                        disabled={selectedLayerIdx <= 0}
                        onClick={() => {
                          useTimelineStore
                            .getState()
                            .moveClipLayer(selectedClip.id, 'down');
                          refreshCanvasPreview();
                        }}
                        className="inline-flex items-center gap-0.5 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-200 hover:border-cyan-400 disabled:opacity-35"
                        title="Mundurkan overlay ini ke belakang overlay lain"
                      >
                        <ArrowDown className="h-3 w-3 text-amber-300" />
                        <span>Belakang</span>
                      </button>
                    </div>
                  </div>

                  {selectedClip.type === 'overlay' && (
                    <div className="space-y-2">
                      <SliderRow
                        label="Skala Gambar / PIP"
                        value={Number((selectedClip.transforms.scale || 1).toFixed(2))}
                        min={0.15}
                        max={2.5}
                        step={0.05}
                        suffix="x"
                        onChange={(scale) => {
                          useTimelineStore
                            .getState()
                            .updateClipTransform(selectedClip.id, { scale });
                          refreshCanvasPreview();
                        }}
                      />
                      <SliderRow
                        label="Opasitas (Transparansi)"
                        value={Math.round((selectedClip.transforms.opacity ?? 1) * 100)}
                        min={0}
                        max={100}
                        step={1}
                        suffix="%"
                        onChange={(pct) => {
                          useTimelineStore
                            .getState()
                            .updateClipTransform(selectedClip.id, { opacity: pct / 100 });
                          refreshCanvasPreview();
                        }}
                      />
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { label: 'Kecil (0.45x)', scale: 0.45 },
                          { label: 'Sedang (0.65x)', scale: 0.65 },
                          { label: 'Penuh (1.0x)', scale: 1 },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              useTimelineStore
                                .getState()
                                .updateClipTransform(selectedClip.id, {
                                  scale: preset.scale,
                                });
                              refreshCanvasPreview();
                            }}
                            className="rounded border border-zinc-800 bg-zinc-900 py-1 text-[10px] text-zinc-300 hover:border-amber-400"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Clip Header + CapCut Quick Actions */}
              <div className="space-y-2.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-zinc-100">
                    {selectedClip.name}
                  </p>
                  <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-300">
                    {clipSpeed}x
                  </span>
                </div>
                <p className="font-mono text-[10px] text-zinc-400">
                  Start {selectedClip.start.toFixed(2)}s · Dur{' '}
                  {selectedClip.duration.toFixed(2)}s · Offset{' '}
                  {selectedClip.offset.toFixed(2)}s
                </p>

                {selectedClip.type !== 'audio' && (
                  <div className="grid grid-cols-4 gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        useTimelineStore.getState().flipClip(selectedClip.id, 'h');
                        refreshCanvasPreview();
                      }}
                      className={`flex flex-col items-center justify-center gap-0.5 rounded border py-1.5 text-[10px] font-medium transition ${
                        selectedClip.transforms.flipH
                          ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                      }`}
                      title="Mirror Horizontal"
                    >
                      <FlipHorizontal2 className="h-3.5 w-3.5" />
                      <span>Mirror H</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        useTimelineStore.getState().flipClip(selectedClip.id, 'v');
                        refreshCanvasPreview();
                      }}
                      className={`flex flex-col items-center justify-center gap-0.5 rounded border py-1.5 text-[10px] font-medium transition ${
                        selectedClip.transforms.flipV
                          ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                      }`}
                      title="Flip Vertikal"
                    >
                      <FlipVertical2 className="h-3.5 w-3.5" />
                      <span>Flip V</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        useTimelineStore
                          .getState()
                          .rotateClip90(selectedClip.id);
                        refreshCanvasPreview();
                      }}
                      className="flex flex-col items-center justify-center gap-0.5 rounded border border-zinc-800 bg-zinc-950 py-1.5 text-[10px] font-medium text-zinc-300 hover:border-zinc-700"
                      title="Putar 90 Derajat"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                      <span>Putar 90°</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        useTimelineStore
                          .getState()
                          .freezeClipAtTime(
                            selectedClip.id,
                            usePlaybackStore.getState().currentTime
                          )
                      }
                      className="flex flex-col items-center justify-center gap-0.5 rounded border border-zinc-800 bg-zinc-950 py-1.5 text-[10px] font-medium text-cyan-300 hover:border-cyan-500/50"
                      title="Bekukan Frame (Freeze 1.5s)"
                    >
                      <Snowflake className="h-3.5 w-3.5" />
                      <span>Freeze</span>
                    </button>
                  </div>
                )}

                {/* Smart Creator / Pro Actions: Auto-Cut Silence, Detach Audio, Copy/Paste Style */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedClip.type !== 'text' && (
                    <button
                      type="button"
                      disabled={isCuttingSilence}
                      onClick={() => void handleAutoCutSilence()}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-violet-500/40 bg-violet-500/15 px-2 py-1 text-[10px] font-semibold text-violet-200 hover:bg-violet-500/25 disabled:opacity-50"
                      title="Potong jeda diam/hening otomatis dengan deteksi suara (VAD)"
                    >
                      <Scissors className="h-3 w-3" />
                      <span>
                        {isCuttingSilence ? 'Menganalisis...' : 'Potong Hening'}
                      </span>
                    </button>
                  )}

                  {selectedClip.type === 'video' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const audId = useTimelineStore
                            .getState()
                            .detachAudioFromClip(selectedClip.id);
                          if (audId) showNotice('Audio berhasil dipisah ke Track Audio!');
                        }}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/25"
                        title="Pisahkan suara video ke track audio terpisah (J-Cut / L-Cut)"
                      >
                        <Volume2 className="h-3 w-3" />
                        <span>Pisah Audio</span>
                      </button>
                      <button
                        type="button"
                        disabled={isExtractingAudio}
                        onClick={() => void handleExtractClipAudioWav(true)}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/15 px-2 py-1 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50"
                        title="Ekstrak suara video menjadi file .WAV mandiri & unduh"
                      >
                        <FileAudio className="h-3 w-3" />
                        <span>{isExtractingAudio ? 'Ekstrak...' : 'Ekstrak .WAV'}</span>
                      </button>
                    </>
                  )}

                  {experienceMode === 'pro' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const { content: _c, ...restText } =
                            selectedClip.textStyle || ({} as NonNullable<typeof selectedClip.textStyle>);
                          setClipboardStyle({
                            filterPreset: selectedClip.filterPreset,
                            blendMode: selectedClip.blendMode,
                            chromaKey: selectedClip.chromaKey
                              ? { ...selectedClip.chromaKey }
                              : undefined,
                            crop: selectedClip.transforms.crop
                              ? { ...selectedClip.transforms.crop }
                              : undefined,
                            cornerRadius: selectedClip.transforms.cornerRadius,
                            effects: selectedClip.effects.map((e) => ({ ...e })),
                            animation: selectedClip.animation
                              ? { ...selectedClip.animation }
                              : undefined,
                            textStyle: selectedClip.textStyle ? restText : undefined,
                          });
                          showNotice('Gaya klip disalin!');
                        }}
                        className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[10px] text-zinc-300 hover:border-cyan-400"
                      >
                        <Copy className="h-3 w-3" />
                        <span>Salin Gaya</span>
                      </button>
                      {clipboardStyle && (
                        <button
                          type="button"
                          onClick={() => {
                            useTimelineStore
                              .getState()
                              .pasteClipStyle(selectedClip.id, clipboardStyle);
                            refreshCanvasPreview();
                            showNotice('Gaya ditempel!');
                          }}
                          className="inline-flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/15 px-2 py-1 text-[10px] font-semibold text-cyan-200"
                        >
                          <ClipboardPaste className="h-3 w-3" />
                          <span>Tempel</span>
                        </button>
                      )}
                    </>
                  )}
                </div>

                {actionNotice && (
                  <p className="rounded bg-cyan-950/60 px-2 py-1 text-[10px] text-cyan-200">
                    {actionNotice}
                  </p>
                )}
              </div>

              {/* CapCut In/Out Animations */}
              {selectedClip.type !== 'audio' && (
                <div className="space-y-2.5 border-b border-zinc-800 pb-4">
                  <div className="flex items-center gap-1.5">
                    <Wand2 className="h-3.5 w-3.5 text-violet-400" />
                    <h3 className="text-[11px] font-semibold tracking-wider text-zinc-300 uppercase">
                      Animasi Masuk &amp; Keluar
                    </h3>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] text-zinc-400">
                      Animasi Masuk (In):
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      {ANIMATION_PRESETS.map((ap) => (
                        <button
                          key={`in-${ap.id}`}
                          type="button"
                          onClick={() =>
                            useTimelineStore
                              .getState()
                              .setClipAnimation(selectedClip.id, { in: ap.id })
                          }
                          className={`rounded border py-1 text-[10px] font-medium transition ${
                            clipAnim.in === ap.id
                              ? 'border-violet-400 bg-violet-500/20 text-violet-200'
                              : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {ap.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] text-zinc-400">
                      Animasi Keluar (Out):
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      {ANIMATION_PRESETS.map((ap) => (
                        <button
                          key={`out-${ap.id}`}
                          type="button"
                          onClick={() =>
                            useTimelineStore
                              .getState()
                              .setClipAnimation(selectedClip.id, { out: ap.id })
                          }
                          className={`rounded border py-1 text-[10px] font-medium transition ${
                            clipAnim.out === ap.id
                              ? 'border-violet-400 bg-violet-500/20 text-violet-200'
                              : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {ap.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <SliderRow
                    label="Durasi Animasi"
                    value={clipAnim.inDuration || 0.35}
                    min={0.1}
                    max={1.5}
                    step={0.05}
                    suffix="s"
                    onChange={(dur) =>
                      useTimelineStore
                        .getState()
                        .setClipAnimation(selectedClip.id, {
                          inDuration: dur,
                          outDuration: dur,
                        })
                    }
                  />
                </div>
              )}

              {/* Speed Control (CapCut Kecepatan) */}
              <div className="space-y-2.5 border-b border-zinc-800 pb-4">
                <div className="flex items-center gap-1.5">
                  <Gauge className="h-3.5 w-3.5 text-cyan-400" />
                  <h3 className="text-[11px] font-semibold tracking-wider text-zinc-300 uppercase">
                    Kecepatan (Speed)
                  </h3>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {[0.5, 1, 1.5, 2, 4].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() =>
                        useTimelineStore
                          .getState()
                          .setClipSpeed(selectedClip.id, spd)
                      }
                      className={`rounded border py-1 font-mono text-[11px] font-semibold transition ${
                        Math.abs(clipSpeed - spd) < 0.05
                          ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
                <SliderRow
                  label="Speed Halus"
                  value={clipSpeed}
                  min={0.25}
                  max={4}
                  step={0.05}
                  suffix="x"
                  onChange={(val) =>
                    useTimelineStore
                      .getState()
                      .setClipSpeed(selectedClip.id, val)
                  }
                />
              </div>

              {/* Audio Volume & Fade In/Out */}
              {selectedClip.type !== 'text' && (
                <div className="space-y-2.5 border-b border-zinc-800 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {clipVolume === 0 ? (
                        <VolumeX className="h-3.5 w-3.5 text-rose-400" />
                      ) : (
                        <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                      )}
                      <h3 className="text-[11px] font-semibold tracking-wider text-zinc-300 uppercase">
                        Audio Klip & Fade
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        useTimelineStore
                          .getState()
                          .setClipAudioParams(selectedClip.id, {
                            volume: clipVolume === 0 ? 1 : 0,
                          })
                      }
                      className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${
                        clipVolume === 0
                          ? 'border-rose-500/40 bg-rose-500/15 text-rose-200'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-cyan-400'
                      }`}
                    >
                      {clipVolume === 0 ? 'Unmute' : 'Mute Klip'}
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { label: '0%', v: 0 },
                      { label: 'BGM 25%', v: 0.25 },
                      { label: '100%', v: 1 },
                      { label: '160%', v: 1.6 },
                    ].map((g) => (
                      <button
                        key={g.label}
                        type="button"
                        onClick={() =>
                          useTimelineStore
                            .getState()
                            .setClipAudioParams(selectedClip.id, { volume: g.v })
                        }
                        className={`rounded border py-1 text-[10px] font-medium ${
                          Math.abs(clipVolume - g.v) < 0.04
                            ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                            : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                  <SliderRow
                    label="Volume Klip"
                    value={clipVolume}
                    min={0}
                    max={2}
                    step={0.05}
                    suffix="x"
                    onChange={(volume) =>
                      useTimelineStore
                        .getState()
                        .setClipAudioParams(selectedClip.id, { volume })
                    }
                  />
                  <SliderRow
                    label="Fade In (Suara Masuk)"
                    value={clipFadeIn}
                    min={0}
                    max={Math.max(0.5, selectedClip.duration / 2)}
                    step={0.1}
                    suffix="s"
                    onChange={(fadeIn) =>
                      useTimelineStore
                        .getState()
                        .setClipAudioParams(selectedClip.id, { fadeIn })
                    }
                  />
                  <SliderRow
                    label="Fade Out (Suara Keluar)"
                    value={clipFadeOut}
                    min={0}
                    max={Math.max(0.5, selectedClip.duration / 2)}
                    step={0.1}
                    suffix="s"
                    onChange={(fadeOut) =>
                      useTimelineStore
                        .getState()
                        .setClipAudioParams(selectedClip.id, { fadeOut })
                    }
                  />
                </div>
              )}

              {/* Filter Presets (Always Visible & Easy for All Users) */}
              {selectedClip.type !== 'audio' && selectedClip.type !== 'text' && (
                <div className="space-y-2.5 border-b border-zinc-800 pb-4">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                    <h3 className="text-[11px] font-semibold tracking-wider text-zinc-300 uppercase">
                      {experienceMode === 'pro'
                        ? 'Filter LUT & WebGL2 Shaders'
                        : 'Preset Filter Warna'}
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 pb-1">
                    {FILTER_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          useTimelineStore
                            .getState()
                            .applyFilterPreset(
                              selectedClip.id,
                              preset.id,
                              preset.effects
                            );
                          refreshCanvasPreview();
                        }}
                        className={`truncate rounded border px-2 py-1 text-left text-[10px] font-medium transition ${
                          (selectedClip.filterPreset || 'normal') === preset.id
                            ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                            : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const count = useTimelineStore
                        .getState()
                        .applyEffectsToAllVisualClips(selectedClip.id);
                      refreshCanvasPreview();
                      showNotice(
                        count > 0
                          ? `Filter, Blend & Warna disalin ke ${count} klip visual lain!`
                          : 'Tambahkan klip visual lain untuk menyinkronkan warna.'
                      );
                    }}
                    className="w-full rounded border border-cyan-500/35 bg-cyan-500/10 py-1 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-500/20"
                  >
                    Terapkan Filter & Warna ke Semua Klip
                  </button>
                </div>
              )}

              {/* Crop, Corner Radius, Blend Mode & Chroma Key (Green Screen) */}
              {selectedClip.type !== 'audio' && selectedClip.type !== 'text' && (
                <div className="space-y-3 border-b border-zinc-800 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Crop className="h-3.5 w-3.5 text-amber-400" />
                      <h3 className="text-[11px] font-semibold tracking-wider text-zinc-300 uppercase">
                        Crop, Sudut & Blend
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        useTimelineStore
                          .getState()
                          .updateClipCrop(selectedClip.id, DEFAULT_CLIP_CROP);
                        useTimelineStore
                          .getState()
                          .updateClipTransform(selectedClip.id, { cornerRadius: 0 });
                        refreshCanvasPreview();
                      }}
                      className="text-[10px] text-zinc-400 hover:text-cyan-300"
                    >
                      Reset Crop
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { key: 'top', label: 'Crop Atas' },
                        { key: 'bottom', label: 'Crop Bawah' },
                        { key: 'left', label: 'Crop Kiri' },
                        { key: 'right', label: 'Crop Kanan' },
                      ] as const
                    ).map((edge) => (
                      <SliderRow
                        key={edge.key}
                        label={edge.label}
                        value={selectedClip.transforms.crop?.[edge.key] ?? 0}
                        min={0}
                        max={45}
                        step={1}
                        suffix="%"
                        onChange={(val) => {
                          useTimelineStore
                            .getState()
                            .updateClipCrop(selectedClip.id, { [edge.key]: val });
                          refreshCanvasPreview();
                        }}
                      />
                    ))}
                  </div>

                  <SliderRow
                    label="Sudut Melengkung (Rounded)"
                    value={selectedClip.transforms.cornerRadius ?? 0}
                    min={0}
                    max={50}
                    step={1}
                    suffix="%"
                    onChange={(cornerRadius) => {
                      useTimelineStore
                        .getState()
                        .updateClipTransform(selectedClip.id, { cornerRadius });
                      refreshCanvasPreview();
                    }}
                  />

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                      <Layers className="h-3 w-3 text-violet-400" />
                      <span>Blend Mode Layer</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          'normal',
                          'screen',
                          'multiply',
                          'overlay',
                          'lighten',
                          'darken',
                        ] as BlendMode[]
                      ).map((bm) => (
                        <button
                          key={bm}
                          type="button"
                          onClick={() => {
                            useTimelineStore
                              .getState()
                              .setClipBlendMode(selectedClip.id, bm);
                            refreshCanvasPreview();
                          }}
                          className={`rounded border px-1.5 py-1 text-[10px] font-medium capitalize ${
                            (selectedClip.blendMode || 'normal') === bm
                              ? 'border-violet-400 bg-violet-500/20 text-violet-200'
                              : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {bm}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Chroma Key / Green Screen Removal */}
                  <div className="space-y-2 rounded-lg border border-emerald-500/25 bg-emerald-950/15 p-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-200">
                        <Pipette className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Chroma Key (Green Screen)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          useTimelineStore.getState().setClipChromaKey(
                            selectedClip.id,
                            {
                              enabled: !selectedClip.chromaKey?.enabled,
                              color: selectedClip.chromaKey?.color || DEFAULT_CHROMA_KEY.color,
                              tolerance: selectedClip.chromaKey?.tolerance ?? DEFAULT_CHROMA_KEY.tolerance,
                            }
                          );
                          refreshCanvasPreview();
                        }}
                        className={`rounded border px-2 py-0.5 text-[10px] font-bold ${
                          selectedClip.chromaKey?.enabled
                            ? 'border-emerald-400 bg-emerald-500/25 text-emerald-200'
                            : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                        }`}
                      >
                        {selectedClip.chromaKey?.enabled ? 'Aktif' : 'Nonaktif'}
                      </button>
                    </div>

                    {selectedClip.chromaKey?.enabled && (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between gap-2 text-[10px]">
                          <span className="text-zinc-400">Warna Kunci:</span>
                          <div className="flex items-center gap-1.5">
                            {[
                              { label: 'Green', color: '#00b140' },
                              { label: 'Blue', color: '#0047bb' },
                            ].map((sw) => (
                              <button
                                key={sw.label}
                                type="button"
                                onClick={() => {
                                  useTimelineStore
                                    .getState()
                                    .setClipChromaKey(selectedClip.id, { color: sw.color });
                                  refreshCanvasPreview();
                                }}
                                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-200 hover:border-emerald-400"
                              >
                                {sw.label}
                              </button>
                            ))}
                            <input
                              type="color"
                              aria-label="Warna Chroma Key"
                              value={selectedClip.chromaKey.color || '#00b140'}
                              onChange={(e) => {
                                useTimelineStore
                                  .getState()
                                  .setClipChromaKey(selectedClip.id, {
                                    color: e.target.value,
                                  });
                                refreshCanvasPreview();
                              }}
                              className="h-6 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent"
                            />
                          </div>
                        </div>

                        <SliderRow
                          label="Toleransi Hapus"
                          value={selectedClip.chromaKey.tolerance ?? 0.32}
                          min={0.08}
                          max={0.65}
                          step={0.02}
                          onChange={(tolerance) => {
                            useTimelineStore
                              .getState()
                              .setClipChromaKey(selectedClip.id, { tolerance });
                            refreshCanvasPreview();
                          }}
                        />
                        <SliderRow
                          label="Halus Tepi (Edge)"
                          value={selectedClip.chromaKey.smoothness ?? 0.08}
                          min={0.02}
                          max={0.25}
                          step={0.01}
                          onChange={(smoothness) => {
                            useTimelineStore
                              .getState()
                              .setClipChromaKey(selectedClip.id, { smoothness });
                            refreshCanvasPreview();
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Precision Transform & Shader Controls (Expanded in Pro, Collapsible in Beginner) */}
              {selectedClip.type !== 'audio' && (
                <details
                  open={experienceMode === 'pro'}
                  className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-2.5"
                >
                  <summary className="cursor-pointer text-[11px] font-semibold text-zinc-300 select-none">
                    {experienceMode === 'pro'
                      ? 'Transformasi Presisi & Color Grading'
                      : 'Pengaturan Lanjutan (Posisi, Opasitas, & Warna)'}
                  </summary>

                  <div className="mt-3 space-y-3">
                    <SliderRow
                      label="Posisi X"
                      value={selectedClip.transforms.x}
                      min={-960}
                      max={960}
                      step={1}
                      suffix="px"
                      onChange={(x) => {
                        useTimelineStore
                          .getState()
                          .updateClipTransform(selectedClip.id, { x });
                        refreshCanvasPreview();
                      }}
                    />
                    <SliderRow
                      label="Posisi Y"
                      value={selectedClip.transforms.y}
                      min={-540}
                      max={540}
                      step={1}
                      suffix="px"
                      onChange={(y) => {
                        useTimelineStore
                          .getState()
                          .updateClipTransform(selectedClip.id, { y });
                        refreshCanvasPreview();
                      }}
                    />
                    <SliderRow
                      label="Skala"
                      value={selectedClip.transforms.scale}
                      min={0.1}
                      max={5}
                      step={0.05}
                      suffix="x"
                      onChange={(scale) => {
                        useTimelineStore
                          .getState()
                          .updateClipTransform(selectedClip.id, { scale });
                        refreshCanvasPreview();
                      }}
                    />
                    <SliderRow
                      label="Rotasi"
                      value={selectedClip.transforms.rotation}
                      min={-180}
                      max={180}
                      step={1}
                      suffix="°"
                      onChange={(rotation) => {
                        useTimelineStore
                          .getState()
                          .updateClipTransform(selectedClip.id, { rotation });
                        refreshCanvasPreview();
                      }}
                    />
                    <SliderRow
                      label="Opasitas"
                      value={selectedClip.transforms.opacity}
                      min={0}
                      max={1}
                      step={0.02}
                      onChange={(opacity) => {
                        useTimelineStore
                          .getState()
                          .updateClipTransform(selectedClip.id, { opacity });
                        refreshCanvasPreview();
                      }}
                    />

                    {selectedClip.type !== 'text' && (
                      <div className="space-y-3 border-t border-zinc-800 pt-3">
                        <SliderRow
                          label="Brightness"
                          value={getEffect('brightness', 0)}
                          min={-0.6}
                          max={0.6}
                          step={0.02}
                          onChange={(val) => {
                            useTimelineStore
                              .getState()
                              .setClipEffect(selectedClip.id, 'brightness', val);
                            refreshCanvasPreview();
                          }}
                        />
                        <SliderRow
                          label="Contrast"
                          value={getEffect('contrast', 1)}
                          min={0.2}
                          max={2}
                          step={0.02}
                          onChange={(val) => {
                            useTimelineStore
                              .getState()
                              .setClipEffect(selectedClip.id, 'contrast', val);
                            refreshCanvasPreview();
                          }}
                        />
                        <SliderRow
                          label="Saturation"
                          value={getEffect('saturation', 1)}
                          min={0}
                          max={2}
                          step={0.02}
                          onChange={(val) => {
                            useTimelineStore
                              .getState()
                              .setClipEffect(selectedClip.id, 'saturation', val);
                            refreshCanvasPreview();
                          }}
                        />
                        <SliderRow
                          label="Suhu Warna (Warmth)"
                          value={getEffect('temperature', 0)}
                          min={-1}
                          max={1}
                          step={0.04}
                          onChange={(val) => {
                            useTimelineStore
                              .getState()
                              .setClipEffect(selectedClip.id, 'temperature', val);
                            refreshCanvasPreview();
                          }}
                        />
                        <SliderRow
                          label="Grayscale"
                          value={getEffect('grayscale', 0)}
                          min={0}
                          max={1}
                          step={0.05}
                          onChange={(val) => {
                            useTimelineStore
                              .getState()
                              .setClipEffect(selectedClip.id, 'grayscale', val);
                            refreshCanvasPreview();
                          }}
                        />
                        <SliderRow
                          label="Sepia Vintage"
                          value={getEffect('sepia', 0)}
                          min={0}
                          max={1}
                          step={0.05}
                          onChange={(val) => {
                            useTimelineStore
                              .getState()
                              .setClipEffect(selectedClip.id, 'sepia', val);
                            refreshCanvasPreview();
                          }}
                        />
                        <SliderRow
                          label="Vignette"
                          value={getEffect('vignette', 0)}
                          min={0}
                          max={1}
                          step={0.05}
                          onChange={(val) => {
                            useTimelineStore
                              .getState()
                              .setClipEffect(selectedClip.id, 'vignette', val);
                            refreshCanvasPreview();
                          }}
                        />
                        <SliderRow
                          label="RGB Glitch (Chromatic)"
                          value={getEffect('chromab', 0)}
                          min={0}
                          max={1}
                          step={0.05}
                          onChange={(val) => {
                            useTimelineStore
                              .getState()
                              .setClipEffect(selectedClip.id, 'chromab', val);
                            refreshCanvasPreview();
                          }}
                        />
                        <SliderRow
                          label="Blur Halus"
                          value={getEffect('blur', 0)}
                          min={0}
                          max={1}
                          step={0.05}
                          onChange={(val) => {
                            useTimelineStore
                              .getState()
                              .setClipEffect(selectedClip.id, 'blur', val);
                            refreshCanvasPreview();
                          }}
                        />
                        <SliderRow
                          label="Mosaic Pixelate"
                          value={getEffect('pixelate', 0)}
                          min={0}
                          max={1}
                          step={0.05}
                          onChange={(val) => {
                            useTimelineStore
                              .getState()
                              .setClipEffect(selectedClip.id, 'pixelate', val);
                            refreshCanvasPreview();
                          }}
                        />
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>
          )
        ) : (
          <div className="space-y-4">
            {/* Free No-Watermark Banner */}
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-[11px] text-emerald-200">
              <p className="font-bold">100% Gratis — Tanpa Watermark</p>
              <p className="text-[10px] text-emerald-300/80">
                Semua fitur efek, filter LUT, stiker, dan eksport 1080p/4K terbuka penuh tanpa langganan Pro.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
                Mode Dual-Rendering (Perangkat vs Server PC)
              </p>

              <button
                type="button"
                onClick={() => setRenderMode('client-webcodecs')}
                className={`w-full rounded-lg border p-2.5 text-left transition ${
                  renderMode === 'client-webcodecs'
                    ? 'border-cyan-400 bg-cyan-950/30'
                    : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100">
                  <Cpu className="h-4 w-4 text-cyan-400" />
                  <span>Client Browser (Default)</span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">
                  WebCodecs + WebGL2 + mp4-muxer lokal di perangkat tanpa beban server.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setRenderMode('server-ffmpeg')}
                className={`w-full rounded-lg border p-2.5 text-left transition ${
                  renderMode === 'server-ffmpeg'
                    ? 'border-emerald-400 bg-emerald-950/30'
                    : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100">
                  <Server className="h-4 w-4 text-emerald-400" />
                  <span>Server Offload (LAN / GPU)</span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">
                  Chunked upload 10MB + Native FFmpeg GPU (NVENC/VAAPI) di server lokal.
                </p>
              </button>
            </div>

            {renderMode === 'client-webcodecs' ? (
              <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => void handleClientExport()}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-cyan-500 py-2 text-xs font-semibold text-zinc-950 hover:bg-cyan-400 disabled:opacity-50"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Merender MP4 ({clientProgress?.progress ?? 0}%)</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      <span>Export MP4 di Perangkat</span>
                    </>
                  )}
                </button>

                {clientProgress && isExporting && (
                  <div className="space-y-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full bg-cyan-400 transition-all"
                        style={{ width: `${clientProgress.progress}%` }}
                      />
                    </div>
                    <p className="font-mono text-[10px] text-zinc-400">
                      Fase: {clientProgress.phase} · Frame{' '}
                      {clientProgress.currentFrame}/{clientProgress.totalFrames}
                    </p>
                  </div>
                )}

                {clientExportFile && (
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        void saveBlobToDevice(
                          clientExportFile.blob,
                          clientExportFile.filename
                        );
                      }}
                      className="block w-full rounded-md border border-emerald-500/50 bg-emerald-500/15 py-2 text-center text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25"
                    >
                      Unduh Hasil Render (.{clientExportFile.ext})
                    </button>
                    {canShareFilesOnDevice() && (
                      <button
                        type="button"
                        onClick={() => {
                          void shareBlobWithSystemSheet(
                            clientExportFile.blob,
                            clientExportFile.filename
                          ).catch(() => {});
                        }}
                        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/15 py-1.5 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/25"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        <span>Simpan ke Galeri / Bagikan</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="space-y-1.5 border-b border-zinc-800 pb-2.5">
                  <label className="flex items-center gap-1 text-[10px] font-medium text-zinc-400">
                    <Globe className="h-3 w-3 text-cyan-400" />
                    <span>URL Server PC SWAVE (Kosong = Origin Sama)</span>
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="url"
                      placeholder="https://editor.domainanda.com"
                      value={serverUrlInput}
                      onChange={(e) => setServerUrlInput(e.target.value)}
                      className="min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-zinc-200 outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSaveServerUrl()}
                      className="rounded bg-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-200 hover:bg-zinc-700"
                    >
                      Set
                    </button>
                  </div>
                </div>

                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Server Lokal:</span>
                    <span
                      className={
                        serverCaps?.status === 'online'
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }
                    >
                      {serverCaps?.status === 'online' ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">FFmpeg Native:</span>
                    <span className="font-mono text-zinc-200">
                      {serverCaps?.ffmpegAvailable
                        ? serverCaps.preferredEncoder || 'libx264'
                        : 'Tidak terdeteksi'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isExporting || serverCaps?.status !== 'online'}
                  onClick={() => void handleServerExport()}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Mengirim & Render Server...</span>
                    </>
                  ) : (
                    <>
                      <Server className="h-4 w-4" />
                      <span>Render via Server FFmpeg</span>
                    </>
                  )}
                </button>

                {serverJob && (
                  <div className="space-y-2 rounded border border-zinc-800 bg-zinc-950 p-2 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Status Job:</span>
                      <span className="font-mono text-cyan-300">
                        {serverJob.status} ({serverJob.progress}%)
                      </span>
                    </div>
                    {serverJob.error && (
                      <p className="text-rose-400">{serverJob.error}</p>
                    )}
                    {serverJob.outputUrl && (
                      <a
                        href={serverJob.outputUrl}
                        download
                        className="block rounded bg-emerald-500/20 py-1.5 text-center font-semibold text-emerald-300"
                      >
                        Unduh Output Server (.mp4)
                      </a>
                    )}
                    <details className="text-[10px] text-zinc-500">
                      <summary className="cursor-pointer hover:text-zinc-300">
                        Lihat Perintah FFmpeg
                      </summary>
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-zinc-400">
                        {serverJob.ffmpegCommand}
                      </pre>
                    </details>
                  </div>
                )}
              </div>
            )}

            {exportError && (
              <div className="rounded border border-rose-500/40 bg-rose-950/40 p-2.5 text-[11px] text-rose-300">
                {exportError}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
