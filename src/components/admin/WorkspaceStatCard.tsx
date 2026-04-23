"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Admin workspace stat card. Wraps the existing `.stat-card` token from
 * globals.css so every card on the workspace uses the same gold-accent
 * visual treatment the reports + revenue pages already use.
 *
 * `href` turns the whole card into a link to the owning admin page so
 * the admin can deep-click a metric to the place where they'd act on it.
 */
export default function WorkspaceStatCard({
  label,
  value,
  sub,
  href,
  highlighted,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  href: string;
  highlighted?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`stat-card block ${highlighted ? "ring-1 ring-brand-gold/40" : ""}`}
    >
      <div className="font-body text-[10px] theme-text-muted uppercase tracking-wider mb-1.5 truncate">
        {label}
      </div>
      <div className="font-display text-2xl sm:text-[28px] font-bold text-brand-gold mb-1">
        {value}
      </div>
      {sub && (
        <div className="font-body text-[11px] theme-text-faint truncate">
          {sub}
        </div>
      )}
    </Link>
  );
}
