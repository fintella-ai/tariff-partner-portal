"use client";

import { useState, useEffect, useCallback } from "react";

const DISMISS_KEY = "fintella_pwa_install_dismissed";
const REAPPEAR_DAYS = 7;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isDismissed, setIsDismissed] = useState(true); // default true to avoid flash
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isSafari, setIsSafari] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Detect platform
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua));
    setIsAndroid(/Android/.test(ua));
    // Safari detection: Safari UA but NOT Chrome/CriOS/Firefox/FxiOS
    setIsSafari(/Safari/.test(ua) && !/Chrome|CriOS|Firefox|FxiOS|Edg/.test(ua));

    // Detect standalone mode (already installed)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setIsInstalled(isStandalone);

    // Check dismissal with reappearance logic
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10);
      const reappearMs = REAPPEAR_DAYS * 24 * 60 * 60 * 1000;
      setIsDismissed(elapsed < reappearMs);
    } else {
      setIsDismissed(false);
    }

    // Listen for beforeinstallprompt (Android Chrome)
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setIsDismissed(true);
  }, []);

  return {
    isInstalled,
    isIOS,
    isAndroid,
    isSafari,
    canPromptNatively: !!deferredPrompt,
    promptInstall,
    isDismissed,
    dismiss,
    shouldShow: !isInstalled && !isDismissed,
  };
}
