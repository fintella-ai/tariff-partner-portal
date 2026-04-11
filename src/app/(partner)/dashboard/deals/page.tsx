"use client";

import { useEffect, useState, useCallback } from "react";
import { useDevice } from "@/lib/useDevice";
import StageBadge from "@/components/ui/StageBadge";
import StatusBadge from "@/components/ui/StatusBadge";
import { SkeletonTableRow } from "@/components/ui/Skeleton";
import PullToRefresh from "@/components/ui/PullToRefresh";
import { fmt$, fmtDate } from "@/lib/format";

export default function DealsPage() {
  const device = useDevice();
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/deals");
      if (res.ok) {
        const data = await res.json();
        setDeals(data.directDeals || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div>
        <div className="animate-pulse mb-6">
          <div className="h-6 w-40 bg-[var(--app-card-bg)] rounded-lg mb-2" />
          <div className="h-3 w-64 bg-[var(--app-card-bg)] rounded-lg" />
        </div>
        <div className="card">
          <div className="px-4 sm:px-6 py-4 border-b border-[var(--app-border)]">
            <div className="h-4 w-24 bg-[var(--app-card-bg)] rounded animate-pulse" />
          </div>
          {[1, 2, 3].map((i) => <SkeletonTableRow key={i} cols={5} />)}
        </div>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={loadData} disabled={!device.isMobile}>
    <div>
      <h2 className="font-display text-xl sm:text-2xl font-bold mb-2">
        My Direct Deals
      </h2>
      <p className="font-body text-sm text-[var(--app-text-muted)] mb-6">
        Clients you referred directly. You earn a commission on each Closed Won
        deal.
      </p>

      <div className="card">
        {deals.length === 0 ? (
          <div className="p-12 text-center font-body text-sm text-[var(--app-text-muted)]">
            No deals yet. Share your referral link to start earning commissions.
          </div>
        ) : device.isMobile ? (
          /* ── Mobile: Card layout ── */
          <div>
            {deals.map((deal) => (
                <div
                  key={deal.id}
                  className="px-4 py-4 border-b border-[var(--app-border-subtle)] last:border-b-0"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="font-body text-[13px] font-medium text-[var(--app-text)] leading-snug flex-1 min-w-0">
                      {deal.dealName}
                    </div>
                    <StageBadge stage={deal.stage} />
                  </div>
                  <div className="font-body text-[11px] text-[var(--app-text-muted)] mb-3">
                    {deal.importedProducts || deal.productType} ·{" "}
                    {fmtDate(deal.createdAt)}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="font-body text-[9px] text-[var(--app-text-muted)] tracking-wider uppercase mb-0.5">
                        Refund
                      </div>
                      <div className="font-body text-[13px] text-[var(--app-text)]">
                        {fmt$(deal.estimatedRefundAmount)}
                      </div>
                    </div>
                    <div>
                      <div className="font-body text-[9px] text-[var(--app-text-muted)] tracking-wider uppercase mb-0.5">
                        Firm Fee
                      </div>
                      <div className="font-body text-[13px] text-[var(--app-text-secondary)]">
                        {fmt$(deal.firmFeeAmount)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-body text-[9px] text-[var(--app-text-muted)] tracking-wider uppercase mb-0.5">
                        Commission
                      </div>
                      <div className="font-display text-sm font-semibold text-brand-gold">
                        {fmt$(deal.l1CommissionAmount)}
                      </div>
                      <div className="mt-1">
                        <StatusBadge status={deal.l1CommissionStatus} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          /* ── Desktop/Tablet: Grid table ── */
          <div>
            {/* Header row */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_0.7fr] gap-4 px-6 py-3 border-b border-[var(--app-border)]">
              <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">
                Client / Deal
              </div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">
                Stage
              </div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">
                Est. Refund
              </div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">
                Firm Fee
              </div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">
                Commission
              </div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)] text-right">
                Status
              </div>
            </div>
            {/* Data rows */}
            {deals.map((deal) => (
                <div
                  key={deal.id}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_0.7fr] gap-4 px-6 py-4 border-b border-[var(--app-border)] last:border-b-0 items-center hover:bg-[var(--app-card-bg)] transition-colors"
                >
                  {/* Col 1: Deal name */}
                  <div>
                    <div className="font-body text-[13px] font-medium text-[var(--app-text)] truncate">
                      {deal.dealName}
                    </div>
                    <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5 truncate">
                      {deal.importedProducts || deal.productType} ·{" "}
                      {fmtDate(deal.createdAt)}
                    </div>
                  </div>
                  {/* Col 2: Stage */}
                  <div>
                    <StageBadge stage={deal.stage} />
                  </div>
                  {/* Col 3: Est. Refund */}
                  <div className="font-body text-[13px] text-[var(--app-text)]">
                    {fmt$(deal.estimatedRefundAmount)}
                  </div>
                  {/* Col 4: Firm Fee */}
                  <div className="font-body text-[13px] text-[var(--app-text-secondary)]">
                    {fmt$(deal.firmFeeAmount)}
                  </div>
                  {/* Col 5: Commission */}
                  <div className="font-display text-[15px] font-semibold text-brand-gold">
                    {fmt$(deal.l1CommissionAmount)}
                  </div>
                  {/* Col 6: Status */}
                  <div className="text-right">
                    <StatusBadge status={deal.l1CommissionStatus} />
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
    </PullToRefresh>
  );
}
