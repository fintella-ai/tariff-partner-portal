"use client";

/**
 * Skeleton loading components for perceived performance improvement.
 * Match the dark theme with subtle shimmer animation.
 */

function SkeletonBase({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-[var(--app-card-bg)] ${className}`}
    />
  );
}

/** Single text line skeleton */
export function SkeletonLine({ width = "w-full", height = "h-3" }: { width?: string; height?: string }) {
  return <SkeletonBase className={`${width} ${height}`} />;
}

/** Stat card skeleton */
export function SkeletonStatCard() {
  return (
    <div className="card p-4 sm:p-5">
      <SkeletonLine width="w-20" height="h-2.5" />
      <SkeletonBase className="w-16 h-7 mt-2" />
    </div>
  );
}

/** Table row skeleton */
export function SkeletonTableRow({ cols = 5 }: { cols?: number }) {
  return (
    <div className={`grid gap-4 px-4 sm:px-6 py-4 border-b border-[var(--app-border)]`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {Array.from({ length: cols }).map((_, i) => (
        <SkeletonLine key={i} width={i === 0 ? "w-3/4" : "w-1/2"} height="h-3" />
      ))}
    </div>
  );
}

/** Card skeleton (for mobile card layouts) */
export function SkeletonCard() {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <SkeletonLine width="w-2/3" height="h-4" />
        <SkeletonBase className="w-16 h-5 rounded-full" />
      </div>
      <SkeletonLine width="w-1/2" height="h-2.5" />
      <div className="flex gap-3 mt-3">
        <SkeletonBase className="w-20 h-8" />
        <SkeletonBase className="w-20 h-8" />
      </div>
    </div>
  );
}

/** Full page loading skeleton with stats + table */
export function SkeletonPageLoader({ statCards = 4, tableRows = 5, tableCols = 5 }: { statCards?: number; tableRows?: number; tableCols?: number }) {
  return (
    <div>
      {/* Title */}
      <SkeletonLine width="w-48" height="h-6 mb-2" />
      <SkeletonLine width="w-72" height="h-3 mb-6" />

      {/* Stat cards */}
      <div className={`grid grid-cols-2 sm:grid-cols-${statCards} gap-3 mb-6`}>
        {Array.from({ length: statCards }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      {/* Table */}
      <div className="card">
        <div className="px-4 sm:px-6 py-4 border-b border-[var(--app-border)]">
          <SkeletonLine width="w-32" height="h-4" />
        </div>
        {Array.from({ length: tableRows }).map((_, i) => (
          <SkeletonTableRow key={i} cols={tableCols} />
        ))}
      </div>
    </div>
  );
}

export default SkeletonBase;
