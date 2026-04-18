"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useDevice } from "@/lib/useDevice";
import StageBadge from "@/components/ui/StageBadge";
import StatusBadge from "@/components/ui/StatusBadge";
import { fmt$, fmtDate } from "@/lib/format";

type DealEntry = {
  id: string;
  dealName: string;
  clientName?: string;
  stage: string;
  estimatedRefundAmount: number;
  firmFeeAmount: number;
  l1CommissionAmount: number;
  l1CommissionStatus: string;
  l2CommissionAmount?: number;
  l2CommissionStatus?: string;
  partnerCode?: string;
  submittingPartnerName?: string;
  createdAt: string;
  source: "direct" | "downline";
};

export default function PartnerReportingPage() {
  const device = useDevice();
  const [directDeals, setDirectDeals] = useState<any[]>([]);
  const [downlineDeals, setDownlineDeals] = useState<any[]>([]);
  const [downlinePartners, setDownlinePartners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [sourceFilter, setSourceFilter] = useState<"all" | "direct" | "downline">("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/deals");
      if (res.ok) {
        const data = await res.json();
        setDirectDeals(data.directDeals || []);
        setDownlineDeals(data.downlineDeals || []);
        setDownlinePartners(data.downlinePartners || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Partner name map
  const partnerNameMap: Record<string, string> = {};
  for (const p of downlinePartners) {
    if (p.partnerCode) partnerNameMap[p.partnerCode] = `${p.firstName} ${p.lastName}`.trim();
  }

  // Combine all deals into unified entries
  const allDeals: DealEntry[] = useMemo(() => [
    ...directDeals.map((d) => ({
      ...d,
      source: "direct" as const,
      commissionAmount: d.l1CommissionAmount || 0,
      commissionStatus: d.l1CommissionStatus || "pending",
    })),
    ...downlineDeals.map((d) => ({
      ...d,
      source: "downline" as const,
      commissionAmount: d.l2CommissionAmount || 0,
      commissionStatus: d.l2CommissionStatus || "pending",
    })),
  ], [directDeals, downlineDeals]);

  // Get unique stages for filter
  const stages = useMemo(() => {
    const s = new Set(allDeals.map((d) => d.stage));
    return Array.from(s).sort();
  }, [allDeals]);

  // Apply filters
  const filtered = useMemo(() => {
    let result = allDeals;
    if (sourceFilter !== "all") result = result.filter((d) => d.source === sourceFilter);
    if (stageFilter !== "all") result = result.filter((d) => d.stage === stageFilter);
    if (statusFilter !== "all") {
      result = result.filter((d) => {
        const cs = d.source === "direct" ? d.l1CommissionStatus : d.l2CommissionStatus;
        return cs === statusFilter;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((d) =>
        d.dealName?.toLowerCase().includes(q) ||
        d.clientName?.toLowerCase().includes(q) ||
        (d.submittingPartnerName || partnerNameMap[d.partnerCode || ""] || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [allDeals, sourceFilter, stageFilter, statusFilter, searchQuery, partnerNameMap]);

  // Metrics
  const metrics = useMemo(() => {
    const totalDeals = allDeals.length;
    const totalDirect = directDeals.length;
    const totalDownline = downlineDeals.length;

    const totalRefund = allDeals.reduce((s, d) => s + Number(d.estimatedRefundAmount || 0), 0);
    const totalFirmFee = allDeals.reduce((s, d) => s + Number(d.firmFeeAmount || 0), 0);

    const totalL1 = directDeals.reduce((s, d) => s + Number(d.l1CommissionAmount || 0), 0);
    const totalL2 = downlineDeals.reduce((s, d) => s + Number(d.l2CommissionAmount || 0), 0);
    const totalCommission = totalL1 + totalL2;

    const l1Paid = directDeals.filter((d) => d.l1CommissionStatus === "paid").reduce((s, d) => s + Number(d.l1CommissionAmount || 0), 0);
    const l1Pending = directDeals.filter((d) => d.l1CommissionStatus === "pending").reduce((s, d) => s + Number(d.l1CommissionAmount || 0), 0);
    const l1Due = directDeals.filter((d) => d.l1CommissionStatus === "due").reduce((s, d) => s + Number(d.l1CommissionAmount || 0), 0);
    const l2Paid = downlineDeals.filter((d) => d.l2CommissionStatus === "paid").reduce((s, d) => s + Number(d.l2CommissionAmount || 0), 0);
    const l2Pending = downlineDeals.filter((d) => d.l2CommissionStatus === "pending").reduce((s, d) => s + Number(d.l2CommissionAmount || 0), 0);
    const l2Due = downlineDeals.filter((d) => d.l2CommissionStatus === "due").reduce((s, d) => s + Number(d.l2CommissionAmount || 0), 0);

    const totalPaid = l1Paid + l2Paid;
    const totalPending = l1Pending + l2Pending;
    const totalDue = l1Due + l2Due;

    const closedWon = allDeals.filter((d) => d.stage === "closedwon" || d.stage === "closed_won").length;
    const closedLost = allDeals.filter((d) => d.stage === "closedlost" || d.stage === "closed_lost").length;
    const pipeline = totalDeals - closedWon - closedLost;

    return {
      totalDeals, totalDirect, totalDownline,
      totalRefund, totalFirmFee, totalCommission,
      totalPaid, totalPending, totalDue,
      closedWon, closedLost, pipeline,
      totalL1, totalL2,
    };
  }, [allDeals, directDeals, downlineDeals]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-5">
        <div className="spinner" />
        <div className="font-body text-sm text-[var(--app-text-secondary)]">Loading reports...</div>
      </div>
    );
  }

  const inputClass = "font-body text-[12px] bg-[var(--app-input-bg)] border border-[var(--app-input-border)] text-[var(--app-input-text)] rounded-lg px-3 py-2 min-h-[40px]";

  return (
    <div>
      <h2 className={`font-display ${device.isMobile ? "text-lg" : "text-[22px]"} font-bold mb-1.5`}>
        Reporting
      </h2>
      <p className="font-body text-[13px] text-[var(--app-text-muted)] mb-6">
        Detailed metrics and deal reporting across your direct referrals and downline.
      </p>

      {/* ═══ METRICS CARDS ═══ */}
      <div className={`grid ${device.isMobile ? "grid-cols-2" : "grid-cols-4"} ${device.gap} mb-6`}>
        {[
          { label: "Total Deals", value: String(metrics.totalDeals), sub: `${metrics.totalDirect} direct · ${metrics.totalDownline} downline` },
          { label: "Total Refund Pipeline", value: fmt$(metrics.totalRefund), sub: `${metrics.pipeline} in pipeline` },
          { label: "Total Commission", value: fmt$(metrics.totalCommission), sub: `L1: ${fmt$(metrics.totalL1)} · L2: ${fmt$(metrics.totalL2)}` },
          { label: "Closed Won", value: String(metrics.closedWon), sub: `${metrics.closedLost} lost · ${metrics.pipeline} active` },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <div className="font-body text-[9px] tracking-[1.5px] uppercase text-[var(--app-text-muted)] mb-2">{s.label}</div>
            <div className="font-display text-[22px] sm:text-[28px] font-bold text-brand-gold mb-0.5">{s.value}</div>
            <div className="font-body text-[11px] text-[var(--app-text-muted)]">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ═══ PAYOUT STATUS CARDS ═══ */}
      <div className={`grid ${device.isMobile ? "grid-cols-3" : "grid-cols-3"} ${device.gap} mb-6`}>
        <div className="p-4 border border-green-500/20 rounded-xl bg-green-500/[0.04] text-center">
          <div className="font-body text-[9px] tracking-[1.5px] uppercase text-green-400/70 mb-1">Paid</div>
          <div className="font-display text-xl sm:text-2xl font-bold text-green-400">{fmt$(metrics.totalPaid)}</div>
        </div>
        <div className="p-4 border border-yellow-500/20 rounded-xl bg-yellow-500/[0.04] text-center">
          <div className="font-body text-[9px] tracking-[1.5px] uppercase text-yellow-400/70 mb-1">Pending</div>
          <div className="font-display text-xl sm:text-2xl font-bold text-yellow-400">{fmt$(metrics.totalPending)}</div>
        </div>
        <div className="p-4 border border-blue-500/20 rounded-xl bg-blue-500/[0.04] text-center">
          <div className="font-body text-[9px] tracking-[1.5px] uppercase text-blue-400/70 mb-1">Due</div>
          <div className="font-display text-xl sm:text-2xl font-bold text-blue-400">{fmt$(metrics.totalDue)}</div>
        </div>
      </div>

      {/* ═══ FILTERS ═══ */}
      <div className="card mb-6">
        <div className="px-4 sm:px-6 py-4">
          <div className="font-body font-semibold text-sm mb-3">Filters</div>
          <div className={`grid ${device.isMobile ? "grid-cols-1 gap-3" : "grid-cols-4 gap-3"}`}>
            <input
              type="text"
              placeholder="Search deals, clients, partners..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={inputClass}
            />
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as any)} className={inputClass}>
              <option value="all">All Sources</option>
              <option value="direct">Direct Only</option>
              <option value="downline">Downline Only</option>
            </select>
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className={inputClass}>
              <option value="all">All Stages</option>
              {stages.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
              ))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputClass}>
              <option value="all">All Commission Status</option>
              <option value="pending">Pending</option>
              <option value="due">Due</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        </div>
      </div>

      {/* ═══ DEALS TABLE ═══ */}
      <div className="card">
        <div className="px-4 sm:px-6 py-4 border-b border-[var(--app-border)] flex items-center justify-between">
          <div className="font-body font-semibold text-sm">
            Showing {filtered.length} of {allDeals.length} deals
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center font-body text-sm text-[var(--app-text-muted)]">
            No deals match your filters.
          </div>
        ) : device.isMobile ? (
          <div>
            {filtered.map((deal, idx) => {
              const commAmt = deal.source === "direct" ? deal.l1CommissionAmount : (deal.l2CommissionAmount || 0);
              const commStatus = deal.source === "direct" ? deal.l1CommissionStatus : (deal.l2CommissionStatus || "pending");
              return (
                <div key={deal.id + deal.source} className={`px-4 py-3.5 border-b border-[var(--app-border)] last:border-b-0 ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-body text-[13px] font-medium text-[var(--app-text)] truncate flex-1 mr-2">{deal.dealName}</div>
                    <StageBadge stage={deal.stage} />
                  </div>
                  <div className="flex justify-between items-center mb-1">
                    <span className={`font-body text-[10px] font-semibold rounded px-1.5 py-0.5 ${
                      deal.source === "direct" ? "text-brand-gold bg-brand-gold/10 border border-brand-gold/20" : "text-purple-400 bg-purple-500/10 border border-purple-500/20"
                    }`}>{deal.source === "direct" ? "L1 Direct" : "L2 Downline"}</span>
                    <div className="font-body text-[11px] text-[var(--app-text-muted)]">{fmtDate(deal.createdAt)}</div>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="font-body text-[12px] text-[var(--app-text-muted)]">Refund: {fmt$(deal.estimatedRefundAmount)}</div>
                    <div className="flex items-center gap-2">
                      <div className="font-display text-sm font-semibold text-brand-gold">{fmt$(commAmt)}</div>
                      <StatusBadge status={commStatus} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr className="border-b border-[var(--app-border)]">
                  <th className="px-4 sm:px-6 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium text-center">Deal</th>
                  <th className="px-4 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium text-center">Source</th>
                  <th className="px-4 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium text-center">Stage</th>
                  <th className="px-4 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium text-center">Refund</th>
                  <th className="px-4 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium text-center">Commission</th>
                  <th className="px-4 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium text-center">Status</th>
                  <th className="px-4 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium text-center">Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((deal, idx) => {
                  const commAmt = deal.source === "direct" ? deal.l1CommissionAmount : (deal.l2CommissionAmount || 0);
                  const commStatus = deal.source === "direct" ? deal.l1CommissionStatus : (deal.l2CommissionStatus || "pending");
                  const partnerName = deal.source === "downline" ? (deal.submittingPartnerName || partnerNameMap[deal.partnerCode || ""] || deal.partnerCode) : null;
                  return (
                    <tr key={deal.id + deal.source} className={`border-b border-[var(--app-border)] last:border-b-0 hover:bg-[var(--app-card-bg)] transition-colors ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}>
                      <td className="px-4 sm:px-6 py-3.5">
                        <div className="font-body text-[13px] text-[var(--app-text)] truncate">{deal.dealName}</div>
                        {partnerName && <div className="font-body text-[11px] text-[var(--app-text-muted)] truncate">via {partnerName}</div>}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`font-body text-[10px] font-semibold rounded px-1.5 py-0.5 ${
                          deal.source === "direct" ? "text-brand-gold bg-brand-gold/10 border border-brand-gold/20" : "text-purple-400 bg-purple-500/10 border border-purple-500/20"
                        }`}>{deal.source === "direct" ? "L1" : "L2"}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center"><StageBadge stage={deal.stage} /></td>
                      <td className="px-4 py-3.5 text-center font-body text-[13px] text-[var(--app-text)]">{fmt$(deal.estimatedRefundAmount)}</td>
                      <td className="px-4 py-3.5 text-center font-display text-[14px] font-semibold text-brand-gold">{fmt$(commAmt)}</td>
                      <td className="px-4 py-3.5 text-center"><StatusBadge status={commStatus} /></td>
                      <td className="px-4 py-3.5 text-center font-body text-[12px] text-[var(--app-text-muted)]">{fmtDate(deal.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
