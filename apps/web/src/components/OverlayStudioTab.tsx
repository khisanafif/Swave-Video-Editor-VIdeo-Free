import { useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  Film,
  Image as ImageIcon,
  Layers,
  Plus,
  Trash2,
} from 'lucide-react';
import { probeAndRegisterMediaFile } from '../engine/mediaProbe';
import { mediaRuntime } from '../engine/mediaRuntime';
import { usePlaybackStore } from '../stores/playbackStore';
import {
  getMainVideoTrackId,
  getTimelineDisplayTrackOrder,
  useTimelineStore,
} from '../stores/timelineStore';
import { useUiStore } from '../stores/uiStore';

interface OverlayStudioTabProps {
  onSyncAsset?: (assetId: string, file?: File) => void;
  onClipAdded?: () => void;
}

export function OverlayStudioTab({
  onSyncAsset,
  onClipAdded,
}: OverlayStudioTabProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  const assets = useTimelineStore((s) => s.assets);
  const tracks = useTimelineStore((s) => s.tracks);
  const trackOrder = useTimelineStore((s) => s.trackOrder);
  const clips = useTimelineStore((s) => s.clips);
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds);

  const visualAssets = Object.values(assets).filter(
    (a) => a.kind === 'image' || a.kind === 'video'
  );

  const mainId = getMainVideoTrackId(trackOrder, tracks);
  const displayOrder = getTimelineDisplayTrackOrder(trackOrder, tracks);
  const upperTrackIds = displayOrder.filter((tid) => {
    const tr = tracks[tid];
    return tr && tid !== mainId && tr.type !== 'audio';
  });

  // Collect visual overlay/text clips stacked top-most first matching preview z-order
  const stackedVisualItems = upperTrackIds.flatMap((tid) => {
    const tr = tracks[tid];
    if (!tr) return [];
    return tr.clipIds
      .map((cid) => clips[cid])
      .filter((c): c is NonNullable<typeof c> => Boolean(c && c.type !== 'audio'))
      .map((clip) => ({ track: tr, clip }));
  });

  const handleImportOverlays = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsImporting(true);
    try {
      const store = useTimelineStore.getState();
      const baseTime = usePlaybackStore.getState().currentTime;

      for (const file of Array.from(files)) {
        const asset = await probeAndRegisterMediaFile(
          file,
          file.name,
          file.type
        );
        store.registerAsset(asset);
        if (asset.kind === 'image' || asset.kind === 'video') {
          store.addOverlayClipFromAsset(asset.id, baseTime);
        } else {
          store.addClipFromAsset(asset.id, undefined, baseTime);
        }
        onSyncAsset?.(asset.id, file);
      }
      mediaRuntime.renderFrameAt(baseTime, false);
      useUiStore.getState().setMobileTimelineFocus('overlay');
      onClipAdded?.();
    } finally {
      setIsImporting(false);
    }
  };

  const upperAscIds = trackOrder.filter(
    (tid) => tid !== mainId && tracks[tid]?.type !== 'audio'
  );

  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-3 text-xs">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          void handleImportOverlays(e.target.files);
          e.target.value = '';
        }}
      />

      {/* CapCut [+ Tambahkan Overlay] Action Card */}
      <button
        type="button"
        disabled={isImporting}
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/50 bg-amber-500/15 px-3 py-2.5 text-xs font-bold text-amber-200 transition hover:bg-amber-500/25 active:scale-95 disabled:opacity-50"
      >
        <Layers className="h-4 w-4 text-amber-300" />
        <span>
          {isImporting
            ? 'Memuat Gambar / Overlay...'
            : '+ Tambahkan Overlay (Gambar / Video PIP)'}
        </span>
      </button>

      <p className="text-[10px] leading-relaxed text-zinc-400">
        Unggah PNG/JPG/WebP/Video sebagai lapisan di atas video utama. Jika menambah
        lebih dari 1 overlay di waktu sama, track{' '}
        <span className="font-semibold text-amber-300">Overlay 1, Overlay 2, dst</span>{' '}
        otomatis tersusun bertingkat tanpa bertabrakan.
      </p>

      {/* Multi-Overlay Stack / Layer Manager (Urutan Lapisan > 1 Overlay) */}
      <div className="space-y-2 border-t border-zinc-800/80 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-semibold text-zinc-200 uppercase">
            <Layers className="h-3.5 w-3.5 text-[#00E5FF]" />
            <span>Urutan Lapisan Overlay ({stackedVisualItems.length})</span>
          </div>
          <span className="text-[10px] text-zinc-500">Teratas = Paling Depan</span>
        </div>

        {stackedVisualItems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/40 p-3 text-center text-[11px] text-zinc-500">
            Belum ada overlay atau teks aktif. Ketuk{' '}
            <strong className="text-amber-300">+ Tambahkan Overlay</strong> di atas
            untuk menempel gambar logo, stiker foto, atau video B-roll.
          </div>
        ) : (
          <div className="space-y-1.5">
            {stackedVisualItems.map(({ track, clip }) => {
              const ascIdx = upperAscIds.indexOf(track.id);
              const layerNum = ascIdx >= 0 ? ascIdx + 1 : 1;
              const isSelected = selectedClipIds.includes(clip.id);
              const asset = assets[clip.assetId];
              const isImage = asset?.kind === 'image';

              return (
                <div
                  key={clip.id}
                  onClick={() => {
                    useTimelineStore.getState().selectClip(clip.id, false);
                    usePlaybackStore.getState().seekTo(clip.start + 0.01);
                    mediaRuntime.renderFrameAt(clip.start + 0.01, false);
                  }}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-2 transition ${
                    isSelected
                      ? 'border-[#00E5FF] bg-[#00E5FF]/10'
                      : 'border-zinc-800 bg-zinc-900/70 hover:border-zinc-700'
                  } ${track.isMuted ? 'opacity-50' : ''}`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                      L{layerNum}
                    </span>
                    {asset?.thumbnailUrl ? (
                      <img
                        src={asset.thumbnailUrl}
                        alt={clip.name}
                        className="h-7 w-7 shrink-0 rounded object-cover"
                      />
                    ) : isImage ? (
                      <ImageIcon className="h-4 w-4 shrink-0 text-amber-300" />
                    ) : (
                      <Film className="h-4 w-4 shrink-0 text-cyan-300" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold text-zinc-100">
                        {clip.name}
                      </p>
                      <p className="text-[10px] text-zinc-500">
                        {track.name} · {clip.start.toFixed(1)}s–
                        {(clip.start + clip.duration).toFixed(1)}s ·{' '}
                        {Math.round((clip.transforms.scale || 1) * 100)}%
                      </p>
                    </div>
                  </div>

                  <div
                    className="flex shrink-0 items-center gap-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      disabled={ascIdx < 0 || ascIdx >= upperAscIds.length - 1}
                      onClick={() => {
                        useTimelineStore.getState().moveClipLayer(clip.id, 'up');
                        mediaRuntime.renderFrameAt(
                          usePlaybackStore.getState().currentTime,
                          false
                        );
                      }}
                      title="Majukan Layer ke Depan"
                      aria-label={`Naikkan Layer ${clip.name}`}
                      className="rounded p-1 text-zinc-300 hover:bg-zinc-800 hover:text-[#00E5FF] disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={ascIdx <= 0}
                      onClick={() => {
                        useTimelineStore.getState().moveClipLayer(clip.id, 'down');
                        mediaRuntime.renderFrameAt(
                          usePlaybackStore.getState().currentTime,
                          false
                        );
                      }}
                      title="Mundurkan Layer ke Belakang"
                      aria-label={`Turunkan Layer ${clip.name}`}
                      className="rounded p-1 text-zinc-300 hover:bg-zinc-800 hover:text-[#00E5FF] disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        useTimelineStore.getState().toggleTrackMute(track.id)
                      }
                      title={track.isMuted ? 'Tampilkan Layer' : 'Sembunyikan Layer'}
                      className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                    >
                      {track.isMuted ? (
                        <EyeOff className="h-3.5 w-3.5 text-rose-400" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        useTimelineStore.getState().duplicateClip(clip.id);
                      }}
                      title="Duplikat Klip Overlay"
                      className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        useTimelineStore.getState().deleteClips([clip.id]);
                        mediaRuntime.renderFrameAt(
                          usePlaybackStore.getState().currentTime,
                          false
                        );
                      }}
                      title="Hapus Klip Overlay"
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-rose-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Existing Media Assets Directly as Additional Overlays */}
      {visualAssets.length > 0 && (
        <div className="space-y-2 border-t border-zinc-800/80 pt-3">
          <p className="font-semibold text-zinc-300 uppercase">
            Pasang dari Pustaka Media sebagai Overlay
          </p>
          <div className="space-y-1.5">
            {visualAssets.map((asset) => (
              <div
                key={`ovl-asset-${asset.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-2.5 py-1.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {asset.thumbnailUrl ? (
                    <img
                      src={asset.thumbnailUrl}
                      alt={asset.name}
                      className="h-7 w-9 shrink-0 rounded object-cover"
                    />
                  ) : asset.kind === 'image' ? (
                    <ImageIcon className="h-4 w-4 shrink-0 text-amber-300" />
                  ) : (
                    <Film className="h-4 w-4 shrink-0 text-cyan-300" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium text-zinc-100">
                      {asset.name}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      {asset.kind === 'image' ? 'Gambar PNG/JPG' : 'Video B-Roll'}{' '}
                      {asset.width > 0 ? `· ${asset.width}×${asset.height}` : ''}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const t = usePlaybackStore.getState().currentTime;
                    useTimelineStore.getState().addOverlayClipFromAsset(asset.id, t);
                    useUiStore.getState().setMobileTimelineFocus('overlay');
                    mediaRuntime.renderFrameAt(t, false);
                    onClipAdded?.();
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-500/20 px-2 py-1 text-[10px] font-bold text-amber-200 hover:bg-amber-400 hover:text-zinc-950"
                >
                  <Plus className="h-3 w-3" />
                  <span>+ Overlay</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
