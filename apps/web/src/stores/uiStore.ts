import { create } from 'zustand';
import type {
  ClipAnimation,
  ClipEffect,
  TextStyle,
} from '@velocut/shared';

export type ExperienceMode = 'beginner' | 'pro';
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

function readInitialMode(): ExperienceMode {
  if (typeof window === 'undefined') return 'beginner';
  try {
    const saved = localStorage.getItem(EXPERIENCE_MODE_KEY);
    return saved === 'pro' ? 'pro' : 'beginner';
  } catch {
    return 'beginner';
  }
}

export interface UiState {
  experienceMode: ExperienceMode;
  safeGuideMode: SafeGuideMode;
  activeMediaCategory: MediaBinCategory;
  clipboardStyle: CopiedClipStyle | null;
  showExportModal: boolean;
  showHelpModal: boolean;
  setExperienceMode: (mode: ExperienceMode) => void;
  setSafeGuideMode: (mode: SafeGuideMode) => void;
  setActiveMediaCategory: (cat: MediaBinCategory) => void;
  setClipboardStyle: (style: CopiedClipStyle | null) => void;
  setShowExportModal: (open: boolean) => void;
  setShowHelpModal: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  experienceMode: readInitialMode(),
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

  setSafeGuideMode: (safeGuideMode) => set({ safeGuideMode }),
  setActiveMediaCategory: (activeMediaCategory) => set({ activeMediaCategory }),
  setClipboardStyle: (clipboardStyle) => set({ clipboardStyle }),
  setShowExportModal: (showExportModal) => set({ showExportModal }),
  setShowHelpModal: (showHelpModal) => set({ showHelpModal }),
}));
