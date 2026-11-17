import { useEffect, useRef, useState } from 'react';
import {
  Captions,
  ChevronLeft,
  ChevronRight,
  Grid,
  Pause,
  Play,
  Repeat,
  SkipBack,
  Sparkles,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { PRESET_RESOLUTIONS } from '@velocut/shared';
import {
  generateSyntheticDemoMedia,
  probeAndRegisterMediaFile,
} from '../engine/mediaProbe';
import { mediaRuntime } from '../engine/mediaRuntime';
import { usePlaybackStore } from '../stores/playbackStore';
import {
  getTimelineDuration,
  useTimelineStore,
} from '../stores/timelineStore';
import { type SafeGuideMode, useUiStore } from '../stores/uiStore';
import { formatTimecode } from '../utils/format';
import { CanvasOverlayGizmo } from './CanvasOverlayGizmo';

function TimecodeReadout({ fps }: { fps: number }) {
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const clips = useTimelineStore((s) => s.clips);
  const totalDur = getTimelineDuration(clips, 0);

  return (
    <div className="font-mono text-[11px] tabular-nums text-zinc-200 sm:text-xs">
      <span className="text-cyan-400">{formatTimecode(currentTime, fps)}</span>
      <span className="mx-1 text-zinc-600 sm:mx-1.5">/</span>
      <span className="text-zinc-400">{formatTimecode(totalDur, fps)}</span>
    </div>
  );
}

export function PreviewViewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageBoxRef = useRef<HTMLDivElement>(null);
  const quickImportRef = useRef<HTMLInputElement>(null);
  const [backendLabel, setBackendLabel] = useState<'webgl2' | 'canvas2d' | 'none'>('none');
  const [isQuickBusy, setIsQuickBusy] = useState(false);

  const experienceMode = useUiStore((s) => s.experienceMode);
  const safeGuideMode = useUiStore((s) => s.safeGuideMode);
  const setSafeGuideMode = useUiStore((s) => s.setSafeGuideMode);
  const setActiveMediaCategory = useUiStore((s) => s.setActiveMediaCategory);

  const resolution = useTimelineStore((s) => s.resolution);
  const canvasBackground = useTimelineStore((s) => s.canvasBackground);
  const clips = useTimelineStore((s) => s.clips);
  const tracks = useTimelineStore((s) => s.tracks);
  const trackOrder = useTimelineStore((s) => s.trackOrder);
  const assets = useTimelineStore((s) => s.assets);

  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const isLooping = usePlaybackStore((s) => s.isLooping);
  const isMuted = usePlaybackStore((s) => s.isMuted);
  const volume = usePlaybackStore((s) => s.volume);
  const playbackRate = usePlaybackStore((s) => s.playbackRate);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    mediaRuntime.attachCanvas(canvas);
    setBackendLabel(mediaRuntime.getCompositorBackend());
    mediaRuntime.startLoop();

    return () => {
      mediaRuntime.stopLoop();
      mediaRuntime.attachCanvas(null);
    };
  }, [resolution.width, resolution.height]);

  useEffect(() => {
    const pb = usePlaybackStore.getState();
    mediaRuntime.renderFrameAt(pb.currentTime, pb.isPlaying);
  }, [clips, tracks, trackOrder, assets, resolution, canvasBackground]);

  const fps = resolution.fps || 30;
  const maxDur = getTimelineDuration(clips, 10);

  const handleQuickImportFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsQuickBusy(true);
    try {
      for (const file of Array.from(files)) {
        const asset = await probeAndRegisterMediaFile(file, file.name, file.type);
        useTimelineStore.getState().registerAsset(asset);
        useTimelineStore.getState().addClipFromAsset(asset.id);
      }
    } finally {
      setIsQuickBusy(false);
    }
  };

  const handleQuickDemo = async () => {
    setIsQuickBusy(true);
    try {
      const { visualAsset, audioAsset } = await generateSyntheticDemoMedia();
      const store = useTimelineStore.getState();
      store.registerAsset(visualAsset);
      store.registerAsset(audioAsset);
      store.addClipFromAsset(visualAsset.id, 'track-1', 0);
      store.addTextClip(
        'VeloCut Hybrid-Edge Studio\nSubtitle Otomatis + 60 FPS',
        0.4,
        'track-2'
      );
      store.addClipFromAsset(audioAsset.id, 'track-3', 0);
      usePlaybackStore.getState().seekTo(0);
    } finally {
      setIsQuickBusy(false);
    }
  };

  const cycleSafeGuide = () => {
    const order: SafeGuideMode[] = ['none', 'thirds', 'tiktok', 'youtube'];
    const idx = order.indexOf(safeGuideMode);
    setSafeGuideMode(order[(idx + 1) % order.length]);
  };

  return (
    <main className="flex min-h-[195px] min-w-0 shrink-0 flex-col bg-[#09090c] max-lg:h-[34dvh] sm:max-lg:h-[38dvh] lg:min-h-0 lg:flex-1">
      {/* Stage Top Bar */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 px-2.5 py-1.5 lg:px-4 lg:py-2">
        <div className="flex items-center gap-2">
          <span className="rounded bg-zinc-800/90 px-1.5 py-0.5 font-mono text-[10px] uppercase text-cyan-300">
            {experienceMode === 'pro'
              ? backendLabel === 'webgl2'
                ? 'WebGL2 GLSL'
                : 'Canvas2D'
              : 'Pratinjau'}
          </span>
          <span className="hidden text-xs text-zinc-400 sm:inline">
            {resolution.width} × {resolution.height} @ {fps}fps
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <select
            aria-label="Resolusi Kanvas"
            value={`${resolution.width}x${resolution.height}x${resolution.fps}`}
            onChange={(e) => {
              const found = PRESET_RESOLUTIONS.find(
                (r) => `${r.width}x${r.height}x${r.fps}` === e.target.value
              );
              if (found) useTimelineStore.getState().setResolution(found);
            }}
            className="max-w-[165px] rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 outline-none focus:border-cyan-500 sm:max-w-none sm:text-xs"
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

          <button
            type="button"
            onClick={cycleSafeGuide}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors ${
              safeGuideMode !== 'none'
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
            }`}
            title="Ganti Panduan Bingkai / Zona Aman (Grid 3x3 / TikTok / YouTube)"
          >
            <Grid className="h-3.5 w-3.5" />
            {safeGuideMode !== 'none' && (
              <span className="hidden uppercase sm:inline">{safeGuideMode}</span>
            )}
          </button>
        </div>
      </div>

      {/* Canvas Container */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center p-2 lg:p-4"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) {
            useTimelineStore.getState().clearSelection();
          }
        }}
      >
        <div
          ref={stageBoxRef}
          onPointerDown={(e) => {
            if (e.target === canvasRef.current) {
              useTimelineStore.getState().clearSelection();
            }
          }}
          className="relative flex max-h-full max-w-full items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-black shadow-2xl"
          style={{ aspectRatio: `${resolution.width} / ${resolution.height}` }}
        >
          <canvas
            ref={canvasRef}
            width={resolution.width}
            height={resolution.height}
            className="h-full w-full object-contain"
          />

          {/* Interactive CapCut On-Canvas Drag, Resize, Rotate & Direct Text Edit Gizmo */}
          <CanvasOverlayGizmo
            containerRef={stageBoxRef}
            resolution={resolution}
          />

          {/* Visual Safe Area Guides */}
          {safeGuideMode === 'thirds' && (
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="border border-cyan-400/20" />
              ))}
            </div>
          )}

          {safeGuideMode === 'tiktok' && (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute top-6 right-2 bottom-20 w-10 rounded-lg border border-dashed border-rose-400/40 bg-rose-500/5" />
              <div className="absolute right-14 bottom-3 left-3 h-16 rounded-lg border border-dashed border-amber-400/40 bg-amber-500/5" />
              <span className="absolute top-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">
                Zona Aman TikTok / Reels
              </span>
            </div>
          )}

          {safeGuideMode === 'youtube' && (
            <div className="pointer-events-none absolute inset-0 border-[10px] border-cyan-500/15">
              <div className="h-full w-full border border-dashed border-cyan-400/35" />
            </div>
          )}

          {/* Friendly Quick-Start Card when timeline is empty */}
          {Object.keys(clips).length === 0 && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-950/75 px-3 text-center backdrop-blur-[2px]">
              <input
                ref={quickImportRef}
                type="file"
                multiple
                accept="video/*,audio/*,image/*"
                className="hidden"
                onChange={(e) => {
                  void handleQuickImportFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <p className="text-xs font-bold text-white sm:text-sm">
                Mulai Proyek Video Anda
              </p>
              <p className="mt-0.5 hidden text-[11px] text-zinc-400 sm:block">
                Impor video atau foto, tambahkan subtitle otomatis dalam 1 klik, lalu ekspor MP4 tanpa watermark.
              </p>

              <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
                <button
                  type="button"
                  disabled={isQuickBusy}
                  onClick={() => quickImportRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-[11px] font-bold text-zinc-950 shadow-md hover:bg-cyan-400 disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>{isQuickBusy ? 'Memuat...' : 'Impor Video / Foto'}</span>
                </button>

                <button
                  type="button"
                  disabled={isQuickBusy}
                  onClick={() => void handleQuickDemo()}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 hover:border-cyan-400"
                >
                  <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Muat Demo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveMediaCategory('subtitle')}
                  className="hidden items-center gap-1 rounded-lg border border-violet-500/40 bg-violet-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-violet-200 hover:bg-violet-500/25 sm:inline-flex"
                >
                  <Captions className="h-3.5 w-3.5" />
                  <span>Subtitle AI</span>
                </button>
              </div>

              <div className="mt-2 hidden items-center gap-1.5 sm:flex">
                <span className="text-[10px] text-zinc-500">Format cepat:</span>
                {[
                  { label: '16:9 YouTube', idx: 0 },
                  { label: '9:16 TikTok', idx: 1 },
                  { label: '1:1 Feed', idx: 2 },
                ].map((fmt) => {
                  const preset = PRESET_RESOLUTIONS[fmt.idx];
                  const isCurrent =
                    resolution.width === preset.width &&
                    resolution.height === preset.height;
                  return (
                    <button
                      key={fmt.label}
                      type="button"
                      onClick={() => useTimelineStore.getState().setResolution(preset)}
                      className={`rounded border px-2 py-0.5 text-[10px] font-medium transition ${
                        isCurrent
                          ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {fmt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transport Controls */}
      <div className="flex items-center justify-between border-t border-zinc-800/80 bg-zinc-900/50 px-2.5 py-1.5 lg:px-4 lg:py-2">
        <TimecodeReadout fps={fps} />

        <div className="flex items-center gap-1 sm:gap-1.5">
          <button
            type="button"
            onClick={() => {
              usePlaybackStore.getState().seekTo(0);
              mediaRuntime.renderFrameAt(0, usePlaybackStore.getState().isPlaying);
            }}
            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 active:bg-zinc-700"
            title="Ke Awal (00:00)"
          >
            <SkipBack className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              usePlaybackStore.getState().stepTime(-1 / fps, maxDur);
              mediaRuntime.renderFrameAt(
                usePlaybackStore.getState().currentTime,
                false
              );
            }}
            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 active:bg-zinc-700"
            title="Mundur 1 Frame (ArrowLeft)"
          >
            <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              mediaRuntime.unlockAudio();
              usePlaybackStore.getState().togglePlay();
            }}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="flex h-8 w-10 items-center justify-center rounded-md bg-cyan-500 text-zinc-950 shadow-md shadow-cyan-500/20 transition hover:bg-cyan-400 active:scale-95"
            title="Play / Pause (Space)"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4 fill-current" />
            ) : (
              <Play className="h-4 w-4 fill-current" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              usePlaybackStore.getState().stepTime(1 / fps, maxDur);
              mediaRuntime.renderFrameAt(
                usePlaybackStore.getState().currentTime,
                false
              );
            }}
            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 active:bg-zinc-700"
            title="Maju 1 Frame (ArrowRight)"
          >
            <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>

          <button
            type="button"
            onClick={() => usePlaybackStore.getState().toggleLoop()}
            className={`rounded p-1.5 transition-colors ${
              isLooping
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
            }`}
            title="Loop Playback"
          >
            <Repeat className="h-3.5 w-3.5" />
          </button>

          {experienceMode === 'pro' && (
            <button
              type="button"
              onClick={() => {
                const rates = [0.5, 1, 1.5, 2];
                const idx = rates.indexOf(playbackRate);
                usePlaybackStore
                  .getState()
                  .setPlaybackRate(rates[(idx + 1) % rates.length]);
              }}
              className="hidden rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-300 hover:border-cyan-400 sm:inline-block"
              title="Kecepatan Preview Shuttle (J / K / L)"
            >
              {playbackRate}x
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => usePlaybackStore.getState().toggleMute()}
            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Toggle Mute"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="h-4 w-4 text-rose-400" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>
          <input
            type="range"
            aria-label="Master Volume"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={(e) =>
              usePlaybackStore.getState().setVolume(Number(e.target.value))
            }
            className="hidden h-1.5 w-20 accent-cyan-400 sm:block"
          />
        </div>
      </div>
    </main>
  );
}
