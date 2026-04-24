"use client";

import { useState, useEffect, useCallback } from "react";
import type { LandingContentData } from "@/lib/landingContent";

type Tab =
  | "hero"
  | "lawfirms"
  | "opportunity"
  | "crossProduct"
  | "howItWorks"
  | "downline"
  | "transparency"
  | "credibility"
  | "testimonials"
  | "faq"
  | "finalCta"
  | "pixels"
  | "seo"
  | "exitIntent"
  | "publish";

const TABS: { id: Tab; label: string }[] = [
  { id: "hero", label: "Hero" },
  { id: "lawfirms", label: "Law firms" },
  { id: "opportunity", label: "Opportunity" },
  { id: "crossProduct", label: "Cross-product" },
  { id: "howItWorks", label: "How it works" },
  { id: "downline", label: "Downline" },
  { id: "transparency", label: "Transparency" },
  { id: "credibility", label: "Credibility" },
  { id: "testimonials", label: "Testimonials" },
  { id: "faq", label: "FAQ" },
  { id: "finalCta", label: "Final CTA" },
  { id: "exitIntent", label: "Exit intent" },
  { id: "pixels", label: "Pixels" },
  { id: "seo", label: "SEO" },
  { id: "publish", label: "Publish" },
];

export default function LandingEditorPage() {
  const [tab, setTab] = useState<Tab>("hero");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [draft, setDraft] = useState<LandingContentData | null>(null);
  const [published, setPublished] = useState<LandingContentData | null>(null);
  const [landingV2Enabled, setLandingV2Enabled] = useState(false);
  const [landingV2Live, setLandingV2Live] = useState(false);
  const [lastRegeneratedAt, setLastRegeneratedAt] = useState<string | null>(null);
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);
  const [regenInstructions, setRegenInstructions] = useState("");
  // Split-pane live preview (Level 1 landing builder). Opens an iframe of
  // /landing-v2?preview=draft next to the editor; the draft route loads
  // LandingContent.draft instead of .published so admins see their
  // just-saved changes without publishing. `previewBump` forces the
  // iframe to reload after every successful saveDraft().
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewBump, setPreviewBump] = useState(0);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/landing");
      const data = await res.json();
      setDraft(data.draft);
      setPublished(data.published);
      setLandingV2Enabled(data.landingV2Enabled);
      setLandingV2Live(data.landingV2Live);
      setLastRegeneratedAt(data.lastRegeneratedAt);
      setLastPublishedAt(data.lastPublishedAt);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function flash(tone: "ok" | "err", msg: string) {
    setBanner({ tone, msg });
    setTimeout(() => setBanner(null), 4000);
  }

  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/landing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      if (res.ok) {
        flash("ok", "Draft saved");
        // Reload the live preview iframe so the admin sees their change.
        setPreviewBump((n) => n + 1);
      } else flash("err", "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    if (!confirm("Regenerate the draft from current portal data (training modules, FAQs, resources)?\n\nYour current draft will be replaced. Already-published content won't change until you Publish.")) return;
    setRegenerating(true);
    try {
      const res = await fetch("/api/admin/landing/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions: regenInstructions }),
      });
      const data = await res.json();
      if (res.ok) {
        setDraft(data.draft);
        setLastRegeneratedAt(new Date().toISOString());
        flash("ok", `Regenerated ${data.ai ? "with AI" : "(deterministic — set ANTHROPIC_API_KEY for AI rewriting)"}: ${data.sourcesUsed.trainingModules} training modules, ${data.sourcesUsed.faqs} FAQs, ${data.sourcesUsed.resources} resources, ${data.sourcesUsed.activePartners} partners`);
        setRegenInstructions("");
        setPreviewBump((n) => n + 1);
      } else {
        flash("err", data.error || "Regeneration failed");
      }
    } finally {
      setRegenerating(false);
    }
  }

  async function publish() {
    if (!confirm("Publish draft? This makes the current draft visible on /landing-v2.\n\n(Note: /landing-v2 is only reachable when 'Enable /landing-v2' is on. Swapping `/` to landing v2 requires Make Live.)")) return;
    setPublishing(true);
    try {
      await saveDraft();
      const res = await fetch("/api/admin/landing/publish", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setPublished(data.published);
        setLastPublishedAt(new Date().toISOString());
        flash("ok", "Published!");
      } else flash("err", data.error || "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  async function toggleEnabled() {
    const next = !landingV2Enabled;
    const res = await fetch("/api/admin/landing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ landingV2Enabled: next }),
    });
    if (res.ok) {
      setLandingV2Enabled(next);
      flash("ok", next ? "/landing-v2 is now reachable" : "/landing-v2 hidden");
    } else flash("err", "Toggle failed");
  }

  async function toggleLive() {
    const next = !landingV2Live;
    if (next && !confirm("This will swap `/` on fintella.partners to the new landing page. Make sure you've previewed it. Continue?")) return;
    const res = await fetch("/api/admin/landing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ landingV2Live: next }),
    });
    if (res.ok) {
      setLandingV2Live(next);
      flash("ok", next ? "Landing v2 is now at `/`" : "`/` is back to /login redirect");
    } else flash("err", "Toggle failed");
  }

  if (loading || !draft) {
    return <div className="max-w-7xl mx-auto px-4 py-16 text-center text-[var(--app-text-muted)]">Loading editor…</div>;
  }

  return (
    <div className={`${previewOpen ? "px-4" : "max-w-7xl mx-auto px-4"} py-8 text-left`}>
      <div className={previewOpen ? "grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6" : "space-y-6"}>
        <div className="space-y-6 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Landing Page Editor</h1>
          <p className="text-sm text-[var(--app-text-muted)] mt-1">
            Edit the public landing at /landing-v2. Data-driven from your portal (training modules, FAQs, live stats).
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setPreviewOpen((v) => !v)}
            className={`px-4 py-2 rounded-lg border text-sm transition ${previewOpen ? "bg-brand-gold/10 border-brand-gold/40 text-brand-gold" : "border-[var(--app-border)] hover:bg-[var(--app-input-bg)]"}`}
            title="Toggle split-pane live preview"
          >
            {previewOpen ? "◀ Close preview" : "▶ Live preview"}
          </button>
          <a
            href="/landing-v2?preview=draft"
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded-lg border border-[var(--app-border)] text-sm hover:bg-[var(--app-input-bg)] transition"
          >
            👁 Draft ↗
          </a>
          <button
            onClick={saveDraft}
            disabled={saving}
            className="px-4 py-2 rounded-lg border border-[var(--app-border)] text-sm hover:bg-[var(--app-input-bg)]"
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button
            onClick={publish}
            disabled={publishing}
            className="px-4 py-2 rounded-lg bg-[var(--brand-gold)] text-[var(--app-button-gold-text)] text-sm font-semibold hover:opacity-90"
          >
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>

      {banner && (
        <div className={`p-3 rounded-lg border text-sm ${banner.tone === "ok" ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
          {banner.msg}
        </div>
      )}

      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="font-semibold">🪄 Regenerate from portal data</div>
            <div className="text-xs text-[var(--app-text-muted)]">
              Re-reads published training modules + FAQs + resources, uses Claude to compose fresh copy into your draft. Last run: {lastRegeneratedAt ? new Date(lastRegeneratedAt).toLocaleString() : "never"}
            </div>
          </div>
          <button
            onClick={regenerate}
            disabled={regenerating}
            className="px-4 py-2 rounded-lg bg-[var(--brand-gold)]/15 border border-[var(--brand-gold)]/30 text-[var(--brand-gold)] text-sm font-semibold hover:bg-[var(--brand-gold)]/25"
          >
            {regenerating ? "Regenerating…" : "🪄 Regenerate Draft"}
          </button>
        </div>
        <textarea
          value={regenInstructions}
          onChange={(e) => setRegenInstructions(e.target.value)}
          placeholder="Optional: specific instructions for this regeneration (e.g. 'make the hero headline punchier' or 'emphasize the downline opportunity more')"
          className="w-full theme-input rounded-lg px-3 py-2 text-sm"
          rows={2}
          maxLength={1000}
        />
      </div>

      <div className="flex gap-1 border-b border-[var(--app-border)] overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition border-b-2 ${tab === t.id ? "border-[var(--brand-gold)] text-[var(--app-text)]" : "border-transparent text-[var(--app-text-muted)] hover:text-[var(--app-text)]"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {tab === "hero" && <HeroEditor draft={draft} setDraft={setDraft} />}
        {tab === "lawfirms" && <LawFirmsEditor draft={draft} setDraft={setDraft} />}
        {tab === "opportunity" && <OpportunityEditor draft={draft} setDraft={setDraft} />}
        {tab === "crossProduct" && <CrossProductEditor draft={draft} setDraft={setDraft} />}
        {tab === "howItWorks" && <HowItWorksEditor draft={draft} setDraft={setDraft} />}
        {tab === "downline" && <DownlineEditor draft={draft} setDraft={setDraft} />}
        {tab === "transparency" && <TransparencyEditor draft={draft} setDraft={setDraft} />}
        {tab === "credibility" && <CredibilityEditor draft={draft} setDraft={setDraft} />}
        {tab === "testimonials" && <TestimonialsEditor draft={draft} setDraft={setDraft} />}
        {tab === "faq" && <FaqEditor draft={draft} setDraft={setDraft} />}
        {tab === "finalCta" && <FinalCtaEditor draft={draft} setDraft={setDraft} />}
        {tab === "exitIntent" && <ExitIntentEditor draft={draft} setDraft={setDraft} />}
        {tab === "pixels" && <PixelsEditor draft={draft} setDraft={setDraft} />}
        {tab === "seo" && <SeoEditor draft={draft} setDraft={setDraft} />}
        {tab === "publish" && (
          <PublishTab
            draft={draft}
            published={published}
            landingV2Enabled={landingV2Enabled}
            landingV2Live={landingV2Live}
            onToggleEnabled={toggleEnabled}
            onToggleLive={toggleLive}
            lastPublishedAt={lastPublishedAt}
          />
        )}
      </div>
        </div>

        {/* Split-pane live preview — visible only when previewOpen AND the
            viewport is xl+. Mobile/tablet admins use the "👁 Draft ↗" link
            to open preview in a new tab. */}
        {previewOpen && (
          <div className="min-w-0 hidden xl:block">
            <LivePreviewPane
              bump={previewBump}
              device={previewDevice}
              onDeviceChange={setPreviewDevice}
              onReload={() => setPreviewBump((n) => n + 1)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── LIVE PREVIEW PANE ────────────────────────────────────────────────────

function LivePreviewPane({
  bump,
  device,
  onDeviceChange,
  onReload,
}: {
  bump: number;
  device: "desktop" | "mobile";
  onDeviceChange: (d: "desktop" | "mobile") => void;
  onReload: () => void;
}) {
  // Cache-bust via query param so the iframe genuinely refetches on bump.
  const src = `/landing-v2?preview=draft&_=${bump}`;
  return (
    <div className="sticky top-4 h-[calc(100vh-6rem)] border border-[var(--app-border)] rounded-lg overflow-hidden flex flex-col bg-[var(--app-bg)]">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--app-border)] bg-[var(--app-input-bg)]">
        <div className="flex items-center gap-2 text-[11px] text-[var(--app-text-muted)] min-w-0">
          <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
          <span className="font-mono truncate">/landing-v2?preview=draft</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onDeviceChange("desktop")}
            className={`text-[11px] px-2 py-1 rounded ${device === "desktop" ? "bg-brand-gold/20 text-brand-gold" : "text-[var(--app-text-muted)] hover:text-[var(--app-text)]"}`}
            title="Desktop viewport"
          >
            🖥
          </button>
          <button
            onClick={() => onDeviceChange("mobile")}
            className={`text-[11px] px-2 py-1 rounded ${device === "mobile" ? "bg-brand-gold/20 text-brand-gold" : "text-[var(--app-text-muted)] hover:text-[var(--app-text)]"}`}
            title="Mobile viewport"
          >
            📱
          </button>
          <button
            onClick={onReload}
            className="text-[11px] px-2 py-1 rounded text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
            title="Reload preview"
          >
            ↻
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-[var(--app-input-bg)] flex items-start justify-center py-4">
        <iframe
          key={bump}
          src={src}
          title="Landing preview"
          className={`border-0 bg-white transition-all ${
            device === "mobile"
              ? "w-[390px] h-[844px] rounded-xl shadow-lg"
              : "w-full h-full"
          }`}
          style={device === "desktop" ? { minHeight: "100%" } : undefined}
        />
      </div>
      <div className="px-3 py-1.5 border-t border-[var(--app-border)] bg-[var(--app-input-bg)] font-body text-[10px] text-[var(--app-text-muted)]">
        Previewing draft. Save draft above to refresh this pane; Publish when
        you&apos;re ready to go live.
      </div>
    </div>
  );
}

// ─── Section editors (simple form inputs bound to draft) ──────────────────────

type DraftProps = {
  draft: LandingContentData;
  setDraft: (d: LandingContentData) => void;
};

function Field({ label, value, onChange, type = "text", placeholder, rows }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; rows?: number }) {
  return (
    <label className="block space-y-1">
      <div className="text-xs uppercase tracking-wider text-[var(--app-text-muted)]">{label}</div>
      {rows ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} className="w-full theme-input rounded-lg px-3 py-2 text-sm" />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full theme-input rounded-lg px-3 py-2 text-sm" />
      )}
    </label>
  );
}

function ListEditor<T>({
  label,
  items,
  onChange,
  renderItem,
  emptyItem,
  addLabel = "Add",
}: {
  label: string;
  items: T[];
  onChange: (next: T[]) => void;
  renderItem: (item: T, update: (next: T) => void, index: number) => React.ReactNode;
  emptyItem: () => T;
  addLabel?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wider text-[var(--app-text-muted)]">{label}</div>
      {items.map((item, i) => (
        <div key={i} className="p-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-input-bg)]/50 space-y-2">
          {renderItem(item, (next) => {
            const copy = [...items];
            copy[i] = next;
            onChange(copy);
          }, i)}
          <button
            onClick={() => onChange(items.filter((_, ix) => ix !== i))}
            className="text-xs text-red-400 hover:underline"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...items, emptyItem()])}
        className="text-xs px-3 py-1.5 rounded-md border border-[var(--app-border)] hover:bg-[var(--app-input-bg)]"
      >
        + {addLabel}
      </button>
    </div>
  );
}

function HeroEditor({ draft, setDraft }: DraftProps) {
  const h = draft.hero;
  const set = (patch: Partial<typeof h>) => setDraft({ ...draft, hero: { ...h, ...patch } });
  return (
    <div className="card p-5 space-y-4">
      <Field label="Eyebrow" value={h.eyebrow} onChange={(v) => set({ eyebrow: v })} />
      <Field label="Headline (top line)" value={h.headlineTop} onChange={(v) => set({ headlineTop: v })} />
      <Field label="Headline (gold accent)" value={h.headlineAccent} onChange={(v) => set({ headlineAccent: v })} />
      <Field label="Subheadline" value={h.subheadline} onChange={(v) => set({ subheadline: v })} rows={3} />
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Primary CTA" value={h.primaryCta} onChange={(v) => set({ primaryCta: v })} />
        <Field label="Secondary CTA" value={h.secondaryCta} onChange={(v) => set({ secondaryCta: v })} />
      </div>
      <Field label="Video URL (YouTube / Vimeo / Loom / MP4)" value={h.videoUrl} onChange={(v) => set({ videoUrl: v })} placeholder="https://www.youtube.com/embed/XXXXXXX" />
      <Field label="Video poster image URL (optional)" value={h.videoPosterUrl} onChange={(v) => set({ videoPosterUrl: v })} />
      <ListEditor
        label="Trust badges (under CTA)"
        items={h.trustBadges}
        onChange={(next) => set({ trustBadges: next })}
        emptyItem={() => ""}
        renderItem={(item, update) => <input value={item} onChange={(e) => update(e.target.value)} className="w-full theme-input rounded-lg px-3 py-2 text-sm" />}
      />
    </div>
  );
}

function LawFirmsEditor({ draft, setDraft }: DraftProps) {
  const s = draft.lawFirmStrip;
  const set = (patch: Partial<typeof s>) => setDraft({ ...draft, lawFirmStrip: { ...s, ...patch } });
  return (
    <div className="card p-5 space-y-4">
      <Field label="Prefix" value={s.prefix} onChange={(v) => set({ prefix: v })} />
      <ListEditor<{ name: string; url?: string }>
        label="Firms"
        items={s.firms}
        onChange={(next) => set({ firms: next })}
        emptyItem={() => ({ name: "", url: "" })}
        renderItem={(item, update) => (
          <>
            <Field label="Name" value={item.name} onChange={(v) => update({ ...item, name: v })} />
            <Field label="URL (optional)" value={item.url || ""} onChange={(v) => update({ ...item, url: v || undefined })} />
          </>
        )}
      />
    </div>
  );
}

function OpportunityEditor({ draft, setDraft }: DraftProps) {
  const o = draft.opportunity;
  const set = (patch: Partial<typeof o>) => setDraft({ ...draft, opportunity: { ...o, ...patch } });
  return (
    <div className="card p-5 space-y-4">
      <Field label="Eyebrow" value={o.eyebrow} onChange={(v) => set({ eyebrow: v })} />
      <Field label="Title" value={o.title} onChange={(v) => set({ title: v })} />
      <Field label="Body" value={o.body} onChange={(v) => set({ body: v })} rows={3} />
      <ListEditor
        label="Stat cards"
        items={o.stats}
        onChange={(next) => set({ stats: next })}
        emptyItem={() => ({ headline: "", sub: "" })}
        renderItem={(item, update) => (
          <>
            <Field label="Headline (big number)" value={item.headline} onChange={(v) => update({ ...item, headline: v })} />
            <Field label="Sub" value={item.sub} onChange={(v) => update({ ...item, sub: v })} />
          </>
        )}
      />
    </div>
  );
}

function CrossProductEditor({ draft, setDraft }: DraftProps) {
  const c = draft.crossProduct;
  const set = (patch: Partial<typeof c>) => setDraft({ ...draft, crossProduct: { ...c, ...patch } });
  return (
    <div className="card p-5 space-y-4">
      <Field label="Eyebrow" value={c.eyebrow} onChange={(v) => set({ eyebrow: v })} />
      <Field label="Title" value={c.title} onChange={(v) => set({ title: v })} />
      <Field label="Body" value={c.body} onChange={(v) => set({ body: v })} rows={3} />
      <ListEditor
        label="Products"
        items={c.products}
        onChange={(next) => set({ products: next })}
        emptyItem={() => ({ icon: "✨", title: "", body: "" })}
        renderItem={(item, update) => (
          <>
            <Field label="Icon (emoji)" value={item.icon} onChange={(v) => update({ ...item, icon: v })} />
            <Field label="Title" value={item.title} onChange={(v) => update({ ...item, title: v })} />
            <Field label="Body" value={item.body} onChange={(v) => update({ ...item, body: v })} rows={2} />
          </>
        )}
      />
    </div>
  );
}

function HowItWorksEditor({ draft, setDraft }: DraftProps) {
  const h = draft.howItWorks;
  const set = (patch: Partial<typeof h>) => setDraft({ ...draft, howItWorks: { ...h, ...patch } });
  return (
    <div className="card p-5 space-y-4">
      <Field label="Eyebrow" value={h.eyebrow} onChange={(v) => set({ eyebrow: v })} />
      <Field label="Title" value={h.title} onChange={(v) => set({ title: v })} />
      <Field label="Body" value={h.body} onChange={(v) => set({ body: v })} rows={2} />
      <ListEditor
        label="Steps"
        items={h.steps}
        onChange={(next) => set({ steps: next })}
        emptyItem={() => ({ num: "", title: "", body: "" })}
        renderItem={(item, update) => (
          <>
            <Field label="Number (01 / 02 / 03)" value={item.num} onChange={(v) => update({ ...item, num: v })} />
            <Field label="Title" value={item.title} onChange={(v) => update({ ...item, title: v })} />
            <Field label="Body" value={item.body} onChange={(v) => update({ ...item, body: v })} rows={2} />
          </>
        )}
      />
    </div>
  );
}

function DownlineEditor({ draft, setDraft }: DraftProps) {
  const d = draft.downline;
  const set = (patch: Partial<typeof d>) => setDraft({ ...draft, downline: { ...d, ...patch } });
  return (
    <div className="card p-5 space-y-4">
      <Field label="Eyebrow" value={d.eyebrow} onChange={(v) => set({ eyebrow: v })} />
      <Field label="Title" value={d.title} onChange={(v) => set({ title: v })} />
      <Field label="Body" value={d.body} onChange={(v) => set({ body: v })} rows={3} />
      <ListEditor
        label="Bullets"
        items={d.bullets}
        onChange={(next) => set({ bullets: next })}
        emptyItem={() => ""}
        renderItem={(item, update) => <input value={item} onChange={(e) => update(e.target.value)} className="w-full theme-input rounded-lg px-3 py-2 text-sm" />}
      />
    </div>
  );
}

function TransparencyEditor({ draft, setDraft }: DraftProps) {
  const t = draft.transparency;
  const set = (patch: Partial<typeof t>) => setDraft({ ...draft, transparency: { ...t, ...patch } });
  return (
    <div className="card p-5 space-y-4">
      <Field label="Eyebrow" value={t.eyebrow} onChange={(v) => set({ eyebrow: v })} />
      <Field label="Title" value={t.title} onChange={(v) => set({ title: v })} />
      <Field label="Body" value={t.body} onChange={(v) => set({ body: v })} rows={3} />
      <ListEditor
        label="Features"
        items={t.features}
        onChange={(next) => set({ features: next })}
        emptyItem={() => ({ icon: "✨", title: "", body: "" })}
        renderItem={(item, update) => (
          <>
            <Field label="Icon (emoji)" value={item.icon} onChange={(v) => update({ ...item, icon: v })} />
            <Field label="Title" value={item.title} onChange={(v) => update({ ...item, title: v })} />
            <Field label="Body" value={item.body} onChange={(v) => update({ ...item, body: v })} rows={2} />
          </>
        )}
      />
    </div>
  );
}

function CredibilityEditor({ draft, setDraft }: DraftProps) {
  const c = draft.credibility;
  const set = (patch: Partial<typeof c>) => setDraft({ ...draft, credibility: { ...c, ...patch } });
  return (
    <div className="card p-5 space-y-4">
      <Field label="Eyebrow" value={c.eyebrow} onChange={(v) => set({ eyebrow: v })} />
      <Field label="Title" value={c.title} onChange={(v) => set({ title: v })} />
      <Field label="Body" value={c.body} onChange={(v) => set({ body: v })} rows={3} />
      <ListEditor
        label="Firm cards"
        items={c.firms}
        onChange={(next) => set({ firms: next })}
        emptyItem={() => ({ title: "", body: "" })}
        renderItem={(item, update) => (
          <>
            <Field label="Firm name" value={item.title} onChange={(v) => update({ ...item, title: v })} />
            <Field label="Description" value={item.body} onChange={(v) => update({ ...item, body: v })} rows={3} />
          </>
        )}
      />
      <ListEditor
        label="Support tiles"
        items={c.supportTiles}
        onChange={(next) => set({ supportTiles: next })}
        emptyItem={() => ({ icon: "✨", title: "" })}
        renderItem={(item, update) => (
          <>
            <Field label="Icon (emoji)" value={item.icon} onChange={(v) => update({ ...item, icon: v })} />
            <Field label="Title" value={item.title} onChange={(v) => update({ ...item, title: v })} />
          </>
        )}
      />
    </div>
  );
}

function TestimonialsEditor({ draft, setDraft }: DraftProps) {
  const t = draft.testimonials;
  const set = (patch: Partial<typeof t>) => setDraft({ ...draft, testimonials: { ...t, ...patch } });
  return (
    <div className="card p-5 space-y-4">
      <Field label="Eyebrow" value={t.eyebrow} onChange={(v) => set({ eyebrow: v })} />
      <Field label="Title" value={t.title} onChange={(v) => set({ title: v })} />
      <ListEditor
        label="Testimonials"
        items={t.items}
        onChange={(next) => set({ items: next })}
        emptyItem={() => ({ quote: "", authorName: "", authorRole: "", authorCompany: "" })}
        renderItem={(item, update) => (
          <>
            <Field label="Quote" value={item.quote} onChange={(v) => update({ ...item, quote: v })} rows={3} />
            <Field label="Author name" value={item.authorName} onChange={(v) => update({ ...item, authorName: v })} />
            <Field label="Author role" value={item.authorRole} onChange={(v) => update({ ...item, authorRole: v })} />
            <Field label="Author company" value={item.authorCompany} onChange={(v) => update({ ...item, authorCompany: v })} />
          </>
        )}
      />
    </div>
  );
}

function FaqEditor({ draft, setDraft }: DraftProps) {
  const f = draft.faq;
  const set = (patch: Partial<typeof f>) => setDraft({ ...draft, faq: { ...f, ...patch } });
  return (
    <div className="card p-5 space-y-4">
      <Field label="Eyebrow" value={f.eyebrow} onChange={(v) => set({ eyebrow: v })} />
      <Field label="Title" value={f.title} onChange={(v) => set({ title: v })} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.useLiveData} onChange={(e) => set({ useLiveData: e.target.checked })} />
        <span>Use live FAQ data from the portal's FAQ model (recommended)</span>
      </label>
      {f.useLiveData ? (
        <ListEditor
          label="FAQ categories to include (from the FAQ model)"
          items={f.categories}
          onChange={(next) => set({ categories: next })}
          emptyItem={() => "general"}
          renderItem={(item, update) => <input value={item} onChange={(e) => update(e.target.value)} className="w-full theme-input rounded-lg px-3 py-2 text-sm" />}
        />
      ) : (
        <ListEditor
          label="Manual FAQ items"
          items={f.manualItems}
          onChange={(next) => set({ manualItems: next })}
          emptyItem={() => ({ q: "", a: "" })}
          renderItem={(item, update) => (
            <>
              <Field label="Question" value={item.q} onChange={(v) => update({ ...item, q: v })} />
              <Field label="Answer" value={item.a} onChange={(v) => update({ ...item, a: v })} rows={3} />
            </>
          )}
        />
      )}
    </div>
  );
}

function FinalCtaEditor({ draft, setDraft }: DraftProps) {
  const c = draft.finalCta;
  const set = (patch: Partial<typeof c>) => setDraft({ ...draft, finalCta: { ...c, ...patch } });
  return (
    <div className="card p-5 space-y-4">
      <Field label="Title" value={c.title} onChange={(v) => set({ title: v })} />
      <Field label="Body" value={c.body} onChange={(v) => set({ body: v })} rows={2} />
      <Field label="Primary CTA" value={c.primaryCta} onChange={(v) => set({ primaryCta: v })} />
    </div>
  );
}

function ExitIntentEditor({ draft, setDraft }: DraftProps) {
  const e = draft.exitIntent;
  const set = (patch: Partial<typeof e>) => setDraft({ ...draft, exitIntent: { ...e, ...patch } });
  return (
    <div className="card p-5 space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={e.enabled} onChange={(ev) => set({ enabled: ev.target.checked })} />
        <span>Enable exit-intent popup (desktop only)</span>
      </label>
      <Field label="Title" value={e.title} onChange={(v) => set({ title: v })} />
      <Field label="Body" value={e.body} onChange={(v) => set({ body: v })} rows={2} />
      <Field label="CTA" value={e.cta} onChange={(v) => set({ cta: v })} />
      <Field
        label="Lead magnet TrainingResource ID (optional)"
        value={e.leadMagnetResourceId}
        onChange={(v) => set({ leadMagnetResourceId: v })}
        placeholder="TrainingResource.id — PDF emailed after opt-in"
      />
    </div>
  );
}

function PixelsEditor({ draft, setDraft }: DraftProps) {
  const p = draft.pixels;
  const set = (patch: Partial<typeof p>) => setDraft({ ...draft, pixels: { ...p, ...patch } });
  return (
    <div className="card p-5 space-y-4">
      <p className="text-sm text-[var(--app-text-muted)]">
        Paste pixel IDs here — they're injected automatically in the landing page &lt;head&gt; / on form-submit events.
      </p>
      <Field label="Google Tag Manager Container ID (GTM-XXXXXX)" value={p.gtmContainerId} onChange={(v) => set({ gtmContainerId: v })} />
      <Field label="Meta (Facebook) Pixel ID" value={p.metaPixelId} onChange={(v) => set({ metaPixelId: v })} placeholder="1234567890123456" />
      <Field label="Google Ads ID (AW-XXXXX)" value={p.googleAdsId} onChange={(v) => set({ googleAdsId: v })} />
      <Field label="Google Ads Conversion Label" value={p.googleAdsConversionLabel} onChange={(v) => set({ googleAdsConversionLabel: v })} placeholder="abCDeFgHiJkLmNoP" />
      <Field label="LinkedIn Insight Partner ID" value={p.linkedInPartnerId} onChange={(v) => set({ linkedInPartnerId: v })} />
    </div>
  );
}

function SeoEditor({ draft, setDraft }: DraftProps) {
  const s = draft.seo;
  const set = (patch: Partial<typeof s>) => setDraft({ ...draft, seo: { ...s, ...patch } });
  return (
    <div className="card p-5 space-y-4">
      <Field label="SEO Title" value={s.title} onChange={(v) => set({ title: v })} />
      <Field label="Meta description" value={s.description} onChange={(v) => set({ description: v })} rows={3} />
      <Field label="OG image URL (empty = default)" value={s.ogImageUrl} onChange={(v) => set({ ogImageUrl: v })} />
      <Field label="Canonical URL" value={s.canonicalUrl} onChange={(v) => set({ canonicalUrl: v })} />
    </div>
  );
}

function PublishTab({
  draft,
  published,
  landingV2Enabled,
  landingV2Live,
  onToggleEnabled,
  onToggleLive,
  lastPublishedAt,
}: {
  draft: LandingContentData;
  published: LandingContentData | null;
  landingV2Enabled: boolean;
  landingV2Live: boolean;
  onToggleEnabled: () => void;
  onToggleLive: () => void;
  lastPublishedAt: string | null;
}) {
  const draftVersion = draft._meta?.version ?? 0;
  const pubVersion = published?._meta?.version ?? 0;
  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-3">
        <h3 className="font-semibold">Visibility controls</h3>

        <div className="flex items-start justify-between gap-4 p-3 rounded-lg border border-[var(--app-border)]">
          <div>
            <div className="font-medium">1. Enable /landing-v2</div>
            <div className="text-xs text-[var(--app-text-muted)]">
              Makes the new landing reachable at <code className="text-[var(--brand-gold)]">fintella.partners/landing-v2</code>. Still hidden from `/` root.
            </div>
          </div>
          <button
            onClick={onToggleEnabled}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${landingV2Enabled ? "bg-green-500/20 text-green-400 border border-green-500/30" : "border border-[var(--app-border)]"}`}
          >
            {landingV2Enabled ? "✓ Enabled" : "Enable"}
          </button>
        </div>

        <div className="flex items-start justify-between gap-4 p-3 rounded-lg border border-[var(--app-border)]">
          <div>
            <div className="font-medium">2. Make live at `/`</div>
            <div className="text-xs text-[var(--app-text-muted)]">
              Swaps <code className="text-[var(--brand-gold)]">fintella.partners/</code> from /login-redirect to the new landing. Only works when (1) is on.
            </div>
          </div>
          <button
            onClick={onToggleLive}
            disabled={!landingV2Enabled}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${landingV2Live ? "bg-green-500/20 text-green-400 border border-green-500/30" : "border border-[var(--app-border)]"} disabled:opacity-50`}
          >
            {landingV2Live ? "✓ Live" : "Go Live"}
          </button>
        </div>
      </div>

      <div className="card p-5 space-y-2">
        <h3 className="font-semibold">Version status</h3>
        <div className="text-sm space-y-1 text-[var(--app-text-muted)]">
          <div>Draft version: <strong className="text-[var(--app-text)]">v{draftVersion}</strong></div>
          <div>Published version: <strong className="text-[var(--app-text)]">v{pubVersion}</strong></div>
          <div>Last published: {lastPublishedAt ? new Date(lastPublishedAt).toLocaleString() : "never"}</div>
          {draftVersion > pubVersion && (
            <div className="text-[var(--brand-gold)] font-semibold">
              ⚠ Draft is ahead of published — click Publish at the top to promote.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
