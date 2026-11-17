import { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  ChevronDown,
  Lock,
  Sliders,
  Unlock,
  X,
} from 'lucide-react';
import {
  ASPECT_RATIO_PRESETS,
  CAPCUT_FPS_OPTIONS,
  CAPCUT_RESOLUTION_TIERS,
  computeResolutionForAspectAndTier,
  inferResolutionBadge,
  normalizeCustomDimensions,
  type CanvasResolution,
} from '@swave/shared';
import { useTimelineStore } from '../stores/timelineStore';

export interface ResolutionConfigPanelProps {
  resolution: CanvasResolution;
  onChangeResolution: (next: CanvasResolution) => void;
  quality?: 'draft' | 'standard' | 'high';
  onChangeQuality?: (q: 'draft' | 'standard' | 'high') => void;
  durationSec?: number;
  compact?: boolean;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a)) || 1;
  let y = Math.abs(Math.round(b)) || 1;
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function getRatioPair(width: number, height: number): { w: number; h: number } {
  const matched = ASPECT_RATIO_PRESETS.find(
    (p) => Math.abs(width / Math.max(1, height) - p.w / p.h) < 0.025
  );
  if (matched) return { w: matched.w, h: matched.h };
  const div = gcd(width, height);
  return {
    w: Math.max(1, Math.round(width / div)),
    h: Math.max(1, Math.round(height / div)),
  };
}

export function ResolutionConfigPanel({
  resolution,
  onChangeResolution,
  quality,
  onChangeQuality,
  durationSec = 10,
  compact = false,
}: ResolutionConfigPanelProps) {
  const shortSide = Math.min(resolution.width || 1920, resolution.height || 1080);
  const matchedTier = CAPCUT_RESOLUTION_TIERS.find(
    (t) => t.shortEdge === shortSide
  );

  const [isCustomOpen, setIsCustomOpen] = useState(!matchedTier);
  const [customW, setCustomW] = useState(String(resolution.width || 1920));
  const [customH, setCustomH] = useState(String(resolution.height || 1080));
  const [lockAspect, setLockAspect] = useState(false);

  useEffect(() => {
    setCustomW(String(resolution.width));
    setCustomH(String(resolution.height));
  }, [resolution.width, resolution.height]);

  const currentRatio = getRatioPair(resolution.width, resolution.height);
  const ratioValue = Math.max(0.1, (resolution.width || 1920) / Math.max(1, resolution.height || 1080));

  const applyCustomDimensions = (rawW = customW, rawH = customH) => {
    const parsedW = Number(rawW);
    const parsedH = Number(rawH);
    const { width, height } = normalizeCustomDimensions(
      Number.isFinite(parsedW) && parsedW > 0 ? parsedW : resolution.width,
      Number.isFinite(parsedH) && parsedH > 0 ? parsedH : resolution.height
    );
    setCustomW(String(width));
    setCustomH(String(height));
    onChangeResolution({
      width,
      height,
      fps: resolution.fps || 30,
      label: `Kustom ${width}×${height}`,
    });
  };

  const handleSelectTier = (tierId: '480p' | '720p' | '1080p' | '2k' | '4k' | 'custom') => {
    if (tierId === 'custom') {
      setIsCustomOpen(true);
      return;
    }
    setIsCustomOpen(false);
    const tier = CAPCUT_RESOLUTION_TIERS.find((t) => t.id === tierId);
    if (!tier) return;
    onChangeResolution(
      computeResolutionForAspectAndTier(
        currentRatio.w,
        currentRatio.h,
        tier.shortEdge,
        resolution.fps || 30,
        `${currentRatio.w}:${currentRatio.h}`
      )
    );
  };

  const handleSelectAspect = (w: number, h: number, label: string) => {
    const targetShort = matchedTier ? matchedTier.shortEdge : 1080;
    onChangeResolution(
      computeResolutionForAspectAndTier(
        w,
        h,
        targetShort,
        resolution.fps || 30,
        label
      )
    );
  };

  const handleCustomWidthInput = (val: string) => {
    setCustomW(val);
    const num = Number(val);
    if (lockAspect && Number.isFinite(num) && num >= 16) {
      const pairedH = Math.max(16, Math.min(4096, Math.round(num / ratioValue / 2) * 2));
      setCustomH(String(pairedH));
    }
  };

  const handleCustomHeightInput = (val: string) => {
    setCustomH(val);
    const num = Number(val);
    if (lockAspect && Number.isFinite(num) && num >= 16) {
      const pairedW = Math.max(16, Math.min(4096, Math.round((num * ratioValue) / 2) * 2));
      setCustomW(String(pairedW));
    }
  };

  const bitrateMbps =
    quality === 'draft' ? 2.5 : quality === 'high' ? 10 : 5;
  const estMb = ((bitrateMbps * Math.max(1, durationSec)) / 8).toFixed(1);

  return (
    <div className={compact ? 'space-y-2.5 text-[11px]' : 'space-y-3 text-xs'}>
      {/* 1. Resolusi ala CapCut (480P / 720P / 1080P / 2K / 4K / Kustom) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-zinc-300">Resolusi</span>
          <span className="font-mono text-[10px] text-[#00E5FF]">
            {resolution.width}×{resolution.height} · {resolution.fps}fps
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
          {CAPCUT_RESOLUTION_TIERS.map((tier) => {
            const active = !isCustomOpen && matchedTier?.id === tier.id;
            return (
              <button
                key={tier.id}
                type="button"
                onClick={() => handleSelectTier(tier.id)}
                className={`rounded-lg border px-1.5 py-1.5 text-center transition ${
                  active
                    ? 'border-[#00E5FF] bg-[#00E5FF]/20 font-bold text-[#00E5FF]'
                    : 'border-[#2A2A32] bg-[#18181C] text-zinc-300 hover:border-zinc-600'
                }`}
              >
                <div className="text-[11px] leading-tight font-bold">
                  {tier.label}
                </div>
                <div className="text-[9px] opacity-70">{tier.badge}</div>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => handleSelectTier('custom')}
            className={`rounded-lg border px-1.5 py-1.5 text-center transition ${
              isCustomOpen || !matchedTier
                ? 'border-amber-400 bg-amber-500/20 font-bold text-amber-200'
                : 'border-[#2A2A32] bg-[#18181C] text-zinc-300 hover:border-zinc-600'
            }`}
          >
            <div className="flex items-center justify-center gap-0.5 text-[11px] leading-tight font-bold">
              <Sliders className="h-3 w-3" />
              <span>Kustom</span>
            </div>
            <div className="text-[9px] opacity-70">Bebas px</div>
          </button>
        </div>

        {/* Custom Width x Height Panel */}
        {(isCustomOpen || !matchedTier) && (
          <div className="space-y-2 rounded-xl border border-amber-500/35 bg-[#111114] p-2.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-semibold text-amber-300">
                Ukuran Kanvas Kustom (16 – 4096 px)
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setLockAspect((v) => !v)}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${
                    lockAspect
                      ? 'bg-cyan-500/20 text-[#00E5FF]'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                  title="Kunci / Buka proporsi rasio saat mengubah lebar atau tinggi"
                >
                  {lockAspect ? (
                    <Lock className="h-2.5 w-2.5" />
                  ) : (
                    <Unlock className="h-2.5 w-2.5" />
                  )}
                  <span>{lockAspect ? 'Rasio Terkunci' : 'Rasio Bebas'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextW = customH;
                    const nextH = customW;
                    applyCustomDimensions(nextW, nextH);
                  }}
                  className="inline-flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-200 hover:bg-zinc-700"
                  title="Tukar Lebar & Tinggi (Potret <-> Lanskap)"
                >
                  <ArrowLeftRight className="h-2.5 w-2.5" />
                  <span>Balik</span>
                </button>
              </div>
            </div>

            <div className="flex items-end gap-1.5">
              <label className="min-w-0 flex-1">
                <span className="mb-0.5 block text-[10px] text-zinc-400">
                  Lebar (Width)
                </span>
                <input
                  type="number"
                  aria-label="Lebar Resolusi Kustom"
                  min={16}
                  max={4096}
                  step={2}
                  value={customW}
                  onChange={(e) => handleCustomWidthInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyCustomDimensions();
                  }}
                  className="w-full rounded border border-[#2A2A32] bg-[#18181C] px-2 py-1 font-mono text-xs text-white outline-none focus:border-amber-400"
                />
              </label>
              <span className="pb-1.5 font-mono text-zinc-500">×</span>
              <label className="min-w-0 flex-1">
                <span className="mb-0.5 block text-[10px] text-zinc-400">
                  Tinggi (Height)
                </span>
                <input
                  type="number"
                  aria-label="Tinggi Resolusi Kustom"
                  min={16}
                  max={4096}
                  step={2}
                  value={customH}
                  onChange={(e) => handleCustomHeightInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyCustomDimensions();
                  }}
                  className="w-full rounded border border-[#2A2A32] bg-[#18181C] px-2 py-1 font-mono text-xs text-white outline-none focus:border-amber-400"
                />
              </label>
              <button
                type="button"
                onClick={() => applyCustomDimensions()}
                className="shrink-0 rounded-md bg-amber-400 px-3 py-1.5 text-[11px] font-bold text-zinc-950 hover:bg-amber-300 active:scale-95"
              >
                Terapkan
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Rasio Kanvas ala CapCut (16:9, 9:16, 1:1, 4:5, 4:3, 21:9) */}
      <div className="space-y-1.5">
        <span className="block font-semibold text-zinc-300">Rasio Kanvas</span>
        <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
          {ASPECT_RATIO_PRESETS.map((ar) => {
            const isMatched =
              Math.abs(
                resolution.width / Math.max(1, resolution.height) - ar.w / ar.h
              ) < 0.025;
            return (
              <button
                key={ar.id}
                type="button"
                onClick={() => handleSelectAspect(ar.w, ar.h, ar.label)}
                className={`rounded-lg border px-1.5 py-1 text-center transition ${
                  isMatched
                    ? 'border-[#00E5FF] bg-[#00E5FF]/15 text-[#00E5FF]'
                    : 'border-[#2A2A32] bg-[#18181C] text-zinc-300 hover:border-zinc-600'
                }`}
              >
                <div className="text-[11px] font-bold">{ar.label}</div>
                <div className="truncate text-[9px] opacity-65">{ar.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Tingkat Bingkai (Frame Rate / FPS ala CapCut) */}
      <div className="space-y-1.5">
        <span className="block font-semibold text-zinc-300">
          Tingkat Bingkai (FPS)
        </span>
        <div className="grid grid-cols-5 gap-1">
          {CAPCUT_FPS_OPTIONS.map((fpsVal) => {
            const active = Math.round(resolution.fps || 30) === fpsVal;
            return (
              <button
                key={fpsVal}
                type="button"
                onClick={() =>
                  onChangeResolution({
                    ...resolution,
                    fps: fpsVal,
                  })
                }
                className={`rounded-lg border py-1 text-center font-mono text-[11px] font-bold transition ${
                  active
                    ? 'border-[#00E5FF] bg-[#00E5FF]/20 text-[#00E5FF]'
                    : 'border-[#2A2A32] bg-[#18181C] text-zinc-300 hover:border-zinc-600'
                }`}
              >
                {fpsVal}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Optional Laju Bit / Kualitas Ekspor (CRF) */}
      {quality && onChangeQuality && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-zinc-300">
              Laju Bit & Kualitas
            </span>
            <span className="text-[10px] text-zinc-400">
              Estimasi: ~{estMb} MB
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { id: 'draft', label: 'Rendah (Hemat)', sub: '2.5 Mbps · CRF 28' },
                { id: 'standard', label: 'Disarankan', sub: '5 Mbps · CRF 21' },
                { id: 'high', label: 'Tinggi Studio', sub: '10 Mbps · CRF 17' },
              ] as const
            ).map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => onChangeQuality(q.id)}
                className={`rounded-lg border px-2 py-1.5 text-left transition ${
                  quality === q.id
                    ? 'border-emerald-400 bg-emerald-500/15 text-emerald-200'
                    : 'border-[#2A2A32] bg-[#18181C] text-zinc-300 hover:border-zinc-600'
                }`}
              >
                <div className="text-[11px] font-bold">{q.label}</div>
                <div className="text-[9px] opacity-75">{q.sub}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ResolutionTriggerPopoverProps {
  compact?: boolean;
  align?: 'center' | 'right' | 'left';
  placement?: 'bottom' | 'top';
}

export function ResolutionTriggerPopover({
  compact = false,
  align = 'center',
  placement = 'bottom',
}: ResolutionTriggerPopoverProps) {
  const [open, setOpen] = useState(false);
  const resolution = useTimelineStore((s) => s.resolution);
  const badge = inferResolutionBadge(resolution);

  const popoverAlignClass =
    align === 'right'
      ? 'right-0'
      : align === 'left'
      ? 'left-0'
      : 'left-1/2 -translate-x-1/2';
  const popoverVerticalClass =
    placement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Resolusi Kanvas"
        aria-expanded={open}
        title="Pilih Resolusi (480P–4K / Kustom), Rasio Kanvas & FPS ala CapCut"
        className={`inline-flex items-center gap-1 rounded-md border transition ${
          open
            ? 'border-[#00E5FF] bg-[#00E5FF]/15 text-[#00E5FF]'
            : 'border-[#2A2A32] bg-[#18181C] text-zinc-100 hover:border-zinc-600'
        } ${compact ? 'px-2 py-1 text-[11px] font-bold' : 'px-2 py-1 text-[10px] font-semibold'}`}
      >
        <span>{badge}</span>
        <span className="text-[10px] text-zinc-400">· {resolution.fps}fps</span>
        <ChevronDown className="h-3 w-3 opacity-80" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/35"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label="Pengaturan Resolusi dan Rasio CapCut"
            className={`absolute z-60 max-h-[min(76dvh,480px)] w-[330px] max-w-[92vw] overflow-y-auto rounded-2xl border border-[#2A2A32] bg-[#202026] p-3.5 shadow-2xl ${popoverVerticalClass} ${popoverAlignClass}`}
          >
            <div className="mb-2.5 flex items-center justify-between border-b border-[#2A2A32] pb-2">
              <span className="text-xs font-bold text-white">
                Resolusi & Rasio Proyek
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-zinc-400 hover:bg-[#242429] hover:text-white"
                aria-label="Tutup pengaturan resolusi"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <ResolutionConfigPanel
              compact
              resolution={resolution}
              onChangeResolution={(next) =>
                useTimelineStore.getState().setResolution(next)
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
