"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { FIRM_SHORT } from "@/lib/constants";
import { useDevice } from "@/lib/useDevice";

const ADMIN_NAV_ITEMS = [
  { id: "partners", href: "/admin/partners", icon: "\u{1F465}", label: "Partners" },
  { id: "deals", href: "/admin/deals", icon: "\u{1F4BC}", label: "Deals" },
  { id: "commissions", href: "/admin/commissions", icon: "\u{1F4B0}", label: "Commissions" },
  { id: "communications", href: "/admin/communications", icon: "\u{1F4E7}", label: "Communications" },
  { id: "training", href: "/admin/training", icon: "\u{1F393}", label: "Training" },
  { id: "conference", href: "/admin/conference", icon: "\u{1F4F9}", label: "Live Weekly" },
  { id: "documents", href: "/admin/documents", icon: "\u{1F4C4}", label: "Documents" },
  { id: "support", href: "/admin/support", icon: "\u{1F3AB}", label: "Support" },
  { id: "payouts", href: "/admin/payouts", icon: "\u{1F4B3}", label: "Payouts" },
  { id: "reports", href: "/admin/reports", icon: "\u{1F4CA}", label: "Reports" },
  { id: "settings", href: "/admin/settings", icon: "\u2699\uFE0F", label: "Settings" },
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

  const user = session?.user as any;

  function navigate(href: string) {
    router.push(href);
    if (!device.isDesktop) setMobileOpen(false);
  }

  const sidebarContent = (
    <>
      <div className={`${collapsed ? "px-1" : "pl-2"} mb-1`}>
        <div className={`font-display font-bold text-brand-gold tracking-[1px] ${collapsed ? "text-center text-xs" : "text-sm"}`}>
          {collapsed ? "T" : FIRM_SHORT}
        </div>
      </div>
      {!collapsed && (
        <div className="font-body text-[10px] theme-text-muted tracking-[2px] uppercase mb-5 pl-2">
          Admin Panel
        </div>
      )}
      {collapsed && <div className="mb-3" />}

      {ADMIN_NAV_ITEMS.map((item) => {
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
              {user?.name || "Admin"}
            </div>
            <div className="font-body text-[11px] theme-text-muted tracking-[1px] mb-3">
              Administrator
            </div>
          </>
        )}
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
          <div className="font-body text-[11px] theme-text-muted tracking-[1px] uppercase mb-1">
            Admin Panel
          </div>
          <h1 className="font-display text-xl sm:text-2xl lg:text-[28px] font-bold mb-1">
            {user?.name || "Administrator"}
          </h1>
        </div>
        {children}
      </div>
    </div>
  );
}
