"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import StageBadge from "@/components/ui/StageBadge";
import StatusBadge from "@/components/ui/StatusBadge";
import { SkeletonStatCard, SkeletonTableRow } from "@/components/ui/Skeleton";
import PullToRefresh from "@/components/ui/PullToRefresh";
import { fmt$, fmtDate } from "@/lib/format";
import { useDevice } from "@/lib/useDevice";
export default function OverviewPage() {
  const { data: session } = useSession();
  const device = useDevice();
  const router = useRouter();
  const [directDeals, setDirectDeals] = useState<any[]>([]);
  const [downlinePartners, setDownlinePartners] = useState<any[]>([]);
  const [downlineDeals, setDownlineDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [overviewTab, setOverviewTab] = useState<"direct" | "downline">("direct");

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

      {/* ═══ DEALS TABS ═══ */}
      <div className="card mb-6">
        <div className="flex gap-1 px-4 sm:px-6 pt-4 sm:pt-5 border-b border-[var(--app-border)]">
          {([
            { id: "direct" as const, label: "Recent Direct Deals" },
            { id: "downline" as const, label: "Recent Downline Activity" },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setOverviewTab(t.id)}
              className={`font-body text-[13px] px-4 py-2.5 whitespace-nowrap transition-colors border-b-2 -mb-px ${
                overviewTab === t.id
                  ? "text-brand-gold border-brand-gold"
                  : "text-[var(--app-text-muted)] border-transparent hover:text-[var(--app-text-secondary)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {overviewTab === "direct" && (<>
        {/* Direct Deals content */}

        {directDeals.length === 0 ? (
          <div className="p-12 text-center font-body text-sm text-[var(--app-text-muted)]">
            No direct deals yet. Share your referral link to get started.
          </div>
        ) : device.isMobile ? (
          /* ── Mobile: Card layout ── */
          <div>
            {directDeals.slice(0, 5).map((deal, idx) => {
              const p = deal;
              return (
                <div key={deal.id} className={`px-4 py-4 border-b border-[var(--app-border)] ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <button onClick={() => router.push(`/dashboard/deals?deal=${deal.id}`)} className="font-body text-[13px] font-medium text-[var(--app-text)] leading-snug flex-1 min-w-0 text-left hover:text-brand-gold hover:underline underline-offset-2 transition-colors truncate">
                      {p.dealName}
                    </button>
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
          /* ── Desktop/Tablet: Table ── */
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--app-border)]">
                  <th className="px-4 sm:px-6 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium text-left">Client / Deal</th>
                  <th className="px-3 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium text-center">Stage</th>
                  <th className="px-3 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium text-center">Est. Refund</th>
                  <th className="px-3 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium text-center">Firm Fee</th>
                  <th className="px-3 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium text-center">Comm %</th>
                  <th className="px-3 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium text-center">Status</th>
                  <th className="px-3 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium text-center">Commission</th>
                </tr>
              </thead>
              <tbody>
                {directDeals.slice(0, 5).map((deal, idx) => {
                  const p = deal;
                  return (
                    <tr key={deal.id} className={`border-b border-[var(--app-border)] last:border-b-0 hover:bg-[var(--app-card-bg)] transition-colors ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}>
                      <td className="px-4 sm:px-6 py-3.5">
                        <button onClick={() => router.push(`/dashboard/deals?deal=${deal.id}`)} className="font-body text-[13px] font-medium text-[var(--app-text)] truncate text-left hover:text-brand-gold hover:underline underline-offset-2 transition-colors block w-full">{p.dealName}</button>
                        <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5 truncate">{p.importedProducts || p.productType} · {fmtDate(p.createdAt)}</div>
                      </td>
                      <td className="px-3 py-3.5 text-center"><StageBadge stage={p.stage} /></td>
                      <td className="px-3 py-3.5 text-center font-body text-[13px] text-[var(--app-text)]">{fmt$(p.estimatedRefundAmount)}</td>
                      <td className="px-3 py-3.5 text-center font-body text-[13px] text-[var(--app-text-secondary)]">{fmt$(p.firmFeeAmount)}</td>
                      <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-muted)]">{p.commissionRate ? `${Math.round(p.commissionRate * 100)}%` : "—"}</td>
                      <td className="px-3 py-3.5 text-center"><StatusBadge status={p.l1CommissionStatus} /></td>
                      <td className="px-3 py-3.5 text-center font-display text-[15px] font-semibold text-brand-gold">{fmt$(p.l1CommissionAmount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </>)}

        {overviewTab === "downline" && (<>

          {device.isMobile ? (
            /* ── Mobile: Card layout ── */
            <div>
              {downlineDeals.slice(0, 3).map((deal, idx) => {
                const p = deal;
                return (
                  <div key={deal.id} className={`px-4 py-4 border-b border-[var(--app-border)] ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}>
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
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--app-border)]">
                    <th className="px-4 sm:px-6 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium text-left">Client / Deal</th>
                    <th className="px-3 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium text-center">Partner</th>
                    <th className="px-3 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium text-center">Stage</th>
                    <th className="px-3 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium text-center">Est. Refund</th>
                    <th className="px-3 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium text-center">Status</th>
                    <th className="px-3 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium text-center">L2 Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {downlineDeals.slice(0, 3).map((deal, idx) => {
                    const p = deal;
                    return (
                      <tr key={deal.id} className={`border-b border-[var(--app-border)] last:border-b-0 hover:bg-[var(--app-card-bg)] transition-colors ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}>
                        <td className="px-4 sm:px-6 py-3.5">
                          <button onClick={() => router.push(`/dashboard/deals?deal=${deal.id}`)} className="font-body text-[13px] font-medium text-[var(--app-text)] truncate text-left hover:text-brand-gold hover:underline underline-offset-2 transition-colors block w-full">{p.dealName}</button>
                          <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5 truncate">{fmtDate(p.createdAt)}</div>
                        </td>
                        <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-secondary)]">{p.submittingPartnerName || partnerNameMap[p.partnerCode] || p.partnerCode}</td>
                        <td className="px-3 py-3.5 text-center"><StageBadge stage={p.stage} /></td>
                        <td className="px-3 py-3.5 text-center font-body text-[13px] text-[var(--app-text)]">{fmt$(p.estimatedRefundAmount)}</td>
                        <td className="px-3 py-3.5 text-center"><StatusBadge status={p.l2CommissionStatus} /></td>
                        <td className="px-3 py-3.5 text-center font-display text-[15px] font-semibold text-brand-gold">{fmt$(p.l2CommissionAmount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {downlineDeals.length === 0 && (
            <div className="p-12 text-center font-body text-sm text-[var(--app-text-muted)]">
              No downline activity yet. Recruit partners to build your team.
            </div>
          )}
        </>)}
      </div>
    </div>
    </PullToRefresh>
  );
}
