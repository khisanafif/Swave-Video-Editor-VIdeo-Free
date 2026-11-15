import { useEffect } from 'react';
import { usePlaybackStore } from '../stores/playbackStore';
import {
  getTimelineDuration,
  useTimelineStore,
} from '../stores/timelineStore';

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

      if (event.code === 'Space') {
        event.preventDefault();
        usePlaybackStore.getState().togglePlay();
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

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const timeline = useTimelineStore.getState();
        if (timeline.selectedClipIds.length > 0) {
          event.preventDefault();
          timeline.deleteClips(timeline.selectedClipIds);
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

