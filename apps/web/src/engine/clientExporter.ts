import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import type { MediaAsset, ProjectDocument } from '@velocut/shared';
import { mediaRegistry } from './opfsStorage';
import { resolveServerUrl } from './serverOffloadClient';
import { type CompositeLayer, WebGLCompositor } from './webglCompositor';

export interface ClientExportProgress {
  phase: 'preparing' | 'audio' | 'video' | 'finalizing';
  progress: number;
  currentFrame: number;
  totalFrames: number;
}

async function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  if (Math.abs(video.currentTime - timeSec) < 0.008 && video.readyState >= 2) {
    return;
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', done);
      resolve();
    };
    video.addEventListener('seeked', done);
    setTimeout(done, 400);
    video.currentTime = timeSec;
  });
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!url.startsWith('blob:') && !url.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Gagal memuat gambar: ${url}`));
    img.src = url;
  });
}

async function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    if (!url.startsWith('blob:') && !url.startsWith('data:')) {
      video.crossOrigin = 'anonymous';
    }
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.preload = 'auto';
    video.onloadeddata = () => resolve(video);
    video.onerror = () => reject(new Error(`Gagal memuat video: ${url}`));
    video.src = url;
  });
}

async function mixAudioTrackBuffer(
  project: ProjectDocument,
  totalDuration: number,
  sampleRate = 44100
): Promise<AudioBuffer | null> {
  const audioClips: Array<{
    start: number;
    duration: number;
    offset: number;
    speed: number;
    volume: number;
    fadeIn: number;
    fadeOut: number;
    asset: MediaAsset;
  }> = [];

  for (const tid of project.trackOrder) {
    const track = project.tracks[tid];
    if (!track || track.isMuted) continue;
    for (const cid of track.clipIds) {
      const clip = project.clips[cid];
      if (!clip || clip.duration <= 0) continue;
      const asset = project.assets[clip.assetId];
      if (!asset || (!asset.hasAudio && asset.kind !== 'audio')) continue;
      audioClips.push({
        start: clip.start,
        duration: clip.duration,
        offset: clip.offset,
        speed: Math.max(0.25, Math.min(4, clip.speed || 1)),
        volume: clip.volume ?? 1,
        fadeIn: clip.fadeIn ?? 0,
        fadeOut: clip.fadeOut ?? 0,
        asset,
      });
    }
  }

  if (audioClips.length === 0) return null;

  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  if (!OfflineCtx) return null;

  const totalFrames = Math.max(1, Math.ceil(totalDuration * sampleRate));
  const offline = new OfflineCtx(2, totalFrames, sampleRate);
  let decodedAny = false;

  for (const item of audioClips) {
    try {
      const blob = mediaRegistry.getBlob(item.asset.id);
      const buffer = blob
        ? await blob.arrayBuffer()
        : item.asset.serverUrl
        ? await (await fetch(resolveServerUrl(item.asset.serverUrl))).arrayBuffer()
        : null;
      if (!buffer) continue;
      const decoded = await offline.decodeAudioData(buffer.slice(0));
      const src = offline.createBufferSource();
      src.buffer = decoded;
      src.playbackRate.value = item.speed;

      const gain = offline.createGain();
      const baseVol = Math.max(0, Math.min(2, item.volume));
      const startT = Math.max(0, item.start);
      const endT = startT + item.duration;
      const fadeInDur = Math.min(item.duration / 2, Math.max(0, item.fadeIn));
      const fadeOutDur = Math.min(item.duration / 2, Math.max(0, item.fadeOut));

      if (fadeInDur > 0.01) {
        gain.gain.setValueAtTime(0.0001, startT);
        gain.gain.linearRampToValueAtTime(baseVol, startT + fadeInDur);
      } else {
        gain.gain.setValueAtTime(baseVol, startT);
      }

      if (fadeOutDur > 0.01) {
        const fadeOutStart = Math.max(startT + fadeInDur, endT - fadeOutDur);
        gain.gain.setValueAtTime(baseVol, fadeOutStart);
        gain.gain.linearRampToValueAtTime(0.0001, endT);
      }

      src.connect(gain);
      gain.connect(offline.destination);
      src.start(startT, item.offset, item.duration * item.speed);
      decodedAny = true;
    } catch {
      // Skip clips without decodable audio track
    }
  }

  if (!decodedAny) return null;
  return offline.startRendering();
}

async function buildLayersAtTime(
  t: number,
  project: ProjectDocument,
  width: number,
  height: number,
  compositor: WebGLCompositor,
  videoElements: Map<string, HTMLVideoElement>,
  imageElements: Map<string, HTMLImageElement>
): Promise<CompositeLayer[]> {
  const layers: CompositeLayer[] = [];

  for (const tid of project.trackOrder) {
    const track = project.tracks[tid];
    if (!track || track.isMuted) continue;
    for (const cid of track.clipIds) {
      const clip = project.clips[cid];
      if (!clip || t < clip.start || t >= clip.start + clip.duration) {
        continue;
      }
      const localTime = Math.max(0, t - clip.start);
      if (clip.type === 'text' && clip.textStyle) {
        const txtCanvas = compositor.getTextLayerCanvas(
          clip.id,
          clip.textStyle,
          width,
          height,
          clip.subtitleWords,
          localTime
        );
        layers.push({
          clip,
          source: txtCanvas,
          sourceWidth: width,
          sourceHeight: height,
          localTime,
        });
        continue;
      }
      const asset = project.assets[clip.assetId];
      if (!asset) continue;
      if (asset.kind === 'video') {
        const vid = videoElements.get(asset.id);
        if (vid) {
          const sourceTime = Math.max(
            0,
            clip.offset + localTime * (clip.speed || 1)
          );
          await seekVideo(vid, sourceTime);
          layers.push({
            clip,
            source: vid,
            sourceWidth: vid.videoWidth || asset.width || width,
            sourceHeight: vid.videoHeight || asset.height || height,
            localTime,
          });
        }
      } else if (asset.kind === 'image') {
        const img = imageElements.get(asset.id);
        if (img) {
          layers.push({
            clip,
            source: img,
            sourceWidth: img.naturalWidth || asset.width || width,
            sourceHeight: img.naturalHeight || asset.height || height,
            localTime,
          });
        }
      }
    }
  }

  return layers;
}

/**
 * Fallback exporter using Canvas.captureStream + MediaRecorder when a phone/tablet/laptop
 * accesses the PC Server over plain HTTP LAN IP (where WebCodecs VideoEncoder is restricted).
 */
async function exportViaMediaRecorderFallback(options: {
  project: ProjectDocument;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  totalDuration: number;
  totalFrames: number;
  videoElements: Map<string, HTMLVideoElement>;
  imageElements: Map<string, HTMLImageElement>;
  onProgress?: (info: ClientExportProgress) => void;
  signal?: AbortSignal;
}): Promise<Blob> {
  const {
    project,
    width,
    height,
    fps,
    bitrate,
    totalDuration,
    totalFrames,
    videoElements,
    imageElements,
    onProgress,
    signal,
  } = options;

  if (typeof MediaRecorder === 'undefined') {
    throw new Error(
      'WebCodecs maupun MediaRecorder tidak tersedia pada browser ini. Gunakan opsi Server Offload FFmpeg.'
    );
  }

  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = width;
  offscreenCanvas.height = height;
  const compositor = new WebGLCompositor(offscreenCanvas);

  let liveAudioCtx: AudioContext | null = null;
  let audioDest: MediaStreamAudioDestinationNode | null = null;
  let audioSourceNode: AudioBufferSourceNode | null = null;

  try {
    const stream = offscreenCanvas.captureStream(fps);

    // Attach mixed audio track to MediaRecorder stream so LAN HTTP exports keep audio!
    try {
      const mixedAudio = await mixAudioTrackBuffer(project, totalDuration, 44100);
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (mixedAudio && AudioCtx) {
        liveAudioCtx = new AudioCtx({ sampleRate: 44100 });
        if (liveAudioCtx.state === 'suspended') {
          await liveAudioCtx.resume().catch(() => {});
        }
        if (typeof liveAudioCtx.createMediaStreamDestination === 'function') {
          audioDest = liveAudioCtx.createMediaStreamDestination();
          audioSourceNode = liveAudioCtx.createBufferSource();
          audioSourceNode.buffer = mixedAudio;
          audioSourceNode.connect(audioDest);
          for (const track of audioDest.stream.getAudioTracks()) {
            stream.addTrack(track);
          }
        }
      }
    } catch {
      // Continue video-only if browser audio destination is unavailable
    }

    const mimeCandidates = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    const selectedMime =
      mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';

    const chunks: BlobPart[] = [];
    const recorder = selectedMime
      ? new MediaRecorder(stream, {
          mimeType: selectedMime,
          videoBitsPerSecond: bitrate,
        })
      : new MediaRecorder(stream);

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };

    const stopped = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error('MediaRecorder gagal merekam.'));
    });

    recorder.start(100);
    if (audioSourceNode) {
      try {
        audioSourceNode.start(0);
      } catch {
        // Ignore if autoplay restricted
      }
    }

    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      if (signal?.aborted) {
        recorder.stop();
        throw new Error('Export dibatalkan oleh pengguna.');
      }
      const t = frameIdx / fps;
      const layers = await buildLayersAtTime(
        t,
        project,
        width,
        height,
        compositor,
        videoElements,
        imageElements
      );
      compositor.render(layers, project.canvasBackground);

      await new Promise((r) => setTimeout(r, Math.round(1000 / fps)));
      onProgress?.({
        phase: 'video',
        progress: 10 + Math.round(((frameIdx + 1) / totalFrames) * 85),
        currentFrame: frameIdx + 1,
        totalFrames,
      });
    }

    onProgress?.({
      phase: 'finalizing',
      progress: 97,
      currentFrame: totalFrames,
      totalFrames,
    });
    if (audioSourceNode) {
      try {
        audioSourceNode.stop();
      } catch {
        // Ignore
      }
    }
    recorder.stop();
    await stopped;

    return new Blob(chunks, { type: selectedMime || 'video/webm' });
  } finally {
    if (liveAudioCtx) {
      void liveAudioCtx.close().catch(() => {});
    }
    compositor.dispose();
  }
}

export async function exportProjectClientSide(options: {
  project: ProjectDocument;
  quality?: 'draft' | 'standard' | 'high';
  onProgress?: (info: ClientExportProgress) => void;
  signal?: AbortSignal;
}): Promise<Blob> {
  const { project, quality = 'standard', onProgress, signal } = options;
  const bitrate =
    quality === 'draft'
      ? 2_500_000
      : quality === 'high'
        ? 10_000_000
        : 5_000_000;

  const width = Math.max(16, Math.round(project.resolution.width / 2) * 2);
  const height = Math.max(16, Math.round(project.resolution.height / 2) * 2);
  const fps = Math.max(1, Math.round(project.resolution.fps || 30));

  let totalDuration = 0;
  for (const tid of project.trackOrder) {
    const track = project.tracks[tid];
    if (!track || track.isMuted) continue;
    for (const cid of track.clipIds) {
      const clip = project.clips[cid];
      if (clip) totalDuration = Math.max(totalDuration, clip.start + clip.duration);
    }
  }
  totalDuration = Math.max(1, totalDuration);

  const totalFrames = Math.max(1, Math.ceil(totalDuration * fps));
  onProgress?.({
    phase: 'preparing',
    progress: 2,
    currentFrame: 0,
    totalFrames,
  });

  // Preload visual media elements (resolving serverUrl for cross-device projects!)
  const videoElements = new Map<string, HTMLVideoElement>();
  const imageElements = new Map<string, HTMLImageElement>();

  for (const clip of Object.values(project.clips)) {
    if (clip.type === 'text' || clip.type === 'audio') continue;
    const asset = project.assets[clip.assetId];
    if (!asset) continue;
    const rawUrl = mediaRegistry.getObjectUrl(asset.id) || asset.serverUrl;
    if (!rawUrl) continue;
    const url =
      rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')
        ? rawUrl
        : resolveServerUrl(rawUrl);

    if (asset.kind === 'video' && !videoElements.has(asset.id)) {
      videoElements.set(asset.id, await loadVideo(url));
    } else if (asset.kind === 'image' && !imageElements.has(asset.id)) {
      imageElements.set(asset.id, await loadImage(url));
    }
  }

  // Automatic fallback to MediaRecorder when accessed on plain HTTP LAN IP without WebCodecs
  if (
    typeof VideoEncoder === 'undefined' ||
    typeof VideoFrame === 'undefined'
  ) {
    return exportViaMediaRecorderFallback({
      project,
      width,
      height,
      fps,
      bitrate,
      totalDuration,
      totalFrames,
      videoElements,
      imageElements,
      onProgress,
      signal,
    });
  }

  const codecCandidates = [
    'avc1.64002a',
    'avc1.4d002a',
    'avc1.640028',
    'avc1.4d0028',
    'avc1.42002a',
    'avc1.420028',
    'avc1.42E028',
    'avc1.42001f',
    'avc1.42E01E',
  ];
  let selectedCodec: string | null = null;
  for (const candidate of codecCandidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: candidate,
        width,
        height,
        bitrate,
        framerate: fps,
      });
      if (support.supported) {
        selectedCodec = candidate;
        break;
      }
    } catch {
      // Try next H.264 profile/level
    }
  }

  // Fallback cleanly if device/iOS/Android WebView lacks supported H.264 WebCodecs profile
  if (!selectedCodec) {
    return exportViaMediaRecorderFallback({
      project,
      width,
      height,
      fps,
      bitrate,
      totalDuration,
      totalFrames,
      videoElements,
      imageElements,
      onProgress,
      signal,
    });
  }

  let audioSupported = false;
  if (typeof AudioEncoder !== 'undefined') {
    try {
      const aSupport = await AudioEncoder.isConfigSupported({
        codec: 'mp4a.40.2',
        numberOfChannels: 2,
        sampleRate: 44100,
        bitrate: 192_000,
      });
      audioSupported = Boolean(aSupport.supported);
    } catch {
      audioSupported = false;
    }
  }

  let mixedAudio: AudioBuffer | null = null;
  if (audioSupported) {
    onProgress?.({
      phase: 'audio',
      progress: 8,
      currentFrame: 0,
      totalFrames,
    });
    mixedAudio = await mixAudioTrackBuffer(project, totalDuration, 44100);
  }

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height },
    audio: mixedAudio
      ? { codec: 'aac', numberOfChannels: 2, sampleRate: 44100 }
      : undefined,
    fastStart: 'in-memory',
  });

  let encoderError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => {
      encoderError = err;
    },
  });

  videoEncoder.configure({
    codec: selectedCodec,
    width,
    height,
    bitrate,
    framerate: fps,
  });

  let audioEncoder: AudioEncoder | null = null;
  if (mixedAudio && audioSupported && typeof AudioEncoder !== 'undefined') {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (err) => {
        encoderError = err;
      },
    });
    audioEncoder.configure({
      codec: 'mp4a.40.2',
      numberOfChannels: 2,
      sampleRate: 44100,
      bitrate: 192_000,
    });
  }

  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = width;
  offscreenCanvas.height = height;
  const compositor = new WebGLCompositor(offscreenCanvas);

  try {
    if (mixedAudio && audioEncoder && typeof AudioData !== 'undefined') {
      const sampleRate = mixedAudio.sampleRate;
      const chunkFrames = 1024;
      const left = mixedAudio.getChannelData(0);
      const right =
        mixedAudio.numberOfChannels > 1
          ? mixedAudio.getChannelData(1)
          : left;

      for (let offset = 0; offset < mixedAudio.length; offset += chunkFrames) {
        if (signal?.aborted) throw new Error('Export dibatalkan oleh pengguna.');
        const count = Math.min(chunkFrames, mixedAudio.length - offset);
        const planar = new Float32Array(count * 2);
        planar.set(left.subarray(offset, offset + count), 0);
        planar.set(right.subarray(offset, offset + count), count);

        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate,
          numberOfFrames: count,
          numberOfChannels: 2,
          timestamp: Math.round((offset / sampleRate) * 1_000_000),
          data: planar,
        });
        audioEncoder.encode(audioData);
        audioData.close();
      }
      await audioEncoder.flush();
      audioEncoder.close();
    }

    const frameDurUs = Math.round((1 / fps) * 1_000_000);
    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      if (signal?.aborted) throw new Error('Export dibatalkan oleh pengguna.');
      if (encoderError) throw encoderError;

      const t = frameIdx / fps;
      const layers = await buildLayersAtTime(
        t,
        project,
        width,
        height,
        compositor,
        videoElements,
        imageElements
      );
      compositor.render(layers, project.canvasBackground);

      const frame = new VideoFrame(offscreenCanvas, {
        timestamp: Math.round(t * 1_000_000),
        duration: frameDurUs,
      });
      videoEncoder.encode(frame, { keyFrame: frameIdx % fps === 0 });
      frame.close();

      if (videoEncoder.encodeQueueSize > 8) {
        await new Promise((r) => setTimeout(r, 4));
      }

      onProgress?.({
        phase: 'video',
        progress: 12 + Math.round(((frameIdx + 1) / totalFrames) * 82),
        currentFrame: frameIdx + 1,
        totalFrames,
      });
    }

    onProgress?.({
      phase: 'finalizing',
      progress: 96,
      currentFrame: totalFrames,
      totalFrames,
    });

    await videoEncoder.flush();
    videoEncoder.close();
    muxer.finalize();

    return new Blob([target.buffer], { type: 'video/mp4' });
  } finally {
    compositor.dispose();
  }
}
