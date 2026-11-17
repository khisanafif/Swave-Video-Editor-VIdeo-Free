export type TrackType = 'video' | 'audio' | 'text' | 'overlay';

export type MediaKind = 'video' | 'audio' | 'image';

export type BlendMode =
  | 'normal'
  | 'screen'
  | 'multiply'
  | 'overlay'
  | 'lighten'
  | 'darken';

export interface ClipCrop {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ChromaKeyConfig {
  enabled: boolean;
  color: string;
  tolerance: number;
  smoothness?: number;
  spillReduction?: number;
}

export type ClipMaskShape =
  | 'none'
  | 'circle'
  | 'rectangle'
  | 'split-h'
  | 'split-v'
  | 'diamond'
  | 'heart';

export interface ClipMaskConfig {
  shape: ClipMaskShape;
  invert?: boolean;
  feather?: number;
  size?: number;
}

export type InstantBgRemovalMode = 'none' | 'luma-black' | 'luma-white';

export interface BgRemovalConfig {
  mode: InstantBgRemovalMode;
  threshold: number;
  softness?: number;
}

export interface ClipTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  flipH?: boolean;
  flipV?: boolean;
  crop?: ClipCrop;
  cornerRadius?: number;
}

export type ClipEffectType =
  | 'brightness'
  | 'contrast'
  | 'saturation'
  | 'temperature'
  | 'vignette'
  | 'grayscale'
  | 'sepia'
  | 'chromab'
  | 'blur'
  | 'pixelate';

export interface ClipEffect {
  type: ClipEffectType | string;
  value: number;
}

export type ClipAnimationType =
  | 'none'
  | 'fade'
  | 'zoom-in'
  | 'slide-up'
  | 'slide-left'
  | 'spin';

export interface ClipAnimation {
  in: ClipAnimationType;
  out: ClipAnimationType;
  inDuration: number;
  outDuration: number;
}

export interface SubtitleWord {
  word: string;
  start: number;
  end: number;
}

export interface SubtitleCue {
  id?: string;
  start: number;
  end: number;
  text: string;
  words?: SubtitleWord[];
}

export interface TextStyle {
  content: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  align: 'left' | 'center' | 'right';
  bold: boolean;
  shadow: boolean;
  strokeColor?: string;
  strokeWidth?: number;
  highlightColor?: string;
  presetId?: string;
}

export interface Clip {
  id: string;
  trackId: string;
  assetId: string;
  type: TrackType;
  name: string;
  start: number;
  duration: number;
  offset: number;
  speed?: number;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  filterPreset?: string;
  blendMode?: BlendMode;
  chromaKey?: ChromaKeyConfig;
  mask?: ClipMaskConfig;
  bgRemoval?: BgRemovalConfig;
  originalAssetId?: string;
  animation?: ClipAnimation;
  transforms: ClipTransform;
  effects: ClipEffect[];
  textStyle?: TextStyle;
  isSubtitle?: boolean;
  subtitleWords?: SubtitleWord[];
}

export interface Track {
  id: string;
  type: TrackType;
  name: string;
  isMuted: boolean;
  isLocked: boolean;
  clipIds: string[];
}

export interface MediaAsset {
  id: string;
  name: string;
  kind: MediaKind;
  mimeType: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  source: 'local' | 'server' | 'hybrid';
  opfsPath?: string;
  serverAssetId?: string;
  serverUrl?: string;
  uploadProgress?: number;
  waveform?: number[];
  thumbnailUrl?: string;
}

export interface CanvasResolution {
  width: number;
  height: number;
  fps: number;
  label: string;
}

export interface ProjectDocument {
  id: string;
  name: string;
  resolution: CanvasResolution;
  canvasBackground?: string;
  tracks: Record<string, Track>;
  trackOrder: string[];
  clips: Record<string, Clip>;
  assets: Record<string, MediaAsset>;
  updatedAt: string;
}

export interface ChunkUploadInitRequest {
  filename: string;
  mimeType: string;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
  kind?: MediaKind;
  duration?: number;
  width?: number;
  height?: number;
}

export interface ChunkUploadInitResponse {
  uploadId: string;
  assetId: string;
  chunkSize: number;
  totalChunks: number;
  receivedChunks: number[];
}

export interface ChunkUploadStatusResponse {
  uploadId: string;
  assetId: string;
  filename: string;
  totalSize: number;
  totalChunks: number;
  receivedChunks: number[];
  status: 'uploading' | 'completed' | 'failed';
  mediaUrl?: string;
}

export interface ChunkUploadCompleteResponse {
  uploadId: string;
  assetId: string;
  filename: string;
  size: number;
  mediaUrl: string;
}

export type RenderMode = 'client-webcodecs' | 'server-ffmpeg';

export type ServerEncoderCapability =
  | 'h264_nvenc'
  | 'h264_vaapi'
  | 'h264_qsv'
  | 'libx264';

export interface ServerCapabilities {
  status: 'online';
  version: string;
  ffmpegAvailable: boolean;
  ffmpegVersion: string | null;
  availableEncoders: ServerEncoderCapability[];
  preferredEncoder: ServerEncoderCapability | null;
  whisperAvailable?: boolean;
  whisperEngine?: string | null;
  maxChunkSizeBytes: number;
  recommendedChunkSizeBytes: number;
  storageDir: string;
}

export interface ServerTranscribeRequest {
  assetId?: string;
  audioBase64?: string;
  language?: string;
  provider?: 'auto' | 'local-whisper' | 'openai' | 'groq' | 'vad';
  apiKey?: string;
  model?: string;
}

export interface ServerTranscribeResponse {
  engine: string;
  language: string;
  cues: SubtitleCue[];
  warning?: string;
}

export interface NetworkEndpointInfo {
  interfaceName: string;
  address: string;
  url: string;
}

export interface ServerNetworkInfo {
  hostname: string;
  port: number;
  endpoints: NetworkEndpointInfo[];
  projectCount: number;
  assetCount: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export interface RenderJobRequest {
  project: ProjectDocument;
  quality?: 'draft' | 'standard' | 'high';
  preferredEncoder?: ServerEncoderCapability;
}

export interface RenderJobRecord {
  id: string;
  projectId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  encoder: string;
  ffmpegCommand: string;
  outputUrl: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_CHUNK_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_CLOUDFLARE_CHUNK_BYTES = 50 * 1024 * 1024;

export const DEFAULT_CLIP_CROP: ClipCrop = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

export const DEFAULT_CHROMA_KEY: ChromaKeyConfig = {
  enabled: false,
  color: '#00b140',
  tolerance: 0.32,
  smoothness: 0.08,
  spillReduction: 0.5,
};

export const DEFAULT_CLIP_MASK: ClipMaskConfig = {
  shape: 'none',
  invert: false,
  feather: 0.04,
  size: 0.82,
};

export const DEFAULT_BG_REMOVAL: BgRemovalConfig = {
  mode: 'none',
  threshold: 0.16,
  softness: 0.08,
};

export const DEFAULT_CLIP_TRANSFORM: ClipTransform = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
  flipH: false,
  flipV: false,
};

export const DEFAULT_CLIP_ANIMATION: ClipAnimation = {
  in: 'none',
  out: 'none',
  inDuration: 0.5,
  outDuration: 0.5,
};

export const DEFAULT_TEXT_STYLE: TextStyle = {
  content: 'SWAVE Video',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 56,
  color: '#ffffff',
  backgroundColor: 'rgba(15, 23, 42, 0.65)',
  align: 'center',
  bold: true,
  shadow: true,
  strokeColor: '#000000',
  strokeWidth: 0,
};

export const PRESET_RESOLUTIONS: CanvasResolution[] = [
  { width: 1920, height: 1080, fps: 30, label: '1080p YouTube (16:9)' },
  { width: 1080, height: 1920, fps: 30, label: '1080p TikTok/Reels (9:16)' },
  { width: 1080, height: 1080, fps: 30, label: '1080p Feed Square (1:1)' },
  { width: 1280, height: 720, fps: 60, label: '720p 60FPS Smooth (16:9)' },
  { width: 1080, height: 1350, fps: 30, label: '1080p Instagram (4:5)' },
  { width: 2560, height: 1440, fps: 30, label: '2K QHD Tajam (16:9)' },
  { width: 3840, height: 2160, fps: 30, label: '4K Ultra HD (16:9)' },
  { width: 854, height: 480, fps: 30, label: '480p Hemat Kuota (16:9)' },
];

export interface AspectRatioPreset {
  id: string;
  label: string;
  w: number;
  h: number;
  desc: string;
}

export const ASPECT_RATIO_PRESETS: AspectRatioPreset[] = [
  { id: '16:9', label: '16:9', w: 16, h: 9, desc: 'Lanskap HD' },
  { id: '9:16', label: '9:16', w: 9, h: 16, desc: 'Vertikal HP' },
  { id: '1:1', label: '1:1', w: 1, h: 1, desc: 'Persegi' },
  { id: '4:5', label: '4:5', w: 4, h: 5, desc: 'Potret IG' },
  { id: '4:3', label: '4:3', w: 4, h: 3, desc: 'Klasik' },
  { id: '21:9', label: '21:9', w: 21, h: 9, desc: 'Sinema' },
];

export interface ResolutionTierPreset {
  id: '480p' | '720p' | '1080p' | '2k' | '4k';
  label: string;
  badge: string;
  shortEdge: number;
}

export const CAPCUT_RESOLUTION_TIERS: ResolutionTierPreset[] = [
  { id: '480p', label: '480P', badge: 'Ringan', shortEdge: 480 },
  { id: '720p', label: '720P', badge: 'HD', shortEdge: 720 },
  { id: '1080p', label: '1080P', badge: 'Full HD', shortEdge: 1080 },
  { id: '2k', label: '2K', badge: 'QHD', shortEdge: 1440 },
  { id: '4k', label: '4K', badge: 'Ultra HD', shortEdge: 2160 },
];

export const CAPCUT_FPS_OPTIONS = [24, 25, 30, 50, 60] as const;

export function normalizeCustomDimensions(
  rawWidth: number,
  rawHeight: number
): { width: number; height: number } {
  const clampEven = (val: number, fallback: number) => {
    const safe = Number.isFinite(val) ? val : fallback;
    const clamped = Math.max(16, Math.min(4096, Math.round(safe / 2) * 2));
    return Math.max(16, clamped);
  };
  return {
    width: clampEven(rawWidth, 1920),
    height: clampEven(rawHeight, 1080),
  };
}

export function computeResolutionForAspectAndTier(
  aspectW: number,
  aspectH: number,
  shortEdgePx: number,
  fps = 30,
  aspectLabel?: string
): CanvasResolution {
  const aw = Math.max(1, aspectW || 16);
  const ah = Math.max(1, aspectH || 9);
  const edge = Math.max(240, Math.min(4096, shortEdgePx || 1080));

  let rawW: number;
  let rawH: number;
  if (aw >= ah) {
    rawH = edge;
    rawW = (edge * aw) / ah;
  } else {
    rawW = edge;
    rawH = (edge * ah) / aw;
  }

  const { width, height } = normalizeCustomDimensions(rawW, rawH);
  const tier = CAPCUT_RESOLUTION_TIERS.find((t) => t.shortEdge === edge);
  const ratioTag = aspectLabel || `${aw}:${ah}`;
  return {
    width,
    height,
    fps: Math.max(1, Math.min(120, Math.round(fps || 30))),
    label: `${tier ? tier.label : `${width}×${height}`} (${ratioTag})`,
  };
}

export function inferResolutionBadge(res: CanvasResolution): string {
  const shortSide = Math.min(res.width || 0, res.height || 0);
  if (shortSide === 2160) return '4K';
  if (shortSide === 1440) return '2K';
  if (shortSide === 1080) return '1080P';
  if (shortSide === 720) return '720P';
  if (shortSide === 480) return '480P';
  return `${res.width}×${res.height}`;
}
