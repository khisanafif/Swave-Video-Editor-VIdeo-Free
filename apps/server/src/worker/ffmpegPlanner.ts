import fs from 'node:fs';
import type {
  Clip,
  ProjectDocument,
  ServerEncoderCapability,
} from '@swave/shared';

export interface FfmpegRenderPlan {
  args: string[];
  commandPreview: string;
  encoder: ServerEncoderCapability;
  totalDuration: number;
  missingAssets: string[];
}

export type AssetPathResolver = (assetId: string) => string | null;

function resolveDefaultFontFile(): string | null {
  const candidates = [
    'C:/Windows/Fonts/arial.ttf',
    'C:/Windows/Fonts/segoeui.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c.replace(/:/g, '\\:');
    }
  }
  return null;
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\r?\n/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, '')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/%/g, '\\%');
}

function escapeFilterFilePath(filePath: string): string {
  return filePath
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");
}

function sanitizeCanvasColor(bg?: string): string {
  if (!bg) return 'black';
  const clean = bg.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(clean)) {
    return `0x${clean.slice(1)}`;
  }
  return 'black';
}

function cssColorToAssParts(
  color: string | undefined,
  fallbackHex = '#ffffff'
): { bgr: string; alphaHex: string; assStyleColor: string } {
  const raw = (color || fallbackHex).trim();
  const hexMatch = /^#([0-9a-fA-F]{6})$/.exec(raw);
  if (hexMatch) {
    const hex = hexMatch[1].toUpperCase();
    const bgr = `${hex.slice(4, 6)}${hex.slice(2, 4)}${hex.slice(0, 2)}`;
    return { bgr, alphaHex: '00', assStyleColor: `&H00${bgr}` };
  }
  const rgbaMatch =
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(
      raw
    );
  if (rgbaMatch) {
    const toHex = (n: number) =>
      Math.max(0, Math.min(255, Math.round(n)))
        .toString(16)
        .padStart(2, '0')
        .toUpperCase();
    const r = toHex(Number(rgbaMatch[1]));
    const g = toHex(Number(rgbaMatch[2]));
    const b = toHex(Number(rgbaMatch[3]));
    const alphaFloat = rgbaMatch[4] !== undefined ? Number(rgbaMatch[4]) : 1;
    const alphaHex = toHex((1 - Math.max(0, Math.min(1, alphaFloat))) * 255);
    const bgr = `${b}${g}${r}`;
    return { bgr, alphaHex, assStyleColor: `&H${alphaHex}${bgr}` };
  }
  return cssColorToAssParts(fallbackHex, '#ffffff');
}

function formatAssTimestamp(sec: number): string {
  const clamped = Math.max(0, sec);
  const hours = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = Math.floor(clamped % 60);
  const cs = Math.min(99, Math.floor((clamped % 1) * 100));
  return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(
    2,
    '0'
  )}.${String(cs).padStart(2, '0')}`;
}

function wrapSubtitleLines(text: string, fontSize: number, maxWidthPx: number): string[] {
  const approxCharWidth = Math.max(8, fontSize * 0.56);
  const maxCharsPerLine = Math.max(12, Math.floor(maxWidthPx / approxCharWidth));
  const rawLines = (text || '').split(/\r?\n/);
  const out: string[] = [];
  for (const raw of rawLines) {
    const words = raw.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      if (current.length + 1 + words[i].length <= maxCharsPerLine) {
        current += ` ${words[i]}`;
      } else {
        out.push(current);
        current = words[i];
      }
    }
    out.push(current);
  }
  return out;
}

function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}');
}

export function buildAssSubtitleDocument(
  project: ProjectDocument,
  textClips: Clip[]
): string {
  const width = Math.max(16, Math.round(project.resolution?.width || 1920));
  const height = Math.max(16, Math.round(project.resolution?.height || 1080));

  const lines: string[] = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,DejaVu Sans,48,&H00FFFFFF,&H0015CCFA,&H00000000,&H99000000,-1,0,0,0,100,100,0,0,1,2,1,5,24,24,24,1',
    'Style: Boxed,DejaVu Sans,48,&H00FFFFFF,&H0015CCFA,&HBF0B0909,&HBF0B0909,-1,0,0,0,100,100,0,0,3,14,0,5,24,24,24,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  textClips.forEach((clip, idx) => {
    const style = clip.textStyle;
    if (!style) return;

    const startTs = formatAssTimestamp(clip.start);
    const endTs = formatAssTimestamp(clip.start + clip.duration);
    const fontSize = Math.max(14, Math.round(style.fontSize || 48));
    const cx = Math.round(width / 2 + (clip.transforms.x || 0));
    const cy = Math.round(height / 2 + (clip.transforms.y || 0));
    const scalePct = Math.max(10, Math.round((clip.transforms.scale || 1) * 100));
    const rotDeg = Math.round(-(clip.transforms.rotation || 0));
    const opacityAlpha = Math.round(
      (1 - Math.max(0, Math.min(1, clip.transforms.opacity ?? 1))) * 255
    )
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();

    const primaryColor = cssColorToAssParts(style.color, '#ffffff');
    const highlightColor = cssColorToAssParts(
      style.highlightColor || '#facc15',
      '#facc15'
    );
    const outlineColor = cssColorToAssParts(style.strokeColor, '#000000');
    const hasBgBox =
      Boolean(style.backgroundColor) && style.backgroundColor !== 'transparent';
    const bgColor = hasBgBox
      ? cssColorToAssParts(style.backgroundColor, 'rgba(9,9,11,0.75)')
      : cssColorToAssParts('#000000', '#000000');

    const styleName = hasBgBox ? 'Boxed' : 'Default';
    const alignNum = style.align === 'left' ? 4 : style.align === 'right' ? 6 : 5;
    const strokeW = style.strokeWidth || 0;
    const bordVal = hasBgBox
      ? 14
      : strokeW > 0
      ? Math.max(1, Math.round(strokeW / 2))
      : 0;
    const shadVal = hasBgBox ? 0 : style.shadow ? 2 : 0;
    const boldTag = style.bold ? '\\b1' : '\\b0';

    const fadeInMs =
      clip.animation && clip.animation.in !== 'none'
        ? Math.round((clip.animation.inDuration || 0.25) * 1000)
        : 0;
    const fadeOutMs =
      clip.animation && clip.animation.out !== 'none'
        ? Math.round((clip.animation.outDuration || 0.25) * 1000)
        : 0;
    const fadeTag =
      fadeInMs > 0 || fadeOutMs > 0 ? `\\fad(${fadeInMs},${fadeOutMs})` : '';

    const borderColorTags = hasBgBox
      ? `\\3c&H${bgColor.bgr}&\\3a&H${bgColor.alphaHex}&\\4c&H${bgColor.bgr}&\\4a&H${bgColor.alphaHex}&`
      : `\\3c&H${outlineColor.bgr}&\\3a&H00&`;

    const override =
      `{\\an${alignNum}\\pos(${cx},${cy})\\fs${fontSize}${boldTag}` +
      `\\fscx${scalePct}\\fscy${scalePct}\\frz${rotDeg}` +
      `\\1c&H${primaryColor.bgr}&\\2c&H${highlightColor.bgr}&` +
      `${borderColorTags}\\bord${bordVal}\\shad${shadVal}\\alpha&H${opacityAlpha}&${fadeTag}}`;

    const wrapped = wrapSubtitleLines(
      style.content || clip.name || '',
      fontSize,
      width * 0.84
    );
    const bodyText = wrapped.map(escapeAssText).join('\\N');

    lines.push(
      `Dialogue: ${idx},${startTs},${endTs},${styleName},,0,0,0,,${override}${bodyText}`
    );
  });

  return `${lines.join('\n')}\n`;
}

function getEffectValue(clip: Clip, type: string, fallback: number): number {
  const match = clip.effects.find((e) => e.type === type);
  return match ? match.value : fallback;
}

function buildAtempoChain(speed: number): string[] {
  const filters: string[] = [];
  let remaining = Math.max(0.25, Math.min(4, speed));
  while (remaining > 2.0) {
    filters.push('atempo=2.0');
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }
  if (Math.abs(remaining - 1) > 0.01) {
    filters.push(`atempo=${remaining.toFixed(3)}`);
  }
  return filters;
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
  assFilePath?: string;
}): FfmpegRenderPlan {
  const {
    project,
    resolveAssetPath,
    outputPath,
    encoder,
    quality = 'standard',
    assFilePath,
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

  const bgHex = sanitizeCanvasColor(project.canvasBackground);
  const filterParts: string[] = [
    `color=c=${bgHex}:s=${width}x${height}:r=${fps}:d=${totalDuration.toFixed(3)}[v0]`,
  ];

  let currentVideoLabel = 'v0';
  let videoStep = 0;
  const audioLabels: string[] = [];
  const textClipsForAss: Clip[] = [];

  for (const clip of activeClips) {
    const clipEnd = clip.start + clip.duration;

    if (clip.type === 'text' && clip.textStyle) {
      if (assFilePath) {
        textClipsForAss.push(clip);
        continue;
      }

      const nextLabel = `v${++videoStep}`;
      const escaped = escapeDrawtext(clip.textStyle.content || clip.name);
      const fontSize = Math.max(12, Math.round(clip.textStyle.fontSize || 48));
      const xExpr = `(w-text_w)/2+${Math.round(clip.transforms.x)}`;
      const yExpr = `(h-text_h)/2+${Math.round(clip.transforms.y)}`;
      const fontColor = clip.textStyle.color || '#ffffff';
      const fontFile = resolveDefaultFontFile();
      const fontFilePart = fontFile ? `:fontfile='${fontFile}'` : '';
      const hasBgBox =
        clip.textStyle.backgroundColor &&
        clip.textStyle.backgroundColor !== 'transparent';
      const boxPart = hasBgBox
        ? `:box=1:boxcolor=black@0.55:boxborderw=14`
        : '';
      const strokeW = clip.textStyle.strokeWidth || 0;
      const borderPart =
        strokeW > 0
          ? `:borderw=${Math.min(12, Math.max(1, Math.round(strokeW / 2)))}:bordercolor=${clip.textStyle.strokeColor || 'black'}`
          : '';

      filterParts.push(
        `[${currentVideoLabel}]drawtext=text='${escaped}'${fontFilePart}:fontsize=${fontSize}:fontcolor=${fontColor}:x=${xExpr}:y=${yExpr}${borderPart}${boxPart}:enable='between(t,${clip.start.toFixed(3)},${clipEnd.toFixed(3)})'[${nextLabel}]`
      );
      currentVideoLabel = nextLabel;
      continue;
    }

    const inputIdx = inputIndexByAssetId.get(clip.assetId);
    if (inputIdx === undefined) continue;
    const asset = project.assets[clip.assetId];
    const isAudioOnly = clip.type === 'audio' || asset?.kind === 'audio';
    const isImage = asset?.kind === 'image';
    const speed = Math.max(0.01, clip.speed || 1);

    if (!isAudioOnly) {
      const clipLabel = `vc_${videoStep}`;
      const nextLabel = `v${++videoStep}`;
      const chain: string[] = [];

      if (isImage) {
        chain.push(`loop=loop=-1:size=1:start=0,trim=duration=${clip.duration.toFixed(3)},setpts=PTS-STARTPTS`);
      } else {
        const sourceDur = Math.max(0.05, clip.duration * speed);
        chain.push(
          `trim=start=${clip.offset.toFixed(3)}:duration=${sourceDur.toFixed(3)},setpts=${
            Math.abs(speed - 1) > 0.01
              ? `(PTS-STARTPTS)/${speed.toFixed(3)}`
              : 'PTS-STARTPTS'
          }`
        );
      }

      const targetScale = Math.max(0.05, clip.transforms.scale || 1);
      const scaledW = Math.max(2, Math.round((width * targetScale) / 2) * 2);
      const scaledH = Math.max(2, Math.round((height * targetScale) / 2) * 2);

      const crop = clip.transforms.crop;
      if (crop) {
        const cTop = Math.max(0, Math.min(45, crop.top || 0)) / 100;
        const cRight = Math.max(0, Math.min(45, crop.right || 0)) / 100;
        const cBottom = Math.max(0, Math.min(45, crop.bottom || 0)) / 100;
        const cLeft = Math.max(0, Math.min(45, crop.left || 0)) / 100;
        const wFrac = Math.max(0.1, 1 - cLeft - cRight);
        const hFrac = Math.max(0.1, 1 - cTop - cBottom);
        if (cTop > 0.001 || cRight > 0.001 || cBottom > 0.001 || cLeft > 0.001) {
          chain.push(
            `crop=iw*${wFrac.toFixed(3)}:ih*${hFrac.toFixed(3)}:iw*${cLeft.toFixed(3)}:ih*${cTop.toFixed(3)}`
          );
        }
      }

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

      const temperature = getEffectValue(clip, 'temperature', 0);
      if (Math.abs(temperature) > 0.01) {
        const rs = (temperature * 0.28).toFixed(2);
        const bs = (-temperature * 0.28).toFixed(2);
        chain.push(`colorbalance=rs=${rs}:bs=${bs}`);
      }

      if (clip.chromaKey?.enabled) {
        const hexKey = (clip.chromaKey.color || '#00b140')
          .replace('#', '')
          .trim()
          .padEnd(6, '0')
          .slice(0, 6);
        const sim = Math.max(0.05, Math.min(0.6, clip.chromaKey.tolerance || 0.32)).toFixed(2);
        const blend = Math.max(0.01, Math.min(0.3, clip.chromaKey.smoothness ?? 0.08)).toFixed(2);
        chain.push(`colorkey=0x${hexKey}:${sim}:${blend}`);
      }

      const grayscale = getEffectValue(clip, 'grayscale', 0);
      if (grayscale > 0) {
        chain.push(`hue=s=${Math.max(0, 1 - grayscale).toFixed(2)}`);
      }

      const sepia = getEffectValue(clip, 'sepia', 0);
      if (sepia > 0.01) {
        const s = Math.min(1, sepia);
        const inv = 1 - s;
        chain.push(
          `colorchannelmixer=${(inv + 0.393 * s).toFixed(2)}:${(0.769 * s).toFixed(2)}:${(0.189 * s).toFixed(2)}:0:${(0.349 * s).toFixed(2)}:${(inv + 0.686 * s).toFixed(2)}:${(0.168 * s).toFixed(2)}:0:${(0.272 * s).toFixed(2)}:${(0.534 * s).toFixed(2)}:${(inv + 0.131 * s).toFixed(2)}:0`
        );
      }

      const vignette = getEffectValue(clip, 'vignette', 0);
      if (vignette > 0.01) {
        const angle = Math.min(1.5, 0.25 + vignette * 0.9);
        chain.push(`vignette=angle=${angle.toFixed(2)}`);
      }

      const blur = getEffectValue(clip, 'blur', 0);
      if (blur > 0.01) {
        chain.push(`gblur=sigma=${(blur * 12).toFixed(2)}`);
      }

      const chromab = getEffectValue(clip, 'chromab', 0);
      if (chromab > 0.01) {
        const shift = Math.max(1, Math.round(chromab * 14));
        chain.push(`rgbashift=rh=${shift}:bh=-${shift}`);
      }

      const pixelate = getEffectValue(clip, 'pixelate', 0);
      if (pixelate > 0.01) {
        const factor = Math.max(2, Math.round(pixelate * 24));
        chain.push(`scale=iw/${factor}:ih/${factor}:flags=neighbor,scale=iw*${factor}:ih*${factor}:flags=neighbor`);
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
      const audioSourceDur = Math.max(0.05, clip.duration * speed);
      const aChain: string[] = [
        `atrim=start=${clip.offset.toFixed(3)}:duration=${audioSourceDur.toFixed(3)}`,
        `asetpts=PTS-STARTPTS`,
      ];

      if (Math.abs(speed - 1) > 0.01) {
        aChain.push(...buildAtempoChain(speed));
      }

      const vol = clip.volume ?? 1;
      if (Math.abs(vol - 1) > 0.01) {
        aChain.push(`volume=${Math.max(0, Math.min(2, vol)).toFixed(2)}`);
      }

      const fadeIn = clip.fadeIn ?? 0;
      if (fadeIn > 0.01) {
        aChain.push(`afade=t=in:st=0:d=${Math.min(clip.duration / 2, fadeIn).toFixed(3)}`);
      }
      const fadeOut = clip.fadeOut ?? 0;
      if (fadeOut > 0.01) {
        const d = Math.min(clip.duration / 2, fadeOut);
        const st = Math.max(0, clip.duration - d);
        aChain.push(`afade=t=out:st=${st.toFixed(3)}:d=${d.toFixed(3)}`);
      }

      aChain.push(`adelay=${delayMs}|${delayMs}`);
      filterParts.push(`[${inputIdx}:a]${aChain.join(',')}[${audioLabel}]`);
      audioLabels.push(`[${audioLabel}]`);
    }
  }

  if (assFilePath && textClipsForAss.length > 0) {
    const nextLabel = `v${++videoStep}`;
    filterParts.push(
      `[${currentVideoLabel}]ass='${escapeFilterFilePath(assFilePath)}'[${nextLabel}]`
    );
    currentVideoLabel = nextLabel;
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
