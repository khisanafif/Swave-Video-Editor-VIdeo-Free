import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PwaInstallState {
  canInstall: boolean;
  isStandalone: boolean;
  isCapacitorNative: boolean;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

export function usePwaInstall(): PwaInstallState {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  const isCapacitorNative =
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkStandalone = () => {
      const mql = window.matchMedia?.('(display-mode: standalone)')?.matches;
      const iosStandalone = Boolean(
        (navigator as unknown as { standalone?: boolean }).standalone
      );
      setIsStandalone(Boolean(mql || iosStandalone || isCapacitorNative));
    };
    checkStandalone();

    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      void navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, [isCapacitorNative]);

  const promptInstall = async () => {
    if (!deferredPrompt) return 'unavailable' as const;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
    return outcome;
  };

  return {
    canInstall: Boolean(deferredPrompt) && !isStandalone,
    isStandalone,
    isCapacitorNative,
    promptInstall,
  };
}

