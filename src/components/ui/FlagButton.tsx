// src/components/ui/FlagButton.tsx
"use client";
import { useState } from "react";

export default function FlagButton({ messageId, onFlagged }: { messageId: string; onFlagged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="font-body text-[10px] text-red-400/60 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        🚩 Flag
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setOpen(false)}>
          <div className="bg-[var(--app-bg-secondary)] border border-[var(--app-border)] rounded-xl p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="font-body font-semibold text-sm mb-2">Flag this message</div>
            <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-3">An admin will review. The sender will be restricted to 1 message / hour until the review completes.</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional)"
              rows={3}
              className="w-full bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-3 py-2 font-body text-[12px] mb-3"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setOpen(false)} className="font-body text-[12px] px-4 py-2 rounded-lg border border-[var(--app-border)]">Cancel</button>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await fetch(`/api/partner-dm/messages/${messageId}/flag`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ reason: reason || undefined }),
                    });
                    if (r.ok) { onFlagged?.(); setOpen(false); }
                    else { const d = await r.json(); alert(d.error || "Flag failed"); }
                  } finally { setBusy(false); }
                }}
                className="font-body text-[12px] px-4 py-2 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30"
              >
                {busy ? "..." : "Flag"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
