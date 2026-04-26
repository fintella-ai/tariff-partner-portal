"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { FIRM_NAME, FIRM_SHORT as DEFAULT_FIRM_SHORT, FIRM_SLOGAN as DEFAULT_FIRM_SLOGAN } from "@/lib/constants";
import { useDevice } from "@/lib/useDevice";
import NotificationBell from "@/components/ui/NotificationBell";
import InstallPrompt from "@/components/ui/InstallPrompt";
import FintellaAppBanner from "@/components/ui/FintellaAppBanner";
import { useTheme } from "@/components/layout/ThemeProvider";
import { EditLayoutProvider } from "@/components/admin/EditLayoutContext";
import EditLayoutButton from "@/components/admin/EditLayoutButton";
import EditableText from "@/components/ui/EditableText";

// ─── NAV STRUCTURE ───────────────────────────────────────────────────────────
// Main nav items (top section of sidebar)
// Each MAIN_NAV item links to a single route, but groupings like
// Communications and Partner Support own several routes (exposed as
// tabs on the landing page). `activePaths` lets those items stay
// highlighted in the sidebar while the partner is on any of the
// grouped routes. Default active check is `pathname === href ||
// pathname.startsWith(href + "/")` — see isActive() below.
const MAIN_NAV: Array<{
  id: string;
  href: string;
  icon: string;
  label: string;
  shortLabel: string;
  activePaths?: string[];
}> = [
  { id: "home", href: "/dashboard/home", icon: "🏠", label: "Home", shortLabel: "Home" },
  { id: "getting-started", href: "/dashboard/getting-started", icon: "⭐", label: "Getting Started", shortLabel: "Start" },
  { id: "overview", href: "/dashboard/overview", icon: "📊", label: "Overview", shortLabel: "Stats" },
  { id: "training", href: "/dashboard/training", icon: "📖", label: "Partner Training", shortLabel: "Learn" },
  { id: "deals", href: "/dashboard/deals", icon: "📋", label: "My Deals", shortLabel: "Deals" },
  { id: "commissions", href: "/dashboard/commissions", icon: "💲", label: "Commissions", shortLabel: "Earn" },
  { id: "submit-client", href: "/dashboard/submit-client", icon: "✅", label: "Submit Client", shortLabel: "Submit" },
  { id: "reporting", href: "/dashboard/reporting", icon: "📈", label: "Full Reporting", shortLabel: "Reports" },
  { id: "downline", href: "/dashboard/downline", icon: "👥", label: "Downline", shortLabel: "Team" },
  { id: "referral-links", href: "/dashboard/referral-links", icon: "🔗", label: "Referral Links", shortLabel: "Links" },
  {
    id: "communications",
    href: "/dashboard/conference",
    icon: "💬",
    label: "Communications",
    shortLabel: "Comms",
    activePaths: [
      "/dashboard/conference",
      "/dashboard/announcements",
      "/dashboard/messages",
      "/dashboard/notifications",
    ],
  },
  {
    id: "partner-support",
    href: "/dashboard/ai-assistant",
    icon: "🙋",
    label: "Partner Support",
    shortLabel: "Help",
    activePaths: ["/dashboard/ai-assistant", "/dashboard/support"],
  },
  // Direct entry for the full notifications log — kept alongside the
  // Communications group (which still tabs into /dashboard/notifications)
  // so partners have a one-click shortcut from the sidebar.
  { id: "notifications", href: "/dashboard/notifications", icon: "🔔", label: "Notifications", shortLabel: "Alerts" },
  { id: "feature-request", href: "/dashboard/feature-request", icon: "💡", label: "Feature Requests", shortLabel: "Ideas" },
];

// Built-in icon overrides — wins over the default emoji on MAIN_NAV,
// loses to an admin-uploaded custom icon in PortalSettings.navIcons.
// Mirrors BUILT_IN_ADMIN_ICONS in src/app/(admin)/admin/layout.tsx.
const BUILT_IN_PARTNER_ICONS: Record<string, string> = {
  reporting: "/icons/reporting-chart.svg",
  overview: "/icons/overview-dashboard.svg",
  home: "/icons/home-house.svg",
  deals: "/icons/deals-briefcase.svg",
  commissions: "/icons/commissions-coins.svg",
  downline: "/icons/downline-tree.svg",
  training: "/icons/training-book.svg",
  "submit-client": "/icons/submit-clipboard-check.svg",
  "referral-links": "/icons/referral-links-chain.svg",
  communications: "/icons/communications-chat.svg",
  "partner-support": "/icons/support-chat-question.svg",
  notifications: "/icons/communications-chat.svg",
  "feature-request": "/icons/features-lightbulb.svg",
};

// Mobile bottom bar items (subset)
const MOBILE_BAR = [
  { id: "home", href: "/dashboard/home", icon: "🏠", shortLabel: "Home" },
  { id: "deals", href: "/dashboard/deals", icon: "📋", shortLabel: "Deals" },
  { id: "overview", href: "/dashboard/overview", icon: "📊", shortLabel: "Stats" },
  { id: "commissions", href: "/dashboard/commissions", icon: "💲", shortLabel: "Earn" },
  { id: "more", href: "#more", icon: "☰", shortLabel: "More" },
];

function NavButton({
  item,
  isActive,
  onClick,
  collapsed = false,
  customLabel,
  customIcon,
  badgeCount = 0,
}: {
  item: { id: string; href: string; icon: string; label: string };
  isActive: boolean;
  onClick: () => void;
  collapsed?: boolean;
  customLabel?: string;
  customIcon?: string;
  badgeCount?: number;
}) {
  const label = customLabel || item.label;
  const hasBadge = badgeCount > 0;
  return (
    <button
      onClick={onClick}
      title={collapsed ? (hasBadge ? `${label} — ${badgeCount} unread` : label) : undefined}
      className={`relative flex items-center ${collapsed ? "justify-center" : "gap-3"} w-full text-left ${collapsed ? "px-2" : "px-3"} py-2.5 rounded-xl font-body text-[13px] transition-all duration-200 min-h-[44px] ${
        hasBadge ? "animate-pulse" : ""
      } ${
        isActive
          ? "bg-brand-gold/8 text-brand-gold border-l-2 border-brand-gold"
          : hasBadge
            ? "bg-red-500/8 text-[var(--app-text)] ring-1 ring-red-500/20"
            : "text-[var(--app-text-secondary)] hover:text-[var(--app-text)] hover:bg-[var(--app-hover)]"
      }`}
    >
      <span className="relative inline-flex">
        {customIcon ? (
          <img src={customIcon} alt="" className="w-5 h-5 object-contain" />
        ) : (
          <span className="text-base leading-none">{item.icon}</span>
        )}
        {hasBadge && collapsed && (
          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1 leading-none">
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
      </span>
      {!collapsed && (
        <span className="flex items-center gap-2 flex-1">
          <span>{label}</span>
          {hasBadge && (
            <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1.5 leading-none">
              {badgeCount > 99 ? "99+" : badgeCount}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

/** Consolidated header "bar menu" dropdown — replaces the top Submit Client /
 *  Referral Links / Support / Bell row. ☰ trigger pulses and shows an unread
 *  count when the partner has unread notifications; the Notifications menu
 *  item carries the same indicator so tapping through is obvious. */
function HeaderMenuDropdown({
  unreadCount,
  navigate,
  isActive,
  align = "center",
}: {
  unreadCount: number;
  navigate: (href: string) => void;
  isActive: (href: string) => boolean;
  align?: "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const items: Array<{ label: string; href: string; icon: string; showBadge?: boolean }> = [
    { label: "Submit Client", href: "/dashboard/submit-client", icon: "✅" },
    { label: "Referral Links", href: "/dashboard/referral-links", icon: "👥" },
    { label: "Notifications", href: "/dashboard/notifications", icon: "🔔", showBadge: true },
    { label: "Support", href: "/dashboard/support", icon: "📩" },
  ];

  const hasUnread = unreadCount > 0;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={hasUnread ? `Menu — ${unreadCount} unread notifications` : "Menu"}
        className={`relative font-body text-[12px] font-semibold tracking-wider border rounded-lg px-4 py-2.5 transition-all flex items-center justify-center gap-2 min-h-[44px] ${
          hasUnread
            ? "border-red-500/60 bg-red-500/10 text-red-400 animate-pulse shadow-[0_0_14px_var(--app-error-glow)]"
            : "border-brand-gold/30 bg-brand-gold/[0.06] text-brand-gold hover:bg-brand-gold/10"
        }`}
      >
        <span className="text-base leading-none">☰</span>
        <span>Menu</span>
        {hasUnread && (
          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute ${align === "end" ? "right-0" : "left-1/2 -translate-x-1/2"} top-full mt-2 w-[220px] bg-[var(--app-popover-bg)] border border-[var(--app-border)] rounded-xl shadow-2xl shadow-black/30 z-[1000] overflow-hidden`}
        >
          {items.map((it) => {
            const active = isActive(it.href);
            const itemBadge = it.showBadge && hasUnread;
            return (
              <button
                key={it.href}
                onClick={() => { setOpen(false); navigate(it.href); }}
                className={`w-full flex items-center gap-3 px-4 py-3 font-body text-[13px] text-left transition-colors border-b border-[var(--app-border)] last:border-b-0 ${
                  active
                    ? "bg-brand-gold/10 text-[var(--app-gold-text)]"
                    : "text-[var(--app-text-secondary)] hover:bg-brand-gold/5"
                } ${itemBadge ? "animate-pulse" : ""}`}
              >
                <span className="text-base leading-none">{it.icon}</span>
                <span className="flex-1">{it.label}</span>
                {itemBadge && (
                  <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1.5 leading-none">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const device = useDevice();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatEnabled, setChatEnabled] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [isSudo, setIsSudo] = useState(false);
  // Shared unread-notification count — drives the hamburger menu blink +
  // count badge in the header AND the sidebar Notifications row. Polls
  // `/api/notifications` on the same 30s cadence as the bell so the two
  // indicators stay in sync without a cross-component subscription.
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadNotifications = useCallback(() => {
    fetch("/api/notifications", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setUnreadCount(data.unreadCount || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchUnreadNotifications();
    const interval = setInterval(fetchUnreadNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadNotifications]);

  // Check for admin impersonation flag
  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("adminSudo") === "true") {
      setIsSudo(true);
    }
  }, []);
  const [firmShort, setFirmShort] = useState(DEFAULT_FIRM_SHORT);
  const [firmSlogan, setFirmSlogan] = useState(DEFAULT_FIRM_SLOGAN);
  const [logoUrl, setLogoUrl] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");
  const [hiddenNavItems, setHiddenNavItems] = useState<string[]>([]);
  const [navOrder, setNavOrder] = useState<string[]>([]);
  // Partner-scope nav label + icon overrides set by super_admin in /admin/settings.
  // Keys are "partner.<itemId>".
  const [navLabels, setNavLabels] = useState<Record<string, string>>({});
  const [navIcons, setNavIcons] = useState<Record<string, string>>({});

  // Fetch portal settings. Wrapped in a reusable fn so we can re-fetch
  // on window focus — lets an admin save nav changes in one tab, switch
  // to the partner tab, and see the new sidebar immediately (no Ctrl+R).
  const fetchSettings = useCallback(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(({ settings }) => {
        if (settings.firmShort) setFirmShort(settings.firmShort);
        if (settings.firmSlogan) setFirmSlogan(settings.firmSlogan);
        if (settings.logoUrl) setLogoUrl(settings.logoUrl);
        if (settings.faviconUrl) setFaviconUrl(settings.faviconUrl);
        try { setHiddenNavItems(JSON.parse(settings.hiddenNavItems || "[]")); } catch {}
        try {
          const order = JSON.parse(settings.navOrder || "[]");
          setNavOrder(order.length > 0 ? order : []);
        } catch {}
        try { setNavLabels(JSON.parse(settings.navLabels || "{}")); } catch {}
        try { setNavIcons(JSON.parse(settings.navIcons || "{}")); } catch {}
      })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // Refetch settings when the tab regains focus. Instant propagation from
  // admin save → partner sidebar without a full page reload.
  useEffect(() => {
    function onFocus() { fetchSettings(); }
    function onVisibility() { if (document.visibilityState === "visible") fetchSettings(); }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchSettings]);

  // Chat: fetch session & poll for new messages
  const fetchChat = useCallback(() => {
    fetch("/api/chat")
      .then((r) => r.json())
      .then((data) => {
        setChatEnabled(data.enabled || false);
        if (data.session) {
          setChatSessionId(data.session.id);
          setChatMessages(data.session.messages || []);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchChat(); }, [fetchChat]);

  // Listen for deal support chat events from child pages
  useEffect(() => {
    function handleDealChat(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (chatEnabled && detail?.message) {
        setChatOpen(true);
        setChatInput(detail.message);
        (window as any).__fintellaChatOpened = true;
      }
    }
    window.addEventListener("openDealChat", handleDealChat);
    return () => window.removeEventListener("openDealChat", handleDealChat);
  }, [chatEnabled]);

  useEffect(() => {
    if (!chatOpen || !chatEnabled) return;
    const interval = setInterval(fetchChat, 4000);
    return () => clearInterval(interval);
  }, [chatOpen, chatEnabled, fetchChat]);

  async function sendChatMessage() {
    if (!chatInput.trim() || chatSending) return;
    setChatSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: chatInput.trim() }),
      });
      if (res.ok) {
        setChatInput("");
        fetchChat();
      }
    } catch {}
    finally { setChatSending(false); }
  }

  const user = session?.user as any;
  const partnerCode = user?.partnerCode || "DEMO";

  const clientRefUrl = `https://referral.frostlawaz.com/l/ANNEXATIONPR/?utm_content=${partnerCode}`;
  const partnerRefUrl = `https://fintella.partners/partner?utm_content=${partnerCode}`;

  function copyAndNotify(url: string, label: string) {
    navigator.clipboard.writeText(url);
    setCopiedLink(label);
    setTimeout(() => setCopiedLink(null), 2000);
  }

  function navigate(href: string) {
    if (href === "#more") {
      setSidebarOpen(true);
      return;
    }
    router.push(href);
    if (!device.isDesktop) setSidebarOpen(false);
  }

  function isActive(href: string, activePaths?: string[]) {
    if (activePaths && activePaths.length > 0) {
      return activePaths.some((p) => pathname === p || pathname.startsWith(p + "/"));
    }
    return pathname === href || pathname.startsWith(href + "/");
  }

  // ─── SIDEBAR CONTENT ────────────────────────────────────────────────────
  function renderSidebar(isCollapsed: boolean) {
    return (
    <div className="flex flex-col h-full">
      {/* Brand — expanded mode uses `-mx-4 -mt-4` to negate the
           sidebar's p-4 padding so the logo stretches edge-to-edge at
           the top of the column. `max-h-72` + object-cover for taller
           fill. Collapsed mode keeps its compact centered icon. */}
      <div className={`${isCollapsed ? "px-1 mb-6" : "-mx-4 -mt-4 mb-6"} text-center`}>
        {isCollapsed ? (
          <div className="font-display text-xs font-bold text-brand-gold">
            {logoUrl ? <img src={logoUrl} alt={firmShort} className="max-h-10 mx-auto object-contain" /> : firmShort.charAt(0)}
          </div>
        ) : logoUrl ? (
          <div>
            <img src={logoUrl} alt={firmShort} className="w-full max-h-72 object-cover" />
          </div>
        ) : (
          <div className="font-display text-sm font-bold text-brand-gold tracking-[1px]">
            {firmShort}
          </div>
        )}
        {!isCollapsed && (
          <div className="font-body text-[10px] theme-text-muted mt-1 italic leading-tight text-center">
            {firmSlogan.includes(",")
              ? <>
                  {firmSlogan.split(",")[0]},<br />
                  {firmSlogan.split(",").slice(1).join(",").trim()}
                </>
              : firmSlogan}
          </div>
        )}
      </div>

      {/* Main Nav */}
      <div className="flex flex-col gap-0.5">
        {(navOrder.length > 0
          ? [
              ...navOrder.map((id) => MAIN_NAV.find((n) => n.id === id)).filter(Boolean) as typeof MAIN_NAV,
              ...MAIN_NAV.filter((n) => !navOrder.includes(n.id)),
            ]
          : MAIN_NAV
        ).filter((item) => !hiddenNavItems.includes(item.id)).map((item) => (
          <NavButton
            key={item.id}
            item={item}
            isActive={isActive(item.href, item.activePaths)}
            onClick={() => navigate(item.href)}
            collapsed={isCollapsed}
            customLabel={navLabels[`partner.${item.id}`]}
            customIcon={navIcons[`partner.${item.id}`] || BUILT_IN_PARTNER_ICONS[item.id]}
            badgeCount={item.id === "notifications" ? unreadCount : 0}
          />
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1 min-h-[24px]" />

      {/* Collapse toggle (desktop only) */}
      {device.isDesktop && (
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg font-body text-[11px] theme-text-muted hover:bg-brand-gold/5 transition-colors mb-2"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg className={`w-4 h-4 transition-transform ${isCollapsed ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {!isCollapsed && <span>Collapse</span>}
        </button>
      )}

      {/* User Info + Account Settings + Sign Out */}
      <div className="px-2 pt-3 text-center" style={{ borderTop: "1px solid var(--app-border)" }}>
        {!isCollapsed && (
          <>
            <div className="font-body text-xs theme-text-secondary mb-0.5">
              {user?.name || "Partner"}
            </div>
            <div className="font-body text-[11px] theme-text-muted tracking-[1px] mb-3">
              {partnerCode}
            </div>
          </>
        )}
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="w-full font-body text-[11px] theme-text-muted rounded px-3 py-2 mb-2 transition-colors hover:opacity-80 flex items-center justify-center gap-2"
          style={{ border: "1px solid var(--app-border)" }}
        >
          <span>{theme === "dark" ? "☀️" : "🌙"}</span>
          {!isCollapsed && <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
        </button>
        <button
          onClick={() => navigate("/dashboard/settings")}
          title={isCollapsed ? "Account Settings" : undefined}
          className={`w-full font-body text-[11px] border rounded px-3 py-2 mb-2 transition-colors ${
            isActive("/dashboard/settings")
              ? "text-brand-gold border-brand-gold/30 bg-brand-gold/10"
              : "theme-text-muted hover:opacity-80"
          }`}
          style={{ borderColor: isActive("/dashboard/settings") ? undefined : "var(--app-border)" }}
        >
          {isCollapsed ? "\u2699\uFE0F" : "Account Settings"}
        </button>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full font-body text-[11px] theme-text-muted rounded px-3 py-2 transition-colors hover:opacity-80"
          style={{ border: "1px solid var(--app-border)" }}
        >
          {isCollapsed ? "Exit" : "Sign Out"}
        </button>
      </div>
      {/* Breathing room below the sign-out button so the nav column can
          scroll past it into solid sidebar background, matching the admin
          panel. Improves visual separation on short viewports. */}
      <div aria-hidden className="shrink-0" style={{ height: 160, background: "var(--app-sidebar-bg)" }} />
    </div>
    );
  }

  return (
    <EditLayoutProvider>
    <div className="flex flex-col min-h-screen">
      {/* ── PWA INSTALL PROMPT ── */}
      {!isSudo && <InstallPrompt />}

      {/* ── FLASHING "GET THE FINTELLA APP" BANNER ──
          Sits above the layout, auto-hides when installed, and stays
          dismissed across reloads via localStorage. Mobile UA → "Mobile
          App" copy; desktop UA → "Desktop App" copy. Hidden while the
          admin is sudoing a partner so the banner doesn't cover the
          purple sudo bar. */}
      {!isSudo && <FintellaAppBanner />}

      {/* ── ADMIN SUDO BANNER ── */}
      {isSudo && (
        <div className="w-full bg-purple-600 text-white text-center py-2 px-4 font-body text-[12px] font-semibold tracking-wider flex items-center justify-center gap-3 z-[1000] relative">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          ADMIN SUDO VIEW — Viewing portal as {user?.name || partnerCode}
          <button
            onClick={() => { sessionStorage.removeItem("adminSudo"); sessionStorage.removeItem("adminSudoPartner"); signOut({ callbackUrl: "/login" }); }}
            className="ml-2 bg-white/20 hover:bg-white/30 rounded px-3 py-0.5 text-[11px] transition-colors"
          >
            Exit
          </button>
        </div>
      )}

      <div className="flex flex-1" style={{ paddingBottom: device.isMobile ? 120 : 60 }}>
      {/* ── DESKTOP SIDEBAR ── */}
      {device.isDesktop && (
        <div className={`${sidebarCollapsed ? "w-[68px]" : "w-[240px]"} flex flex-col shrink-0 sticky top-0 h-screen overflow-y-auto transition-all duration-300 p-3`} style={{ background: "var(--app-sidebar-bg)", borderRight: "1px solid var(--app-border)" }}>
          {renderSidebar(sidebarCollapsed)}
        </div>
      )}

      {/* ── TABLET/MOBILE SIDEBAR OVERLAY ── */}
      {!device.isDesktop && sidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-[998] backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div
            className="fixed left-0 top-0 bottom-0 w-[280px] max-w-[85vw] theme-sidebar border-r z-[999] overflow-y-auto p-5 pt-safe pb-safe pl-safe"
            style={{ animation: "slideIn .25s ease" }}
          >
            {/* Close button */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute right-3 w-11 h-11 flex items-center justify-center rounded-lg theme-text-muted hover:bg-brand-gold/10 transition-colors"
              style={{ top: "calc(0.75rem + var(--safe-top))" }}
              aria-label="Close menu"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {renderSidebar(false)}
          </div>
        </>
      )}

      {/* ── TABLET HAMBURGER ── */}
      {device.isTablet && !sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed left-4 z-[901] bg-[var(--app-bg)]/90 border border-brand-gold/20 rounded-lg w-11 h-11 flex items-center justify-center cursor-pointer text-brand-gold text-xl backdrop-blur-lg"
          style={{ top: "calc(1rem + var(--safe-top))" }}
          aria-label="Open menu"
        >
          ☰
        </button>
      )}

      {/* ── MOBILE BOTTOM NAV ── */}
      {device.isMobile && (
        <div
          className="fixed bottom-0 left-0 right-0 border-t flex z-[900] backdrop-blur-xl pb-safe"
          style={{ background: "var(--app-bg-secondary)", borderColor: "var(--app-sidebar-border)" }}
        >
          {MOBILE_BAR.map((item) => {
            const mobileCustomIcon = navIcons[`partner.${item.id}`] || BUILT_IN_PARTNER_ICONS[item.id];
            return (
            <button
              key={item.id}
              onClick={() => navigate(item.href)}
              aria-label={item.shortLabel}
              aria-current={isActive(item.href, (item as { activePaths?: string[] }).activePaths) ? "page" : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 px-1 min-h-[56px] font-body text-[11px] transition-colors active:scale-95 ${
                isActive(item.href, (item as { activePaths?: string[] }).activePaths) ? "text-brand-gold" : "text-[var(--app-text-muted)]"
              }`}
            >
              {mobileCustomIcon ? (
                <img src={mobileCustomIcon} alt="" className="w-6 h-6 object-contain" />
              ) : (
                <span className="text-xl leading-none">{item.icon}</span>
              )}
              <span className="leading-tight">{item.shortLabel}</span>
            </button>
            );
          })}
        </div>
      )}

      {/* Floating top-right Support + NotificationBell have been moved
          inline into the sticky top bar's right side (below). Mobile
          still shows them inline in the header's logo section. */}

      {/* ══ MAIN CONTENT ══ */}
      {/* Padding mirrors the admin layout exactly (p-4 sm:px-10 sm:py-6
          lg:px-24 lg:py-9) so both portals share a single responsive
          margin contract. Full-bleed children below use
          `-mx-4 sm:-mx-10 lg:-mx-24` to match. */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:px-8 sm:py-6 lg:px-12 lg:py-8"
        style={{ paddingTop: device.isTablet ? 72 : undefined }}
      >
        {/* ── STICKY TOP CTA BAR ──
            Submit Client + Referral Links pinned to the top of the
            scrollable content area. Uses position: sticky inside the
            scroll container so it stays visible when the user scrolls
            down the welcome + module content below. Centered with the
            NotificationBell still floating in its top-right fixed
            corner. Shown on both mobile and desktop. */}
        <div
          className={`sticky top-0 z-40 -mx-4 sm:-mx-10 lg:-mx-24 px-4 sm:px-10 lg:px-24 py-3 mb-5 bg-[var(--app-bg)]/85 backdrop-blur-md border-b border-[var(--app-border)] ${device.isMobile ? "hidden" : ""}`}
        >
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            {/* Left: Submit Client + Referral Links */}
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => navigate("/dashboard/submit-client")}
                className={`font-body text-[12px] sm:text-[13px] font-semibold tracking-wider border rounded-lg px-4 sm:px-5 py-2.5 transition-all flex items-center justify-center gap-1.5 min-h-[44px] ${
                  isActive("/dashboard/submit-client")
                    ? "bg-brand-gold/15 border-brand-gold/40 text-brand-gold"
                    : "bg-brand-gold/[0.06] border-brand-gold/20 text-brand-gold hover:bg-brand-gold/10"
                }`}
              >
                ✅ Submit Client
              </button>
              <button
                onClick={() => navigate("/dashboard/referral-links")}
                className={`font-body text-[12px] sm:text-[13px] font-semibold tracking-wider border rounded-lg px-4 sm:px-5 py-2.5 transition-all flex items-center justify-center gap-1.5 min-h-[44px] ${
                  isActive("/dashboard/referral-links")
                    ? "bg-purple-500/15 border-purple-500/40 text-purple-400"
                    : "bg-purple-500/[0.06] border-purple-500/20 text-purple-400 hover:bg-purple-500/10"
                }`}
              >
                👥 Referral Links
              </button>
            </div>
            {/* Right: Support + NotificationBell (moved out of floating fixed corner) */}
            <div className="flex items-center gap-2">
              <a
                href="/dashboard/support"
                className="relative font-body text-sm border rounded-lg px-3 py-2 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center gap-1.5 backdrop-blur-sm bg-yellow-400 border-yellow-500 text-black hover:bg-yellow-300"
                title="Support"
              >
                📩<span className="hidden lg:inline font-medium">Support</span>
              </a>
              <NotificationBell />
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="mb-5 sm:mb-8">
          {device.isMobile && (
            <>
              {/* Safe area spacer for iPhone notch/Dynamic Island */}
              <div style={{ paddingTop: "env(safe-area-inset-top, 12px)" }} />
              {/* Unified black header strip — logo + centered "Welcome back /
                  Name / Code · Active · Date". Replaces the previous three-band
                  (logo / 4-button row / dark welcome band) stack so the page
                  content (e.g. the "Partner Training" heading) sits snug under
                  the header with a single hamburger menu bar between. */}
              <div className="-mx-4 border-b border-[var(--app-border)]" />
              <div className="flex flex-col items-center gap-3 py-6 -mx-4 px-4 bg-black text-center">
                {logoUrl ? (
                  <img src={logoUrl} alt={firmShort} className="max-h-32 object-contain" />
                ) : (
                  <div className="font-display text-[22px] font-bold text-brand-gold tracking-[2px]">
                    {firmShort}
                  </div>
                )}
                <div className="flex flex-col items-center">
                  <EditableText
                    id="home.greeting"
                    fallback="Welcome back"
                    as="div"
                    className="font-body text-[10px] text-[var(--app-text-muted)] tracking-[1.5px] uppercase"
                  />
                  <div className="font-display text-[20px] font-bold text-brand-gold mt-0.5">
                    {user?.name || "Partner"}
                  </div>
                  <div className="flex gap-2 items-center flex-wrap justify-center mt-1.5">
                    <span className="font-body text-[10px] text-[var(--app-text-muted)] tracking-[1px]">
                      Code: <strong className="text-brand-gold">{partnerCode}</strong>
                    </span>
                    <span className="font-body text-[9px] bg-green-500/10 text-green-400 border border-green-500/20 rounded-full px-2 py-0.5">
                      Active
                    </span>
                  </div>
                  <p className="font-body text-[11px] text-[var(--app-text-muted)] mt-1.5">
                    {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                  </p>
                </div>
              </div>
              <div className="-mx-4 border-b border-[var(--app-border)] mb-3" />
              {/* Bar-menu dropdown — consolidates Submit Client, Referral
                  Links, Notifications, Support. Pulses + shows an unread
                  count when notifications are waiting. */}
              <div className="flex items-center justify-center mb-3">
                <HeaderMenuDropdown
                  unreadCount={unreadCount}
                  navigate={navigate}
                  isActive={(href) => isActive(href)}
                />
              </div>
            </>
          )}

          {/* Full-bleed dark header strip — desktop/tablet only; on mobile it
              has been merged into the black logo strip above. */}
          {!device.isMobile && (
            <>
              <div className="-mx-4 sm:-mx-10 lg:-mx-24 px-4 sm:px-10 lg:px-24 pt-4 pb-5 bg-[var(--app-header-bg)]">
                <div className="flex flex-col items-center text-center">
                  <div className="flex flex-col items-center">
                    <EditableText
                      id="home.greeting"
                      fallback="Welcome back"
                      as="div"
                      className="font-body text-[11px] text-[var(--app-text-muted)] tracking-[1px] uppercase mb-1"
                    />
                    <h1 className={`font-display ${device.headingSize} font-bold mb-1`}>
                      {user?.name || "Partner"}
                    </h1>
                    <div className="flex gap-2 sm:gap-4 items-center flex-wrap justify-center">
                      <span className="font-body text-[11px] text-[var(--app-text-muted)] tracking-[1px]">
                        Code: <strong className="text-brand-gold">{partnerCode}</strong>
                      </span>
                      <span className="font-body text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 rounded-full px-2.5 py-0.5">
                        Active
                      </span>
                      <span className="font-body text-[10px] text-[var(--app-text-faint)]">
                        {device.os !== "unknown" && `${device.os.toUpperCase()}`}
                        {device.width > 0 && ` · ${device.width}×${device.height}`}
                      </span>
                    </div>
                    <p className="font-body text-[13px] text-[var(--app-text-muted)] mt-2">
                      {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                    </p>
                  </div>
                </div>
              </div>
              <div className="-mx-4 sm:-mx-10 lg:-mx-24 border-b border-[var(--app-border)]" />
            </>
          )}
        </div>

        {/* Partner page bodies follow the admin layout's default text
            alignment (left) so both portals feel consistent to shared users.
            Individual pages that need center alignment can opt in locally. */}
        {children}

        {/* ── FOOTER ──
            Sits below the page body on every partner dashboard route.
            Shows the configured favicon (falls back to firm initial
            when no favicon is uploaded) above the copyright line. */}
        <footer className="mt-24 sm:mt-32 pt-8 pb-0 border-t border-[var(--app-border)] text-center">
          {faviconUrl ? (
            <img src={faviconUrl} alt={firmShort} className="mx-auto h-8 w-8 object-contain mb-2 opacity-80" />
          ) : (
            <div className="mx-auto h-8 w-8 rounded-full bg-brand-gold/10 border border-brand-gold/20 flex items-center justify-center mb-2">
              <span className="font-display text-[12px] font-bold text-brand-gold">{firmShort.charAt(0) || "F"}</span>
            </div>
          )}
          <p className="font-body text-[11px] text-[var(--app-text-muted)] tracking-[1.5px] uppercase">
            © Fintella Financial Intelligence Network 2026
          </p>
          <div className="mt-3 flex items-center justify-center gap-4 font-body text-[11px]">
            <a href="/privacy" target="_blank" rel="noreferrer" className="text-[var(--app-text-muted)] hover:text-brand-gold transition-colors">
              Privacy Policy
            </a>
            <span className="text-[var(--app-text-faint)]">·</span>
            <a href="/terms" target="_blank" rel="noreferrer" className="text-[var(--app-text-muted)] hover:text-brand-gold transition-colors">
              Terms &amp; Conditions
            </a>
          </div>
        </footer>
      </div>

      {/* ── LIVE CHAT BUTTON ──
          Bottom-right corner, above the mobile nav bar on mobile. */}
      {chatEnabled && (
      <button
        onClick={() => setChatOpen(!chatOpen)}
        className="fixed z-[950] bg-gradient-to-br from-brand-gold to-[var(--brand-gold)] text-brand-dark rounded-full shadow-lg shadow-brand-gold/20 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        style={device.isMobile
          ? { bottom: "calc(88px + env(safe-area-inset-bottom, 0px))", right: "1rem", width: "3rem", height: "3rem", fontSize: "1.25rem" }
          : { bottom: "1.5rem", right: "1.5rem", width: "3.5rem", height: "3.5rem", fontSize: "1.5rem" }
        }
        title="Chat with support"
      >
        {chatOpen ? "✕" : "💬"}
      </button>
      )}

      {/* ── CHAT PANEL ── */}
      {chatOpen && chatEnabled && (
        <div
          className={`fixed z-[951] bg-[var(--app-bg-secondary)] border border-brand-gold/20 shadow-2xl shadow-black/40 flex flex-col ${
            device.isMobile
              ? "inset-0 rounded-none pt-safe pb-safe pl-safe pr-safe"
              : "bottom-24 right-6 w-[380px] h-[520px] max-w-[calc(100vw-3rem)] max-h-[calc(100vh-8rem)] rounded-2xl"
          }`}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--app-border)]">
            <div>
              <div className="font-body text-sm font-semibold text-[var(--app-text)]">Live Support</div>
              <div className="font-body text-[11px] text-green-400">Online</div>
            </div>
            <button
              onClick={() => setChatOpen(false)}
              className="text-[var(--app-text-muted)] hover:text-[var(--app-text)] text-lg w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[var(--app-input-bg)] transition-colors"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
            {chatMessages.length === 0 && (
              <div className="bg-brand-gold/10 border border-brand-gold/15 rounded-xl rounded-tl-sm px-4 py-3 max-w-[85%]">
                <div className="font-body text-[13px] text-[var(--app-text)] leading-relaxed">
                  Hi! How can we help you today? Send a message and our support team will respond.
                </div>
              </div>
            )}
            {chatMessages.map((msg: any) => (
              <div key={msg.id} className={`flex ${msg.senderType === "partner" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-4 py-3 ${
                  msg.senderType === "partner"
                    ? "bg-brand-gold/15 border border-brand-gold/20 rounded-br-sm"
                    : "bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-bl-sm"
                }`}>
                  {msg.senderType === "admin" && (
                    <div className="font-body text-[10px] font-semibold text-brand-gold mb-1">{msg.senderName || "Support"}</div>
                  )}
                  <div className="font-body text-[13px] text-[var(--app-text)] leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                  <div className="font-body text-[10px] text-[var(--app-text-muted)] mt-1.5">
                    {new Date(msg.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-[var(--app-border)]">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Type your message..."
                className="flex-1 bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl px-4 py-3 text-[var(--app-text)] font-body text-[13px] outline-none focus:border-brand-gold/30 transition-colors placeholder:text-[var(--app-text-muted)]"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
              />
              <button
                onClick={sendChatMessage}
                disabled={!chatInput.trim() || chatSending}
                className="bg-brand-gold/20 text-brand-gold border border-brand-gold/30 rounded-xl px-4 font-body text-sm font-semibold hover:bg-brand-gold/30 transition-colors disabled:opacity-50"
              >
                {chatSending ? "..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
      {/* Level 3 Edit Layout — floating toggle, star super admin only. */}
      <EditLayoutButton />
    </div>
    </EditLayoutProvider>
  );
}
