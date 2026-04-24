"use client";

import { useState, useEffect } from "react";

/**
 * Desktop-only exit-intent popup. Fires once per session when the cursor
 * leaves the top of the viewport (classic pattern — mobile doesn't fire,
 * touch devices don't have mouseleave). Stores dismissal in sessionStorage
 * so we don't re-fire on the same visit.
 */
export default function ExitIntentModal({
  title,
  body,
  cta,
  leadMagnetResourceId,
}: {
  title: string;
  body: string;
  cta: string;
  leadMagnetResourceId: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("fintella-exit-dismissed") === "1") return;

    let fired = false;
    const handler = (e: MouseEvent) => {
      if (fired) return;
      // Only trigger if cursor is leaving the top edge (most reliable exit signal)
      if (e.clientY <= 0 && e.relatedTarget === null) {
        fired = true;
        setOpen(true);
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mouseout", handler);
    }, 10_000); // don't fire in first 10s — user just arrived

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mouseout", handler);
    };
  }, []);

  function dismiss() {
    setOpen(false);
    sessionStorage.setItem("fintella-exit-dismissed", "1");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !email.includes("@")) {
      setError("Enter a valid email");
      return;
    }
    setSubmitting(true);
    try {
      // Reuses the existing /api/apply intake with a marker in audienceContext
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: "Exit-intent lead",
          lastName: email.split("@")[0] || "guest",
          email: email.trim(),
          audienceContext: `Captured via exit-intent lead magnet (resource: ${leadMagnetResourceId || "none"}). Only email provided — needs follow-up for full qualification.`,
          referralSource: "exit_intent_popup",
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        if (typeof window !== "undefined" && (window as any).dataLayer) {
          (window as any).dataLayer.push({ event: "exit_intent_capture", email });
        }
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Something went wrong — please try again.");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={dismiss}>
      <div
        className="max-w-md w-full rounded-2xl p-6 sm:p-8 relative"
        style={{ background: "var(--app-bg-secondary)", border: "1px solid var(--app-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 text-[var(--app-text-muted)] hover:text-[var(--app-text)] text-lg"
          aria-label="Close"
        >
          ✕
        </button>
        {submitted ? (
          <div className="text-center space-y-3 py-4">
            <div className="text-5xl">📨</div>
            <h3 className="font-display text-xl font-bold">Check your inbox</h3>
            <p className="text-sm text-[var(--app-text-muted)]">
              We'll email the Partner Playbook shortly. No spam — unsubscribe anytime.
            </p>
            <button onClick={dismiss} className="text-xs text-[var(--brand-gold)] font-semibold hover:underline">
              Continue browsing
            </button>
          </div>
        ) : (
          <>
            <div className="text-3xl mb-2">📚</div>
            <h3 className="font-display text-2xl font-bold mb-2">{title}</h3>
            <p className="text-sm text-[var(--app-text-muted)] mb-4">{body}</p>
            <form onSubmit={submit} className="space-y-3">
              {error && <div className="p-2 rounded-md bg-red-500/10 text-red-400 border border-red-500/20 text-xs">{error}</div>}
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full theme-input rounded-lg px-4 py-3"
                autoFocus
              />
              <button type="submit" disabled={submitting} className="btn-gold w-full disabled:opacity-60">
                {submitting ? "Sending…" : cta}
              </button>
            </form>
            <button onClick={dismiss} className="mt-3 text-xs text-[var(--app-text-muted)] hover:underline block mx-auto">
              No thanks, I'm just browsing
            </button>
          </>
        )}
      </div>
    </div>
  );
}
