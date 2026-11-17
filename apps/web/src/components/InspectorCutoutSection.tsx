import { useState } from 'react';
import {
  Eraser,
  FlipHorizontal,
  Loader2,
  Pipette,
  RotateCcw,
  Shapes,
  Sparkles,
} from 'lucide-react';
import {
  DEFAULT_BG_REMOVAL,
  DEFAULT_CHROMA_KEY,
  DEFAULT_CLIP_MASK,
  type Clip,
  type ClipMaskShape,
  type InstantBgRemovalMode,
  type MediaAsset,
} from '@swave/shared';
import {
  detectDominantBorderColor,
  runAiCutoutOnClipAsset,
  type CutoutProgressInfo,
} from '../engine/backgroundRemoval';
import { mediaRegistry } from '../engine/opfsStorage';
import { resolveServerUrl } from '../engine/serverOffloadClient';
import { usePlaybackStore } from '../stores/playbackStore';
import { useTimelineStore } from '../stores/timelineStore';
import { useUiStore } from '../stores/uiStore';

interface InspectorCutoutSectionProps {
  selectedClip: Clip;
  asset: MediaAsset | undefined;
  refreshCanvasPreview: () => void;
  showNotice: (msg: string) => void;
}

const CHROMA_SWATCHES = [
  { label: 'Hijau', color: '#00b140' },
  { label: 'Biru', color: '#0047bb' },
  { label: 'Magenta', color: '#d946ef' },
  { label: 'Putih', color: '#ffffff' },
  { label: 'Hitam', color: '#09090b' },
];

const MASK_SHAPES: Array<{ id: ClipMaskShape; label: string }> = [
  { id: 'none', label: 'Tanpa' },
  { id: 'circle', label: 'Lingkaran' },
  { id: 'rectangle', label: 'Persegi' },
  { id: 'split-h', label: 'Belah Horz' },
  { id: 'split-v', label: 'Belah Vert' },
  { id: 'diamond', label: 'Berlian' },
  { id: 'heart', label: 'Hati' },
];

const INSTANT_BG_MODES: Array<{
  id: InstantBgRemovalMode;
  label: string;
  desc: string;
}> = [
  { id: 'none', label: 'Off', desc: 'Matikan hapus luma instan' },
  {
    id: 'luma-black',
    label: 'Latar Hitam',
    desc: 'Hapus latar hitam (efek api, percikan, cahaya) pada video/gambar',
  },
  {
    id: 'luma-white',
    label: 'Latar Putih',
    desc: 'Hapus latar putih polos (stiker, logo, sketsa) secara real-time',
  },
];

function CutoutSlider({
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (val: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono text-zinc-200">
          {Number.isInteger(step) ? value : value.toFixed(2)}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 w-full cursor-pointer accent-cyan-400"
      />
    </label>
  );
}

export function InspectorCutoutSection({
  selectedClip,
  asset,
  refreshCanvasPreview,
  showNotice,
}: InspectorCutoutSectionProps) {
  const [cutoutBusy, setCutoutBusy] = useState(false);
  const [cutoutProgress, setCutoutProgress] = useState<CutoutProgressInfo | null>(
    null
  );
  const eyedropperClipId = useUiStore((s) => s.eyedropperClipId);
  const setEyedropperClipId = useUiStore((s) => s.setEyedropperClipId);

  const isEyedropperActive = eyedropperClipId === selectedClip.id;
  const activeMaskShape: ClipMaskShape = selectedClip.mask?.shape || 'none';
  const activeBgMode: InstantBgRemovalMode =
    selectedClip.bgRemoval?.mode || 'none';
  const hasAiCutoutApplied = Boolean(selectedClip.originalAssetId);

  const resolveClipObjectUrl = (): string | null => {
    if (!asset) return null;
    const raw = mediaRegistry.getObjectUrl(asset.id) || asset.serverUrl;
    if (!raw) return null;
    return raw.startsWith('blob:') || raw.startsWith('data:')
      ? raw
      : resolveServerUrl(raw);
  };

  const resolveLocalTimeSec = (): number => {
    const playTime = usePlaybackStore.getState().currentTime;
    const rel = Math.max(0, playTime - selectedClip.start);
    return (selectedClip.offset || 0) + rel * (selectedClip.speed || 1);
  };

  const handleRunAiCutout = async () => {
    if (!asset) {
      showNotice('Aset media tidak ditemukan.');
      return;
    }
    const objectUrl = resolveClipObjectUrl();
    if (!objectUrl) {
      showNotice('Media belum dimuat di memori lokal.');
      return;
    }

    setCutoutBusy(true);
    setCutoutProgress({ progress: 2, message: 'Memulai AI Potong Latar...' });
    try {
      const cutoutAsset = await runAiCutoutOnClipAsset({
        asset,
        objectUrl,
        timeSec: resolveLocalTimeSec(),
        onProgress: setCutoutProgress,
      });
      const store = useTimelineStore.getState();
      store.registerAsset(cutoutAsset);
      store.applyCutoutAssetToClip(selectedClip.id, cutoutAsset.id);
      refreshCanvasPreview();
      showNotice('Latar belakang overlay berhasil dihapus otomatis!');
    } catch (err) {
      showNotice((err as Error)?.message || 'Gagal memotong latar belakang.');
    } finally {
      setCutoutBusy(false);
      setTimeout(() => setCutoutProgress(null), 1500);
    }
  };

  const handleAutoDetectSolidBackground = async () => {
    if (!asset) return;
    const objectUrl = resolveClipObjectUrl();
    if (!objectUrl) {
      showNotice('Media belum dimuat di memori.');
      return;
    }
    try {
      const detected = await detectDominantBorderColor(
        asset.kind,
        objectUrl,
        resolveLocalTimeSec()
      );
      useTimelineStore.getState().setClipChromaKey(selectedClip.id, {
        enabled: true,
        color: detected.hex,
        tolerance: detected.isDark || detected.isLight ? 0.24 : 0.3,
        smoothness: 0.08,
        spillReduction: 0.45,
      });
      refreshCanvasPreview();
      showNotice(`Warna latar terdeteksi (${detected.hex}) & dihapus!`);
    } catch (err) {
      showNotice((err as Error)?.message || 'Gagal mendeteksi warna latar.');
    }
  };

  return (
    <div className="space-y-2.5">
      {/* 1. CapCut Background Removal / Cutout */}
      <div className="space-y-2 rounded-lg border border-cyan-500/25 bg-cyan-950/15 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-200">
            <Eraser className="h-3.5 w-3.5 text-cyan-400" />
            <span>Hapus Latar (Cutout)</span>
          </div>
          {hasAiCutoutApplied && (
            <button
              type="button"
              onClick={() => {
                useTimelineStore
                  .getState()
                  .restoreOriginalClipAsset(selectedClip.id);
                refreshCanvasPreview();
                showNotice('Latar belakang asli dikembalikan.');
              }}
              className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-zinc-200 hover:border-amber-400"
            >
              <RotateCcw className="h-3 w-3 text-amber-300" />
              <span>Asli</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={cutoutBusy || !asset}
            onClick={() => void handleRunAiCutout()}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-cyan-400/50 bg-cyan-500/20 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-500/30 disabled:opacity-50"
          >
            {cutoutBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
            )}
            <span>
              {cutoutBusy
                ? 'Memproses AI...'
                : asset?.kind === 'video'
                ? 'Potong AI (Frame Ini)'
                : 'Potong AI Otomatis'}
            </span>
          </button>
          <button
            type="button"
            disabled={!asset}
            onClick={() => void handleAutoDetectSolidBackground()}
            className="inline-flex items-center justify-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-1.5 text-[10px] font-semibold text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-50"
            title="Deteksi otomatis warna latar di tepi overlay dan aktifkan Kunci Chroma"
          >
            <Pipette className="h-3 w-3" />
            <span>Polos Otomatis</span>
          </button>
        </div>

        {cutoutProgress && (
          <div className="space-y-1 rounded border border-cyan-500/30 bg-zinc-950/70 p-1.5">
            <div className="flex justify-between text-[10px] text-cyan-200">
              <span className="truncate">{cutoutProgress.message}</span>
              <span className="font-mono">{cutoutProgress.progress}%</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full bg-cyan-400 transition-all"
                style={{ width: `${Math.max(4, cutoutProgress.progress)}%` }}
              />
            </div>
          </div>
        )}

        <div className="space-y-1 pt-0.5">
          <span className="block text-[10px] text-zinc-400">
            Hapus Latar Instan (Real-Time Video & Gambar):
          </span>
          <div className="grid grid-cols-3 gap-1">
            {INSTANT_BG_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                title={m.desc}
                onClick={() => {
                  useTimelineStore.getState().setClipBgRemoval(selectedClip.id, {
                    mode: m.id,
                    threshold:
                      selectedClip.bgRemoval?.threshold ??
                      DEFAULT_BG_REMOVAL.threshold,
                    softness:
                      selectedClip.bgRemoval?.softness ??
                      DEFAULT_BG_REMOVAL.softness,
                  });
                  refreshCanvasPreview();
                }}
                className={`rounded border py-1 text-[10px] font-semibold transition ${
                  activeBgMode === m.id
                    ? 'border-cyan-400 bg-cyan-500/20 text-cyan-100'
                    : 'border-zinc-800 bg-zinc-900/90 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {activeBgMode !== 'none' && (
          <div className="space-y-1.5 pt-1">
            <CutoutSlider
              label="Ambang Hapus Latar"
              value={selectedClip.bgRemoval?.threshold ?? 0.16}
              min={0.04}
              max={0.6}
              step={0.02}
              onChange={(threshold) => {
                useTimelineStore
                  .getState()
                  .setClipBgRemoval(selectedClip.id, { threshold });
                refreshCanvasPreview();
              }}
            />
            <CutoutSlider
              label="Halus Tepi (Edge)"
              value={selectedClip.bgRemoval?.softness ?? 0.08}
              min={0.01}
              max={0.25}
              step={0.01}
              onChange={(softness) => {
                useTimelineStore
                  .getState()
                  .setClipBgRemoval(selectedClip.id, { softness });
                refreshCanvasPreview();
              }}
            />
          </div>
        )}
      </div>

      {/* 2. CapCut Chroma Key (Green Screen / Eyedropper + Spill Cleanup) */}
      <div className="space-y-2 rounded-lg border border-emerald-500/25 bg-emerald-950/15 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-200">
            <Pipette className="h-3.5 w-3.5 text-emerald-400" />
            <span>Kunci Chroma (Green Screen)</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                const nextClipId = isEyedropperActive ? null : selectedClip.id;
                setEyedropperClipId(nextClipId);
              }}
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-semibold transition ${
                isEyedropperActive
                  ? 'border-cyan-400 bg-cyan-500/25 text-cyan-100'
                  : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
              }`}
              title="Ketuk warna langsung di video pratinjau untuk dihapus"
            >
              <Pipette className="h-3 w-3" />
              <span>{isEyedropperActive ? 'Batal Pipet' : 'Pipet Kanvas'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                useTimelineStore.getState().setClipChromaKey(selectedClip.id, {
                  enabled: !selectedClip.chromaKey?.enabled,
                  color:
                    selectedClip.chromaKey?.color || DEFAULT_CHROMA_KEY.color,
                  tolerance:
                    selectedClip.chromaKey?.tolerance ??
                    DEFAULT_CHROMA_KEY.tolerance,
                });
                refreshCanvasPreview();
              }}
              className={`rounded border px-2 py-0.5 text-[10px] font-bold ${
                selectedClip.chromaKey?.enabled
                  ? 'border-emerald-400 bg-emerald-500/25 text-emerald-200'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-400'
              }`}
            >
              {selectedClip.chromaKey?.enabled ? 'Aktif' : 'Nonaktif'}
            </button>
          </div>
        </div>

        {selectedClip.chromaKey?.enabled && (
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
              <span className="text-zinc-400">Warna Kunci:</span>
              <div className="flex flex-wrap items-center gap-1">
                {CHROMA_SWATCHES.map((sw) => (
                  <button
                    key={sw.label}
                    type="button"
                    onClick={() => {
                      useTimelineStore
                        .getState()
                        .setClipChromaKey(selectedClip.id, { color: sw.color });
                      refreshCanvasPreview();
                    }}
                    className={`rounded border px-1.5 py-0.5 text-[10px] transition ${
                      (selectedClip.chromaKey?.color || '').toLowerCase() ===
                      sw.color.toLowerCase()
                        ? 'border-emerald-400 bg-emerald-500/25 text-emerald-100'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-emerald-400'
                    }`}
                  >
                    {sw.label}
                  </button>
                ))}
                <input
                  type="color"
                  aria-label="Warna Chroma Key"
                  value={selectedClip.chromaKey.color || '#00b140'}
                  onChange={(e) => {
                    useTimelineStore
                      .getState()
                      .setClipChromaKey(selectedClip.id, {
                        color: e.target.value,
                      });
                    refreshCanvasPreview();
                  }}
                  className="h-6 w-7 cursor-pointer rounded border border-zinc-700 bg-transparent"
                />
              </div>
            </div>

            <CutoutSlider
              label="Intensitas (Toleransi)"
              value={selectedClip.chromaKey.tolerance ?? 0.32}
              min={0.08}
              max={0.65}
              step={0.02}
              onChange={(tolerance) => {
                useTimelineStore
                  .getState()
                  .setClipChromaKey(selectedClip.id, { tolerance });
                refreshCanvasPreview();
              }}
            />
            <CutoutSlider
              label="Bayangan (Halus Tepi)"
              value={selectedClip.chromaKey.smoothness ?? 0.08}
              min={0.02}
              max={0.25}
              step={0.01}
              onChange={(smoothness) => {
                useTimelineStore
                  .getState()
                  .setClipChromaKey(selectedClip.id, { smoothness });
                refreshCanvasPreview();
              }}
            />
            <CutoutSlider
              label="Kurangi Spill (Sisa Warna)"
              value={selectedClip.chromaKey.spillReduction ?? 0.5}
              min={0}
              max={1}
              step={0.05}
              onChange={(spillReduction) => {
                useTimelineStore
                  .getState()
                  .setClipChromaKey(selectedClip.id, { spillReduction });
                refreshCanvasPreview();
              }}
            />
          </div>
        )}
      </div>

      {/* 3. CapCut Shape / Split Mask */}
      <div className="space-y-2 rounded-lg border border-violet-500/25 bg-violet-950/15 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-200">
            <Shapes className="h-3.5 w-3.5 text-violet-400" />
            <span>Masker Bentuk (CapCut Mask)</span>
          </div>
          {activeMaskShape !== 'none' && (
            <button
              type="button"
              onClick={() => {
                useTimelineStore.getState().setClipMask(selectedClip.id, {
                  invert: !selectedClip.mask?.invert,
                });
                refreshCanvasPreview();
              }}
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-semibold ${
                selectedClip.mask?.invert
                  ? 'border-violet-400 bg-violet-500/25 text-violet-100'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-300'
              }`}
            >
              <FlipHorizontal className="h-3 w-3" />
              <span>Balik</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-4 gap-1">
          {MASK_SHAPES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                useTimelineStore.getState().setClipMask(selectedClip.id, {
                  shape: m.id,
                  size: selectedClip.mask?.size ?? DEFAULT_CLIP_MASK.size,
                  feather:
                    selectedClip.mask?.feather ?? DEFAULT_CLIP_MASK.feather,
                  invert: selectedClip.mask?.invert ?? false,
                });
                refreshCanvasPreview();
              }}
              className={`rounded border py-1 text-[10px] font-medium transition ${
                activeMaskShape === m.id
                  ? 'border-violet-400 bg-violet-500/25 text-violet-100'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {activeMaskShape !== 'none' && (
          <div className="space-y-1.5 pt-1">
            <CutoutSlider
              label="Ukuran / Posisi Masker"
              value={Math.round((selectedClip.mask?.size ?? 0.82) * 100)}
              min={15}
              max={100}
              step={1}
              suffix="%"
              onChange={(pct) => {
                useTimelineStore
                  .getState()
                  .setClipMask(selectedClip.id, { size: pct / 100 });
                refreshCanvasPreview();
              }}
            />
            <CutoutSlider
              label="Tepi Halus (Feather)"
              value={selectedClip.mask?.feather ?? 0.04}
              min={0}
              max={0.3}
              step={0.01}
              onChange={(feather) => {
                useTimelineStore
                  .getState()
                  .setClipMask(selectedClip.id, { feather });
                refreshCanvasPreview();
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
