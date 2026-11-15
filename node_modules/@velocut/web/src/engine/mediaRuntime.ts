import type { MediaAsset } from '@velocut/shared';
import { mediaRegistry } from './opfsStorage';
import { resolveServerUrl } from './serverOffloadClient';
import { type CompositeLayer, WebGLCompositor } from './webglCompositor';
import { usePlaybackStore } from '../stores/playbackStore';
import { getTimelineDuration, useTimelineStore } from '../stores/timelineStore';

interface CachedMediaNode {
  assetId: string;
  kind: MediaAsset['kind'];
  element: HTMLVideoElement | HTMLAudioElement | HTMLImageElement;
  gainNode?: GainNode;
}

class StudioMediaRuntime {
  private compositor: WebGLCompositor | null = null;
  private previewCanvas: HTMLCanvasElement | null = null;
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private readonly nodes = new Map<string, CachedMediaNode>();
  private rafId: number | null = null;
  private lastTickMs = 0;

  attachCanvas(canvas: HTMLCanvasElement | null): WebGLCompositor | null {
    if (!canvas) {
      this.compositor?.dispose();
      this.compositor = null;
      this.previewCanvas = null;
      return null;
    }
    if (this.previewCanvas === canvas && this.compositor) {
      return this.compositor;
    }
    this.compositor?.dispose();
    this.previewCanvas = canvas;
    this.compositor = new WebGLCompositor(canvas);
    this.renderFrameAt(usePlaybackStore.getState().currentTime, false);
    return this.compositor;
  }

  private ensureAudioContext(): void {
    if (this.audioCtx) {
      if (this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume();
      }
      return;
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    this.audioCtx = new AudioCtx();
    this.masterGain = this.audioCtx.createGain();
    this.masterGain.connect(this.audioCtx.destination);
  }

  private getOrCreateMediaNode(asset: MediaAsset): CachedMediaNode | null {
    const existing = this.nodes.get(asset.id);
    if (existing) return existing;

    const rawUrl = mediaRegistry.getObjectUrl(asset.id) || asset.serverUrl;
    if (!rawUrl) return null;
    const url = rawUrl.startsWith('blob:') ? rawUrl : resolveServerUrl(rawUrl);

    if (asset.kind === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      const node: CachedMediaNode = {
        assetId: asset.id,
        kind: 'image',
        element: img,
      };
      this.nodes.set(asset.id, node);
      return node;
    }

    const el =
      asset.kind === 'audio'
        ? document.createElement('audio')
        : document.createElement('video');
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    if (el instanceof HTMLVideoElement) {
      el.playsInline = true;
    }
    el.src = url;

    let gainNode: GainNode | undefined;
    if (this.audioCtx && this.masterGain) {
      try {
        const src = this.audioCtx.createMediaElementSource(el);
        gainNode = this.audioCtx.createGain();
        src.connect(gainNode);
        gainNode.connect(this.masterGain);
      } catch {
        // Fallback to native element volume if media element source fails
      }
    }

    const node: CachedMediaNode = {
      assetId: asset.id,
      kind: asset.kind,
      element: el,
      gainNode,
    };
    this.nodes.set(asset.id, node);
    return node;
  }

  startLoop(): void {
    if (this.rafId !== null) return;
    this.ensureAudioContext();
    this.lastTickMs = performance.now();

    const tick = (now: number) => {
      const playback = usePlaybackStore.getState();
      const timeline = useTimelineStore.getState();

      if (playback.isPlaying) {
        const dt = Math.min(0.1, (now - this.lastTickMs) / 1000) * playback.playbackRate;
        this.lastTickMs = now;
        const maxDur = getTimelineDuration(timeline.clips, 0);
        let nextTime = playback.currentTime + dt;

        if (maxDur > 0 && nextTime >= maxDur) {
          if (playback.isLooping) {
            nextTime = 0;
          } else {
            nextTime = maxDur;
            playback.setPlaying(false);
          }
        }
        playback.setCurrentTime(nextTime);
        this.renderFrameAt(nextTime, true);
      } else {
        this.lastTickMs = now;
        this.pauseAllMedia();
      }

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pauseAllMedia();
  }

  private pauseAllMedia(): void {
    for (const node of this.nodes.values()) {
      if (node.element instanceof HTMLMediaElement && !node.element.paused) {
        node.element.pause();
      }
    }
  }

  renderFrameAt(time: number, isPlaying: boolean): void {
    const timeline = useTimelineStore.getState();
    const playback = usePlaybackStore.getState();

    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setValueAtTime(
        playback.isMuted ? 0 : playback.volume,
        this.audioCtx.currentTime
      );
    }

    const activeAssetNodes = new Set<string>();
    const layers: CompositeLayer[] = [];
    const cw = timeline.resolution.width;
    const ch = timeline.resolution.height;

    // Render tracks from bottom-most to top-most in trackOrder (or reverse: track-1 is background, track-2 text overlays above)
    for (const trackId of timeline.trackOrder) {
      const track = timeline.tracks[trackId];
      if (!track || track.isMuted) continue;

      for (const clipId of track.clipIds) {
        const clip = timeline.clips[clipId];
        if (!clip) continue;
        if (time < clip.start || time >= clip.start + clip.duration) continue;
        const localTime = Math.max(0, time - clip.start);

        if (clip.type === 'text' && clip.textStyle && this.compositor) {
          const textCanvas = this.compositor.getTextLayerCanvas(
            clip.id,
            clip.textStyle,
            cw,
            ch
          );
          layers.push({
            clip,
            source: textCanvas,
            sourceWidth: cw,
            sourceHeight: ch,
            localTime,
          });
          continue;
        }

        const asset = timeline.assets[clip.assetId];
        if (!asset) continue;
        const node = this.getOrCreateMediaNode(asset);
        if (!node) continue;
        activeAssetNodes.add(asset.id);

        if (node.element instanceof HTMLMediaElement) {
          const clipSpeed = clip.speed || 1;
          const mediaTime = Math.max(0, clip.offset + localTime * clipSpeed);

          // Audio volume + Fade In / Fade Out envelope
          let clipGain = clip.volume ?? 1;
          if (clip.fadeIn && clip.fadeIn > 0 && localTime < clip.fadeIn) {
            clipGain *= localTime / clip.fadeIn;
          }
          const remaining = clip.duration - localTime;
          if (clip.fadeOut && clip.fadeOut > 0 && remaining < clip.fadeOut) {
            clipGain *= Math.max(0, remaining / clip.fadeOut);
          }

          if (node.gainNode && this.audioCtx) {
            node.gainNode.gain.setValueAtTime(
              track.isMuted ? 0 : clipGain,
              this.audioCtx.currentTime
            );
          } else {
            node.element.muted = track.isMuted || playback.isMuted;
            node.element.volume = Math.max(
              0,
              Math.min(1, playback.volume * clipGain)
            );
          }

          const targetRate = Math.max(
            0.1,
            Math.min(8, clipSpeed * playback.playbackRate)
          );
          if (Math.abs(node.element.playbackRate - targetRate) > 0.02) {
            try {
              node.element.playbackRate = targetRate;
            } catch {
              // Ignore unsupported playbackRate range
            }
          }

          const drift = Math.abs(node.element.currentTime - mediaTime);
          if (isPlaying && clipSpeed > 0.05) {
            if (drift > 0.25 && node.element.readyState >= 1) {
              node.element.currentTime = mediaTime;
            }
            if (node.element.paused) {
              void node.element.play().catch(() => {});
            }
          } else {
            if (!node.element.paused) node.element.pause();
            if (drift > 0.03 && node.element.readyState >= 1) {
              node.element.currentTime = mediaTime;
            }
          }

          if (node.element instanceof HTMLVideoElement) {
            layers.push({
              clip,
              source: node.element,
              sourceWidth: node.element.videoWidth || asset.width || 1280,
              sourceHeight: node.element.videoHeight || asset.height || 720,
              localTime,
            });
          }
        } else if (node.element instanceof HTMLImageElement) {
          if (node.element.complete && node.element.naturalWidth > 0) {
            layers.push({
              clip,
              source: node.element,
              sourceWidth: node.element.naturalWidth,
              sourceHeight: node.element.naturalHeight,
              localTime,
            });
          }
        }
      }
    }

    // Pause any media elements not currently active at `time`
    for (const [assetId, node] of this.nodes.entries()) {
      if (
        !activeAssetNodes.has(assetId) &&
        node.element instanceof HTMLMediaElement &&
        !node.element.paused
      ) {
        node.element.pause();
      }
    }

    this.compositor?.render(layers, timeline.canvasBackground);
  }

  getCompositorBackend(): 'webgl2' | 'canvas2d' | 'none' {
    return this.compositor?.backend ?? 'none';
  }
}

export const mediaRuntime = new StudioMediaRuntime();
