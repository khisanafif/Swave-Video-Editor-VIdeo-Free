export interface RuntimeCapabilities {
  isSecureContext: boolean;
  crossOriginIsolated: boolean;
  hasWebCodecs: boolean;
  hasWebGL2: boolean;
  hasOPFS: boolean;
  hasSharedArrayBuffer: boolean;
}

export function detectRuntimeCapabilities(): RuntimeCapabilities {
  const isSecureContext =
    typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false;
  const crossOriginIsolated =
    typeof window !== 'undefined' ? Boolean(window.crossOriginIsolated) : false;
  const hasWebCodecs =
    typeof window !== 'undefined' &&
    'VideoEncoder' in window &&
    'VideoDecoder' in window &&
    'VideoFrame' in window;

  let hasWebGL2 = false;
  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      hasWebGL2 = Boolean(canvas.getContext('webgl2'));
    } catch {
      hasWebGL2 = false;
    }
  }

  const hasOPFS =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.storage && typeof navigator.storage.getDirectory === 'function');

  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';

  return {
    isSecureContext,
    crossOriginIsolated,
    hasWebCodecs,
    hasWebGL2,
    hasOPFS,
    hasSharedArrayBuffer,
  };
}

