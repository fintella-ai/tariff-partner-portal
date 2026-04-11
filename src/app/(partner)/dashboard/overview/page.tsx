"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import StageBadge from "@/components/ui/StageBadge";
import StatusBadge from "@/components/ui/StatusBadge";
import { SkeletonStatCard, SkeletonTableRow } from "@/components/ui/Skeleton";
import PullToRefresh from "@/components/ui/PullToRefresh";
import { fmt$, fmtDate } from "@/lib/format";
import { useDevice } from "@/lib/useDevice";
export default function OverviewPage() {
  const { data: session } = useSession();
  const device = useDevice();
  const [directDeals, setDirectDeals] = useState<any[]>([]);
  const [downlinePartners, setDownlinePartners] = useState<any[]>([]);
  const [downlineDeals, setDownlineDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/deals");
      if (res.ok) {
        const data = await res.json();
        setDirectDeals(data.directDeals || []);
        setDownlinePartners(data.downlinePartners || []);
        setDownlineDeals(data.downlineDeals || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const totalRefundPipeline = directDeals.reduce(
    (s, d) => s + Number(d.estimatedRefundAmount || 0), 0
  );
  const totalL1Earned = directDeals.reduce(
    (s, d) => s + Number(d.l1CommissionAmount || 0), 0
  );
  const totalL1Paid = directDeals
    .filter((d) => d.l1CommissionStatus === "paid")
    .reduce((s, d) => s + Number(d.l1CommissionAmount || 0), 0);
  const totalL2Earned = downlineDeals.reduce(
    (s, d) => s + Number(d.l2CommissionAmount || 0), 0
  );
  const totalL2Paid = downlineDeals
    .filter((d) => d.l2CommissionStatus === "paid")
    .reduce((s, d) => s + Number(d.l2CommissionAmount || 0), 0);

  // Build a map from partner code → partner name for display in downline deals
  const partnerNameMap: Record<string, string> = {};
  for (const partner of downlinePartners) {
    const p = partner;
    if (p.partnerCode) {
      partnerNameMap[p.partnerCode] = `${p.firstName} ${p.lastName}`.trim();
    }
  }

  if (loading) {
    return (
      <div>
        <div className="animate-pulse mb-6">
          <div className="h-6 w-48 bg-[var(--app-card-bg)] rounded-lg mb-2" />
          <div className="h-3 w-72 bg-[var(--app-card-bg)] rounded-lg" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[1, 2, 3, 4].map((i) => <SkeletonStatCard key={i} />)}
        </div>
        <div className="card">
          <div className="px-4 sm:px-6 py-4 border-b border-[var(--app-border)]">
            <div className="h-4 w-32 bg-[var(--app-card-bg)] rounded animate-pulse" />
          </div>
          {[1, 2, 3].map((i) => <SkeletonTableRow key={i} cols={4} />)}
        </div>
      </div>
    );
  }

  const stats = [
    { label: "Refund Pipeline", value: fmt$(totalRefundPipeline), sub: "All deals" },
    { label: "L1 Earned", value: fmt$(totalL1Earned), sub: `${fmt$(totalL1Paid)} paid` },
    { label: "L2 Earned", value: fmt$(totalL2Earned), sub: `${fmt$(totalL2Paid)} paid` },
    { label: "Team Size", value: String(downlinePartners.length), sub: "Partners" },
  ];

  return (
    <PullToRefresh onRefresh={loadData} disabled={!device.isMobile}>
    <div>
      {/* Stat Cards */}
      <div className={`grid grid-cols-2 lg:grid-cols-4 ${device.gap} mb-5 sm:mb-8`}>
        {stats.map((s) => (
          <div key={s.label} className="stat-card">
            <div className="font-body text-[9px] tracking-[1.5px] uppercase text-[var(--app-text-muted)] mb-2">
              {s.label}
            </div>
            <div className="font-display text-[22px] sm:text-[28px] font-bold text-brand-gold mb-0.5">
              {s.value}
            </div>
            <div className="font-body text-[11px] text-[var(--app-text-muted)]">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ═══ RECENT DIRECT DEALS ═══ */}
      <div className="card mb-6">
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-[var(--app-border)]">
          <div className="font-body font-semibold text-sm sm:text-[15px]">Recent Direct Deals</div>
        </div>

        {directDeals.length === 0 ? (
          <div className="p-12 text-center font-body text-sm text-[var(--app-text-muted)]">
            No direct deals yet. Share your referral link to get started.
          </div>
        ) : device.isMobile ? (
          /* ── Mobile: Card layout ── */
          <div>
            {directDeals.slice(0, 5).map((deal) => {
              const p = deal;
              return (
                <div key={deal.id} className="px-4 py-4 border-b border-[var(--app-border-subtle)] last:border-b-0">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="font-body text-[13px] font-medium text-[var(--app-text)] leading-snug flex-1 min-w-0">
                      {p.dealName}
                    </div>
                    <StageBadge stage={p.stage} />
                  </div>
                  <div className="font-body text-[11px] text-[var(--app-text-muted)] mb-3">
                    {p.importedProducts || p.productType} · {fmtDate(p.createdAt)}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="font-body text-[9px] text-[var(--app-text-muted)] tracking-wider uppercase mb-0.5">Refund</div>
                      <div className="font-body text-[13px] text-[var(--app-text)]">{fmt$(p.estimatedRefundAmount)}</div>
                    </div>
                    <div>
                      <div className="font-body text-[9px] text-[var(--app-text-muted)] tracking-wider uppercase mb-0.5">Firm Fee</div>
                      <div className="font-body text-[13px] text-[var(--app-text-secondary)]">{fmt$(p.firmFeeAmount)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-body text-[9px] text-[var(--app-text-muted)] tracking-wider uppercase mb-0.5">Commission</div>
                      <div className="font-display text-sm font-semibold text-brand-gold">{fmt$(p.l1CommissionAmount)}</div>
                      <div className="mt-1"><StatusBadge status={p.l1CommissionStatus} /></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── Desktop/Tablet: Grid table with aligned columns ── */
          <div>
            {/* Header row */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 px-6 py-3 border-b border-[var(--app-border)]">
              <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">Client / Deal</div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">Stage</div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">Est. Refund</div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">Firm Fee</div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)] text-right">Commission</div>
            </div>
            {/* Data rows */}
            {directDeals.slice(0, 5).map((deal) => {
              const p = deal;
              return (
                <div
                  key={deal.id}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 px-6 py-4 border-b border-[var(--app-border)] last:border-b-0 items-center hover:bg-[var(--app-card-bg)] transition-colors"
                >
                  {/* Col 1: Deal name */}
                  <div>
                    <div className="font-body text-[13px] font-medium text-[var(--app-text)] truncate">{p.dealName}</div>
                    <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5 truncate">
                      {p.importedProducts || p.productType} · {fmtDate(p.createdAt)}
                    </div>
                  </div>
                  {/* Col 2: Stage */}
                  <div>
                    <StageBadge stage={p.stage} />
                  </div>
                  {/* Col 3: Est. Refund */}
                  <div className="font-body text-[13px] text-[var(--app-text)]">
                    {fmt$(p.estimatedRefundAmount)}
                  </div>
                  {/* Col 4: Firm Fee */}
                  <div className="font-body text-[13px] text-[var(--app-text-secondary)]">
                    {fmt$(p.firmFeeAmount)}
                  </div>
                  {/* Col 5: Commission + Status */}
                  <div className="text-right">
                    <div className="font-display text-[15px] font-semibold text-brand-gold mb-1">
                      {fmt$(p.l1CommissionAmount)}
                    </div>
                    <StatusBadge status={p.l1CommissionStatus} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ RECENT DOWNLINE ACTIVITY ═══ */}
      {downlineDeals.length > 0 && (
        <div className="card">
          <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-[var(--app-border)]">
            <div className="font-body font-semibold text-sm sm:text-[15px]">
              Recent Downline Activity
            </div>
          </div>

          {device.isMobile ? (
            /* ── Mobile: Card layout ── */
            <div>
              {downlineDeals.slice(0, 3).map((deal) => {
                const p = deal;
                return (
                  <div key={deal.id} className="px-4 py-4 border-b border-[var(--app-border-subtle)] last:border-b-0">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="font-body text-[13px] font-medium text-[var(--app-text)] leading-snug flex-1 min-w-0">
                        {p.dealName}
                      </div>
                      <StageBadge stage={p.stage} />
                    </div>
                    <div className="font-body text-[11px] text-[var(--app-text-muted)] mb-3">
                      Via {p.submittingPartnerName || partnerNameMap[p.partnerCode] || p.partnerCode} · {fmtDate(p.createdAt)}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="font-body text-[9px] text-[var(--app-text-muted)] tracking-wider uppercase mb-0.5">Refund</div>
                        <div className="font-body text-[13px] text-[var(--app-text)]">{fmt$(p.estimatedRefundAmount)}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-body text-[9px] text-[var(--app-text-muted)] tracking-wider uppercase mb-0.5">L2 Commission</div>
                        <div className="font-display text-sm font-semibold text-brand-gold">{fmt$(p.l2CommissionAmount)}</div>
                        <div className="mt-1"><StatusBadge status={p.l2CommissionStatus} /></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── Desktop/Tablet: Grid table ── */
            <div>
              {/* Header */}
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-6 py-3 border-b border-[var(--app-border)]">
                <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">Client / Deal</div>
                <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">Stage</div>
                <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">Est. Refund</div>
                <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)] text-right">L2 Commission</div>
              </div>
              {/* Rows */}
              {downlineDeals.slice(0, 3).map((deal) => {
                const p = deal;
                return (
                  <div
                    key={deal.id}
                    className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-6 py-4 border-b border-[var(--app-border)] last:border-b-0 items-center hover:bg-[var(--app-card-bg)] transition-colors"
                  >
                    <div>
                      <div className="font-body text-[13px] font-medium text-[var(--app-text)] truncate">{p.dealName}</div>
                      <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5 truncate">
                        Via {p.submittingPartnerName || partnerNameMap[p.partnerCode] || p.partnerCode} · {fmtDate(p.createdAt)}
                      </div>
                    </div>
                    <div>
                      <StageBadge stage={p.stage} />
                    </div>
                    <div className="font-body text-[13px] text-[var(--app-text)]">
                      {fmt$(p.estimatedRefundAmount)}
                    </div>
                    <div className="text-right">
                      <div className="font-display text-[15px] font-semibold text-brand-gold mb-1">
                        {fmt$(p.l2CommissionAmount)}
                      </div>
                      <StatusBadge status={p.l2CommissionStatus} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
    </PullToRefresh>
  );
}
