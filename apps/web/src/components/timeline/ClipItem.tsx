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
    bg: 'bg-[#1b3146]',
    border: 'border-sky-600/45',
    activeBorder: 'border-2 border-white ring-1 ring-[#00E5FF]/50',
    accent: 'text-sky-300',
  },
  audio: {
    bg: 'bg-[#12382c]',
    border: 'border-emerald-600/45',
    activeBorder: 'border-2 border-white ring-1 ring-emerald-400/60',
    accent: 'text-emerald-300',
  },
  text: {
    bg: 'bg-[#362052]',
    border: 'border-violet-500/50',
    activeBorder: 'border-2 border-white ring-1 ring-violet-400/60',
    accent: 'text-violet-300',
  },
  overlay: {
    bg: 'bg-[#422a13]',
    border: 'border-amber-500/50',
    activeBorder: 'border-2 border-white ring-1 ring-amber-400/60',
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
  const theme = CLIP_THEME[clip.type];
  const leftPx = clip.start * pixelsPerSecond;
  const widthPx = Math.max(18, clip.duration * pixelsPerSecond);

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

  const handleWidthClass = touchHandles
    ? 'w-4'
    : 'w-3.5 lg:w-2.5';

  return (
    <div
      data-clip-id={clip.id}
      onPointerDown={handleMovePointerDown}
      style={{ left: leftPx, width: widthPx }}
      className={`group absolute top-[2px] bottom-[2px] flex touch-none flex-col justify-between overflow-hidden border select-none transition-shadow ${
        compactCapsule ? 'rounded-full px-1' : 'rounded-md'
      } ${theme.bg} ${isSelected ? theme.activeBorder : theme.border} ${
        timelineToolMode === 'blade' && !isLocked
          ? 'cursor-crosshair'
          : isLocked
          ? 'cursor-not-allowed opacity-70'
          : 'cursor-grab active:cursor-grabbing'
      }`}
    >
      {/* Left Trim Handle */}
      <div
        role="separator"
        aria-label="Trim start"
        onPointerDown={(e) => handleTrimPointerDown('left', e)}
        className={`absolute top-0 bottom-0 left-0 z-20 flex touch-none items-center justify-center cursor-ew-resize transition-colors ${handleWidthClass} ${
          isSelected
            ? 'bg-white text-zinc-950'
            : 'bg-transparent hover:bg-white/30'
        }`}
      >
        {isSelected && (
          <span className="h-3.5 w-[2px] rounded-full bg-zinc-900" />
        )}
      </div>

      {/* Header */}
      <div
        className={`relative z-10 flex items-center gap-1 font-medium text-zinc-100 ${
          compactCapsule
            ? 'h-full px-2 text-[10px]'
            : 'px-2 pt-1 text-[11px]'
        }`}
      >
        <Icon className={`h-3 w-3 shrink-0 ${theme.accent}`} />
        {clip.isSubtitle && (
          <span className="shrink-0 rounded bg-yellow-400/25 px-1 font-mono text-[9px] font-extrabold text-yellow-200">
            CC
          </span>
        )}
        <span className="truncate">{clip.name}</span>
        {!compactCapsule && clip.speed && Math.abs(clip.speed - 1) > 0.02 && (
          <span className="shrink-0 rounded bg-cyan-500/25 px-1 py-0.2 font-mono text-[9px] font-bold text-cyan-200">
            {clip.speed}x
          </span>
        )}
        {!compactCapsule &&
          clip.animation &&
          (clip.animation.in !== 'none' || clip.animation.out !== 'none') && (
            <span className="shrink-0 rounded bg-violet-500/25 px-1 py-0.2 text-[9px] font-semibold text-violet-200">
              Anim
            </span>
          )}
        <span className="ml-auto shrink-0 font-mono text-[10px] text-zinc-300/80">
          {clip.duration.toFixed(1)}s
        </span>
      </div>

      {/* Waveform or Filmstrip visual hint */}
      {!compactCapsule && (
        peaks.length > 0 ? (
          <div className="pointer-events-none flex h-5 items-end gap-[2px] px-2 pb-1 opacity-75">
            {peaks.slice(0, 48).map((p, idx) => (
              <div
                key={idx}
                className={`flex-1 rounded-t-xs ${
                  clip.type === 'audio' ? 'bg-emerald-400/75' : 'bg-cyan-400/50'
                }`}
                style={{ height: `${Math.max(15, Math.round(p * 100))}%` }}
              />
            ))}
          </div>
        ) : asset?.thumbnailUrl ? (
          <div
            className={`pointer-events-none mx-1 mb-1 rounded-xs bg-repeat-x ${
              isMainTrack ? 'h-6 opacity-85' : 'h-4 opacity-65'
            }`}
            style={{
              backgroundImage: `url(${asset.thumbnailUrl})`,
              backgroundSize: 'auto 100%',
            }}
          />
        ) : (
          <div className="pointer-events-none truncate px-2 pb-1 text-[10px] text-zinc-400/85">
            {clip.type === 'text'
              ? clip.textStyle?.content
              : `${asset?.width ?? ''}x${asset?.height ?? ''}`}
          </div>
        )
      )}

      {/* Right Trim Handle */}
      <div
        role="separator"
        aria-label="Trim end"
        onPointerDown={(e) => handleTrimPointerDown('right', e)}
        className={`absolute top-0 right-0 bottom-0 z-20 flex touch-none items-center justify-center cursor-ew-resize transition-colors ${handleWidthClass} ${
          isSelected
            ? 'bg-white text-zinc-950'
            : 'bg-transparent hover:bg-white/30'
        }`}
      >
        {isSelected && (
          <span className="h-3.5 w-[2px] rounded-full bg-zinc-900" />
        )}
      </div>
    </div>
  );
}

