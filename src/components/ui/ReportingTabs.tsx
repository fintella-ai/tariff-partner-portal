"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * ReportingTabs
 *
 * Shared top-of-page tab bar for the three finance/analytics pages
 * (/admin/reports, /admin/revenue, /admin/payouts). Per John's
 * request these no longer live as three separate nav items; the
 * sidebar has a single "Reporting" entry and this component lets
 * you switch between the three views once you're on any of them.
 */
const TABS = [
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/revenue", label: "Revenue" },
  { href: "/admin/payouts", label: "Payouts" },
] as const;

export default function ReportingTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 mb-6 border-b border-[var(--app-border)] overflow-x-auto">
      {TABS.map((t) => {
        const isActive = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`font-body text-[13px] px-4 py-2.5 whitespace-nowrap transition-colors border-b-2 -mb-px ${
              isActive
                ? "text-brand-gold border-brand-gold"
                : "text-[var(--app-text-muted)] border-transparent hover:text-[var(--app-text-secondary)]"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
