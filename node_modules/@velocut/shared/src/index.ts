export type TrackType = 'video' | 'audio' | 'text' | 'overlay';

export type MediaKind = 'video' | 'audio' | 'image';

export interface ClipTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  flipH?: boolean;
  flipV?: boolean;
}

export type ClipEffectType =
  | 'brightness'
  | 'contrast'
  | 'saturation'
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
  animation?: ClipAnimation;
  transforms: ClipTransform;
  effects: ClipEffect[];
  textStyle?: TextStyle;
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
  maxChunkSizeBytes: number;
  recommendedChunkSizeBytes: number;
  storageDir: string;
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
  content: 'VeloCut Studio',
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
];
