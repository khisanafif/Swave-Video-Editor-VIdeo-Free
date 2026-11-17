import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { temporal } from 'zundo';
import {
  DEFAULT_BG_REMOVAL,
  DEFAULT_CHROMA_KEY,
  DEFAULT_CLIP_ANIMATION,
  DEFAULT_CLIP_CROP,
  DEFAULT_CLIP_MASK,
  DEFAULT_CLIP_TRANSFORM,
  DEFAULT_TEXT_STYLE,
  PRESET_RESOLUTIONS,
  normalizeCustomDimensions,
  type BgRemovalConfig,
  type BlendMode,
  type CanvasResolution,
  type ChromaKeyConfig,
  type Clip,
  type ClipAnimation,
  type ClipCrop,
  type ClipEffect,
  type ClipEffectType,
  type ClipMaskConfig,
  type ClipTransform,
  type MediaAsset,
  type ProjectDocument,
  type SubtitleCue,
  type TextStyle,
  type Track,
  type TrackType,
} from '@swave/shared';
import { findTextPresetById } from '../engine/editorPresets';

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
  renameTrack: (trackId: string, name: string) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;
  deleteTrack: (trackId: string) => void;
  moveTrackLayer: (
    trackId: string,
    direction: 'up' | 'down' | 'front' | 'back'
  ) => void;
  moveClipLayer: (
    clipId: string,
    direction: 'up' | 'down' | 'front' | 'back'
  ) => void;

  registerAsset: (asset: MediaAsset) => void;
  updateAsset: (assetId: string, patch: Partial<MediaAsset>) => void;
  removeAsset: (assetId: string) => void;

  addClipFromAsset: (
    assetId: string,
    targetTrackId?: string,
    startTime?: number
  ) => string | null;
  addOverlayClipFromAsset: (
    assetId: string,
    startTime?: number,
    options?: {
      targetTrackId?: string;
      scale?: number;
      x?: number;
      y?: number;
      duration?: number;
    }
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
  addSubtitleCues: (
    cues: SubtitleCue[],
    presetId?: string,
    options?: { replaceExisting?: boolean; trackId?: string }
  ) => string[];
  updateSubtitleCue: (
    clipId: string,
    patch: { text?: string; start?: number; duration?: number }
  ) => void;
  mergeSubtitleWithNext: (clipId: string) => string | null;
  splitSubtitleCue: (clipId: string) => string | null;
  applySubtitleStyleToAll: (
    stylePatch: Partial<TextStyle>,
    transformPatch?: Partial<ClipTransform>,
    animationPatch?: Partial<ClipAnimation>
  ) => void;
  moveClip: (clipId: string, newTrackId: string, newStart: number) => void;
  trimClip: (clipId: string, edge: 'left' | 'right', targetTime: number) => void;
  trimClipToPlayhead: (
    clipId: string,
    edge: 'left' | 'right',
    playheadTime: number
  ) => void;
  splitClipAtTime: (clipId: string, splitTime: number) => string | null;
  freezeClipAtTime: (clipId: string, freezeTime: number) => string | null;
  deleteClips: (clipIds: string[]) => void;
  rippleDeleteClips: (clipIds: string[]) => void;
  closeTrackGaps: (trackId: string) => void;
  detachAudioFromClip: (clipId: string) => string | null;
  linkExtractedAudioAsset: (
    sourceClipId: string | null,
    audioAsset: MediaAsset,
    startTime?: number
  ) => string | null;
  autoDuckAudioTracks: (duckVolume?: number) => number;
  autoCutSilenceOnClip: (
    clipId: string,
    speechSegments: Array<{ start: number; end: number }>
  ) => number;
  nudgeClip: (clipId: string, deltaSec: number) => void;
  replaceClipAsset: (clipId: string, newAssetId: string) => boolean;
  applyEffectsToAllVisualClips: (sourceClipId: string) => number;
  duplicateClip: (clipId: string) => string | null;
  pasteClipStyle: (
    clipId: string,
    style: {
      filterPreset?: string;
      blendMode?: BlendMode;
      chromaKey?: ChromaKeyConfig;
      mask?: ClipMaskConfig;
      bgRemoval?: BgRemovalConfig;
      crop?: ClipCrop;
      cornerRadius?: number;
      effects?: ClipEffect[];
      animation?: ClipAnimation;
      textStyle?: Omit<TextStyle, 'content'>;
    }
  ) => void;

  selectClip: (clipId: string, multi?: boolean) => void;
  clearSelection: () => void;

  updateClipTransform: (clipId: string, patch: Partial<ClipTransform>) => void;
  updateClipCrop: (clipId: string, patch: Partial<ClipCrop>) => void;
  setClipChromaKey: (clipId: string, patch: Partial<ChromaKeyConfig>) => void;
  setClipMask: (clipId: string, patch: Partial<ClipMaskConfig>) => void;
  setClipBgRemoval: (clipId: string, patch: Partial<BgRemovalConfig>) => void;
  applyCutoutAssetToClip: (clipId: string, cutoutAssetId: string) => boolean;
  restoreOriginalClipAsset: (clipId: string) => boolean;
  setClipBlendMode: (clipId: string, blendMode: BlendMode) => void;
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

function cloneTransforms(t: ClipTransform): ClipTransform {
  return {
    ...t,
    crop: t.crop ? { ...t.crop } : undefined,
  };
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

function hasTrackTimeOverlap(
  track: Track,
  clips: Record<string, Clip>,
  start: number,
  duration: number
): boolean {
  const newEnd = start + duration;
  for (const cid of track.clipIds) {
    const c = clips[cid];
    if (!c) continue;
    const cEnd = c.start + c.duration;
    if (c.start < newEnd - 0.01 && cEnd > start + 0.01) {
      return true;
    }
  }
  return false;
}

function insertOverlayOrVisualTrack(
  state: {
    tracks: Record<string, Track>;
    trackOrder: string[];
  },
  type: TrackType,
  name?: string
): string {
  const id = createUid('track');
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
  if (type === 'audio') {
    state.trackOrder.push(id);
  } else {
    const firstAudioIdx = state.trackOrder.findIndex(
      (tid) => state.tracks[tid]?.type === 'audio'
    );
    if (firstAudioIdx >= 0) {
      state.trackOrder.splice(firstAudioIdx, 0, id);
    } else {
      state.trackOrder.push(id);
    }
  }
  return id;
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

/**
 * Resolves the ID of the center axis Main Video Track (preferring 'track-1' or the first video track).
 */
export function getMainVideoTrackId(
  trackOrder: string[],
  tracks: Record<string, Track>
): string | null {
  if (tracks['track-1'] && tracks['track-1'].type === 'video') {
    return 'track-1';
  }
  return (
    trackOrder.find((id) => tracks[id] && tracks[id].type === 'video') || null
  );
}

/**
 * Orders timeline tracks using vertical track polarity:
 * Top Zone (overlay / text / secondary video tracks stacked upward, topmost layer first),
 * Center Axis (Main Video Track), Bottom Zone (Audio tracks stacked downward).
 */
export function getTimelineDisplayTrackOrder(
  trackOrder: string[],
  tracks: Record<string, Track>
): string[] {
  const mainId = getMainVideoTrackId(trackOrder, tracks);
  const overlayStack: string[] = [];
  const audioStack: string[] = [];

  for (const id of trackOrder) {
    const tr = tracks[id];
    if (!tr || id === mainId) continue;
    if (tr.type === 'audio') {
      audioStack.push(id);
    } else {
      overlayStack.push(id);
    }
  }

  overlayStack.reverse();
  const result = [...overlayStack];
  if (mainId && tracks[mainId]) {
    result.push(mainId);
  }
  result.push(...audioStack);
  return result;
}

const initialLayout = createDefaultTracks();

export const useTimelineStore = create<TimelineState>()(
  temporal(
    immer((set, get) => ({
      projectId: 'swave-studio-project',
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
          const norm = normalizeCustomDimensions(
            resolution.width,
            resolution.height
          );
          const fps = Math.max(
            1,
            Math.min(120, Math.round(resolution.fps || 30))
          );
          state.resolution = {
            width: norm.width,
            height: norm.height,
            fps,
            label: resolution.label || `${norm.width}×${norm.height}`,
          };
        }),

      setCanvasBackground: (bg) =>
        set((state) => {
          state.canvasBackground = bg;
        }),

      addTrack: (type, name) => {
        let createdId = '';
        set((state) => {
          createdId = insertOverlayOrVisualTrack(state, type, name);
        });
        return createdId;
      },

      renameTrack: (trackId, name) =>
        set((state) => {
          const track = state.tracks[trackId];
          if (track && name.trim()) {
            track.name = name.trim().slice(0, 32);
          }
        }),

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

      moveTrackLayer: (trackId, direction) =>
        set((state) => {
          const track = state.tracks[trackId];
          if (!track || track.type === 'audio') return;
          const mainId = getMainVideoTrackId(state.trackOrder, state.tracks);
          if (trackId === mainId) return;

          const upperIds = state.trackOrder.filter(
            (tid) => tid !== mainId && state.tracks[tid]?.type !== 'audio'
          );
          const audioIds = state.trackOrder.filter(
            (tid) => state.tracks[tid]?.type === 'audio'
          );
          const idx = upperIds.indexOf(trackId);
          if (idx < 0) return;

          if (direction === 'up' && idx < upperIds.length - 1) {
            [upperIds[idx], upperIds[idx + 1]] = [
              upperIds[idx + 1],
              upperIds[idx],
            ];
          } else if (direction === 'down' && idx > 0) {
            [upperIds[idx], upperIds[idx - 1]] = [
              upperIds[idx - 1],
              upperIds[idx],
            ];
          } else if (direction === 'front' && idx < upperIds.length - 1) {
            upperIds.splice(idx, 1);
            upperIds.push(trackId);
          } else if (direction === 'back' && idx > 0) {
            upperIds.splice(idx, 1);
            upperIds.unshift(trackId);
          }

          state.trackOrder = [
            ...(mainId && state.tracks[mainId] ? [mainId] : []),
            ...upperIds,
            ...audioIds,
          ];
        }),

      moveClipLayer: (clipId, direction) => {
        const clip = get().clips[clipId];
        if (!clip || clip.type === 'audio') return;
        get().moveTrackLayer(clip.trackId, direction);
      },

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

        // When adding an image without an explicit track on top of an existing main video,
        // automatically place it as a CapCut Picture-in-Picture / Overlay above Main Track.
        if (!targetTrackId && asset.kind === 'image') {
          const mainId = getMainVideoTrackId(current.trackOrder, current.tracks);
          const mainHasClips =
            Boolean(mainId && current.tracks[mainId]?.clipIds.length);
          if (mainHasClips) {
            return current.addOverlayClipFromAsset(assetId, startTime ?? 0);
          }
        }

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

      addOverlayClipFromAsset: (assetId, startTime, options) => {
        const current = get();
        const asset = current.assets[assetId];
        if (!asset || asset.kind === 'audio') return null;

        const computedStart = Math.max(0, startTime ?? 0);
        const defaultDuration =
          options?.duration && options.duration >= MIN_CLIP_DURATION
            ? Number(options.duration.toFixed(3))
            : asset.kind === 'image'
              ? 4
              : Math.max(MIN_CLIP_DURATION, asset.duration || 5);

        const clipId = createUid('ovl');

        set((state) => {
          let resolvedTrackId = options?.targetTrackId;
          if (resolvedTrackId) {
            const cand = state.tracks[resolvedTrackId];
            if (
              !cand ||
              cand.isLocked ||
              !isTrackCompatible(cand.type, 'overlay')
            ) {
              resolvedTrackId = undefined;
            }
          }

          // Pick lowest unlocked overlay track without time collision, or auto-stack a new Overlay track
          if (!resolvedTrackId) {
            for (const tid of state.trackOrder) {
              const tr = state.tracks[tid];
              if (!tr || tr.isLocked || tr.type !== 'overlay') continue;
              if (!hasTrackTimeOverlap(tr, state.clips, computedStart, defaultDuration)) {
                resolvedTrackId = tid;
                break;
              }
            }
          }

          if (!resolvedTrackId) {
            resolvedTrackId = insertOverlayOrVisualTrack(state, 'overlay');
          }

          const track = state.tracks[resolvedTrackId];
          if (!track) return;

          // Count existing concurrent overlay clips to avoid pixel-on-pixel hiding when >1 overlay
          const newEnd = computedStart + defaultDuration;
          let concurrentOverlays = 0;
          for (const existing of Object.values(state.clips)) {
            if (existing.type !== 'overlay') continue;
            const exEnd = existing.start + existing.duration;
            if (existing.start < newEnd - 0.01 && exEnd > computedStart + 0.01) {
              concurrentOverlays++;
            }
          }

          const cw = state.resolution.width || 1920;
          const ch = state.resolution.height || 1080;
          const defaultScale =
            options?.scale !== undefined
              ? options.scale
              : concurrentOverlays === 0
                ? 0.58
                : 0.48;
          const offsetPatterns: Array<[number, number]> = [
            [0, 0],
            [Math.round(cw * 0.14), Math.round(ch * 0.1)],
            [-Math.round(cw * 0.14), Math.round(ch * 0.1)],
            [Math.round(cw * 0.14), -Math.round(ch * 0.1)],
            [-Math.round(cw * 0.14), -Math.round(ch * 0.1)],
          ];
          const [autoX, autoY] =
            offsetPatterns[concurrentOverlays % offsetPatterns.length];

          state.clips[clipId] = {
            id: clipId,
            trackId: resolvedTrackId,
            assetId: asset.id,
            type: 'overlay',
            name: asset.name,
            start: Number(computedStart.toFixed(3)),
            duration: defaultDuration,
            offset: 0,
            speed: 1,
            volume: 1,
            fadeIn: 0,
            fadeOut: 0,
            filterPreset: 'normal',
            animation: { ...DEFAULT_CLIP_ANIMATION },
            transforms: {
              ...DEFAULT_CLIP_TRANSFORM,
              scale: defaultScale,
              x: options?.x !== undefined ? options.x : autoX,
              y: options?.y !== undefined ? options.y : autoY,
            },
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
        const preset = findTextPresetById(presetId);

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

      generateAutoCaptions: (scriptText, presetId = 'bold-yellow') => {
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
        const preset = findTextPresetById(presetId);

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
              isSubtitle: true,
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

      addSubtitleCues: (cues, presetId = 'bold-yellow', options) => {
        if (!cues || cues.length === 0) return [];
        const current = get();
        const preset = findTextPresetById(presetId);

        let resolvedTrackId = options?.trackId;
        if (resolvedTrackId) {
          const cand = current.tracks[resolvedTrackId];
          if (!cand || cand.isLocked || cand.type !== 'text') {
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
          resolvedTrackId = current.addTrack('text', 'Subtitle (CC)');
        }

        const createdIds: string[] = [];
        set((state) => {
          const track = state.tracks[resolvedTrackId!];
          if (!track) return;

          if (options?.replaceExisting) {
            const subIds = Object.values(state.clips)
              .filter((c) => c.isSubtitle)
              .map((c) => c.id);
            for (const sid of subIds) {
              const old = state.clips[sid];
              if (!old) continue;
              const oldTrack = state.tracks[old.trackId];
              if (oldTrack && !oldTrack.isLocked) {
                oldTrack.clipIds = oldTrack.clipIds.filter((id) => id !== sid);
                delete state.clips[sid];
              }
            }
          }

          for (const cue of cues) {
            const text = (cue.text || '').trim();
            if (!text) continue;
            const start = Math.max(0, Number(cue.start.toFixed(3)));
            const duration = Math.max(
              MIN_CLIP_DURATION,
              Number((cue.end - cue.start).toFixed(3))
            );
            const cid = createUid('sub');
            createdIds.push(cid);
            state.clips[cid] = {
              id: cid,
              trackId: resolvedTrackId!,
              assetId: 'text',
              type: 'text',
              name: `CC: ${text.slice(0, 18)}`,
              start,
              duration,
              offset: 0,
              speed: 1,
              volume: 1,
              fadeIn: 0,
              fadeOut: 0,
              filterPreset: 'normal',
              animation: {
                ...DEFAULT_CLIP_ANIMATION,
                in: preset.defaultAnimation,
                inDuration: 0.2,
              },
              transforms: {
                ...DEFAULT_CLIP_TRANSFORM,
                y: preset.defaultY,
              },
              effects: [],
              textStyle: {
                ...preset.style,
                content: text,
              },
              isSubtitle: true,
              subtitleWords: cue.words ? cue.words.map((w) => ({ ...w })) : undefined,
            };
            track.clipIds.push(cid);
          }

          if (createdIds.length > 0) {
            state.selectedClipIds = [createdIds[0]];
          }
        });

        return createdIds;
      },

      updateSubtitleCue: (clipId, patch) =>
        set((state) => {
          const clip = state.clips[clipId];
          if (!clip || clip.type !== 'text') return;
          const track = state.tracks[clip.trackId];
          if (track?.isLocked) return;
          if (patch.text !== undefined) {
            if (!clip.textStyle) {
              clip.textStyle = { ...DEFAULT_TEXT_STYLE };
            }
            clip.textStyle.content = patch.text;
            clip.name = `CC: ${patch.text.slice(0, 18) || 'Subtitle'}`;
          }
          if (patch.start !== undefined) {
            clip.start = Math.max(0, Number(patch.start.toFixed(3)));
          }
          if (patch.duration !== undefined) {
            clip.duration = Math.max(
              MIN_CLIP_DURATION,
              Number(patch.duration.toFixed(3))
            );
          }
        }),

      mergeSubtitleWithNext: (clipId) => {
        let mergedInto: string | null = null;
        set((state) => {
          const current = state.clips[clipId];
          if (!current || current.type !== 'text') return;
          const track = state.tracks[current.trackId];
          if (!track || track.isLocked) return;

          const ordered = track.clipIds
            .map((id) => state.clips[id])
            .filter((c): c is Clip => Boolean(c && c.type === 'text'))
            .sort((a, b) => a.start - b.start);
          const idx = ordered.findIndex((c) => c.id === clipId);
          if (idx < 0 || idx >= ordered.length - 1) return;

          const next = ordered[idx + 1];
          const combinedText = `${current.textStyle?.content || ''} ${next.textStyle?.content || ''
            }`.trim();
          const newEnd = Math.max(
            current.start + current.duration,
            next.start + next.duration
          );
          if (current.textStyle) {
            current.textStyle.content = combinedText;
          }
          current.name = `CC: ${combinedText.slice(0, 18)}`;
          current.duration = Number(
            Math.max(MIN_CLIP_DURATION, newEnd - current.start).toFixed(3)
          );
          current.subtitleWords = undefined;

          track.clipIds = track.clipIds.filter((id) => id !== next.id);
          delete state.clips[next.id];
          state.selectedClipIds = [current.id];
          mergedInto = current.id;
        });
        return mergedInto;
      },

      splitSubtitleCue: (clipId) => {
        let secondId: string | null = null;
        set((state) => {
          const original = state.clips[clipId];
          if (!original || original.type !== 'text' || !original.textStyle) return;
          const track = state.tracks[original.trackId];
          if (!track || track.isLocked) return;

          const words = original.textStyle.content.trim().split(/\s+/).filter(Boolean);
          if (words.length < 2 || original.duration < MIN_CLIP_DURATION * 2) return;

          const midWord = Math.ceil(words.length / 2);
          const firstText = words.slice(0, midWord).join(' ');
          const secondText = words.slice(midWord).join(' ');
          const firstDur = Number((original.duration * (midWord / words.length)).toFixed(3));
          const secondDur = Number((original.duration - firstDur).toFixed(3));
          if (firstDur < MIN_CLIP_DURATION || secondDur < MIN_CLIP_DURATION) return;

          const newId = createUid('sub');
          secondId = newId;
          original.textStyle.content = firstText;
          original.name = `CC: ${firstText.slice(0, 18)}`;
          original.duration = firstDur;
          original.subtitleWords = undefined;

          state.clips[newId] = {
            ...original,
            id: newId,
            name: `CC: ${secondText.slice(0, 18)}`,
            start: Number((original.start + firstDur).toFixed(3)),
            duration: secondDur,
            transforms: { ...original.transforms },
            effects: original.effects.map((e) => ({ ...e })),
            animation: original.animation ? { ...original.animation } : undefined,
            textStyle: { ...original.textStyle, content: secondText },
            isSubtitle: original.isSubtitle,
            subtitleWords: undefined,
          };
          track.clipIds.push(newId);
          state.selectedClipIds = [newId];
        });
        return secondId;
      },

      applySubtitleStyleToAll: (stylePatch, transformPatch, animationPatch) =>
        set((state) => {
          const allTextClips = Object.values(state.clips).filter(
            (c) => c.type === 'text' && (c.isSubtitle || c.name.startsWith('CC:'))
          );
          const targets =
            allTextClips.length > 0
              ? allTextClips
              : Object.values(state.clips).filter((c) => c.type === 'text');

          for (const clip of targets) {
            const track = state.tracks[clip.trackId];
            if (track?.isLocked) continue;
            if (!clip.textStyle) {
              clip.textStyle = { ...DEFAULT_TEXT_STYLE };
            }
            Object.assign(clip.textStyle, stylePatch);
            if (transformPatch) {
              Object.assign(clip.transforms, transformPatch);
            }
            if (animationPatch) {
              if (!clip.animation) {
                clip.animation = { ...DEFAULT_CLIP_ANIMATION };
              }
              Object.assign(clip.animation, animationPatch);
            }
          }
        }),

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
          const speed = Math.max(0.01, clip.speed || 1);
          const hasMediaDuration =
            asset && (asset.kind === 'video' || asset.kind === 'audio') && asset.duration > 0;

          if (edge === 'left') {
            const minStart = Math.max(0, clip.start - clip.offset / speed);
            const maxStart = clip.start + clip.duration - MIN_CLIP_DURATION;
            const clampedStart = Math.max(
              minStart,
              Math.min(maxStart, targetTime)
            );
            const delta = clampedStart - clip.start;
            clip.start = Number(clampedStart.toFixed(3));
            clip.offset = Number(Math.max(0, clip.offset + delta * speed).toFixed(3));
            clip.duration = Number(
              Math.max(MIN_CLIP_DURATION, clip.duration - delta).toFixed(3)
            );
          } else {
            const maxEnd = hasMediaDuration
              ? clip.start +
              Math.max(MIN_CLIP_DURATION, (asset.duration - clip.offset) / speed)
              : Number.POSITIVE_INFINITY;
            const minEnd = clip.start + MIN_CLIP_DURATION;
            const clampedEnd = Math.max(minEnd, Math.min(maxEnd, targetTime));
            clip.duration = Number(
              Math.max(MIN_CLIP_DURATION, clampedEnd - clip.start).toFixed(3)
            );
          }
        }),

      trimClipToPlayhead: (clipId, edge, playheadTime) => {
        get().trimClip(clipId, edge, playheadTime);
      },

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
          const speed = original.speed || 1;

          state.clips[newClipId] = {
            ...original,
            id: newClipId,
            start: Number(splitTime.toFixed(3)),
            duration: secondDuration,
            offset: Number((original.offset + firstDuration * speed).toFixed(3)),
            transforms: cloneTransforms(original.transforms),
            chromaKey: original.chromaKey ? { ...original.chromaKey } : undefined,
            mask: original.mask ? { ...original.mask } : undefined,
            bgRemoval: original.bgRemoval ? { ...original.bgRemoval } : undefined,
            effects: original.effects.map((e) => ({ ...e })),
            textStyle: original.textStyle ? { ...original.textStyle } : undefined,
            subtitleWords: undefined,
          };
          original.duration = firstDuration;
          original.subtitleWords = undefined;

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
            transforms: cloneTransforms(original.transforms),
            chromaKey: original.chromaKey ? { ...original.chromaKey } : undefined,
            mask: original.mask ? { ...original.mask } : undefined,
            bgRemoval: original.bgRemoval ? { ...original.bgRemoval } : undefined,
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

      rippleDeleteClips: (clipIds) =>
        set((state) => {
          if (clipIds.length === 0) return;
          const byTrack = new Map<string, Array<{ start: number; duration: number }>>();

          for (const cid of clipIds) {
            const clip = state.clips[cid];
            if (!clip) continue;
            const track = state.tracks[clip.trackId];
            if (!track || track.isLocked) continue;
            const list = byTrack.get(track.id) || [];
            list.push({ start: clip.start, duration: clip.duration });
            byTrack.set(track.id, list);

            track.clipIds = track.clipIds.filter((id) => id !== cid);
            delete state.clips[cid];
          }

          for (const [trackId, removedRanges] of byTrack.entries()) {
            const track = state.tracks[trackId];
            if (!track) continue;
            removedRanges.sort((a, b) => b.start - a.start);
            for (const removed of removedRanges) {
              for (const remId of track.clipIds) {
                const c = state.clips[remId];
                if (c && c.start >= removed.start) {
                  c.start = Math.max(
                    0,
                    Number((c.start - removed.duration).toFixed(3))
                  );
                }
              }
            }
          }

          state.selectedClipIds = state.selectedClipIds.filter(
            (id) => Boolean(state.clips[id])
          );
        }),

      closeTrackGaps: (trackId) =>
        set((state) => {
          const track = state.tracks[trackId];
          if (!track || track.isLocked) return;
          const ordered = track.clipIds
            .map((id) => state.clips[id])
            .filter((c): c is Clip => Boolean(c))
            .sort((a, b) => a.start - b.start);

          let cursor = 0;
          for (const clip of ordered) {
            clip.start = Number(cursor.toFixed(3));
            cursor += clip.duration;
          }
        }),

      detachAudioFromClip: (clipId) => {
        const current = get();
        const sourceClip = current.clips[clipId];
        if (!sourceClip || sourceClip.type !== 'video') return null;

        let audioTrackId = current.trackOrder.find((tid) => {
          const tr = current.tracks[tid];
          return tr && !tr.isLocked && tr.type === 'audio';
        });
        if (!audioTrackId) {
          audioTrackId = current.addTrack('audio', 'Audio Terpisah');
        }

        let createdAudioId: string | null = null;
        set((state) => {
          const clip = state.clips[clipId];
          if (!clip) return;
          const srcTrack = state.tracks[clip.trackId];
          const audTrack = state.tracks[audioTrackId!];
          if (!audTrack || audTrack.isLocked || srcTrack?.isLocked) return;

          const newId = createUid('aud');
          createdAudioId = newId;
          state.clips[newId] = {
            id: newId,
            trackId: audioTrackId!,
            assetId: clip.assetId,
            type: 'audio',
            name: `Audio: ${clip.name}`,
            start: clip.start,
            duration: clip.duration,
            offset: clip.offset,
            speed: clip.speed || 1,
            volume: clip.volume ?? 1,
            fadeIn: clip.fadeIn ?? 0,
            fadeOut: clip.fadeOut ?? 0,
            transforms: { ...DEFAULT_CLIP_TRANSFORM },
            effects: [],
          };
          clip.volume = 0;
          audTrack.clipIds.push(newId);
          state.selectedClipIds = [newId];
        });
        return createdAudioId;
      },

      linkExtractedAudioAsset: (sourceClipId, audioAsset, startTime) => {
        get().registerAsset(audioAsset);
        const current = get();
        const sourceClip = sourceClipId ? current.clips[sourceClipId] : undefined;

        let audioTrackId = current.trackOrder.find((tid) => {
          const tr = current.tracks[tid];
          return tr && !tr.isLocked && tr.type === 'audio';
        });
        if (!audioTrackId) {
          audioTrackId = current.addTrack('audio', 'Audio Ekstrak');
        }

        const startAt =
          startTime !== undefined
            ? Math.max(0, startTime)
            : sourceClip
            ? sourceClip.start
            : 0;
        const durationSec = Math.max(
          MIN_CLIP_DURATION,
          audioAsset.duration || sourceClip?.duration || 5
        );

        let createdId: string | null = null;
        set((state) => {
          const audTrack = state.tracks[audioTrackId!];
          if (!audTrack || audTrack.isLocked) return;
          const newId = createUid('extaud');
          createdId = newId;
          state.clips[newId] = {
            id: newId,
            trackId: audioTrackId!,
            assetId: audioAsset.id,
            type: 'audio',
            name: audioAsset.name,
            start: Number(startAt.toFixed(3)),
            duration: Number(durationSec.toFixed(3)),
            offset: 0,
            speed: 1,
            volume: 1,
            fadeIn: 0,
            fadeOut: 0,
            transforms: { ...DEFAULT_CLIP_TRANSFORM },
            effects: [],
          };
          if (sourceClipId && state.clips[sourceClipId]) {
            const srcTrack = state.tracks[state.clips[sourceClipId].trackId];
            if (!srcTrack?.isLocked) {
              state.clips[sourceClipId].volume = 0;
            }
          }
          audTrack.clipIds.push(newId);
          state.selectedClipIds = [newId];
        });
        return createdId;
      },

      autoDuckAudioTracks: (duckVolume = 0.22) => {
        let updatedCount = 0;
        set((state) => {
          const speechWindows: Array<{ start: number; end: number }> = [];
          for (const tid of state.trackOrder) {
            const tr = state.tracks[tid];
            if (!tr || tr.isMuted || tr.type !== 'video') continue;
            for (const cid of tr.clipIds) {
              const c = state.clips[cid];
              if (c && (c.volume ?? 1) > 0.05) {
                speechWindows.push({ start: c.start, end: c.start + c.duration });
              }
            }
          }

          for (const tid of state.trackOrder) {
            const tr = state.tracks[tid];
            if (!tr || tr.isLocked || tr.type !== 'audio') continue;
            for (const cid of tr.clipIds) {
              const c = state.clips[cid];
              if (!c) continue;
              const overlaps = speechWindows.some(
                (w) => c.start < w.end && c.start + c.duration > w.start
              );
              if (overlaps || speechWindows.length === 0) {
                c.volume = Number(Math.max(0.05, Math.min(1, duckVolume)).toFixed(2));
                if ((c.fadeIn ?? 0) === 0) c.fadeIn = 0.4;
                if ((c.fadeOut ?? 0) === 0) c.fadeOut = 0.6;
                updatedCount++;
              }
            }
          }
        });
        return updatedCount;
      },

      autoCutSilenceOnClip: (clipId, speechSegments) => {
        let keptCount = 0;
        set((state) => {
          const original = state.clips[clipId];
          if (!original || speechSegments.length === 0) return;
          const track = state.tracks[original.trackId];
          if (!track || track.isLocked) return;

          const speed = original.speed || 1;
          const validSegs = speechSegments
            .map((s) => ({
              start: Math.max(0, s.start),
              end: Math.min(original.duration, s.end),
            }))
            .filter((s) => s.end - s.start >= MIN_CLIP_DURATION)
            .sort((a, b) => a.start - b.start);

          if (validSegs.length === 0) return;

          const idx = track.clipIds.indexOf(clipId);
          let timelineCursor = original.start;
          const replacementIds: string[] = [];

          validSegs.forEach((seg, segIdx) => {
            const segDur = Number((seg.end - seg.start).toFixed(3));
            const newId = segIdx === 0 ? clipId : createUid('cut');
            replacementIds.push(newId);

            state.clips[newId] = {
              ...original,
              id: newId,
              name:
                validSegs.length > 1
                  ? `${original.name} #${segIdx + 1}`
                  : original.name,
              start: Number(timelineCursor.toFixed(3)),
              duration: segDur,
              offset: Number((original.offset + seg.start * speed).toFixed(3)),
              transforms: { ...original.transforms },
              chromaKey: original.chromaKey ? { ...original.chromaKey } : undefined,
              mask: original.mask ? { ...original.mask } : undefined,
              bgRemoval: original.bgRemoval ? { ...original.bgRemoval } : undefined,
              effects: original.effects.map((e) => ({ ...e })),
              animation: original.animation
                ? { ...original.animation }
                : undefined,
              textStyle: original.textStyle
                ? { ...original.textStyle }
                : undefined,
            };
            timelineCursor += segDur;
          });

          const totalNewDur = timelineCursor - original.start;
          const shiftDelta = original.duration - totalNewDur;
          if (shiftDelta > 0.05) {
            const originalEnd = original.start + original.duration;
            for (const cid of track.clipIds) {
              if (cid === clipId) continue;
              const other = state.clips[cid];
              if (other && other.start >= originalEnd - 0.01) {
                other.start = Math.max(
                  0,
                  Number((other.start - shiftDelta).toFixed(3))
                );
              }
            }
          }

          if (idx >= 0) {
            track.clipIds.splice(idx, 1, ...replacementIds);
          } else {
            track.clipIds.push(...replacementIds);
          }
          state.selectedClipIds = replacementIds.slice(0, 1);
          keptCount = replacementIds.length;
        });
        return keptCount;
      },

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
            transforms: cloneTransforms(original.transforms),
            chromaKey: original.chromaKey ? { ...original.chromaKey } : undefined,
            mask: original.mask ? { ...original.mask } : undefined,
            bgRemoval: original.bgRemoval ? { ...original.bgRemoval } : undefined,
            effects: original.effects.map((e) => ({ ...e })),
            animation: original.animation ? { ...original.animation } : { ...DEFAULT_CLIP_ANIMATION },
            textStyle: original.textStyle ? { ...original.textStyle } : undefined,
            subtitleWords: original.subtitleWords
              ? original.subtitleWords.map((w) => ({ ...w }))
              : undefined,
          };
          track.clipIds.push(newClipId);
          state.selectedClipIds = [newClipId];
        });
        return createdId;
      },

      nudgeClip: (clipId, deltaSec) =>
        set((state) => {
          const clip = state.clips[clipId];
          if (!clip) return;
          const track = state.tracks[clip.trackId];
          if (track?.isLocked) return;
          clip.start = Math.max(0, Number((clip.start + deltaSec).toFixed(3)));
        }),

      replaceClipAsset: (clipId, newAssetId) => {
        let updated = false;
        set((state) => {
          const clip = state.clips[clipId];
          const newAsset = state.assets[newAssetId];
          if (!clip || !newAsset || clip.type === 'text') return;
          const track = state.tracks[clip.trackId];
          if (track?.isLocked) return;

          clip.assetId = newAsset.id;
          clip.name = newAsset.name;
          if (newAsset.kind !== 'image' && newAsset.duration > MIN_CLIP_DURATION) {
            if (clip.offset >= newAsset.duration) {
              clip.offset = 0;
            }
            const remaining = Math.max(
              MIN_CLIP_DURATION,
              (newAsset.duration - clip.offset) / (clip.speed || 1)
            );
            clip.duration = Math.min(clip.duration, Number(remaining.toFixed(3)));
          }
          updated = true;
        });
        return updated;
      },

      applyEffectsToAllVisualClips: (sourceClipId) => {
        let updatedCount = 0;
        set((state) => {
          const source = state.clips[sourceClipId];
          if (!source || (source.type !== 'video' && source.type !== 'overlay')) {
            return;
          }
          for (const clip of Object.values(state.clips)) {
            if (clip.id === source.id) continue;
            if (clip.type !== 'video' && clip.type !== 'overlay') continue;
            const tr = state.tracks[clip.trackId];
            if (tr?.isLocked) continue;

            clip.filterPreset = source.filterPreset;
            clip.blendMode = source.blendMode;
            clip.effects = source.effects.map((e) => ({ ...e }));
            clip.chromaKey = source.chromaKey ? { ...source.chromaKey } : undefined;
            clip.mask = source.mask ? { ...source.mask } : undefined;
            clip.bgRemoval = source.bgRemoval ? { ...source.bgRemoval } : undefined;
            if (source.transforms.cornerRadius !== undefined) {
              clip.transforms.cornerRadius = source.transforms.cornerRadius;
            }
            updatedCount++;
          }
        });
        return updatedCount;
      },

      pasteClipStyle: (clipId, style) =>
        set((state) => {
          const clip = state.clips[clipId];
          if (!clip) return;
          const track = state.tracks[clip.trackId];
          if (track?.isLocked) return;
          if (style.filterPreset !== undefined) {
            clip.filterPreset = style.filterPreset;
          }
          if (style.blendMode !== undefined) {
            clip.blendMode = style.blendMode;
          }
          if (style.chromaKey !== undefined) {
            clip.chromaKey = { ...style.chromaKey };
          }
          if (style.mask !== undefined) {
            clip.mask = { ...style.mask };
          }
          if (style.bgRemoval !== undefined) {
            clip.bgRemoval = { ...style.bgRemoval };
          }
          if (style.crop !== undefined) {
            clip.transforms.crop = { ...style.crop };
          }
          if (style.cornerRadius !== undefined) {
            clip.transforms.cornerRadius = style.cornerRadius;
          }
          if (style.effects) {
            clip.effects = style.effects.map((e) => ({ ...e }));
          }
          if (style.animation) {
            clip.animation = { ...style.animation };
          }
          if (style.textStyle && clip.type === 'text') {
            clip.textStyle = {
              ...style.textStyle,
              content: clip.textStyle?.content || DEFAULT_TEXT_STYLE.content,
            };
          }
        }),

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

      updateClipCrop: (clipId, patch) =>
        set((state) => {
          const clip = state.clips[clipId];
          if (!clip) return;
          const track = state.tracks[clip.trackId];
          if (track?.isLocked) return;
          const next = {
            ...DEFAULT_CLIP_CROP,
            ...(clip.transforms.crop || {}),
            ...patch,
          };
          clip.transforms.crop = {
            top: Math.max(0, Math.min(45, next.top)),
            right: Math.max(0, Math.min(45, next.right)),
            bottom: Math.max(0, Math.min(45, next.bottom)),
            left: Math.max(0, Math.min(45, next.left)),
          };
        }),

      setClipChromaKey: (clipId, patch) =>
        set((state) => {
          const clip = state.clips[clipId];
          if (!clip) return;
          const track = state.tracks[clip.trackId];
          if (track?.isLocked) return;
          clip.chromaKey = {
            ...DEFAULT_CHROMA_KEY,
            ...(clip.chromaKey || {}),
            ...patch,
          };
        }),

      setClipMask: (clipId, patch) =>
        set((state) => {
          const clip = state.clips[clipId];
          if (!clip) return;
          const track = state.tracks[clip.trackId];
          if (track?.isLocked) return;
          clip.mask = {
            ...DEFAULT_CLIP_MASK,
            ...(clip.mask || {}),
            ...patch,
          };
        }),

      setClipBgRemoval: (clipId, patch) =>
        set((state) => {
          const clip = state.clips[clipId];
          if (!clip) return;
          const track = state.tracks[clip.trackId];
          if (track?.isLocked) return;
          clip.bgRemoval = {
            ...DEFAULT_BG_REMOVAL,
            ...(clip.bgRemoval || {}),
            ...patch,
          };
        }),

      applyCutoutAssetToClip: (clipId, cutoutAssetId) => {
        let applied = false;
        set((state) => {
          const clip = state.clips[clipId];
          const cutoutAsset = state.assets[cutoutAssetId];
          if (!clip || !cutoutAsset || clip.type === 'text') return;
          const track = state.tracks[clip.trackId];
          if (track?.isLocked) return;
          if (!clip.originalAssetId) {
            clip.originalAssetId = clip.assetId;
          }
          clip.assetId = cutoutAssetId;
          applied = true;
        });
        return applied;
      },

      restoreOriginalClipAsset: (clipId) => {
        let restored = false;
        set((state) => {
          const clip = state.clips[clipId];
          if (!clip || !clip.originalAssetId) return;
          if (!state.assets[clip.originalAssetId]) return;
          const track = state.tracks[clip.trackId];
          if (track?.isLocked) return;
          clip.assetId = clip.originalAssetId;
          clip.originalAssetId = undefined;
          restored = true;
        });
        return restored;
      },

      setClipBlendMode: (clipId, blendMode) =>
        set((state) => {
          const clip = state.clips[clipId];
          if (!clip) return;
          const track = state.tracks[clip.trackId];
          if (track?.isLocked) return;
          clip.blendMode = blendMode;
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

