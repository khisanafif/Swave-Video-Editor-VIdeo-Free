import { useEffect, useRef } from 'react';
import { mediaRuntime } from '../../engine/mediaRuntime';
import { usePlaybackStore } from '../../stores/playbackStore';
import { useTimelineStore } from '../../stores/timelineStore';

interface TimeRulerProps {
  totalDuration: number;
  height?: number;
  minWidth?: number;
}

function chooseTickStep(pps: number): { major: number; minor: number } {
  if (pps >= 140) return { major: 1, minor: 0.2 };
  if (pps >= 70) return { major: 2, minor: 0.5 };
  if (pps >= 35) return { major: 5, minor: 1 };
  return { major: 10, minor: 2 };
}

export function TimeRuler({
  totalDuration,
  height = 24,
  minWidth = 800,
}: TimeRulerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixelsPerSecond = useTimelineStore((s) => s.pixelsPerSecond);
  const width = Math.max(minWidth, Math.ceil(totalDuration * pixelsPerSecond));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#111114';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#2A2A32';
    ctx.beginPath();
    ctx.moveTo(0, height - 0.5);
    ctx.lineTo(width, height - 0.5);
    ctx.stroke();

    const { major, minor } = chooseTickStep(pixelsPerSecond);
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = 'top';

    for (let t = 0; t <= totalDuration; t += minor) {
      const x = Math.round(t * pixelsPerSecond) + 0.5;
      const isMajor =
        Math.abs(t % major) < 0.001 || Math.abs((t % major) - major) < 0.001;

      ctx.strokeStyle = isMajor ? '#8E8E93' : '#3A3A44';
      ctx.beginPath();
      ctx.moveTo(x, isMajor ? Math.max(6, height - 11) : height - 6);
      ctx.lineTo(x, height);
      ctx.stroke();

      if (isMajor) {
        ctx.fillStyle = '#8E8E93';
        const mins = Math.floor(t / 60);
        const secs = Math.floor(t % 60);
        const label = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        ctx.fillText(label, x + 4, 2);
      }
    }
  }, [width, height, pixelsPerSecond, totalDuration]);

  const seekFromPointer = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, clientX - rect.left);
    const time = Number((x / pixelsPerSecond).toFixed(3));
    usePlaybackStore.getState().seekTo(time);
    mediaRuntime.renderFrameAt(time, usePlaybackStore.getState().isPlaying);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromPointer(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons !== 1) return;
    seekFromPointer(e.clientX);
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      className="block touch-none cursor-ew-resize select-none"
      title="Klik atau geser untuk scrub playhead"
    />
  );
}
