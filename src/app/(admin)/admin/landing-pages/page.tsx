"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DEFAULT_RECOVER, DEFAULT_PARTNERS, DEFAULT_BROKERS, DEFAULT_WEBINAR,
  parsePageContent,
  type RecoverPageContent, type PartnersPageContent, type WebinarPageContent,
} from "@/lib/landingPageSchemas";

type PageSlug = "recover" | "partners" | "brokers" | "webinar";

const PAGE_TABS: { slug: PageSlug; label: string; route: string }[] = [
  { slug: "recover", label: "Client Recovery", route: "/recover" },
  { slug: "partners", label: "Partner Recruitment", route: "/partners" },
  { slug: "brokers", label: "Customs Brokers", route: "/partners/brokers" },
  { slug: "webinar", label: "Webinar Funnel", route: "/webinar" },
];

const RECOVER_SECTIONS = [
  { id: "hero", label: "Hero" },
  { id: "howItWorks", label: "How It Works" },
  { id: "resources", label: "Resources" },
  { id: "footer", label: "Footer" },
] as const;

const PARTNERS_SECTIONS = [
  { id: "hero", label: "Hero" },
  { id: "howItWorks", label: "How It Works" },
  { id: "whyPartner", label: "Why Partner" },
  { id: "opportunity", label: "Opportunity" },
  { id: "faq", label: "FAQ" },
  { id: "bottomCta", label: "Bottom CTA" },
  { id: "footer", label: "Footer" },
] as const;

const WEBINAR_SECTIONS = [
  { id: "hero", label: "Squeeze Page" },
  { id: "watchPage", label: "Watch Page" },
  { id: "takeaways", label: "Takeaways" },
  { id: "footer", label: "Footer" },
] as const;

interface PageRow {
  slug: string;
  label: string;
  draft: string;
  published: string;
  enabled: boolean;
  lastPublishedAt: string | null;
}

export default function LandingPagesEditor() {
  const [activeSlug, setActiveSlug] = useState<PageSlug>("recover");
  const [activeSection, setActiveSection] = useState<string>("hero");
  const [pages, setPages] = useState<PageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/landing-pages");
      if (res.ok) setPages(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function flash(tone: "ok" | "err", msg: string) {
    setBanner({ tone, msg });
    setTimeout(() => setBanner(null), 4000);
  }

  const activePage = pages.find((p) => p.slug === activeSlug);
  const activeTab = PAGE_TABS.find((t) => t.slug === activeSlug)!;
  const sections = activeSlug === "recover" ? RECOVER_SECTIONS : activeSlug === "webinar" ? WEBINAR_SECTIONS : PARTNERS_SECTIONS;

  function getDraft() {
    const raw = activePage?.draft || "{}";
    if (activeSlug === "recover") return parsePageContent(raw, DEFAULT_RECOVER);
    if (activeSlug === "brokers") return parsePageContent(raw, DEFAULT_BROKERS);
    if (activeSlug === "webinar") return parsePageContent(raw, DEFAULT_WEBINAR);
    return parsePageContent(raw, DEFAULT_PARTNERS);
  }

  function setDraft(content: any) {
    setPages((prev) =>
      prev.map((p) =>
        p.slug === activeSlug ? { ...p, draft: JSON.stringify(content) } : p
      )
    );
  }

  function switchPage(slug: PageSlug) {
    setActiveSlug(slug);
    setActiveSection("hero");
  }

  async function saveDraft() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/landing-pages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: activeSlug, draft: activePage?.draft || "{}" }),
      });
      if (res.ok) flash("ok", "Draft saved");
      else flash("err", "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!confirm(`Publish ${activeTab.label}? This makes the draft content live at ${activeTab.route}.`)) return;
    setPublishing(true);
    try {
      await saveDraft();
      const res = await fetch("/api/admin/landing-pages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: activeSlug, publish: true }),
      });
      if (res.ok) {
        const updated = await res.json();
        setPages((prev) => prev.map((p) => p.slug === activeSlug ? { ...p, published: updated.published, lastPublishedAt: updated.lastPublishedAt } : p));
        flash("ok", "Published!");
      } else flash("err", "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return <div className="max-w-7xl mx-auto px-4 py-16 text-center text-[var(--app-text-muted)]">Loading editor…</div>;
  }

  const draft = getDraft();

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 text-left space-y-6">
      {/* Title + actions */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Landing Pages</h1>
          <p className="text-sm text-[var(--app-text-muted)] mt-1">Edit copy for each public landing page.</p>
        </div>
        <div className="flex gap-2">
          <a
            href={activeTab.route}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded-lg border border-[var(--app-border)] text-sm hover:bg-[var(--app-input-bg)] transition"
          >
            View Live ↗
          </a>
          <button onClick={saveDraft} disabled={saving} className="px-4 py-2 rounded-lg border border-[var(--app-border)] text-sm hover:bg-[var(--app-input-bg)]">
            {saving ? "Saving…" : "Save Draft"}
          </button>
          <button onClick={publish} disabled={publishing} className="px-4 py-2 rounded-lg bg-[var(--brand-gold)] text-[var(--app-button-gold-text)] text-sm font-semibold hover:opacity-90">
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>

      {banner && (
        <div className={`p-3 rounded-lg border text-sm ${banner.tone === "ok" ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
          {banner.msg}
        </div>
      )}

      {/* Page tabs */}
      <div className="flex gap-1 border-b border-[var(--app-border)]">
        {PAGE_TABS.map((t) => (
          <button
            key={t.slug}
            onClick={() => switchPage(t.slug)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition border-b-2 ${
              activeSlug === t.slug
                ? "border-[var(--brand-gold)] text-[var(--app-text)]"
                : "border-transparent text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
            }`}
          >
            {t.label}
            <span className="text-[10px] text-[var(--app-text-muted)] ml-1.5">{t.route}</span>
          </button>
        ))}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 text-xs text-[var(--app-text-muted)]">
        <span>Last published: {activePage?.lastPublishedAt ? new Date(activePage.lastPublishedAt).toLocaleString() : "never"}</span>
        <span>Status: {activePage?.enabled ? "✓ Enabled" : "Disabled"}</span>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 border-b border-[var(--app-border)] overflow-x-auto">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition border-b-2 ${
              activeSection === s.id
                ? "border-[var(--brand-gold)] text-[var(--app-text)]"
                : "border-transparent text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Section editor */}
      {activeSlug === "recover" && <RecoverSectionEditor draft={draft as RecoverPageContent} setDraft={setDraft} section={activeSection} />}
      {(activeSlug === "partners" || activeSlug === "brokers") && <PartnersSectionEditor draft={draft as PartnersPageContent} setDraft={setDraft} section={activeSection} />}
      {activeSlug === "webinar" && <WebinarSectionEditor draft={draft as WebinarPageContent} setDraft={setDraft} section={activeSection} />}
    </div>
  );
}

// ─── Shared field components ──────────────────────────────────────

function Field({ label, value, onChange, rows, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <label className="block space-y-1">
      <div className="text-xs uppercase tracking-wider text-[var(--app-text-muted)]">{label}</div>
      {rows ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} className="w-full theme-input rounded-lg px-3 py-2 text-sm" />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full theme-input rounded-lg px-3 py-2 text-sm" />
      )}
    </label>
  );
}

// ─── Recover section editor ───────────────────────────────────────

function RecoverSectionEditor({ draft, setDraft, section }: { draft: RecoverPageContent; setDraft: (d: RecoverPageContent) => void; section: string }) {
  const h = draft.hero;
  const setHero = (patch: Partial<typeof h>) => setDraft({ ...draft, hero: { ...h, ...patch } });

  if (section === "hero") return (
    <div className="card p-5 space-y-4">
      <Field label="Badge" value={h.badge} onChange={(v) => setHero({ badge: v })} />
      <Field label="Headline" value={h.headline} onChange={(v) => setHero({ headline: v })} />
      <Field label="Subheadline" value={h.subheadline} onChange={(v) => setHero({ subheadline: v })} rows={3} />
      <div>
        <div className="text-xs uppercase tracking-wider text-[var(--app-text-muted)] mb-2">Bullets</div>
        {h.bullets.map((b, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input value={b} onChange={(e) => { const next = [...h.bullets]; next[i] = e.target.value; setHero({ bullets: next }); }} className="flex-1 theme-input rounded-lg px-3 py-2 text-sm" />
            <button onClick={() => setHero({ bullets: h.bullets.filter((_, ix) => ix !== i) })} className="text-xs text-red-400 px-2">✕</button>
          </div>
        ))}
        <button onClick={() => setHero({ bullets: [...h.bullets, ""] })} className="text-xs px-3 py-1.5 rounded-md border border-[var(--app-border)] hover:bg-[var(--app-input-bg)]">+ Add Bullet</button>
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-[var(--app-text-muted)] mb-2">Stats</div>
        {h.stats.map((s, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 mb-2">
            <input value={s.value} onChange={(e) => { const next = [...h.stats]; next[i] = { ...s, value: e.target.value }; setHero({ stats: next }); }} placeholder="Value" className="theme-input rounded-lg px-3 py-2 text-sm" />
            <input value={s.label} onChange={(e) => { const next = [...h.stats]; next[i] = { ...s, label: e.target.value }; setHero({ stats: next }); }} placeholder="Label" className="theme-input rounded-lg px-3 py-2 text-sm" />
          </div>
        ))}
      </div>
    </div>
  );

  if (section === "howItWorks") return (
    <div className="card p-5 space-y-4">
      <Field label="Title" value={draft.howItWorks.title} onChange={(v) => setDraft({ ...draft, howItWorks: { ...draft.howItWorks, title: v } })} />
      {draft.howItWorks.steps.map((s, i) => (
        <div key={i} className="p-3 rounded-lg border border-[var(--app-border)] space-y-2">
          <Field label={`Step ${i + 1} Title`} value={s.title} onChange={(v) => { const next = [...draft.howItWorks.steps]; next[i] = { ...s, title: v }; setDraft({ ...draft, howItWorks: { ...draft.howItWorks, steps: next } }); }} />
          <Field label="Description" value={s.description} onChange={(v) => { const next = [...draft.howItWorks.steps]; next[i] = { ...s, description: v }; setDraft({ ...draft, howItWorks: { ...draft.howItWorks, steps: next } }); }} rows={2} />
        </div>
      ))}
    </div>
  );

  if (section === "resources") return (
    <div className="card p-5 space-y-4">
      <Field label="Title" value={draft.resources.title} onChange={(v) => setDraft({ ...draft, resources: { ...draft.resources, title: v } })} />
      <Field label="Subtitle" value={draft.resources.subtitle} onChange={(v) => setDraft({ ...draft, resources: { ...draft.resources, subtitle: v } })} />
      {draft.resources.items.map((r, i) => (
        <div key={i} className="p-3 rounded-lg border border-[var(--app-border)] space-y-2">
          <div className="grid grid-cols-[60px_1fr] gap-2">
            <Field label="Icon" value={r.icon} onChange={(v) => { const next = [...draft.resources.items]; next[i] = { ...r, icon: v }; setDraft({ ...draft, resources: { ...draft.resources, items: next } }); }} />
            <Field label="Title" value={r.title} onChange={(v) => { const next = [...draft.resources.items]; next[i] = { ...r, title: v }; setDraft({ ...draft, resources: { ...draft.resources, items: next } }); }} />
          </div>
          <Field label="Description" value={r.description} onChange={(v) => { const next = [...draft.resources.items]; next[i] = { ...r, description: v }; setDraft({ ...draft, resources: { ...draft.resources, items: next } }); }} rows={2} />
          <Field label="File path" value={r.file} onChange={(v) => { const next = [...draft.resources.items]; next[i] = { ...r, file: v }; setDraft({ ...draft, resources: { ...draft.resources, items: next } }); }} />
          <button onClick={() => setDraft({ ...draft, resources: { ...draft.resources, items: draft.resources.items.filter((_, ix) => ix !== i) } })} className="text-xs text-red-400">Remove</button>
        </div>
      ))}
      <button onClick={() => setDraft({ ...draft, resources: { ...draft.resources, items: [...draft.resources.items, { icon: "📄", title: "", description: "", file: "" }] } })} className="text-xs px-3 py-1.5 rounded-md border border-[var(--app-border)] hover:bg-[var(--app-input-bg)]">+ Add Resource</button>
    </div>
  );

  if (section === "footer") return (
    <div className="card p-5 space-y-4">
      <Field label="Copyright" value={draft.footer.copyright} onChange={(v) => setDraft({ ...draft, footer: { ...draft.footer, copyright: v } })} />
      <Field label="Disclaimer" value={draft.footer.disclaimer} onChange={(v) => setDraft({ ...draft, footer: { ...draft.footer, disclaimer: v } })} rows={2} />
    </div>
  );

  return null;
}

// ─── Partners / Brokers section editor ────────────────────────────

function PartnersSectionEditor({ draft, setDraft, section }: { draft: PartnersPageContent; setDraft: (d: PartnersPageContent) => void; section: string }) {
  const h = draft.hero;
  const setHero = (patch: Partial<typeof h>) => setDraft({ ...draft, hero: { ...h, ...patch } });

  if (section === "hero") return (
    <div className="card p-5 space-y-4">
      <Field label="Badge" value={h.badge} onChange={(v) => setHero({ badge: v })} />
      <Field label="Headline" value={h.headline} onChange={(v) => setHero({ headline: v })} />
      <Field label="Subheadline" value={h.subheadline} onChange={(v) => setHero({ subheadline: v })} rows={3} />
      <div>
        <div className="text-xs uppercase tracking-wider text-[var(--app-text-muted)] mb-2">Value Props</div>
        {h.bullets.map((b, i) => (
          <div key={i} className="p-3 rounded-lg border border-[var(--app-border)] space-y-2 mb-2">
            <div className="grid grid-cols-[60px_1fr] gap-2">
              <Field label="Icon" value={b.icon} onChange={(v) => { const next = [...h.bullets]; next[i] = { ...b, icon: v }; setHero({ bullets: next }); }} />
              <Field label="Title" value={b.title} onChange={(v) => { const next = [...h.bullets]; next[i] = { ...b, title: v }; setHero({ bullets: next }); }} />
            </div>
            <Field label="Description" value={b.description} onChange={(v) => { const next = [...h.bullets]; next[i] = { ...b, description: v }; setHero({ bullets: next }); }} />
            <button onClick={() => setHero({ bullets: h.bullets.filter((_, ix) => ix !== i) })} className="text-xs text-red-400">Remove</button>
          </div>
        ))}
        <button onClick={() => setHero({ bullets: [...h.bullets, { icon: "✨", title: "", description: "" }] })} className="text-xs px-3 py-1.5 rounded-md border border-[var(--app-border)] hover:bg-[var(--app-input-bg)]">+ Add Value Prop</button>
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-[var(--app-text-muted)] mb-2">Stats</div>
        {h.stats.map((s, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 mb-2">
            <input value={s.value} onChange={(e) => { const next = [...h.stats]; next[i] = { ...s, value: e.target.value }; setHero({ stats: next }); }} placeholder="Value" className="theme-input rounded-lg px-3 py-2 text-sm" />
            <input value={s.label} onChange={(e) => { const next = [...h.stats]; next[i] = { ...s, label: e.target.value }; setHero({ stats: next }); }} placeholder="Label" className="theme-input rounded-lg px-3 py-2 text-sm" />
          </div>
        ))}
      </div>
    </div>
  );

  if (section === "howItWorks") return (
    <div className="card p-5 space-y-4">
      <Field label="Title" value={draft.howItWorks.title} onChange={(v) => setDraft({ ...draft, howItWorks: { ...draft.howItWorks, title: v } })} />
      {draft.howItWorks.steps.map((s, i) => (
        <div key={i} className="p-3 rounded-lg border border-[var(--app-border)] space-y-2">
          <Field label={`Step ${i + 1} Title`} value={s.title} onChange={(v) => { const next = [...draft.howItWorks.steps]; next[i] = { ...s, title: v }; setDraft({ ...draft, howItWorks: { ...draft.howItWorks, steps: next } }); }} />
          <Field label="Description" value={s.description} onChange={(v) => { const next = [...draft.howItWorks.steps]; next[i] = { ...s, description: v }; setDraft({ ...draft, howItWorks: { ...draft.howItWorks, steps: next } }); }} rows={2} />
          <button onClick={() => setDraft({ ...draft, howItWorks: { ...draft.howItWorks, steps: draft.howItWorks.steps.filter((_, ix) => ix !== i) } })} className="text-xs text-red-400">Remove</button>
        </div>
      ))}
      <button onClick={() => setDraft({ ...draft, howItWorks: { ...draft.howItWorks, steps: [...draft.howItWorks.steps, { title: "", description: "" }] } })} className="text-xs px-3 py-1.5 rounded-md border border-[var(--app-border)] hover:bg-[var(--app-input-bg)]">+ Add Step</button>
    </div>
  );

  if (section === "whyPartner") return (
    <div className="card p-5 space-y-4">
      <Field label="Title" value={draft.whyPartner.title} onChange={(v) => setDraft({ ...draft, whyPartner: { ...draft.whyPartner, title: v } })} />
      <Field label="Subtitle" value={draft.whyPartner.subtitle} onChange={(v) => setDraft({ ...draft, whyPartner: { ...draft.whyPartner, subtitle: v } })} />
      {draft.whyPartner.features.map((f, i) => (
        <div key={i} className="p-3 rounded-lg border border-[var(--app-border)] space-y-2">
          <div className="grid grid-cols-[60px_1fr] gap-2">
            <Field label="Icon" value={f.icon} onChange={(v) => { const next = [...draft.whyPartner.features]; next[i] = { ...f, icon: v }; setDraft({ ...draft, whyPartner: { ...draft.whyPartner, features: next } }); }} />
            <Field label="Title" value={f.title} onChange={(v) => { const next = [...draft.whyPartner.features]; next[i] = { ...f, title: v }; setDraft({ ...draft, whyPartner: { ...draft.whyPartner, features: next } }); }} />
          </div>
          <Field label="Description" value={f.description} onChange={(v) => { const next = [...draft.whyPartner.features]; next[i] = { ...f, description: v }; setDraft({ ...draft, whyPartner: { ...draft.whyPartner, features: next } }); }} rows={2} />
          <button onClick={() => setDraft({ ...draft, whyPartner: { ...draft.whyPartner, features: draft.whyPartner.features.filter((_, ix) => ix !== i) } })} className="text-xs text-red-400">Remove</button>
        </div>
      ))}
      <button onClick={() => setDraft({ ...draft, whyPartner: { ...draft.whyPartner, features: [...draft.whyPartner.features, { icon: "✨", title: "", description: "" }] } })} className="text-xs px-3 py-1.5 rounded-md border border-[var(--app-border)] hover:bg-[var(--app-input-bg)]">+ Add Feature</button>
    </div>
  );

  if (section === "opportunity") return (
    <div className="card p-5 space-y-4">
      <Field label="Title" value={draft.opportunity.title} onChange={(v) => setDraft({ ...draft, opportunity: { ...draft.opportunity, title: v } })} />
      <Field label="Subtitle" value={draft.opportunity.subtitle} onChange={(v) => setDraft({ ...draft, opportunity: { ...draft.opportunity, subtitle: v } })} />
      {draft.opportunity.urgencyItems.map((u, i) => (
        <div key={i} className="p-3 rounded-lg border border-[var(--app-border)] space-y-2">
          <div className="grid grid-cols-[60px_1fr] gap-2">
            <Field label="Icon" value={u.icon} onChange={(v) => { const next = [...draft.opportunity.urgencyItems]; next[i] = { ...u, icon: v }; setDraft({ ...draft, opportunity: { ...draft.opportunity, urgencyItems: next } }); }} />
            <Field label="Title" value={u.title} onChange={(v) => { const next = [...draft.opportunity.urgencyItems]; next[i] = { ...u, title: v }; setDraft({ ...draft, opportunity: { ...draft.opportunity, urgencyItems: next } }); }} />
          </div>
          <Field label="Description" value={u.description} onChange={(v) => { const next = [...draft.opportunity.urgencyItems]; next[i] = { ...u, description: v }; setDraft({ ...draft, opportunity: { ...draft.opportunity, urgencyItems: next } }); }} rows={2} />
          <button onClick={() => setDraft({ ...draft, opportunity: { ...draft.opportunity, urgencyItems: draft.opportunity.urgencyItems.filter((_, ix) => ix !== i) } })} className="text-xs text-red-400">Remove</button>
        </div>
      ))}
      <button onClick={() => setDraft({ ...draft, opportunity: { ...draft.opportunity, urgencyItems: [...draft.opportunity.urgencyItems, { icon: "✨", title: "", description: "" }] } })} className="text-xs px-3 py-1.5 rounded-md border border-[var(--app-border)] hover:bg-[var(--app-input-bg)]">+ Add Item</button>
    </div>
  );

  if (section === "faq") return (
    <div className="card p-5 space-y-4">
      <Field label="Title" value={draft.faq.title} onChange={(v) => setDraft({ ...draft, faq: { ...draft.faq, title: v } })} />
      {draft.faq.items.map((f, i) => (
        <div key={i} className="p-3 rounded-lg border border-[var(--app-border)] space-y-2">
          <Field label="Question" value={f.question} onChange={(v) => { const next = [...draft.faq.items]; next[i] = { ...f, question: v }; setDraft({ ...draft, faq: { ...draft.faq, items: next } }); }} />
          <Field label="Answer" value={f.answer} onChange={(v) => { const next = [...draft.faq.items]; next[i] = { ...f, answer: v }; setDraft({ ...draft, faq: { ...draft.faq, items: next } }); }} rows={3} />
          <button onClick={() => setDraft({ ...draft, faq: { ...draft.faq, items: draft.faq.items.filter((_, ix) => ix !== i) } })} className="text-xs text-red-400">Remove</button>
        </div>
      ))}
      <button onClick={() => setDraft({ ...draft, faq: { ...draft.faq, items: [...draft.faq.items, { question: "", answer: "" }] } })} className="text-xs px-3 py-1.5 rounded-md border border-[var(--app-border)] hover:bg-[var(--app-input-bg)]">+ Add FAQ</button>
    </div>
  );

  if (section === "bottomCta") return (
    <div className="card p-5 space-y-4">
      <Field label="Title" value={draft.bottomCta.title} onChange={(v) => setDraft({ ...draft, bottomCta: { ...draft.bottomCta, title: v } })} />
      <Field label="Subtitle" value={draft.bottomCta.subtitle} onChange={(v) => setDraft({ ...draft, bottomCta: { ...draft.bottomCta, subtitle: v } })} />
      <Field label="Button text" value={draft.bottomCta.buttonText} onChange={(v) => setDraft({ ...draft, bottomCta: { ...draft.bottomCta, buttonText: v } })} />
    </div>
  );

  if (section === "footer") return (
    <div className="card p-5 space-y-4">
      <Field label="Copyright" value={draft.footer.copyright} onChange={(v) => setDraft({ ...draft, footer: { ...draft.footer, copyright: v } })} />
      <Field label="Disclaimer" value={draft.footer.disclaimer} onChange={(v) => setDraft({ ...draft, footer: { ...draft.footer, disclaimer: v } })} rows={2} />
    </div>
  );

  return null;
}

// ─── Webinar section editor ───────────────────────────────────────

function WebinarSectionEditor({ draft, setDraft, section }: { draft: WebinarPageContent; setDraft: (d: WebinarPageContent) => void; section: string }) {
  const h = draft.hero;
  const setHero = (patch: Partial<typeof h>) => setDraft({ ...draft, hero: { ...h, ...patch } });

  if (section === "hero") return (
    <div className="card p-5 space-y-4">
      <Field label="Badge" value={h.badge} onChange={(v) => setHero({ badge: v })} />
      <Field label="Headline" value={h.headline} onChange={(v) => setHero({ headline: v })} />
      <Field label="Subheadline" value={h.subheadline} onChange={(v) => setHero({ subheadline: v })} rows={3} />
      <Field label="Timer Label" value={h.timerLabel} onChange={(v) => setHero({ timerLabel: v })} />
      <Field label="Button Text" value={h.buttonText} onChange={(v) => setHero({ buttonText: v })} />
      <div>
        <div className="text-xs uppercase tracking-wider text-[var(--app-text-muted)] mb-2">Bullets</div>
        {h.bullets.map((b, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input value={b} onChange={(e) => { const next = [...h.bullets]; next[i] = e.target.value; setHero({ bullets: next }); }} className="flex-1 theme-input rounded-lg px-3 py-2 text-sm" />
            <button onClick={() => setHero({ bullets: h.bullets.filter((_, ix) => ix !== i) })} className="text-xs text-red-400 px-2">✕</button>
          </div>
        ))}
        <button onClick={() => setHero({ bullets: [...h.bullets, ""] })} className="text-xs px-3 py-1.5 rounded-md border border-[var(--app-border)] hover:bg-[var(--app-input-bg)]">+ Add Bullet</button>
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-[var(--app-text-muted)] mb-2">Stats</div>
        {h.stats.map((s, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 mb-2">
            <input value={s.value} onChange={(e) => { const next = [...h.stats]; next[i] = { ...s, value: e.target.value }; setHero({ stats: next }); }} placeholder="Value" className="theme-input rounded-lg px-3 py-2 text-sm" />
            <input value={s.label} onChange={(e) => { const next = [...h.stats]; next[i] = { ...s, label: e.target.value }; setHero({ stats: next }); }} placeholder="Label" className="theme-input rounded-lg px-3 py-2 text-sm" />
          </div>
        ))}
      </div>
    </div>
  );

  if (section === "watchPage") {
    const w = draft.watchPage;
    return (
      <div className="card p-5 space-y-4">
        <Field label="Welcome Heading (use {name} for personalization)" value={w.welcomeHeading} onChange={(v) => setDraft({ ...draft, watchPage: { ...w, welcomeHeading: v } })} />
        <Field label="Subtitle" value={w.subtitle} onChange={(v) => setDraft({ ...draft, watchPage: { ...w, subtitle: v } })} />
        <Field label="CTA Title" value={w.ctaTitle} onChange={(v) => setDraft({ ...draft, watchPage: { ...w, ctaTitle: v } })} />
        <Field label="CTA Subtitle" value={w.ctaSubtitle} onChange={(v) => setDraft({ ...draft, watchPage: { ...w, ctaSubtitle: v } })} />
        <Field label="CTA Button Text" value={w.ctaButton} onChange={(v) => setDraft({ ...draft, watchPage: { ...w, ctaButton: v } })} />
      </div>
    );
  }

  if (section === "takeaways") return (
    <div className="card p-5 space-y-4">
      {draft.takeaways.map((t, i) => (
        <div key={i} className="p-3 rounded-lg border border-[var(--app-border)] space-y-2">
          <div className="grid grid-cols-[60px_1fr] gap-2">
            <Field label="Icon" value={t.icon} onChange={(v) => { const next = [...draft.takeaways]; next[i] = { ...t, icon: v }; setDraft({ ...draft, takeaways: next }); }} />
            <Field label="Title" value={t.title} onChange={(v) => { const next = [...draft.takeaways]; next[i] = { ...t, title: v }; setDraft({ ...draft, takeaways: next }); }} />
          </div>
          <Field label="Description" value={t.description} onChange={(v) => { const next = [...draft.takeaways]; next[i] = { ...t, description: v }; setDraft({ ...draft, takeaways: next }); }} rows={2} />
          <button onClick={() => setDraft({ ...draft, takeaways: draft.takeaways.filter((_, ix) => ix !== i) })} className="text-xs text-red-400">Remove</button>
        </div>
      ))}
      <button onClick={() => setDraft({ ...draft, takeaways: [...draft.takeaways, { icon: "✨", title: "", description: "" }] })} className="text-xs px-3 py-1.5 rounded-md border border-[var(--app-border)] hover:bg-[var(--app-input-bg)]">+ Add Takeaway</button>
    </div>
  );

  if (section === "footer") return (
    <div className="card p-5 space-y-4">
      <Field label="Copyright" value={draft.footer.copyright} onChange={(v) => setDraft({ ...draft, footer: { ...draft.footer, copyright: v } })} />
      <Field label="Disclaimer" value={draft.footer.disclaimer} onChange={(v) => setDraft({ ...draft, footer: { ...draft.footer, disclaimer: v } })} rows={2} />
    </div>
  );

  return null;
}
