import { beforeEach, describe, expect, it } from 'vitest';
import type { MediaAsset } from '@swave/shared';
import { usePlaybackStore } from '../stores/playbackStore';
import { useTimelineStore } from '../stores/timelineStore';

const sampleVideoAsset: MediaAsset = {
  id: 'asset-vid-1',
  name: 'intro.mp4',
  kind: 'video',
  mimeType: 'video/mp4',
  size: 1024 * 1024,
  duration: 10,
  width: 1920,
  height: 1080,
  hasAudio: true,
  source: 'local',
};

const sampleAudioAsset: MediaAsset = {
  id: 'asset-aud-1',
  name: 'bgm.mp3',
  kind: 'audio',
  mimeType: 'audio/mpeg',
  size: 512 * 1024,
  duration: 20,
  width: 0,
  height: 0,
  hasAudio: true,
  source: 'local',
};

describe('SWAVE VIDEO Dual-Store & Zundo History', () => {
  beforeEach(() => {
    useTimelineStore.getState().resetProject();
    useTimelineStore.temporal.getState().clear();
    usePlaybackStore.setState({ currentTime: 0, isPlaying: false });
  });

  it('adds, splits, trims, moves, and undoes/redoes clips accurately', () => {
    const store = useTimelineStore.getState();
    store.registerAsset(sampleVideoAsset);

    const clipId = store.addClipFromAsset(sampleVideoAsset.id, 'track-1', 0);
    expect(clipId).toBeTruthy();

    let clip = useTimelineStore.getState().clips[clipId!];
    expect(clip.duration).toBe(10);
    expect(clip.offset).toBe(0);

    // Split at 4s
    const secondId = useTimelineStore
      .getState()
      .splitClipAtTime(clipId!, 4);
    expect(secondId).toBeTruthy();

    const stateAfterSplit = useTimelineStore.getState();
    expect(stateAfterSplit.clips[clipId!].duration).toBe(4);
    expect(stateAfterSplit.clips[secondId!].start).toBe(4);
    expect(stateAfterSplit.clips[secondId!].duration).toBe(6);
    expect(stateAfterSplit.clips[secondId!].offset).toBe(4);
    expect(stateAfterSplit.tracks['track-1'].clipIds).toEqual([
      clipId,
      secondId,
    ]);

    // Trim second clip left edge from 4s to 5.5s
    useTimelineStore.getState().trimClip(secondId!, 'left', 5.5);
    clip = useTimelineStore.getState().clips[secondId!];
    expect(clip.start).toBe(5.5);
    expect(clip.offset).toBe(5.5);
    expect(clip.duration).toBe(4.5);

    // Undo restores state before trim
    useTimelineStore.temporal.getState().undo();
    clip = useTimelineStore.getState().clips[secondId!];
    expect(clip.start).toBe(4);
    expect(clip.duration).toBe(6);

    // Redo re-applies trim
    useTimelineStore.temporal.getState().redo();
    clip = useTimelineStore.getState().clips[secondId!];
    expect(clip.start).toBe(5.5);
    expect(clip.duration).toBe(4.5);
  });

  it('prevents moving clips onto locked or incompatible tracks', () => {
    const store = useTimelineStore.getState();
    store.registerAsset(sampleVideoAsset);
    store.registerAsset(sampleAudioAsset);

    const vidId = store.addClipFromAsset(sampleVideoAsset.id, 'track-1', 0)!;

    // Video clip cannot move to audio track (track-3)
    useTimelineStore.getState().moveClip(vidId, 'track-3', 2);
    expect(useTimelineStore.getState().clips[vidId].trackId).toBe('track-1');
    expect(useTimelineStore.getState().clips[vidId].start).toBe(2);

    // Lock track-1 -> moveClip must become no-op
    useTimelineStore.getState().toggleTrackLock('track-1');
    useTimelineStore.getState().moveClip(vidId, 'track-1', 6);
    expect(useTimelineStore.getState().clips[vidId].start).toBe(2);
  });

  it('batches continuous drag changes as a single history step when Zundo is paused/resumed', () => {
    const store = useTimelineStore.getState();
    store.registerAsset(sampleVideoAsset);
    const vidId = store.addClipFromAsset(sampleVideoAsset.id, 'track-1', 0)!;
    const beforeSteps = useTimelineStore.temporal.getState().pastStates.length;

    useTimelineStore.temporal.getState().pause();
    for (let x = 1; x <= 10; x++) {
      useTimelineStore.getState().moveClip(vidId, 'track-1', x);
    }
    useTimelineStore.temporal.getState().resume();

    // Pause prevents flooding 10 intermediate steps into temporal history
    expect(useTimelineStore.temporal.getState().pastStates.length).toBe(
      beforeSteps
    );
    expect(useTimelineStore.getState().clips[vidId].start).toBe(10);
  });

  it('supports Speed scaling, Auto-Caption generator, Mirror Flip, Freeze Frame, Stickers & Animations', () => {
    const store = useTimelineStore.getState();
    store.registerAsset(sampleVideoAsset);
    const vidId = store.addClipFromAsset(sampleVideoAsset.id, 'track-1', 0)!;

    // 2x Speed halves clip duration from 10s to 5s
    useTimelineStore.getState().setClipSpeed(vidId, 2);
    expect(useTimelineStore.getState().clips[vidId].speed).toBe(2);
    expect(useTimelineStore.getState().clips[vidId].duration).toBe(5);

    // 0.5x Speed doubles original duration to 20s and allows trimming across full 20s timeline span
    useTimelineStore.getState().setClipSpeed(vidId, 0.5);
    expect(useTimelineStore.getState().clips[vidId].duration).toBe(20);
    useTimelineStore.getState().trimClip(vidId, 'right', 16);
    expect(useTimelineStore.getState().clips[vidId].duration).toBe(16);
    useTimelineStore.getState().trimClip(vidId, 'left', 2);
    expect(useTimelineStore.getState().clips[vidId].start).toBe(2);
    expect(useTimelineStore.getState().clips[vidId].offset).toBe(1);

    // Mirror H & Rotate 90°
    useTimelineStore.getState().flipClip(vidId, 'h');
    useTimelineStore.getState().rotateClip90(vidId);
    expect(useTimelineStore.getState().clips[vidId].transforms.flipH).toBe(true);
    expect(useTimelineStore.getState().clips[vidId].transforms.rotation).toBe(90);

    // Freeze frame creates a 1.5s frozen clip
    const freezeId = useTimelineStore.getState().freezeClipAtTime(vidId, 2);
    expect(freezeId).toBeTruthy();
    expect(useTimelineStore.getState().clips[freezeId!].duration).toBe(1.5);

    // Auto-Caption generator splits script into timed subtitle clips with stroke outline
    const captionIds = useTimelineStore
      .getState()
      .generateAutoCaptions(
        'Halo semuanya selamat datang.\nIni editor video web gratis!',
        'bold-yellow'
      );
    expect(captionIds.length).toBeGreaterThanOrEqual(2);
    const firstCaption = useTimelineStore.getState().clips[captionIds[0]];
    expect(firstCaption.textStyle?.strokeWidth).toBeGreaterThan(0);
    expect(firstCaption.animation?.in).toBe('zoom-in');

    // Sticker clip
    const stickerId = useTimelineStore.getState().addStickerClip('🔥', 'Api Hype', 0);
    expect(stickerId).toBeTruthy();
    expect(useTimelineStore.getState().clips[stickerId!].textStyle?.content).toBe('🔥');
  });

  it('supports Pro & Subtitle workflows: addSubtitleCues, split/merge/batch-style subtitles, rippleDelete, detachAudio, autoDuck & autoCutSilence', () => {
    const store = useTimelineStore.getState();
    store.registerAsset(sampleVideoAsset);
    store.registerAsset(sampleAudioAsset);

    const v1 = store.addClipFromAsset(sampleVideoAsset.id, 'track-1', 0)!;
    const v2 = store.addClipFromAsset(sampleVideoAsset.id, 'track-1', 12)!;
    const audId = store.addClipFromAsset(sampleAudioAsset.id, 'track-3', 0)!;

    // Ripple delete v1 -> v2 shifts left from 12s to 2s
    useTimelineStore.getState().rippleDeleteClips([v1]);
    expect(useTimelineStore.getState().clips[v1]).toBeUndefined();
    expect(useTimelineStore.getState().clips[v2].start).toBe(2);

    // Close track gaps -> v2 moves to 0s
    useTimelineStore.getState().closeTrackGaps('track-1');
    expect(useTimelineStore.getState().clips[v2].start).toBe(0);

    // Auto-duck BGM lowers audio track volume
    const ducked = useTimelineStore.getState().autoDuckAudioTracks(0.2);
    expect(ducked).toBe(1);
    expect(useTimelineStore.getState().clips[audId].volume).toBe(0.2);

    // Detach audio from v2 mutes video clip and creates new audio clip
    const detachedId = useTimelineStore.getState().detachAudioFromClip(v2);
    expect(detachedId).toBeTruthy();
    expect(useTimelineStore.getState().clips[v2].volume).toBe(0);
    expect(useTimelineStore.getState().clips[detachedId!].type).toBe('audio');

    // Auto-cut silence keeps only spoken segments
    const kept = useTimelineStore.getState().autoCutSilenceOnClip(v2, [
      { start: 0.5, end: 2.0 },
      { start: 4.0, end: 6.5 },
    ]);
    expect(kept).toBe(2);

    // Add subtitle cues, split, merge, and batch-style all
    const subIds = useTimelineStore.getState().addSubtitleCues(
      [
        { start: 0, end: 2, text: 'Halo semua teman' },
        { start: 2, end: 4, text: 'Ayo belajar edit' },
      ],
      'karaoke-highlight',
      { replaceExisting: true }
    );
    expect(subIds).toHaveLength(2);

    const splitSubId = useTimelineStore.getState().splitSubtitleCue(subIds[0]);
    expect(splitSubId).toBeTruthy();
    expect(useTimelineStore.getState().clips[subIds[0]].textStyle?.content).toBe(
      'Halo semua'
    );

    const mergedId = useTimelineStore.getState().mergeSubtitleWithNext(subIds[0]);
    expect(mergedId).toBe(subIds[0]);
    expect(useTimelineStore.getState().clips[subIds[0]].textStyle?.content).toBe(
      'Halo semua teman'
    );

    useTimelineStore
      .getState()
      .applySubtitleStyleToAll({ color: '#22d3ee', fontSize: 72 });
    expect(useTimelineStore.getState().clips[subIds[0]].textStyle?.color).toBe(
      '#22d3ee'
    );
    expect(useTimelineStore.getState().clips[subIds[1]].textStyle?.fontSize).toBe(
      72
    );
  });
});

