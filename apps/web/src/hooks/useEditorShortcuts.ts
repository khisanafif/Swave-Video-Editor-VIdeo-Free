import { useEffect } from 'react';
import { mediaRuntime } from '../engine/mediaRuntime';
import { usePlaybackStore } from '../stores/playbackStore';
import {
  getTimelineDuration,
  useTimelineStore,
} from '../stores/timelineStore';
import { useUiStore } from '../stores/uiStore';

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

export function useEditorShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableElement(event.target)) return;

      const isMod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (isMod && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        useTimelineStore.temporal.getState().undo();
        return;
      }

      if (isMod && (key === 'y' || (key === 'z' && event.shiftKey))) {
        event.preventDefault();
        useTimelineStore.temporal.getState().redo();
        return;
      }

      if (isMod && key === 'd') {
        const timeline = useTimelineStore.getState();
        if (timeline.selectedClipIds.length === 1) {
          event.preventDefault();
          timeline.duplicateClip(timeline.selectedClipIds[0]);
        }
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        mediaRuntime.unlockAudio();
        usePlaybackStore.getState().togglePlay();
        return;
      }

      // Pro J / K / L Shuttle Controls
      if (!isMod && key === 'k') {
        event.preventDefault();
        usePlaybackStore.getState().setPlaying(false);
        usePlaybackStore.getState().setPlaybackRate(1);
        return;
      }

      if (!isMod && key === 'l') {
        event.preventDefault();
        mediaRuntime.unlockAudio();
        const pb = usePlaybackStore.getState();
        const nextRate = pb.isPlaying
          ? Math.min(4, pb.playbackRate >= 2 ? 4 : pb.playbackRate * 2)
          : 1;
        pb.setPlaybackRate(nextRate);
        pb.setPlaying(true);
        return;
      }

      if (!isMod && key === 'j') {
        event.preventDefault();
        const timeline = useTimelineStore.getState();
        const maxDur = getTimelineDuration(timeline.clips);
        const pb = usePlaybackStore.getState();
        pb.setPlaying(false);
        pb.stepTime(-1, maxDur);
        mediaRuntime.renderFrameAt(usePlaybackStore.getState().currentTime, false);
        return;
      }

      if (key === 's' && !isMod) {
        event.preventDefault();
        const playhead = usePlaybackStore.getState().currentTime;
        const timeline = useTimelineStore.getState();

        const targetIds =
          timeline.selectedClipIds.length > 0
            ? timeline.selectedClipIds
            : Object.values(timeline.clips)
                .filter(
                  (c) => playhead > c.start && playhead < c.start + c.duration
                )
                .map((c) => c.id);

        for (const id of targetIds) {
          timeline.splitClipAtTime(id, playhead);
        }
        return;
      }

      // Pro '[' and ']' Trim-to-Playhead
      if (!isMod && (event.key === '[' || event.key === ']')) {
        const timeline = useTimelineStore.getState();
        if (timeline.selectedClipIds.length === 1) {
          event.preventDefault();
          const playhead = usePlaybackStore.getState().currentTime;
          timeline.trimClipToPlayhead(
            timeline.selectedClipIds[0],
            event.key === '[' ? 'left' : 'right',
            playhead
          );
          mediaRuntime.renderFrameAt(playhead, false);
        }
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const timeline = useTimelineStore.getState();
        if (timeline.selectedClipIds.length > 0) {
          event.preventDefault();
          if (event.shiftKey) {
            timeline.rippleDeleteClips(timeline.selectedClipIds);
          } else {
            timeline.deleteClips(timeline.selectedClipIds);
          }
        }
        return;
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const timeline = useTimelineStore.getState();
        const fps = timeline.resolution.fps || 30;
        const step = event.shiftKey ? 1 : 1 / fps;
        const dir = event.key === 'ArrowLeft' ? -1 : 1;
        const maxDur = getTimelineDuration(timeline.clips);
        usePlaybackStore.getState().stepTime(dir * step, maxDur);
        mediaRuntime.renderFrameAt(usePlaybackStore.getState().currentTime, false);
        return;
      }

      if (event.key === '?') {
        event.preventDefault();
        const ui = useUiStore.getState();
        ui.setShowHelpModal(!ui.showHelpModal);
        return;
      }

      if (event.key === 'Escape') {
        useTimelineStore.getState().clearSelection();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
