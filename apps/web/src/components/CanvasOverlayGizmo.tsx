import { useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Check,
  Copy,
  Layers,
  Maximize2,
  Move,
  Pencil,
  Pipette,
  RotateCw,
  Trash2,
  X,
} from 'lucide-react';
import type { CanvasResolution, Clip, MediaAsset } from '@swave/shared';
import { TEXT_PRESETS } from '../engine/editorPresets';
import { mediaRuntime } from '../engine/mediaRuntime';
import { usePlaybackStore } from '../stores/playbackStore';
import { getMainVideoTrackId, useTimelineStore } from '../stores/timelineStore';
import { useUiStore } from '../stores/uiStore';

interface CanvasOverlayGizmoProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  resolution: CanvasResolution;
}

const QUICK_TEXT_COLORS = [
  { label: 'Putih', color: '#ffffff' },
  { label: 'Kuning Terang', color: '#facc15' },
  { label: 'Cyan Neon', color: '#22d3ee' },
  { label: 'Merah', color: '#f43f5e' },
  { label: 'Hijau', color: '#4ade80' },
  { label: 'Oranye', color: '#fb923c' },
  { label: 'Hitam', color: '#09090b' },
];

const QUICK_BG_COLORS = [
  { label: 'Transparan', color: 'transparent' },
  { label: 'Hitam Transparan', color: 'rgba(9, 9, 11, 0.75)' },
  { label: 'Merah Headline', color: 'rgba(220, 38, 38, 0.92)' },
  { label: 'Biru Cyber', color: 'rgba(8, 51, 68, 0.85)' },
];

function computeClipCanvasBox(
  clip: Clip,
  asset: MediaAsset | undefined,
  cw: number,
  ch: number
): { cx: number; cy: number; boxW: number; boxH: number } {
  const cx = cw / 2 + (clip.transforms.x || 0);
  const cy = ch / 2 + (clip.transforms.y || 0);
  const scale = Math.max(0.15, clip.transforms.scale || 1);

  if (clip.type === 'text' && clip.textStyle) {
    const fontSize = Math.max(16, clip.textStyle.fontSize || 48);
    const lines = (clip.textStyle.content || 'Teks').split('\n');
    const maxChars = Math.max(3, ...lines.map((l) => Array.from(l).length));
    const rawW = Math.min(
      cw * 0.92,
      Math.max(180, maxChars * fontSize * 0.62 + 72)
    );
    const rawH = Math.max(76, lines.length * (fontSize * 1.3) + 44);
    return {
      cx,
      cy,
      boxW: rawW * scale,
      boxH: rawH * scale,
    };
  }

  if (asset && asset.width > 0 && asset.height > 0) {
    const fitScale = Math.min(cw / asset.width, ch / asset.height);
    return {
      cx,
      cy,
      boxW: Math.max(48, asset.width * fitScale * scale),
      boxH: Math.max(48, asset.height * fitScale * scale),
    };
  }

  return {
    cx,
    cy,
    boxW: Math.min(cw, cw * 0.75 * scale),
    boxH: Math.min(ch, ch * 0.75 * scale),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

let eyedropperScratchCanvas: HTMLCanvasElement | null = null;

function sampleEyedropperColorAtPoint(
  container: HTMLDivElement | null,
  clientX: number,
  clientY: number,
  cw: number,
  ch: number,
  targetClip: Clip | undefined
): string | null {
  if (!container) return null;
  const rect = container.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const canvasX = ((clientX - rect.left) / rect.width) * cw;
  const canvasY = ((clientY - rect.top) / rect.height) * ch;

  // Prefer sampling raw unkeyed clip pixels first so re-picking still sees the green/blue screen
  if (targetClip && targetClip.type !== 'text') {
    const el = mediaRuntime.getVisualElement(targetClip.assetId);
    const srcW =
      el instanceof HTMLVideoElement
        ? el.videoWidth
        : el instanceof HTMLImageElement
        ? el.naturalWidth
        : 0;
    const srcH =
      el instanceof HTMLVideoElement
        ? el.videoHeight
        : el instanceof HTMLImageElement
        ? el.naturalHeight
        : 0;

    if (el && srcW > 0 && srcH > 0) {
      const fitScale = Math.min(cw / srcW, ch / srcH);
      const quadW = srcW * fitScale;
      const quadH = srcH * fitScale;
      const dx = canvasX - (cw / 2 + (targetClip.transforms.x || 0));
      const dy = canvasY - (ch / 2 + (targetClip.transforms.y || 0));
      const rad = -((targetClip.transforms.rotation || 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const scale = Math.max(0.05, targetClip.transforms.scale || 1);
      const flipX = targetClip.transforms.flipH ? -1 : 1;
      const flipY = targetClip.transforms.flipV ? -1 : 1;

      const localX = (dx * cos - dy * sin) / (scale * flipX);
      const localY = (dx * sin + dy * cos) / (scale * flipY);
      const u = localX / quadW + 0.5;
      const v = localY / quadH + 0.5;

      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        try {
          if (!eyedropperScratchCanvas) {
            eyedropperScratchCanvas = document.createElement('canvas');
            eyedropperScratchCanvas.width = 1;
            eyedropperScratchCanvas.height = 1;
          }
          const ctx = eyedropperScratchCanvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(
              el,
              Math.floor(u * srcW),
              Math.floor(v * srcH),
              1,
              1,
              0,
              0,
              1,
              1
            );
            const data = ctx.getImageData(0, 0, 1, 1).data;
            if (data[3] > 20) {
              return rgbToHex(data[0], data[1], data[2]);
            }
          }
        } catch {
          // Fallback to preview canvas pixels below
        }
      }
    }
  }

  const previewCanvas = container.querySelector(
    'canvas[data-swave-preview-canvas="true"]'
  ) as HTMLCanvasElement | null;
  if (!previewCanvas) return null;

  const px = Math.max(0, Math.min(previewCanvas.width - 1, Math.round(canvasX)));
  const py = Math.max(0, Math.min(previewCanvas.height - 1, Math.round(canvasY)));

  try {
    const gl = previewCanvas.getContext('webgl2');
    if (gl) {
      const pixel = new Uint8Array(4);
      gl.readPixels(
        px,
        previewCanvas.height - 1 - py,
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixel
      );
      return rgbToHex(pixel[0], pixel[1], pixel[2]);
    }
    const ctx2d = previewCanvas.getContext('2d');
    if (ctx2d) {
      const d = ctx2d.getImageData(px, py, 1, 1).data;
      return rgbToHex(d[0], d[1], d[2]);
    }
  } catch {
    return null;
  }
  return null;
}

export function CanvasOverlayGizmo({
  containerRef,
  resolution,
}: CanvasOverlayGizmoProps) {
  const clips = useTimelineStore((s) => s.clips);
  const assets = useTimelineStore((s) => s.assets);
  const tracks = useTimelineStore((s) => s.tracks);
  const trackOrder = useTimelineStore((s) => s.trackOrder);
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds);
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const eyedropperClipId = useUiStore((s) => s.eyedropperClipId);
  const setEyedropperClipId = useUiStore((s) => s.setEyedropperClipId);

  const [snapGuideX, setSnapGuideX] = useState(false);
  const [snapGuideY, setSnapGuideY] = useState(false);
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const [eyedropperHoverHex, setEyedropperHoverHex] = useState<string | null>(null);

  const cw = resolution.width || 1920;
  const ch = resolution.height || 1080;

  // Collect all visible visual clips at currentTime (or the selected clip if it's a visual/text clip)
  const visibleClips: Clip[] = [];
  for (const tid of trackOrder) {
    const tr = tracks[tid];
    if (!tr || tr.isMuted) continue;
    for (const cid of tr.clipIds) {
      const c = clips[cid];
      if (!c || c.type === 'audio') continue;
      if (currentTime >= c.start && currentTime < c.start + c.duration) {
        visibleClips.push(c);
      }
    }
  }

  const selectedClip =
    selectedClipIds.length === 1 ? clips[selectedClipIds[0]] : undefined;
  const activeVisualClip =
    selectedClip && selectedClip.type !== 'audio' ? selectedClip : undefined;

  // Start dragging clip position (X, Y) directly on canvas with CapCut magnetic center snap
  const handleStartDragMove = (
    clip: Clip,
    e: React.PointerEvent<HTMLDivElement>
  ) => {
    if (e.button !== 0 || isInlineEditing) return;
    e.stopPropagation();

    const track = tracks[clip.trackId];
    useTimelineStore.getState().selectClip(clip.id, false);
    if (track?.isLocked) return;

    // Ensure playhead is within clip so user sees live WebGL preview while dragging
    const pb = usePlaybackStore.getState();
    if (pb.currentTime < clip.start || pb.currentTime >= clip.start + clip.duration) {
      pb.seekTo(clip.start + 0.01);
    }

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    useTimelineStore.temporal.getState().pause();

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const initialX = clip.transforms.x || 0;
    const initialY = clip.transforms.y || 0;
    const snapThreshold = 18; // in canvas pixels

    const onMove = (ev: PointerEvent) => {
      const dxCanvas = (ev.clientX - startClientX) * (cw / rect.width);
      const dyCanvas = (ev.clientY - startClientY) * (ch / rect.height);

      let nextX = Math.round(initialX + dxCanvas);
      let nextY = Math.round(initialY + dyCanvas);

      const snappedX = Math.abs(nextX) < snapThreshold;
      const snappedY = Math.abs(nextY) < snapThreshold;

      if (snappedX) nextX = 0;
      if (snappedY) nextY = 0;

      setSnapGuideX(snappedX);
      setSnapGuideY(snappedY);

      useTimelineStore
        .getState()
        .updateClipTransform(clip.id, { x: nextX, y: nextY });
      mediaRuntime.renderFrameAt(
        usePlaybackStore.getState().currentTime,
        usePlaybackStore.getState().isPlaying
      );
    };

    const onUp = () => {
      setSnapGuideX(false);
      setSnapGuideY(false);
      useTimelineStore.temporal.getState().resume();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // Start dragging corner resize handle (Scale)
  const handleStartResize = (
    clip: Clip,
    e: React.PointerEvent<HTMLButtonElement>
  ) => {
    e.stopPropagation();
    const track = tracks[clip.trackId];
    if (track?.isLocked) return;

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    useTimelineStore.temporal.getState().pause();

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const initialScale = clip.transforms.scale || 1;

    const onMove = (ev: PointerEvent) => {
      const deltaPx =
        (ev.clientX - startClientX + (ev.clientY - startClientY)) / 2;
      const scaleFactor = 1 + (deltaPx / rect.width) * 2.2;
      const nextScale = Number(
        Math.max(0.2, Math.min(3.5, initialScale * scaleFactor)).toFixed(2)
      );
      useTimelineStore
        .getState()
        .updateClipTransform(clip.id, { scale: nextScale });
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

  // Start dragging top-right rotate handle
  const handleStartRotate = (
    clip: Clip,
    cxScreen: number,
    cyScreen: number,
    e: React.PointerEvent<HTMLButtonElement>
  ) => {
    e.stopPropagation();
    const track = tracks[clip.trackId];
    if (track?.isLocked) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    useTimelineStore.temporal.getState().pause();

    const startAngle = Math.atan2(e.clientY - cyScreen, e.clientX - cxScreen);
    const initialRot = clip.transforms.rotation || 0;

    const onMove = (ev: PointerEvent) => {
      const angle = Math.atan2(ev.clientY - cyScreen, ev.clientX - cxScreen);
      const degDelta = ((angle - startAngle) * 180) / Math.PI;
      let nextRot = Math.round(initialRot + degDelta);
      if (Math.abs(nextRot) < 4) nextRot = 0;
      else if (Math.abs(nextRot - 90) < 4) nextRot = 90;
      else if (Math.abs(nextRot + 90) < 4) nextRot = -90;

      useTimelineStore
        .getState()
        .updateClipTransform(clip.id, { rotation: nextRot });
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

  const applyQuickPosition = (
    clip: Clip,
    preset: 'top' | 'center' | 'bottom'
  ) => {
    const yVal =
      preset === 'top'
        ? -Math.round(ch * 0.32)
        : preset === 'bottom'
        ? Math.round(ch * 0.32)
        : 0;
    useTimelineStore
      .getState()
      .updateClipTransform(clip.id, { x: 0, y: yVal, rotation: 0 });
    mediaRuntime.renderFrameAt(
      usePlaybackStore.getState().currentTime,
      usePlaybackStore.getState().isPlaying
    );
  };

  const applyFitOrFill = (clip: Clip, mode: 'fit' | 'fill') => {
    const asset = assets[clip.assetId];
    const sw = asset?.width || cw;
    const sh = asset?.height || ch;
    let nextScale = 1;
    if (mode === 'fill' && sw > 0 && sh > 0) {
      const fitRatio = Math.min(cw / sw, ch / sh);
      const fillRatio = Math.max(cw / sw, ch / sh);
      nextScale = Number(Math.max(1, fillRatio / Math.max(0.01, fitRatio)).toFixed(2));
    }
    useTimelineStore
      .getState()
      .updateClipTransform(clip.id, { x: 0, y: 0, scale: nextScale, rotation: 0 });
    mediaRuntime.renderFrameAt(
      usePlaybackStore.getState().currentTime,
      usePlaybackStore.getState().isPlaying
    );
  };

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden select-none"
      aria-label="Kanvas Interaktif SWAVE Video"
    >
      {/* Live CapCut Chroma Color Eyedropper Mode */}
      {eyedropperClipId && clips[eyedropperClipId] && (
        <div
          data-testid="canvas-eyedropper-overlay"
          className="pointer-events-auto absolute inset-0 z-50 flex cursor-crosshair flex-col items-center justify-between bg-cyan-950/10 p-2"
          onPointerMove={(e) => {
            const hex = sampleEyedropperColorAtPoint(
              containerRef.current,
              e.clientX,
              e.clientY,
              cw,
              ch,
              clips[eyedropperClipId]
            );
            if (hex) setEyedropperHoverHex(hex);
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            const hex =
              sampleEyedropperColorAtPoint(
                containerRef.current,
                e.clientX,
                e.clientY,
                cw,
                ch,
                clips[eyedropperClipId]
              ) ||
              eyedropperHoverHex ||
              '#00b140';
            useTimelineStore.getState().setClipChromaKey(eyedropperClipId, {
              enabled: true,
              color: hex,
            });
            setEyedropperHoverHex(null);
            setEyedropperClipId(null);
          }}
        >
          <div className="flex items-center gap-2 rounded-full border border-emerald-400/50 bg-[#09090b]/90 px-3 py-1 text-[11px] font-medium text-emerald-200 shadow-xl backdrop-blur">
            <Pipette className="h-3.5 w-3.5 text-emerald-400" />
            <span>Ketuk warna di kanvas untuk Kunci Chroma</span>
            {eyedropperHoverHex && (
              <span className="inline-flex items-center gap-1 rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-white">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full border border-white/40"
                  style={{ backgroundColor: eyedropperHoverHex }}
                />
                {eyedropperHoverHex}
              </span>
            )}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setEyedropperHoverHex(null);
                setEyedropperClipId(null);
              }}
              className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-200 hover:bg-zinc-700"
            >
              <X className="h-3 w-3" />
              Batal
            </button>
          </div>
        </div>
      )}

      {/* CapCut Magnetic Center Snap Lines */}
      {snapGuideX && (
        <div className="pointer-events-none absolute top-0 bottom-0 left-1/2 z-30 w-px -translate-x-1/2 border-l border-dashed border-cyan-400 shadow-[0_0_8px_#22d3ee]" />
      )}
      {snapGuideY && (
        <div className="pointer-events-none absolute right-0 left-0 top-1/2 z-30 h-px -translate-y-1/2 border-t border-dashed border-cyan-400 shadow-[0_0_8px_#22d3ee]" />
      )}

      {/* Clickable hit-targets for ALL unselected visible overlay/text clips in exact layer order */}
      {(() => {
        const mainTrackId = getMainVideoTrackId(trackOrder, tracks);
        return visibleClips
          .filter(
            (c) =>
              c.id !== activeVisualClip?.id &&
              (c.type === 'text' || c.type === 'overlay' || c.trackId !== mainTrackId)
          )
          .map((clip, idx) => {
            const { cx, cy, boxW, boxH } = computeClipCanvasBox(
              clip,
              assets[clip.assetId],
              cw,
              ch
            );
            return (
              <div
                key={`hit-${clip.id}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  useTimelineStore.getState().selectClip(clip.id, false);
                }}
                style={{
                  left: `${(cx / cw) * 100}%`,
                  top: `${(cy / ch) * 100}%`,
                  width: `${Math.max(8, (boxW / cw) * 100)}%`,
                  height: `${Math.max(8, (boxH / ch) * 100)}%`,
                  zIndex: 10 + idx,
                  transform: `translate(-50%, -50%) rotate(${clip.transforms.rotation || 0}deg)`,
                }}
                className="pointer-events-auto absolute cursor-pointer rounded border border-transparent transition hover:border-cyan-400/70"
                title={`Klik untuk pilih & geser overlay: ${clip.name}`}
              />
            );
          });
      })()}

      {/* Active Selected Clip CapCut Transform Bounding Box */}
      {activeVisualClip &&
        (() => {
          const mainTrackId = getMainVideoTrackId(trackOrder, tracks);
          const upperTracks = trackOrder.filter(
            (tid) => tid !== mainTrackId && tracks[tid]?.type !== 'audio'
          );
          const activeLayerIdx = upperTracks.indexOf(activeVisualClip.trackId);
          const activeConcurrentOverlays = visibleClips.filter(
            (c) =>
              c.type === 'overlay' ||
              c.type === 'text' ||
              c.trackId !== mainTrackId
          ).length;

          const { cx, cy, boxW, boxH } = computeClipCanvasBox(
            activeVisualClip,
            assets[activeVisualClip.assetId],
            cw,
            ch
          );
          const leftPct = (cx / cw) * 100;
          const topPct = (cy / ch) * 100;
          const widthPct = Math.max(8, (boxW / cw) * 100);
          const heightPct = Math.max(8, (boxH / ch) * 100);

          return (
            <>
              <div
                data-testid="canvas-overlay-gizmo"
                onPointerDown={(e) => handleStartDragMove(activeVisualClip, e)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (activeVisualClip.type === 'text') {
                    setIsInlineEditing(true);
                  }
                }}
                style={{
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  width: `${widthPct}%`,
                  height: `${heightPct}%`,
                  transform: `translate(-50%, -50%) rotate(${
                    activeVisualClip.transforms.rotation || 0
                  }deg)`,
                }}
                className="pointer-events-auto absolute z-20 cursor-move touch-none rounded-md border-2 border-white/90 shadow-[0_0_0_1px_rgba(34,211,238,0.8),0_8px_24px_rgba(0,0,0,0.5)]"
              >
                {/* Center crosshair subtle indicator */}
                <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/20 p-1 text-white/70">
                  <Move className="h-3 w-3" />
                </div>

                {/* Top-Left Handle: Delete Clip (CapCut ✕) */}
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    useTimelineStore
                      .getState()
                      .deleteClips([activeVisualClip.id]);
                  }}
                  title="Hapus Klip (Delete)"
                  className="absolute -top-3 -left-3 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-rose-400 shadow-md transition hover:scale-110 hover:bg-rose-500 hover:text-white"
                >
                  <Trash2 className="h-3 w-3" />
                </button>

                {/* Top-Right Handle: Rotate Drag (CapCut ↻) */}
                <button
                  type="button"
                  onPointerDown={(e) => {
                    const rect = containerRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    const cxScreen = rect.left + (cx / cw) * rect.width;
                    const cyScreen = rect.top + (cy / ch) * rect.height;
                    handleStartRotate(activeVisualClip, cxScreen, cyScreen, e);
                  }}
                  title="Tarik untuk Putar (Rotate)"
                  className="absolute -top-3 -right-3 flex h-6 w-6 cursor-grab items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-cyan-300 shadow-md transition hover:scale-110 active:cursor-grabbing"
                >
                  <RotateCw className="h-3 w-3" />
                </button>

                {/* Bottom-Left Handle: Duplicate Clip (CapCut ⧉) */}
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    useTimelineStore
                      .getState()
                      .duplicateClip(activeVisualClip.id);
                  }}
                  title="Duplikat Klip"
                  className="absolute -bottom-3 -left-3 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-200 shadow-md transition hover:scale-110 hover:bg-zinc-800"
                >
                  <Copy className="h-3 w-3" />
                </button>

                {/* Bottom-Right Handle: Resize / Scale Drag (CapCut ⤡) */}
                <button
                  type="button"
                  onPointerDown={(e) => handleStartResize(activeVisualClip, e)}
                  title="Tarik untuk Perbesar / Perkecil"
                  className="absolute -right-3 -bottom-3 flex h-6 w-6 cursor-nwse-resize items-center justify-center rounded-full border border-cyan-300 bg-cyan-500 text-zinc-950 shadow-md transition hover:scale-110"
                >
                  <Maximize2 className="h-3 w-3" />
                </button>
              </div>

              {/* Floating Quick Action Pill at Top of Canvas (CapCut Quick Bar) */}
              <div
                onPointerDown={(e) => e.stopPropagation()}
                className="pointer-events-auto absolute top-2 left-1/2 z-30 flex max-w-[96%] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-full border border-zinc-700/90 bg-zinc-950/90 px-2.5 py-1 text-[11px] shadow-xl backdrop-blur-md"
              >
                {activeVisualClip.type === 'text' ? (
                  <button
                    type="button"
                    onClick={() => setIsInlineEditing((v) => !v)}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold transition ${
                      isInlineEditing
                        ? 'bg-emerald-500 text-zinc-950'
                        : 'bg-violet-500 text-zinc-950 hover:bg-violet-400'
                    }`}
                  >
                    <Pencil className="h-3 w-3" />
                    <span>{isInlineEditing ? 'Selesai Ketik' : 'Ketik / Edit Teks'}</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => applyFitOrFill(activeVisualClip, 'fill')}
                      className="inline-flex items-center gap-0.5 rounded-full bg-cyan-500 px-2.5 py-0.5 font-bold text-zinc-950 hover:bg-cyan-400"
                      title="Perbesar otomatis agar penuh layar tanpa garis hitam (cocok 9:16 TikTok)"
                    >
                      <span>Isi Penuh</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFitOrFill(activeVisualClip, 'fit')}
                      className="inline-flex items-center gap-0.5 rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-200 hover:bg-zinc-700"
                      title="Kembalikan ukuran pas layar"
                    >
                      <span>Pas Layar</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => applyQuickPosition(activeVisualClip, 'top')}
                  className="inline-flex items-center gap-0.5 rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-200 hover:bg-zinc-700"
                  title="Pindah ke Atas"
                >
                  <ArrowUpToLine className="h-3 w-3 text-cyan-400" />
                  <span>Atas</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickPosition(activeVisualClip, 'center')}
                  className="inline-flex items-center gap-0.5 rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-200 hover:bg-zinc-700"
                  title="Tengah Layar"
                >
                  <span>Tengah</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickPosition(activeVisualClip, 'bottom')}
                  className="inline-flex items-center gap-0.5 rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-200 hover:bg-zinc-700"
                  title="Posisi Subtitle Bawah"
                >
                  <ArrowDownToLine className="h-3 w-3 text-yellow-400" />
                  <span>Subtitle Bawah</span>
                </button>

                {activeLayerIdx >= 0 && upperTracks.length > 1 && (
                  <div className="ml-0.5 flex items-center gap-0.5 border-l border-zinc-700 pl-1.5">
                    <span
                      className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-300"
                      title={
                        activeConcurrentOverlays > 1
                          ? `${activeConcurrentOverlays} overlay bertumpuk di waktu ini`
                          : 'Urutan Lapisan (Layer)'
                      }
                    >
                      <Layers className="h-3 w-3" />
                      <span>
                        L{activeLayerIdx + 1}/{upperTracks.length}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={activeLayerIdx >= upperTracks.length - 1}
                      onClick={() => {
                        useTimelineStore
                          .getState()
                          .moveClipLayer(activeVisualClip.id, 'up');
                        mediaRuntime.renderFrameAt(
                          usePlaybackStore.getState().currentTime,
                          false
                        );
                      }}
                      title="Majukan Layer ke Depan"
                      aria-label="Majukan Layer ke Depan"
                      className="rounded-full bg-zinc-800 p-1 text-zinc-200 hover:bg-cyan-500 hover:text-zinc-950 disabled:opacity-35"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      disabled={activeLayerIdx <= 0}
                      onClick={() => {
                        useTimelineStore
                          .getState()
                          .moveClipLayer(activeVisualClip.id, 'down');
                        mediaRuntime.renderFrameAt(
                          usePlaybackStore.getState().currentTime,
                          false
                        );
                      }}
                      title="Mundurkan Layer ke Belakang"
                      aria-label="Mundurkan Layer ke Belakang"
                      className="rounded-full bg-zinc-800 p-1 text-zinc-200 hover:bg-cyan-500 hover:text-zinc-950 disabled:opacity-35"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Direct On-Canvas CapCut Text Editor Popover */}
              {isInlineEditing &&
                activeVisualClip.type === 'text' &&
                activeVisualClip.textStyle && (
                  <div
                    onPointerDown={(e) => e.stopPropagation()}
                    className="pointer-events-auto absolute right-2 bottom-2 left-2 z-40 mx-auto max-w-md rounded-xl border border-violet-500/50 bg-zinc-950/95 p-3 shadow-2xl backdrop-blur-md"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-bold text-violet-300">
                        Edit Teks Langsung
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsInlineEditing(false)}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-2.5 py-1 text-[11px] font-bold text-zinc-950 hover:bg-emerald-400"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Selesai</span>
                      </button>
                    </div>

                    <textarea
                      autoFocus
                      rows={2}
                      value={activeVisualClip.textStyle.content}
                      onChange={(e) => {
                        useTimelineStore
                          .getState()
                          .updateClipTextStyle(activeVisualClip.id, {
                            content: e.target.value,
                          });
                        mediaRuntime.renderFrameAt(
                          usePlaybackStore.getState().currentTime,
                          false
                        );
                      }}
                      placeholder="Ketik teks overlay atau subtitle..."
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-sm font-semibold text-white outline-none focus:border-violet-400"
                    />

                    {/* Quick Color Swatches + Alignment + Font Size */}
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-zinc-400">Warna:</span>
                        {QUICK_TEXT_COLORS.map((sw) => (
                          <button
                            key={sw.color}
                            type="button"
                            onClick={() => {
                              useTimelineStore
                                .getState()
                                .updateClipTextStyle(activeVisualClip.id, {
                                  color: sw.color,
                                });
                              mediaRuntime.renderFrameAt(
                                usePlaybackStore.getState().currentTime,
                                false
                              );
                            }}
                            style={{ backgroundColor: sw.color }}
                            title={sw.label}
                            className={`h-5 w-5 rounded-full border transition ${
                              activeVisualClip.textStyle?.color === sw.color
                                ? 'scale-125 border-white ring-2 ring-cyan-400'
                                : 'border-white/30'
                            }`}
                          />
                        ))}
                      </div>

                      <div className="flex items-center gap-1">
                        {(
                          [
                            { id: 'left', icon: AlignLeft },
                            { id: 'center', icon: AlignCenter },
                            { id: 'right', icon: AlignRight },
                          ] as const
                        ).map((al) => {
                          const Icon = al.icon;
                          return (
                            <button
                              key={al.id}
                              type="button"
                              onClick={() => {
                                useTimelineStore
                                  .getState()
                                  .updateClipTextStyle(activeVisualClip.id, {
                                    align: al.id,
                                  });
                                mediaRuntime.renderFrameAt(
                                  usePlaybackStore.getState().currentTime,
                                  false
                                );
                              }}
                              className={`rounded p-1 ${
                                activeVisualClip.textStyle?.align === al.id
                                  ? 'bg-violet-500/30 text-violet-200'
                                  : 'bg-zinc-900 text-zinc-400 hover:text-white'
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Quick Background Pill & CapCut Style Presets */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-zinc-400">Latar:</span>
                      {QUICK_BG_COLORS.map((bg) => (
                        <button
                          key={bg.label}
                          type="button"
                          onClick={() => {
                            useTimelineStore
                              .getState()
                              .updateClipTextStyle(activeVisualClip.id, {
                                backgroundColor: bg.color,
                              });
                            mediaRuntime.renderFrameAt(
                              usePlaybackStore.getState().currentTime,
                              false
                            );
                          }}
                          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-200 hover:border-cyan-400"
                        >
                          {bg.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                      {TEXT_PRESETS.map((tp) => (
                        <button
                          key={tp.id}
                          type="button"
                          onClick={() => {
                            useTimelineStore
                              .getState()
                              .updateClipTextStyle(activeVisualClip.id, tp.style);
                            mediaRuntime.renderFrameAt(
                              usePlaybackStore.getState().currentTime,
                              false
                            );
                          }}
                          className="shrink-0 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-semibold text-zinc-200 hover:border-violet-400"
                        >
                          {tp.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
            </>
          );
        })()}
    </div>
  );
}

