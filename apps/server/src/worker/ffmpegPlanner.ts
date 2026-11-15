import type {
  Clip,
  ProjectDocument,
  ServerEncoderCapability,
} from '@velocut/shared';

export interface FfmpegRenderPlan {
  args: string[];
  commandPreview: string;
  encoder: ServerEncoderCapability;
  totalDuration: number;
  missingAssets: string[];
}

export type AssetPathResolver = (assetId: string) => string | null;

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/\n/g, '\\n');
}

function getEffectValue(clip: Clip, type: string, fallback: number): number {
  const match = clip.effects.find((e) => e.type === type);
  return match ? match.value : fallback;
}

function getEncoderArgs(
  encoder: ServerEncoderCapability,
  quality: 'draft' | 'standard' | 'high'
): string[] {
  const crfMap = { draft: 28, standard: 21, high: 17 } as const;
  const crf = crfMap[quality];

  switch (encoder) {
    case 'h264_nvenc':
      return ['-c:v', 'h264_nvenc', '-preset', quality === 'draft' ? 'p1' : 'p4', '-cq', String(crf), '-pix_fmt', 'yuv420p'];
    case 'h264_vaapi':
      return ['-c:v', 'h264_vaapi', '-qp', String(crf)];
    case 'h264_qsv':
      return ['-c:v', 'h264_qsv', '-global_quality', String(crf), '-pix_fmt', 'yuv420p'];
    case 'libx264':
    default:
      return [
        '-c:v',
        'libx264',
        '-preset',
        quality === 'draft' ? 'ultrafast' : quality === 'high' ? 'slow' : 'veryfast',
        '-crf',
        String(crf),
        '-pix_fmt',
        'yuv420p',
      ];
  }
}

export function buildFfmpegRenderPlan(options: {
  project: ProjectDocument;
  resolveAssetPath: AssetPathResolver;
  outputPath: string;
  encoder: ServerEncoderCapability;
  quality?: 'draft' | 'standard' | 'high';
}): FfmpegRenderPlan {
  const {
    project,
    resolveAssetPath,
    outputPath,
    encoder,
    quality = 'standard',
  } = options;

  const width = Math.max(16, Math.round(project.resolution?.width || 1920));
  const height = Math.max(16, Math.round(project.resolution?.height || 1080));
  const fps = Math.max(1, Math.round(project.resolution?.fps || 30));

  const activeClips: Clip[] = [];
  for (const trackId of project.trackOrder) {
    const track = project.tracks[trackId];
    if (!track || track.isMuted) continue;
    for (const clipId of track.clipIds) {
      const clip = project.clips[clipId];
      if (clip && clip.duration > 0) {
        activeClips.push(clip);
      }
    }
  }

  const totalDuration = Math.max(
    1,
    activeClips.reduce((maxEnd, c) => Math.max(maxEnd, c.start + c.duration), 0)
  );

  const inputPaths: string[] = [];
  const inputIndexByAssetId = new Map<string, number>();
  const missingAssets: string[] = [];

  for (const clip of activeClips) {
    if (clip.type === 'text') continue;
    const asset = project.assets[clip.assetId];
    const resolved = resolveAssetPath(asset?.serverAssetId || clip.assetId);
    if (!resolved) {
      if (!missingAssets.includes(clip.assetId)) {
        missingAssets.push(clip.assetId);
      }
      continue;
    }
    if (!inputIndexByAssetId.has(clip.assetId)) {
      inputIndexByAssetId.set(clip.assetId, inputPaths.length);
      inputPaths.push(resolved);
    }
  }

  const args: string[] = ['-y'];
  for (const inputPath of inputPaths) {
    args.push('-i', inputPath);
  }

  const filterParts: string[] = [
    `color=c=black:s=${width}x${height}:r=${fps}:d=${totalDuration.toFixed(3)}[v0]`,
  ];

  let currentVideoLabel = 'v0';
  let videoStep = 0;
  const audioLabels: string[] = [];

  for (const clip of activeClips) {
    const clipEnd = clip.start + clip.duration;

    if (clip.type === 'text' && clip.textStyle) {
      const nextLabel = `v${++videoStep}`;
      const escaped = escapeDrawtext(clip.textStyle.content || clip.name);
      const fontSize = Math.max(12, Math.round(clip.textStyle.fontSize || 48));
      const xExpr = `(w-text_w)/2+${Math.round(clip.transforms.x)}`;
      const yExpr = `(h-text_h)/2+${Math.round(clip.transforms.y)}`;
      const fontColor = clip.textStyle.color || '#ffffff';
      const boxPart = clip.textStyle.backgroundColor
        ? `:box=1:boxcolor=black@0.55:boxborderw=14`
        : '';

      filterParts.push(
        `[${currentVideoLabel}]drawtext=text='${escaped}':fontsize=${fontSize}:fontcolor=${fontColor}:x=${xExpr}:y=${yExpr}${boxPart}:enable='between(t,${clip.start.toFixed(3)},${clipEnd.toFixed(3)})'[${nextLabel}]`
      );
      currentVideoLabel = nextLabel;
      continue;
    }

    const inputIdx = inputIndexByAssetId.get(clip.assetId);
    if (inputIdx === undefined) continue;
    const asset = project.assets[clip.assetId];
    const isAudioOnly = clip.type === 'audio' || asset?.kind === 'audio';
    const isImage = asset?.kind === 'image';

    if (!isAudioOnly) {
      const clipLabel = `vc_${videoStep}`;
      const nextLabel = `v${++videoStep}`;
      const chain: string[] = [];

      if (isImage) {
        chain.push(`loop=loop=-1:size=1:start=0,trim=duration=${clip.duration.toFixed(3)},setpts=PTS-STARTPTS`);
      } else {
        chain.push(
          `trim=start=${clip.offset.toFixed(3)}:duration=${clip.duration.toFixed(3)},setpts=PTS-STARTPTS`
        );
      }

      const targetScale = Math.max(0.05, clip.transforms.scale || 1);
      const scaledW = Math.max(2, Math.round((width * targetScale) / 2) * 2);
      const scaledH = Math.max(2, Math.round((height * targetScale) / 2) * 2);
      chain.push(
        `scale=${scaledW}:${scaledH}:force_original_aspect_ratio=decrease`
      );

      const brightness = getEffectValue(clip, 'brightness', 0);
      const contrast = getEffectValue(clip, 'contrast', 1);
      const saturation = getEffectValue(clip, 'saturation', 1);
      if (brightness !== 0 || contrast !== 1 || saturation !== 1) {
        chain.push(
          `eq=brightness=${brightness.toFixed(2)}:contrast=${contrast.toFixed(2)}:saturation=${saturation.toFixed(2)}`
        );
      }

      const grayscale = getEffectValue(clip, 'grayscale', 0);
      if (grayscale > 0) {
        chain.push(`hue=s=${Math.max(0, 1 - grayscale).toFixed(2)}`);
      }

      if (clip.transforms.flipH) {
        chain.push('hflip');
      }
      if (clip.transforms.flipV) {
        chain.push('vflip');
      }

      if (clip.transforms.rotation !== 0) {
        const rad = (clip.transforms.rotation * Math.PI) / 180;
        chain.push(`rotate=${rad.toFixed(4)}:c=none:ow=rotw(${rad.toFixed(4)}):oh=roth(${rad.toFixed(4)})`);
      }

      chain.push(`format=yuva420p`);
      if (clip.transforms.opacity < 1) {
        chain.push(
          `colorchannelmixer=aa=${Math.max(0, Math.min(1, clip.transforms.opacity)).toFixed(2)}`
        );
      }

      chain.push(`setpts=PTS+${clip.start.toFixed(3)}/TB`);

      filterParts.push(`[${inputIdx}:v]${chain.join(',')}[${clipLabel}]`);
      const xPos = `(W-w)/2+${Math.round(clip.transforms.x)}`;
      const yPos = `(H-h)/2+${Math.round(clip.transforms.y)}`;
      filterParts.push(
        `[${currentVideoLabel}][${clipLabel}]overlay=x=${xPos}:y=${yPos}:enable='between(t,${clip.start.toFixed(3)},${clipEnd.toFixed(3)})':eof_action=pass[${nextLabel}]`
      );
      currentVideoLabel = nextLabel;
    }

    if (isAudioOnly || asset?.hasAudio) {
      const audioLabel = `ac_${audioLabels.length}`;
      const delayMs = Math.max(0, Math.round(clip.start * 1000));
      filterParts.push(
        `[${inputIdx}:a]atrim=start=${clip.offset.toFixed(3)}:duration=${clip.duration.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs}[${audioLabel}]`
      );
      audioLabels.push(`[${audioLabel}]`);
    }
  }

  let hasAudioOutput = false;
  if (audioLabels.length === 1) {
    filterParts.push(`${audioLabels[0]}apad=whole_dur=${totalDuration.toFixed(3)}[aout]`);
    hasAudioOutput = true;
  } else if (audioLabels.length > 1) {
    filterParts.push(
      `${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0[aout]`
    );
    hasAudioOutput = true;
  }

  args.push('-filter_complex', filterParts.join(';'));
  args.push('-map', `[${currentVideoLabel}]`);
  if (hasAudioOutput) {
    args.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '192k');
  }
  args.push(...getEncoderArgs(encoder, quality));
  args.push('-movflags', '+faststart', '-t', totalDuration.toFixed(3), outputPath);

  const quotedArgs = args.map((a) =>
    /[\s;'"()]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a
  );

  return {
    args,
    commandPreview: `ffmpeg ${quotedArgs.join(' ')}`,
    encoder,
    totalDuration,
    missingAssets,
  };
}

