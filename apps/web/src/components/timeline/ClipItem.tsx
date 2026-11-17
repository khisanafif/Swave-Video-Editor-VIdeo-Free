import { Film, Music, Type, Image as ImageIcon } from 'lucide-react';
import type { Clip } from '@swave/shared';
import { mediaRuntime } from '../../engine/mediaRuntime';
import { usePlaybackStore } from '../../stores/playbackStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { useUiStore } from '../../stores/uiStore';

interface ClipItemProps {
  clip: Clip;
  isLocked: boolean;
  isMainTrack?: boolean;
  compactCapsule?: boolean;
  touchHandles?: boolean;
}

const CLIP_THEME: Record<
  Clip['type'],
  { bg: string; border: string; activeBorder: string; accent: string }
> = {
  video: {
    bg: 'bg-[#19283a]',
    border: 'border-[#2f455e]',
    activeBorder: 'border-2 border-white shadow-[0_0_10px_rgba(255,255,255,0.28)]',
    accent: 'text-sky-200',
  },
  audio: {
    bg: 'bg-[#0f3f3c]',
    border: 'border-[#1d635d]',
    activeBorder: 'border-2 border-white shadow-[0_0_10px_rgba(255,255,255,0.28)]',
    accent: 'text-emerald-200',
  },
  text: {
    bg: 'bg-[#46296b]',
    border: 'border-[#6d45a3]',
    activeBorder: 'border-2 border-white shadow-[0_0_10px_rgba(255,255,255,0.28)]',
    accent: 'text-violet-200',
  },
  overlay: {
    bg: 'bg-[#3b2918]',
    border: 'border-[#734f2c]',
    activeBorder: 'border-2 border-white shadow-[0_0_10px_rgba(255,255,255,0.28)]',
    accent: 'text-amber-200',
  },
};

function findSnappedStart(
  proposedStart: number,
  duration: number,
  clipId: string,
  pps: number
): number {
  const state = useTimelineStore.getState();
  if (!state.snapEnabled) return Math.max(0, proposedStart);

  const thresholdSec = 8 / pps;
  const playhead = usePlaybackStore.getState().currentTime;
  const targets = [0, playhead];

  for (const other of Object.values(state.clips)) {
    if (other.id === clipId) continue;
    targets.push(other.start, other.start + other.duration);
  }

  let bestStart = proposedStart;
  let minDiff = thresholdSec;

  for (const target of targets) {
    const startDiff = Math.abs(proposedStart - target);
    if (startDiff < minDiff) {
      minDiff = startDiff;
      bestStart = target;
    }
    const endDiff = Math.abs(proposedStart + duration - target);
    if (endDiff < minDiff) {
      minDiff = endDiff;
      bestStart = Math.max(0, target - duration);
    }
  }

  return Math.max(0, bestStart);
}

export function ClipItem({
  clip,
  isLocked,
  isMainTrack = false,
  compactCapsule = false,
  touchHandles = false,
}: ClipItemProps) {
  const pixelsPerSecond = useTimelineStore((s) => s.pixelsPerSecond);
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds);
  const timelineToolMode = useUiStore((s) => s.timelineToolMode);
  const asset = useTimelineStore((s) => s.assets[clip.assetId]);

  const isSelected = selectedClipIds.includes(clip.id);
  const theme =
    clip.type === 'text' && clip.isSubtitle
      ? {
          bg: 'bg-[#8f5d0c]',
          border: 'border-[#c4841b]',
          activeBorder: 'border-2 border-white shadow-[0_0_10px_rgba(255,255,255,0.28)]',
          accent: 'text-amber-200',
        }
      : CLIP_THEME[clip.type];

  const leftPx = clip.start * pixelsPerSecond;
  const widthPx = Math.max(22, clip.duration * pixelsPerSecond);

  const handleMovePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    if (timelineToolMode === 'blade' && !isLocked) {
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = Math.max(0, e.clientX - rect.left);
      const splitAt = Number((clip.start + relX / pixelsPerSecond).toFixed(3));
      useTimelineStore.getState().splitClipAtTime(clip.id, splitAt);
      return;
    }

    useTimelineStore.getState().selectClip(clip.id, e.shiftKey || e.ctrlKey);
    const pb = usePlaybackStore.getState();
    if (pb.currentTime < clip.start || pb.currentTime >= clip.start + clip.duration) {
      pb.seekTo(clip.start);
      mediaRuntime.renderFrameAt(clip.start, pb.isPlaying);
    }
    if (isLocked) return;

    const targetEl = e.currentTarget;
    targetEl.setPointerCapture(e.pointerId);
    useTimelineStore.temporal.getState().pause();

    const startClientX = e.clientX;
    const initialStart = clip.start;
    let currentTrackId = clip.trackId;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startClientX;
      const rawStart = Math.max(0, initialStart + dx / pixelsPerSecond);
      const snappedStart = findSnappedStart(
        rawStart,
        clip.duration,
        clip.id,
        pixelsPerSecond
      );

      const elUnder = document.elementFromPoint(ev.clientX, ev.clientY);
      const laneEl = elUnder?.closest('[data-track-id]') as HTMLElement | null;
      if (laneEl?.dataset.trackId) {
        currentTrackId = laneEl.dataset.trackId;
      }

      useTimelineStore
        .getState()
        .moveClip(clip.id, currentTrackId, snappedStart);
      mediaRuntime.renderFrameAt(
        usePlaybackStore.getState().currentTime,
        usePlaybackStore.getState().isPlaying
      );
    };

    const onUp = () => {
      useTimelineStore.temporal.getState().resume();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleTrimPointerDown = (
    edge: 'left' | 'right',
    e: React.PointerEvent<HTMLDivElement>
  ) => {
    if (e.button !== 0 || isLocked) return;
    e.stopPropagation();

    e.currentTarget.setPointerCapture(e.pointerId);
    useTimelineStore.getState().selectClip(clip.id, false);
    useTimelineStore.temporal.getState().pause();

    const startClientX = e.clientX;
    const initialEdgeTime =
      edge === 'left' ? clip.start : clip.start + clip.duration;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startClientX;
      const targetTime = initialEdgeTime + dx / pixelsPerSecond;
      useTimelineStore.getState().trimClip(clip.id, edge, targetTime);
      mediaRuntime.renderFrameAt(
        usePlaybackStore.getState().currentTime,
        usePlaybackStore.getState().isPlaying
      );
    };

    const onUp = () => {
      useTimelineStore.temporal.getState().resume();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const Icon =
    clip.type === 'audio'
      ? Music
      : clip.type === 'text'
      ? Type
      : clip.type === 'overlay'
      ? ImageIcon
      : Film;

  const peaks = asset?.waveform || [];
  const handleWidthClass = touchHandles ? 'w-4' : 'w-3 lg:w-2.5';
  const hasVisualFilmstrip =
    (clip.type === 'video' || clip.type === 'overlay') &&
    Boolean(asset?.thumbnailUrl);

  return (
    <div
      data-clip-id={clip.id}
      onPointerDown={handleMovePointerDown}
      style={{ left: leftPx, width: widthPx }}
      className={`group absolute top-[1px] bottom-[1px] flex touch-none flex-col justify-between overflow-hidden border select-none transition-shadow ${
        compactCapsule ? 'rounded-md' : 'rounded-[7px]'
      } ${theme.bg} ${isSelected ? theme.activeBorder : theme.border} ${
        timelineToolMode === 'blade' && !isLocked
          ? 'cursor-crosshair'
          : isLocked
          ? 'cursor-not-allowed opacity-70'
          : 'cursor-grab active:cursor-grabbing'
      }`}
    >
      {/* Full-height continuous CapCut filmstrip background for Video/Image clips */}
      {hasVisualFilmstrip && (
        <div
          className="pointer-events-none absolute inset-0 bg-repeat-x"
          style={{
            backgroundImage: `url(${asset!.thumbnailUrl})`,
            backgroundSize: isMainTrack ? 'auto 100%' : 'auto 100%',
            backgroundPosition: 'left center',
          }}
        />
      )}

      {/* Full-height mirrored CapCut Audio waveform */}
      {clip.type === 'audio' && peaks.length > 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center gap-[2px] px-2 opacity-65">
          {peaks.slice(0, 64).map((p, idx) => (
            <div
              key={idx}
              className="flex-1 rounded-full bg-emerald-300/85"
              style={{ height: `${Math.max(18, Math.round(p * 88))}%` }}
            />
          ))}
        </div>
      )}

      {/* Subtle dark readability gradient over filmstrip */}
      {hasVisualFilmstrip && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/40" />
      )}

      {/* Left White Trim Ear */}
      <div
        role="separator"
        aria-label="Trim start"
        onPointerDown={(e) => handleTrimPointerDown('left', e)}
        className={`absolute top-0 bottom-0 left-0 z-20 flex touch-none items-center justify-center gap-[2px] cursor-ew-resize transition-colors ${handleWidthClass} ${
          isSelected
            ? 'bg-white text-zinc-900'
            : 'bg-transparent hover:bg-white/30'
        }`}
      >
        {isSelected && (
          <>
            <span className="h-3.5 w-[1.5px] rounded-full bg-zinc-900" />
            {touchHandles && (
              <span className="h-3.5 w-[1.5px] rounded-full bg-zinc-900" />
            )}
          </>
        )}
      </div>

      {/* Compact Overlay Label */}
      <div
        className={`relative z-10 flex items-center gap-1 font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] ${
          compactCapsule
            ? 'h-full px-2 text-[10px]'
            : 'px-2 pt-1 text-[10px]'
        }`}
      >
        {!hasVisualFilmstrip && <Icon className={`h-3 w-3 shrink-0 ${theme.accent}`} />}
        {clip.isSubtitle && (
          <span className="shrink-0 rounded bg-black/35 px-1 font-mono text-[9px] font-extrabold text-amber-200">
            CC
          </span>
        )}
        <span className="truncate">
          {clip.type === 'text' ? clip.textStyle?.content || clip.name : clip.name}
        </span>
        {!compactCapsule && clip.speed && Math.abs(clip.speed - 1) > 0.02 && (
          <span className="shrink-0 rounded bg-black/60 px-1 py-0.2 font-mono text-[9px] font-bold text-[#00E5FF]">
            {clip.speed}x
          </span>
        )}
        <span className="ml-auto shrink-0 rounded bg-black/45 px-1 font-mono text-[9px] text-zinc-100">
          {clip.duration.toFixed(1)}s
        </span>
      </div>

      {/* Right White Trim Ear */}
      <div
        role="separator"
        aria-label="Trim end"
        onPointerDown={(e) => handleTrimPointerDown('right', e)}
        className={`absolute top-0 right-0 bottom-0 z-20 flex touch-none items-center justify-center gap-[2px] cursor-ew-resize transition-colors ${handleWidthClass} ${
          isSelected
            ? 'bg-white text-zinc-900'
            : 'bg-transparent hover:bg-white/30'
        }`}
      >
        {isSelected && (
          <>
            <span className="h-3.5 w-[1.5px] rounded-full bg-zinc-900" />
            {touchHandles && (
              <span className="h-3.5 w-[1.5px] rounded-full bg-zinc-900" />
            )}
          </>
        )}
      </div>
    </div>
  );
}
