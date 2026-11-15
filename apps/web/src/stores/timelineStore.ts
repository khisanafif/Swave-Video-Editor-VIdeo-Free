import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { temporal } from 'zundo';
import {
  DEFAULT_CLIP_ANIMATION,
  DEFAULT_CLIP_TRANSFORM,
  DEFAULT_TEXT_STYLE,
  PRESET_RESOLUTIONS,
  type CanvasResolution,
  type Clip,
  type ClipAnimation,
  type ClipEffect,
  type ClipEffectType,
  type ClipTransform,
  type MediaAsset,
  type ProjectDocument,
  type TextStyle,
  type Track,
  type TrackType,
} from '@velocut/shared';
import { TEXT_PRESETS } from '../engine/capcutPresets';

export const MIN_CLIP_DURATION = 0.1;

export interface TimelineState {
  projectId: string;
  projectName: string;
  resolution: CanvasResolution;
  canvasBackground: string;
  tracks: Record<string, Track>;
  trackOrder: string[];
  clips: Record<string, Clip>;
  assets: Record<string, MediaAsset>;
  selectedClipIds: string[];
  pixelsPerSecond: number;
  snapEnabled: boolean;

  setProjectName: (name: string) => void;
  setResolution: (resolution: CanvasResolution) => void;
  setCanvasBackground: (bg: string) => void;
  addTrack: (type: TrackType, name?: string) => string;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;
  deleteTrack: (trackId: string) => void;

  registerAsset: (asset: MediaAsset) => void;
  updateAsset: (assetId: string, patch: Partial<MediaAsset>) => void;
  removeAsset: (assetId: string) => void;

  addClipFromAsset: (
    assetId: string,
    targetTrackId?: string,
    startTime?: number
  ) => string | null;
  addTextClip: (
    content?: string,
    startTime?: number,
    targetTrackId?: string
  ) => string | null;
  addPresetTextClip: (
    presetId: string,
    customText?: string,
    startTime?: number
  ) => string | null;
  addStickerClip: (
    emoji: string,
    label?: string,
    startTime?: number
  ) => string | null;
  generateAutoCaptions: (
    scriptText: string,
    presetId?: string
  ) => string[];
  moveClip: (clipId: string, newTrackId: string, newStart: number) => void;
  trimClip: (clipId: string, edge: 'left' | 'right', targetTime: number) => void;
  splitClipAtTime: (clipId: string, splitTime: number) => string | null;
  freezeClipAtTime: (clipId: string, freezeTime: number) => string | null;
  deleteClips: (clipIds: string[]) => void;
  duplicateClip: (clipId: string) => string | null;

  selectClip: (clipId: string, multi?: boolean) => void;
  clearSelection: () => void;

  updateClipTransform: (clipId: string, patch: Partial<ClipTransform>) => void;
  flipClip: (clipId: string, axis: 'h' | 'v') => void;
  rotateClip90: (clipId: string) => void;
  setClipEffect: (clipId: string, type: ClipEffectType | string, value: number) => void;
  applyFilterPreset: (clipId: string, presetId: string, effects: ClipEffect[]) => void;
  setClipSpeed: (clipId: string, speed: number) => void;
  setClipAudioParams: (
    clipId: string,
    patch: { volume?: number; fadeIn?: number; fadeOut?: number }
  ) => void;
  setClipAnimation: (clipId: string, patch: Partial<ClipAnimation>) => void;
  updateClipTextStyle: (clipId: string, patch: Partial<TextStyle>) => void;

  setPixelsPerSecond: (pps: number) => void;
  toggleSnap: () => void;

  exportProjectDocument: () => ProjectDocument;
  loadProjectDocument: (doc: ProjectDocument) => void;
  resetProject: () => void;
}

function createUid(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function createDefaultTracks(): {
  tracks: Record<string, Track>;
  trackOrder: string[];
} {
  return {
    tracks: {
      'track-1': {
        id: 'track-1',
        type: 'video',
        name: 'Video Utama',
        isMuted: false,
        isLocked: false,
        clipIds: [],
      },
      'track-2': {
        id: 'track-2',
        type: 'text',
        name: 'Teks & Overlay',
        isMuted: false,
        isLocked: false,
        clipIds: [],
      },
      'track-3': {
        id: 'track-3',
        type: 'audio',
        name: 'Audio Latar',
        isMuted: false,
        isLocked: false,
        clipIds: [],
      },
    },
    trackOrder: ['track-1', 'track-2', 'track-3'],
  };
}

function isTrackCompatible(trackType: TrackType, clipType: TrackType): boolean {
  if (trackType === 'audio') return clipType === 'audio';
  if (trackType === 'text') return clipType === 'text' || clipType === 'overlay';
  if (trackType === 'video' || trackType === 'overlay') {
    return clipType !== 'audio';
  }
  return false;
}

function findNextEndTime(track: Track, clips: Record<string, Clip>): number {
  let maxEnd = 0;
  for (const cid of track.clipIds) {
    const c = clips[cid];
    if (c) maxEnd = Math.max(maxEnd, c.start + c.duration);
  }
  return Number(maxEnd.toFixed(3));
}

export function getTimelineDuration(
  clips: Record<string, Clip>,
  minSeconds = 10
): number {
  let maxEnd = 0;
  for (const clip of Object.values(clips)) {
    maxEnd = Math.max(maxEnd, clip.start + clip.duration);
  }
  return Math.max(minSeconds, maxEnd);
}

const initialLayout = createDefaultTracks();

export const useTimelineStore = create<TimelineState>()(
  temporal(
    immer((set, get) => ({
      projectId: 'velocut-studio-project',
      projectName: 'Proyek Studio Tanpa Judul',
      resolution: PRESET_RESOLUTIONS[0],
      canvasBackground: '#09090b',
      tracks: initialLayout.tracks,
      trackOrder: initialLayout.trackOrder,
      clips: {},
      assets: {},
      selectedClipIds: [],
      pixelsPerSecond: 60,
      snapEnabled: true,

      setProjectName: (name) =>
        set((state) => {
          state.projectName = name;
        }),

      setResolution: (resolution) =>
        set((state) => {
          state.resolution = resolution;
        }),

      setCanvasBackground: (bg) =>
        set((state) => {
          state.canvasBackground = bg;
        }),

      addTrack: (type, name) => {
        const id = createUid('track');
        set((state) => {
          const count =
            Object.values(state.tracks).filter((t) => t.type === type).length + 1;
          const labelMap: Record<TrackType, string> = {
            video: `Video ${count}`,
            audio: `Audio ${count}`,
            text: `Teks ${count}`,
            overlay: `Overlay ${count}`,
          };
          state.tracks[id] = {
            id,
            type,
            name: name || labelMap[type],
            isMuted: false,
            isLocked: false,
            clipIds: [],
          };
          state.trackOrder.push(id);
        });
        return id;
      },

      toggleTrackMute: (trackId) =>
        set((state) => {
          const track = state.tracks[trackId];
          if (track) track.isMuted = !track.isMuted;
        }),

      toggleTrackLock: (trackId) =>
        set((state) => {
          const track = state.tracks[trackId];
          if (track) track.isLocked = !track.isLocked;
        }),

      deleteTrack: (trackId) =>
        set((state) => {
          if (state.trackOrder.length <= 1) return;
          const track = state.tracks[trackId];
          if (!track || track.isLocked) return;
          for (const cid of track.clipIds) {
            delete state.clips[cid];
          }
          state.selectedClipIds = state.selectedClipIds.filter(
            (id) => !track.clipIds.includes(id)
          );
          delete state.tracks[trackId];
          state.trackOrder = state.trackOrder.filter((id) => id !== trackId);
        }),

      registerAsset: (asset) =>
        set((state) => {
          state.assets[asset.id] = asset;
        }),

      updateAsset: (assetId, patch) =>
        set((state) => {
          const asset = state.assets[assetId];
          if (asset) {
            Object.assign(asset, patch);
          }
        }),

      removeAsset: (assetId) =>
        set((state) => {
          delete state.assets[assetId];
          const removedClipIds: string[] = [];
          for (const clip of Object.values(state.clips)) {
            if (clip.assetId === assetId) {
              removedClipIds.push(clip.id);
            }
          }
          for (const cid of removedClipIds) {
            const clip = state.clips[cid];
            if (clip && state.tracks[clip.trackId]) {
              state.tracks[clip.trackId].clipIds = state.tracks[
                clip.trackId
              ].clipIds.filter((id) => id !== cid);
            }
            delete state.clips[cid];
          }
          state.selectedClipIds = state.selectedClipIds.filter(
            (id) => !removedClipIds.includes(id)
          );
        }),

      addClipFromAsset: (assetId, targetTrackId, startTime) => {
        const current = get();
        const asset = current.assets[assetId];
        if (!asset) return null;

        const clipType: TrackType =
          asset.kind === 'audio'
            ? 'audio'
            : asset.kind === 'image'
            ? 'overlay'
            : 'video';

        let resolvedTrackId = targetTrackId;
        if (resolvedTrackId) {
          const candidate = current.tracks[resolvedTrackId];
          if (
            !candidate ||
            candidate.isLocked ||
            !isTrackCompatible(candidate.type, clipType)
          ) {
            resolvedTrackId = undefined;
          }
        }

        if (!resolvedTrackId) {
          const found = current.trackOrder.find((tid) => {
            const tr = current.tracks[tid];
            return tr && !tr.isLocked && isTrackCompatible(tr.type, clipType);
          });
          resolvedTrackId = found;
        }

        if (!resolvedTrackId) {
          resolvedTrackId = current.addTrack(
            clipType === 'audio' ? 'audio' : 'video'
          );
        }

        const clipId = createUid('clip');
        const defaultDuration =
          asset.kind === 'image'
            ? 4
            : Math.max(MIN_CLIP_DURATION, asset.duration || 5);

        set((state) => {
          const track = state.tracks[resolvedTrackId!];
          if (!track) return;
          const computedStart =
            startTime !== undefined
              ? Math.max(0, startTime)
              : findNextEndTime(track, state.clips);

          state.clips[clipId] = {
            id: clipId,
            trackId: resolvedTrackId!,
            assetId: asset.id,
            type: clipType,
            name: asset.name,
            start: computedStart,
            duration: defaultDuration,
            offset: 0,
            speed: 1,
            volume: 1,
            fadeIn: 0,
            fadeOut: 0,
            filterPreset: 'normal',
            animation: { ...DEFAULT_CLIP_ANIMATION },
            transforms: { ...DEFAULT_CLIP_TRANSFORM },
            effects: [],
          };
          track.clipIds.push(clipId);
          state.selectedClipIds = [clipId];
        });

        return clipId;
      },

      addTextClip: (content, startTime, targetTrackId) => {
        const current = get();
        let resolvedTrackId = targetTrackId;
        if (resolvedTrackId) {
          const candidate = current.tracks[resolvedTrackId];
          if (
            !candidate ||
            candidate.isLocked ||
            !isTrackCompatible(candidate.type, 'text')
          ) {
            resolvedTrackId = undefined;
          }
        }

        if (!resolvedTrackId) {
          resolvedTrackId = current.trackOrder.find((tid) => {
            const tr = current.tracks[tid];
            return tr && !tr.isLocked && tr.type === 'text';
          });
        }
        if (!resolvedTrackId) {
          resolvedTrackId = current.addTrack('text', 'Teks');
        }

        const clipId = createUid('text');
        set((state) => {
          const track = state.tracks[resolvedTrackId!];
          if (!track) return;
          const start =
            startTime !== undefined
              ? Math.max(0, startTime)
              : findNextEndTime(track, state.clips);
          const textValue = content || DEFAULT_TEXT_STYLE.content;
          state.clips[clipId] = {
            id: clipId,
            trackId: resolvedTrackId!,
            assetId: 'text',
            type: 'text',
            name: textValue.slice(0, 24),
            start,
            duration: 3.5,
            offset: 0,
            speed: 1,
            volume: 1,
            fadeIn: 0,
            fadeOut: 0,
            filterPreset: 'normal',
            animation: { ...DEFAULT_CLIP_ANIMATION, in: 'zoom-in', inDuration: 0.3 },
            transforms: { ...DEFAULT_CLIP_TRANSFORM },
            effects: [],
            textStyle: {
              ...DEFAULT_TEXT_STYLE,
              content: textValue,
            },
          };
          track.clipIds.push(clipId);
          state.selectedClipIds = [clipId];
        });
        return clipId;
      },

      addPresetTextClip: (presetId, customText, startTime) => {
        const current = get();
        const preset =
          TEXT_PRESETS.find((p) => p.id === presetId) || TEXT_PRESETS[0];

        let resolvedTrackId = current.trackOrder.find((tid) => {
          const tr = current.tracks[tid];
          return tr && !tr.isLocked && tr.type === 'text';
        });
        if (!resolvedTrackId) {
          resolvedTrackId = current.addTrack('text', 'Teks & Caption');
        }

        const clipId = createUid('text');
        set((state) => {
          const track = state.tracks[resolvedTrackId!];
          if (!track) return;
          const start =
            startTime !== undefined
              ? Math.max(0, startTime)
              : findNextEndTime(track, state.clips);
          const textValue = (customText && customText.trim()) || preset.sampleText;

          state.clips[clipId] = {
            id: clipId,
            trackId: resolvedTrackId!,
            assetId: 'text',
            type: 'text',
            name: textValue.slice(0, 24),
            start,
            duration: 3.0,
            offset: 0,
            speed: 1,
            volume: 1,
            fadeIn: 0,
            fadeOut: 0,
            filterPreset: 'normal',
            animation: {
              ...DEFAULT_CLIP_ANIMATION,
              in: preset.defaultAnimation,
              inDuration: 0.35,
            },
            transforms: {
              ...DEFAULT_CLIP_TRANSFORM,
              y: preset.defaultY,
            },
            effects: [],
            textStyle: {
              ...preset.style,
              content: textValue,
            },
          };
          track.clipIds.push(clipId);
          state.selectedClipIds = [clipId];
        });
        return clipId;
      },

      addStickerClip: (emoji, label, startTime) => {
        const current = get();
        let resolvedTrackId = current.trackOrder.find((tid) => {
          const tr = current.tracks[tid];
          return tr && !tr.isLocked && tr.type === 'text';
        });
        if (!resolvedTrackId) {
          resolvedTrackId = current.addTrack('text', 'Stiker & Teks');
        }

        const clipId = createUid('sticker');
        set((state) => {
          const track = state.tracks[resolvedTrackId!];
          if (!track) return;
          const start =
            startTime !== undefined
              ? Math.max(0, startTime)
              : findNextEndTime(track, state.clips);

          state.clips[clipId] = {
            id: clipId,
            trackId: resolvedTrackId!,
            assetId: 'text',
            type: 'text',
            name: `Stiker ${emoji} ${label || ''}`.trim(),
            start,
            duration: 2.8,
            offset: 0,
            speed: 1,
            volume: 1,
            fadeIn: 0,
            fadeOut: 0,
            filterPreset: 'normal',
            animation: {
              ...DEFAULT_CLIP_ANIMATION,
              in: 'zoom-in',
              inDuration: 0.35,
              out: 'fade',
              outDuration: 0.25,
            },
            transforms: { ...DEFAULT_CLIP_TRANSFORM },
            effects: [],
            textStyle: {
              ...DEFAULT_TEXT_STYLE,
              content: emoji,
              fontSize: 112,
              backgroundColor: 'transparent',
              strokeWidth: 0,
              shadow: true,
              presetId: 'sticker',
            },
          };
          track.clipIds.push(clipId);
          state.selectedClipIds = [clipId];
        });
        return clipId;
      },

      generateAutoCaptions: (scriptText, presetId = 'capcut-yellow') => {
        const rawLines = scriptText
          .split(/\r?\n|[.!?]+/)
          .map((s) => s.trim())
          .filter(Boolean);

        const phrases: string[] = [];
        for (const line of rawLines) {
          const words = line.split(/\s+/);
          if (words.length <= 6) {
            phrases.push(line);
          } else {
            for (let i = 0; i < words.length; i += 5) {
              phrases.push(words.slice(i, i + 5).join(' '));
            }
          }
        }

        if (phrases.length === 0) return [];

        const current = get();
        const preset =
          TEXT_PRESETS.find((p) => p.id === presetId) || TEXT_PRESETS[0];

        let resolvedTrackId = current.trackOrder.find((tid) => {
          const tr = current.tracks[tid];
          return tr && !tr.isLocked && tr.type === 'text';
        });
        if (!resolvedTrackId) {
          resolvedTrackId = current.addTrack('text', 'Auto-Caption');
        }

        const createdIds: string[] = [];
        set((state) => {
          const track = state.tracks[resolvedTrackId!];
          if (!track) return;
          let cursor = findNextEndTime(track, state.clips);
          const stepDur = 2.0;

          for (const phrase of phrases) {
            const cid = createUid('caption');
            createdIds.push(cid);
            state.clips[cid] = {
              id: cid,
              trackId: resolvedTrackId!,
              assetId: 'text',
              type: 'text',
              name: `CC: ${phrase.slice(0, 18)}`,
              start: Number(cursor.toFixed(3)),
              duration: stepDur,
              offset: 0,
              speed: 1,
              volume: 1,
              fadeIn: 0,
              fadeOut: 0,
              filterPreset: 'normal',
              animation: {
                ...DEFAULT_CLIP_ANIMATION,
                in: preset.defaultAnimation,
                inDuration: 0.25,
              },
              transforms: {
                ...DEFAULT_CLIP_TRANSFORM,
                y: preset.defaultY,
              },
              effects: [],
              textStyle: {
                ...preset.style,
                content: phrase,
              },
            };
            track.clipIds.push(cid);
            cursor += stepDur;
          }
          if (createdIds.length > 0) {
            state.selectedClipIds = [createdIds[0]];
          }
        });

        return createdIds;
      },

      moveClip: (clipId, newTrackId, newStart) =>
        set((state) => {
          const clip = state.clips[clipId];
          if (!clip) return;
          const sourceTrack = state.tracks[clip.trackId];
          const targetTrack = state.tracks[newTrackId];
          if (!sourceTrack || sourceTrack.isLocked) return;

          if (
            targetTrack &&
            clip.trackId !== newTrackId &&
            !targetTrack.isLocked &&
            isTrackCompatible(targetTrack.type, clip.type)
          ) {
            sourceTrack.clipIds = sourceTrack.clipIds.filter(
              (id) => id !== clipId
            );
            targetTrack.clipIds.push(clipId);
            clip.trackId = newTrackId;
          }
          clip.start = Math.max(0, Number(newStart.toFixed(3)));
        }),

      trimClip: (clipId, edge, targetTime) =>
        set((state) => {
          const clip = state.clips[clipId];
          if (!clip) return;
          const track = state.tracks[clip.trackId];
          if (!track || track.isLocked) return;

          const asset = state.assets[clip.assetId];
          const hasMediaDuration =
            asset && (asset.kind === 'video' || asset.kind === 'audio') && asset.duration > 0;

          if (edge === 'left') {
            const minStart = Math.max(0, clip.start - clip.offset);
            const maxStart = clip.start + clip.duration - MIN_CLIP_DURATION;
            const clampedStart = Math.max(
              minStart,
              Math.min(maxStart, targetTime)
            );
            const delta = clampedStart - clip.start;
            clip.start = Number(clampedStart.toFixed(3));
            clip.offset = Number(Math.max(0, clip.offset + delta).toFixed(3));
            clip.duration = Number(
              Math.max(MIN_CLIP_DURATION, clip.duration - delta).toFixed(3)
            );
          } else {
            const maxEnd = hasMediaDuration
              ? clip.start + Math.max(MIN_CLIP_DURATION, asset.duration - clip.offset)
              : Number.POSITIVE_INFINITY;
            const minEnd = clip.start + MIN_CLIP_DURATION;
            const clampedEnd = Math.max(minEnd, Math.min(maxEnd, targetTime));
            clip.duration = Number(
              Math.max(MIN_CLIP_DURATION, clampedEnd - clip.start).toFixed(3)
            );
          }
        }),

      splitClipAtTime: (clipId, splitTime) => {
        let createdId: string | null = null;
        set((state) => {
          const original = state.clips[clipId];
          if (!original) return;
          const track = state.tracks[original.trackId];
          if (!track || track.isLocked) return;

          const minSplit = original.start + MIN_CLIP_DURATION / 2;
          const maxSplit = original.start + original.duration - MIN_CLIP_DURATION / 2;
          if (splitTime <= minSplit || splitTime >= maxSplit) return;

          const firstDuration = Number((splitTime - original.start).toFixed(3));
          const secondDuration = Number(
            (original.duration - firstDuration).toFixed(3)
          );
          if (
            firstDuration < MIN_CLIP_DURATION / 2 ||
            secondDuration < MIN_CLIP_DURATION / 2
          ) {
            return;
          }

          const newClipId = createUid(`${clipId}_part`);
          createdId = newClipId;

          state.clips[newClipId] = {
            ...original,
            id: newClipId,
            start: Number(splitTime.toFixed(3)),
            duration: secondDuration,
            offset: Number((original.offset + firstDuration).toFixed(3)),
            transforms: { ...original.transforms },
            effects: original.effects.map((e) => ({ ...e })),
            textStyle: original.textStyle ? { ...original.textStyle } : undefined,
          };
          original.duration = firstDuration;

          const idx = track.clipIds.indexOf(clipId);
          if (idx >= 0) {
            track.clipIds.splice(idx + 1, 0, newClipId);
          } else {
            track.clipIds.push(newClipId);
          }
          state.selectedClipIds = [newClipId];
        });
        return createdId;
      },

      freezeClipAtTime: (clipId, freezeTime) => {
        let freezeId: string | null = null;
        set((state) => {
          const original = state.clips[clipId];
          if (!original) return;
          const track = state.tracks[original.trackId];
          if (!track || track.isLocked) return;

          const clampedFreeze = Math.max(
            original.start,
            Math.min(original.start + original.duration, freezeTime)
          );
          const localOffset = Number(
            (original.offset + (clampedFreeze - original.start) * (original.speed || 1)).toFixed(3)
          );
          const freezeDuration = 1.5;

          const newId = createUid('freeze');
          freezeId = newId;
          state.clips[newId] = {
            ...original,
            id: newId,
            name: `Freeze: ${original.name}`,
            start: Number((original.start + original.duration).toFixed(3)),
            duration: freezeDuration,
            offset: localOffset,
            speed: 0.01,
            transforms: { ...original.transforms },
            effects: original.effects.map((e) => ({ ...e })),
            animation: original.animation ? { ...original.animation } : { ...DEFAULT_CLIP_ANIMATION },
            textStyle: original.textStyle ? { ...original.textStyle } : undefined,
          };
          track.clipIds.push(newId);
          state.selectedClipIds = [newId];
        });
        return freezeId;
      },

      deleteClips: (clipIds) =>
        set((state) => {
          if (clipIds.length === 0) return;
          const toDelete = new Set(clipIds);
          for (const cid of toDelete) {
            const clip = state.clips[cid];
            if (!clip) continue;
            const track = state.tracks[clip.trackId];
            if (track?.isLocked) continue;
            if (track) {
              track.clipIds = track.clipIds.filter((id) => id !== cid);
            }
            delete state.clips[cid];
          }
          state.selectedClipIds = state.selectedClipIds.filter(
            (id) => Boolean(state.clips[id])
          );
        }),

      duplicateClip: (clipId) => {
        let createdId: string | null = null;
        set((state) => {
          const original = state.clips[clipId];
          if (!original) return;
          const track = state.tracks[original.trackId];
          if (!track || track.isLocked) return;

          const newClipId = createUid('clip');
          createdId = newClipId;
          state.clips[newClipId] = {
            ...original,
            id: newClipId,
            name: `${original.name} (Salinan)`,
            start: Number((original.start + original.duration).toFixed(3)),
            transforms: { ...original.transforms },
            effects: original.effects.map((e) => ({ ...e })),
            animation: original.animation ? { ...original.animation } : { ...DEFAULT_CLIP_ANIMATION },
            textStyle: original.textStyle ? { ...original.textStyle } : undefined,
          };
          track.clipIds.push(newClipId);
          state.selectedClipIds = [newClipId];
        });
        return createdId;
      },

      selectClip: (clipId, multi = false) =>
        set((state) => {
          if (!state.clips[clipId]) return;
          if (!multi) {
            state.selectedClipIds = [clipId];
            return;
          }
          if (state.selectedClipIds.includes(clipId)) {
            state.selectedClipIds = state.selectedClipIds.filter(
              (id) => id !== clipId
            );
          } else {
            state.selectedClipIds.push(clipId);
          }
        }),

      clearSelection: () =>
        set((state) => {
          state.selectedClipIds = [];
        }),

      updateClipTransform: (clipId, patch) =>
        set((state) => {
          const clip = state.clips[clipId];
          if (!clip) return;
          const track = state.tracks[clip.trackId];
          if (track?.isLocked) return;
          Object.assign(clip.transforms, patch);
        }),

      flipClip: (clipId, axis) =>
        set((state) => {
          const clip = state.clips[clipId];
          if (!clip) return;
          const track = state.tracks[clip.trackId];
          if (track?.isLocked) return;
          if (axis === 'h') {
            clip.transforms.flipH = !clip.transforms.flipH;
          } else {
            clip.transforms.flipV = !clip.transforms.flipV;
          }
        }),

      rotateClip90: (clipId) =>
        set((state) => {
          const clip = state.clips[clipId];
          if (!clip) return;
          const track = state.tracks[clip.trackId];
          if (track?.isLocked) return;
          clip.transforms.rotation = ((clip.transforms.rotation || 0) + 90) % 360;
        }),

      setClipEffect: (clipId, type, value) =>
        set((state) => {
          const clip = state.clips[clipId];
          if (!clip) return;
          const track = state.tracks[clip.trackId];
          if (track?.isLocked) return;
          const existing = clip.effects.find((e) => e.type === type);
          if (existing) {
            existing.value = value;
          } else {
            clip.effects.push({ type, value });
          }
        }),

      applyFilterPreset: (clipId, presetId, effects) =>
        set((state) => {
          const clip = state.clips[clipId];
          if (!clip) return;
          const track = state.tracks[clip.trackId];
          if (track?.isLocked) return;
          clip.filterPreset = presetId;
          for (const eff of effects) {
            const existing = clip.effects.find((e) => e.type === eff.type);
            if (existing) {
              existing.value = eff.value;
            } else {
              clip.effects.push({ type: eff.type, value: eff.value });
            }
          }
        }),

      setClipSpeed: (clipId, speed) =>
        set((state) => {
          const clip = state.clips[clipId];
          if (!clip) return;
          const track = state.tracks[clip.trackId];
          if (track?.isLocked) return;
          const clampedSpeed = Math.max(0.25, Math.min(4, Number(speed.toFixed(2))));
          const prevSpeed = clip.speed || 1;
          const sourceDuration = clip.duration * prevSpeed;
          clip.speed = clampedSpeed;
          clip.duration = Math.max(
            MIN_CLIP_DURATION,
            Number((sourceDuration / clampedSpeed).toFixed(3))
          );
        }),

      setClipAudioParams: (clipId, patch) =>
        set((state) => {
          const clip = state.clips[clipId];
          if (!clip) return;
          const track = state.tracks[clip.trackId];
          if (track?.isLocked) return;
          if (patch.volume !== undefined) {
            clip.volume = Math.max(0, Math.min(2, Number(patch.volume.toFixed(2))));
          }
          if (patch.fadeIn !== undefined) {
            clip.fadeIn = Math.max(0, Math.min(clip.duration / 2, Number(patch.fadeIn.toFixed(2))));
          }
          if (patch.fadeOut !== undefined) {
            clip.fadeOut = Math.max(0, Math.min(clip.duration / 2, Number(patch.fadeOut.toFixed(2))));
          }
        }),

      setClipAnimation: (clipId, patch) =>
        set((state) => {
          const clip = state.clips[clipId];
          if (!clip) return;
          const track = state.tracks[clip.trackId];
          if (track?.isLocked) return;
          if (!clip.animation) {
            clip.animation = { ...DEFAULT_CLIP_ANIMATION };
          }
          Object.assign(clip.animation, patch);
        }),

      updateClipTextStyle: (clipId, patch) =>
        set((state) => {
          const clip = state.clips[clipId];
          if (!clip || clip.type !== 'text') return;
          const track = state.tracks[clip.trackId];
          if (track?.isLocked) return;
          if (!clip.textStyle) {
            clip.textStyle = { ...DEFAULT_TEXT_STYLE };
          }
          Object.assign(clip.textStyle, patch);
          if (patch.content !== undefined) {
            clip.name = patch.content.slice(0, 24) || 'Teks';
          }
        }),

      setPixelsPerSecond: (pps) =>
        set((state) => {
          state.pixelsPerSecond = Math.max(15, Math.min(240, pps));
        }),

      toggleSnap: () =>
        set((state) => {
          state.snapEnabled = !state.snapEnabled;
        }),

      exportProjectDocument: () => {
        const s = get();
        return {
          id: s.projectId,
          name: s.projectName,
          resolution: s.resolution,
          canvasBackground: s.canvasBackground,
          tracks: s.tracks,
          trackOrder: s.trackOrder,
          clips: s.clips,
          assets: s.assets,
          updatedAt: new Date().toISOString(),
        };
      },

      loadProjectDocument: (doc) =>
        set((state) => {
          state.projectId = doc.id;
          state.projectName = doc.name;
          state.resolution = doc.resolution || PRESET_RESOLUTIONS[0];
          state.canvasBackground = doc.canvasBackground || '#09090b';
          state.tracks = doc.tracks;
          state.trackOrder = doc.trackOrder;
          state.clips = doc.clips;
          state.assets = doc.assets;
          state.selectedClipIds = [];
        }),

      resetProject: () =>
        set((state) => {
          const fresh = createDefaultTracks();
          state.projectId = createUid('proj');
          state.projectName = 'Proyek Studio Tanpa Judul';
          state.resolution = PRESET_RESOLUTIONS[0];
          state.canvasBackground = '#09090b';
          state.tracks = fresh.tracks;
          state.trackOrder = fresh.trackOrder;
          state.clips = {};
          state.assets = {};
          state.selectedClipIds = [];
        }),
    })),
    {
      limit: 50,
      partialize: (state) => ({
        tracks: state.tracks,
        trackOrder: state.trackOrder,
        clips: state.clips,
      }),
    }
  )
);

