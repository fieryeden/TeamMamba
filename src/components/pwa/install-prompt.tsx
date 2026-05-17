"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "teammamba-install-dismissed-at";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return Boolean(navigatorWithStandalone.standalone) || window.matchMedia("(display-mode: standalone)").matches;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsInstalled(isStandaloneMode());

    const stored = window.localStorage.getItem(DISMISS_KEY);
    if (stored) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed)) setDismissedAt(parsed);
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const isDismissed = useMemo(() => {
    if (!dismissedAt) return false;
    return Date.now() - dismissedAt < DISMISS_MS;
  }, [dismissedAt]);

  const shouldShow = Boolean(deferredPrompt) && !isInstalled && !isDismissed;

  const dismiss = () => {
    const now = Date.now();
    window.localStorage.setItem(DISMISS_KEY, String(now));
    setDismissedAt(now);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "dismissed") {
      dismiss();
    }
    setDeferredPrompt(null);
  };

  if (!shouldShow) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-lg border bg-card px-4 py-3 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Install TeamMamba</p>
          <p className="text-xs text-muted-foreground">Add to Home Screen for a faster app-like experience.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="ghost" onClick={dismiss}>Dismiss</Button>
          <Button size="sm" className="bg-mamba-600 hover:bg-mamba-700" onClick={install}>
            Install
          </Button>
        </div>
      </div>
    </div>
  );
}
