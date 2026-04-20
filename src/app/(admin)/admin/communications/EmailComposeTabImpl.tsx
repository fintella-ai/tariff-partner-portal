"use client";

import { useEffect, useState } from "react";

/**
 * One-shot handoff from Templates → Compose. Templates calls
 * `stashComposePrefill({subject, body})` before routing to the compose
 * view; this component consumes it on mount and clears the key so the
 * prefill only fires once. SessionStorage is used instead of URL params
 * to avoid truncating long bodies + keep the URL clean.
 */
const PREFILL_KEY = "comms.compose.prefill";

export function stashComposePrefill(prefill: { subject: string; body: string }) {
  try {
    sessionStorage.setItem(PREFILL_KEY, JSON.stringify(prefill));
  } catch {}
}

function consumeComposePrefill(): { subject: string; body: string } | null {
  try {
    const raw = sessionStorage.getItem(PREFILL_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PREFILL_KEY);
    const parsed = JSON.parse(raw);
    if (typeof parsed?.subject === "string" && typeof parsed?.body === "string") {
      return parsed;
    }
  } catch {}
  return null;
}

/**
 * Compose section of the Communications hub. Lets an admin write an
 * outbound email (stub send — the Send/Save-as-Draft buttons aren't yet
 * wired to the SendGrid pipeline, per the legacy bundle).
 */
export default function EmailComposeTabImpl() {
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [composeBcc, setComposeBcc] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [alsoSms, setAlsoSms] = useState(false);

  // Pick up a one-shot prefill from Templates "Use" button.
  useEffect(() => {
    const prefill = consumeComposePrefill();
    if (prefill) {
      setComposeSubject(prefill.subject);
      setComposeBody(prefill.body);
    }
  }, []);

  return (
    <div className="card p-6">
      <h3 className="font-display text-lg font-bold mb-4">New Email</h3>

      <div className="flex flex-col gap-4 font-body text-sm">
        {/* To */}
        <div>
          <label className="block text-[var(--app-text-muted)] text-xs mb-1">To</label>
          <input
            type="text"
            placeholder="Type partner name or email..."
            value={composeTo}
            onChange={(e) => setComposeTo(e.target.value)}
            className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50"
          />
        </div>

        {/* CC / BCC toggle */}
        <button
          onClick={() => setShowCcBcc(!showCcBcc)}
          className="text-xs text-brand-gold hover:text-brand-gold/80 transition self-start"
        >
          {showCcBcc ? "Hide CC/BCC" : "Show CC/BCC"}
        </button>

        {showCcBcc && (
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-[var(--app-text-muted)] text-xs mb-1">CC</label>
              <input
                type="text"
                placeholder="CC recipients..."
                value={composeCc}
                onChange={(e) => setComposeCc(e.target.value)}
                className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[var(--app-text-muted)] text-xs mb-1">BCC</label>
              <input
                type="text"
                placeholder="BCC recipients..."
                value={composeBcc}
                onChange={(e) => setComposeBcc(e.target.value)}
                className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50"
              />
            </div>
          </div>
        )}

        {/* Subject */}
        <div>
          <label className="block text-[var(--app-text-muted)] text-xs mb-1">Subject</label>
          <input
            type="text"
            placeholder="Email subject..."
            value={composeSubject}
            onChange={(e) => setComposeSubject(e.target.value)}
            className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50"
          />
        </div>

        {/* Body */}
        <div>
          <label className="block text-[var(--app-text-muted)] text-xs mb-1">Body</label>
          <textarea
            placeholder="Write your message..."
            value={composeBody}
            onChange={(e) => setComposeBody(e.target.value)}
            className="w-full min-h-[250px] bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50 resize-y"
          />
        </div>

        {/* Attachments */}
        <div>
          <label className="block text-[var(--app-text-muted)] text-xs mb-1">Attachments</label>
          <div className="w-full border-2 border-dashed border-[var(--app-border)] rounded-lg px-4 py-6 text-center text-[var(--app-text-muted)] hover:border-brand-gold/30 transition cursor-pointer">
            <svg
              className="mx-auto mb-2 w-8 h-8 text-[var(--app-text-faint)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"
              />
            </svg>
            <span className="text-xs">Click or drag files here to attach</span>
          </div>
        </div>

        {/* SMS checkbox */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={alsoSms}
            onChange={(e) => setAlsoSms(e.target.checked)}
            className="accent-brand-gold w-4 h-4"
          />
          <span className="text-[var(--app-text-secondary)] text-xs">
            Also send SMS notification (if partner opted in)
          </span>
        </label>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button className="px-6 py-2 rounded font-medium bg-brand-gold text-black hover:bg-brand-gold/90 transition">
            Send Email
          </button>
          <button className="px-6 py-2 rounded font-medium bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text-secondary)] border border-[var(--app-border)] transition">
            Save as Draft
          </button>
        </div>
      </div>
    </div>
  );
}
