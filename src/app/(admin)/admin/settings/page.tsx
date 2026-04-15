"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { getPermissions } from "@/lib/permissions";

/**
 * Compress an image file to a smaller base64 data URL.
 * Resizes to maxDim and compresses as JPEG/WebP.
 */
function compressImage(file: File, maxDim: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        // Try WebP first, fall back to JPEG
        let dataUrl = canvas.toDataURL("image/webp", quality);
        if (!dataUrl.startsWith("data:image/webp")) {
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ─── NAV ITEMS (must match partner layout) ──────────────────────────────────

const ALL_NAV_ITEMS = [
  { id: "home", label: "Home", icon: "🏠" },
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "training", label: "Partner Training", icon: "🎓" },
  { id: "deals", label: "My Deals", icon: "💼" },
  { id: "downline", label: "Downline", icon: "👥" },
  { id: "commissions", label: "Commissions", icon: "💰" },
  { id: "submit-client", label: "Submit Client", icon: "📩" },
  { id: "referral-links", label: "Referral Links", icon: "🔗" },
  { id: "documents", label: "Documents", icon: "📄" },
  { id: "conference", label: "Live Weekly Call!", icon: "📹" },
];

// Mirror of ADMIN_NAV_ITEMS in src/app/(admin)/admin/layout.tsx. Update
// here whenever the admin sidebar gains or loses an item. Used by the
// Admin Navigation editor in the settings page.
const ALL_ADMIN_NAV_ITEMS = [
  { id: "partners", label: "Partners", icon: "👥" },
  { id: "deals", label: "Deals", icon: "💼" },
  { id: "communications", label: "Communications", icon: "📧" },
  { id: "training", label: "Training", icon: "🎓" },
  { id: "conference", label: "Live Weekly", icon: "📹" },
  { id: "documents", label: "Documents", icon: "📄" },
  { id: "support", label: "Support", icon: "🎫" },
  { id: "chat", label: "Live Chat", icon: "💬" },
  { id: "reports", label: "Reports", icon: "📈" },
  { id: "revenue", label: "Revenue", icon: "💵" },
  { id: "payouts", label: "Payouts", icon: "💳" },
  { id: "settings", label: "Settings", icon: "⚙️" },
  { id: "users", label: "Admin Users", icon: "🛡️" },
  { id: "dev", label: "Development", icon: "🛠️" },
  { id: "features", label: "Feature Requests", icon: "✨" },
];

// ─── TYPES ──────────────────────────────────────────────────────────────────

interface Announcement {
  title: string;
  body: string;
  date: string;
  badge: string;
  badgeColor: string;
}

interface UpcomingEvent {
  icon: string;
  title: string;
  body: string;
  date: string;
  cta: string;
}

interface ReferralOpp {
  title: string;
  description: string;
  cta: string;
  highlighted: boolean;
}

type TabId = "branding" | "navigation" | "homepage" | "commissions" | "agreements";

const TABS: { id: TabId; label: string }[] = [
  { id: "branding", label: "Branding" },
  { id: "navigation", label: "Navigation" },
  { id: "homepage", label: "Home Page" },
  { id: "commissions", label: "Commissions" },
  { id: "agreements", label: "Agreements" },
];

// ─── DEFAULT HOME CONTENT ───────────────────────────────────────────────────

const DEFAULT_ANNOUNCEMENTS: Announcement[] = [
  { title: "New IEEPA Filing Window Open", body: "The latest IEEPA executive order has expanded eligibility. Review the updated criteria and start referring eligible importers today.", date: "Mar 22, 2026", badge: "New", badgeColor: "green" },
  { title: "Commission Payout Schedule Update", body: "Starting April, payouts will be processed bi-weekly instead of monthly. Check your Commissions tab for details.", date: "Mar 18, 2026", badge: "Important", badgeColor: "yellow" },
  { title: "Portal Improvements Deployed", body: "We've added deal tracking enhancements, improved mobile layouts, and faster load times across the portal.", date: "Mar 15, 2026", badge: "Update", badgeColor: "blue" },
];

const DEFAULT_EVENTS: UpcomingEvent[] = [
  { icon: "📞", title: "Weekly Partner Training Call", body: "Join us every Wednesday at 2pm EST for tips on maximizing referrals.", date: "Mar 26, 2026", cta: "Join Call" },
  { icon: "🎥", title: "Q2 Kickoff Webinar", body: "Learn about new product lines and updated commission structures for Q2.", date: "Apr 1, 2026", cta: "Register" },
  { icon: "🎉", title: "Partner Appreciation Happy Hour", body: "Virtual networking event for our top partners. Prizes and giveaways!", date: "Apr 10, 2026", cta: "RSVP" },
];

const DEFAULT_REFERRAL_OPPS: ReferralOpp[] = [
  { title: "Recruit Sub-Partners", description: "Earn L2 commissions on every deal your recruited partners close. Share your partner referral link.", cta: "Share Link", highlighted: true },
  { title: "Cross-Referral Program", description: "Refer clients to our estate planning or business litigation divisions and earn a flat referral fee.", cta: "Learn More", highlighted: false },
  { title: "Volume Bonus", description: "Close 10+ deals this quarter and unlock a 5% bonus on all commissions earned.", cta: "View Progress", highlighted: false },
];

// ─── COMPONENT ──────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { data: session } = useSession();
  const permissions = getPermissions((session?.user as any)?.role || "admin");
  const allowedTabs = TABS.filter((t) => permissions.settingsTabs.includes(t.id));
  const defaultTab = allowedTabs.length > 0 ? allowedTabs[0].id : "branding";

  const [tab, setTab] = useState<TabId>(defaultTab);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Branding
  const [firmName, setFirmName] = useState("");
  const [firmShort, setFirmShort] = useState("");
  const [firmSlogan, setFirmSlogan] = useState("");
  const [firmPhone, setFirmPhone] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");

  // Commissions
  const [l1Rate, setL1Rate] = useState("25");
  const [l2Rate, setL2Rate] = useState("5");
  const [l3Rate, setL3Rate] = useState("0");
  const [l3Enabled, setL3Enabled] = useState(false);

  // Agreement templates (SignWell template IDs)
  const [agreementTemplate25, setAgreementTemplate25] = useState("");
  const [agreementTemplate20, setAgreementTemplate20] = useState("");
  const [agreementTemplate15, setAgreementTemplate15] = useState("");
  const [agreementTemplate10, setAgreementTemplate10] = useState("");
  const [agreementTemplateEnterprise, setAgreementTemplateEnterprise] = useState("");

  // Navigation
  const [hiddenNavItems, setHiddenNavItems] = useState<string[]>([]);
  const [navOrder, setNavOrder] = useState<string[]>(ALL_NAV_ITEMS.map((n) => n.id));
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  // Per-item label + icon overrides keyed by `<scope>.<itemId>`.
  // Scope is either "partner" or "admin". Icons are base64 data URLs.
  const [navLabels, setNavLabels] = useState<Record<string, string>>({});
  const [navIcons, setNavIcons] = useState<Record<string, string>>({});
  // Which navigation scope is being edited in the Navigation tab.
  const [navScope, setNavScope] = useState<"partner" | "admin">("partner");

  // Home page content
  const [announcements, setAnnouncements] = useState<Announcement[]>(DEFAULT_ANNOUNCEMENTS);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>(DEFAULT_EVENTS);
  const [referralOpps, setReferralOpps] = useState<ReferralOpp[]>(DEFAULT_REFERRAL_OPPS);
  const [leaderboardEnabled, setLeaderboardEnabled] = useState(true);
  const [liveChatEnabled, setLiveChatEnabled] = useState(false);

  // ── Fetch settings ────────────────────────────────────────────────────

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings");
      if (!res.ok) throw new Error();
      const { settings } = await res.json();

      setFirmName(settings.firmName);
      setFirmShort(settings.firmShort);
      setFirmSlogan(settings.firmSlogan);
      setFirmPhone(settings.firmPhone);
      setSupportEmail(settings.supportEmail || "");
      setLogoUrl(settings.logoUrl || "");
      setFaviconUrl(settings.faviconUrl || "");

      setL1Rate(String(Math.round(settings.l1Rate * 100)));
      setL2Rate(String(Math.round(settings.l2Rate * 100)));
      setL3Rate(String(Math.round(settings.l3Rate * 100)));
      setL3Enabled(settings.l3Enabled);
      setAgreementTemplate25(settings.agreementTemplate25 || "");
      setAgreementTemplate20(settings.agreementTemplate20 || "");
      setAgreementTemplate15(settings.agreementTemplate15 || "");
      setAgreementTemplate10(settings.agreementTemplate10 || "");
      setAgreementTemplateEnterprise(settings.agreementTemplateEnterprise || "");

      try { setHiddenNavItems(JSON.parse(settings.hiddenNavItems || "[]")); } catch { setHiddenNavItems([]); }
      try { setNavLabels(JSON.parse(settings.navLabels || "{}")); } catch { setNavLabels({}); }
      try { setNavIcons(JSON.parse(settings.navIcons || "{}")); } catch { setNavIcons({}); }
      try {
        const order = JSON.parse(settings.navOrder || "[]");
        if (order.length > 0) setNavOrder(order);
      } catch {}
      try {
        const ann = JSON.parse(settings.announcements || "[]");
        if (ann.length > 0) setAnnouncements(ann);
      } catch {}
      try {
        const ev = JSON.parse(settings.upcomingEvents || "[]");
        if (ev.length > 0) setUpcomingEvents(ev);
      } catch {}
      try {
        const ro = JSON.parse(settings.referralOpportunities || "[]");
        if (ro.length > 0) setReferralOpps(ro);
      } catch {}
      setLeaderboardEnabled(settings.leaderboardEnabled);
      if (settings.liveChatEnabled !== undefined) setLiveChatEnabled(settings.liveChatEnabled);
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // ── Save settings ─────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        firmName, firmShort, firmSlogan, firmPhone, supportEmail, logoUrl, faviconUrl,
        agreementTemplate25, agreementTemplate20, agreementTemplate15, agreementTemplate10, agreementTemplateEnterprise,
        l1Rate: parseFloat(l1Rate) / 100,
        l2Rate: parseFloat(l2Rate) / 100,
        l3Rate: parseFloat(l3Rate) / 100,
        l3Enabled,
        hiddenNavItems: JSON.stringify(hiddenNavItems),
        navOrder: JSON.stringify(navOrder),
        navLabels: JSON.stringify(navLabels),
        navIcons: JSON.stringify(navIcons),
        announcements: JSON.stringify(announcements),
        upcomingEvents: JSON.stringify(upcomingEvents),
        referralOpportunities: JSON.stringify(referralOpps),
        leaderboardEnabled,
        liveChatEnabled,
      };

      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to save: ${err.error || res.statusText}`);
      }
    } catch (e: any) {
      alert(`Save error: ${e.message || "Network error"}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Nav toggle ────────────────────────────────────────────────────────

  const toggleNavItem = (id: string) => {
    setHiddenNavItems((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // ── Nav drag reorder ──────────────────────────────────────────────────

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const newOrder = [...navOrder];
    const [moved] = newOrder.splice(dragIdx, 1);
    newOrder.splice(idx, 0, moved);
    setNavOrder(newOrder);
    setDragIdx(idx);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
  };

  const moveNav = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= navOrder.length) return;
    const newOrder = [...navOrder];
    [newOrder[idx], newOrder[newIdx]] = [newOrder[newIdx], newOrder[idx]];
    setNavOrder(newOrder);
  };

  // Resolve nav items in order
  const orderedNavItems = navOrder
    .map((id) => ALL_NAV_ITEMS.find((n) => n.id === id))
    .filter(Boolean) as typeof ALL_NAV_ITEMS;

  // ── Announcement CRUD ─────────────────────────────────────────────────

  const updateAnnouncement = (idx: number, field: keyof Announcement, value: string) => {
    setAnnouncements((prev) => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a));
  };

  const addAnnouncement = () => {
    setAnnouncements((prev) => [...prev, { title: "", body: "", date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), badge: "New", badgeColor: "green" }]);
  };

  const removeAnnouncement = (idx: number) => {
    setAnnouncements((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Event CRUD ────────────────────────────────────────────────────────

  const updateEvent = (idx: number, field: keyof UpcomingEvent, value: string) => {
    setUpcomingEvents((prev) => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  };

  const addEvent = () => {
    setUpcomingEvents((prev) => [...prev, { icon: "📅", title: "", body: "", date: "", cta: "Join" }]);
  };

  const removeEvent = (idx: number) => {
    setUpcomingEvents((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Referral Opp CRUD ─────────────────────────────────────────────────

  const updateReferralOpp = (idx: number, field: keyof ReferralOpp, value: any) => {
    setReferralOpps((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const addReferralOpp = () => {
    setReferralOpps((prev) => [...prev, { title: "", description: "", cta: "Learn More", highlighted: false }]);
  };

  const removeReferralOpp = (idx: number) => {
    setReferralOpps((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Styling ───────────────────────────────────────────────────────────

  const inputClass = "w-full bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-4 py-3 text-[var(--app-text)] font-body text-sm outline-none focus:border-brand-gold/40 transition-colors placeholder:text-[var(--app-text-muted)]";
  const labelClass = "font-body text-[11px] tracking-[1px] uppercase text-[var(--app-text-secondary)] mb-1.5 block";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="font-body text-sm text-[var(--app-text-muted)]">Loading settings...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-[22px] font-bold mb-1">Settings</h2>
          <p className="font-body text-[13px] text-[var(--app-text-muted)]">Configure the partner portal branding, layout, content, and commission rates.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-gold text-[12px] px-5 py-2.5 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save All Settings"}
        </button>
      </div>

      {saved && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg font-body text-[13px] text-green-400">
          Settings saved successfully. Changes will reflect on the partner portal.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {allowedTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`font-body text-sm px-4 py-1.5 rounded-full whitespace-nowrap transition ${
              tab === t.id
                ? "bg-brand-gold/20 text-brand-gold"
                : "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text-secondary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ BRANDING TAB ═══ */}
      {tab === "branding" && (
        <div className="space-y-6">
          <div className="card p-5 sm:p-6">
            <div className="font-body font-semibold text-sm mb-4">Branding & Contact</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Firm Name</label>
                <input className={inputClass} value={firmName} onChange={(e) => setFirmName(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Short Name</label>
                <input className={inputClass} value={firmShort} onChange={(e) => setFirmShort(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Slogan</label>
                <input className={inputClass} value={firmSlogan} onChange={(e) => setFirmSlogan(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Support Phone</label>
                <input className={inputClass} value={firmPhone} onChange={(e) => setFirmPhone(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Support Email</label>
                <input className={inputClass} value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} placeholder="support@fintella.partners" />
              </div>
            </div>
          </div>

          {/* Logo & Favicon Upload */}
          <div className="card p-5 sm:p-6">
            <div className="font-body font-semibold text-sm mb-4">Company Logo & Favicon</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

              {/* Logo Upload */}
              <div>
                <label className={labelClass}>Company Logo</label>
                <p className="font-body text-[11px] theme-text-muted mb-3">Displayed in the partner portal sidebar. PNG, JPEG, SVG, or WebP. Images are auto-compressed.</p>
                <div className="flex items-center gap-4 mb-3">
                  {logoUrl ? (
                    <div className="w-16 h-16 rounded-lg border flex items-center justify-center overflow-hidden p-1" style={{ borderColor: "var(--app-border)", background: "var(--app-card-bg)" }}>
                      <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-lg border flex items-center justify-center" style={{ borderColor: "var(--app-border)", background: "var(--app-card-bg)" }}>
                      <span className="theme-text-faint text-[10px] text-center">No logo</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <label className="font-body text-[11px] text-brand-gold/70 border border-brand-gold/20 rounded-lg px-3 py-1.5 hover:bg-brand-gold/10 transition-colors cursor-pointer text-center">
                      Upload Logo
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            // SVGs are small, use as-is; raster images get compressed
                            if (file.type === "image/svg+xml") {
                              const reader = new FileReader();
                              reader.onload = () => setLogoUrl(reader.result as string);
                              reader.readAsDataURL(file);
                            } else {
                              const compressed = await compressImage(file, 400, 0.8);
                              setLogoUrl(compressed);
                            }
                          } catch { alert("Failed to process image."); }
                        }}
                      />
                    </label>
                    {logoUrl && (
                      <button
                        type="button"
                        onClick={() => setLogoUrl("")}
                        className="font-body text-[11px] text-red-400/60 hover:text-red-400 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Favicon Upload */}
              <div>
                <label className={labelClass}>Favicon</label>
                <p className="font-body text-[11px] theme-text-muted mb-3">Displayed in browser tab. Square PNG, ICO, or SVG. Images are auto-compressed.</p>
                <div className="flex items-center gap-4 mb-3">
                  {faviconUrl ? (
                    <div className="w-16 h-16 rounded-lg border flex items-center justify-center overflow-hidden p-2" style={{ borderColor: "var(--app-border)", background: "var(--app-card-bg)" }}>
                      <img src={faviconUrl} alt="Favicon" className="max-w-full max-h-full object-contain" />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-lg border flex items-center justify-center" style={{ borderColor: "var(--app-border)", background: "var(--app-card-bg)" }}>
                      <span className="theme-text-faint text-[10px] text-center">No favicon</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <label className="font-body text-[11px] text-brand-gold/70 border border-brand-gold/20 rounded-lg px-3 py-1.5 hover:bg-brand-gold/10 transition-colors cursor-pointer text-center">
                      Upload Favicon
                      <input
                        type="file"
                        accept="image/png,image/x-icon,image/svg+xml,image/webp"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            if (file.type === "image/svg+xml" || file.type === "image/x-icon") {
                              const reader = new FileReader();
                              reader.onload = () => setFaviconUrl(reader.result as string);
                              reader.readAsDataURL(file);
                            } else {
                              const compressed = await compressImage(file, 128, 0.85);
                              setFaviconUrl(compressed);
                            }
                          } catch { alert("Failed to process image."); }
                        }}
                      />
                    </label>
                    {faviconUrl && (
                      <button
                        type="button"
                        onClick={() => setFaviconUrl("")}
                        className="font-body text-[11px] text-red-400/60 hover:text-red-400 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ NAVIGATION TAB ═══ */}
      {tab === "navigation" && (
        <div className="space-y-4">
          {/* Scope toggle */}
          <div className="card p-2 flex gap-1">
            {(["partner", "admin"] as const).map((scope) => (
              <button
                key={scope}
                onClick={() => setNavScope(scope)}
                className={`flex-1 font-body text-sm px-4 py-2 rounded transition-colors ${
                  navScope === scope
                    ? "bg-brand-gold/15 text-brand-gold"
                    : "text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"
                }`}
              >
                {scope === "partner" ? "Partner Navigation" : "Admin Navigation"}
              </button>
            ))}
          </div>

          {navScope === "partner" ? (
            <div className="card p-5 sm:p-6">
              <div className="font-body font-semibold text-sm mb-1">Partner Navigation</div>
              <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-5">
                Drag to reorder, toggle visibility, edit labels, or upload a custom icon. Changes sync to every partner on next page load.
              </p>
              <div className="space-y-3">
                {orderedNavItems.map((item, idx) => {
                  const isVisible = !hiddenNavItems.includes(item.id);
                  const isDragging = dragIdx === idx;
                  const key = `partner.${item.id}`;
                  const currentLabel = navLabels[key] ?? "";
                  const currentIcon = navIcons[key] ?? "";
                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                      className={`p-3 border rounded-lg transition-all ${
                        isDragging
                          ? "bg-brand-gold/10 border-brand-gold/30 scale-[1.02] shadow-lg"
                          : "bg-[var(--app-card-bg)] border-[var(--app-border)]"
                      } ${!isVisible ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-center gap-3 mb-3 cursor-grab active:cursor-grabbing">
                        <div className="flex flex-col gap-[2px] shrink-0">
                          <div className="w-4 h-[2px] bg-[var(--app-input-bg)] rounded" />
                          <div className="w-4 h-[2px] bg-[var(--app-input-bg)] rounded" />
                          <div className="w-4 h-[2px] bg-[var(--app-input-bg)] rounded" />
                        </div>
                        <span className="font-body text-[12px] text-[var(--app-text-muted)] w-5 text-center">{idx + 1}</span>
                        {currentIcon ? (
                          <img src={currentIcon} alt="" className="w-6 h-6 object-contain" />
                        ) : (
                          <span className="text-lg">{item.icon}</span>
                        )}
                        <span className="font-body text-sm text-[var(--app-text)] flex-1">{currentLabel || item.label}</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => moveNav(idx, -1)} disabled={idx === 0} className="w-7 h-7 flex items-center justify-center rounded bg-[var(--app-card-bg)] text-[var(--app-text-muted)] disabled:opacity-20 text-[11px]">▲</button>
                          <button onClick={() => moveNav(idx, 1)} disabled={idx === orderedNavItems.length - 1} className="w-7 h-7 flex items-center justify-center rounded bg-[var(--app-card-bg)] text-[var(--app-text-muted)] disabled:opacity-20 text-[11px]">▼</button>
                          <button
                            onClick={() => toggleNavItem(item.id)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isVisible ? "bg-green-500" : "bg-[var(--app-input-bg)]"}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isVisible ? "translate-x-6" : "translate-x-1"}`} />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                        <div>
                          <label className="font-body text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] block mb-1">Label</label>
                          <input
                            type="text"
                            value={currentLabel}
                            onChange={(e) => setNavLabels({ ...navLabels, [key]: e.target.value })}
                            placeholder={item.label}
                            className="w-full bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded px-3 py-2 text-[var(--app-text)] font-body text-sm outline-none focus:border-brand-gold/40"
                          />
                        </div>
                        <div>
                          <label className="font-body text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] block mb-1">Custom Icon</label>
                          <div className="flex items-center gap-2">
                            <label className="cursor-pointer bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded px-3 py-2 font-body text-[12px] text-[var(--app-text-secondary)] hover:bg-[var(--app-card-bg)]">
                              Upload
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const dataUrl = await compressImage(file, 128, 0.85);
                                  setNavIcons({ ...navIcons, [key]: dataUrl });
                                }}
                              />
                            </label>
                            {currentIcon && (
                              <button
                                type="button"
                                onClick={() => {
                                  const next = { ...navIcons };
                                  delete next[key];
                                  setNavIcons(next);
                                }}
                                className="font-body text-[11px] text-red-400/60 hover:text-red-400"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="card p-5 sm:p-6">
              <div className="font-body font-semibold text-sm mb-1">Admin Navigation</div>
              <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-5">
                Rename admin sidebar items or upload custom icons. Affects the admin panel sidebar for everyone with admin access.
              </p>
              <div className="space-y-3">
                {ALL_ADMIN_NAV_ITEMS.map((item) => {
                  const key = `admin.${item.id}`;
                  const currentLabel = navLabels[key] ?? "";
                  const currentIcon = navIcons[key] ?? "";
                  return (
                    <div key={item.id} className="p-3 border border-[var(--app-border)] rounded-lg bg-[var(--app-card-bg)]">
                      <div className="flex items-center gap-3 mb-3">
                        {currentIcon ? (
                          <img src={currentIcon} alt="" className="w-6 h-6 object-contain" />
                        ) : (
                          <span className="text-lg">{item.icon}</span>
                        )}
                        <span className="font-body text-sm text-[var(--app-text)] flex-1">{currentLabel || item.label}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                        <div>
                          <label className="font-body text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] block mb-1">Label</label>
                          <input
                            type="text"
                            value={currentLabel}
                            onChange={(e) => setNavLabels({ ...navLabels, [key]: e.target.value })}
                            placeholder={item.label}
                            className="w-full bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded px-3 py-2 text-[var(--app-text)] font-body text-sm outline-none focus:border-brand-gold/40"
                          />
                        </div>
                        <div>
                          <label className="font-body text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] block mb-1">Custom Icon</label>
                          <div className="flex items-center gap-2">
                            <label className="cursor-pointer bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded px-3 py-2 font-body text-[12px] text-[var(--app-text-secondary)] hover:bg-[var(--app-card-bg)]">
                              Upload
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const dataUrl = await compressImage(file, 128, 0.85);
                                  setNavIcons({ ...navIcons, [key]: dataUrl });
                                }}
                              />
                            </label>
                            {currentIcon && (
                              <button
                                type="button"
                                onClick={() => {
                                  const next = { ...navIcons };
                                  delete next[key];
                                  setNavIcons(next);
                                }}
                                className="font-body text-[11px] text-red-400/60 hover:text-red-400"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ HOME PAGE TAB ═══ */}
      {tab === "homepage" && (
        <div className="space-y-6">
          {/* Leaderboard toggle */}
          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-body font-semibold text-sm">Leaderboard</div>
                <p className="font-body text-[12px] text-[var(--app-text-muted)] mt-0.5">Show partner leaderboard on the Home page</p>
              </div>
              <button
                onClick={() => setLeaderboardEnabled(!leaderboardEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${leaderboardEnabled ? "bg-green-500" : "bg-[var(--app-input-bg)]"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${leaderboardEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          </div>

          {/* Live Chat toggle */}
          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-body font-semibold text-sm">Live Support Chat</div>
                <p className="font-body text-[12px] text-[var(--app-text-muted)] mt-0.5">Enable the live chat widget for partners to message support agents in real-time</p>
              </div>
              <button
                onClick={() => setLiveChatEnabled(!liveChatEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${liveChatEnabled ? "bg-green-500" : "bg-[var(--app-input-bg)]"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${liveChatEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            {liveChatEnabled && (
              <div className="mt-3 p-2.5 rounded-lg bg-green-500/5 border border-green-500/10">
                <div className="font-body text-[11px] text-green-400">Chat is active. Partners will see the chat widget. Admin agents can respond from the Live Chat page.</div>
              </div>
            )}
          </div>

          {/* Announcements */}
          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="font-body font-semibold text-sm">Announcements</div>
              <button onClick={addAnnouncement} className="font-body text-[11px] text-brand-gold border border-brand-gold/20 rounded-lg px-3 py-1.5 hover:bg-brand-gold/10 transition-colors">
                + Add
              </button>
            </div>
            {announcements.map((ann, idx) => (
              <div key={idx} className="p-4 bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg mb-3 last:mb-0">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input className={inputClass} value={ann.title} onChange={(e) => updateAnnouncement(idx, "title", e.target.value)} placeholder="Title" />
                    <input className={inputClass} value={ann.badge} onChange={(e) => updateAnnouncement(idx, "badge", e.target.value)} placeholder="Badge (New, Important...)" />
                    <input className={inputClass} value={ann.date} onChange={(e) => updateAnnouncement(idx, "date", e.target.value)} placeholder="Date" />
                  </div>
                  <button onClick={() => removeAnnouncement(idx)} className="text-red-400/60 hover:text-red-400 text-[18px] shrink-0 mt-1">×</button>
                </div>
                <textarea
                  className={`${inputClass} resize-none`}
                  rows={2}
                  value={ann.body}
                  onChange={(e) => updateAnnouncement(idx, "body", e.target.value)}
                  placeholder="Announcement body text"
                />
              </div>
            ))}
          </div>

          {/* Upcoming Events */}
          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="font-body font-semibold text-sm">Upcoming Events</div>
              <button onClick={addEvent} className="font-body text-[11px] text-brand-gold border border-brand-gold/20 rounded-lg px-3 py-1.5 hover:bg-brand-gold/10 transition-colors">
                + Add
              </button>
            </div>
            {upcomingEvents.map((ev, idx) => (
              <div key={idx} className="p-4 bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg mb-3 last:mb-0">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <input className={inputClass} value={ev.icon} onChange={(e) => updateEvent(idx, "icon", e.target.value)} placeholder="Icon (emoji)" />
                    <input className={`${inputClass} sm:col-span-2`} value={ev.title} onChange={(e) => updateEvent(idx, "title", e.target.value)} placeholder="Event title" />
                    <input className={inputClass} value={ev.date} onChange={(e) => updateEvent(idx, "date", e.target.value)} placeholder="Date" />
                  </div>
                  <button onClick={() => removeEvent(idx)} className="text-red-400/60 hover:text-red-400 text-[18px] shrink-0 mt-1">×</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                  <textarea className={`${inputClass} resize-none`} rows={2} value={ev.body} onChange={(e) => updateEvent(idx, "body", e.target.value)} placeholder="Event description" />
                  <input className={inputClass} value={ev.cta} onChange={(e) => updateEvent(idx, "cta", e.target.value)} placeholder="Button text" />
                </div>
              </div>
            ))}
          </div>

          {/* Referral Opportunities */}
          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="font-body font-semibold text-sm">Referral Opportunities</div>
              <button onClick={addReferralOpp} className="font-body text-[11px] text-brand-gold border border-brand-gold/20 rounded-lg px-3 py-1.5 hover:bg-brand-gold/10 transition-colors">
                + Add
              </button>
            </div>
            {referralOpps.map((opp, idx) => (
              <div key={idx} className="p-4 bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg mb-3 last:mb-0">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input className={inputClass} value={opp.title} onChange={(e) => updateReferralOpp(idx, "title", e.target.value)} placeholder="Title" />
                    <input className={inputClass} value={opp.cta} onChange={(e) => updateReferralOpp(idx, "cta", e.target.value)} placeholder="Button text" />
                  </div>
                  <button onClick={() => removeReferralOpp(idx)} className="text-red-400/60 hover:text-red-400 text-[18px] shrink-0 mt-1">×</button>
                </div>
                <textarea className={`${inputClass} resize-none`} rows={2} value={opp.description} onChange={(e) => updateReferralOpp(idx, "description", e.target.value)} placeholder="Description" />
                <label className="flex items-center gap-2 mt-3 cursor-pointer">
                  <input type="checkbox" checked={opp.highlighted} onChange={(e) => updateReferralOpp(idx, "highlighted", e.target.checked)} className="accent-brand-gold" />
                  <span className="font-body text-[12px] text-[var(--app-text-secondary)]">Highlighted (featured card)</span>
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ COMMISSIONS TAB ═══ */}
      {tab === "commissions" && (
        <div className="card p-5 sm:p-6">
          <div className="font-body font-semibold text-sm mb-1">Commission Structure</div>
          <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-5">
            Partner commissions are calculated as a percentage of the firm fee on each deal.
            The firm fee rate is negotiated per deal at the deal level.
          </p>

          {/* L1 Rate — fixed */}
          <div className="mb-6 p-4 rounded-lg bg-brand-gold/[0.06] border border-brand-gold/20">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-body text-[12px] font-semibold text-brand-gold uppercase tracking-wider">L1 Commission Rate</div>
                <p className="font-body text-[11px] text-[var(--app-text-muted)] mt-1">All L1 partners earn 25% of the firm fee on their direct deals. This is the maximum total commission across all tiers.</p>
              </div>
              <div className="font-display text-3xl font-bold text-brand-gold">25%</div>
            </div>
          </div>

          {/* L2 & L3 Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="p-4 rounded-lg" style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)" }}>
              <div className="font-body text-[12px] font-semibold text-purple-400 uppercase tracking-wider mb-2">L2 Partner Rates</div>
              <div className="flex gap-2 mb-2">
                <span className="font-body text-[11px] bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-full px-2.5 py-0.5">10%</span>
                <span className="font-body text-[11px] bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-full px-2.5 py-0.5">15%</span>
                <span className="font-body text-[11px] bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-full px-2.5 py-0.5">20%</span>
              </div>
              <p className="font-body text-[11px] text-[var(--app-text-muted)]">
                L1 partners choose one of these rates when recruiting an L2 partner. The L1 earns the override (25% minus L2 rate).
              </p>
            </div>
            <div className="p-4 rounded-lg" style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="font-body text-[12px] font-semibold text-blue-400 uppercase tracking-wider">L3 Partner Rates</div>
                <button
                  onClick={() => setL3Enabled(!l3Enabled)}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full shrink-0 transition-colors ${l3Enabled ? "bg-green-500" : "bg-[var(--app-input-bg)]"}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${l3Enabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              {l3Enabled ? (
                <>
                  <div className="flex gap-2 mb-2">
                    <span className="font-body text-[11px] bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full px-2.5 py-0.5">10%</span>
                    <span className="font-body text-[11px] bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full px-2.5 py-0.5">15%</span>
                  </div>
                  <p className="font-body text-[11px] text-[var(--app-text-muted)]">
                    L2 partners choose a rate for their L3 recruits. The override splits between L2 and L1 to total 25%.
                  </p>
                </>
              ) : (
                <p className="font-body text-[11px] text-[var(--app-text-muted)]">
                  L3 recruitment is currently disabled. Enable to allow L2 partners to recruit their own downline.
                </p>
              )}
            </div>
          </div>

          {/* Waterfall example */}
          <div className="p-4 rounded-lg" style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)" }}>
            <div className="font-body text-[12px] font-semibold text-[var(--app-text-secondary)] uppercase tracking-wider mb-3">Commission Waterfall Example</div>
            <div className="space-y-2 font-body text-[12px] text-[var(--app-text-muted)]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-brand-gold" />
                <span><strong className="text-brand-gold">L1 direct deal:</strong> L1 earns 25% of firm fee</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-400" />
                <span><strong className="text-purple-400">L2 deal (at 20%):</strong> L2 earns 20%, L1 override = 5%</span>
              </div>
              {l3Enabled && (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  <span><strong className="text-blue-400">L3 deal (at 10%):</strong> L3 earns 10%, L2 override = 10%, L1 override = 5%</span>
                </div>
              )}
              <div className="flex items-center gap-2 pt-1" style={{ borderTop: "1px solid var(--app-border)" }}>
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span><strong className="text-green-400">Total:</strong> Always 25% of firm fee across all tiers</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ AGREEMENTS TAB ═══ */}
      {tab === "agreements" && (
        <div className="card p-5 sm:p-6">
          <div className="font-body font-semibold text-sm mb-1">Partnership Agreement Templates</div>
          <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-5">
            Enter the SignWell template ID for each commission tier. When a new partner signs up at a specific rate,
            the corresponding template will be used to generate their partnership agreement.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>25% Template (L1 Partners)</label>
              <input className={inputClass} value={agreementTemplate25} onChange={(e) => setAgreementTemplate25(e.target.value)} placeholder="SignWell template ID" />
              <p className="font-body text-[10px] text-[var(--app-text-faint)] mt-1">Direct L1 partners — 25% of firm fee</p>
            </div>
            <div>
              <label className={labelClass}>20% Template (L2 Partners)</label>
              <input className={inputClass} value={agreementTemplate20} onChange={(e) => setAgreementTemplate20(e.target.value)} placeholder="SignWell template ID" />
              <p className="font-body text-[10px] text-[var(--app-text-faint)] mt-1">L2 partners at 20% — L1 earns 5% override</p>
            </div>
            <div>
              <label className={labelClass}>15% Template (L2/L3 Partners)</label>
              <input className={inputClass} value={agreementTemplate15} onChange={(e) => setAgreementTemplate15(e.target.value)} placeholder="SignWell template ID" />
              <p className="font-body text-[10px] text-[var(--app-text-faint)] mt-1">Partners at 15% — upline earns 10% override</p>
            </div>
            <div>
              <label className={labelClass}>10% Template (L2/L3 Partners)</label>
              <input className={inputClass} value={agreementTemplate10} onChange={(e) => setAgreementTemplate10(e.target.value)} placeholder="SignWell template ID" />
              <p className="font-body text-[10px] text-[var(--app-text-faint)] mt-1">Partners at 10% — upline earns 15% override</p>
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Enterprise Partner Agreement Template</label>
              <input className={inputClass} value={agreementTemplateEnterprise} onChange={(e) => setAgreementTemplateEnterprise(e.target.value)} placeholder="SignWell template ID for enterprise agreements" />
              <p className="font-body text-[10px] text-[var(--app-text-faint)] mt-1">Confidential — used for enterprise partners with custom commission rates above 25%</p>
            </div>
          </div>

          <div className="mt-5 p-3.5 bg-brand-gold/[0.06] border border-brand-gold/20 rounded-lg">
            <p className="font-body text-[12px] text-[var(--app-text-muted)] leading-relaxed">
              <strong className="text-brand-gold">How it works:</strong> Upload 4 partnership agreement templates to SignWell (one per commission rate). Copy each template ID and paste it here. When partners sign up via recruitment links, the correct agreement is automatically sent based on the rate their recruiter chose.
            </p>
          </div>
        </div>
      )}

      {/* Bottom save bar */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-gold text-[12px] px-6 py-2.5 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save All Settings"}
        </button>
      </div>
    </div>
  );
}
