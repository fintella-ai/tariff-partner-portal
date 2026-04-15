"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { FIRM_SHORT } from "@/lib/constants";
import { useDevice } from "@/lib/useDevice";
import NotificationBell from "@/components/ui/NotificationBell";
import { getVisibleNav, getPermissions, ROLE_LABELS, type AdminRole } from "@/lib/permissions";

type NavLeaf = { id: string; href: string; icon: string; label: string };
type NavGroup = { id: string; icon: string; label: string; children: NavLeaf[] };
type NavItem = NavLeaf | NavGroup;

const isGroup = (n: NavItem): n is NavGroup => (n as NavGroup).children !== undefined;

const ADMIN_NAV_ITEMS: NavItem[] = [
  { id: "partners", href: "/admin/partners", icon: "\u{1F465}", label: "Partners" },
  { id: "deals", href: "/admin/deals", icon: "\u{1F4BC}", label: "Deals" },
  { id: "communications", href: "/admin/communications", icon: "\u{1F4E7}", label: "Communications" },
  { id: "training", href: "/admin/training", icon: "\u{1F393}", label: "Training" },
  { id: "conference", href: "/admin/conference", icon: "\u{1F4F9}", label: "Live Weekly" },
  { id: "documents", href: "/admin/documents", icon: "\u{1F4C4}", label: "Documents" },
  { id: "support", href: "/admin/support", icon: "\u{1F3AB}", label: "Support" },
  { id: "chat", href: "/admin/chat", icon: "\u{1F4AC}", label: "Live Chat" },
  // Reports group — rolls up finance / analytics pages so the flat nav
  // doesn't have three adjacent items that all answer "how much money"
  // questions. Kept as a group even though Revenue + Payouts are still
  // first-class pages with their own permission gates.
  {
    id: "reports",
    icon: "\u{1F4CA}",
    label: "Reports",
    children: [
      { id: "reports", href: "/admin/reports", icon: "\u{1F4C8}", label: "Reports" },
      { id: "revenue", href: "/admin/revenue", icon: "\u{1F4B5}", label: "Revenue" },
      { id: "payouts", href: "/admin/payouts", icon: "\u{1F4B3}", label: "Payouts" },
    ],
  },
  { id: "settings", href: "/admin/settings", icon: "\u2699\uFE0F", label: "Settings" },
  { id: "users", href: "/admin/users", icon: "\u{1F6E1}\uFE0F", label: "Admin Users" },
  { id: "dev", href: "/admin/dev", icon: "\u{1F6E0}\uFE0F", label: "Development" },
  { id: "features", href: "/admin/features", icon: "\u{2728}", label: "Feature Requests" },
];

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
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [adminName, setAdminName] = useState("");

  const user = session?.user as any;
  const userRole = (user?.role || "admin") as AdminRole;
  const visibleNavIds = getVisibleNav(userRole);
  const permissions = getPermissions(userRole);

  // Filter nav by role. For groups, keep the group if at least one child is
  // visible, and narrow the children to just the visible ones.
  const filteredNav: NavItem[] = ADMIN_NAV_ITEMS.flatMap((item): NavItem[] => {
    if (isGroup(item)) {
      const visibleChildren = item.children.filter((c) => visibleNavIds.includes(c.id));
      if (visibleChildren.length === 0) return [];
      return [{ ...item, children: visibleChildren }];
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
      <div className={`${collapsed ? "px-1 text-center" : "pl-2"} mb-1`}>
        {collapsed ? (
          logoUrl
            ? <img src={logoUrl} alt={FIRM_SHORT} className="max-h-7 mx-auto object-contain" />
            : <div className="font-display text-xs font-bold text-brand-gold">{FIRM_SHORT.charAt(0)}</div>
        ) : logoUrl ? (
          <img src={logoUrl} alt={FIRM_SHORT} className="max-h-10 max-w-[180px] object-contain" />
        ) : (
          <div className="font-display text-sm font-bold text-brand-gold tracking-[1px]">{FIRM_SHORT}</div>
        )}
      </div>
      {!collapsed && (
        <div className="font-body text-[10px] theme-text-muted tracking-[2px] uppercase mb-5 pl-2">
          Admin Panel
        </div>
      )}
      {collapsed && <div className="mb-3" />}

      {filteredNav.map((item) => {
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
                title={collapsed ? item.label : undefined}
                className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} w-full text-left ${collapsed ? "px-2" : "px-4"} py-3.5 rounded-lg font-body text-sm transition-all min-h-[48px] ${
                  childActive
                    ? "text-brand-gold"
                    : "theme-text-secondary hover:bg-brand-gold/5"
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {!collapsed && (
                  <>
                    <span className="flex-1">{item.label}</span>
                    <span className={`text-[10px] transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
                  </>
                )}
              </button>
              {open && !collapsed && (
                <div className="ml-3 border-l border-[var(--app-border)] pl-2 flex flex-col">
                  {item.children.map((c) => {
                    const isActive = pathname === c.href || pathname.startsWith(c.href + "/");
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
                        <span className="text-sm">{c.icon}</span>
                        <span>{c.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <button
            key={item.id}
            onClick={() => navigate(item.href)}
            title={collapsed ? item.label : undefined}
            className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} w-full text-left ${collapsed ? "px-2" : "px-4"} py-3.5 rounded-lg font-body text-sm transition-all min-h-[48px] ${
              isActive
                ? "bg-brand-gold/10 text-brand-gold"
                : "theme-text-secondary hover:bg-brand-gold/5"
            }`}
          >
            <span className="text-base">{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
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

      <div className="pt-4 px-2 mt-2" style={{ borderTop: "1px solid var(--app-border)" }}>
        {!collapsed && (
          <>
            <div className="font-body text-xs theme-text-secondary mb-1">
              {adminName || user?.name || "Admin"}
            </div>
            <div className="font-body text-[11px] theme-text-muted tracking-[1px] mb-3">
              {ROLE_LABELS[userRole] || "Administrator"}
            </div>
          </>
        )}
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
          className={`w-full font-body text-[11px] theme-text-muted rounded px-3 py-2 transition-colors hover:opacity-80 ${collapsed ? "text-center" : ""}`}
          style={{ border: "1px solid var(--app-border)" }}
        >
          {collapsed ? "Exit" : "Sign Out"}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen">
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
          <div className="fixed left-0 top-0 bottom-0 w-[280px] max-w-[85vw] theme-sidebar border-r z-[999] overflow-y-auto p-4 pt-safe pb-safe pl-safe flex flex-col gap-1" style={{ animation: "slideIn .25s ease" }}>
            {/* Close button */}
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 w-8 h-8 flex items-center justify-center rounded-lg theme-text-muted hover:bg-brand-gold/10 transition-colors"
              style={{ top: "calc(0.75rem + var(--safe-top))" }}
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
          className="fixed left-4 z-[901] rounded-lg w-11 h-11 flex items-center justify-center cursor-pointer text-brand-gold text-xl backdrop-blur-lg"
          style={{ top: "calc(1rem + var(--safe-top))", background: "var(--app-bg-secondary)", border: "1px solid var(--app-sidebar-border)" }}
          aria-label="Open menu"
        >
          ☰
        </button>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:px-10 lg:py-9" style={{ paddingTop: !device.isDesktop ? 72 : undefined }}>
        <div className="mb-5 sm:mb-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-body text-[11px] theme-text-muted tracking-[1px] uppercase mb-1">
                Admin Panel
              </div>
              <h1 className="font-display text-xl sm:text-2xl lg:text-[28px] font-bold mb-1">
                {adminName || user?.name || "Administrator"} <span className="font-body text-[13px] font-normal theme-text-muted">({ROLE_LABELS[userRole] || "Admin"})</span>
              </h1>
            </div>
            <NotificationBell />
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
