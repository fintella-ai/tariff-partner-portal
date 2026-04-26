"use client";

import { useState } from "react";

const AVATARS = [
  { id: "79fa6fd1cf184ad0b311a2018f0b2be9", label: "Finn" },
  { id: "e07f0ceae9d8411fa101c1a0d0342aa0", label: "Stella" },
  { id: "e5bbc883bef84935a353cecdec0fb997", label: "Avatar 1" },
  { id: "83e7064aac6e4899853d3d04cb5794cc", label: "Avatar 2" },
  { id: "0396d7a22e7b4e58807fc047a58c4ab3", label: "Avatar 3" },
];

export type VideoMode = "avatar" | "slides";

export interface HeyGenOptions {
  mode: VideoMode;
  avatarId?: string;
}

interface Props {
  title: string;
  onConfirm: (opts: HeyGenOptions) => void;
  onCancel: () => void;
}

export default function HeyGenOptionsModal({ title, onConfirm, onCancel }: Props) {
  const [mode, setMode] = useState<VideoMode>("avatar");
  const [avatarId, setAvatarId] = useState(AVATARS[0].id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative rounded-xl shadow-2xl p-5 w-full max-w-sm"
        style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-[16px] font-bold mb-1">Generate Video</h3>
        <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-4">
          {title}
        </p>

        <div className="space-y-3">
          <div>
            <label className="font-body text-[11px] text-[var(--app-text-secondary)] font-medium block mb-1">
              Video Type
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("avatar")}
                className={`flex-1 font-body text-[12px] px-3 py-2 rounded-lg border transition-colors ${
                  mode === "avatar"
                    ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                    : "border-[var(--app-border)] text-[var(--app-text-muted)] hover:border-[var(--app-text-secondary)]"
                }`}
              >
                🎭 AI Avatar
              </button>
              <button
                type="button"
                onClick={() => setMode("slides")}
                className={`flex-1 font-body text-[12px] px-3 py-2 rounded-lg border transition-colors ${
                  mode === "slides"
                    ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                    : "border-[var(--app-border)] text-[var(--app-text-muted)] hover:border-[var(--app-text-secondary)]"
                }`}
              >
                📊 Video Slides
              </button>
            </div>
          </div>

          {mode === "avatar" && (
            <div>
              <label className="font-body text-[11px] text-[var(--app-text-secondary)] font-medium block mb-1">
                Choose Avatar
              </label>
              <div className="flex gap-2">
                {AVATARS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAvatarId(a.id)}
                    className={`flex-1 font-body text-[12px] px-3 py-2 rounded-lg border transition-colors ${
                      avatarId === a.id
                        ? "bg-brand-gold/20 border-brand-gold/40 text-brand-gold"
                        : "border-[var(--app-border)] text-[var(--app-text-muted)] hover:border-[var(--app-text-secondary)]"
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <p className="font-body text-[9px] text-[var(--app-text-muted)] mt-1">
                ID: {avatarId.slice(0, 8)}...
              </p>
            </div>
          )}

          {mode === "slides" && (
            <p className="font-body text-[11px] text-[var(--app-text-muted)]">
              Generates narrated slides with text and transitions — no avatar. Faster and lower cost.
            </p>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 font-body text-[12px] px-3 py-2 rounded-lg border border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ mode, avatarId: mode === "avatar" ? avatarId : undefined })}
            className="flex-1 font-body text-[12px] px-3 py-2 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition-colors font-medium"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}
