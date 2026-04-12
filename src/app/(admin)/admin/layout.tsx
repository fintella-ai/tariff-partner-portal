"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { FIRM_SHORT } from "@/lib/constants";
import { useDevice } from "@/lib/useDevice";
import NotificationBell from "@/components/ui/NotificationBell";
import { getVisibleNav, getPermissions, ROLE_LABELS, type AdminRole } from "@/lib/permissions";

const ADMIN_NAV_ITEMS = [
  { id: "partners", href: "/admin/partners", icon: "\u{1F465}", label: "Partners" },
  { id: "deals", href: "/admin/deals", icon: "\u{1F4BC}", label: "Deals" },
  { id: "communications", href: "/admin/communications", icon: "\u{1F4E7}", label: "Communications" },
  { id: "training", href: "/admin/training", icon: "\u{1F393}", label: "Training" },
  { id: "conference", href: "/admin/conference", icon: "\u{1F4F9}", label: "Live Weekly" },
  { id: "documents", href: "/admin/documents", icon: "\u{1F4C4}", label: "Documents" },
  { id: "support", href: "/admin/support", icon: "\u{1F3AB}", label: "Support" },
  { id: "chat", href: "/admin/chat", icon: "\u{1F4AC}", label: "Live Chat" },
  { id: "payouts", href: "/admin/payouts", icon: "\u{1F4B3}", label: "Payouts" },
  { id: "revenue", href: "/admin/revenue", icon: "\u{1F4B5}", label: "Revenue" },
  { id: "reports", href: "/admin/reports", icon: "\u{1F4CA}", label: "Reports" },
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
  const filteredNav = ADMIN_NAV_ITEMS.filter((item) => visibleNavIds.includes(item.id));

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
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg font-body text-[11px] theme-text-muted hover:bg-brand-gold/5 transition-colors mb-2"
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
          <div className="fixed left-0 top-0 bottom-0 w-[280px] max-w-[85vw] theme-sidebar border-r z-[999] overflow-y-auto p-4 flex flex-col gap-1" style={{ animation: "slideIn .25s ease" }}>
            {/* Close button */}
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg theme-text-muted hover:bg-brand-gold/10 transition-colors"
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
          className="fixed top-4 left-4 z-[901] rounded-lg w-11 h-11 flex items-center justify-center cursor-pointer text-brand-gold text-xl backdrop-blur-lg"
          style={{ background: "var(--app-bg-secondary)", border: "1px solid var(--app-sidebar-border)" }}
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
