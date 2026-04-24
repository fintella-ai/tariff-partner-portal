"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Admin editor for the 9-step Getting Started checklist text.
 *
 * Each step has a hardcoded default in src/lib/getting-started.ts — any
 * field left blank here falls back to the default on the partner-facing
 * page. Save flips PortalSettings.gettingStartedStepOverrides which the
 * library merges over defaults on every request.
 */

interface StepRow {
  id: string;
  defaultTitle: string;
  defaultDescription: string;
  title: string;
  description: string;
}

// Mirror of the hardcoded defaults in src/lib/getting-started.ts (as of
// the 9-step Phase 1 onboarding checklist). Shown as placeholder text +
// "Revert to default" buttons so admins know what they're overriding.
const DEFAULT_STEPS: Array<{ id: string; title: string; description: string }> = [
  { id: "sign_agreement", title: "Sign your Partnership Agreement", description: "Your partnership goes live the moment both signatures are on the document." },
  { id: "complete_profile", title: "Complete your profile", description: "Add your address so we can generate accurate tax forms and ship any rewards." },
  { id: "add_payout", title: "Add your payout info", description: "Bank, ACH, check, or PayPal. We can't pay you until this is set." },
  { id: "watch_video", title: "Watch the welcome video", description: "A two-minute tour of the portal and how referrals flow through Fintella." },
  { id: "join_call", title: "Join a Live Weekly call", description: "This is where you actually learn the product. Join one this week." },
  { id: "complete_training", title: "Complete a training module", description: "Pick any module in Partner Training to build your referral playbook." },
  { id: "share_link", title: "Share your referral link", description: "Your unique link tracks every client you send our way." },
  { id: "submit_client", title: "Submit your first client", description: "Use the Submit Client form whenever you're ready to send a warm lead over." },
  { id: "invite_downline", title: "Invite your first downline partner", description: "Earn override commissions on every deal your recruits close." },
];

export default function GettingStartedEditorPage() {
  const [rows, setRows] = useState<StepRow[]>(() =>
    DEFAULT_STEPS.map((d) => ({
      id: d.id,
      defaultTitle: d.title,
      defaultDescription: d.description,
      title: "",
      description: "",
    }))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "ok" | "err" } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/portal-settings/getting-started-steps");
      if (!res.ok) throw new Error("Failed to load");
      const data = (await res.json()) as {
        overrides?: Record<string, { title?: string; description?: string }>;
      };
      const overrides = data.overrides ?? {};
      setRows((prev) =>
        prev.map((r) => ({
          ...r,
          title: overrides[r.id]?.title ?? "",
          description: overrides[r.id]?.description ?? "",
        }))
      );
    } catch (e: any) {
      setMessage({ text: e?.message ?? "Failed to load", type: "err" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function updateRow(id: string, patch: Partial<StepRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    if (message) setMessage(null);
  }

  function revertRow(id: string) {
    updateRow(id, { title: "", description: "" });
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const overrides: Record<string, { title?: string; description?: string }> = {};
      for (const r of rows) {
        const t = r.title.trim();
        const d = r.description.trim();
        if (t || d) {
          overrides[r.id] = {};
          if (t) overrides[r.id].title = t;
          if (d) overrides[r.id].description = d;
        }
      }
      const res = await fetch(
        "/api/admin/portal-settings/getting-started-steps",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ overrides }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setMessage({ text: "Saved. Partners see the new text on next visit.", type: "ok" });
    } catch (e: any) {
      setMessage({ text: e?.message ?? "Save failed", type: "err" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="font-display text-[22px] font-bold mb-1.5">Getting Started — Step Text Editor</h2>
      <p className="font-body text-[13px] text-[var(--app-text-muted)] mb-5">
        Edit the title and description for each of the 9 onboarding checklist
        steps partners see on <code>/dashboard/getting-started</code>. Leave a
        field blank to use the hardcoded default. The CTA button labels and
        target routes stay hardcoded since they&apos;re tied to computed state.
      </p>

      {message && (
        <div
          className={`mb-4 rounded-lg px-3 py-2 font-body text-[12px] border ${
            message.type === "ok"
              ? "bg-green-500/10 border-green-500/30 text-green-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="font-body text-[13px] text-[var(--app-text-muted)] italic">Loading…</div>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => {
            const dirty = r.title.trim() !== "" || r.description.trim() !== "";
            return (
              <div key={r.id} className="card p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-0.5">
                      Step id
                    </div>
                    <div className="font-mono text-[13px] text-[var(--app-text)]">{r.id}</div>
                  </div>
                  {dirty && (
                    <button
                      type="button"
                      onClick={() => revertRow(r.id)}
                      className="font-body text-[11px] uppercase tracking-wider px-3 py-1.5 border border-[var(--app-border)] rounded-lg text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
                    >
                      Revert to default
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                      Title (blank = default)
                    </label>
                    <input
                      type="text"
                      value={r.title}
                      onChange={(e) => updateRow(r.id, { title: e.target.value })}
                      placeholder={r.defaultTitle}
                      className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none placeholder:text-[var(--app-text-muted)]/60"
                    />
                    <div className="mt-1 font-body text-[10px] text-[var(--app-text-muted)]">
                      Default: <span className="italic">{r.defaultTitle}</span>
                    </div>
                  </div>
                  <div>
                    <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                      Description (blank = default)
                    </label>
                    <textarea
                      rows={2}
                      value={r.description}
                      onChange={(e) => updateRow(r.id, { description: e.target.value })}
                      placeholder={r.defaultDescription}
                      className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none placeholder:text-[var(--app-text-muted)]/60"
                    />
                    <div className="mt-1 font-body text-[10px] text-[var(--app-text-muted)]">
                      Default: <span className="italic">{r.defaultDescription}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="sticky bottom-0 mt-6 pt-4 flex justify-end bg-[var(--app-bg)]">
        <button
          onClick={save}
          disabled={saving || loading}
          className="btn-gold font-body text-sm px-5 py-2.5 rounded-lg disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save overrides"}
        </button>
      </div>
    </div>
  );
}
