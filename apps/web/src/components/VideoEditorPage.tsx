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
  Menu,
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
  Smile,
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

interface ViewportGeometry {
  mode: DeviceLayoutMode;
  isLandscape: boolean;
}

function detectViewportGeometry(): ViewportGeometry {
  if (typeof window === 'undefined') {
    return { mode: 'desktop', isLandscape: true };
  }
  const w = window.innerWidth || 1024;
  const h = window.innerHeight || 768;
  const isLandscape = w > h;

  // Rotated phone / Android APK sideways (short landscape screen height)
  if (isLandscape && h > 0 && h < 520) {
    return { mode: 'mobile', isLandscape: true };
  }

  if (typeof window.matchMedia === 'function') {
    if (window.matchMedia('(max-width: 767px)').matches) {
      return { mode: 'mobile', isLandscape };
    }
    if (window.matchMedia('(max-width: 1023px)').matches) {
      return { mode: 'tablet', isLandscape };
    }
  }

  if (w < 768) return { mode: 'mobile', isLandscape };
  if (w < 1024) return { mode: 'tablet', isLandscape };
  return { mode: 'desktop', isLandscape: true };
}

function MobileTransportStrip({
  compactLandscape,
  isFullscreen,
  onToggleFullscreen,
  onSave,
}: {
  compactLandscape: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onSave: () => void;
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
    <div
      className={`flex shrink-0 items-center justify-between border-y border-[#1E1E24] bg-[#0A0A0C] px-3 ${
        compactLandscape ? 'h-8' : 'h-10'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            mediaRuntime.unlockAudio();
            usePlaybackStore.getState().togglePlay();
          }}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="flex h-7 w-8 items-center justify-center rounded-md text-white transition hover:text-[#00E5FF] active:scale-95"
        >
          {isPlaying ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="h-4 w-4 fill-current" />
          )}
        </button>
      </div>

      <div className="font-mono text-[11px] tabular-nums">
        <span className="font-semibold text-white">
          {formatTimecode(currentTime, fps)}
        </span>
        <span className="mx-1 text-zinc-600">/</span>
        <span className="text-zinc-500">{formatTimecode(totalDur, fps)}</span>
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          disabled={pastStates.length === 0}
          onClick={() => useTimelineStore.temporal.getState().undo()}
          className="rounded p-1.5 text-zinc-200 hover:bg-[#18181C] disabled:opacity-30"
          title="Undo"
          aria-label="Undo"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={futureStates.length === 0}
          onClick={() => useTimelineStore.temporal.getState().redo()}
          className="rounded p-1.5 text-zinc-200 hover:bg-[#18181C] disabled:opacity-30"
          title="Redo"
          aria-label="Redo"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </button>
        {compactLandscape && (
          <button
            type="button"
            onClick={onSave}
            className="rounded p-1.5 text-zinc-200 hover:bg-[#18181C]"
            title="Simpan Lokal"
          >
            <Save className="h-3.5 w-3.5 text-[#00E5FF]" />
          </button>
        )}
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="rounded p-1.5 text-zinc-200 hover:bg-[#18181C]"
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
  const [showMobileMenu, setShowMobileMenu] = useState(false);
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

  const [viewportGeom, setViewportGeom] = useState<ViewportGeometry>(() =>
    detectViewportGeometry()
  );
  const layoutPreference = useUiStore((s) => s.layoutPreference);
  const setLayoutPreference = useUiStore((s) => s.setLayoutPreference);
  const layoutMode: DeviceLayoutMode =
    layoutPreference === 'auto' ? viewportGeom.mode : layoutPreference;

  // Landscape mobile only activates automatically when physical screen is short & wide (or rotated tablet phone)
  const isMobileLandscape =
    layoutMode === 'mobile' && viewportGeom.mode === 'mobile' && viewportGeom.isLandscape;
  const isTabletLandscape =
    layoutMode === 'tablet' && viewportGeom.isLandscape;

  // Mobile sheet state
  const [mobileSheet, setMobileSheet] = useState<MobileSheetType>('none');
  const [mobileFullscreen, setMobileFullscreen] = useState(false);

  // Tablet slide-over drawers state
  const [tabletAssetOpen, setTabletAssetOpen] = useState(() =>
    detectViewportGeometry().isLandscape
  );
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
            // Ignore when server project doesn't exist yet
          }
        }
      });
    }

    const onViewportChange = () => {
      setViewportGeom(detectViewportGeometry());
    };
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('orientationchange', onViewportChange);
    };
  }, [setRuntimeMode]);

  // Tablet rule: auto-show inspector when clip selected, keeping canvas spacious in Portrait / narrow widths
  useEffect(() => {
    if (layoutMode !== 'tablet') return;
    if (selectedClip) {
      setTabletInspectorOpen(true);
      if (!isTabletLandscape || window.innerWidth <= 900) {
        setTabletAssetOpen(false);
      }
    }
  }, [layoutMode, isTabletLandscape, selectedClip]);

  // Live Debounced Auto-Save
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
    setShowMobileMenu(false);
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

  const mobileClipActions = selectedClip
    ? [
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
      ]
    : [];

  const mobileMainDockItems = [
    {
      label: 'Edit',
      icon: Scissors,
      onClick: () => {
        setActiveMediaCategory('media');
        toggleMobileSheet('media');
      },
    },
    {
      label: 'Audio',
      icon: Music,
      onClick: () => {
        setActiveMediaCategory('audio');
        setMobileSheet('media');
      },
    },
    {
      label: '+ Teks',
      icon: Type,
      onClick: () => {
        useTimelineStore
          .getState()
          .addTextClip('Judul Overlay', usePlaybackStore.getState().currentTime);
        setMobileSheet('inspector');
      },
    },
    {
      label: 'Subtitle',
      icon: Captions,
      onClick: () => {
        setActiveMediaCategory('subtitle');
        setMobileSheet('media');
      },
    },
    {
      label: 'Stiker',
      icon: Smile,
      onClick: () => {
        setActiveMediaCategory('sticker');
        setMobileSheet('media');
      },
    },
    {
      label: 'Efek',
      icon: Wand2,
      onClick: () => {
        setActiveMediaCategory('effects');
        setMobileSheet('media');
      },
    },
    {
      label: 'App APK',
      icon: Smartphone,
      onClick: () => setModeModalState({ open: true, tab: 'download' }),
    },
  ];

  const headerHeightClass =
    layoutMode === 'desktop'
      ? 'h-10'
      : isMobileLandscape
      ? 'h-9'
      : 'h-12';

  return (
    <div className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#0A0A0C] pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] text-[#F4F4F6] select-none">
      {/* ===================================================================== */}
      {/* TOP HEADER BAR: Minimal CapCut Android Header on Mobile vs Full Bar   */}
      {/* ===================================================================== */}
      {layoutMode === 'mobile' ? (
        <header
          className={`relative z-40 flex shrink-0 items-center justify-between border-b border-[#1E1E24] bg-[#0A0A0C] px-3 ${headerHeightClass}`}
        >
          {/* Left: [X] Reset/Clear, [≡] Studio Menu, [📱] Mode Switcher */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                clearLocalProjectSnapshot();
                useTimelineStore.getState().resetProject();
              }}
              className="rounded-md p-1.5 text-zinc-200 hover:bg-[#18181C]"
              title="Reset Proyek Baru"
              aria-label="Reset Proyek"
            >
              <X className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowMobileMenu((v) => !v)}
              className={`rounded-md p-1.5 ${
                showMobileMenu
                  ? 'bg-[#242429] text-[#00E5FF]'
                  : 'text-zinc-200 hover:bg-[#18181C]'
              }`}
              title="Menu Studio (QR, Server PC, Simpan, Pemula/Pro)"
              aria-label="Menu Studio"
            >
              <Menu className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={cycleLayoutMode}
              className="inline-flex items-center gap-1 rounded-md bg-[#18181C] px-2 py-1 text-[10px] font-medium text-[#00E5FF] ring-1 ring-[#2A2A32]"
              title="Beralih antara Tampilan Studio Android (Mobile), Tablet, dan Desktop"
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">
                {isMobileLandscape ? 'HP Lanskap' : 'HP'}
              </span>
            </button>
          </div>

          {/* Center: Clean CapCut Android Resolution Pill [1080P ▾] */}
          <select
            aria-label="Resolusi Kanvas"
            value={`${resolution.width}x${resolution.height}x${resolution.fps}`}
            onChange={(e) => {
              const found = PRESET_RESOLUTIONS.find(
                (r) => `${r.width}x${r.height}x${r.fps}` === e.target.value
              );
              if (found) useTimelineStore.getState().setResolution(found);
            }}
            className="rounded-md bg-[#18181C] px-2.5 py-1 text-[11px] font-semibold text-zinc-100 ring-1 ring-[#2A2A32] outline-none"
          >
            {PRESET_RESOLUTIONS.map((r) => (
              <option
                key={`${r.width}x${r.height}x${r.fps}`}
                value={`${r.width}x${r.height}x${r.fps}`}
              >
                {r.height >= 1080 ? '1080P' : '720P'} · {r.fps}fps ({r.width}×{r.height})
              </option>
            ))}
          </select>

          {/* Right: [?] + Bright Cyan CapCut Export Pill */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowHelpModal(true)}
              className="rounded-md p-1.5 text-zinc-300 hover:bg-[#18181C]"
              title="Panduan & Shortcut"
              aria-label="Bantuan"
            >
              <HelpCircle className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              aria-label="Ekspor MP4"
              className="inline-flex items-center gap-1 rounded-md bg-[#00E5FF] px-3 py-1 text-xs font-extrabold text-zinc-950 shadow-sm active:scale-95"
              title="Ekspor Video MP4 Tanpa Watermark"
            >
              <span>Ekspor</span>
            </button>
          </div>

          {/* Mobile Overflow Studio Menu Popover */}
          {showMobileMenu && (
            <div
              role="menu"
              className="absolute top-12 left-3 z-60 w-64 space-y-2.5 rounded-xl border border-[#2A2A32] bg-[#202026] p-3 text-xs shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-[#2A2A32] pb-2">
                <span className="font-bold text-white">
                  SWAVE <span className="text-[#00E5FF]">Video</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowMobileMenu(false)}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <label className="block space-y-1">
                <span className="text-[10px] text-zinc-400">Nama Proyek</span>
                <input
                  type="text"
                  aria-label="Nama Proyek"
                  value={projectName}
                  onChange={(e) =>
                    useTimelineStore.getState().setProjectName(e.target.value)
                  }
                  className="w-full rounded border border-[#2A2A32] bg-[#111114] px-2 py-1 text-xs text-white"
                />
              </label>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setExperienceMode('beginner')}
                  className={`rounded py-1 font-semibold ${
                    experienceMode === 'beginner'
                      ? 'bg-[#00E5FF] text-zinc-950'
                      : 'bg-[#18181C] text-zinc-400'
                  }`}
                >
                  Pemula
                </button>
                <button
                  type="button"
                  onClick={() => setExperienceMode('pro')}
                  className={`rounded py-1 font-semibold ${
                    experienceMode === 'pro'
                      ? 'bg-violet-500 text-zinc-950'
                      : 'bg-[#18181C] text-zinc-400'
                  }`}
                >
                  Pro
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowMobileMenu(false);
                  void handleSaveProject();
                }}
                className="flex w-full items-center gap-2 rounded-lg bg-[#242429] px-2.5 py-2 text-left text-zinc-100"
              >
                <Save className="h-3.5 w-3.5 text-[#00E5FF]" />
                <span>{saveFeedback || 'Simpan Proyek ke Perangkat'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMobileMenu(false);
                  setModeModalState({ open: true, tab: 'mode' });
                }}
                className="flex w-full items-center gap-2 rounded-lg bg-[#242429] px-2.5 py-2 text-left text-zinc-100"
              >
                {runtimeMode === 'server' ? (
                  <Server className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Cpu className="h-3.5 w-3.5 text-[#00E5FF]" />
                )}
                <span>
                  Mode: {runtimeMode === 'server' ? 'Server PC' : 'Mandiri di HP'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMobileMenu(false);
                  setHubModalState({ open: true, tab: 'connect' });
                }}
                className="flex w-full items-center gap-2 rounded-lg bg-[#242429] px-2.5 py-2 text-left text-zinc-100"
              >
                <QrCode className="h-3.5 w-3.5 text-[#00E5FF]" />
                <span>Multi-Device / QR Hub</span>
              </button>
            </div>
          )}
        </header>
      ) : (
        /* DESKTOP & TABLET TOP HEADER BAR */
        <header
          className={`relative z-40 flex shrink-0 items-center justify-between border-b border-[#2A2A32] bg-[#18181C] px-3 ${headerHeightClass}`}
        >
          <div className="flex min-w-0 items-center gap-2">
            {layoutMode === 'tablet' && (
              <button
                type="button"
                onClick={() => {
                  const next = !tabletAssetOpen;
                  setTabletAssetOpen(next);
                  if (next && (!isTabletLandscape || window.innerWidth <= 900)) {
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
              <span className="text-xs font-extrabold tracking-tight text-white sm:text-sm">
                SWAVE <span className="text-[#00E5FF]">Video</span>
              </span>
              <span className="ml-1 hidden rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-300 xl:inline">
                100% GRATIS
              </span>
            </div>

            <div className="h-4 w-px bg-[#2A2A32]" />

            <input
              type="text"
              aria-label="Nama Proyek"
              value={projectName}
              onChange={(e) =>
                useTimelineStore.getState().setProjectName(e.target.value)
              }
              className="w-28 truncate rounded border border-transparent bg-transparent px-1.5 py-0.5 text-xs font-medium text-zinc-200 hover:border-[#2A2A32] focus:border-[#00E5FF] focus:bg-[#242429] focus:outline-none lg:w-48"
            />

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

          <div className="flex shrink-0 items-center gap-1.5">
            {/* Pemula vs Pro Switcher */}
            <div
              role="group"
              aria-label="Mode Pengalaman Editor"
              className="inline-flex items-center rounded-md border border-[#2A2A32] bg-[#111114] p-0.5 text-[11px]"
            >
              <button
                type="button"
                onClick={() => setExperienceMode('beginner')}
                className={`rounded px-2 py-0.5 font-semibold transition ${
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
                className={`rounded px-2 py-0.5 font-semibold transition ${
                  experienceMode === 'pro'
                    ? 'bg-violet-500 text-zinc-950'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Mode Pro (100% Gratis): Kontrol NLE penuh, color shader presisi, ripple & shortcuts"
              >
                Pro
              </button>
            </div>

            <button
              type="button"
              onClick={() => setHubModalState({ open: true, tab: 'connect' })}
              className="inline-flex items-center gap-1 rounded-md border border-[#00E5FF]/35 bg-[#00E5FF]/10 px-2 py-1 text-xs font-medium text-[#00E5FF] hover:bg-[#00E5FF]/20"
              title="Buka Proyek Ini di HP, Tablet, atau Laptop Lain via WiFi/LAN"
            >
              <QrCode className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">Multi-Device / QR</span>
            </button>

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
              {layoutMode === 'tablet' ? (
                <>
                  <Tablet className="h-3.5 w-3.5 text-violet-400" />
                  <span className="hidden md:inline">
                    {isTabletLandscape ? 'Tablet' : 'Tablet Potret'}
                  </span>
                </>
              ) : (
                <>
                  <Monitor className="h-3.5 w-3.5 text-zinc-300" />
                  <span className="hidden md:inline">Mode Desktop</span>
                </>
              )}
            </button>

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
              <span className="hidden 2xl:inline">App HP</span>
            </button>

            {experienceMode === 'pro' && (
              <button
                type="button"
                onClick={() => setShowDiagnostics((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-xs ${
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

            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              className="inline-flex items-center gap-1 rounded-md bg-[#00E5FF] px-2.5 py-1 text-xs font-bold text-zinc-950 shadow-sm hover:brightness-110"
              title="Ekspor Video MP4 Tanpa Watermark"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Ekspor MP4</span>
            </button>

            <button
              type="button"
              onClick={() => {
                clearLocalProjectSnapshot();
                useTimelineStore.getState().resetProject();
              }}
              className="inline-flex items-center rounded-md border border-[#2A2A32] bg-[#242429] p-1 text-xs text-zinc-400 hover:text-zinc-100"
              title="Reset Proyek Baru"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>

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
            </div>
          )}
        </header>
      )}

      {/* ===================================================================== */}
      {/* LAYOUT 1B: MOBILE LANDSCAPE / ROTATED APK (Side Rail + Side Overlay)  */}
      {/* ===================================================================== */}
      {layoutMode === 'mobile' && isMobileLandscape ? (
        <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[#0A0A0C]">
          {/* Main Horizontal Stack: Canvas Upper (46%) + Slim Transport (32px) + Timeline Lower (flex-1) */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex h-[46%] min-h-[115px] shrink-0 overflow-hidden">
              <PreviewViewport
                layoutMode="mobile"
                compactLandscape
                activeClipName={
                  selectedClip && mobileSheet === 'none' ? selectedClip.name : null
                }
              />
            </div>

            <MobileTransportStrip
              compactLandscape
              isFullscreen={mobileFullscreen}
              onToggleFullscreen={() => setMobileFullscreen((v) => !v)}
              onSave={() => void handleSaveProject()}
            />

            {!mobileFullscreen && (
              <TimelineContainer
                layoutMode="mobile"
                compactLandscape
                onAddMediaClick={() => {
                  setActiveMediaCategory('media');
                  setMobileSheet('media');
                }}
                onQuickAudioClick={() => {
                  setActiveMediaCategory('audio');
                  setMobileSheet('media');
                }}
                onQuickTextClick={() => {
                  useTimelineStore
                    .getState()
                    .addTextClip('Judul Overlay', usePlaybackStore.getState().currentTime);
                  setMobileSheet('inspector');
                }}
                onCoverClick={() => captureCurrentCanvasSnapshot()}
              />
            )}
          </div>

          {/* Side Overlay Tool Sheet in Landscape (so Video Canvas remains fully visible on the left!) */}
          {mobileSheet !== 'none' && (
            <div
              role="dialog"
              aria-label="Panel Alat Mobile"
              className="absolute top-0 right-[58px] bottom-0 z-50 flex w-[320px] max-w-[46vw] flex-col border-l border-[#2A2A32] bg-[#202026] shadow-2xl"
            >
              <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#2A2A32] px-3">
                <span className="text-xs font-semibold text-zinc-100">
                  {mobileSheet === 'media'
                    ? 'Media, Audio & Efek'
                    : mobileSheet === 'export'
                    ? 'Ekspor'
                    : 'Edit & Shader'}
                </span>
                <button
                  type="button"
                  onClick={() => setMobileSheet('none')}
                  className="inline-flex items-center gap-1 rounded bg-[#242429] px-2 py-1 text-[11px] font-semibold text-[#00E5FF]"
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

          {/* Landscape Right Vertical Contextual Rail (58px) */}
          <nav
            aria-label="Navigasi Studio Android"
            className="no-scrollbar z-40 flex w-[58px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-l border-[#2A2A32] bg-[#18181C] py-1.5"
          >
            {selectedClip && mobileSheet === 'none' ? (
              <>
                <button
                  type="button"
                  onClick={() => useTimelineStore.getState().clearSelection()}
                  className="flex h-9 w-11 shrink-0 items-center justify-center rounded-lg bg-[#242429] text-zinc-200"
                  aria-label="Kembali"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {mobileClipActions.map((act) => {
                  const ActIcon = act.icon;
                  return (
                    <button
                      key={act.label}
                      type="button"
                      onClick={act.onClick}
                      className="flex h-11 w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg text-zinc-200 hover:bg-[#242429]"
                    >
                      <ActIcon className="h-3.5 w-3.5 text-zinc-100" />
                      <span className="text-[9px]">{act.label}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setModeModalState({ open: true, tab: 'download' })}
                  className="mt-auto flex h-10 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-[#242429] text-[#00E5FF]"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  <span className="text-[9px]">App APK</span>
                </button>
              </>
            ) : (
              mobileMainDockItems.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={item.onClick}
                    className="flex h-11 w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg text-zinc-200 hover:bg-[#242429]"
                  >
                    <ItemIcon className="h-4 w-4 text-zinc-100" />
                    <span className="text-[9px]">{item.label}</span>
                  </button>
                );
              })
            )}
          </nav>
        </div>
      ) : layoutMode === 'mobile' ? (
        /* =================================================================== */
        /* LAYOUT 1A: MOBILE PORTRAIT — Classic CapCut Android 5-Zone Studio    */
        /* =================================================================== */
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0A0A0C]">
          {/* ZONA 2: Video Canvas (flex-1 ~44dvh, 12px padding) */}
          <PreviewViewport
            layoutMode="mobile"
            activeClipName={
              selectedClip && mobileSheet === 'none' ? selectedClip.name : null
            }
          />

          {/* ZONA 3: Transport & History Strip (40px) */}
          <MobileTransportStrip
            compactLandscape={false}
            isFullscreen={mobileFullscreen}
            onToggleFullscreen={() => setMobileFullscreen((v) => !v)}
            onSave={() => void handleSaveProject()}
          />

          {/* ZONA 4: Timeline Area (34dvh, 50vw padding, static white center beam) */}
          {!mobileFullscreen && (
            <TimelineContainer
              layoutMode="mobile"
              onAddMediaClick={() => {
                setActiveMediaCategory('media');
                setMobileSheet('media');
              }}
              onQuickAudioClick={() => {
                setActiveMediaCategory('audio');
                setMobileSheet('media');
              }}
              onQuickTextClick={() => {
                useTimelineStore
                  .getState()
                  .addTextClip('Judul Overlay', usePlaybackStore.getState().currentTime);
                setMobileSheet('inspector');
              }}
              onCoverClick={() => captureCurrentCanvasSnapshot()}
            />
          )}

          {/* Slide-Over Bottom Sheet (44dvh covering ONLY Zona 4 + Zona 5) */}
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
                      : 'Pengaturan Klip'}
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
                  className="flex h-12 w-10 shrink-0 items-center justify-center rounded-lg bg-[#242429] text-zinc-100"
                  title="Kembali ke menu utama"
                  aria-label="Kembali"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <div className="no-scrollbar flex flex-1 items-center gap-1 overflow-x-auto px-1">
                  {mobileClipActions.map((act) => {
                    const ActIcon = act.icon;
                    return (
                      <button
                        key={act.label}
                        type="button"
                        onClick={act.onClick}
                        className="flex h-12 min-w-[54px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-2 text-zinc-200 hover:bg-[#242429] active:scale-95"
                      >
                        <ActIcon className="h-4 w-4 text-zinc-100" />
                        <span className="text-[10px] font-medium">{act.label}</span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setModeModalState({ open: true, tab: 'download' })}
                  className="flex h-12 shrink-0 flex-col items-center justify-center gap-1 rounded-lg bg-[#242429] px-2 text-[#00E5FF]"
                >
                  <Smartphone className="h-4 w-4" />
                  <span className="text-[10px] font-medium">App APK</span>
                </button>
              </div>
            ) : (
              <div className="no-scrollbar flex w-full items-center justify-between gap-0.5 overflow-x-auto px-1">
                {mobileMainDockItems.map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={item.onClick}
                      className="flex h-12 min-w-[50px] flex-1 shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-zinc-200 hover:bg-[#242429] active:scale-95"
                    >
                      <ItemIcon className="h-4 w-4 text-zinc-100" />
                      <span className="text-[10.5px] font-medium">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </nav>
        </div>
      ) : layoutMode === 'tablet' ? (
        /* =================================================================== */
        /* LAYOUT 2: TABLET — Portrait (Overlay Drawers) vs Landscape (Docked)  */
        /* =================================================================== */
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            className={`relative flex shrink-0 overflow-hidden bg-[#0A0A0C] ${
              isTabletLandscape
                ? 'h-[calc(60dvh-48px)] min-h-[220px]'
                : 'h-[calc(52dvh-48px)] min-h-[240px]'
            }`}
          >
            {/* Vertical Icon Rail (56px) */}
            <nav
              aria-label="Rail Alat Tablet"
              className="z-30 flex w-14 shrink-0 flex-col items-center gap-1.5 border-r border-[#2A2A32] bg-[#18181C] py-2"
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
                        if (!isTabletLandscape || window.innerWidth <= 900) {
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

            {/* Left Asset Drawer (Docked in Landscape / Slide-Over Overlay in Portrait) */}
            {tabletAssetOpen && (
              <div
                className={
                  isTabletLandscape
                    ? 'w-[240px] shrink-0 border-r border-[#2A2A32] bg-[#18181C]'
                    : 'absolute top-0 bottom-0 left-14 z-40 w-[260px] border-r border-[#2A2A32] bg-[#202026] shadow-2xl'
                }
              >
                <MediaBinPanel
                  mode="drawer"
                  hideRail
                  onCloseDrawer={() => setTabletAssetOpen(false)}
                />
              </div>
            )}

            {/* Center Viewport */}
            <div className="flex min-w-[300px] flex-1 overflow-hidden">
              <PreviewViewport layoutMode="tablet" />
            </div>

            {/* Right Inspector Drawer (Docked in Landscape / Slide-Over Overlay in Portrait) */}
            {tabletInspectorOpen && (
              <div
                className={
                  isTabletLandscape
                    ? 'w-[260px] shrink-0 border-l border-[#2A2A32] bg-[#18181C]'
                    : 'absolute top-0 right-0 bottom-0 z-40 w-[270px] border-l border-[#2A2A32] bg-[#202026] shadow-2xl'
                }
              >
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
          <div
            className="flex shrink-0 overflow-hidden"
            style={{ height: `${upperPanePct}%` }}
          >
            <div
              className="shrink-0 overflow-hidden border-r border-[#2A2A32]"
              style={{ width: leftPaneWidth }}
            >
              <MediaBinPanel mode="sidebar" />
            </div>

            <div
              role="separator"
              aria-orientation="vertical"
              onPointerDown={(e) => startHorizontalDrag('left', e)}
              className="w-1 shrink-0 cursor-ew-resize bg-[#2A2A32] transition-colors hover:bg-[#00E5FF]"
              title="Geser lebar panel aset"
            />

            <div className="flex min-w-[420px] flex-1 overflow-hidden">
              <PreviewViewport layoutMode="desktop" />
            </div>

            <div
              role="separator"
              aria-orientation="vertical"
              onPointerDown={(e) => startHorizontalDrag('right', e)}
              className="w-1 shrink-0 cursor-ew-resize bg-[#2A2A32] transition-colors hover:bg-[#00E5FF]"
              title="Geser lebar panel inspektor"
            />

            <div
              className="shrink-0 overflow-hidden border-l border-[#2A2A32]"
              style={{ width: rightPaneWidth }}
            >
              <InspectorPanel mode="sidebar" />
            </div>
          </div>

          <div
            role="separator"
            aria-orientation="horizontal"
            onPointerDown={startVerticalDrag}
            className="h-1 shrink-0 cursor-ns-resize bg-[#2A2A32] transition-colors hover:bg-[#00E5FF]"
            title="Geser tinggi area pratinjau dan timeline"
          />

          <TimelineContainer layoutMode="desktop" />
        </div>
      )}

      {/* Modals */}
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
