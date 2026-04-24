"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Getting Started Builder (2026-04-24 expansion).
 *
 * Full admin control over the partner onboarding checklist:
 *   - Override title / description / CTA label / CTA URL / icon for each
 *     built-in step
 *   - Hide any built-in step
 *   - Reorder steps (up/down controls; drag support can layer on later)
 *   - Add / remove custom steps (admin-authored entries that sit
 *     alongside the built-ins)
 *   - Edit the expectations markdown shown at the top of the partner page
 *
 * Preview link opens /dashboard/getting-started in a new tab so admins can
 * see the change live after saving.
 */

const BUILT_IN_DEFAULTS: Array<{
  id: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaUrl: string;
  icon: string;
  note: string;
}> = [
  { id: "sign_agreement", title: "Sign your Partnership Agreement", description: "Your partnership goes live the moment both signatures are on the document.", ctaLabel: "Sign now", ctaUrl: "/dashboard/deals", icon: "📝", note: "CTA URL is computed from agreement state; your override applies only when the computed URL falls back." },
  { id: "complete_profile", title: "Complete your profile", description: "Add your address so we can generate accurate tax forms and ship any rewards.", ctaLabel: "Finish profile", ctaUrl: "/dashboard/settings?tab=address", icon: "👤", note: "" },
  { id: "add_payout", title: "Add your payout info", description: "Bank, ACH, check, or PayPal. We can't pay you until this is set.", ctaLabel: "Add payout info", ctaUrl: "/dashboard/settings?tab=payout", icon: "💸", note: "" },
  { id: "watch_video", title: "Watch the welcome video", description: "A two-minute tour of the portal and how referrals flow through Fintella.", ctaLabel: "Watch now", ctaUrl: "/dashboard/home", icon: "🎬", note: "" },
  { id: "join_call", title: "Join a Live Weekly call", description: "This is where you actually learn the product. Join one this week.", ctaLabel: "Join this week", ctaUrl: "/dashboard/conference", icon: "📹", note: "" },
  { id: "complete_training", title: "Complete a training module", description: "Pick any module in Partner Training to build your referral playbook.", ctaLabel: "Start training", ctaUrl: "/dashboard/training", icon: "📖", note: "" },
  { id: "share_link", title: "Share your referral link", description: "Your unique link tracks every client you send our way.", ctaLabel: "Copy your link", ctaUrl: "/dashboard/referral-links", icon: "🔗", note: "" },
  { id: "submit_client", title: "Submit your first client", description: "Use the Submit Client form whenever you're ready to send a warm lead over.", ctaLabel: "Submit a client", ctaUrl: "/dashboard/submit-client", icon: "✉️", note: "" },
  { id: "invite_downline", title: "Invite your first downline partner", description: "Earn override commissions on every deal your recruits close.", ctaLabel: "Invite a partner", ctaUrl: "/dashboard/referral-links", icon: "👥", note: "" },
];

interface StepOverride {
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  icon?: string;
  hidden?: boolean;
  order?: number;
}

interface CustomStep {
  id: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaUrl: string;
  icon?: string;
  doneWhen?: "never" | "manual";
  order?: number;
}

type OverridesMap = Record<string, StepOverride>;

export default function GettingStartedEditorPage() {
  const [overrides, setOverrides] = useState<OverridesMap>({});
  const [customSteps, setCustomSteps] = useState<CustomStep[]>([]);
  const [expectations, setExpectations] = useState<string>("");
  const [order, setOrder] = useState<string[]>(
    BUILT_IN_DEFAULTS.map((s) => s.id)
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/portal-settings/getting-started-steps");
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      const data = (await res.json()) as {
        overrides?: OverridesMap;
        customSteps?: CustomStep[];
        expectations?: string;
      };
      setOverrides(data.overrides ?? {});
      setCustomSteps(Array.isArray(data.customSteps) ? data.customSteps : []);
      setExpectations(data.expectations ?? "");
      // Derive display order: built-ins first (in their declared order,
      // adjusted by override.order if present), then customs (by their
      // order field, ties by declaration).
      const allIds = [
        ...BUILT_IN_DEFAULTS.map((s) => s.id),
        ...(Array.isArray(data.customSteps) ? data.customSteps.map((c) => c.id) : []),
      ];
      const explicit = new Map<string, number>();
      allIds.forEach((id, i) => explicit.set(id, i));
      for (const [id, o] of Object.entries(data.overrides ?? {})) {
        if (typeof o?.order === "number") explicit.set(id, o.order);
      }
      if (Array.isArray(data.customSteps)) {
        for (const c of data.customSteps) {
          if (typeof c.order === "number") explicit.set(c.id, c.order);
        }
      }
      allIds.sort((a, b) => (explicit.get(a) ?? 999) - (explicit.get(b) ?? 999));
      setOrder(allIds);
    } catch (e: any) {
      setBanner({ tone: "err", msg: e?.message ?? "Load failed" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function flash(tone: "ok" | "err", msg: string) {
    setBanner({ tone, msg });
    setTimeout(() => setBanner(null), 3000);
  }

  function updateOverride(id: string, patch: Partial<StepOverride>) {
    setOverrides((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? {}), ...patch },
    }));
  }

  function clearOverride(id: string, field: keyof StepOverride) {
    setOverrides((prev) => {
      const next = { ...prev };
      const current = { ...(next[id] ?? {}) };
      delete current[field];
      if (Object.keys(current).length === 0) {
        delete next[id];
      } else {
        next[id] = current;
      }
      return next;
    });
  }

  function moveStep(index: number, delta: number) {
    setOrder((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      // Persist via per-step `order` override (monotonic index)
      setOverrides((o) => {
        const copy = { ...o };
        next.forEach((id, i) => {
          copy[id] = { ...(copy[id] ?? {}), order: i };
        });
        return copy;
      });
      setCustomSteps((cs) =>
        cs.map((c) => ({ ...c, order: next.indexOf(c.id) }))
      );
      return next;
    });
  }

  function addCustomStep() {
    const slug = `custom_${Math.random().toString(36).slice(2, 8)}`;
    const newStep: CustomStep = {
      id: slug,
      title: "New custom step",
      description: "Describe what partners should do here.",
      ctaLabel: "Open",
      ctaUrl: "/dashboard",
      icon: "⭐",
      doneWhen: "manual",
      order: order.length,
    };
    setCustomSteps((prev) => [...prev, newStep]);
    setOrder((prev) => [...prev, slug]);
  }

  function updateCustomStep(id: string, patch: Partial<CustomStep>) {
    setCustomSteps((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  }

  function removeCustomStep(id: string) {
    if (!confirm("Remove this custom step? Partner progress on it will be lost.")) return;
    setCustomSteps((prev) => prev.filter((c) => c.id !== id));
    setOrder((prev) => prev.filter((x) => x !== id));
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/portal-settings/getting-started-steps", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overrides,
          customSteps,
          expectations,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      flash("ok", "Saved. Partners see the new state on their next visit.");
    } catch (e: any) {
      flash("err", e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // Build the merged step list in display order.
  const displaySteps = order.map((id) => {
    const builtIn = BUILT_IN_DEFAULTS.find((s) => s.id === id);
    if (builtIn) {
      const o = overrides[id];
      return {
        kind: "built-in" as const,
        id,
        defaults: builtIn,
        override: o ?? {},
      };
    }
    const custom = customSteps.find((c) => c.id === id);
    if (custom) {
      return {
        kind: "custom" as const,
        id,
        custom,
      };
    }
    return null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <div className="pb-24">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
        <div>
          <h2 className="font-display text-[22px] font-bold">
            Getting Started — Builder
          </h2>
          <p className="font-body text-[13px] text-[var(--app-text-muted)] mt-1 max-w-3xl">
            Full control over the onboarding checklist shown to new partners at{" "}
            <code>/dashboard/getting-started</code>. Edit text, CTA, icon per
            step. Hide steps that don&apos;t apply. Reorder with the arrows.
            Add custom steps for promos / community onboarding / anything.
          </p>
        </div>
        <a
          href="/dashboard/getting-started"
          target="_blank"
          rel="noreferrer"
          className="shrink-0 font-body text-[12px] border border-[var(--app-border)] rounded-md px-3 py-2 hover:border-brand-gold/40"
        >
          Open partner preview ↗
        </a>
      </div>

      {banner && (
        <div
          className={`mb-4 rounded-lg px-3 py-2 font-body text-[12px] border ${
            banner.tone === "ok"
              ? "bg-green-500/10 border-green-500/30 text-green-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}
        >
          {banner.msg}
        </div>
      )}

      {loading ? (
        <div className="font-body text-[13px] text-[var(--app-text-muted)] italic">
          Loading…
        </div>
      ) : (
        <div className="space-y-6">
          {/* Expectations editor */}
          <section className="card p-4 sm:p-5">
            <h3 className="font-display text-[15px] font-semibold mb-2">
              Expectations block
            </h3>
            <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-3">
              Markdown shown at the top of the partner Getting-Started page.
              Use headers, bullets, bold. Leave empty to use the hardcoded
              default (see lib/getting-started.ts).
            </p>
            <textarea
              value={expectations}
              onChange={(e) => setExpectations(e.target.value)}
              placeholder="Leave empty to use the hardcoded default…"
              rows={8}
              className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-mono text-[12px] focus:border-brand-gold/50 focus:outline-none"
            />
            <div className="mt-1 font-body text-[10px] text-[var(--app-text-muted)]">
              {expectations.length} / 8000 chars
            </div>
          </section>

          {/* Steps */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-[15px] font-semibold">
                Checklist steps ({displaySteps.length})
              </h3>
              <button
                type="button"
                onClick={addCustomStep}
                className="font-body text-[12px] border border-brand-gold/40 text-brand-gold rounded-md px-3 py-1.5 hover:bg-brand-gold/10"
              >
                + Add custom step
              </button>
            </div>

            <div className="space-y-3">
              {displaySteps.map((item, i) => {
                if (item.kind === "built-in") {
                  const o = item.override;
                  const hidden = o.hidden === true;
                  return (
                    <BuiltInStepCard
                      key={item.id}
                      index={i}
                      total={displaySteps.length}
                      defaults={item.defaults}
                      override={o}
                      hidden={hidden}
                      onMoveUp={() => moveStep(i, -1)}
                      onMoveDown={() => moveStep(i, 1)}
                      onChange={(patch) => updateOverride(item.id, patch)}
                      onClear={(field) => clearOverride(item.id, field)}
                      onToggleHidden={() =>
                        updateOverride(item.id, { hidden: !hidden })
                      }
                    />
                  );
                }
                return (
                  <CustomStepCard
                    key={item.id}
                    index={i}
                    total={displaySteps.length}
                    step={item.custom}
                    onMoveUp={() => moveStep(i, -1)}
                    onMoveDown={() => moveStep(i, 1)}
                    onChange={(patch) => updateCustomStep(item.id, patch)}
                    onRemove={() => removeCustomStep(item.id)}
                  />
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-[var(--app-border)] bg-[var(--app-bg)] px-4 py-3 flex justify-end">
        <button
          onClick={save}
          disabled={saving || loading}
          className="btn-gold font-body text-sm px-5 py-2.5 rounded-lg disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save all changes"}
        </button>
      </div>
    </div>
  );
}

// ─── BUILT-IN STEP CARD ────────────────────────────────────────────────────

function BuiltInStepCard({
  index,
  total,
  defaults,
  override,
  hidden,
  onMoveUp,
  onMoveDown,
  onChange,
  onClear,
  onToggleHidden,
}: {
  index: number;
  total: number;
  defaults: (typeof BUILT_IN_DEFAULTS)[number];
  override: StepOverride;
  hidden: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onChange: (patch: Partial<StepOverride>) => void;
  onClear: (field: keyof StepOverride) => void;
  onToggleHidden: () => void;
}) {
  return (
    <div
      className={`card p-4 sm:p-5 ${
        hidden ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-start gap-3 mb-3">
        <ReorderHandle
          index={index}
          total={total}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-body text-[10px] uppercase tracking-wider text-[var(--app-text-muted)]">
              Built-in step
            </span>
            <code className="font-mono text-[11px] text-[var(--app-text)]">
              {defaults.id}
            </code>
            {hidden && (
              <span className="font-body text-[10px] px-2 py-0.5 bg-red-500/10 text-red-500 border border-red-500/30 rounded">
                HIDDEN
              </span>
            )}
          </div>
          {defaults.note && (
            <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-1">
              ⚠ {defaults.note}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onToggleHidden}
          className={`shrink-0 font-body text-[11px] px-3 py-1.5 border rounded-md ${
            hidden
              ? "border-brand-gold/40 text-brand-gold hover:bg-brand-gold/10"
              : "border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-red-500 hover:border-red-500/30"
          }`}
        >
          {hidden ? "Unhide" : "Hide"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <LabeledInput
          className="sm:col-span-2"
          label="Icon"
          placeholder={defaults.icon}
          value={override.icon ?? ""}
          onChange={(v) => (v ? onChange({ icon: v }) : onClear("icon"))}
          mono
        />
        <LabeledInput
          className="sm:col-span-10"
          label="Title"
          placeholder={defaults.title}
          value={override.title ?? ""}
          onChange={(v) => (v ? onChange({ title: v }) : onClear("title"))}
        />
        <LabeledTextarea
          className="sm:col-span-12"
          label="Description"
          placeholder={defaults.description}
          value={override.description ?? ""}
          onChange={(v) =>
            v ? onChange({ description: v }) : onClear("description")
          }
        />
        <LabeledInput
          className="sm:col-span-4"
          label="CTA label"
          placeholder={defaults.ctaLabel}
          value={override.ctaLabel ?? ""}
          onChange={(v) =>
            v ? onChange({ ctaLabel: v }) : onClear("ctaLabel")
          }
        />
        <LabeledInput
          className="sm:col-span-8"
          label="CTA URL"
          placeholder={defaults.ctaUrl}
          value={override.ctaUrl ?? ""}
          onChange={(v) => (v ? onChange({ ctaUrl: v }) : onClear("ctaUrl"))}
          mono
        />
      </div>
    </div>
  );
}

// ─── CUSTOM STEP CARD ──────────────────────────────────────────────────────

function CustomStepCard({
  index,
  total,
  step,
  onMoveUp,
  onMoveDown,
  onChange,
  onRemove,
}: {
  index: number;
  total: number;
  step: CustomStep;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onChange: (patch: Partial<CustomStep>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="card p-4 sm:p-5 border-l-2 border-l-brand-gold/40">
      <div className="flex items-start gap-3 mb-3">
        <ReorderHandle
          index={index}
          total={total}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-body text-[10px] uppercase tracking-wider text-brand-gold">
              ⭐ Custom step
            </span>
            <code className="font-mono text-[11px] text-[var(--app-text-muted)]">
              {step.id}
            </code>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 font-body text-[11px] px-3 py-1.5 border border-red-500/30 text-red-500 rounded-md hover:bg-red-500/10"
        >
          Remove
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <LabeledInput
          className="sm:col-span-2"
          label="Icon"
          value={step.icon ?? ""}
          placeholder="⭐"
          onChange={(v) => onChange({ icon: v || undefined })}
          mono
        />
        <LabeledInput
          className="sm:col-span-10"
          label="Title"
          value={step.title}
          onChange={(v) => onChange({ title: v })}
          placeholder="Step title"
        />
        <LabeledTextarea
          className="sm:col-span-12"
          label="Description"
          value={step.description}
          onChange={(v) => onChange({ description: v })}
          placeholder="Describe what partners should do"
        />
        <LabeledInput
          className="sm:col-span-4"
          label="CTA label"
          value={step.ctaLabel}
          onChange={(v) => onChange({ ctaLabel: v })}
          placeholder="Open"
        />
        <LabeledInput
          className="sm:col-span-6"
          label="CTA URL"
          value={step.ctaUrl}
          onChange={(v) => onChange({ ctaUrl: v })}
          placeholder="/dashboard or https://…"
          mono
        />
        <div className="sm:col-span-2">
          <label className="block font-body text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1.5">
            Done when
          </label>
          <select
            value={step.doneWhen ?? "manual"}
            onChange={(e) =>
              onChange({ doneWhen: e.target.value as "manual" | "never" })
            }
            className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 font-body text-[12px] focus:border-brand-gold/50 focus:outline-none"
          >
            <option value="manual">Admin marks done</option>
            <option value="never">Always shown</option>
          </select>
        </div>
      </div>
    </div>
  );
}

// ─── SHARED CONTROLS ───────────────────────────────────────────────────────

function ReorderHandle({
  index,
  total,
  onMoveUp,
  onMoveDown,
}: {
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="shrink-0 flex flex-col items-center gap-0.5">
      <button
        type="button"
        onClick={onMoveUp}
        disabled={index === 0}
        className="font-body text-[12px] text-[var(--app-text-muted)] hover:text-brand-gold disabled:opacity-20 w-7 h-6 rounded border border-[var(--app-border)]"
        title="Move up"
      >
        ▲
      </button>
      <span className="font-mono text-[10px] text-[var(--app-text-faint)]">
        {index + 1}
      </span>
      <button
        type="button"
        onClick={onMoveDown}
        disabled={index === total - 1}
        className="font-body text-[12px] text-[var(--app-text-muted)] hover:text-brand-gold disabled:opacity-20 w-7 h-6 rounded border border-[var(--app-border)]"
        title="Move down"
      >
        ▼
      </button>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  placeholder,
  onChange,
  className = "",
  mono = false,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div className={className}>
      <label className="block font-body text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1.5">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] ${
          mono ? "font-mono text-[12px]" : "font-body text-[13px]"
        } focus:border-brand-gold/50 focus:outline-none placeholder:text-[var(--app-text-muted)]/60`}
      />
    </div>
  );
}

function LabeledTextarea({
  label,
  value,
  placeholder,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block font-body text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1.5">
        {label}
      </label>
      <textarea
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none placeholder:text-[var(--app-text-muted)]/60"
      />
    </div>
  );
}
