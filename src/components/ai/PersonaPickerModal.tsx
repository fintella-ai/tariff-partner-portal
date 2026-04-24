"use client";

import Image from "next/image";
import { useState } from "react";
import { PERSONAS, type PersonaId } from "@/lib/ai-personas";

export default function PersonaPickerModal({
  open,
  onPick,
  onClose,
  title = "Pick your AI assistant",
  subtitle = "You can switch any time in Account Settings.",
  allowClose = true,
}: {
  open: boolean;
  onPick: (personaId: "finn" | "stella") => void | Promise<void>;
  onClose?: () => void;
  title?: string;
  subtitle?: string;
  allowClose?: boolean;
}) {
  const [submitting, setSubmitting] = useState<PersonaId | null>(null);

  if (!open) return null;

  async function handlePick(id: "finn" | "stella") {
    setSubmitting(id);
    try {
      await onPick(id);
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl bg-[var(--app-bg-secondary)] border border-[var(--app-border)] rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-5 pt-5 pb-3 border-b border-[var(--app-border)] flex items-start justify-between gap-3">
          <div>
            <div className="font-display text-lg font-bold text-[var(--app-text)] mb-1">{title}</div>
            <div className="font-body text-[12px] text-[var(--app-text-muted)]">{subtitle}</div>
          </div>
          {allowClose && onClose && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--app-text-muted)] hover:bg-[var(--app-input-bg)]"
            >
              ✕
            </button>
          )}
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(["finn", "stella"] as const).map((id) => {
            const persona = PERSONAS[id];
            const busy = submitting === id;
            return (
              <button
                key={id}
                onClick={() => handlePick(id)}
                disabled={!!submitting}
                className="group text-left bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-xl p-4 hover:border-[var(--app-accent,#c4a050)] transition-colors disabled:opacity-50 min-h-[44px]"
                style={{ borderColor: busy ? persona.accentHex : undefined }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <Image
                    src={persona.avatarSrc}
                    alt={persona.displayName}
                    width={48}
                    height={48}
                    className="rounded-full"
                  />
                  <div>
                    <div className="font-display text-base font-bold" style={{ color: persona.accentHex }}>
                      {persona.displayName}
                    </div>
                    <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider">
                      {persona.tagline}
                    </div>
                  </div>
                </div>
                <div className="font-body text-[12px] text-[var(--app-text-secondary)] leading-relaxed">
                  {persona.longDescription}
                </div>
                <div className="mt-3 font-body text-[11px] font-semibold" style={{ color: persona.accentHex }}>
                  {busy ? "Setting…" : `Pick ${persona.displayName} →`}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
