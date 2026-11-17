import { useEffect, useState } from 'react';
import {
  Captions,
  Check,
  ChevronDown,
  Cpu,
  Download,
  Film,
  FolderOpen,
  FolderPlus,
  HelpCircle,
  Monitor,
  QrCode,
  RotateCcw,
  Save,
  Server,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Tablet,
  Type,
  X,
} from 'lucide-react';
import type { ServerCapabilities } from '@velocut/shared';
import {
  clearLocalProjectSnapshot,
  hydrateProjectMediaAssets,
  loadLocalProjectSnapshot,
  saveProjectLocally,
} from '../engine/localPersistence';
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
import { useTimelineStore } from '../stores/timelineStore';
import {
  hasExplicitRuntimePreference,
  isStaticStandaloneHost,
  useUiStore,
} from '../stores/uiStore';
import { ExportModal } from './ExportModal';
import { HelpShortcutsModal } from './HelpShortcutsModal';
import { InspectorPanel } from './InspectorPanel';
import { MediaBinPanel } from './MediaBinPanel';
import { MultiDeviceHubModal } from './MultiDeviceHubModal';
import { PreviewViewport } from './PreviewViewport';
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

  const [layoutMode, setLayoutMode] = useState<DeviceLayoutMode>(() =>
    detectDeviceLayout()
  );
  const [mobileSheet, setMobileSheet] = useState<MobileSheetType>('none');
  const [tabletSideTab, setTabletSideTab] = useState<'media' | 'inspector'>(
    'media'
  );

  const pwa = usePwaInstall();
  const experienceMode = useUiStore((s) => s.experienceMode);
  const setExperienceMode = useUiStore((s) => s.setExperienceMode);
  const runtimeMode = useUiStore((s) => s.runtimeMode);
  const setRuntimeMode = useUiStore((s) => s.setRuntimeMode);
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
            // Project does not exist on server yet; will be created on first save
          }
        }
      });
    }

    const onResize = () => {
      setLayoutMode(detectDeviceLayout());
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [setRuntimeMode]);

  // Debounced Live Auto-Save (Local Offline Browser Storage + optional PC Server)
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
    setLayoutMode((prev) =>
      prev === 'desktop' ? 'mobile' : prev === 'mobile' ? 'tablet' : 'desktop'
    );
  };

  const toggleMobileSheet = (target: Exclude<MobileSheetType, 'none'>) => {
    setMobileSheet((prev) => (prev === target ? 'none' : target));
  };

  return (
    <div className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-zinc-950 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-zinc-100">
      {/* Studio Top Bar */}
      <header className="relative flex h-11 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-2.5 lg:h-12 lg:px-4">
        <div className="flex min-w-0 items-center gap-2 lg:gap-3">
          <div className="flex items-center gap-1.5 lg:gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-cyan-400 to-sky-600 text-zinc-950 shadow-sm">
              <Film className="h-4 w-4" />
            </div>
            <div className="flex items-center">
              <span className="text-sm font-bold tracking-tight text-white">
                VeloCut
              </span>
              <span className="ml-1.5 hidden rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-300 sm:inline">
                100% GRATIS
              </span>
            </div>
          </div>

          <div className="h-4 w-px bg-zinc-800" />

          <input
            type="text"
            aria-label="Nama Proyek"
            value={projectName}
            onChange={(e) =>
              useTimelineStore.getState().setProjectName(e.target.value)
            }
            className="w-24 truncate rounded border border-transparent bg-transparent px-1.5 py-1 text-xs font-medium text-zinc-200 hover:border-zinc-800 focus:border-cyan-500 focus:bg-zinc-900 focus:outline-none sm:w-40 lg:w-52"
          />

          <button
            type="button"
            onClick={() => setHubModalState({ open: true, tab: 'projects' })}
            className="hidden items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:border-cyan-500/50 hover:text-cyan-300 md:inline-flex"
            title="Buka atau ganti Proyek Bersama di Server PC"
          >
            <FolderOpen className="h-3.5 w-3.5 text-cyan-400" />
            <span>Proyek</span>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 lg:gap-2">
          {/* Amateur (Pemula) vs Professional (Pro) Experience Mode Switcher */}
          <div
            role="group"
            aria-label="Mode Pengalaman Editor"
            className="inline-flex items-center rounded-md border border-zinc-800 bg-zinc-900 p-0.5 text-[11px]"
          >
            <button
              type="button"
              onClick={() => setExperienceMode('beginner')}
              className={`rounded px-2 py-0.5 font-semibold transition ${experienceMode === 'beginner'
                ? 'bg-cyan-500 text-zinc-950'
                : 'text-zinc-400 hover:text-zinc-200'
                }`}
              title="Mode Pemula: Tampilan simpel, istilah mudah, preset 1-klik"
            >
              Pemula
            </button>
            <button
              type="button"
              onClick={() => setExperienceMode('pro')}
              className={`rounded px-2 py-0.5 font-semibold transition ${experienceMode === 'pro'
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
            className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-1 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25"
            title="Buka Proyek Ini di HP, Tablet, atau Laptop Lain via WiFi/LAN"
          >
            <QrCode className="h-3.5 w-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Multi-Device / QR</span>
          </button>

          {/* Switch HP / Tablet / Desktop Layout Mode */}
          <button
            type="button"
            onClick={cycleLayoutMode}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition ${layoutMode !== 'desktop'
              ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
              : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
              }`}
            title="Beralih antara Tampilan Studio Android (Mobile), Tablet, dan Desktop"
          >
            {layoutMode === 'mobile' ? (
              <>
                <Smartphone className="h-3.5 w-3.5 text-cyan-400" />
                <span className="hidden md:inline">Mode HP</span>
              </>
            ) : layoutMode === 'tablet' ? (
              <>
                <Tablet className="h-3.5 w-3.5 text-violet-400" />
                <span className="hidden md:inline">Mode Tablet</span>
              </>
            ) : (
              <>
                <Monitor className="h-3.5 w-3.5 text-zinc-400" />
                <span className="hidden md:inline">Mode Desktop</span>
              </>
            )}
          </button>

          {/* Runtime Mode Switcher (Mandiri On-Device vs Server PC) */}
          <button
            type="button"
            onClick={() => setModeModalState({ open: true, tab: 'mode' })}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition ${
              runtimeMode === 'server' && serverCaps?.status === 'online'
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                : 'border-cyan-500/35 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20'
            }`}
            title="Pilih Mode Operasi: Mandiri di Perangkat vs Perantara Server PC"
          >
            {runtimeMode === 'server' && serverCaps?.status === 'online' ? (
              <>
                <Server className="h-3.5 w-3.5 text-emerald-400" />
                <span className="hidden lg:inline">Server PC</span>
              </>
            ) : (
              <>
                <Cpu className="h-3.5 w-3.5 text-cyan-400" />
                <span className="hidden lg:inline">Di Perangkat</span>
              </>
            )}
          </button>

          {/* Android / iOS / Portable App Download & Install CTA */}
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
            <span className="hidden xl:inline">
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
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition ${caps.crossOriginIsolated && caps.hasWebCodecs
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                }`}
              title="Diagnostik Runtime V-HESA (COOP/COEP, WebCodecs, WebGL2, Server)"
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
            className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-1.5 text-xs text-zinc-300 hover:border-cyan-500/50 hover:text-cyan-300"
            title="Panduan Cepat & Daftar Shortcut Keyboard (?)"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => void handleSaveProject()}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-200 hover:border-cyan-500/50 hover:bg-zinc-800"
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
              <Save className="h-3.5 w-3.5 text-cyan-400" />
            )}
            <span className="hidden lg:inline">
              {saveFeedback || 'Simpan'}
            </span>
          </button>

          {/* Prominent 1-Click Export CTA */}
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-emerald-500 to-cyan-500 px-2.5 py-1 text-xs font-bold text-zinc-950 shadow-sm hover:brightness-110"
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
            className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-1.5 text-xs text-zinc-400 hover:text-zinc-100"
            title="Reset Proyek Baru"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Diagnostics Popover */}
        {showDiagnostics && (
          <div className="absolute top-12 right-3 z-50 w-80 rounded-lg border border-zinc-700 bg-zinc-900 p-3.5 text-xs shadow-2xl">
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
                <span
                  className={
                    caps.isSecureContext ? 'text-emerald-400' : 'text-amber-400'
                  }
                >
                  {String(caps.isSecureContext)}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-zinc-400">COOP/COEP Isolated:</span>
                <span
                  className={
                    caps.crossOriginIsolated
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }
                >
                  {String(caps.crossOriginIsolated)}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-zinc-400">WebCodecs API:</span>
                <span
                  className={
                    caps.hasWebCodecs ? 'text-emerald-400' : 'text-amber-400'
                  }
                >
                  {String(caps.hasWebCodecs)}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-zinc-400">WebGL2 GLSL:</span>
                <span
                  className={
                    caps.hasWebGL2 ? 'text-emerald-400' : 'text-amber-400'
                  }
                >
                  {String(caps.hasWebGL2)}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-zinc-400">OPFS Storage:</span>
                <span
                  className={
                    caps.hasOPFS ? 'text-emerald-400' : 'text-amber-400'
                  }
                >
                  {String(caps.hasOPFS)}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-zinc-400">Server FFmpeg:</span>
                <span
                  className={
                    serverCaps?.ffmpegAvailable
                      ? 'text-emerald-400'
                      : 'text-zinc-400'
                  }
                >
                  {serverCaps?.ffmpegAvailable
                    ? serverCaps.preferredEncoder || 'ready'
                    : 'offline / none'}
                </span>
              </li>
            </ul>
            {!caps.isSecureContext && (
              <p className="mt-2.5 rounded bg-amber-500/10 p-2 text-[11px] text-amber-300">
                Saat diakses dari HP/Tablet lewat IP LAN HTTP (`http://192.168.x.x`), VeloCut otomatis mengaktifkan fallback `MediaRecorder` untuk export lokal serta sinkronisasi penuh ke Server PC.
              </p>
            )}
          </div>
        )}
      </header>

      {/* Main Workspace: Mobile (HP) vs Tablet vs Desktop (PC/Laptop) */}
      {layoutMode === 'mobile' ? (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* 1. Top Preview Stage */}
          <PreviewViewport />

          {/* Quick Floating Pill when a clip is selected on mobile and drawer is closed */}
          {selectedClip && mobileSheet === 'none' && (
            <div className="flex items-center justify-between border-y border-cyan-500/30 bg-cyan-950/40 px-3 py-1.5 text-xs">
              <span className="truncate font-medium text-cyan-200">
                Klip aktif: {selectedClip.name}
              </span>
              <button
                type="button"
                onClick={() => setMobileSheet('inspector')}
                className="inline-flex shrink-0 items-center gap-1 rounded bg-cyan-500 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-950"
              >
                <Sparkles className="h-3 w-3" />
                <span>Edit & Shader</span>
              </button>
            </div>
          )}

          {/* 2. Middle Multi-Track Timeline */}
          <TimelineContainer />

          {/* 3. Slide-Up Bottom Sheet Drawer (keeps top PreviewViewport visible!) */}
          {mobileSheet !== 'none' && (
            <div
              role="dialog"
              aria-label="Panel Alat Mobile"
              className="absolute right-0 bottom-14 left-0 z-40 flex h-[48dvh] flex-col rounded-t-2xl border-t border-zinc-700 bg-zinc-950 shadow-[0_-12px_32px_rgba(0,0,0,0.75)]"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 px-3.5 py-2">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-8 rounded-full bg-zinc-700" />
                  <span className="text-xs font-semibold text-zinc-200">
                    {mobileSheet === 'media'
                      ? 'Media Bin & Pustaka Server PC'
                      : mobileSheet === 'export'
                        ? 'Hybrid Export (Client / Server)'
                        : 'Inspektor Klip & Shader GLSL'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileSheet('none')}
                  className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
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
                    initialTab={
                      mobileSheet === 'export' ? 'export' : 'inspector'
                    }
                  />
                )}
              </div>
            </div>
          )}

          {/* 4. Android Bottom Tool Dock */}
          <nav
            aria-label="Navigasi Studio Android"
            className="z-50 grid h-14 shrink-0 grid-cols-6 border-t border-zinc-800 bg-zinc-950 px-1"
          >
            <button
              type="button"
              onClick={() => {
                useUiStore.getState().setActiveMediaCategory('media');
                toggleMobileSheet('media');
              }}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-lg transition ${mobileSheet === 'media'
                ? 'text-cyan-400'
                : 'text-zinc-400 hover:text-zinc-200'
                }`}
            >
              <FolderPlus className="h-4 w-4" />
              <span className="text-[10px] font-medium">Media</span>
            </button>

            <button
              type="button"
              onClick={() => {
                useUiStore.getState().setActiveMediaCategory('subtitle');
                setMobileSheet('media');
              }}
              className="flex flex-col items-center justify-center gap-0.5 rounded-lg text-zinc-400 transition hover:text-cyan-300 active:scale-95"
            >
              <Captions className="h-4 w-4 text-cyan-400" />
              <span className="text-[10px] font-medium">Subtitle</span>
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
              className="flex flex-col items-center justify-center gap-0.5 rounded-lg text-zinc-400 transition hover:text-violet-300 active:scale-95"
            >
              <Type className="h-4 w-4 text-violet-400" />
              <span className="text-[10px] font-medium">+ Teks</span>
            </button>

            <button
              type="button"
              onClick={() => toggleMobileSheet('inspector')}
              className={`relative flex flex-col items-center justify-center gap-0.5 rounded-lg transition ${mobileSheet === 'inspector'
                ? 'text-cyan-400'
                : 'text-zinc-400 hover:text-zinc-200'
                }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="text-[10px] font-medium">Efek & Edit</span>
              {selectedClip && (
                <span className="absolute top-1.5 right-3 h-2 w-2 rounded-full bg-cyan-400" />
              )}
            </button>

            <button
              type="button"
              onClick={() => toggleMobileSheet('export')}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-lg transition ${mobileSheet === 'export'
                ? 'text-emerald-400'
                : 'text-zinc-400 hover:text-zinc-200'
                }`}
            >
              <Download className="h-4 w-4 text-emerald-400" />
              <span className="text-[10px] font-medium">Export</span>
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
              className="flex flex-col items-center justify-center gap-0.5 rounded-lg text-zinc-400 transition hover:text-cyan-300"
            >
              <Smartphone className="h-4 w-4 text-cyan-400" />
              <span className="text-[10px] font-medium">App APK</span>
            </button>
          </nav>
        </div>
      ) : layoutMode === 'tablet' ? (
        <>
          {/* Tablet Touch Studio: Preview on left + Tabbed Media/Inspector on right */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <PreviewViewport />
            <div className="flex w-80 shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
              <div className="grid grid-cols-2 border-b border-zinc-800 bg-zinc-900/50">
                <button
                  type="button"
                  onClick={() => setTabletSideTab('media')}
                  className={`py-2 text-xs font-semibold ${tabletSideTab === 'media'
                    ? 'border-b-2 border-cyan-400 text-cyan-300'
                    : 'text-zinc-400'
                    }`}
                >
                  Media Bin
                </button>
                <button
                  type="button"
                  onClick={() => setTabletSideTab('inspector')}
                  className={`py-2 text-xs font-semibold ${tabletSideTab === 'inspector'
                    ? 'border-b-2 border-cyan-400 text-cyan-300'
                    : 'text-zinc-400'
                    }`}
                >
                  Inspektor & Export
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                {tabletSideTab === 'media' ? (
                  <MediaBinPanel mode="sheet" />
                ) : (
                  <InspectorPanel mode="sheet" />
                )}
              </div>
            </div>
          </div>
          <TimelineContainer />
        </>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <MediaBinPanel mode="sidebar" />
            <PreviewViewport />
            <InspectorPanel mode="sidebar" />
          </div>
          <TimelineContainer />
        </>
      )}

      {/* Multi-Device Hub Modal (QR Code, LAN IP, Shared Projects) */}
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

      {/* Modal Mode Operasi (On-Device vs Server PC) & Unduh Aplikasi Android/iOS */}
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
