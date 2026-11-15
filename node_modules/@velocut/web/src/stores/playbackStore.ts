import { create } from 'zustand';

export interface PlaybackState {
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  isLooping: boolean;
  togglePlay: () => void;
  setPlaying: (playing: boolean) => void;
  seekTo: (time: number) => void;
  setCurrentTime: (time: number) => void;
  stepTime: (deltaSeconds: number, maxDuration?: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleLoop: () => void;
  setPlaybackRate: (rate: number) => void;
}

export const usePlaybackStore = create<PlaybackState>((set) => ({
  currentTime: 0,
  isPlaying: false,
  playbackRate: 1,
  volume: 1,
  isMuted: false,
  isLooping: false,

  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setPlaying: (isPlaying) => set({ isPlaying }),
  seekTo: (time) => set({ currentTime: Math.max(0, time) }),
  setCurrentTime: (time) => set({ currentTime: Math.max(0, time) }),
  stepTime: (deltaSeconds, maxDuration) =>
    set((s) => {
      const next = Math.max(0, s.currentTime + deltaSeconds);
      return {
        currentTime:
          maxDuration !== undefined ? Math.min(maxDuration, next) : next,
      };
    }),
  setVolume: (volume) =>
    set({ volume: Math.max(0, Math.min(1, volume)) }),
  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
  toggleLoop: () => set((s) => ({ isLooping: !s.isLooping })),
  setPlaybackRate: (playbackRate) => set({ playbackRate }),
}));

