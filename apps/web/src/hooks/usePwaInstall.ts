import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PwaInstallState {
  canInstall: boolean;
  isStandalone: boolean;
  isCapacitorNative: boolean;
  isIos: boolean;
  isAndroid: boolean;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

function detectIosBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  // iPadOS desktop-mode Safari reports MacIntel with touch points
  return (
    navigator.platform === 'MacIntel' &&
    typeof navigator.maxTouchPoints === 'number' &&
    navigator.maxTouchPoints > 1
  );
}

function detectAndroidBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}

export function usePwaInstall(): PwaInstallState {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  const isCapacitorNative =
    typeof window !== 'undefined' &&
    Boolean(
      (
        window as unknown as {
          Capacitor?: { isNativePlatform?: () => boolean };
        }
      ).Capacitor?.isNativePlatform?.()
    );

  const isIos = detectIosBrowser();
  const isAndroid = detectAndroidBrowser();

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

    if (
      !isCapacitorNative &&
      'serviceWorker' in navigator &&
      import.meta.env.PROD &&
      window.location.protocol.startsWith('http')
    ) {
      const swUrl = `${import.meta.env.BASE_URL || './'}sw.js`;
      void navigator.serviceWorker.register(swUrl).catch(() => {});
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
    isIos,
    isAndroid,
    promptInstall,
  };
}
