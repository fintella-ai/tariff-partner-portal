"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { FIRM_SHORT } from "@/lib/constants";

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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const user = session?.user as any;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <div className="w-60 bg-black/30 border-r border-brand-gold/10 p-4 flex flex-col gap-1 shrink-0 sticky top-0 h-screen overflow-y-auto">
        <div className="font-display text-sm font-bold text-brand-gold tracking-[1px] mb-1 pl-2">
          {FIRM_SHORT}
        </div>
        <div className="font-body text-[10px] text-white/40 tracking-[2px] uppercase mb-5 pl-2">
          Admin Panel
        </div>

        {ADMIN_NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <button
              key={item.id}
              onClick={() => router.push(item.href)}
              className={`flex items-center gap-3 w-full text-left px-4 py-3.5 rounded-lg font-body text-sm transition-all min-h-[48px] ${
                isActive
                  ? "bg-brand-gold/10 text-brand-gold"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}

        <div className="flex-1" />
        <div className="pt-4 px-2 border-t border-white/[0.06] mt-4">
          <div className="font-body text-xs text-white/50 mb-1">
            {user?.name || "Admin"}
          </div>
          <div className="font-body text-[11px] text-white/30 tracking-[1px] mb-3">
            Administrator
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full font-body text-[11px] text-white/40 border border-white/10 rounded px-3 py-2 hover:text-white/60 hover:border-white/20 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:px-10 lg:py-9">
        <div className="mb-5 sm:mb-8">
          <div className="font-body text-[11px] text-white/40 tracking-[1px] uppercase mb-1">
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
