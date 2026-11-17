import { useEffect, useRef } from 'react';
import { usePlaybackStore } from '../../stores/playbackStore';
import { useTimelineStore } from '../../stores/timelineStore';

interface PlayheadProps {
  height: number;
  variant?: 'moving' | 'ruler-head' | 'static-center';
}

/**
 * Moving playhead uses direct DOM Ref translate3d() on playback store updates
 * to keep 60 FPS scrubbing and playback free from React re-renders.
 */
export function Playhead({ height, variant = 'moving' }: PlayheadProps) {
  const ref = useRef<HTMLDivElement>(null);
  const pixelsPerSecond = useTimelineStore((s) => s.pixelsPerSecond);

  useEffect(() => {
    if (variant === 'static-center') return;
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
  }, [pixelsPerSecond, variant]);

  if (variant === 'static-center') {
    return (
      <div
        aria-label="Playhead Tengah Mobile"
        className="pointer-events-none absolute top-0 left-1/2 z-30 -translate-x-1/2"
        style={{ height }}
      >
        <div className="mx-auto h-2.5 w-2.5 rounded-full border border-zinc-950 bg-white shadow-sm" />
        <div
          className="mx-auto w-[2px] bg-white shadow-[0_0_8px_rgba(255,255,255,0.85)]"
          style={{ height: Math.max(0, height - 8) }}
        />
      </div>
    );
  }

  if (variant === 'ruler-head') {
    return (
      <div
        ref={ref}
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 z-30 will-change-transform"
        style={{ height }}
      >
        <div className="-ml-[6px] h-3 w-3 rotate-45 rounded-xs border border-zinc-950 bg-[#00E5FF] shadow-md shadow-cyan-500/40" />
        <div
          className="-mt-1 w-[2px] bg-[#00E5FF]"
          style={{ height: Math.max(0, height - 8) }}
        />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      aria-label="Playhead"
      className="pointer-events-none absolute top-0 left-0 z-30 will-change-transform"
      style={{ height }}
    >
      <div className="w-[2px] bg-[#00E5FF] shadow-[0_0_8px_rgba(0,229,255,0.8)]" style={{ height }} />
    </div>
  );
}
