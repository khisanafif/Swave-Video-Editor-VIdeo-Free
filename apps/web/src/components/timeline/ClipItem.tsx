import { Film, Music, Type, Image as ImageIcon } from 'lucide-react';
import type { Clip } from '@velocut/shared';
import { mediaRuntime } from '../../engine/mediaRuntime';
import { usePlaybackStore } from '../../stores/playbackStore';
import { useTimelineStore } from '../../stores/timelineStore';

interface ClipItemProps {
  clip: Clip;
  isLocked: boolean;
}

const CLIP_THEME: Record<
  Clip['type'],
  { bg: string; border: string; activeBorder: string; accent: string }
> = {
  video: {
    bg: 'bg-sky-950/80',
    border: 'border-sky-600/45',
    activeBorder: 'border-cyan-400 ring-1 ring-cyan-400/60',
    accent: 'text-sky-300',
  },
  audio: {
    bg: 'bg-emerald-950/80',
    border: 'border-emerald-600/45',
    activeBorder: 'border-emerald-400 ring-1 ring-emerald-400/60',
    accent: 'text-emerald-300',
  },
  text: {
    bg: 'bg-violet-950/80',
    border: 'border-violet-600/45',
    activeBorder: 'border-violet-400 ring-1 ring-violet-400/60',
    accent: 'text-violet-300',
  },
  overlay: {
    bg: 'bg-amber-950/80',
    border: 'border-amber-600/45',
    activeBorder: 'border-amber-400 ring-1 ring-amber-400/60',
    accent: 'text-amber-300',
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

export function ClipItem({ clip, isLocked }: ClipItemProps) {
  const pixelsPerSecond = useTimelineStore((s) => s.pixelsPerSecond);
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds);
  const asset = useTimelineStore((s) => s.assets[clip.assetId]);

  const isSelected = selectedClipIds.includes(clip.id);
  const theme = CLIP_THEME[clip.type];
  const leftPx = clip.start * pixelsPerSecond;
  const widthPx = Math.max(18, clip.duration * pixelsPerSecond);

  const handleMovePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();

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

  return (
    <div
      data-clip-id={clip.id}
      onPointerDown={handleMovePointerDown}
      style={{ left: leftPx, width: widthPx }}
      className={`group absolute top-1 bottom-1 flex touch-none flex-col justify-between overflow-hidden rounded-md border select-none transition-shadow ${
        theme.bg
      } ${isSelected ? theme.activeBorder : theme.border} ${
        isLocked ? 'cursor-not-allowed opacity-70' : 'cursor-grab active:cursor-grabbing'
      }`}
    >
      {/* Left Trim Handle */}
      <div
        role="separator"
        aria-label="Trim start"
        onPointerDown={(e) => handleTrimPointerDown('left', e)}
        className={`absolute top-0 bottom-0 left-0 z-20 flex w-3.5 touch-none items-center justify-center cursor-ew-resize transition-colors lg:w-2 ${
          isSelected ? 'bg-white/20 hover:bg-white/35' : 'bg-transparent hover:bg-white/30'
        }`}
      >
        {isSelected && (
          <span className="h-4 w-0.5 rounded-full bg-white/80 lg:hidden" />
        )}
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center gap-1.5 px-2 pt-1 text-[11px] font-medium text-zinc-100">
        <Icon className={`h-3 w-3 shrink-0 ${theme.accent}`} />
        {clip.isSubtitle && (
          <span className="shrink-0 rounded bg-yellow-400/25 px-1 font-mono text-[9px] font-extrabold text-yellow-200">
            CC
          </span>
        )}
        <span className="truncate">{clip.name}</span>
        {clip.speed && Math.abs(clip.speed - 1) > 0.02 && (
          <span className="shrink-0 rounded bg-cyan-500/25 px-1 py-0.2 font-mono text-[9px] font-bold text-cyan-200">
            {clip.speed}x
          </span>
        )}
        {clip.animation &&
          (clip.animation.in !== 'none' || clip.animation.out !== 'none') && (
            <span className="shrink-0 rounded bg-violet-500/25 px-1 py-0.2 text-[9px] font-semibold text-violet-200">
              Anim
            </span>
          )}
        <span className="ml-auto shrink-0 font-mono text-[10px] text-zinc-400">
          {clip.duration.toFixed(1)}s
        </span>
      </div>

      {/* Waveform or Filmstrip visual hint */}
      {peaks.length > 0 ? (
        <div className="pointer-events-none flex h-5 items-end gap-[2px] px-2 pb-1 opacity-75">
          {peaks.slice(0, 48).map((p, idx) => (
            <div
              key={idx}
              className={`flex-1 rounded-t-xs ${
                clip.type === 'audio' ? 'bg-emerald-400/70' : 'bg-cyan-400/45'
              }`}
              style={{ height: `${Math.max(15, Math.round(p * 100))}%` }}
            />
          ))}
        </div>
      ) : asset?.thumbnailUrl ? (
        <div
          className="pointer-events-none mx-1 mb-1 h-4 rounded-xs bg-repeat-x opacity-60"
          style={{
            backgroundImage: `url(${asset.thumbnailUrl})`,
            backgroundSize: 'auto 100%',
          }}
        />
      ) : (
        <div className="pointer-events-none px-2 pb-1 text-[10px] text-zinc-400/80 truncate">
          {clip.type === 'text'
            ? clip.textStyle?.content
            : `${asset?.width ?? ''}x${asset?.height ?? ''}`}
        </div>
      )}

      {/* Right Trim Handle */}
      <div
        role="separator"
        aria-label="Trim end"
        onPointerDown={(e) => handleTrimPointerDown('right', e)}
        className={`absolute top-0 right-0 bottom-0 z-20 flex w-3.5 touch-none items-center justify-center cursor-ew-resize transition-colors lg:w-2 ${
          isSelected ? 'bg-white/20 hover:bg-white/35' : 'bg-transparent hover:bg-white/30'
        }`}
      >
        {isSelected && (
          <span className="h-4 w-0.5 rounded-full bg-white/80 lg:hidden" />
        )}
      </div>
    </div>
  );
}

