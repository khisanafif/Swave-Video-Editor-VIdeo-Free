import { useEffect, useRef } from 'react';
import { usePlaybackStore } from '../../stores/playbackStore';
import { useTimelineStore } from '../../stores/timelineStore';

interface PlayheadProps {
  height: number;
}

/**
 * Playhead moves exclusively via direct DOM Ref translate3d() on playback store updates,
 * keeping 60 FPS playback free from React tree re-renders.
 */
export function Playhead({ height }: PlayheadProps) {
  const ref = useRef<HTMLDivElement>(null);
  const pixelsPerSecond = useTimelineStore((s) => s.pixelsPerSecond);

  useEffect(() => {
    const updatePosition = (time: number) => {
      if (ref.current) {
        const x = time * pixelsPerSecond;
        ref.current.style.transform = `translate3d(${x}px, 0, 0)`;
      }
    };

    updatePosition(usePlaybackStore.getState().currentTime);
    return usePlaybackStore.subscribe((state) => {
      updatePosition(state.currentTime);
    });
  }, [pixelsPerSecond]);

  return (
    <div
      ref={ref}
      aria-label="Playhead"
      className="pointer-events-none absolute top-0 left-0 z-30 will-change-transform"
      style={{ height }}
    >
      <div className="-ml-[6px] h-3 w-3 rotate-45 rounded-xs border border-cyan-300 bg-cyan-400 shadow-md shadow-cyan-500/40" />
      <div className="-mt-1 w-[2px] bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.85)]" style={{ height: Math.max(0, height - 8) }} />
    </div>
  );
}

