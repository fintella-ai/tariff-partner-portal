"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { getPermissions } from "@/lib/permissions";
import { reconcileNavOrder } from "@/lib/reconcileNavOrder";
import GoogleCalendarCard from "@/components/admin/GoogleCalendarCard";
import AdminInboxesCard from "@/components/admin/AdminInboxesCard";
import MyAvailabilityCard from "@/components/admin/MyAvailabilityCard";
import PortalThemePicker from "@/components/admin/PortalThemePicker";
import type { ThemeCustomizations } from "@/lib/portalThemes";

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

// Must stay in sync with MAIN_NAV in src/app/(partner)/dashboard/layout.tsx.
// Any item present there but missing here is rendered on the partner
// sidebar but is NOT reorderable / hide-able from the admin editor.
const ALL_NAV_ITEMS = [
  { id: "home", label: "Home", icon: "🏠" },
  { id: "notifications", label: "Notifications", icon: "🔔" },
  { id: "getting-started", label: "Getting Started", icon: "⭐" },
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "training", label: "Partner Training", icon: "📖" },
  { id: "submit-client", label: "Submit Client", icon: "✅" },
  { id: "reporting", label: "Full Reporting", icon: "📈" },
  { id: "deals", label: "  ↳ My Deals", icon: "📋" },
  { id: "downline", label: "  ↳ Downline", icon: "👥" },
  { id: "commissions", label: "  ↳ Commissions", icon: "💲" },
  { id: "my-leads", label: "My Leads", icon: "🎯" },
  { id: "earnings-calculator", label: "Earnings Calculator", icon: "🧮" },
  { id: "referral-links", label: "Referral Links", icon: "🔗" },
  { id: "calculator", label: "Tariff Calculator", icon: "🧮" },
  { id: "widget", label: "TMS Widget", icon: "🔌" },
  // Documents used to be a standalone sidebar item — it now lives as
  // the rightmost tab inside Full Reporting. Removed from the editor
  // so admins can't accidentally promote it back to the sidebar.
  // Consolidated groupings — each hosts several pages as tabs on its
  // landing route. The 5 previously-independent IDs (support, announcements,
  // messages, conference, ai-assistant) are replaced by these two. The
  // reconcile-on-load logic in this page silently drops the stale IDs
  // from any existing saved navOrder and appends these two at the tail.
  { id: "communications", label: "Communications", icon: "💬" },
  { id: "partner-support", label: "Partner Support", icon: "🙋" },
  { id: "feature-request", label: "Feature Requests", icon: "💡" },
];

// Mirror of ADMIN_NAV_ITEMS in src/app/(admin)/admin/layout.tsx. Update
// here whenever the admin sidebar gains or loses an item. Used by the
// Admin Navigation editor in the settings page.
// Default order mirrors ADMIN_NAV_IDS_DEFAULT in admin/layout.tsx
const ALL_ADMIN_NAV_ITEMS = [
  { id: "home", label: "Home", icon: "🏠" },
  { id: "partners", label: "Partners", icon: "👥" },
  { id: "applications", label: "Applications", icon: "📥" },
  { id: "internal-leads", label: "Internal Leads", icon: "📊" },
  { id: "client-leads", label: "Client Leads", icon: "🎯" },
  { id: "partner-leads", label: "Partner Leads", icon: "🤝" },
  { id: "deals", label: "Deals", icon: "📋" },
  { id: "widget-referrals", label: "Widget Referrals", icon: "🔌" },
  { id: "reporting", label: "Reporting", icon: "📈" },
  { id: "communications", label: "Communications", icon: "💬" },
  { id: "internalChats", label: "Internal Chats", icon: "💬" },
  { id: "partnerSupport", label: "Partner Support", icon: "🎧" },
  { id: "training", label: "Training", icon: "📖" },
  { id: "conference", label: "Live Weekly", icon: "📹" },
  { id: "documents", label: "Documents", icon: "📁" },
  { id: "campaigns", label: "Campaigns", icon: "📧" },
  { id: "automations", label: "Automations", icon: "⚡" },
  { id: "gettingStartedEditor", label: "Getting Started", icon: "✅" },
  { id: "landingPages", label: "Landing Pages", icon: "🌐" },
  { id: "settings", label: "Settings", icon: "⚙️" },
  { id: "users", label: "Admin Users", icon: "🔐" },
  { id: "dev", label: "Development", icon: "🛠️" },
];

// ─── TYPES ──────────────────────────────────────────────────────────────────

interface Announcement {
  title: string;
  body: string;
  date: string;
  badge: string;
  badgeColor: string;
  highlighted?: boolean;
}

interface UpcomingEvent {
  icon: string;
  title: string;
  body: string;
  date: string;
  cta: string;
  ctaUrl?: string;          // target of the cta button on the partner home; empty = button hidden
  highlighted?: boolean;
}

interface ReferralOpp {
  title: string;
  description: string;
  cta: string;
  ctaUrl?: string;          // target of the cta button on the partner home; empty = button hidden
  highlighted: boolean;
}

type TabId = "branding" | "themes" | "navigation" | "homepage" | "commissions" | "agreements" | "integrations";

const TABS: { id: TabId; label: string }[] = [
  { id: "branding", label: "Branding" },
  { id: "themes", label: "Themes" },
  { id: "navigation", label: "Navigation" },
  { id: "homepage", label: "Home Page" },
  { id: "commissions", label: "Commissions" },
  { id: "agreements", label: "Agreements" },
  { id: "integrations", label: "Integrations" },
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

  // Active portal theme — "default" preserves current portal appearance
  // exactly. Any other value applies a preset from src/lib/portalThemes.ts.
  const [activeThemeId, setActiveThemeId] = useState("default");
  const [themeCustomizations, setThemeCustomizationsDraft] = useState<ThemeCustomizations>({});

  // Commissions
  const [l1Rate, setL1Rate] = useState("25");
  const [l2Rate, setL2Rate] = useState("5");
  const [l3Rate, setL3Rate] = useState("0");
  const [l3Enabled, setL3Enabled] = useState(false);

  // Agreement templates (SignWell template IDs)
  const [agreementTemplateMaster, setAgreementTemplateMaster] = useState("");
  const [agreementTemplate25, setAgreementTemplate25] = useState("");
  const [agreementTemplate20, setAgreementTemplate20] = useState("");
  const [agreementTemplate15, setAgreementTemplate15] = useState("");
  const [agreementTemplate10, setAgreementTemplate10] = useState("");
  const [fintellaSignerName, setFintellaSignerName] = useState("");
  const [fintellaSignerEmail, setFintellaSignerEmail] = useState("");
  const [fintellaSignerPlaceholder, setFintellaSignerPlaceholder] = useState("Fintella");

  // Ad-hoc "Send Agreement" form — sits under the template config in
  // the Agreements tab so admins can send an agreement to any existing
  // partner without leaving Settings.
  type PartnerOption = { partnerCode: string; firstName: string; lastName: string; email: string; commissionRate: number };
  const [partnerOptions, setPartnerOptions] = useState<PartnerOption[]>([]);
  const [sendPartnerCode, setSendPartnerCode] = useState("");
  const [sendPartnerRate, setSendPartnerRate] = useState<number>(0.25);
  const [sendPartnerName, setSendPartnerName] = useState("");
  const [sendPartnerEmail, setSendPartnerEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [agreementTemplateEnterprise, setAgreementTemplateEnterprise] = useState("");

  // Navigation
  const [hiddenNavItems, setHiddenNavItems] = useState<string[]>([]);
  const [hiddenAdminNavItems, setHiddenAdminNavItems] = useState<string[]>([]);
  const [navOrder, setNavOrder] = useState<string[]>(ALL_NAV_ITEMS.map((n) => n.id));
  const [adminNavOrder, setAdminNavOrder] = useState<string[]>(ALL_ADMIN_NAV_ITEMS.map((n) => n.id));
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [adminDragIdx, setAdminDragIdx] = useState<number | null>(null);
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
  const [callRecordingEnabled, setCallRecordingEnabled] = useState(false);
  const [homeEmbedVideoUrl, setHomeEmbedVideoUrl] = useState("");
  const [webinarVideoUrl, setWebinarVideoUrl] = useState("");
  // Partner home modules that are hidden. Admin can toggle on/off
  // without deleting content — content stays in the DB, just not
  // rendered when the module id is in this set.
  const [hiddenModules, setHiddenModules] = useState<Set<string>>(new Set());
  const toggleModule = (id: string) => {
    setHiddenModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Module order + per-module layout (columns, alignment).
  // Order matches the sequence sections render in on partner home page.
  // Layout is a per-id map — missing keys fall through to render-layer defaults.
  const DEFAULT_MODULE_ORDER = ["getting_started", "video", "liveWeekly", "events", "announcements", "leaderboard", "opportunities"];
  const [moduleOrder, setModuleOrder] = useState<string[]>(DEFAULT_MODULE_ORDER);
  type ModuleLayout = { columns?: 1 | 2 | 3; alignment?: "left" | "center" };
  const [moduleLayout, setModuleLayout] = useState<Record<string, ModuleLayout>>({});
  const setLayoutField = (id: string, field: keyof ModuleLayout, value: ModuleLayout[keyof ModuleLayout]) => {
    setModuleLayout((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }));
  };

  // Drag-to-reorder state (HTML5 native dnd — no deps).
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const onDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const onDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) { setDraggedId(null); return; }
    setModuleOrder((prev) => {
      const src = prev.indexOf(draggedId);
      const dst = prev.indexOf(targetId);
      if (src < 0 || dst < 0) return prev;
      const next = [...prev];
      next.splice(src, 1);
      next.splice(dst, 0, draggedId);
      return next;
    });
    setDraggedId(null);
  };

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
      setActiveThemeId(settings.activeThemeId || "default");
      try {
        const parsed = JSON.parse(settings.themeCustomizations || "{}") as ThemeCustomizations;
        setThemeCustomizationsDraft(parsed);
      } catch {
        setThemeCustomizationsDraft({});
      }

      setL1Rate(String(Math.round(settings.l1Rate * 100)));
      setL2Rate(String(Math.round(settings.l2Rate * 100)));
      setL3Rate(String(Math.round(settings.l3Rate * 100)));
      setL3Enabled(settings.l3Enabled);
      setAgreementTemplateMaster(settings.agreementTemplateMaster || "");
      setAgreementTemplate25(settings.agreementTemplate25 || "");
      setFintellaSignerName(settings.fintellaSignerName || "");
      setFintellaSignerEmail(settings.fintellaSignerEmail || "");
      setFintellaSignerPlaceholder(settings.fintellaSignerPlaceholder || "Fintella");
      setAgreementTemplate20(settings.agreementTemplate20 || "");
      setAgreementTemplate15(settings.agreementTemplate15 || "");
      setAgreementTemplate10(settings.agreementTemplate10 || "");
      setAgreementTemplateEnterprise(settings.agreementTemplateEnterprise || "");

      try { setHiddenNavItems(JSON.parse(settings.hiddenNavItems || "[]")); } catch { setHiddenNavItems([]); }
      try { setHiddenAdminNavItems(JSON.parse(settings.hiddenAdminNavItems || "[]")); } catch { setHiddenAdminNavItems([]); }
      try { setNavLabels(JSON.parse(settings.navLabels || "{}")); } catch { setNavLabels({}); }
      try { setNavIcons(JSON.parse(settings.navIcons || "{}")); } catch { setNavIcons({}); }
      try {
        let order = JSON.parse(settings.navOrder || "[]");
        if (Array.isArray(order) && order.length > 0) {
          // Drop unknown IDs, append any new items not in saved order
          const validIds = new Set(ALL_NAV_ITEMS.map((n) => n.id));
          order = order.filter((id: string) => validIds.has(id));
          for (const item of ALL_NAV_ITEMS) {
            if (!order.includes(item.id)) order.push(item.id);
          }
          setNavOrder(order);
        }
      } catch {}
      try {
        let aOrder = JSON.parse(settings.adminNavOrder || "[]");
        if (Array.isArray(aOrder) && aOrder.length > 0) {
          // Migrate legacy IDs: reports/revenue/payouts → reporting
          const legacyIds = ["reports", "revenue", "payouts"];
          if (aOrder.some((id: string) => legacyIds.includes(id))) {
            const insertAt = aOrder.indexOf("reports");
            aOrder = aOrder.filter((id: string) => !legacyIds.includes(id));
            if (!aOrder.includes("reporting")) {
              aOrder.splice(insertAt >= 0 ? insertAt : aOrder.length, 0, "reporting");
            }
          }
          // Reconcile against the current registry — drops stale IDs
          // (workflows, chat, support after consolidation) and appends new
          // group IDs (partnerSupport) that are missing from the saved order.
          aOrder = reconcileNavOrder(aOrder, ALL_ADMIN_NAV_ITEMS.map((n) => n.id));
          setAdminNavOrder(aOrder);
        }
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
      if (settings.callRecordingEnabled !== undefined) setCallRecordingEnabled(settings.callRecordingEnabled);
      setHomeEmbedVideoUrl(settings.homeEmbedVideoUrl || "");
      setWebinarVideoUrl(settings.webinarVideoUrl || "");
      try {
        const hidden = JSON.parse(settings.homeHiddenModules || "[]");
        if (Array.isArray(hidden)) setHiddenModules(new Set(hidden.filter((x: unknown) => typeof x === "string")));
      } catch {}
      try {
        const order = JSON.parse(settings.homeModuleOrder || "[]");
        if (Array.isArray(order) && order.length > 0) {
          const known = order.filter((x: unknown) => typeof x === "string" && DEFAULT_MODULE_ORDER.includes(x as string)) as string[];
          const missing = DEFAULT_MODULE_ORDER.filter((id) => !known.includes(id));
          setModuleOrder([...known, ...missing]);
        }
      } catch {}
      try {
        const layout = JSON.parse(settings.homeModuleLayout || "{}");
        if (layout && typeof layout === "object") setModuleLayout(layout);
      } catch {}
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // Lazy-load partner options the first time the Agreements tab opens
  // so the ad-hoc "Send Agreement" dropdown has something to pick from.
  useEffect(() => {
    if (tab !== "agreements" || partnerOptions.length > 0) return;
    fetch("/api/admin/partners")
      .then((r) => r.json())
      .then((data) => {
        const list = (data.partners || []).map((p: any) => ({
          partnerCode: p.partnerCode,
          firstName: p.firstName || "",
          lastName: p.lastName || "",
          email: p.email || "",
          commissionRate: p.commissionRate ?? 0.25,
        }));
        setPartnerOptions(list);
      })
      .catch(() => {});
  }, [tab, partnerOptions.length]);

  const handleAdHocSendAgreement = async () => {
    if (!sendPartnerCode) {
      setSendResult({ ok: false, message: "Pick a partner first." });
      return;
    }
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch(`/api/admin/agreement/${sendPartnerCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rate: sendPartnerRate,
          ...(sendPartnerName ? { name: sendPartnerName } : {}),
          ...(sendPartnerEmail ? { email: sendPartnerEmail } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendResult({ ok: false, message: data.error || `Send failed (HTTP ${res.status}).` });
      } else {
        setSendResult({
          ok: true,
          message: `Agreement sent to ${sendPartnerCode} at ${Math.round(sendPartnerRate * 100)}%. Partner will receive the SignWell link via email.`,
        });
        setSendPartnerCode("");
        setSendPartnerName("");
        setSendPartnerEmail("");
      }
    } catch (err: any) {
      setSendResult({ ok: false, message: err?.message || "Network error" });
    } finally {
      setSending(false);
    }
  };

  // ── Save settings ─────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        firmName, firmShort, firmSlogan, firmPhone, supportEmail, logoUrl, faviconUrl,
        agreementTemplateMaster, agreementTemplate25, agreementTemplate20, agreementTemplate15, agreementTemplate10, agreementTemplateEnterprise,
        fintellaSignerName, fintellaSignerEmail, fintellaSignerPlaceholder,
        l1Rate: parseFloat(l1Rate) / 100,
        l2Rate: parseFloat(l2Rate) / 100,
        l3Rate: parseFloat(l3Rate) / 100,
        l3Enabled,
        hiddenNavItems: JSON.stringify(hiddenNavItems),
        hiddenAdminNavItems: JSON.stringify(hiddenAdminNavItems),
        navOrder: JSON.stringify(navOrder),
        adminNavOrder: JSON.stringify(adminNavOrder),
        navLabels: JSON.stringify(navLabels),
        navIcons: JSON.stringify(navIcons),
        announcements: JSON.stringify(announcements),
        upcomingEvents: JSON.stringify(upcomingEvents),
        referralOpportunities: JSON.stringify(referralOpps),
        leaderboardEnabled,
        liveChatEnabled,
        callRecordingEnabled,
        homeEmbedVideoUrl: homeEmbedVideoUrl.trim() || null,
        webinarVideoUrl: webinarVideoUrl.trim() || null,
        homeHiddenModules: JSON.stringify(Array.from(hiddenModules)),
        homeModuleOrder: JSON.stringify(moduleOrder),
        homeModuleLayout: JSON.stringify(moduleLayout),
        activeThemeId,
        themeCustomizations: JSON.stringify(themeCustomizations),
      };

      console.log("[settings] Saving — liveChatEnabled:", body.liveChatEnabled, "callRecordingEnabled:", body.callRecordingEnabled);
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const result = await res.json().catch(() => ({}));
        console.log("[settings] Saved OK — liveChatEnabled:", result.settings?.liveChatEnabled);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("[settings] Save failed:", err);
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

  const toggleAdminNavItem = (id: string) => {
    setHiddenAdminNavItems((prev) =>
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

  // ── Admin nav drag reorder ─────────────────────────────────────────────

  const handleAdminDragStart = (idx: number) => setAdminDragIdx(idx);

  const handleAdminDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (adminDragIdx === null || adminDragIdx === idx) return;
    const newOrder = [...adminNavOrder];
    const [moved] = newOrder.splice(adminDragIdx, 1);
    newOrder.splice(idx, 0, moved);
    setAdminNavOrder(newOrder);
    setAdminDragIdx(idx);
  };

  const handleAdminDragEnd = () => setAdminDragIdx(null);

  const moveAdminNav = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= adminNavOrder.length) return;
    const newOrder = [...adminNavOrder];
    [newOrder[idx], newOrder[newIdx]] = [newOrder[newIdx], newOrder[idx]];
    setAdminNavOrder(newOrder);
  };

  const orderedAdminNavItems = adminNavOrder
    .map((id) => ALL_ADMIN_NAV_ITEMS.find((n) => n.id === id))
    .filter(Boolean) as typeof ALL_ADMIN_NAV_ITEMS;

  // ── Announcement CRUD ─────────────────────────────────────────────────

  const updateAnnouncement = (idx: number, field: keyof Announcement, value: string | boolean) => {
    setAnnouncements((prev) => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a));
  };

  const addAnnouncement = () => {
    setAnnouncements((prev) => [...prev, { title: "", body: "", date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), badge: "New", badgeColor: "green", highlighted: false }]);
  };

  const removeAnnouncement = (idx: number) => {
    setAnnouncements((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Event CRUD ────────────────────────────────────────────────────────

  const updateEvent = (idx: number, field: keyof UpcomingEvent, value: string | boolean) => {
    setUpcomingEvents((prev) => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  };

  const addEvent = () => {
    setUpcomingEvents((prev) => [...prev, { icon: "📅", title: "", body: "", date: "", cta: "Join", ctaUrl: "", highlighted: false }]);
  };

  const removeEvent = (idx: number) => {
    setUpcomingEvents((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Referral Opp CRUD ─────────────────────────────────────────────────

  const updateReferralOpp = (idx: number, field: keyof ReferralOpp, value: any) => {
    setReferralOpps((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const addReferralOpp = () => {
    setReferralOpps((prev) => [...prev, { title: "", description: "", cta: "Learn More", ctaUrl: "", highlighted: false }]);
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

      {/* ═══ THEMES TAB ═══ */}
      {tab === "themes" && (
        <PortalThemePicker
          selectedThemeId={activeThemeId}
          onSelect={setActiveThemeId}
          customizations={themeCustomizations}
          onCustomizationsChange={setThemeCustomizationsDraft}
        />
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

              {/* Partner Type Nav Config */}
              <PartnerTypeNavConfig />
            </div>
          ) : (
            <div className="card p-5 sm:p-6">
              <div className="font-body font-semibold text-sm mb-1">Admin Navigation</div>
              <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-5">
                Drag to reorder, edit labels, or upload custom icons. Changes sync to the admin sidebar for everyone with admin access.
              </p>
              <div className="space-y-3">
                {orderedAdminNavItems.map((item, idx) => {
                  const isDragging = adminDragIdx === idx;
                  const isAdminVisible = !hiddenAdminNavItems.includes(item.id);
                  const key = `admin.${item.id}`;
                  const currentLabel = navLabels[key] ?? "";
                  const currentIcon = navIcons[key] ?? "";
                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={() => handleAdminDragStart(idx)}
                      onDragOver={(e) => handleAdminDragOver(e, idx)}
                      onDragEnd={handleAdminDragEnd}
                      className={`p-3 border rounded-lg transition-all ${
                        isDragging
                          ? "bg-brand-gold/10 border-brand-gold/30 scale-[1.02] shadow-lg"
                          : "bg-[var(--app-card-bg)] border-[var(--app-border)]"
                      } ${!isAdminVisible ? "opacity-50" : ""}`}
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
                          <button onClick={() => moveAdminNav(idx, -1)} disabled={idx === 0} className="w-7 h-7 flex items-center justify-center rounded bg-[var(--app-card-bg)] text-[var(--app-text-muted)] disabled:opacity-20 text-[11px]">▲</button>
                          <button onClick={() => moveAdminNav(idx, 1)} disabled={idx === orderedAdminNavItems.length - 1} className="w-7 h-7 flex items-center justify-center rounded bg-[var(--app-card-bg)] text-[var(--app-text-muted)] disabled:opacity-20 text-[11px]">▼</button>
                          <button
                            onClick={() => toggleAdminNavItem(item.id)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isAdminVisible ? "bg-green-500" : "bg-[var(--app-input-bg)]"}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isAdminVisible ? "translate-x-6" : "translate-x-1"}`} />
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
          )}
        </div>
      )}

      {/* ═══ HOME PAGE TAB ═══ */}
      {tab === "homepage" && (
        <div className="space-y-6">
          {/* Welcome Video */}
          <div className="card p-5 sm:p-6">
            <div className="font-body font-semibold text-sm mb-1">Welcome Video</div>
            <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-3">
              Optional embedded video shown centered under the welcome header on the partner Home page. Paste any embed URL — YouTube, Vimeo, Loom, Wistia, or a hosted MP4. Leave blank to hide.
            </p>
            <input
              className={inputClass}
              value={homeEmbedVideoUrl}
              onChange={(e) => setHomeEmbedVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/embed/... or https://player.vimeo.com/video/..."
            />
            <p className="font-body text-[11px] text-[var(--app-text-faint)] mt-2">
              Tip: YouTube share → Embed → copy the <code className="text-brand-gold/80">src</code> URL. Vimeo/Loom give an embed URL directly.
            </p>

            <label className={`${labelClass} mt-6`}>Webinar Video URL</label>
            <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-3">
              Video for the evergreen webinar at <a href="/webinar" target="_blank" className="text-brand-gold hover:underline">/webinar</a>. YouTube embed, Loom, or MP4. Leave blank to show a placeholder.
            </p>
            <input
              className={inputClass}
              value={webinarVideoUrl}
              onChange={(e) => setWebinarVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/embed/... or https://www.loom.com/embed/..."
            />
          </div>

          {/* Module Layout & Order — drag handles to reorder, toggle to show/hide,
              per-module columns (for grid modules) and alignment (all modules). */}
          <div className="card p-5 sm:p-6">
            <div className="font-body font-semibold text-sm mb-1">Module Layout & Order</div>
            <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-4">
              Drag the <span className="inline-block align-middle text-[15px] leading-none text-[var(--app-text-secondary)]">⋮⋮</span> handle to reorder sections on the partner Home page. Toggle to show/hide. Pick columns for card grids and alignment for each module.
            </p>
            <div className="space-y-2">
              {moduleOrder.map((id) => {
                const META: Record<string, { label: string; hint: string; supportsColumns: boolean }> = {
                  video:         { label: "Welcome Video", hint: "Embedded video under the welcome header", supportsColumns: false },
                  liveWeekly:    { label: "Live Weekly Call", hint: "Admin banner image + next-call card → /dashboard/conference", supportsColumns: false },
                  events:        { label: "Upcoming Events", hint: "Event cards grid", supportsColumns: true },
                  announcements: { label: "Announcements", hint: "Admin announcements card grid", supportsColumns: true },
                  leaderboard:   { label: "Leaderboard", hint: "Top-performing partners table", supportsColumns: false },
                  opportunities: { label: "Referral Opportunities", hint: "Referral opportunity cards", supportsColumns: true },
                };
                const m = META[id];
                if (!m) return null;
                const visible = !hiddenModules.has(id);
                const layout = moduleLayout[id] || {};
                const cols = layout.columns ?? (m.supportsColumns ? 3 : 1);
                const align = layout.alignment ?? "center";
                const isDragging = draggedId === id;
                return (
                  <div
                    key={id}
                    draggable
                    onDragStart={(e) => onDragStart(e, id)}
                    onDragOver={onDragOver}
                    onDrop={(e) => onDrop(e, id)}
                    onDragEnd={() => setDraggedId(null)}
                    className={`flex items-center gap-3 py-2 px-3 rounded-lg bg-[var(--app-card-bg)] border border-[var(--app-border)] transition-opacity ${isDragging ? "opacity-50" : ""}`}
                  >
                    <span className="cursor-grab active:cursor-grabbing text-[var(--app-text-muted)] select-none text-lg leading-none" title="Drag to reorder">⋮⋮</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-body text-[13px] font-medium">{m.label}</div>
                      <div className="font-body text-[11px] text-[var(--app-text-muted)]">{m.hint}</div>
                    </div>
                    {m.supportsColumns && (
                      <label className="flex items-center gap-1.5 shrink-0">
                        <span className="font-body text-[11px] text-[var(--app-text-muted)]">Cols</span>
                        <select
                          value={cols}
                          onChange={(e) => setLayoutField(id, "columns", Number(e.target.value) as 1 | 2 | 3)}
                          className={`${inputClass} py-1 px-2 text-[12px]`}
                          style={{ minWidth: 60 }}
                        >
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                        </select>
                      </label>
                    )}
                    <label className="flex items-center gap-1.5 shrink-0">
                      <span className="font-body text-[11px] text-[var(--app-text-muted)]">Align</span>
                      <select
                        value={align}
                        onChange={(e) => setLayoutField(id, "alignment", e.target.value as "left" | "center")}
                        className={`${inputClass} py-1 px-2 text-[12px]`}
                        style={{ minWidth: 80 }}
                      >
                        <option value="center">Center</option>
                        <option value="left">Full-width</option>
                      </select>
                    </label>
                    <button
                      onClick={() => toggleModule(id)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${visible ? "bg-green-500" : "bg-[var(--app-input-bg)]"}`}
                      aria-label={`Toggle ${m.label}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${visible ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Leaderboard toggle (legacy) */}
          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-body font-semibold text-sm">Leaderboard Data</div>
                <p className="font-body text-[12px] text-[var(--app-text-muted)] mt-0.5">Enable leaderboard data collection (independent of module visibility above)</p>
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

          {/* Call Recording toggle */}
          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-body font-semibold text-sm">Call Recording</div>
                <p className="font-body text-[12px] text-[var(--app-text-muted)] mt-0.5">Record outbound partner calls. All-party consent disclosure plays automatically in required states (CA, FL, IL, PA, WA + 9 others).</p>
              </div>
              <button
                onClick={() => setCallRecordingEnabled(!callRecordingEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${callRecordingEnabled ? "bg-green-500" : "bg-[var(--app-input-bg)]"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${callRecordingEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            {callRecordingEnabled && (
              <div className="mt-3 p-2.5 rounded-lg bg-green-500/5 border border-green-500/10">
                <div className="font-body text-[11px] text-green-400">Recording active. Calls will be recorded via Twilio and linked in the Communications Log once processed.</div>
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
                <label className="flex items-center gap-2 mt-3 cursor-pointer">
                  <input type="checkbox" checked={!!ann.highlighted} onChange={(e) => updateAnnouncement(idx, "highlighted", e.target.checked)} className="accent-brand-gold" />
                  <span className="font-body text-[12px] text-[var(--app-text-secondary)]">Highlighted (featured card)</span>
                </label>
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
                <div className="mt-3">
                  <input
                    className={inputClass}
                    value={ev.ctaUrl || ""}
                    onChange={(e) => updateEvent(idx, "ctaUrl", e.target.value)}
                    placeholder="Button URL — e.g. https://meet.google.com/xxx-xxx-xxx  (leave blank to hide the button)"
                  />
                </div>
                <label className="flex items-center gap-2 mt-3 cursor-pointer">
                  <input type="checkbox" checked={!!ev.highlighted} onChange={(e) => updateEvent(idx, "highlighted", e.target.checked)} className="accent-brand-gold" />
                  <span className="font-body text-[12px] text-[var(--app-text-secondary)]">Highlighted (featured card)</span>
                </label>
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
                <div className="mt-3">
                  <input
                    className={inputClass}
                    value={opp.ctaUrl || ""}
                    onChange={(e) => updateReferralOpp(idx, "ctaUrl", e.target.value)}
                    placeholder="Button URL — where the partner lands when they click (leave blank to hide the button)"
                  />
                </div>
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

          {/* L1 Rate — per-partner, admin-chosen */}
          <div className="mb-6 p-4 rounded-lg bg-brand-gold/[0.06] border border-brand-gold/20">
            <div className="font-body text-[12px] font-semibold text-brand-gold uppercase tracking-wider mb-2">L1 Commission Rate</div>
            <div className="flex gap-2 mb-2">
              <span className="font-body text-[11px] bg-brand-gold/10 text-brand-gold border border-brand-gold/20 rounded-full px-2.5 py-0.5">10%</span>
              <span className="font-body text-[11px] bg-brand-gold/10 text-brand-gold border border-brand-gold/20 rounded-full px-2.5 py-0.5">15%</span>
              <span className="font-body text-[11px] bg-brand-gold/10 text-brand-gold border border-brand-gold/20 rounded-full px-2.5 py-0.5">20%</span>
              <span className="font-body text-[11px] bg-brand-gold/10 text-brand-gold border border-brand-gold/20 rounded-full px-2.5 py-0.5">25%</span>
            </div>
            <p className="font-body text-[11px] text-[var(--app-text-muted)]">
              Admins choose one of these rates when creating a new L1 recruitment invite. The rate applies to all of that partner&apos;s direct deals and caps the downline waterfall total.
            </p>
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
                L1 partners choose one of these rates when recruiting an L2 partner. The L1 earns the override (L1&apos;s rate minus L2&apos;s rate).
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
                <span><strong className="text-brand-gold">L1 direct deal:</strong> L1 earns their assigned rate (10–25%) of firm fee</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-400" />
                <span><strong className="text-purple-400">L2 deal:</strong> L2 earns their assigned rate, L1 override = L1&apos;s rate − L2&apos;s rate</span>
              </div>
              {l3Enabled && (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  <span><strong className="text-blue-400">L3 deal:</strong> L3 earns their rate, L2 override = L2&apos;s rate − L3&apos;s rate, L1 override = L1&apos;s rate − L2&apos;s rate</span>
                </div>
              )}
              <div className="flex items-center gap-2 pt-1" style={{ borderTop: "1px solid var(--app-border)" }}>
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span><strong className="text-green-400">Total:</strong> Always equals the L1 partner&apos;s assigned rate (never exceeds it)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ AGREEMENTS TAB ═══ */}
      {tab === "agreements" && (
        <div className="space-y-6">
        <div className="card p-5 sm:p-6">
          <div className="font-body font-semibold text-sm mb-1">Partnership Agreement Templates</div>
          <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-5">
            One master template covers every standard partner agreement — the recruit&apos;s actual commission rate is interpolated into the template body at send time via the <code>partner_commission_rate</code> / <code>partner_commission_text</code> placeholders. The legacy per-rate templates below are read only as a fallback when Master is empty, and will be removed in a future release.
          </p>
          <div className="grid grid-cols-1 gap-4 mb-6">
            <div>
              <label className={labelClass}>Master Agreement Template (all standard partners)</label>
              <input className={inputClass} value={agreementTemplateMaster} onChange={(e) => setAgreementTemplateMaster(e.target.value)} placeholder="SignWell template ID — e.g. document_template_xxxxx" />
              <p className="font-body text-[10px] text-[var(--app-text-faint)] mt-1">Active template for every L1/L2/L3 partner agreement. Commission rate fills into the template body at send time.</p>
            </div>
          </div>
          <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-3 mt-1">Legacy per-rate templates (deprecated — fallback only)</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>25% Template (L1 Partners)</label>
              <input className={inputClass} value={agreementTemplate25} onChange={(e) => setAgreementTemplate25(e.target.value)} placeholder="SignWell template ID" />
              <p className="font-body text-[10px] text-[var(--app-text-faint)] mt-1">Used only if Master is empty</p>
            </div>
            <div>
              <label className={labelClass}>20% Template (L2 Partners)</label>
              <input className={inputClass} value={agreementTemplate20} onChange={(e) => setAgreementTemplate20(e.target.value)} placeholder="SignWell template ID" />
              <p className="font-body text-[10px] text-[var(--app-text-faint)] mt-1">Used only if Master is empty</p>
            </div>
            <div>
              <label className={labelClass}>15% Template (L2/L3 Partners)</label>
              <input className={inputClass} value={agreementTemplate15} onChange={(e) => setAgreementTemplate15(e.target.value)} placeholder="SignWell template ID" />
              <p className="font-body text-[10px] text-[var(--app-text-faint)] mt-1">Used only if Master is empty</p>
            </div>
            <div>
              <label className={labelClass}>10% Template (L2/L3 Partners)</label>
              <input className={inputClass} value={agreementTemplate10} onChange={(e) => setAgreementTemplate10(e.target.value)} placeholder="SignWell template ID" />
              <p className="font-body text-[10px] text-[var(--app-text-faint)] mt-1">Used only if Master is empty</p>
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

        {/* ─── Fintella co-signer ─── */}
        <div className="card p-5 sm:p-6">
          <div className="font-body font-semibold text-sm mb-1">Fintella Co-Signer</div>
          <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-5">
            Who countersigns every partnership agreement on Fintella&apos;s side. Added as a second recipient on every SignWell send — the partner signs first, then this person is notified to sign. Leave blank to skip the countersigner and only send to the partner.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Signer Name</label>
              <input className={inputClass} value={fintellaSignerName} onChange={(e) => setFintellaSignerName(e.target.value)} placeholder="Jane Smith" />
            </div>
            <div>
              <label className={labelClass}>Signer Email</label>
              <input className={inputClass} type="email" value={fintellaSignerEmail} onChange={(e) => setFintellaSignerEmail(e.target.value)} placeholder="signer@fintella.partners" />
            </div>
            <div>
              <label className={labelClass}>Template Placeholder Name</label>
              <input className={inputClass} value={fintellaSignerPlaceholder} onChange={(e) => setFintellaSignerPlaceholder(e.target.value)} placeholder="Fintella" />
              <p className="font-body text-[10px] text-[var(--app-text-faint)] mt-1">Must exactly match the second recipient&apos;s role name in every SignWell template.</p>
            </div>
          </div>
        </div>

        {/* ─── Ad-hoc Send Agreement ─── */}
        <div className="card p-5 sm:p-6">
          <div className="font-body font-semibold text-sm mb-1">Send Agreement to a Partner</div>
          <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-5">
            Pick an existing partner and a template rate, then click send. The matching SignWell template is used with partner data pre-filled, and the partner receives the signing link via email.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Partner</label>
              <select
                className={inputClass}
                value={sendPartnerCode}
                onChange={(e) => {
                  const code = e.target.value;
                  setSendPartnerCode(code);
                  const p = partnerOptions.find((x) => x.partnerCode === code);
                  if (p) {
                    setSendPartnerRate(p.commissionRate || 0.25);
                    setSendPartnerName("");
                    setSendPartnerEmail("");
                  }
                }}
              >
                <option value="" className="bg-[var(--app-bg)]">— Select a partner —</option>
                {partnerOptions.map((p) => (
                  <option key={p.partnerCode} value={p.partnerCode} className="bg-[var(--app-bg)]">
                    {p.firstName} {p.lastName} ({p.partnerCode}) · {Math.round(p.commissionRate * 100)}%
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Template Rate</label>
              <select
                className={inputClass}
                value={sendPartnerRate}
                onChange={(e) => setSendPartnerRate(parseFloat(e.target.value))}
              >
                <option value={0.25} className="bg-[var(--app-bg)]">25% — L1 Partner</option>
                <option value={0.20} className="bg-[var(--app-bg)]">20% — L2/L3 Partner</option>
                <option value={0.15} className="bg-[var(--app-bg)]">15% — L2/L3 Partner</option>
                <option value={0.10} className="bg-[var(--app-bg)]">10% — L2/L3 Partner</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Name Override (optional)</label>
              <input
                className={inputClass}
                value={sendPartnerName}
                onChange={(e) => setSendPartnerName(e.target.value)}
                placeholder="Leave blank to use the partner's stored name"
              />
            </div>
            <div>
              <label className={labelClass}>Email Override (optional)</label>
              <input
                className={inputClass}
                type="email"
                value={sendPartnerEmail}
                onChange={(e) => setSendPartnerEmail(e.target.value)}
                placeholder="Leave blank to use the partner's stored email"
              />
            </div>
          </div>

          {sendResult && (
            <div
              className={`mt-4 p-3 rounded-lg font-body text-[12px] ${
                sendResult.ok
                  ? "bg-green-500/10 border border-green-500/30 text-green-400"
                  : "bg-red-500/10 border border-red-500/30 text-red-400"
              }`}
            >
              {sendResult.message}
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <button
              onClick={handleAdHocSendAgreement}
              disabled={sending || !sendPartnerCode}
              className="btn-gold text-[12px] px-6 py-2.5 disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send Agreement"}
            </button>
          </div>
        </div>
        </div>
      )}

      {tab === "integrations" && (
        <div className="space-y-5">
          <GoogleCalendarCard />
          <MyAvailabilityCard />
          <AdminInboxesCard />
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

const PARTNER_TYPES = [
  { id: "referral", label: "Referral Partners", desc: "Standard referral partners" },
  { id: "customs_broker", label: "Customs Brokers", desc: "Licensed brokers with TMS widget + calculator" },
  { id: "corporate", label: "Corporate Partners", desc: "Enterprise/white-label partners" },
  { id: "licensed", label: "Licensed Professionals", desc: "Attorneys, CPAs with specialized flows" },
];

const ALL_PARTNER_NAV_IDS = [
  { id: "home", label: "Home" },
  { id: "notifications", label: "Notifications" },
  { id: "getting-started", label: "Getting Started" },
  { id: "overview", label: "Overview" },
  { id: "training", label: "Partner Training" },
  { id: "submit-client", label: "Submit Client" },
  { id: "reporting", label: "Full Reporting" },
  { id: "deals", label: "My Deals" },
  { id: "downline", label: "Downline" },
  { id: "commissions", label: "Commissions" },
  { id: "my-leads", label: "My Leads" },
  { id: "earnings-calculator", label: "Earnings Calculator" },
  { id: "referral-links", label: "Referral Links" },
  { id: "calculator", label: "Tariff Calculator" },
  { id: "widget", label: "TMS Widget" },
  { id: "communications", label: "Communications" },
  { id: "partner-support", label: "Partner Support" },
  { id: "feature-request", label: "Feature Requests" },
];

function PartnerTypeNavConfig() {
  const [config, setConfig] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeType, setActiveType] = useState("customs_broker");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.settings?.partnerTypeNav) {
          try { setConfig(JSON.parse(data.settings.partnerTypeNav)); } catch {}
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function toggleItem(typeId: string, navId: string) {
    setConfig((prev) => {
      const current = prev[typeId] || [];
      const next = current.includes(navId)
        ? current.filter((id) => id !== navId)
        : [...current, navId];
      return { ...prev, [typeId]: next };
    });
  }

  function selectAll(typeId: string) {
    setConfig((prev) => ({
      ...prev,
      [typeId]: ALL_PARTNER_NAV_IDS.map((n) => n.id),
    }));
  }

  function clearAll(typeId: string) {
    setConfig((prev) => ({ ...prev, [typeId]: [] }));
  }

  async function handleSave() {
    setSaving(true);
    await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerTypeNav: config }),
    });
    setSaving(false);
  }

  if (loading) return null;

  const activeItems = config[activeType] || [];
  const hasConfig = activeItems.length > 0;

  return (
    <div className="mt-6 pt-6 border-t border-[var(--app-border)]">
      <div className="font-body font-semibold text-sm mb-1">Partner Type Navigation</div>
      <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-4">
        Customize which nav items each partner type sees. Empty = show all (default). When configured, only checked items appear.
      </p>

      <div className="flex gap-1 mb-4 overflow-x-auto">
        {PARTNER_TYPES.map((t) => {
          const count = (config[t.id] || []).length;
          return (
            <button
              key={t.id}
              onClick={() => setActiveType(t.id)}
              className={`px-3 py-1.5 text-[11px] font-medium rounded-lg whitespace-nowrap transition-colors ${
                activeType === t.id
                  ? "bg-[var(--brand-gold)]/20 text-[var(--brand-gold)]"
                  : "text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
              }`}
            >
              {t.label}
              {count > 0 && (
                <span className="ml-1 text-[10px] opacity-60">({count})</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-card-bg)] p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-body text-[11px] text-[var(--app-text-muted)]">
            {PARTNER_TYPES.find((t) => t.id === activeType)?.desc}
          </p>
          <div className="flex gap-2">
            <button onClick={() => selectAll(activeType)} className="font-body text-[10px] text-[var(--brand-gold)] hover:underline">
              Select All
            </button>
            <button onClick={() => clearAll(activeType)} className="font-body text-[10px] text-[var(--app-text-muted)] hover:underline">
              Clear (show all)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ALL_PARTNER_NAV_IDS.map((nav) => {
            const checked = hasConfig ? activeItems.includes(nav.id) : false;
            return (
              <label
                key={nav.id}
                className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                  checked ? "bg-[var(--brand-gold)]/5" : "hover:bg-white/3"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleItem(activeType, nav.id)}
                  className="rounded border-[var(--app-border)] accent-[var(--brand-gold)]"
                />
                <span className="font-body text-[12px] text-[var(--app-text)]">{nav.label}</span>
              </label>
            );
          })}
        </div>

        {hasConfig && (
          <p className="font-body text-[10px] text-[var(--app-text-muted)] mt-3">
            {activeItems.length} of {ALL_PARTNER_NAV_IDS.length} items visible for {PARTNER_TYPES.find((t) => t.id === activeType)?.label}
          </p>
        )}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-3 font-body text-[12px] font-medium px-4 py-2 rounded-lg bg-[var(--brand-gold)]/10 text-[var(--brand-gold)] hover:bg-[var(--brand-gold)]/20 transition-colors disabled:opacity-40"
      >
        {saving ? "Saving..." : "Save Type Navigation"}
      </button>
    </div>
  );
}
