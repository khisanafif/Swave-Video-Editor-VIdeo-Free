import {
  AlignHorizontalSpaceAround,
  Copy,
  FlipHorizontal2,
  Lock,
  Magnet,
  Plus,
  Redo2,
  Scissors,
  Snowflake,
  Trash2,
  Unlock,
  Undo2,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useStore } from 'zustand';
import { usePlaybackStore } from '../../stores/playbackStore';
import {
  getTimelineDuration,
  useTimelineStore,
} from '../../stores/timelineStore';
import { useUiStore } from '../../stores/uiStore';
import { ClipItem } from './ClipItem';
import { Playhead } from './Playhead';
import { TimeRuler } from './TimeRuler';

const TRACK_ROW_HEIGHT = 54;

export function TimelineContainer() {
  const experienceMode = useUiStore((s) => s.experienceMode);
  const tracks = useTimelineStore((s) => s.tracks);
  const trackOrder = useTimelineStore((s) => s.trackOrder);
  const clips = useTimelineStore((s) => s.clips);
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds);
  const pixelsPerSecond = useTimelineStore((s) => s.pixelsPerSecond);
  const snapEnabled = useTimelineStore((s) => s.snapEnabled);

  const pastStates = useStore(useTimelineStore.temporal, (s) => s.pastStates);
  const futureStates = useStore(useTimelineStore.temporal, (s) => s.futureStates);

  const totalDuration = getTimelineDuration(clips, 20) + 10;
  const laneWidth = Math.max(800, Math.ceil(totalDuration * pixelsPerSecond));
  const lanesTotalHeight = Math.max(150, trackOrder.length * TRACK_ROW_HEIGHT + 28);

  const handleSplitAtPlayhead = () => {
    const playhead = usePlaybackStore.getState().currentTime;
    const state = useTimelineStore.getState();
    const targetIds =
      state.selectedClipIds.length > 0
        ? state.selectedClipIds
        : Object.values(state.clips)
          .filter((c) => playhead > c.start && playhead < c.start + c.duration)
          .map((c) => c.id);

    for (const cid of targetIds) {
      state.splitClipAtTime(cid, playhead);
    }
  };

  return (
    <section
      aria-label="Multi-Track Timeline"
      className="flex min-h-[180px] flex-1 flex-col border-t border-zinc-800 bg-zinc-950 lg:h-72 lg:flex-none"
    >
      {/* TimelineToolbar — horizontally scrollable on narrow Android viewports */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto border-b border-zinc-800/80 bg-zinc-900/70 px-2.5 py-1.5 lg:px-3">
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={pastStates.length === 0}
            onClick={() => useTimelineStore.temporal.getState().undo()}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 active:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-35"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Undo</span>
          </button>
          <button
            type="button"
            disabled={futureStates.length === 0}
            onClick={() => useTimelineStore.temporal.getState().redo()}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 active:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-35"
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Redo</span>
          </button>

          <div className="mx-1 h-4 w-px bg-zinc-800" />

          <button
            type="button"
            onClick={handleSplitAtPlayhead}
            className="inline-flex items-center gap-1 rounded bg-zinc-800/70 px-2.5 py-1 text-xs font-medium text-zinc-100 hover:bg-zinc-800 active:bg-zinc-700"
            title="Split clip di posisi Playhead (S)"
          >
            <Scissors className="h-3.5 w-3.5 text-cyan-400" />
            <span>Split</span>
          </button>

          <button
            type="button"
            disabled={selectedClipIds.length !== 1}
            onClick={() =>
              selectedClipIds[0] &&
              useTimelineStore
                .getState()
                .trimClipToPlayhead(
                  selectedClipIds[0],
                  'left',
                  usePlaybackStore.getState().currentTime
                )
            }
            className="hidden items-center gap-0.5 rounded px-1.5 py-1 font-mono text-[11px] text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-35 sm:inline-flex"
            title="Pangkas Awal Klip ke Playhead ([)"
          >
            <span>[ Trim</span>
          </button>

          <button
            type="button"
            disabled={selectedClipIds.length !== 1}
            onClick={() =>
              selectedClipIds[0] &&
              useTimelineStore
                .getState()
                .trimClipToPlayhead(
                  selectedClipIds[0],
                  'right',
                  usePlaybackStore.getState().currentTime
                )
            }
            className="hidden items-center gap-0.5 rounded px-1.5 py-1 font-mono text-[11px] text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-35 sm:inline-flex"
            title="Pangkas Akhir Klip ke Playhead (])"
          >
            <span>Trim ]</span>
          </button>

          <button
            type="button"
            disabled={selectedClipIds.length !== 1}
            onClick={() =>
              selectedClipIds[0] &&
              useTimelineStore
                .getState()
                .freezeClipAtTime(
                  selectedClipIds[0],
                  usePlaybackStore.getState().currentTime
                )
            }
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 active:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-35"
            title="Freeze Frame 1.5s"
          >
            <Snowflake className="h-3.5 w-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Freeze</span>
          </button>

          <button
            type="button"
            disabled={selectedClipIds.length !== 1}
            onClick={() =>
              selectedClipIds[0] &&
              useTimelineStore.getState().flipClip(selectedClipIds[0], 'h')
            }
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 active:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-35"
            title="Mirror Horizontal"
          >
            <FlipHorizontal2 className="h-3.5 w-3.5 text-violet-400" />
            <span className="hidden sm:inline">Mirror</span>
          </button>

          <button
            type="button"
            disabled={selectedClipIds.length !== 1}
            onClick={() =>
              selectedClipIds[0] &&
              useTimelineStore.getState().duplicateClip(selectedClipIds[0])
            }
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 active:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-35"
            title="Duplikat klip terpilih"
          >
            <Copy className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Duplikat</span>
          </button>

          <button
            type="button"
            disabled={selectedClipIds.length === 0}
            onClick={() =>
              useTimelineStore.getState().deleteClips(selectedClipIds)
            }
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-rose-300 hover:bg-rose-950/60 active:bg-rose-900/50 disabled:cursor-not-allowed disabled:opacity-35"
            title="Hapus klip terpilih (Delete)"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Hapus</span>
          </button>

          <button
            type="button"
            disabled={selectedClipIds.length === 0}
            onClick={() =>
              useTimelineStore.getState().rippleDeleteClips(selectedClipIds)
            }
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-300 hover:bg-amber-950/50 active:bg-amber-900/50 disabled:cursor-not-allowed disabled:opacity-35"
            title="Hapus & Rapatkan celah otomatis (Shift+Delete)"
          >
            <AlignHorizontalSpaceAround className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Rapatkan</span>
          </button>

          {experienceMode === 'pro' && selectedClipIds.length === 1 && (
            <button
              type="button"
              onClick={() => {
                const c = clips[selectedClipIds[0]];
                if (c) {
                  useTimelineStore.getState().closeTrackGaps(c.trackId);
                }
              }}
              className="hidden items-center gap-1 rounded px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 lg:inline-flex"
              title="Tutup semua celah kosong di track klip terpilih"
            >
              <span>Tutup Celah</span>
            </button>
          )}

          <div className="mx-1 h-4 w-px bg-zinc-800" />

          <button
            type="button"
            onClick={() => useTimelineStore.getState().toggleSnap()}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${snapEnabled
              ? 'bg-cyan-500/20 text-cyan-300'
              : 'text-zinc-400 hover:bg-zinc-800'
              }`}
            title="Toggle Magnetic Snap"
          >
            <Magnet className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Snap</span>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => useTimelineStore.getState().addTrack('video')}
              className="inline-flex items-center gap-0.5 rounded border border-zinc-700/80 bg-zinc-800/70 px-1.5 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700"
              title="Tambah Track Video"
            >
              <Plus className="h-3 w-3 text-sky-400" />
              <span>Vid</span>
            </button>
            <button
              type="button"
              onClick={() => useTimelineStore.getState().addTrack('text')}
              className="inline-flex items-center gap-0.5 rounded border border-zinc-700/80 bg-zinc-800/70 px-1.5 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700"
              title="Tambah Track Teks"
            >
              <Plus className="h-3 w-3 text-violet-400" />
              <span>Teks</span>
            </button>
            <button
              type="button"
              onClick={() => useTimelineStore.getState().addTrack('audio')}
              className="inline-flex items-center gap-0.5 rounded border border-zinc-700/80 bg-zinc-800/70 px-1.5 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700"
              title="Tambah Track Audio"
            >
              <Plus className="h-3 w-3 text-emerald-400" />
              <span>Aud</span>
            </button>
          </div>

          <div className="flex items-center gap-1 pl-1">
            <button
              type="button"
              onClick={() =>
                useTimelineStore.getState().setPixelsPerSecond(pixelsPerSecond - 15)
              }
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              aria-label="Zoom out timeline"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <input
              type="range"
              aria-label="Zoom timeline"
              min={15}
              max={240}
              value={pixelsPerSecond}
              onChange={(e) =>
                useTimelineStore
                  .getState()
                  .setPixelsPerSecond(Number(e.target.value))
              }
              className="hidden h-1.5 w-20 accent-cyan-400 sm:block"
            />
            <button
              type="button"
              onClick={() =>
                useTimelineStore.getState().setPixelsPerSecond(pixelsPerSecond + 15)
              }
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              aria-label="Zoom in timeline"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* TimelineWorkspace */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* TrackHeaderList — compact on Android phones (w-24), spacious on desktop (lg:w-44) */}
        <div className="w-24 shrink-0 border-r border-zinc-800 bg-zinc-900/50 sm:w-32 lg:w-44">
          <div className="flex h-7 items-center border-b border-zinc-800 px-2 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase lg:px-3">
            Tracks
          </div>
          <div className="overflow-y-auto">
            {trackOrder.map((trackId) => {
              const track = tracks[trackId];
              if (!track) return null;
              const badgeColor =
                track.type === 'audio'
                  ? 'bg-emerald-400'
                  : track.type === 'text'
                    ? 'bg-violet-400'
                    : 'bg-sky-400';

              return (
                <div
                  key={track.id}
                  style={{ height: TRACK_ROW_HEIGHT }}
                  className="flex items-center justify-between border-b border-zinc-800/70 px-1.5 lg:px-2.5"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className={`h-2.5 w-1 shrink-0 rounded-full ${badgeColor}`} />
                    <span
                      onDoubleClick={() => {
                        if (experienceMode !== 'pro') return;
                        const nextName = window.prompt(
                          'Ubah nama track:',
                          track.name
                        );
                        if (nextName) {
                          useTimelineStore
                            .getState()
                            .renameTrack(track.id, nextName);
                        }
                      }}
                      title={
                        experienceMode === 'pro'
                          ? `${track.name} (Klik ganda untuk ganti nama)`
                          : track.name
                      }
                      className="truncate text-[11px] font-medium text-zinc-200 lg:text-xs"
                    >
                      {track.name}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        useTimelineStore.getState().toggleTrackMute(track.id)
                      }
                      className={`rounded p-1 ${track.isMuted
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                        }`}
                      title={track.isMuted ? 'Unmute track' : 'Mute track'}
                    >
                      {track.isMuted ? (
                        <VolumeX className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
                      ) : (
                        <Volume2 className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        useTimelineStore.getState().toggleTrackLock(track.id)
                      }
                      className={`rounded p-1 ${track.isLocked
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                        }`}
                      title={track.isLocked ? 'Unlock track' : 'Lock track'}
                    >
                      {track.isLocked ? (
                        <Lock className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
                      ) : (
                        <Unlock className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
                      )}
                    </button>
                    {trackOrder.length > 1 && !track.isLocked && (
                      <button
                        type="button"
                        onClick={() =>
                          useTimelineStore.getState().deleteTrack(track.id)
                        }
                        className="inline-flex rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-rose-400"
                        title="Hapus track"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* TimelineScrollArea */}
        <div
          className="relative min-w-0 flex-1 overflow-auto bg-[#0d0d10]"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) {
              useTimelineStore.getState().clearSelection();
            }
          }}
        >
          <div className="relative" style={{ width: laneWidth }}>
            <div className="sticky top-0 z-20">
              <TimeRuler totalDuration={totalDuration} />
            </div>

            <Playhead height={lanesTotalHeight} />

            {/* TrackLaneList */}
            <div>
              {trackOrder.map((trackId) => {
                const track = tracks[trackId];
                if (!track) return null;
                return (
                  <div
                    key={track.id}
                    data-track-id={track.id}
                    style={{ height: TRACK_ROW_HEIGHT }}
                    onPointerDown={(e) => {
                      if (e.target === e.currentTarget) {
                        useTimelineStore.getState().clearSelection();
                      }
                    }}
                    className={`relative border-b border-zinc-800/70 ${track.isMuted ? 'bg-zinc-950/80 opacity-60' : 'bg-zinc-900/20'
                      }`}
                  >
                    {track.clipIds.map((cid) => {
                      const clip = clips[cid];
                      if (!clip) return null;
                      return (
                        <ClipItem
                          key={clip.id}
                          clip={clip}
                          isLocked={track.isLocked}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
