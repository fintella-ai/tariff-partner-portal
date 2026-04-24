"use client";

import { useState, useEffect } from "react";

/**
 * Sticky bottom CTA bar — appears after the user scrolls past the hero
 * (roughly 600px down) on mobile + desktop. High-CRO element per the
 * research spec: converts scroll-fatigued visitors who've engaged but
 * haven't filled the primary form yet.
 */
export default function StickyCTA({ label }: { label: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 600);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-4 pt-3 border-t backdrop-blur-md"
      style={{
        background: "color-mix(in oklab, var(--app-bg) 85%, transparent)",
        borderColor: "var(--app-border)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0) + 1rem)",
      }}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
        <div className="text-sm font-semibold truncate">
          Ready to start earning? <span className="text-[var(--app-text-muted)] font-normal hidden sm:inline">Apply in under a minute.</span>
        </div>
        <a href="#apply" className="btn-gold whitespace-nowrap text-sm">
          {label}
        </a>
      </div>
    </div>
  );
}
