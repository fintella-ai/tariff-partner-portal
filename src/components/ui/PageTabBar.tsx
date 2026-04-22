"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface PageTab {
  label: string;
  href: string;
}

interface PageTabBarProps {
  /** Heading shown above the tab row, e.g. "Communications". */
  title?: string;
  /** Ordered list of tabs. First tab is conventionally the landing tab. */
  tabs: PageTab[];
}

/**
 * Horizontal tab bar rendered at the top of pages that belong to a
 * consolidated partner-side section (Communications, Partner Support).
 * The sidebar links to the first tab's href; each tab is a `<Link>` to its
 * own route, active state keyed to pathname match.
 *
 * No local state — tab selection IS the URL. Keeps the 5 legacy routes
 * intact (bookmarks, notification deep links, workflow-sent URLs) while
 * presenting them as a unified grouping.
 */
export default function PageTabBar({ title, tabs }: PageTabBarProps) {
  const pathname = usePathname() || "";

  return (
    <div className="mb-4 sm:mb-6">
      {title && (
        <h2 className="font-display text-xl sm:text-2xl font-bold mb-3">{title}</h2>
      )}
      <div className="flex gap-1 border-b border-[var(--app-border)] overflow-x-auto -mx-1 px-1">
        {tabs.map((t) => {
          const isActive =
            pathname === t.href || pathname.startsWith(t.href + "/");
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
    </div>
  );
}
