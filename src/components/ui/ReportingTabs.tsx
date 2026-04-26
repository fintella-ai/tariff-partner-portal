"use client";

import { usePathname, useRouter } from "next/navigation";

/**
 * ReportingTabs
 *
 * Shared top-of-page tab bar for the finance/analytics pages
 * (/admin/reports, /admin/revenue, /admin/custom-commissions, /admin/payouts).
 * Uses router.push() instead of <Link> to ensure same-window navigation in
 * PWA mode.
 */
const TABS = [
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/revenue", label: "Revenue" },
  { href: "/admin/custom-commissions", label: "Custom Commissions" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/expenses", label: "Expenses" },
] as const;

export default function ReportingTabs() {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <div className="flex gap-1 mb-6 border-b border-[var(--app-border)] overflow-x-auto">
      {TABS.map((t) => {
        const isActive = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <button
            key={t.href}
            onClick={() => router.push(t.href)}
            className={`font-body text-[13px] px-4 py-2.5 whitespace-nowrap transition-colors border-b-2 -mb-px ${
              isActive
                ? "text-brand-gold border-brand-gold"
                : "text-[var(--app-text-muted)] border-transparent hover:text-[var(--app-text-secondary)]"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
