import { useEffect, useState } from 'react';
import {
  Camera,
  Captions,
  Check,
  ChevronLeft,
  Copy,
  Cpu,
  Download,
  Film,
  FolderOpen,
  FolderPlus,
  Gauge,
  HelpCircle,
  Maximize2,
  Minimize2,
  Monitor,
  Music,
  PanelLeft,
  Pause,
  Play,
  QrCode,
  Redo2,
  RotateCcw,
  Save,
  Scissors,
  Server,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  Type,
  Undo2,
  Volume2,
  Wand2,
  X,
} from 'lucide-react';
import { PRESET_RESOLUTIONS, type ServerCapabilities } from '@swave/shared';
import { useStore } from 'zustand';
import {
  clearLocalProjectSnapshot,
  hydrateProjectMediaAssets,
  loadLocalProjectSnapshot,
  saveProjectLocally,
} from '../engine/localPersistence';
import { mediaRuntime } from '../engine/mediaRuntime';
import { mediaRegistry } from '../engine/opfsStorage';
import {
  detectRuntimeCapabilities,
  type RuntimeCapabilities,
} from '../engine/runtimeCapabilities';
import {
  fetchServerCapabilities,
  getServerBaseUrl,
  loadProjectFromServer,
  resolveServerUrl,
  saveProjectToServer,
} from '../engine/serverOffloadClient';
import { useEditorShortcuts } from '../hooks/useEditorShortcuts';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { usePlaybackStore } from '../stores/playbackStore';
import {
  getTimelineDuration,
  useTimelineStore,
} from '../stores/timelineStore';
import {
  hasExplicitRuntimePreference,
  isStaticStandaloneHost,
  useUiStore,
} from '../stores/uiStore';
import { formatTimecode } from '../utils/format';
import { ExportModal } from './ExportModal';
import { HelpShortcutsModal } from './HelpShortcutsModal';
import { InspectorPanel } from './InspectorPanel';
import { MediaBinPanel, STUDIO_CATEGORIES } from './MediaBinPanel';
import { MultiDeviceHubModal } from './MultiDeviceHubModal';
import {
  captureCurrentCanvasSnapshot,
  PreviewViewport,
} from './PreviewViewport';
import { RuntimeModeModal } from './RuntimeModeModal';
import { TimelineContainer } from './timeline/TimelineContainer';

type DeviceLayoutMode = 'desktop' | 'tablet' | 'mobile';
type MobileSheetType = 'none' | 'media' | 'inspector' | 'export';

function detectDeviceLayout(): DeviceLayoutMode {
  if (typeof window === 'undefined') return 'desktop';
  if (typeof window.matchMedia === 'function') {
    if (window.matchMedia('(max-width: 767px)').matches) return 'mobile';
    if (window.matchMedia('(max-width: 1023px)').matches) return 'tablet';
  }
  const w = window.innerWidth;
  if (w > 0 && w < 768) return 'mobile';
  if (w >= 768 && w < 1024) return 'tablet';
  return 'desktop';
}

function MobileTransportStrip({
  onSave,
  isFullscreen,
  onToggleFullscreen,
}: {
  onSave: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const clips = useTimelineStore((s) => s.clips);
  const resolution = useTimelineStore((s) => s.resolution);
  const pastStates = useStore(useTimelineStore.temporal, (s) => s.pastStates);
  const futureStates = useStore(useTimelineStore.temporal, (s) => s.futureStates);
  const totalDur = getTimelineDuration(clips, 0);
  const fps = resolution.fps || 30;

  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-y border-[#2A2A32] bg-[#111114] px-2.5">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            mediaRuntime.unlockAudio();
            usePlaybackStore.getState().togglePlay();
          }}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="flex h-7 w-9 items-center justify-center rounded-md bg-[#00E5FF] text-zinc-950 shadow-sm active:scale-95"
        >
          {isPlaying ? (
            <Pause className="h-3.5 w-3.5 fill-current" />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current" />
          )}
        </button>
      </div>

      <div className="font-mono text-[11px] tabular-nums text-zinc-200">
        <span className="text-[#00E5FF]">{formatTimecode(currentTime, fps)}</span>
        <span className="mx-1 text-zinc-600">/</span>
        <span className="text-zinc-400">{formatTimecode(totalDur, fps)}</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={pastStates.length === 0}
          onClick={() => useTimelineStore.temporal.getState().undo()}
          className="rounded p-1.5 text-zinc-300 hover:bg-[#242429] disabled:opacity-35"
          title="Undo"
          aria-label="Undo"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={futureStates.length === 0}
          onClick={() => useTimelineStore.temporal.getState().redo()}
          className="rounded p-1.5 text-zinc-300 hover:bg-[#242429] disabled:opacity-35"
          title="Redo"
          aria-label="Redo"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={Object.keys(clips).length === 0}
          onClick={() => captureCurrentCanvasSnapshot()}
          className="rounded p-1.5 text-zinc-300 hover:bg-[#242429] disabled:opacity-35"
          title="Snapshot PNG"
          aria-label="Snapshot"
        >
          <Camera className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onSave}
          className="rounded p-1.5 text-zinc-300 hover:bg-[#242429]"
          title="Simpan Lokal"
        >
          <Save className="h-3.5 w-3.5 text-[#00E5FF]" />
        </button>
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="rounded p-1.5 text-zinc-300 hover:bg-[#242429]"
          title="Perbesar Pratinjau"
          aria-label="Toggle Fullscreen Preview"
        >
          {isFullscreen ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

export function VideoEditorPage() {
  useEditorShortcuts();

  const projectId = useTimelineStore((s) => s.projectId);
  const projectName = useTimelineStore((s) => s.projectName);
  const resolution = useTimelineStore((s) => s.resolution);
  const tracks = useTimelineStore((s) => s.tracks);
  const trackOrder = useTimelineStore((s) => s.trackOrder);
  const clips = useTimelineStore((s) => s.clips);
  const assets = useTimelineStore((s) => s.assets);
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds);

  const selectedClip =
    selectedClipIds.length === 1 ? clips[selectedClipIds[0]] : undefined;

  const [caps, setCaps] = useState<RuntimeCapabilities>(() =>
    detectRuntimeCapabilities()
  );
  const [serverCaps, setServerCaps] = useState<ServerCapabilities | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [modeModalState, setModeModalState] = useState<{
    open: boolean;
    tab: 'mode' | 'download';
  }>({ open: false, tab: 'mode' });
  const [hubModalState, setHubModalState] = useState<{
    open: boolean;
    tab: 'connect' | 'projects';
  }>({ open: false, tab: 'connect' });
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  const [detectedLayout, setDetectedLayout] = useState<DeviceLayoutMode>(() =>
    detectDeviceLayout()
  );
  const layoutPreference = useUiStore((s) => s.layoutPreference);
  const setLayoutPreference = useUiStore((s) => s.setLayoutPreference);
  const layoutMode: DeviceLayoutMode =
    layoutPreference === 'auto' ? detectedLayout : layoutPreference;

  // Mobile state
  const [mobileSheet, setMobileSheet] = useState<MobileSheetType>('none');
  const [mobileFullscreen, setMobileFullscreen] = useState(false);

  // Tablet slide-over drawers state (with mutual exclusion below 900px)
  const [tabletAssetOpen, setTabletAssetOpen] = useState(true);
  const [tabletInspectorOpen, setTabletInspectorOpen] = useState(false);

  // Desktop resizable 4-pane splitters state
  const [leftPaneWidth, setLeftPaneWidth] = useState(320);
  const [rightPaneWidth, setRightPaneWidth] = useState(300);
  const [upperPanePct, setUpperPanePct] = useState(54);

  const pwa = usePwaInstall();
  const experienceMode = useUiStore((s) => s.experienceMode);
  const setExperienceMode = useUiStore((s) => s.setExperienceMode);
  const runtimeMode = useUiStore((s) => s.runtimeMode);
  const setRuntimeMode = useUiStore((s) => s.setRuntimeMode);
  const activeMediaCategory = useUiStore((s) => s.activeMediaCategory);
  const setActiveMediaCategory = useUiStore((s) => s.setActiveMediaCategory);
  const showExportModal = useUiStore((s) => s.showExportModal);
  const setShowExportModal = useUiStore((s) => s.setShowExportModal);
  const showHelpModal = useUiStore((s) => s.showHelpModal);
  const setShowHelpModal = useUiStore((s) => s.setShowHelpModal);

  useEffect(() => {
    setCaps(detectRuntimeCapabilities());
    const params = new URLSearchParams(window.location.search);
    const requestedProjectId = params.get('project');

    if (!requestedProjectId) {
      const localDoc = loadLocalProjectSnapshot();
      if (localDoc && Object.keys(localDoc.clips || {}).length > 0) {
        void hydrateProjectMediaAssets(localDoc).then(() => {
          useTimelineStore.getState().loadProjectDocument(localDoc);
        });
      }
    }

    const explicitStandalone =
      hasExplicitRuntimePreference() &&
      useUiStore.getState().runtimeMode === 'standalone';
    const shouldProbeServer =
      !explicitStandalone &&
      (Boolean(requestedProjectId) ||
        Boolean(getServerBaseUrl()) ||
        !isStaticStandaloneHost());

    if (shouldProbeServer) {
      void fetchServerCapabilities().then(async (sc) => {
        setServerCaps(sc);
        if (!sc) {
          if (!hasExplicitRuntimePreference()) {
            setRuntimeMode('standalone', false);
          }
          return;
        }

        if (!hasExplicitRuntimePreference() && sc.status === 'online') {
          setRuntimeMode('server', false);
        }

        if (requestedProjectId) {
          try {
            const doc = await loadProjectFromServer(requestedProjectId);
            for (const asset of Object.values(doc.assets)) {
              if (asset.serverUrl) {
                mediaRegistry.registerRemoteAsset(
                  asset.id,
                  resolveServerUrl(asset.serverUrl)
                );
              }
            }
            useTimelineStore.getState().loadProjectDocument(doc);
            usePlaybackStore.getState().seekTo(0);
          } catch {
            // Project does not exist on server yet
          }
        }
      });
    }

    const onResize = () => {
      setDetectedLayout(detectDeviceLayout());
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [setRuntimeMode]);

  // Tablet rule: auto-show inspector when clip selected, closing left drawer if narrow <= 900px
  useEffect(() => {
    if (layoutMode !== 'tablet') return;
    if (selectedClip) {
      setTabletInspectorOpen(true);
      if (window.innerWidth <= 900) {
        setTabletAssetOpen(false);
      }
    }
  }, [layoutMode, selectedClip]);

  // Debounced Live Auto-Save
  useEffect(() => {
    if (Object.keys(clips).length === 0 && Object.keys(assets).length === 0) {
      return;
    }

    const timer = setTimeout(() => {
      const doc = useTimelineStore.getState().exportProjectDocument();
      saveProjectLocally(doc);

      if (
        autoSaveEnabled &&
        runtimeMode === 'server' &&
        serverCaps?.status === 'online'
      ) {
        void saveProjectToServer(doc)
          .then(() => {
            setSaveFeedback('Auto-Synced');
            setTimeout(() => setSaveFeedback(null), 1500);
          })
          .catch(() => {});
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [
    autoSaveEnabled,
    runtimeMode,
    serverCaps?.status,
    projectId,
    projectName,
    resolution,
    tracks,
    trackOrder,
    clips,
    assets,
  ]);

  const handleSaveProject = async () => {
    const doc = useTimelineStore.getState().exportProjectDocument();
    saveProjectLocally(doc);

    if (runtimeMode !== 'server') {
      setSaveFeedback('Tersimpan Lokal');
      setTimeout(() => setSaveFeedback(null), 2000);
      return;
    }

    try {
      await saveProjectToServer(doc);
      setSaveFeedback('Tersimpan');
      setTimeout(() => setSaveFeedback(null), 2000);
    } catch {
      setSaveFeedback('Lokal Saja');
      setTimeout(() => setSaveFeedback(null), 2500);
    }
  };

  const cycleLayoutMode = () => {
    const next: DeviceLayoutMode =
      layoutMode === 'desktop'
        ? 'mobile'
        : layoutMode === 'mobile'
        ? 'tablet'
        : 'desktop';
    setLayoutPreference(next);
  };

  const toggleMobileSheet = (target: Exclude<MobileSheetType, 'none'>) => {
    setMobileSheet((prev) => (prev === target ? 'none' : target));
  };

  const startHorizontalDrag = (side: 'left' | 'right', e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = side === 'left' ? leftPaneWidth : rightPaneWidth;
    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientX - startX;
      if (side === 'left') {
        setLeftPaneWidth(Math.max(260, Math.min(480, startW + delta)));
      } else {
        setRightPaneWidth(Math.max(260, Math.min(420, startW - delta)));
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startVerticalDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startPct = upperPanePct;
    const vh = Math.max(400, window.innerHeight - 40);
    const onMove = (ev: PointerEvent) => {
      const deltaPct = ((ev.clientY - startY) / vh) * 100;
      setUpperPanePct(Math.max(40, Math.min(72, Math.round(startPct + deltaPct))));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const headerHeightClass = layoutMode === 'desktop' ? 'h-10' : 'h-12';

  return (
    <div className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#0E0E10] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-[#F4F4F6] select-none">
      {/* Studio Global Top Bar (40px Desktop / 48px Tablet & Mobile) */}
      <header
        className={`relative z-40 flex shrink-0 items-center justify-between border-b border-[#2A2A32] bg-[#18181C] px-2.5 lg:px-3.5 ${headerHeightClass}`}
      >
        <div className="flex min-w-0 items-center gap-2">
          {layoutMode === 'tablet' && (
            <button
              type="button"
              onClick={() => {
                const next = !tabletAssetOpen;
                setTabletAssetOpen(next);
                if (next && window.innerWidth <= 900) {
                  setTabletInspectorOpen(false);
                }
              }}
              className={`rounded border border-[#2A2A32] p-1.5 text-xs ${
                tabletAssetOpen
                  ? 'bg-[#00E5FF]/15 text-[#00E5FF]'
                  : 'bg-[#242429] text-zinc-300'
              }`}
              title="Buka / Tutup Panel Aset"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          )}

          <div className="flex items-center gap-1.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#00E5FF] to-sky-500 text-zinc-950 shadow-xs">
              <Film className="h-3.5 w-3.5" />
            </div>
            <div className="flex items-center">
              <span className="text-xs font-extrabold tracking-tight text-white sm:text-sm">
                SWAVE <span className="text-[#00E5FF]">Video</span>
              </span>
              <span className="ml-1.5 hidden rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-300 xl:inline">
                100% GRATIS
              </span>
            </div>
          </div>

          <div className="h-4 w-px bg-[#2A2A32]" />

          <input
            type="text"
            aria-label="Nama Proyek"
            value={projectName}
            onChange={(e) =>
              useTimelineStore.getState().setProjectName(e.target.value)
            }
            className="w-20 truncate rounded border border-transparent bg-transparent px-1.5 py-0.5 text-xs font-medium text-zinc-200 hover:border-[#2A2A32] focus:border-[#00E5FF] focus:bg-[#242429] focus:outline-none sm:w-36 lg:w-48"
          />

          {layoutMode === 'mobile' && (
            <select
              aria-label="Resolusi Kanvas"
              value={`${resolution.width}x${resolution.height}x${resolution.fps}`}
              onChange={(e) => {
                const found = PRESET_RESOLUTIONS.find(
                  (r) => `${r.width}x${r.height}x${r.fps}` === e.target.value
                );
                if (found) useTimelineStore.getState().setResolution(found);
              }}
              className="max-w-[92px] rounded border border-[#2A2A32] bg-[#242429] px-1.5 py-1 text-[10px] font-medium text-zinc-200"
            >
              {PRESET_RESOLUTIONS.map((r) => (
                <option
                  key={`${r.width}x${r.height}x${r.fps}`}
                  value={`${r.width}x${r.height}x${r.fps}`}
                >
                  {r.width}×{r.height}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setHubModalState({ open: true, tab: 'projects' })}
            className="hidden items-center gap-1 rounded border border-[#2A2A32] bg-[#242429] px-2 py-1 text-[11px] text-zinc-300 hover:border-[#00E5FF]/60 hover:text-[#00E5FF] lg:inline-flex"
            title="Buka atau ganti Proyek Bersama di Server PC"
          >
            <FolderOpen className="h-3.5 w-3.5 text-[#00E5FF]" />
            <span>Proyek</span>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1 lg:gap-1.5">
          {/* Pemula vs Pro Switcher */}
          <div
            role="group"
            aria-label="Mode Pengalaman Editor"
            className="inline-flex items-center rounded-md border border-[#2A2A32] bg-[#111114] p-0.5 text-[10px] sm:text-[11px]"
          >
            <button
              type="button"
              onClick={() => setExperienceMode('beginner')}
              className={`rounded px-1.5 py-0.5 font-semibold transition sm:px-2 ${
                experienceMode === 'beginner'
                  ? 'bg-[#00E5FF] text-zinc-950'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Mode Pemula: Tampilan simpel, istilah mudah, preset 1-klik"
            >
              Pemula
            </button>
            <button
              type="button"
              onClick={() => setExperienceMode('pro')}
              className={`rounded px-1.5 py-0.5 font-semibold transition sm:px-2 ${
                experienceMode === 'pro'
                  ? 'bg-violet-500 text-zinc-950'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Mode Pro (100% Gratis): Kontrol NLE penuh, color shader presisi, ripple & shortcuts"
            >
              Pro
            </button>
          </div>

          {/* Multi-Device Connect (QR Code & LAN Link) */}
          <button
            type="button"
            onClick={() => setHubModalState({ open: true, tab: 'connect' })}
            className="inline-flex items-center gap-1 rounded-md border border-[#00E5FF]/35 bg-[#00E5FF]/10 px-2 py-1 text-xs font-medium text-[#00E5FF] hover:bg-[#00E5FF]/20"
            title="Buka Proyek Ini di HP, Tablet, atau Laptop Lain via WiFi/LAN"
          >
            <QrCode className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Multi-Device / QR</span>
          </button>

          {/* Tri-Mode Adaptive Layout Switcher */}
          <button
            type="button"
            onClick={cycleLayoutMode}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition ${
              layoutMode !== 'desktop'
                ? 'border-[#00E5FF]/50 bg-[#00E5FF]/15 text-[#00E5FF]'
                : 'border-[#2A2A32] bg-[#242429] text-zinc-300 hover:border-zinc-500'
            }`}
            title="Beralih antara Tampilan Studio Android (Mobile), Tablet, dan Desktop"
          >
            {layoutMode === 'mobile' ? (
              <>
                <Smartphone className="h-3.5 w-3.5 text-[#00E5FF]" />
                <span className="hidden md:inline">Mode HP</span>
              </>
            ) : layoutMode === 'tablet' ? (
              <>
                <Tablet className="h-3.5 w-3.5 text-violet-400" />
                <span className="hidden md:inline">Mode Tablet</span>
              </>
            ) : (
              <>
                <Monitor className="h-3.5 w-3.5 text-zinc-300" />
                <span className="hidden md:inline">Mode Desktop</span>
              </>
            )}
          </button>

          {/* Runtime Mode Switcher */}
          <button
            type="button"
            onClick={() => setModeModalState({ open: true, tab: 'mode' })}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition ${
              runtimeMode === 'server' && serverCaps?.status === 'online'
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : 'border-[#00E5FF]/35 bg-[#00E5FF]/10 text-[#00E5FF]'
            }`}
            title="Pilih Mode Operasi: Mandiri di Perangkat vs Perantara Server PC"
          >
            {runtimeMode === 'server' && serverCaps?.status === 'online' ? (
              <>
                <Server className="h-3.5 w-3.5 text-emerald-400" />
                <span className="hidden xl:inline">Server PC</span>
              </>
            ) : (
              <>
                <Cpu className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">Di Perangkat</span>
              </>
            )}
          </button>

          {/* Android / iOS / Portable App Install */}
          <button
            type="button"
            onClick={() => {
              if (pwa.canInstall) {
                void pwa.promptInstall();
              } else {
                setModeModalState({ open: true, tab: 'download' });
              }
            }}
            className="hidden items-center gap-1 rounded-md border border-emerald-500/35 bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25 sm:inline-flex"
            title="Unduh / Instal Aplikasi (Android APK, iOS Safari/IPA, Portabel)"
          >
            <Smartphone className="h-3.5 w-3.5" />
            <span className="hidden 2xl:inline">
              {pwa.isStandalone
                ? 'App Aktif'
                : pwa.canInstall
                ? 'Instal App'
                : 'App HP'}
            </span>
          </button>

          {experienceMode === 'pro' && (
            <button
              type="button"
              onClick={() => setShowDiagnostics((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-xs transition ${
                caps.crossOriginIsolated && caps.hasWebCodecs
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              }`}
              title="Diagnostik Runtime Studio (COOP/COEP, WebCodecs, WebGL2, Server)"
            >
              {caps.crossOriginIsolated ? (
                <ShieldCheck className="h-3.5 w-3.5" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            className="inline-flex items-center rounded-md border border-[#2A2A32] bg-[#242429] p-1 text-xs text-zinc-300 hover:border-[#00E5FF]/50 hover:text-[#00E5FF]"
            title="Panduan Cepat & Daftar Shortcut Keyboard (?)"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => void handleSaveProject()}
            className="inline-flex items-center gap-1 rounded-md border border-[#2A2A32] bg-[#242429] px-2 py-1 text-xs font-medium text-zinc-200 hover:border-[#00E5FF]/50"
            title={
              runtimeMode === 'server'
                ? 'Simpan Proyek ke Perangkat & Server PC'
                : 'Simpan Proyek Lokal di Perangkat'
            }
          >
            {saveFeedback === 'Tersimpan' ||
            saveFeedback === 'Auto-Synced' ||
            saveFeedback === 'Tersimpan Lokal' ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Save className="h-3.5 w-3.5 text-[#00E5FF]" />
            )}
            <span className="hidden lg:inline">
              {saveFeedback || 'Simpan'}
            </span>
          </button>

          {/* Cyan Primary Export CTA */}
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="inline-flex items-center gap-1 rounded-md bg-[#00E5FF] px-2.5 py-1 text-xs font-bold text-zinc-950 shadow-sm hover:brightness-110"
            title="Ekspor Video MP4 Tanpa Watermark"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Ekspor MP4</span>
          </button>

          <button
            type="button"
            onClick={() => {
              clearLocalProjectSnapshot();
              useTimelineStore.getState().resetProject();
            }}
            className="hidden items-center rounded-md border border-[#2A2A32] bg-[#242429] p-1 text-xs text-zinc-400 hover:text-zinc-100 sm:inline-flex"
            title="Reset Proyek Baru"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Diagnostics Popover */}
        {showDiagnostics && (
          <div className="absolute top-12 right-3 z-60 w-80 rounded-lg border border-[#2A2A32] bg-[#202026] p-3.5 text-xs shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-zinc-100">
                Diagnostik Edge & Browser Runtime
              </h3>
              <button
                type="button"
                onClick={() => setShowDiagnostics(false)}
                className="rounded p-0.5 text-zinc-400 hover:text-zinc-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <ul className="space-y-1.5 font-mono text-[11px]">
              <li className="flex justify-between">
                <span className="text-zinc-400">Secure Context:</span>
                <span className={caps.isSecureContext ? 'text-emerald-400' : 'text-amber-400'}>
                  {String(caps.isSecureContext)}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-zinc-400">COOP/COEP Isolated:</span>
                <span className={caps.crossOriginIsolated ? 'text-emerald-400' : 'text-amber-400'}>
                  {String(caps.crossOriginIsolated)}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-zinc-400">WebCodecs API:</span>
                <span className={caps.hasWebCodecs ? 'text-emerald-400' : 'text-amber-400'}>
                  {String(caps.hasWebCodecs)}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-zinc-400">WebGL2 GLSL:</span>
                <span className={caps.hasWebGL2 ? 'text-emerald-400' : 'text-amber-400'}>
                  {String(caps.hasWebGL2)}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-zinc-400">OPFS Storage:</span>
                <span className={caps.hasOPFS ? 'text-emerald-400' : 'text-amber-400'}>
                  {String(caps.hasOPFS)}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-zinc-400">Server FFmpeg:</span>
                <span className={serverCaps?.ffmpegAvailable ? 'text-emerald-400' : 'text-zinc-400'}>
                  {serverCaps?.ffmpegAvailable
                    ? serverCaps.preferredEncoder || 'ready'
                    : 'offline / none'}
                </span>
              </li>
            </ul>
            {!caps.isSecureContext && (
              <p className="mt-2.5 rounded bg-amber-500/10 p-2 text-[11px] text-amber-300">
                Saat diakses dari HP/Tablet lewat IP LAN HTTP, SWAVE Video mengaktifkan fallback `MediaRecorder` untuk export lokal serta sinkronisasi ke Server PC.
              </p>
            )}
          </div>
        )}
      </header>

      {/* ===================================================================== */}
      {/* LAYOUT 1: MOBILE (< 768px) — 5-Zone Portrait Shell + Bottom Sheet      */}
      {/* ===================================================================== */}
      {layoutMode === 'mobile' ? (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* ZONA 2: Flexible Video Canvas Area (~42-46dvh, min 12px padding) */}
          <PreviewViewport layoutMode="mobile" />

          {/* ZONA 3: Transport & History Strip (40px) */}
          <MobileTransportStrip
            onSave={() => void handleSaveProject()}
            isFullscreen={mobileFullscreen}
            onToggleFullscreen={() => setMobileFullscreen((v) => !v)}
          />

          {/* Compact Selected Clip Pill between Strip & Timeline when sheet closed */}
          {selectedClip && mobileSheet === 'none' && !mobileFullscreen && (
            <div className="flex shrink-0 items-center justify-between border-b border-[#2A2A32] bg-[#18181C] px-3 py-1 text-[11px]">
              <span className="truncate font-medium text-[#00E5FF]">
                Klip aktif: {selectedClip.name}
              </span>
              <button
                type="button"
                onClick={() => setMobileSheet('inspector')}
                className="inline-flex shrink-0 items-center gap-1 rounded bg-[#00E5FF] px-2 py-0.5 text-[10px] font-bold text-zinc-950"
              >
                <Sparkles className="h-3 w-3" />
                <span>Inspektor</span>
              </button>
            </div>
          )}

          {/* ZONA 4: Scrolling Timeline (~34dvh, hidden if preview fullscreened) */}
          {!mobileFullscreen && (
            <TimelineContainer
              layoutMode="mobile"
              onAddMediaClick={() => {
                setActiveMediaCategory('media');
                setMobileSheet('media');
              }}
              onCoverClick={() => captureCurrentCanvasSnapshot()}
            />
          )}

          {/* Slide-Over Bottom Sheet (44dvh, covers ONLY Zona 4 + Zona 5; Canvas & Play strip remain visible!) */}
          {mobileSheet !== 'none' && (
            <div
              role="dialog"
              aria-label="Panel Alat Mobile"
              className="absolute right-0 bottom-0 left-0 z-50 flex h-[44dvh] flex-col rounded-t-2xl border-t border-[#2A2A32] bg-[#202026] shadow-[0_-12px_32px_rgba(0,0,0,0.85)]"
            >
              <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#2A2A32] px-3.5">
                <div className="flex items-center gap-2">
                  <span className="h-1 w-8 rounded-full bg-zinc-600" />
                  <span className="text-xs font-semibold text-zinc-100">
                    {mobileSheet === 'media'
                      ? 'Media, Audio & Efek'
                      : mobileSheet === 'export'
                      ? 'Ekspor Hybrid'
                      : 'Inspektor Klip & Shader GLSL'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileSheet('none')}
                  className="inline-flex items-center gap-1 rounded-md bg-[#242429] px-2.5 py-1 text-xs font-semibold text-[#00E5FF] hover:bg-[#2d2d35]"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Tutup</span>
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                {mobileSheet === 'media' ? (
                  <MediaBinPanel
                    mode="sheet"
                    onClipAdded={() => setMobileSheet('none')}
                  />
                ) : (
                  <InspectorPanel
                    mode="sheet"
                    initialTab={mobileSheet === 'export' ? 'export' : 'inspector'}
                  />
                )}
              </div>
            </div>
          )}

          {/* ZONA 5: Contextual Bottom Dock (68px) */}
          <nav
            aria-label="Navigasi Studio Android"
            className="z-40 flex h-[68px] shrink-0 items-center border-t border-[#2A2A32] bg-[#18181C] px-1"
          >
            {selectedClip && mobileSheet === 'none' ? (
              <div className="flex w-full items-center gap-1">
                <button
                  type="button"
                  onClick={() => useTimelineStore.getState().clearSelection()}
                  className="flex h-12 w-10 shrink-0 flex-col items-center justify-center rounded-lg border border-[#2A2A32] bg-[#242429] text-zinc-200"
                  title="Kembali ke menu utama"
                  aria-label="Kembali"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <div className="no-scrollbar flex flex-1 items-center gap-1 overflow-x-auto px-1">
                  {[
                    {
                      label: 'Bagi',
                      icon: Scissors,
                      onClick: () =>
                        useTimelineStore
                          .getState()
                          .splitClipAtTime(
                            selectedClip.id,
                            usePlaybackStore.getState().currentTime
                          ),
                    },
                    {
                      label: 'Kecepatan',
                      icon: Gauge,
                      onClick: () => setMobileSheet('inspector'),
                    },
                    {
                      label: 'Volume',
                      icon: Volume2,
                      onClick: () => setMobileSheet('inspector'),
                    },
                    {
                      label: 'Animasi',
                      icon: Sparkles,
                      onClick: () => setMobileSheet('inspector'),
                    },
                    {
                      label: 'Filter',
                      icon: Wand2,
                      onClick: () => {
                        setActiveMediaCategory('effects');
                        setMobileSheet('media');
                      },
                    },
                    {
                      label: 'Edit',
                      icon: SlidersHorizontal,
                      onClick: () => setMobileSheet('inspector'),
                    },
                    {
                      label: 'Salin',
                      icon: Copy,
                      onClick: () =>
                        useTimelineStore.getState().duplicateClip(selectedClip.id),
                    },
                    {
                      label: 'Hapus',
                      icon: Trash2,
                      onClick: () =>
                        useTimelineStore.getState().deleteClips([selectedClip.id]),
                    },
                  ].map((act) => {
                    const ActIcon = act.icon;
                    return (
                      <button
                        key={act.label}
                        type="button"
                        onClick={act.onClick}
                        className="flex h-12 min-w-[54px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg bg-[#242429]/70 px-2 text-zinc-200 active:scale-95"
                      >
                        <ActIcon className="h-4 w-4 text-[#00E5FF]" />
                        <span className="text-[10px] font-medium">{act.label}</span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setModeModalState({ open: true, tab: 'download' })}
                  className="flex h-12 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-[#2A2A32] bg-[#242429] px-2 text-cyan-300"
                >
                  <Smartphone className="h-4 w-4" />
                  <span className="text-[10px] font-medium">App APK</span>
                </button>
              </div>
            ) : (
              <div className="grid w-full grid-cols-7">
                <button
                  type="button"
                  onClick={() => {
                    setActiveMediaCategory('media');
                    toggleMobileSheet('media');
                  }}
                  className={`flex flex-col items-center justify-center gap-1 rounded-lg py-1 ${
                    mobileSheet === 'media' && activeMediaCategory === 'media'
                      ? 'text-[#00E5FF]'
                      : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  <FolderPlus className="h-4 w-4" />
                  <span className="text-[11px] font-medium">Edit</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveMediaCategory('audio');
                    setMobileSheet('media');
                  }}
                  className="flex flex-col items-center justify-center gap-1 rounded-lg py-1 text-zinc-400 hover:text-emerald-300"
                >
                  <Music className="h-4 w-4 text-emerald-400" />
                  <span className="text-[11px] font-medium">Audio</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    useTimelineStore
                      .getState()
                      .addTextClip(
                        'Judul Overlay',
                        usePlaybackStore.getState().currentTime
                      );
                    setMobileSheet('inspector');
                  }}
                  className="flex flex-col items-center justify-center gap-1 rounded-lg py-1 text-zinc-400 hover:text-violet-300"
                >
                  <Type className="h-4 w-4 text-violet-400" />
                  <span className="text-[11px] font-medium">+ Teks</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveMediaCategory('subtitle');
                    setMobileSheet('media');
                  }}
                  className="flex flex-col items-center justify-center gap-1 rounded-lg py-1 text-zinc-400 hover:text-[#00E5FF]"
                >
                  <Captions className="h-4 w-4 text-[#00E5FF]" />
                  <span className="text-[11px] font-medium">Subtitle</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveMediaCategory('effects');
                    setMobileSheet('media');
                  }}
                  className="flex flex-col items-center justify-center gap-1 rounded-lg py-1 text-zinc-400 hover:text-amber-300"
                >
                  <Wand2 className="h-4 w-4 text-amber-400" />
                  <span className="text-[11px] font-medium">Efek</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleMobileSheet('inspector')}
                  className="flex flex-col items-center justify-center gap-1 rounded-lg py-1 text-zinc-400 hover:text-zinc-100"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  <span className="text-[11px] font-medium">PIP</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModeModalState({ open: true, tab: 'download' })}
                  className="flex flex-col items-center justify-center gap-1 rounded-lg py-1 text-zinc-400 hover:text-[#00E5FF]"
                >
                  <Smartphone className="h-4 w-4 text-[#00E5FF]" />
                  <span className="text-[11px] font-medium">App APK</span>
                </button>
              </div>
            )}
          </nav>
        </div>
      ) : layoutMode === 'tablet' ? (
        /* =================================================================== */
        /* LAYOUT 2: TABLET (768px - 1024px) — Hybrid Touch Studio 3-Row Grid   */
        /* =================================================================== */
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex h-[calc(60dvh-48px)] min-h-[220px] shrink-0 overflow-hidden bg-[#0A0A0C]">
            {/* Vertical Icon Rail (56px) */}
            <nav
              aria-label="Rail Alat Tablet"
              className="flex w-14 shrink-0 flex-col items-center gap-1.5 border-r border-[#2A2A32] bg-[#18181C] py-2"
            >
              {STUDIO_CATEGORIES.map((tab) => {
                const Icon = tab.icon;
                const active = tabletAssetOpen && activeMediaCategory === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    title={`Kategori ${tab.label}`}
                    onClick={() => {
                      if (tabletAssetOpen && activeMediaCategory === tab.id) {
                        setTabletAssetOpen(false);
                      } else {
                        setActiveMediaCategory(tab.id);
                        setTabletAssetOpen(true);
                        if (window.innerWidth <= 900) {
                          setTabletInspectorOpen(false);
                        }
                      }
                    }}
                    className={`flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-lg text-[9px] font-medium transition ${
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
            </nav>

            {/* Collapsible Slide-Over Asset Drawer (240px) */}
            {tabletAssetOpen && (
              <div className="w-[240px] shrink-0 border-r border-[#2A2A32] bg-[#18181C]">
                <MediaBinPanel
                  mode="drawer"
                  hideRail
                  onCloseDrawer={() => setTabletAssetOpen(false)}
                />
              </div>
            )}

            {/* Center Viewport (min 320px flexible) */}
            <div className="flex min-w-[320px] flex-1 overflow-hidden">
              <PreviewViewport layoutMode="tablet" />
            </div>

            {/* Collapsible Slide-Over Inspector Drawer (260px) */}
            {(tabletInspectorOpen || !tabletAssetOpen) && (
              <div className="w-[260px] shrink-0 border-l border-[#2A2A32] bg-[#18181C]">
                <InspectorPanel
                  mode="drawer"
                  onClosePanel={() => setTabletInspectorOpen(false)}
                />
              </div>
            )}
          </div>

          <TimelineContainer layoutMode="tablet" />
        </div>
      ) : (
        /* =================================================================== */
        /* LAYOUT 3: DESKTOP (> 1024px) — Modular 4-Pane Resizable Studio       */
        /* =================================================================== */
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Upper 3-Column Workspace (Default 54% of remaining height) */}
          <div
            className="flex shrink-0 overflow-hidden"
            style={{ height: `${upperPanePct}%` }}
          >
            {/* Kuadran 1: Asset Browser */}
            <div
              className="shrink-0 overflow-hidden border-r border-[#2A2A32]"
              style={{ width: leftPaneWidth }}
            >
              <MediaBinPanel mode="sidebar" />
            </div>

            {/* Vertical Splitter Left (4px ew-resize) */}
            <div
              role="separator"
              aria-orientation="vertical"
              onPointerDown={(e) => startHorizontalDrag('left', e)}
              className="w-1 shrink-0 cursor-ew-resize bg-[#2A2A32] transition-colors hover:bg-[#00E5FF]"
              title="Geser lebar panel aset"
            />

            {/* Kuadran 2: Player Viewport (min-w-[420px]) */}
            <div className="flex min-w-[420px] flex-1 overflow-hidden">
              <PreviewViewport layoutMode="desktop" />
            </div>

            {/* Vertical Splitter Right (4px ew-resize) */}
            <div
              role="separator"
              aria-orientation="vertical"
              onPointerDown={(e) => startHorizontalDrag('right', e)}
              className="w-1 shrink-0 cursor-ew-resize bg-[#2A2A32] transition-colors hover:bg-[#00E5FF]"
              title="Geser lebar panel inspektor"
            />

            {/* Kuadran 3: Property Inspector */}
            <div
              className="shrink-0 overflow-hidden border-l border-[#2A2A32]"
              style={{ width: rightPaneWidth }}
            >
              <InspectorPanel mode="sidebar" />
            </div>
          </div>

          {/* Horizontal Splitter (4px ns-resize) */}
          <div
            role="separator"
            aria-orientation="horizontal"
            onPointerDown={startVerticalDrag}
            className="h-1 shrink-0 cursor-ns-resize bg-[#2A2A32] transition-colors hover:bg-[#00E5FF]"
            title="Geser tinggi area pratinjau dan timeline"
          />

          {/* Kuadran 4: Multi-Track Matrix Timeline */}
          <TimelineContainer layoutMode="desktop" />
        </div>
      )}

      {/* Multi-Device Hub Modal */}
      {hubModalState.open && (
        <MultiDeviceHubModal
          isOpen={hubModalState.open}
          initialTab={hubModalState.tab}
          autoSaveEnabled={autoSaveEnabled}
          onToggleAutoSave={setAutoSaveEnabled}
          onClose={() => setHubModalState((s) => ({ ...s, open: false }))}
        />
      )}

      {showExportModal && (
        <ExportModal
          isOpen={showExportModal}
          onOpenModeSettings={() => setModeModalState({ open: true, tab: 'mode' })}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {showHelpModal && (
        <HelpShortcutsModal
          isOpen={showHelpModal}
          onClose={() => setShowHelpModal(false)}
        />
      )}

      <RuntimeModeModal
        isOpen={modeModalState.open}
        initialTab={modeModalState.tab}
        serverCaps={serverCaps}
        onServerCapsChange={setServerCaps}
        onOpenQrHub={() => setHubModalState({ open: true, tab: 'connect' })}
        pwa={pwa}
        onClose={() => setModeModalState((s) => ({ ...s, open: false }))}
      />
    </div>
  );
}
