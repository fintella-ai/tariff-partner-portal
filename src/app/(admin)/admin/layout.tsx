"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { FIRM_SHORT } from "@/lib/constants";
import { useDevice } from "@/lib/useDevice";
import NotificationBell from "@/components/ui/NotificationBell";
import SoftPhone from "@/components/ui/SoftPhone";
import InternalChatWidget from "@/components/admin/InternalChatWidget";
import AdminHeartbeatPinger from "@/components/admin/AdminHeartbeatPinger";
import { getVisibleNav, getPermissions, ROLE_LABELS, type AdminRole } from "@/lib/permissions";
import { useTheme } from "@/components/layout/ThemeProvider";
import { reconcileNavOrder } from "@/lib/reconcileNavOrder";
import { isStarSuperAdminEmail } from "@/lib/starSuperAdmin";

type NavLeaf = { id: string; href: string; icon: string; label: string };
type NavGroup = { id: string; icon: string; label: string; children: NavLeaf[] };
type NavItem = NavLeaf | NavGroup;

const isGroup = (n: NavItem): n is NavGroup => (n as NavGroup).children !== undefined;

// Default display order — can be reordered via Settings → Navigation drag-and-drop.
// IDs here must match ADMIN_NAV_ITEMS map below.
const ADMIN_NAV_IDS_DEFAULT = [
  "home",
  "partners", "applications", "deals", "reporting",
  "communications", "internalChats", "partnerSupport",
  "training", "conference", "documents",
  "automations", "gettingStartedEditor",
  "settings", "users", "features", "dev",
];

// Built-in icon overrides — wins over the default emoji, loses to an
// admin-uploaded custom icon in PortalSettings.navIcons. Use this to
// ship hand-drawn SVG nav icons without forcing every admin to upload.
const BUILT_IN_ADMIN_ICONS: Record<string, string> = {
  reporting: "/icons/reporting-chart.svg",
  home: "/icons/home-house.svg",
  deals: "/icons/deals-briefcase.svg",
  training: "/icons/training-book.svg",
  documents: "/icons/documents-folder.svg",
  settings: "/icons/settings-gear.svg",
  partnerSupport: "/icons/support-chat-question.svg",
  partners: "/icons/partners-people.svg",
  communications: "/icons/communications-chat.svg",
  internalChats: "/icons/internal-chats-nested.svg",
  conference: "/icons/conference-camera.svg",
  dev: "/icons/dev-tools.svg",
  features: "/icons/features-lightbulb.svg",
  users: "/icons/users-shield-key.svg",
};

const ADMIN_NAV_ITEMS_MAP: Record<string, NavItem> = {
  home:         { id: "home", href: "/admin", icon: "🏠", label: "Home" },
  partners:     { id: "partners", href: "/admin/partners", icon: "👥", label: "Partners" },
  applications: { id: "applications", href: "/admin/applications", icon: "📥", label: "Applications" },
  deals:        { id: "deals", href: "/admin/deals", icon: "📋", label: "Deals" },
  // "reporting" is a synthetic umbrella for Reports / Revenue /
  // Custom Commissions / Payouts. The finance pages share a ReportingTabs
  // bar rendered at the top of each page so the user can switch between
  // them in-context.
  reporting:    { id: "reporting", href: "/admin/reports", icon: "📈", label: "Reporting" },
  // Communications / Internal Chats / Partner Support are flat leaves. Each
  // one is a single sidebar entry pointing at its top-level hub page, and the
  // hub page owns its own in-page tabbed navigation (same pattern as
  // Reporting). This avoids duplicate tab bars and shorter mental model for
  // super admins.
  communications:  { id: "communications",  href: "/admin/communications",  icon: "💬", label: "Communications" },
  internalChats:   { id: "internalChats",   href: "/admin/internal-chats",  icon: "💬", label: "Internal Chats" },
  partnerSupport:  { id: "partnerSupport",  href: "/admin/support",         icon: "🙋", label: "Partner Support" },
  training:     { id: "training", href: "/admin/training", icon: "📖", label: "Training" },
  conference:   { id: "conference", href: "/admin/conference", icon: "📹", label: "Live Weekly" },
  documents:    { id: "documents", href: "/admin/documents", icon: "📁", label: "Documents" },
  automations:  { id: "automations", href: "/admin/automations", icon: "⚡", label: "Automations" },
  gettingStartedEditor: { id: "gettingStartedEditor", href: "/admin/getting-started-editor", icon: "✅", label: "Getting Started" },
  settings:     { id: "settings", href: "/admin/settings", icon: "⚙️", label: "Settings" },
  users:        { id: "users", href: "/admin/users", icon: "🔐", label: "Admin Users" },
  dev:          { id: "dev", href: "/admin/dev", icon: "🛠️", label: "Development" },
  features:     { id: "features", href: "/admin/features", icon: "💡", label: "Feature Requests" },
};

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const device = useDevice();
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [adminName, setAdminName] = useState("");
  // Super-admin nav customizations — labels + uploaded icons keyed by
  // "admin.<itemId>". See PortalSettings.navLabels / navIcons.
  const [navLabels, setNavLabels] = useState<Record<string, string>>({});
  const [navIcons, setNavIcons] = useState<Record<string, string>>({});
  // Unread chat count — poll every 15s to blink the Live Chat button
  const [unreadChats, setUnreadChats] = useState(0);
  const fetchUnreadChats = useCallback(() => {
    fetch("/api/admin/chat")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.sessions) {
          const total = (data.sessions as Array<{ unreadCount: number }>).reduce(
            (sum, s) => sum + (s.unreadCount || 0), 0
          );
          setUnreadChats(total);
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    fetchUnreadChats();
    const interval = setInterval(fetchUnreadChats, 15000);
    return () => clearInterval(interval);
  }, [fetchUnreadChats]);

  // Custom admin nav order from settings (empty = use default)
  const [adminNavOrder, setAdminNavOrder] = useState<string[]>([]);

  const user = session?.user as any;
  const userRole = (user?.role || "admin") as AdminRole;
  const isStar = isStarSuperAdminEmail(user?.email);
  const visibleNavIds = getVisibleNav(userRole);
  const permissions = getPermissions(userRole);

  // Build ordered nav list: respect settings-saved order when available,
  // fall back to ADMIN_NAV_IDS_DEFAULT. Any IDs in the saved order that
  // no longer exist in the map are dropped; any new IDs not in the saved
  // order are appended at the end.
  const orderedIds = adminNavOrder.length > 0
    ? [
        ...adminNavOrder.filter((id) => id in ADMIN_NAV_ITEMS_MAP),
        ...ADMIN_NAV_IDS_DEFAULT.filter((id) => !adminNavOrder.includes(id)),
      ]
    : ADMIN_NAV_IDS_DEFAULT;

  const orderedNavItems = orderedIds
    .map((id) => ADMIN_NAV_ITEMS_MAP[id])
    .filter(Boolean) as NavItem[];

  // Filter nav by role. For groups, keep the group if at least one child is
  // visible, and narrow the children to just the visible ones.
  const filteredNav: NavItem[] = orderedNavItems.flatMap((item): NavItem[] => {
    if (isGroup(item)) {
      const visibleChildren = item.children.filter((c) => visibleNavIds.includes(c.id));
      if (visibleChildren.length === 0) return [];
      return [{ ...item, children: visibleChildren }];
    }
    // "reporting" is a synthetic umbrella item. The permissions table
    // doesn't list it directly — instead, show it if any of the three
    // underlying pages (reports / revenue / payouts) is visible to the
    // current role.
    if (item.id === "reporting") {
      const anyVisible = ["reports", "revenue", "payouts"].some((id) => visibleNavIds.includes(id));
      return anyVisible ? [item] : [];
    }
    return visibleNavIds.includes(item.id) ? [item] : [];
  });

  // Track which groups are open. Auto-open any group whose child matches
  // the current pathname so navigating directly to /admin/revenue expands
  // Reports without a manual click.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const item of filteredNav) {
      if (isGroup(item)) {
        if (item.children.some((c) => pathname === c.href || pathname.startsWith(c.href + "/"))) {
          next[item.id] = true;
        }
      }
    }
    setOpenGroups((prev) => ({ ...prev, ...next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(({ settings }) => {
        if (settings.logoUrl) setLogoUrl(settings.logoUrl);
        try { setNavLabels(JSON.parse(settings.navLabels || "{}")); } catch {}
        try { setNavIcons(JSON.parse(settings.navIcons || "{}")); } catch {}
        try {
          let order = JSON.parse(settings.adminNavOrder || "[]");
          if (Array.isArray(order) && order.length > 0) {
            // Migrate legacy IDs: reports/revenue/payouts → reporting
            const legacyIds = ["reports", "revenue", "payouts"];
            if (order.some((id: string) => legacyIds.includes(id))) {
              const insertAt = Math.min(
                ...legacyIds.map((id: string) => order.indexOf(id)).filter((i: number) => i >= 0)
              );
              order = order.filter((id: string) => !legacyIds.includes(id));
              if (!order.includes("reporting")) {
                order.splice(insertAt >= 0 && insertAt < order.length ? insertAt : order.length, 0, "reporting");
              }
            }
            // Reconcile against current registry — drops stale IDs
            // (workflows, chat, support, teamChat, channels, partnerDmFlags
            // after consolidation) and appends new group IDs (communications,
            // partnerSupport) if missing.
            order = reconcileNavOrder(order, ADMIN_NAV_IDS_DEFAULT);
            setAdminNavOrder(order);
          }
        } catch {}
      })
      .catch(() => {});
    // Fetch current admin name from account API
    fetch("/api/admin/account")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(({ user: u }) => {
        if (u?.name) setAdminName(u.name);
      })
      .catch(() => {});
  }, [pathname]); // refetch when navigating (catches updates from account page)

  function navigate(href: string) {
    router.push(href);
    if (!device.isDesktop) setMobileOpen(false);
  }

  const sidebarContent = (
    <>
      {/* ── Logo + subheading ───────────────────────────────────────
           Logo wrapper uses `-mx-4 -mt-4` to negate the sidebar's own
           p-4 padding so the brand image stretches edge-to-edge at the
           top of the nav column. `max-h-72` gives the extra vertical
           room requested. */}
      <div className={`flex flex-col items-center text-center mb-5 ${collapsed ? "px-1" : "-mx-4 -mt-4"}`}>
        {collapsed ? (
          logoUrl
            ? <img src={logoUrl} alt={FIRM_SHORT} className="h-10 w-10 mx-auto object-contain" />
            : <div className="font-display text-lg font-bold text-brand-gold leading-none">{FIRM_SHORT.charAt(0)}</div>
        ) : logoUrl ? (
          <img src={logoUrl} alt={FIRM_SHORT} className="w-full max-h-72 object-cover mb-2" />
        ) : (
          <div className="font-display text-xl font-bold text-brand-gold tracking-[1px] mb-1">{FIRM_SHORT}</div>
        )}
        {!collapsed && (
          <div className="font-body text-[10px] theme-text-muted tracking-[3px] uppercase">
            Admin Panel
          </div>
        )}
      </div>

      {filteredNav.map((item) => {
        // Resolve custom label + icon for this item (admin scope).
        // Priority: admin-uploaded custom > built-in SVG override > emoji.
        const customLabel = navLabels[`admin.${item.id}`];
        const customIcon = navIcons[`admin.${item.id}`] || BUILT_IN_ADMIN_ICONS[item.id];
        const renderIcon = customIcon ? (
          <img src={customIcon} alt="" className="w-5 h-5 object-contain" />
        ) : (
          <span className="text-base">{item.icon}</span>
        );
        const renderLabel = customLabel || item.label;

        if (isGroup(item)) {
          const childActive = item.children.some(
            (c) => pathname === c.href || pathname.startsWith(c.href + "/")
          );
          const open = collapsed ? true : !!openGroups[item.id];
          return (
            <div key={item.id} className="flex flex-col">
              <button
                onClick={() => {
                  if (collapsed) {
                    // When collapsed, clicking a group nav to its first child
                    // so the user still has a usable click target.
                    navigate(item.children[0]!.href);
                    return;
                  }
                  setOpenGroups((prev) => ({ ...prev, [item.id]: !prev[item.id] }));
                }}
                title={collapsed ? renderLabel : undefined}
                className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} w-full text-left ${collapsed ? "px-2" : "px-4"} py-3.5 rounded-lg font-body text-sm transition-all min-h-[48px] ${
                  childActive
                    ? "text-brand-gold"
                    : "theme-text-secondary hover:bg-brand-gold/5"
                }`}
              >
                {renderIcon}
                {!collapsed && (
                  <>
                    <span className="flex-1">{renderLabel}</span>
                    <span className={`text-[10px] transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
                  </>
                )}
              </button>
              {open && !collapsed && (
                <div className="ml-3 border-l border-[var(--app-border)] pl-2 flex flex-col">
                  {item.children.map((c) => {
                    const isActive = pathname === c.href || pathname.startsWith(c.href + "/");
                    const cLabel = navLabels[`admin.${c.id}`] || c.label;
                    const cIcon = navIcons[`admin.${c.id}`] || BUILT_IN_ADMIN_ICONS[c.id];
                    return (
                      <button
                        key={c.id}
                        onClick={() => navigate(c.href)}
                        className={`flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg font-body text-[13px] transition-all min-h-[40px] ${
                          isActive
                            ? "bg-brand-gold/10 text-brand-gold"
                            : "theme-text-secondary hover:bg-brand-gold/5"
                        }`}
                      >
                        {cIcon ? (
                          <img src={cIcon} alt="" className="w-4 h-4 object-contain" />
                        ) : (
                          <span className="text-sm">{c.icon}</span>
                        )}
                        <span>{cLabel}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        // Home lives at "/admin" (exact match only) — otherwise it'd
        // light up on every admin sub-page because of the startsWith
        // check. All other items match their href + any nested route.
        const isActive = item.href === "/admin"
          ? pathname === "/admin"
          : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <button
            key={item.id}
            onClick={() => navigate(item.href)}
            title={collapsed ? renderLabel : undefined}
            className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} w-full text-left ${collapsed ? "px-2" : "px-4"} py-3.5 rounded-lg font-body text-sm transition-all min-h-[48px] ${
              isActive
                ? "bg-brand-gold/10 text-brand-gold"
                : "theme-text-secondary hover:bg-brand-gold/5"
            }`}
          >
            {renderIcon}
            {!collapsed && <span>{renderLabel}</span>}
          </button>
        );
      })}

      <div className="flex-1" />

      {/* Collapse toggle (desktop only) */}
      {device.isDesktop && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex items-center justify-center gap-2 w-full min-h-[44px] px-3 py-2.5 rounded-lg font-body text-[12px] theme-text-muted hover:bg-brand-gold/5 active:scale-[0.98] transition-all mb-2"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <CollapseIcon collapsed={collapsed} />
          {!collapsed && <span>Collapse</span>}
        </button>
      )}

      <div className="pt-4 px-2 mt-2 text-center" style={{ borderTop: "1px solid var(--app-border)" }}>
        {/* Name + role — always center-aligned */}
        <div className="mb-3">
          <div className="font-body text-sm font-medium theme-text-secondary truncate">
            {collapsed
              ? (adminName || user?.name || "A").charAt(0).toUpperCase()
              : (adminName || user?.name || "Admin")}
          </div>
          {!collapsed && (
            <div className="font-body text-[11px] theme-text-muted tracking-[1px] mt-0.5 flex items-center justify-center gap-1">
              {isStar && <span title="Star Super Admin" className="text-brand-gold">★</span>}
              <span>{isStar ? "Star Super Admin" : ROLE_LABELS[userRole] || "Administrator"}</span>
            </div>
          )}
        </div>
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="w-full font-body text-[11px] theme-text-muted rounded px-3 py-2 mb-2 transition-colors hover:opacity-80 flex items-center justify-center gap-2"
          style={{ border: "1px solid var(--app-border)" }}
        >
          <span>{theme === "dark" ? "☀️" : "🌙"}</span>
          {!collapsed && <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
        </button>
        <button
          onClick={() => navigate("/admin/account")}
          title={collapsed ? "Account Settings" : undefined}
          className={`w-full font-body text-[11px] rounded px-3 py-2 mb-2 transition-colors ${
            pathname === "/admin/account"
              ? "text-brand-gold border-brand-gold/30 bg-brand-gold/10"
              : "theme-text-muted hover:opacity-80"
          }`}
          style={{ border: `1px solid ${pathname === "/admin/account" ? "" : "var(--app-border)"}` }}
        >
          {collapsed ? "\u2699\uFE0F" : "Account Settings"}
        </button>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full font-body text-[11px] theme-text-muted rounded px-3 py-2 transition-colors hover:opacity-80"
          style={{ border: "1px solid var(--app-border)" }}
        >
          {collapsed ? "↩" : "Sign Out"}
        </button>
      </div>

      {/* Black-background breathing room below the sign-out button so the
          sidebar can scroll past it without immediately hitting the viewport
          edge. Helps the Sign Out button feel distinct from the screen
          bottom on short viewports. */}
      <div aria-hidden className="shrink-0" style={{ height: 160, background: "var(--app-sidebar-bg)" }} />
    </>
  );

  return (
    <div className="flex min-h-screen">
      {/* Invisible heartbeat pinger — keeps User.lastHeartbeatAt fresh so
          Ollie knows which admins are online (Phase 3c.4a). */}
      <AdminHeartbeatPinger />
      {/* ── DESKTOP SIDEBAR ── */}
      {device.isDesktop && (
        <div className={`${collapsed ? "w-[68px]" : "w-60"} theme-sidebar border-r p-4 flex flex-col gap-1 shrink-0 sticky top-0 h-screen overflow-y-auto transition-all duration-200`}>
          {sidebarContent}
        </div>
      )}

      {/* ── MOBILE/TABLET SIDEBAR OVERLAY ── */}
      {!device.isDesktop && mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[998] backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="fixed left-0 top-0 bottom-0 w-[280px] max-w-[85vw] theme-sidebar border-r z-[999] overflow-y-auto p-4 pb-safe pl-safe flex flex-col gap-1" style={{ animation: "slideIn .25s ease", paddingTop: "calc(env(safe-area-inset-top, 44px) + 1rem)" }}>
            {/* Close button */}
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 w-11 h-11 flex items-center justify-center rounded-lg theme-text-muted hover:bg-brand-gold/10 transition-colors"
              style={{ top: "calc(env(safe-area-inset-top, 44px) + 0.5rem)" }}
              aria-label="Close menu"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {sidebarContent}
          </div>
        </>
      )}

      {/* ── MOBILE/TABLET HAMBURGER ── */}
      {!device.isDesktop && !mobileOpen && (
        <button
          onClick={() => setMobileOpen(true)}
          className="fixed left-4 z-[901] rounded-lg w-12 h-12 flex items-center justify-center cursor-pointer text-brand-gold text-xl backdrop-blur-lg"
          style={{ top: "calc(env(safe-area-inset-top, 44px) + 1.25rem)", background: "var(--app-bg-secondary)", border: "1px solid var(--app-sidebar-border)" }}
          aria-label="Open menu"
        >
          ☰
        </button>
      )}

      {/* Main Content */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:px-10 sm:py-6 lg:px-24 lg:py-9"
        style={{
          paddingTop: !device.isDesktop ? "calc(env(safe-area-inset-top, 44px) + 5.5rem)" : undefined,
          paddingBottom: !device.isDesktop ? "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)" : "60px",
        }}
      >
        <div className="mb-5 sm:mb-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-body text-[11px] theme-text-muted tracking-[1px] uppercase mb-1">
                Admin Panel
              </div>
              <h1 className="font-display text-xl sm:text-2xl lg:text-[28px] font-bold mb-1">
                {adminName || user?.name || "Administrator"}{" "}
                <span className="font-body text-[13px] font-normal theme-text-muted">
                  ({isStar && <span title="Star Super Admin" className="text-brand-gold">★ </span>}
                  {isStar ? "Star Super Admin" : ROLE_LABELS[userRole] || "Admin"})
                </span>
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="/admin/chat"
                className={`relative font-body text-sm border rounded-lg px-3 py-2 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center gap-1.5 backdrop-blur-sm bg-yellow-400 border-yellow-500 text-black hover:bg-yellow-300 ${
                  unreadChats > 0 ? "animate-pulse shadow-[0_0_16px_rgba(196,160,80,0.5)]" : ""
                }`}
                title={unreadChats > 0 ? `Live Chat (${unreadChats} unread)` : "Live Chat"}
              >
                💬<span className="hidden lg:inline font-medium">Live Chat</span>
                {unreadChats > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {unreadChats > 99 ? "99+" : unreadChats}
                  </span>
                )}
              </a>
              <a
                href="/admin/support"
                className="relative font-body text-sm border rounded-lg px-3 py-2 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center gap-1.5 backdrop-blur-sm bg-yellow-400 border-yellow-500 text-black hover:bg-yellow-300"
                title="Support Ticket"
              >
                📩<span className="hidden lg:inline font-medium">Support Ticket</span>
              </a>
              <NotificationBell draggable />
            </div>
          </div>
        </div>
        {children}
      </div>

      {/* Floating WebRTC softphone — any admin page can trigger a call
          via window.__fintellaSoftphone.call(phone, name). Docks in the
          bottom-right until someone opens it. */}
      <SoftPhone />

      {/* Persistent admin internal chat — layout-mounted so it stays
          alive across page navigation. Toggle via the floating bubble
          (bottom-right) or window.__fintellaInternalChat.toggle(). */}
      <InternalChatWidget />
    </div>
  );
}
