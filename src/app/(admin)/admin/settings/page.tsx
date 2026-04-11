"use client";

import { useState, useEffect, useCallback } from "react";

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

type TabId = "branding" | "navigation" | "homepage" | "commissions";

const TABS: { id: TabId; label: string }[] = [
  { id: "branding", label: "Branding" },
  { id: "navigation", label: "Navigation" },
  { id: "homepage", label: "Home Page" },
  { id: "commissions", label: "Commissions" },
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
  const [tab, setTab] = useState<TabId>("branding");
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
  const [l1Rate, setL1Rate] = useState("20");
  const [l2Rate, setL2Rate] = useState("5");
  const [l3Rate, setL3Rate] = useState("0");
  const [l3Enabled, setL3Enabled] = useState(false);

  // Navigation
  const [hiddenNavItems, setHiddenNavItems] = useState<string[]>([]);
  const [navOrder, setNavOrder] = useState<string[]>(ALL_NAV_ITEMS.map((n) => n.id));
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Home page content
  const [announcements, setAnnouncements] = useState<Announcement[]>(DEFAULT_ANNOUNCEMENTS);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>(DEFAULT_EVENTS);
  const [referralOpps, setReferralOpps] = useState<ReferralOpp[]>(DEFAULT_REFERRAL_OPPS);
  const [leaderboardEnabled, setLeaderboardEnabled] = useState(true);

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

      try { setHiddenNavItems(JSON.parse(settings.hiddenNavItems || "[]")); } catch { setHiddenNavItems([]); }
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
        l1Rate: parseFloat(l1Rate) / 100,
        l2Rate: parseFloat(l2Rate) / 100,
        l3Rate: parseFloat(l3Rate) / 100,
        l3Enabled,
        hiddenNavItems: JSON.stringify(hiddenNavItems),
        navOrder: JSON.stringify(navOrder),
        announcements: JSON.stringify(announcements),
        upcomingEvents: JSON.stringify(upcomingEvents),
        referralOpportunities: JSON.stringify(referralOpps),
        leaderboardEnabled,
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

  const inputClass = "w-full bg-white/5 border border-white/[0.12] rounded-lg px-4 py-3 text-white font-body text-sm outline-none focus:border-brand-gold/40 transition-colors placeholder:text-white/30";
  const labelClass = "font-body text-[11px] tracking-[1px] uppercase text-white/50 mb-1.5 block";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="font-body text-sm text-white/40">Loading settings...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-[22px] font-bold mb-1">Settings</h2>
          <p className="font-body text-[13px] text-white/40">Configure the partner portal branding, layout, content, and commission rates.</p>
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
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`font-body text-sm px-4 py-1.5 rounded-full whitespace-nowrap transition ${
              tab === t.id
                ? "bg-brand-gold/20 text-brand-gold"
                : "bg-white/5 text-white/50 hover:text-white/70"
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
                <input className={inputClass} value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} placeholder="support@trln.com" />
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
        <div className="card p-5 sm:p-6">
          <div className="font-body font-semibold text-sm mb-1">Partner Navigation</div>
          <p className="font-body text-[12px] text-white/40 mb-5">Drag to reorder. Toggle visibility on/off.</p>
          <div className="space-y-2">
            {orderedNavItems.map((item, idx) => {
              const isVisible = !hiddenNavItems.includes(item.id);
              const isDragging = dragIdx === idx;
              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center justify-between p-3 border rounded-lg transition-all cursor-grab active:cursor-grabbing ${
                    isDragging
                      ? "bg-brand-gold/10 border-brand-gold/30 scale-[1.02] shadow-lg"
                      : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]"
                  } ${!isVisible ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    {/* Drag handle */}
                    <div className="flex flex-col gap-[2px] shrink-0 cursor-grab">
                      <div className="w-4 h-[2px] bg-white/20 rounded" />
                      <div className="w-4 h-[2px] bg-white/20 rounded" />
                      <div className="w-4 h-[2px] bg-white/20 rounded" />
                    </div>
                    <span className="font-body text-[12px] text-white/30 w-5 text-center">{idx + 1}</span>
                    <span className="text-lg">{item.icon}</span>
                    <span className="font-body text-sm text-white/80">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Move up/down buttons (for mobile/accessibility) */}
                    <button
                      onClick={() => moveNav(idx, -1)}
                      disabled={idx === 0}
                      className="w-7 h-7 flex items-center justify-center rounded bg-white/[0.04] hover:bg-white/[0.08] text-white/40 disabled:opacity-20 transition-colors text-[11px]"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveNav(idx, 1)}
                      disabled={idx === orderedNavItems.length - 1}
                      className="w-7 h-7 flex items-center justify-center rounded bg-white/[0.04] hover:bg-white/[0.08] text-white/40 disabled:opacity-20 transition-colors text-[11px]"
                    >
                      ▼
                    </button>
                    {/* Visibility toggle */}
                    <button
                      onClick={() => toggleNavItem(item.id)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isVisible ? "bg-green-500" : "bg-white/10"}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isVisible ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
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
                <p className="font-body text-[12px] text-white/40 mt-0.5">Show partner leaderboard on the Home page</p>
              </div>
              <button
                onClick={() => setLeaderboardEnabled(!leaderboardEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${leaderboardEnabled ? "bg-green-500" : "bg-white/10"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${leaderboardEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
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
              <div key={idx} className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-lg mb-3 last:mb-0">
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
              <div key={idx} className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-lg mb-3 last:mb-0">
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
              <div key={idx} className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-lg mb-3 last:mb-0">
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
                  <span className="font-body text-[12px] text-white/50">Highlighted (featured card)</span>
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ COMMISSIONS TAB ═══ */}
      {tab === "commissions" && (
        <div className="card p-5 sm:p-6">
          <div className="font-body font-semibold text-sm mb-1">Default Commission Rates</div>
          <p className="font-body text-[12px] text-white/40 mb-2">These are the default rates for all partners. Override per-partner in Partners &rarr; View Partner.</p>
          <p className="font-body text-[11px] text-white/30 mb-5 bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
            The firm fee rate is negotiated per deal and set at the deal level — it is not a global default.
            Commission percentages below are calculated as a percentage of the firm fee on each deal.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>L1 Commission Rate (%)</label>
              <input className={inputClass} type="number" min="0" max="100" value={l1Rate} onChange={(e) => setL1Rate(e.target.value)} />
              <p className="font-body text-[10px] text-white/30 mt-1">Direct referral commission (% of firm fee)</p>
            </div>
            <div>
              <label className={labelClass}>L2 Commission Rate (%)</label>
              <input className={inputClass} type="number" min="0" max="100" value={l2Rate} onChange={(e) => setL2Rate(e.target.value)} />
              <p className="font-body text-[10px] text-white/30 mt-1">Downline commission (% of firm fee)</p>
            </div>
            <div>
              <label className={labelClass}>L3 Commission Rate (%)</label>
              <div className="flex gap-3">
                <input className={`${inputClass} flex-1`} type="number" min="0" max="100" value={l3Rate} onChange={(e) => setL3Rate(e.target.value)} disabled={!l3Enabled} />
                <button
                  onClick={() => setL3Enabled(!l3Enabled)}
                  className={`relative inline-flex h-10 w-16 items-center rounded-lg shrink-0 transition-colors ${l3Enabled ? "bg-green-500" : "bg-white/10"}`}
                >
                  <span className={`inline-block h-6 w-6 transform rounded-md bg-white transition-transform ${l3Enabled ? "translate-x-8" : "translate-x-2"}`} />
                </button>
              </div>
              <p className="font-body text-[10px] text-white/30 mt-1">Third-level downline (disabled by default)</p>
            </div>
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
