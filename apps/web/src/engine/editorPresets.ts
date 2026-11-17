import type {
  ClipAnimationType,
  ClipEffect,
  MediaAsset,
  TextStyle,
} from '@swave/shared';
import { encodeWavFromChannels } from './audioExtractor';
import { probeAndRegisterMediaFile } from './mediaProbe';

export interface FilterPresetItem {
  id: string;
  name: string;
  badgeColor: string;
  effects: ClipEffect[];
}

export const FILTER_PRESETS: FilterPresetItem[] = [
  {
    id: 'normal',
    name: 'Normal (Asli)',
    badgeColor: 'from-zinc-600 to-zinc-800',
    effects: [
      { type: 'brightness', value: 0 },
      { type: 'contrast', value: 1 },
      { type: 'saturation', value: 1 },
      { type: 'grayscale', value: 0 },
      { type: 'sepia', value: 0 },
      { type: 'vignette', value: 0 },
      { type: 'chromab', value: 0 },
      { type: 'blur', value: 0 },
      { type: 'pixelate', value: 0 },
    ],
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    badgeColor: 'from-cyan-500 to-fuchsia-600',
    effects: [
      { type: 'brightness', value: 0.04 },
      { type: 'contrast', value: 1.35 },
      { type: 'saturation', value: 1.55 },
      { type: 'grayscale', value: 0 },
      { type: 'sepia', value: 0 },
      { type: 'vignette', value: 0.35 },
      { type: 'chromab', value: 0.32 },
      { type: 'blur', value: 0 },
      { type: 'pixelate', value: 0 },
    ],
  },
  {
    id: 'teal-orange',
    name: 'Sinematik Teal',
    badgeColor: 'from-teal-500 to-orange-500',
    effects: [
      { type: 'brightness', value: -0.02 },
      { type: 'contrast', value: 1.28 },
      { type: 'saturation', value: 1.32 },
      { type: 'grayscale', value: 0 },
      { type: 'sepia', value: 0.12 },
      { type: 'vignette', value: 0.4 },
      { type: 'chromab', value: 0 },
      { type: 'blur', value: 0 },
      { type: 'pixelate', value: 0 },
    ],
  },
  {
    id: 'vintage',
    name: 'Vintage 90s',
    badgeColor: 'from-amber-600 to-yellow-800',
    effects: [
      { type: 'brightness', value: 0.05 },
      { type: 'contrast', value: 0.92 },
      { type: 'saturation', value: 0.78 },
      { type: 'grayscale', value: 0 },
      { type: 'sepia', value: 0.58 },
      { type: 'vignette', value: 0.45 },
      { type: 'chromab', value: 0.12 },
      { type: 'blur', value: 0 },
      { type: 'pixelate', value: 0 },
    ],
  },
  {
    id: 'noir',
    name: 'B&W Noir',
    badgeColor: 'from-zinc-300 to-zinc-950',
    effects: [
      { type: 'brightness', value: -0.04 },
      { type: 'contrast', value: 1.45 },
      { type: 'saturation', value: 0 },
      { type: 'grayscale', value: 1 },
      { type: 'sepia', value: 0 },
      { type: 'vignette', value: 0.55 },
      { type: 'chromab', value: 0 },
      { type: 'blur', value: 0 },
      { type: 'pixelate', value: 0 },
    ],
  },
  {
    id: 'warm',
    name: 'Golden Sunset',
    badgeColor: 'from-orange-400 to-rose-600',
    effects: [
      { type: 'brightness', value: 0.06 },
      { type: 'contrast', value: 1.12 },
      { type: 'saturation', value: 1.38 },
      { type: 'grayscale', value: 0 },
      { type: 'sepia', value: 0.28 },
      { type: 'vignette', value: 0.2 },
      { type: 'chromab', value: 0 },
      { type: 'blur', value: 0 },
      { type: 'pixelate', value: 0 },
    ],
  },
  {
    id: 'vivid',
    name: 'Vivid Social',
    badgeColor: 'from-emerald-400 to-sky-500',
    effects: [
      { type: 'brightness', value: 0.04 },
      { type: 'contrast', value: 1.22 },
      { type: 'saturation', value: 1.65 },
      { type: 'grayscale', value: 0 },
      { type: 'sepia', value: 0 },
      { type: 'vignette', value: 0.1 },
      { type: 'chromab', value: 0 },
      { type: 'blur', value: 0 },
      { type: 'pixelate', value: 0 },
    ],
  },
  {
    id: 'dreamy',
    name: 'Dreamy Soft',
    badgeColor: 'from-pink-400 to-violet-500',
    effects: [
      { type: 'brightness', value: 0.08 },
      { type: 'contrast', value: 0.95 },
      { type: 'saturation', value: 1.18 },
      { type: 'grayscale', value: 0 },
      { type: 'sepia', value: 0.08 },
      { type: 'vignette', value: 0.25 },
      { type: 'chromab', value: 0 },
      { type: 'blur', value: 0.35 },
      { type: 'pixelate', value: 0 },
    ],
  },
];

export interface TextPresetItem {
  id: string;
  label: string;
  sampleText: string;
  previewBg: string;
  style: Omit<TextStyle, 'content'>;
  defaultY: number;
  defaultAnimation: ClipAnimationType;
}

export const TEXT_PRESETS: TextPresetItem[] = [
  {
    id: 'bold-yellow',
    label: 'Subtitle Kuning Tebal',
    sampleText: 'SUBTITLE OTOMATIS JELAS',
    previewBg: 'bg-zinc-900 text-yellow-300 border-yellow-500/40',
    defaultY: 320,
    defaultAnimation: 'zoom-in',
    style: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 60,
      color: '#facc15',
      backgroundColor: 'transparent',
      align: 'center',
      bold: true,
      shadow: true,
      strokeColor: '#000000',
      strokeWidth: 10,
      presetId: 'bold-yellow',
    },
  },
  {
    id: 'karaoke-highlight',
    label: 'Karaoke Sorot Kata (Viral)',
    sampleText: 'SOROT PER KATA OTOMATIS',
    previewBg: 'bg-zinc-900 text-emerald-300 border-emerald-500/40',
    defaultY: 300,
    defaultAnimation: 'zoom-in',
    style: {
      fontFamily: 'Impact, Arial Black, sans-serif',
      fontSize: 64,
      color: '#ffffff',
      backgroundColor: 'transparent',
      align: 'center',
      bold: true,
      shadow: true,
      strokeColor: '#09090b',
      strokeWidth: 12,
      highlightColor: '#facc15',
      presetId: 'karaoke-highlight',
    },
  },
  {
    id: 'clean-subtitle',
    label: 'Subtitle Bersih (Video / Film)',
    sampleText: 'Subtitle rapi mudah dibaca',
    previewBg: 'bg-zinc-950 text-zinc-100 border-zinc-600',
    defaultY: 340,
    defaultAnimation: 'fade',
    style: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 48,
      color: '#ffffff',
      backgroundColor: 'rgba(9, 9, 11, 0.72)',
      align: 'center',
      bold: false,
      shadow: true,
      strokeColor: '#000000',
      strokeWidth: 4,
      presetId: 'clean-subtitle',
    },
  },
  {
    id: 'neon-cyber',
    label: 'Neon Cyber Glow',
    sampleText: 'SWAVE Video',
    previewBg: 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40',
    defaultY: 0,
    defaultAnimation: 'zoom-in',
    style: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 64,
      color: '#22d3ee',
      backgroundColor: 'rgba(9, 9, 11, 0.72)',
      align: 'center',
      bold: true,
      shadow: true,
      strokeColor: '#083344',
      strokeWidth: 4,
      presetId: 'neon-cyber',
    },
  },
  {
    id: 'breaking-news',
    label: 'Headline Merah',
    sampleText: 'HIGHLIGHT PENTING!',
    previewBg: 'bg-rose-950/70 text-white border-rose-500/40',
    defaultY: 280,
    defaultAnimation: 'slide-up',
    style: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 54,
      color: '#ffffff',
      backgroundColor: 'rgba(220, 38, 38, 0.92)',
      align: 'center',
      bold: true,
      shadow: true,
      strokeColor: '#000000',
      strokeWidth: 0,
      presetId: 'breaking-news',
    },
  },
  {
    id: 'vlog-clean',
    label: 'Vlog Minimalis Putih',
    sampleText: 'Day in My Life ✨',
    previewBg: 'bg-zinc-800 text-white border-zinc-600',
    defaultY: -260,
    defaultAnimation: 'fade',
    style: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 56,
      color: '#ffffff',
      backgroundColor: 'rgba(24, 24, 27, 0.6)',
      align: 'center',
      bold: true,
      shadow: true,
      strokeColor: '#000000',
      strokeWidth: 0,
      presetId: 'vlog-clean',
    },
  },
  {
    id: 'comic-pop',
    label: 'Komik Pop Tebal',
    sampleText: 'KEREN BANGET! 🔥',
    previewBg: 'bg-orange-950/60 text-orange-300 border-orange-500/40',
    defaultY: 0,
    defaultAnimation: 'spin',
    style: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 68,
      color: '#fb923c',
      backgroundColor: 'transparent',
      align: 'center',
      bold: true,
      shadow: true,
      strokeColor: '#09090b',
      strokeWidth: 12,
      presetId: 'comic-pop',
    },
  },
  {
    id: 'cinematic-gold',
    label: 'Sinematik Emas',
    sampleText: 'CHAPTER ONE',
    previewBg: 'bg-amber-950/50 text-amber-200 border-amber-500/40',
    defaultY: 0,
    defaultAnimation: 'fade',
    style: {
      fontFamily: 'Georgia, serif',
      fontSize: 60,
      color: '#fde68a',
      backgroundColor: 'transparent',
      align: 'center',
      bold: true,
      shadow: true,
      strokeColor: '#1c1917',
      strokeWidth: 5,
      presetId: 'cinematic-gold',
    },
  },
];

const LEGACY_PRESET_ALIASES: Record<string, string> = {
  'capcut-yellow': 'bold-yellow',
  'hormozi-karaoke': 'karaoke-highlight',
  'netflix-clean': 'clean-subtitle',
};

export function findTextPresetById(presetId: string): TextPresetItem {
  const mappedId = LEGACY_PRESET_ALIASES[presetId] || presetId;
  return TEXT_PRESETS.find((p) => p.id === mappedId) || TEXT_PRESETS[0];
}

export interface StickerPresetItem {
  id: string;
  emoji: string;
  label: string;
}

export const STICKER_PRESETS: StickerPresetItem[] = [
  { id: 'fire', emoji: '🔥', label: 'Api Hype' },
  { id: 'sparkle', emoji: '✨', label: 'Sparkle' },
  { id: 'like', emoji: '👍', label: 'Like' },
  { id: 'hundred', emoji: '💯', label: '100%' },
  { id: 'zap', emoji: '⚡', label: 'Kilat' },
  { id: 'heart', emoji: '❤️', label: 'Love' },
  { id: 'laugh', emoji: '😂', label: 'Ngakak' },
  { id: 'target', emoji: '🎯', label: 'Fokus' },
  { id: 'bell', emoji: '🔔', label: 'Subscribe' },
  { id: 'boom', emoji: '💥', label: 'Boom!' },
];

export const ANIMATION_PRESETS: Array<{
  id: ClipAnimationType;
  label: string;
}> = [
  { id: 'none', label: 'Tanpa' },
  { id: 'fade', label: 'Fade' },
  { id: 'zoom-in', label: 'Pop Zoom' },
  { id: 'slide-up', label: 'Slide Naik' },
  { id: 'slide-left', label: 'Slide Kiri' },
  { id: 'spin', label: 'Spin Pop' },
];

export const CANVAS_BG_PRESETS: Array<{
  id: string;
  label: string;
  color: string;
}> = [
  { id: '#09090b', label: 'Hitam Studio', color: '#09090b' },
  { id: '#0f172a', label: 'Midnight Navy', color: '#0f172a' },
  { id: '#164e63', label: 'Cyber Teal', color: '#164e63' },
  { id: '#3b0764', label: 'Neon Purple', color: '#3b0764' },
  { id: '#450a0a', label: 'Crimson Dark', color: '#450a0a' },
  { id: '#f8fafc', label: 'Putih Bersih', color: '#f8fafc' },
];

export type SfxPresetId =
  | 'whoosh'
  | 'boom'
  | 'ding'
  | 'glitch'
  | 'riser'
  | 'lofi-beat'
  | 'synthwave';

export interface SfxPresetItem {
  id: SfxPresetId;
  name: string;
  category: 'sfx' | 'bgm';
  durationLabel: string;
}

export const SFX_PRESETS: SfxPresetItem[] = [
  { id: 'whoosh', name: 'Whoosh Transisi Cepat', category: 'sfx', durationLabel: '0.8s' },
  { id: 'boom', name: 'Cinematic Bass Boom', category: 'sfx', durationLabel: '1.4s' },
  { id: 'ding', name: 'Pop / Ding Notifikasi', category: 'sfx', durationLabel: '0.6s' },
  { id: 'glitch', name: 'Cyber Glitch Stutter', category: 'sfx', durationLabel: '0.9s' },
  { id: 'riser', name: 'Suspense Riser Sweep', category: 'sfx', durationLabel: '1.8s' },
  { id: 'lofi-beat', name: 'BGM Lo-Fi Chill Groove', category: 'bgm', durationLabel: '6.0s' },
  { id: 'synthwave', name: 'BGM Upbeat Synthwave', category: 'bgm', durationLabel: '6.0s' },
];

export async function synthesizeAudioAsset(
  presetId: SfxPresetId
): Promise<MediaAsset> {
  const sampleRate = 44100;
  let durationSec = 1.0;

  if (presetId === 'whoosh') durationSec = 0.8;
  else if (presetId === 'boom') durationSec = 1.4;
  else if (presetId === 'ding') durationSec = 0.6;
  else if (presetId === 'glitch') durationSec = 0.9;
  else if (presetId === 'riser') durationSec = 1.8;
  else durationSec = 6.0;

  const totalSamples = Math.floor(sampleRate * durationSec);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const norm = t / durationSec;
    let valL = 0;
    let valR = 0;

    if (presetId === 'whoosh') {
      const env = Math.sin(Math.PI * norm) ** 2;
      const freq = 140 + 620 * Math.sin(Math.PI * norm);
      const noise = (Math.random() * 2 - 1) * 0.45;
      const tone = Math.sin(2 * Math.PI * freq * t) * 0.4;
      valL = (noise + tone) * env * (1 - norm * 0.3);
      valR = (noise * 0.9 + tone) * env * (0.7 + norm * 0.3);
    } else if (presetId === 'boom') {
      const env = Math.exp(-3.2 * t);
      const freq = 110 * Math.exp(-2.2 * t) + 38;
      const sub = Math.sin(2 * Math.PI * freq * t);
      const punch = t < 0.08 ? (Math.random() * 2 - 1) * 0.35 * (1 - t / 0.08) : 0;
      valL = (sub * 0.85 + punch) * env;
      valR = (sub * 0.85 - punch * 0.5) * env;
    } else if (presetId === 'ding') {
      const env = Math.exp(-6.5 * t);
      valL =
        (Math.sin(2 * Math.PI * 1046.5 * t) * 0.55 +
          Math.sin(2 * Math.PI * 2093 * t) * 0.3) *
        env;
      valR = valL * 0.95;
    } else if (presetId === 'glitch') {
      const step = Math.floor(t * 28);
      const gate = step % 3 === 0 ? 0.1 : 0.85;
      const baseFreq = 180 + ((step * 137) % 720);
      const sq = Math.sin(2 * Math.PI * baseFreq * t) >= 0 ? 0.5 : -0.5;
      valL = sq * gate;
      valR = -sq * gate * 0.85;
    } else if (presetId === 'riser') {
      const env = norm ** 2 * (1 - Math.max(0, (norm - 0.92) / 0.08));
      const freq = 120 + 980 * (norm ** 2.4);
      valL =
        (Math.sin(2 * Math.PI * freq * t) * 0.55 +
          (Math.random() * 2 - 1) * 0.25) *
        env;
      valR = valL;
    } else if (presetId === 'lofi-beat') {
      const bpm = 85;
      const beatLen = 60 / bpm;
      const beatPos = (t % beatLen) / beatLen;
      const kick =
        beatPos < 0.18
          ? Math.sin(2 * Math.PI * (75 * Math.exp(-12 * beatPos) + 42) * t) *
            Math.exp(-9 * beatPos) *
            0.55
          : 0;
      const chordFreqs = t < 3 ? [261.63, 329.63, 392.0, 493.88] : [220.0, 261.63, 329.63, 392.0];
      let chord = 0;
      for (const cf of chordFreqs) {
        chord += Math.sin(2 * Math.PI * cf * t) * 0.11;
      }
      valL = kick + chord;
      valR = kick + chord * 0.92;
    } else {
      const arpNotes = [220, 261.63, 329.63, 440, 329.63, 261.63];
      const stepIdx = Math.floor(t * 8) % arpNotes.length;
      const notePos = (t * 8) % 1;
      const noteFreq = arpNotes[stepIdx];
      const env = Math.exp(-3.5 * notePos);
      const lead = Math.sin(2 * Math.PI * noteFreq * t) * 0.35 * env;
      const bass = Math.sin(2 * Math.PI * 110 * t) * 0.3;
      valL = lead + bass;
      valR = lead * 0.85 + bass;
    }

    left[i] = valL;
    right[i] = valR;
  }

  const wavBlob = encodeWavFromChannels([left, right], sampleRate);
  return probeAndRegisterMediaFile(
    wavBlob,
    `swave_${presetId}.wav`,
    'audio/wav'
  );
}
