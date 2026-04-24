"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "fintella_app_banner_dismissed";

export default function FintellaAppBanner() {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [installed, setInstalled] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");

    const ua = navigator.userAgent;
    setIsMobile(/iPad|iPhone|iPod|Android/.test(ua));

    const mql = window.matchMedia("(display-mode: standalone)");
    const standalone = mql.matches || (window.navigator as any).standalone === true;
    setInstalled(standalone);

    const onChange = () => setInstalled(mql.matches);
    mql.addEventListener?.("change", onChange);

    setMounted(true);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);

  if (!mounted || dismissed || installed) return null;

  const label = isMobile ? "Add the Fintella Mobile App!" : "Add the Fintella Desktop App!";

  return (
    <>
      {/* Scoped flashing keyframe — lives with the component so it's not
          loaded on pages that don't show the banner. */}
      <style>{`
        @keyframes fintella-banner-flash {
          0%, 100% { background-color: #c4a050; box-shadow: 0 0 0 rgba(196,160,80,0); }
          50%      { background-color: #e8c060; box-shadow: 0 0 18px rgba(232,192,96,0.55); }
        }
        .fintella-banner {
          animation: fintella-banner-flash 1.6s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .fintella-banner { animation: none; background-color: #c4a050; }
        }
      `}</style>
      <div
        className="fintella-banner sticky top-0 z-[900] w-full flex items-center justify-center gap-3 px-3 py-2 text-black font-body text-[13px] sm:text-sm font-semibold"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
      >
        <a
          href="/docs/install-app"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 text-center hover:underline underline-offset-2 decoration-black/40"
          title="Open installation instructions"
        >
          📲 {label} <span className="font-normal opacity-80">Tap for instructions →</span>
        </a>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, "1");
            setDismissed(true);
          }}
          aria-label="Dismiss install banner"
          title="Dismiss"
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/15 transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </>
  );
}
