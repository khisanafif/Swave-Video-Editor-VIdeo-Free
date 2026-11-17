import { create } from 'zustand';
import type {
  ClipAnimation,
  ClipEffect,
  TextStyle,
} from '@velocut/shared';

export type ExperienceMode = 'beginner' | 'pro';
export type StudioRuntimeMode = 'standalone' | 'server';
export type SafeGuideMode = 'none' | 'thirds' | 'tiktok' | 'youtube';
export type MediaBinCategory =
  | 'media'
  | 'subtitle'
  | 'audio'
  | 'text'
  | 'sticker'
  | 'effects';

export interface CopiedClipStyle {
  filterPreset?: string;
  effects?: ClipEffect[];
  animation?: ClipAnimation;
  textStyle?: Omit<TextStyle, 'content'>;
}

const EXPERIENCE_MODE_KEY = 'velocut_experience_mode';
const RUNTIME_MODE_KEY = 'velocut_runtime_mode';
const RUNTIME_MODE_EXPLICIT_KEY = 'velocut_runtime_mode_explicit';

function readInitialMode(): ExperienceMode {
  if (typeof window === 'undefined') return 'beginner';
  try {
    const saved = localStorage.getItem(EXPERIENCE_MODE_KEY);
    return saved === 'pro' ? 'pro' : 'beginner';
  } catch {
    return 'beginner';
  }
}

export function isStaticStandaloneHost(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  if (win.Capacitor?.isNativePlatform?.()) return true;
  if (import.meta.env.VITE_STANDALONE_BUILD === 'true') return true;
  const proto = window.location?.protocol || '';
  const host = window.location?.hostname || '';
  return proto === 'file:' || proto === 'capacitor:' || host.endsWith('github.io');
}

export function hasExplicitRuntimePreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(RUNTIME_MODE_EXPLICIT_KEY) === '1';
  } catch {
    return false;
  }
}

function readInitialRuntimeMode(): StudioRuntimeMode {
  if (typeof window === 'undefined') return 'standalone';
  try {
    const saved = localStorage.getItem(RUNTIME_MODE_KEY);
    if (saved === 'server' || saved === 'standalone') {
      return saved;
    }
  } catch {
    // Ignore storage error
  }
  return 'standalone';
}

export interface UiState {
  experienceMode: ExperienceMode;
  runtimeMode: StudioRuntimeMode;
  safeGuideMode: SafeGuideMode;
  activeMediaCategory: MediaBinCategory;
  clipboardStyle: CopiedClipStyle | null;
  showExportModal: boolean;
  showHelpModal: boolean;
  setExperienceMode: (mode: ExperienceMode) => void;
  setRuntimeMode: (mode: StudioRuntimeMode, explicit?: boolean) => void;
  setSafeGuideMode: (mode: SafeGuideMode) => void;
  setActiveMediaCategory: (cat: MediaBinCategory) => void;
  setClipboardStyle: (style: CopiedClipStyle | null) => void;
  setShowExportModal: (open: boolean) => void;
  setShowHelpModal: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  experienceMode: readInitialMode(),
  runtimeMode: readInitialRuntimeMode(),
  safeGuideMode: 'none',
  activeMediaCategory: 'media',
  clipboardStyle: null,
  showExportModal: false,
  showHelpModal: false,

  setExperienceMode: (mode) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(EXPERIENCE_MODE_KEY, mode);
      } catch {
        // Ignore
      }
    }
    set({ experienceMode: mode });
  },

  setRuntimeMode: (runtimeMode, explicit = false) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(RUNTIME_MODE_KEY, runtimeMode);
        if (explicit) {
          localStorage.setItem(RUNTIME_MODE_EXPLICIT_KEY, '1');
        }
      } catch {
        // Ignore
      }
    }
    set({ runtimeMode });
  },

  setSafeGuideMode: (safeGuideMode) => set({ safeGuideMode }),
  setActiveMediaCategory: (activeMediaCategory) => set({ activeMediaCategory }),
  setClipboardStyle: (clipboardStyle) => set({ clipboardStyle }),
  setShowExportModal: (showExportModal) => set({ showExportModal }),
  setShowHelpModal: (showHelpModal) => set({ showHelpModal }),
}));
