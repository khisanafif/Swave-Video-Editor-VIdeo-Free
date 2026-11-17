import { useEffect, useRef } from 'react';
import {
  AlignHorizontalSpaceAround,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Copy,
  FlipHorizontal2,
  Image as ImageIcon,
  Layers,
  Lock,
  Magnet,
  Maximize2,
  MousePointer2,
  Plus,
  Redo2,
  Scissors,
  Snowflake,
  Trash2,
  Unlock,
  Undo2,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Track, TrackType } from '@swave/shared';
import { useStore } from 'zustand';
import { mediaRuntime } from '../../engine/mediaRuntime';
import { usePlaybackStore } from '../../stores/playbackStore';
import {
  getMainVideoTrackId,
  getTimelineDisplayTrackOrder,
  getTimelineDuration,
  useTimelineStore,
} from '../../stores/timelineStore';
import { useUiStore } from '../../stores/uiStore';
import { ClipItem } from './ClipItem';
import { Playhead } from './Playhead';
import { TimeRuler } from './TimeRuler';

export type TimelineLayoutMode = 'desktop' | 'tablet' | 'mobile';

interface TimelineContainerProps {
  layoutMode?: TimelineLayoutMode;
  compactLandscape?: boolean;
  onAddMediaClick?: () => void;
  onQuickAudioClick?: () => void;
  onQuickTextClick?: () => void;
  onQuickOverlayClick?: () => void;
  onCoverClick?: () => void;
}

function getTrackRowHeight(
  trackType: TrackType,
  isMain: boolean,
  mode: TimelineLayoutMode,
  compactLandscape = false
): number {
  if (mode === 'mobile' && compactLandscape) {
    if (isMain) return 44;
    if (trackType === 'text') return 24;
    if (trackType === 'audio') return 28;
    return 32;
  }
  if (isMain) return 56;
  if (mode === 'mobile') {
    if (trackType === 'text') return 28;
    if (trackType === 'audio') return 36;
    return 40;
  }
  if (trackType === 'text') return 38;
  if (trackType === 'audio') return 40;
  return 44;
}

function trackTypeBadgeClass(type: Track['type'], isMain: boolean): string {
  if (isMain) return 'bg-[#00E5FF]';
  if (type === 'audio') return 'bg-emerald-400';
  if (type === 'text') return 'bg-violet-400';
  return 'bg-amber-400';
}

export function TimelineContainer({
  layoutMode = 'desktop',
  compactLandscape = false,
  onAddMediaClick,
  onQuickAudioClick,
  onQuickTextClick,
  onQuickOverlayClick,
  onCoverClick,
}: TimelineContainerProps) {
  const rulerScrollRef = useRef<HTMLDivElement>(null);
  const headersScrollRef = useRef<HTMLDivElement>(null);
  const canvasScrollRef = useRef<HTMLDivElement>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const isProgrammaticMobileScroll = useRef(false);

  const experienceMode = useUiStore((s) => s.experienceMode);
  const timelineToolMode = useUiStore((s) => s.timelineToolMode);
  const setTimelineToolMode = useUiStore((s) => s.setTimelineToolMode);
  const mobileTimelineFocus = useUiStore((s) => s.mobileTimelineFocus);
  const setMobileTimelineFocus = useUiStore((s) => s.setMobileTimelineFocus);
  const tracks = useTimelineStore((s) => s.tracks);
  const trackOrder = useTimelineStore((s) => s.trackOrder);
  const clips = useTimelineStore((s) => s.clips);
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds);
  const pixelsPerSecond = useTimelineStore((s) => s.pixelsPerSecond);
  const snapEnabled = useTimelineStore((s) => s.snapEnabled);

  const pastStates = useStore(useTimelineStore.temporal, (s) => s.pastStates);
  const futureStates = useStore(useTimelineStore.temporal, (s) => s.futureStates);

  const displayTrackOrder = getTimelineDisplayTrackOrder(trackOrder, tracks);
  const mainVideoTrackId = getMainVideoTrackId(trackOrder, tracks);

  const totalDuration = getTimelineDuration(clips, 20) + 10;
  const laneWidth = Math.max(800, Math.ceil(totalDuration * pixelsPerSecond));
  const gapPx = layoutMode === 'mobile' ? 6 : 0;

  const lanesTotalHeight = Math.max(
    120,
    displayTrackOrder.reduce((sum, tid) => {
      const tr = tracks[tid];
      if (!tr) return sum;
      return (
        sum +
        getTrackRowHeight(tr.type, tid === mainVideoTrackId, layoutMode, compactLandscape) +
        gapPx
      );
    }, 0)
  );

  // Sync mobile scroll position when playback advances or external seek happens
  useEffect(() => {
    if (layoutMode !== 'mobile') return;
    const syncToTime = (time: number) => {
      const el = mobileScrollRef.current;
      if (!el) return;
      const targetLeft = Math.max(0, time * pixelsPerSecond);
      if (Math.abs(el.scrollLeft - targetLeft) < 2) return;
      isProgrammaticMobileScroll.current = true;
      el.scrollLeft = targetLeft;
      requestAnimationFrame(() => {
        isProgrammaticMobileScroll.current = false;
      });
    };

    syncToTime(usePlaybackStore.getState().currentTime);
    return usePlaybackStore.subscribe((state) => {
      syncToTime(state.currentTime);
    });
  }, [layoutMode, pixelsPerSecond]);

  const handleSplitAtPlayhead = () => {
    const playhead = usePlaybackStore.getState().currentTime;
    const state = useTimelineStore.getState();
    const targetIds =
      state.selectedClipIds.length > 0
        ? state.selectedClipIds
        : Object.values(state.clips)
            .filter((c) => playhead > c.start && playhead < c.start + c.duration)
            .map((c) => c.id);

    for (const cid of targetIds) {
      state.splitClipAtTime(cid, playhead);
    }
  };

  // ============================================================================
  // MOBILE TIMELINE (CapCut Android: Video Utama on top, Overlays BELOW, isolated Overlay edit view)
  // ============================================================================
  if (layoutMode === 'mobile') {
    const rulerHeight = 22;
    const selectedClipObj =
      selectedClipIds.length === 1 ? clips[selectedClipIds[0]] : undefined;
    const isOverlayOnlyView =
      mobileTimelineFocus === 'overlay' || selectedClipObj?.type === 'overlay';

    // Mobile natural bottom-up layer order BELOW Video Utama: Overlay 1 -> Overlay 2 -> Overlay 3...
    const overlayTrackIds = trackOrder.filter(
      (tid) => tracks[tid]?.type === 'overlay'
    );
    const nonMainTextTrackIds = trackOrder.filter(
      (tid) =>
        tid !== mainVideoTrackId &&
        tracks[tid]?.type !== 'overlay' &&
        tracks[tid]?.type !== 'audio'
    );
    const audioTrackIds = trackOrder.filter(
      (tid) => tracks[tid]?.type === 'audio'
    );

    const overlayClipsCount = Object.values(clips).filter(
      (c) => c.type === 'overlay'
    ).length;

    const mainTrack = mainVideoTrackId ? tracks[mainVideoTrackId] : undefined;
    const mobileMainTracks: string[] = [
      ...(mainVideoTrackId ? [mainVideoTrackId] : []),
      ...nonMainTextTrackIds,
      ...audioTrackIds,
    ];

    const mobileRows = isOverlayOnlyView ? overlayTrackIds : mobileMainTracks;

    const mobileTotalHeight = Math.max(
      140,
      rulerHeight +
        32 +
        mobileRows.reduce((sum, tid) => {
          const tr = tracks[tid];
          if (!tr) return sum;
          return (
            sum +
            getTrackRowHeight(
              tr.type,
              tid === mainVideoTrackId && !isOverlayOnlyView,
              'mobile',
              compactLandscape
            ) +
            6
          );
        }, 0)
    );

    return (
      <section
        aria-label="Multi-Track Timeline"
        data-mobile-timeline-view={isOverlayOnlyView ? 'overlay' : 'main'}
        className={`relative flex flex-col overflow-hidden bg-[#0A0A0C] ${
          compactLandscape
            ? 'min-h-[120px] flex-1'
            : 'h-[34dvh] min-h-[175px] shrink-0'
        }`}
      >
        {/* Fixed Static White Playhead pinned horizontally at X = 50% */}
        <Playhead
          variant="static-center"
          height={Math.max(220, mobileTotalHeight + 16)}
        />

        {/* Floating White Rounded-Square [+] Add Clip Button (Main View only, pinned to Video Utama row) */}
        {!isOverlayOnlyView && onAddMediaClick && (
          <button
            type="button"
            onClick={onAddMediaClick}
            aria-label="Tambah Media ke Track Utama"
            style={{ top: rulerHeight + (compactLandscape ? 10 : 16) }}
            className="absolute right-3 z-40 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-zinc-950 shadow-lg transition active:scale-95 sm:h-9 sm:w-9"
          >
            <Plus className="h-5 w-5 stroke-[2.5]" />
          </button>
        )}

        {/* Horizontally & Vertically Scrollable Inner Tracks with 50vw left/right padding */}
        <div
          ref={mobileScrollRef}
          onScroll={(e) => {
            if (isProgrammaticMobileScroll.current) return;
            const target = e.currentTarget;
            const time = Math.max(
              0,
              Number((target.scrollLeft / pixelsPerSecond).toFixed(3))
            );
            usePlaybackStore.getState().seekTo(time);
            mediaRuntime.renderFrameAt(time, false);
          }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) {
              useTimelineStore.getState().clearSelection();
            }
          }}
          className="no-scrollbar relative min-h-0 flex-1 overflow-auto bg-[#0A0A0C]"
        >
          <div
            className="relative flex flex-col gap-[6px] pb-4"
            style={{
              width: `calc(${laneWidth}px + 100vw)`,
              paddingLeft: '50vw',
              paddingRight: '50vw',
            }}
          >
            {/* Sticky Top Time Ruler (22px, aligned pixel-perfect at 50vw -> 00:00) */}
            <div
              className="sticky top-0 z-20 -ml-[50vw] bg-[#0A0A0C] pl-[50vw]"
              style={{ width: `calc(${laneWidth}px + 100vw)` }}
            >
              <TimeRuler totalDuration={totalDuration} height={rulerHeight} />
            </div>

            {/* CAPCUT OVERLAY-ONLY MOBILE VIEW: Slim dimmed Main Video Reference + ONLY Overlay rows BELOW */}
            {isOverlayOnlyView && (
              <>
                {mainTrack && (
                  <div
                    data-track-id={`${mainTrack.id}-ref`}
                    data-mobile-main-ref="true"
                    style={{ height: compactLandscape ? 18 : 22, width: laneWidth }}
                    onClick={() => {
                      useTimelineStore.getState().clearSelection();
                      setMobileTimelineFocus('main');
                    }}
                    title="Track Video Utama (ketuk untuk kembali ke timeline utama)"
                    className="relative cursor-pointer opacity-55 transition hover:opacity-80"
                  >
                    <div
                      style={{ right: 'calc(100% + 8px)' }}
                      className="absolute top-1/2 flex -translate-y-1/2 items-center gap-1 rounded bg-[#18181C] px-1.5 py-0.5 text-[9px] font-medium text-zinc-400 ring-1 ring-[#2A2A32]"
                    >
                      <span>Utama</span>
                    </div>
                    {mainTrack.clipIds.length === 0 ? (
                      <div className="flex h-full w-48 items-center rounded border border-dashed border-[#2A2A32] bg-[#141418] px-2 text-[9px] text-zinc-500">
                        Video Utama (Kosong)
                      </div>
                    ) : (
                      mainTrack.clipIds.map((cid) => {
                        const c = clips[cid];
                        if (!c) return null;
                        return (
                          <div
                            key={`ref-${c.id}`}
                            style={{
                              left: c.start * pixelsPerSecond,
                              width: Math.max(18, c.duration * pixelsPerSecond),
                            }}
                            className="absolute top-0 bottom-0 overflow-hidden rounded border border-[#2f455e] bg-[#19283a] px-1.5 text-[9px] leading-[20px] text-zinc-300"
                          >
                            <span className="truncate">{c.name}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {overlayTrackIds.length === 0 ? (
                  <div
                    style={{ height: compactLandscape ? 36 : 44, width: laneWidth }}
                    className="relative flex items-center"
                  >
                    {onQuickOverlayClick && (
                      <button
                        type="button"
                        onClick={onQuickOverlayClick}
                        className="inline-flex h-full items-center gap-1.5 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/10 px-3 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/20"
                      >
                        <Layers className="h-3.5 w-3.5 text-amber-300" />
                        <span>+ Tambahkan Overlay (Gambar / Video PIP)</span>
                      </button>
                    )}
                  </div>
                ) : (
                  overlayTrackIds.map((trackId, ovlIdx) => {
                    const track = tracks[trackId];
                    if (!track) return null;
                    const rowH = getTrackRowHeight(
                      'overlay',
                      false,
                      'mobile',
                      compactLandscape
                    );
                    const isEmpty = track.clipIds.length === 0;
                    return (
                      <div
                        key={track.id}
                        data-track-id={track.id}
                        style={{ height: rowH, width: laneWidth }}
                        onPointerDown={(e) => {
                          if (e.target === e.currentTarget) {
                            useTimelineStore.getState().clearSelection();
                          }
                        }}
                        className={`relative bg-transparent ${
                          track.isMuted ? 'opacity-50' : ''
                        }`}
                      >
                        <div
                          style={{ right: 'calc(100% + 8px)' }}
                          className="absolute top-1/2 -translate-y-1/2 rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-300 ring-1 ring-amber-500/35"
                        >
                          L{ovlIdx + 1}
                        </div>

                        {isEmpty && onQuickOverlayClick && (
                          <button
                            type="button"
                            onClick={onQuickOverlayClick}
                            className="inline-flex h-full items-center gap-1 rounded-full border border-amber-500/40 bg-[#18181C]/80 px-2.5 text-[10px] font-medium text-amber-200"
                          >
                            <span>+ Tambah Overlay</span>
                          </button>
                        )}

                        {track.clipIds.map((cid) => {
                          const clip = clips[cid];
                          if (!clip) return null;
                          return (
                            <ClipItem
                              key={clip.id}
                              clip={clip}
                              isLocked={track.isLocked}
                              isMainTrack={false}
                              compactCapsule={false}
                              touchHandles
                            />
                          );
                        })}
                      </div>
                    );
                  })
                )}

                {overlayTrackIds.length > 0 && onQuickOverlayClick && (
                  <div style={{ height: 28, width: laneWidth }} className="relative flex items-center">
                    <button
                      type="button"
                      onClick={onQuickOverlayClick}
                      className="inline-flex h-full items-center gap-1 rounded-full border border-amber-500/40 bg-[#18181C] px-2.5 text-[10px] font-medium text-amber-200"
                    >
                      <Plus className="h-3 w-3 text-amber-300" />
                      <span>Tambah Overlay (Layer Baru)</span>
                    </button>
                  </div>
                )}
              </>
            )}

            {/* CAPCUT MAIN MOBILE VIEW: Video Utama on TOP, compact Overlay summary pill + Text & Audio BELOW */}
            {!isOverlayOnlyView &&
              mobileMainTracks.map((trackId) => {
                const track = tracks[trackId];
                if (!track) return null;
                const isMain = track.id === mainVideoTrackId;
                const rowH = getTrackRowHeight(
                  track.type,
                  isMain,
                  'mobile',
                  compactLandscape
                );
                const isEmpty = track.clipIds.length === 0;

                return (
                  <div key={track.id} className="contents">
                    <div
                      data-track-id={track.id}
                      style={{ height: rowH, width: laneWidth }}
                      onPointerDown={(e) => {
                        if (e.target === e.currentTarget) {
                          useTimelineStore.getState().clearSelection();
                        }
                      }}
                      className={`relative bg-transparent ${
                        track.isMuted ? 'opacity-50' : ''
                      }`}
                    >
                      {/* Main Track Inline Left-of-00:00 CapCut Mute & Cover Pills */}
                      {isMain && (
                        <div
                          style={{ right: 'calc(100% + 10px)' }}
                          className="absolute top-1/2 flex -translate-y-1/2 items-center gap-1.5"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              useTimelineStore.getState().toggleTrackMute(track.id)
                            }
                            className={`flex h-10 w-10 flex-col items-center justify-center rounded-md text-[9px] leading-tight ${
                              track.isMuted
                                ? 'bg-rose-500/25 text-rose-200 ring-1 ring-rose-500/40'
                                : 'bg-[#18181C] text-zinc-200 ring-1 ring-[#2A2A32]'
                            }`}
                            title="Bisukan suara track utama"
                          >
                            {track.isMuted ? (
                              <VolumeX className="h-3.5 w-3.5" />
                            ) : (
                              <Volume2 className="h-3.5 w-3.5" />
                            )}
                            <span>Bisu</span>
                          </button>
                          <button
                            type="button"
                            onClick={onCoverClick}
                            className="flex h-10 w-11 flex-col items-center justify-center rounded-md bg-[#18181C] text-[9px] leading-tight text-zinc-200 ring-1 ring-[#2A2A32]"
                            title="Ambil frame sampul PNG"
                          >
                            <ImageIcon className="h-3.5 w-3.5 text-zinc-100" />
                            <span>Sampul</span>
                          </button>
                        </div>
                      )}

                      {/* CapCut-style Clean Inline Prompt Pills on Empty Tracks */}
                      {isEmpty && isMain && onAddMediaClick && (
                        <button
                          type="button"
                          onClick={onAddMediaClick}
                          className="flex h-full items-center gap-1.5 rounded-lg border border-dashed border-[#2A2A32] bg-[#181820]/90 px-3 text-[11px] font-medium text-zinc-300 hover:border-[#00E5FF]"
                        >
                          <Plus className="h-3.5 w-3.5 text-[#00E5FF]" />
                          <span>Tambah Video / Foto</span>
                        </button>
                      )}

                      {isEmpty && track.type === 'audio' && onQuickAudioClick && (
                        <button
                          type="button"
                          onClick={onQuickAudioClick}
                          className="inline-flex h-full items-center gap-1.5 rounded-md border border-[#2A2A32] bg-[#18181C] px-2.5 text-[10px] font-medium text-zinc-300"
                        >
                          <span>♪ Tambah Audio</span>
                        </button>
                      )}

                      {isEmpty &&
                        track.type === 'text' &&
                        (onQuickTextClick || onQuickOverlayClick) && (
                          <div className="inline-flex h-full items-center gap-1.5">
                            {onQuickTextClick && (
                              <button
                                type="button"
                                onClick={onQuickTextClick}
                                className="inline-flex h-full items-center gap-1 rounded-full border border-[#2A2A32] bg-[#18181C]/70 px-2.5 text-[10px] font-medium text-zinc-400"
                              >
                                <span>T Tambah Teks</span>
                              </button>
                            )}
                            {onQuickOverlayClick && overlayClipsCount === 0 && (
                              <button
                                type="button"
                                onClick={onQuickOverlayClick}
                                className="inline-flex h-full items-center gap-1 rounded-full border border-amber-500/35 bg-[#18181C]/70 px-2.5 text-[10px] font-medium text-amber-300"
                              >
                                <span>+ Overlay</span>
                              </button>
                            )}
                          </div>
                        )}

                      {track.clipIds.map((cid) => {
                        const clip = clips[cid];
                        if (!clip) return null;
                        return (
                          <ClipItem
                            key={clip.id}
                            clip={clip}
                            isLocked={track.isLocked}
                            isMainTrack={isMain}
                            compactCapsule={track.type === 'text'}
                            touchHandles
                          />
                        );
                      })}
                    </div>

                    {/* Right BELOW Main Video Track: compact 1-line Overlay entry strip (prevents multi-overlay clutter on Main Timeline) */}
                    {isMain && overlayClipsCount > 0 && (
                      <div style={{ height: 26, width: laneWidth }} className="relative flex items-center">
                        <button
                          type="button"
                          data-testid="mobile-overlay-summary-strip"
                          onClick={() => setMobileTimelineFocus('overlay')}
                          className="inline-flex h-full items-center gap-1.5 rounded-full border border-amber-500/45 bg-amber-500/15 px-3 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/25"
                        >
                          <Layers className="h-3 w-3 text-amber-300" />
                          <span>
                            Overlay ({overlayClipsCount} klip · {overlayTrackIds.length}{' '}
                            layer) — Ketuk Edit
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </section>
    );
  }

  // ============================================================================
  // DESKTOP & TABLET (2x2 Synchronized Sticky Matrix Timeline)
  // ============================================================================
  const isTablet = layoutMode === 'tablet';
  const headerColWidth = isTablet ? 96 : 140;
  const toolbarHeightClass = isTablet ? 'h-[44px]' : 'h-9';
  const rulerHeight = 24;

  const syncMatrixScroll = () => {
    const canvasEl = canvasScrollRef.current;
    if (!canvasEl) return;
    if (rulerScrollRef.current) {
      rulerScrollRef.current.scrollLeft = canvasEl.scrollLeft;
    }
    if (headersScrollRef.current) {
      headersScrollRef.current.scrollTop = canvasEl.scrollTop;
    }
  };

  return (
    <section
      aria-label="Multi-Track Timeline"
      className="flex min-h-0 flex-1 flex-col border-t border-[#2A2A32] bg-[#111114]"
    >
      {/* Timeline Toolbar (36px Desktop / 44px Touch Tablet) */}
      <div
        className={`flex shrink-0 items-center justify-between gap-2 overflow-x-auto border-b border-[#2A2A32] bg-[#18181C] px-2.5 lg:px-3 ${toolbarHeightClass}`}
      >
        <div className="flex shrink-0 items-center gap-1">
          {/* Desktop Cursor Mode Switcher: [A] Select vs [B] Blade */}
          {!isTablet && (
            <div className="mr-1 inline-flex items-center rounded border border-[#2A2A32] bg-[#111114] p-0.5">
              <button
                type="button"
                onClick={() => setTimelineToolMode('select')}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                  timelineToolMode === 'select'
                    ? 'bg-[#00E5FF] text-zinc-950'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
                title="Alat Pilih & Geser Klip (A)"
              >
                <MousePointer2 className="h-3 w-3" />
                <span>Pilih</span>
              </button>
              <button
                type="button"
                onClick={() => setTimelineToolMode('blade')}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                  timelineToolMode === 'blade'
                    ? 'bg-rose-500 text-white'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
                title="Alat Potong / Blade — Klik klip di timeline untuk memotong langsung (B)"
              >
                <Scissors className="h-3 w-3" />
                <span>Blade</span>
              </button>
            </div>
          )}

          <button
            type="button"
            disabled={pastStates.length === 0}
            onClick={() => useTimelineStore.temporal.getState().undo()}
            className={`inline-flex items-center gap-1 rounded px-2 text-xs text-zinc-200 hover:bg-[#242429] active:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-35 ${
              isTablet ? 'h-9' : 'py-1'
            }`}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Undo</span>
          </button>
          <button
            type="button"
            disabled={futureStates.length === 0}
            onClick={() => useTimelineStore.temporal.getState().redo()}
            className={`inline-flex items-center gap-1 rounded px-2 text-xs text-zinc-200 hover:bg-[#242429] active:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-35 ${
              isTablet ? 'h-9' : 'py-1'
            }`}
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Redo</span>
          </button>

          <div className="mx-1 h-4 w-px bg-[#2A2A32]" />

          <button
            type="button"
            onClick={handleSplitAtPlayhead}
            className={`inline-flex items-center gap-1 rounded bg-[#242429] px-2.5 text-xs font-medium text-zinc-100 hover:bg-[#2f2f38] ${
              isTablet ? 'h-9' : 'py-1'
            }`}
            title="Split clip di posisi Playhead (S)"
          >
            <Scissors className="h-3.5 w-3.5 text-[#00E5FF]" />
            <span>Split</span>
          </button>

          {!isTablet && (
            <>
              <button
                type="button"
                disabled={selectedClipIds.length !== 1}
                onClick={() =>
                  selectedClipIds[0] &&
                  useTimelineStore
                    .getState()
                    .trimClipToPlayhead(
                      selectedClipIds[0],
                      'left',
                      usePlaybackStore.getState().currentTime
                    )
                }
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 font-mono text-[11px] text-zinc-200 hover:bg-[#242429] disabled:cursor-not-allowed disabled:opacity-35"
                title="Pangkas Awal Klip ke Playhead ([)"
              >
                <span>[ Trim</span>
              </button>

              <button
                type="button"
                disabled={selectedClipIds.length !== 1}
                onClick={() =>
                  selectedClipIds[0] &&
                  useTimelineStore
                    .getState()
                    .trimClipToPlayhead(
                      selectedClipIds[0],
                      'right',
                      usePlaybackStore.getState().currentTime
                    )
                }
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 font-mono text-[11px] text-zinc-200 hover:bg-[#242429] disabled:cursor-not-allowed disabled:opacity-35"
                title="Pangkas Akhir Klip ke Playhead (])"
              >
                <span>Trim ]</span>
              </button>
            </>
          )}

          <button
            type="button"
            disabled={selectedClipIds.length !== 1}
            onClick={() =>
              selectedClipIds[0] &&
              useTimelineStore
                .getState()
                .freezeClipAtTime(
                  selectedClipIds[0],
                  usePlaybackStore.getState().currentTime
                )
            }
            className={`inline-flex items-center gap-1 rounded px-2 text-xs text-zinc-200 hover:bg-[#242429] disabled:cursor-not-allowed disabled:opacity-35 ${
              isTablet ? 'h-9' : 'py-1'
            }`}
            title="Freeze Frame 1.5s"
          >
            <Snowflake className="h-3.5 w-3.5 text-[#00E5FF]" />
            <span className="hidden md:inline">Freeze</span>
          </button>

          <button
            type="button"
            disabled={selectedClipIds.length !== 1}
            onClick={() =>
              selectedClipIds[0] &&
              useTimelineStore.getState().flipClip(selectedClipIds[0], 'h')
            }
            className={`inline-flex items-center gap-1 rounded px-2 text-xs text-zinc-200 hover:bg-[#242429] disabled:cursor-not-allowed disabled:opacity-35 ${
              isTablet ? 'h-9' : 'py-1'
            }`}
            title="Mirror Horizontal"
          >
            <FlipHorizontal2 className="h-3.5 w-3.5 text-violet-400" />
            <span className="hidden lg:inline">Mirror</span>
          </button>

          {selectedClipIds.length === 1 && (
            <div className="hidden items-center rounded border border-[#2A2A32] bg-[#111114] md:inline-flex">
              <button
                type="button"
                onClick={() =>
                  useTimelineStore.getState().nudgeClip(selectedClipIds[0], -0.1)
                }
                className="px-1 py-0.5 text-[10px] text-zinc-300 hover:bg-[#242429]"
                title="Geser klip mundur 0.1 detik"
              >
                <ChevronLeft className="inline h-3 w-3" />
                0.1s
              </button>
              <button
                type="button"
                onClick={() =>
                  useTimelineStore.getState().nudgeClip(selectedClipIds[0], 0.1)
                }
                className="border-l border-[#2A2A32] px-1 py-0.5 text-[10px] text-zinc-300 hover:bg-[#242429]"
                title="Geser klip maju 0.1 detik"
              >
                0.1s
                <ChevronRight className="inline h-3 w-3" />
              </button>
            </div>
          )}

          <button
            type="button"
            disabled={selectedClipIds.length !== 1}
            onClick={() =>
              selectedClipIds[0] &&
              useTimelineStore.getState().duplicateClip(selectedClipIds[0])
            }
            className={`inline-flex items-center gap-1 rounded px-2 text-xs text-zinc-200 hover:bg-[#242429] disabled:cursor-not-allowed disabled:opacity-35 ${
              isTablet ? 'h-9' : 'py-1'
            }`}
            title="Duplikat klip terpilih"
          >
            <Copy className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Duplikat</span>
          </button>

          <button
            type="button"
            disabled={selectedClipIds.length === 0}
            onClick={() =>
              useTimelineStore.getState().deleteClips(selectedClipIds)
            }
            className={`inline-flex items-center gap-1 rounded px-2 text-xs text-rose-300 hover:bg-rose-950/60 disabled:cursor-not-allowed disabled:opacity-35 ${
              isTablet ? 'h-9' : 'py-1'
            }`}
            title="Hapus klip terpilih (Delete)"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Hapus</span>
          </button>

          <button
            type="button"
            disabled={selectedClipIds.length === 0}
            onClick={() =>
              useTimelineStore.getState().rippleDeleteClips(selectedClipIds)
            }
            className={`inline-flex items-center gap-1 rounded px-2 text-xs text-amber-300 hover:bg-amber-950/50 disabled:cursor-not-allowed disabled:opacity-35 ${
              isTablet ? 'h-9' : 'py-1'
            }`}
            title="Hapus & Rapatkan celah otomatis (Shift+Delete)"
          >
            <AlignHorizontalSpaceAround className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Rapatkan</span>
          </button>

          {experienceMode === 'pro' && selectedClipIds.length === 1 && (
            <button
              type="button"
              onClick={() => {
                const c = clips[selectedClipIds[0]];
                if (c) useTimelineStore.getState().closeTrackGaps(c.trackId);
              }}
              className="hidden items-center gap-1 rounded px-2 py-1 text-xs text-zinc-200 hover:bg-[#242429] lg:inline-flex"
              title="Tutup semua celah kosong di track klip terpilih"
            >
              <span>Tutup Celah</span>
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Add Tracks */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => useTimelineStore.getState().addTrack('overlay')}
              className="inline-flex items-center gap-0.5 rounded border border-amber-500/40 bg-[#242429] px-1.5 py-1 text-[11px] text-amber-200 hover:border-amber-400"
              title="Tambah Track Overlay / PIP Baru (Layer)"
            >
              <Plus className="h-3 w-3 text-amber-400" />
              <span>Ovl</span>
            </button>
            <button
              type="button"
              onClick={() => useTimelineStore.getState().addTrack('video')}
              className="inline-flex items-center gap-0.5 rounded border border-[#2A2A32] bg-[#242429] px-1.5 py-1 text-[11px] text-zinc-200 hover:border-[#00E5FF]"
              title="Tambah Track Video / PIP"
            >
              <Plus className="h-3 w-3 text-[#00E5FF]" />
              <span>Vid</span>
            </button>
            <button
              type="button"
              onClick={() => useTimelineStore.getState().addTrack('text')}
              className="inline-flex items-center gap-0.5 rounded border border-[#2A2A32] bg-[#242429] px-1.5 py-1 text-[11px] text-zinc-200 hover:border-violet-400"
              title="Tambah Track Teks"
            >
              <Plus className="h-3 w-3 text-violet-400" />
              <span>Teks</span>
            </button>
            <button
              type="button"
              onClick={() => useTimelineStore.getState().addTrack('audio')}
              className="inline-flex items-center gap-0.5 rounded border border-[#2A2A32] bg-[#242429] px-1.5 py-1 text-[11px] text-zinc-200 hover:border-emerald-400"
              title="Tambah Track Audio"
            >
              <Plus className="h-3 w-3 text-emerald-400" />
              <span>Aud</span>
            </button>
          </div>

          <div className="h-4 w-px bg-[#2A2A32]" />

          <button
            type="button"
            onClick={() => useTimelineStore.getState().toggleSnap()}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
              snapEnabled
                ? 'bg-[#00E5FF]/20 text-[#00E5FF]'
                : 'text-zinc-400 hover:bg-[#242429]'
            }`}
            title="Toggle Magnetic Snap"
          >
            <Magnet className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Snap</span>
          </button>

          <div className="flex items-center gap-1 pl-1">
            <button
              type="button"
              onClick={() =>
                useTimelineStore.getState().setPixelsPerSecond(pixelsPerSecond - 15)
              }
              className="rounded p-1 text-zinc-400 hover:bg-[#242429] hover:text-zinc-100"
              aria-label="Zoom out timeline"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <input
              type="range"
              aria-label="Zoom timeline"
              min={15}
              max={240}
              value={pixelsPerSecond}
              onChange={(e) =>
                useTimelineStore
                  .getState()
                  .setPixelsPerSecond(Number(e.target.value))
              }
              className="hidden h-1.5 w-20 accent-[#00E5FF] sm:block"
            />
            <button
              type="button"
              onClick={() =>
                useTimelineStore.getState().setPixelsPerSecond(pixelsPerSecond + 15)
              }
              className="rounded p-1 text-zinc-400 hover:bg-[#242429] hover:text-zinc-100"
              aria-label="Zoom in timeline"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                const dur = Math.max(5, getTimelineDuration(clips, 20));
                const fitPps = Math.max(15, Math.min(180, Math.round(640 / dur)));
                useTimelineStore.getState().setPixelsPerSecond(fitPps);
              }}
              className="hidden rounded p-1 text-zinc-400 hover:bg-[#242429] hover:text-[#00E5FF] sm:inline-flex"
              aria-label="Fit timeline"
              title="Paskan seluruh durasi timeline ke layar"
            >
              <Maximize2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Synchronized 2x2 Matrix Grid: Corner (140x24 / 96x24) | Ruler (1fr x 24) / Headers (140x1fr) | Canvas (1fr x 1fr) */}
      <div
        className="grid min-h-0 flex-1 overflow-hidden"
        style={{
          gridTemplateColumns: `${headerColWidth}px minmax(0, 1fr)`,
          gridTemplateRows: `${rulerHeight}px minmax(0, 1fr)`,
        }}
      >
        {/* Cell 1: Top-Left Static Corner Box */}
        <div className="z-20 flex items-center justify-between border-r border-b border-[#2A2A32] bg-[#18181C] px-2.5 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
          <span>Tracks</span>
          <Magnet className="h-3 w-3 text-[#00E5FF]" />
        </div>

        {/* Cell 2: Top-Right Sticky Time Ruler Header (Synced Horizontal Scroll) */}
        <div
          ref={rulerScrollRef}
          className="no-scrollbar z-20 overflow-x-hidden overflow-y-hidden border-b border-[#2A2A32] bg-[#111114]"
        >
          <div className="relative" style={{ width: laneWidth, height: rulerHeight }}>
            <TimeRuler totalDuration={totalDuration} height={rulerHeight} />
            <Playhead variant="ruler-head" height={rulerHeight} />
          </div>
        </div>

        {/* Cell 3: Bottom-Left Sticky Track Headers (Synced Vertical Scroll) */}
        <div
          ref={headersScrollRef}
          className="no-scrollbar z-20 overflow-x-hidden overflow-y-hidden border-r border-[#2A2A32] bg-[#18181C]"
        >
          {displayTrackOrder.map((trackId) => {
            const track = tracks[trackId];
            if (!track) return null;
            const isMain = track.id === mainVideoTrackId;
            const rowH = getTrackRowHeight(track.type, isMain, layoutMode);
            const badgeColor = trackTypeBadgeClass(track.type, isMain);

            return (
              <div
                key={track.id}
                style={{ height: rowH }}
                className={`flex items-center justify-between border-b border-[#2A2A32] px-1.5 lg:px-2.5 ${
                  isMain ? 'bg-[#181820]' : 'bg-[#18181C]'
                }`}
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className={`h-3 w-1 shrink-0 rounded-full ${badgeColor}`} />
                  <span
                    onDoubleClick={() => {
                      if (experienceMode !== 'pro') return;
                      const nextName = window.prompt(
                        'Ubah nama track:',
                        track.name
                      );
                      if (nextName) {
                        useTimelineStore
                          .getState()
                          .renameTrack(track.id, nextName);
                      }
                    }}
                    title={
                      isMain
                        ? `${track.name} (Poros Utama)`
                        : experienceMode === 'pro'
                        ? `${track.name} (Klik ganda untuk ganti nama)`
                        : track.name
                    }
                    className={`truncate text-[11px] font-medium ${
                      isMain ? 'font-bold text-white' : 'text-zinc-300'
                    }`}
                  >
                    {track.name}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  {!isMain && track.type !== 'audio' && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          useTimelineStore
                            .getState()
                            .moveTrackLayer(track.id, 'up')
                        }
                        className="rounded p-0.5 text-zinc-400 hover:bg-[#242429] hover:text-[#00E5FF]"
                        title="Naikkan Lapisan Track (Ke Depan)"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          useTimelineStore
                            .getState()
                            .moveTrackLayer(track.id, 'down')
                        }
                        className="rounded p-0.5 text-zinc-400 hover:bg-[#242429] hover:text-amber-300"
                        title="Turunkan Lapisan Track (Ke Belakang)"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      useTimelineStore.getState().toggleTrackMute(track.id)
                    }
                    className={`rounded p-1 ${
                      track.isMuted
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'text-zinc-400 hover:bg-[#242429] hover:text-zinc-100'
                    }`}
                    title={track.isMuted ? 'Unmute track' : 'Mute track'}
                  >
                    {track.isMuted ? (
                      <VolumeX className="h-3 w-3" />
                    ) : (
                      <Volume2 className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      useTimelineStore.getState().toggleTrackLock(track.id)
                    }
                    className={`rounded p-1 ${
                      track.isLocked
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'text-zinc-400 hover:bg-[#242429] hover:text-zinc-100'
                    }`}
                    title={track.isLocked ? 'Unlock track' : 'Lock track'}
                  >
                    {track.isLocked ? (
                      <Lock className="h-3 w-3" />
                    ) : (
                      <Unlock className="h-3 w-3" />
                    )}
                  </button>
                  {trackOrder.length > 1 && !track.isLocked && !isMain && (
                    <button
                      type="button"
                      onClick={() =>
                        useTimelineStore.getState().deleteTrack(track.id)
                      }
                      className="inline-flex rounded p-1 text-zinc-500 hover:bg-[#242429] hover:text-rose-400"
                      title="Hapus track"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Cell 4: Bottom-Right 2-Axis Scrollable Main Tracks Canvas */}
        <div
          ref={canvasScrollRef}
          onScroll={syncMatrixScroll}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) {
              useTimelineStore.getState().clearSelection();
            }
          }}
          className="relative min-h-0 overflow-auto bg-[#0A0A0C]"
        >
          <div className="relative" style={{ width: laneWidth, minHeight: lanesTotalHeight }}>
            <Playhead
              variant="moving"
              height={Math.max(lanesTotalHeight, 260)}
            />

            {displayTrackOrder.map((trackId) => {
              const track = tracks[trackId];
              if (!track) return null;
              const isMain = track.id === mainVideoTrackId;
              const rowH = getTrackRowHeight(track.type, isMain, layoutMode);

              return (
                <div
                  key={track.id}
                  data-track-id={track.id}
                  style={{ height: rowH }}
                  onPointerDown={(e) => {
                    if (e.target === e.currentTarget) {
                      useTimelineStore.getState().clearSelection();
                    }
                  }}
                  className={`relative border-b border-[#2A2A32]/70 ${
                    isMain
                      ? 'bg-[#181820]'
                      : track.isMuted
                      ? 'bg-[#111114]/45 opacity-55'
                      : 'bg-[#111114]'
                  }`}
                >
                  {track.clipIds.map((cid) => {
                    const clip = clips[cid];
                    if (!clip) return null;
                    return (
                      <ClipItem
                        key={clip.id}
                        clip={clip}
                        isLocked={track.isLocked}
                        isMainTrack={isMain}
                        touchHandles={isTablet}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
