import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CLIP_TRANSFORM,
  DEFAULT_TEXT_STYLE,
  type ProjectDocument,
} from '@velocut/shared';
import {
  buildAssSubtitleDocument,
  buildFfmpegRenderPlan,
} from '../worker/ffmpegPlanner.js';

function createSampleProject(): ProjectDocument {
  return {
    id: 'p1',
    name: 'Test Project',
    resolution: { width: 1920, height: 1080, fps: 30, label: '1080p' },
    trackOrder: ['t-video', 't-muted', 't-text', 't-audio'],
    tracks: {
      't-video': {
        id: 't-video',
        type: 'video',
        name: 'Video',
        isMuted: false,
        isLocked: false,
        clipIds: ['c-vid'],
      },
      't-muted': {
        id: 't-muted',
        type: 'video',
        name: 'Muted Track',
        isMuted: true,
        isLocked: false,
        clipIds: ['c-ignored'],
      },
      't-text': {
        id: 't-text',
        type: 'text',
        name: 'Overlay',
        isMuted: false,
        isLocked: false,
        clipIds: ['c-txt'],
      },
      't-audio': {
        id: 't-audio',
        type: 'audio',
        name: 'BGM',
        isMuted: false,
        isLocked: false,
        clipIds: ['c-aud'],
      },
    },
    clips: {
      'c-vid': {
        id: 'c-vid',
        trackId: 't-video',
        assetId: 'asset-v1',
        type: 'video',
        name: 'Clip 1',
        start: 0,
        duration: 4,
        offset: 1,
        transforms: { ...DEFAULT_CLIP_TRANSFORM, scale: 0.9, opacity: 0.85 },
        effects: [
          { type: 'brightness', value: 0.1 },
          { type: 'grayscale', value: 0.5 },
        ],
      },
      'c-ignored': {
        id: 'c-ignored',
        trackId: 't-muted',
        assetId: 'asset-missing',
        type: 'video',
        name: 'Muted Clip',
        start: 0,
        duration: 2,
        offset: 0,
        transforms: { ...DEFAULT_CLIP_TRANSFORM },
        effects: [],
      },
      'c-txt': {
        id: 'c-txt',
        trackId: 't-text',
        assetId: 'text',
        type: 'text',
        name: 'Title',
        start: 0.5,
        duration: 2.5,
        offset: 0,
        transforms: { ...DEFAULT_CLIP_TRANSFORM, y: -120 },
        effects: [],
        textStyle: { ...DEFAULT_TEXT_STYLE, content: 'Hello: VeloCut' },
      },
      'c-aud': {
        id: 'c-aud',
        trackId: 't-audio',
        assetId: 'asset-a1',
        type: 'audio',
        name: 'Music',
        start: 1,
        duration: 3,
        offset: 0.5,
        transforms: { ...DEFAULT_CLIP_TRANSFORM },
        effects: [],
      },
    },
    assets: {
      'asset-v1': {
        id: 'asset-v1',
        name: 'clip.mp4',
        kind: 'video',
        mimeType: 'video/mp4',
        size: 1024,
        duration: 10,
        width: 1920,
        height: 1080,
        hasAudio: true,
        source: 'server',
      },
      'asset-a1': {
        id: 'asset-a1',
        name: 'bgm.mp3',
        kind: 'audio',
        mimeType: 'audio/mpeg',
        size: 512,
        duration: 10,
        width: 0,
        height: 0,
        hasAudio: true,
        source: 'server',
      },
    },
    updatedAt: '2026-11-15T00:00:00.000Z',
  };
}

describe('buildFfmpegRenderPlan', () => {
  it('constructs a valid filter_complex graph with GPU NVENC, skipped muted tracks, drawtext escaping, and audio mixing', () => {
    const project = createSampleProject();
    const plan = buildFfmpegRenderPlan({
      project,
      encoder: 'h264_nvenc',
      quality: 'standard',
      outputPath: '/mnt/storage/renders/out.mp4',
      resolveAssetPath: (id) => {
        if (id === 'asset-v1') return '/mnt/storage/assets/v1.mp4';
        if (id === 'asset-a1') return '/mnt/storage/assets/a1.mp3';
        return null;
      },
    });

    expect(plan.missingAssets).toEqual([]);
    expect(plan.totalDuration).toBe(4);
    expect(plan.commandPreview).toContain('h264_nvenc');
    expect(plan.commandPreview).toContain('eq=brightness=0.10:contrast=1.00:saturation=1.00');
    expect(plan.commandPreview).toContain('hue=s=0.50');
    expect(plan.commandPreview).toContain("drawtext=text='Hello\\: VeloCut'");
    expect(plan.commandPreview).toContain('amix=inputs=2');
  });

  it('reports missing server assets cleanly without crashing', () => {
    const project = createSampleProject();
    const plan = buildFfmpegRenderPlan({
      project,
      encoder: 'libx264',
      outputPath: '/tmp/out.mp4',
      resolveAssetPath: () => null,
    });

    expect(plan.missingAssets).toEqual(['asset-v1', 'asset-a1']);
  });

  it('generates ASS subtitle documents and plans speed/volume/fade/ass filters cleanly', () => {
    const project = createSampleProject();
    project.canvasBackground = '#0f172a';
    project.clips['c-vid'].speed = 1.5;
    project.clips['c-aud'].volume = 0.25;
    project.clips['c-aud'].fadeIn = 0.5;
    project.clips['c-aud'].fadeOut = 0.5;

    const assDoc = buildAssSubtitleDocument(project, [project.clips['c-txt']]);
    expect(assDoc).toContain('PlayResX: 1920');
    expect(assDoc).toContain('Style: Boxed');
    expect(assDoc).toContain('Dialogue:');
    expect(assDoc).toContain('\\1c&HFFFFFF&');
    expect(assDoc).toContain('Hello: VeloCut');

    const plan = buildFfmpegRenderPlan({
      project,
      encoder: 'libx264',
      quality: 'high',
      outputPath: '/tmp/out.mp4',
      assFilePath: '/tmp/subs.ass',
      resolveAssetPath: (id) =>
        id === 'asset-v1' ? '/tmp/v1.mp4' : '/tmp/a1.mp3',
    });

    expect(plan.commandPreview).toContain('color=c=0x0f172a');
    expect(plan.commandPreview).toContain('atempo=1.500');
    expect(plan.commandPreview).toContain('volume=0.25');
    expect(plan.commandPreview).toContain('afade=t=in');
    expect(plan.commandPreview).toContain("ass='/tmp/subs.ass'");
  });
});

