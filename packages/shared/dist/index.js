export const DEFAULT_CHUNK_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_CLOUDFLARE_CHUNK_BYTES = 50 * 1024 * 1024;
export const DEFAULT_CLIP_TRANSFORM = {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
    flipH: false,
    flipV: false,
};
export const DEFAULT_CLIP_ANIMATION = {
    in: 'none',
    out: 'none',
    inDuration: 0.5,
    outDuration: 0.5,
};
export const DEFAULT_TEXT_STYLE = {
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
export const PRESET_RESOLUTIONS = [
    { width: 1920, height: 1080, fps: 30, label: '1080p YouTube (16:9)' },
    { width: 1080, height: 1920, fps: 30, label: '1080p TikTok/Reels (9:16)' },
    { width: 1080, height: 1080, fps: 30, label: '1080p Feed Square (1:1)' },
    { width: 1280, height: 720, fps: 60, label: '720p 60FPS Smooth (16:9)' },
];
