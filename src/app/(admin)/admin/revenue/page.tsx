"use client";

import { useState, useEffect, useCallback } from "react";
import { fmt$, fmtDate } from "@/lib/format";

const TRLN_FEE_RATE = 0.40; // TRLN receives 40% of firm fee
const PARTNER_RATE = 0.25;  // Partners receive 25% of firm fee
const TRLN_NET_RATE = TRLN_FEE_RATE - PARTNER_RATE; // 15% net to TRLN

interface Deal {
  id: string;
  dealName: string;
  partnerCode: string;
  stage: string;
  estimatedRefundAmount: number;
  firmFeeRate: number | null;
  firmFeeAmount: number;
  l1CommissionAmount: number;
  l1CommissionStatus: string;
  l2CommissionAmount: number;
  l2CommissionStatus: string;
  closeDate: string | null;
  createdAt: string;
}

const stageBadge: Record<string, string> = {
  new_lead: "bg-gray-500/10 text-gray-400 border border-gray-500/20",
  contacted: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  qualified: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  consultation_booked: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  engaged: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  closedwon: "bg-green-500/10 text-green-400 border border-green-500/20",
  closedlost: "bg-red-500/10 text-red-400 border border-red-500/20",
};

export default function RevenuePage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "closedwon" | "pipeline">("all");

  const fetchDeals = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/deals");
      if (res.ok) {
        const data = await res.json();
        setDeals(data.deals || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDeals(); }, [fetchDeals]);

  // Filter deals
  const filtered = deals.filter((d) => {
    if (filter === "closedwon") return d.stage === "closedwon";
    if (filter === "pipeline") return d.stage !== "closedwon" && d.stage !== "closedlost";
    return true;
  });

  // ── Revenue calculations ──────────────────────────────────────────────
  const closedWonDeals = deals.filter((d) => d.stage === "closedwon");
  const pipelineDeals = deals.filter((d) => d.stage !== "closedwon" && d.stage !== "closedlost");

  // Closed Won (realized revenue)
  const totalFirmFeesWon = closedWonDeals.reduce((sum, d) => sum + d.firmFeeAmount, 0);
  const totalTRLNGrossWon = totalFirmFeesWon * TRLN_FEE_RATE;
  const totalPartnerCommWon = closedWonDeals.reduce((sum, d) => sum + d.l1CommissionAmount + d.l2CommissionAmount, 0);
  const totalTRLNNetWon = totalTRLNGrossWon - totalPartnerCommWon;

  // Commission breakdown
  const commPaid = closedWonDeals
    .filter((d) => d.l1CommissionStatus === "paid")
    .reduce((sum, d) => sum + d.l1CommissionAmount + d.l2CommissionAmount, 0);
  const commPending = totalPartnerCommWon - commPaid;

  // Pipeline (projected revenue)
  const totalFirmFeesPipeline = pipelineDeals.reduce((sum, d) => {
    const feeRate = d.firmFeeRate || 0.20;
    return sum + d.estimatedRefundAmount * feeRate;
  }, 0);
  const totalTRLNGrossPipeline = totalFirmFeesPipeline * TRLN_FEE_RATE;
  const totalPartnerCommPipeline = totalFirmFeesPipeline * PARTNER_RATE;
  const totalTRLNNetPipeline = totalTRLNGrossPipeline - totalPartnerCommPipeline;

  // All deals
  const totalFirmFeesAll = totalFirmFeesWon + totalFirmFeesPipeline;
  const totalTRLNGrossAll = totalFirmFeesAll * TRLN_FEE_RATE;
  const totalTRLNNetAll = totalTRLNGrossAll - totalPartnerCommWon - totalPartnerCommPipeline;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="font-body text-sm theme-text-muted">Loading revenue data...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="font-display text-[22px] font-bold mb-1">Company Revenue</h2>
          <p className="font-body text-[13px] theme-text-muted">
            TRLN receives {Math.round(TRLN_FEE_RATE * 100)}% of firm fees. Partner field receives {Math.round(PARTNER_RATE * 100)}%. Net to TRLN: {Math.round(TRLN_NET_RATE * 100)}%.
          </p>
        </div>
      </div>

      {/* ═══ REVENUE SUMMARY ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <div className="font-body text-[9px] tracking-[1.5px] uppercase theme-text-muted mb-2">TRLN Gross (40%)</div>
          <div className="font-display text-xl sm:text-2xl font-bold text-brand-gold">{fmt$(totalTRLNGrossWon)}</div>
          <div className="font-body text-[10px] theme-text-muted mt-1">From {closedWonDeals.length} closed won deals</div>
        </div>
        <div className="stat-card">
          <div className="font-body text-[9px] tracking-[1.5px] uppercase theme-text-muted mb-2">Partner Commissions (25%)</div>
          <div className="font-display text-xl sm:text-2xl font-bold text-red-400">-{fmt$(totalPartnerCommWon)}</div>
          <div className="font-body text-[10px] theme-text-muted mt-1">
            <span className="text-green-400">{fmt$(commPaid)} paid</span> · <span className="text-yellow-400">{fmt$(commPending)} pending</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="font-body text-[9px] tracking-[1.5px] uppercase theme-text-muted mb-2">TRLN Net Revenue (15%)</div>
          <div className="font-display text-xl sm:text-2xl font-bold text-green-400">{fmt$(totalTRLNNetWon)}</div>
          <div className="font-body text-[10px] theme-text-muted mt-1">After partner commissions</div>
        </div>
        <div className="stat-card">
          <div className="font-body text-[9px] tracking-[1.5px] uppercase theme-text-muted mb-2">Pipeline (Projected)</div>
          <div className="font-display text-xl sm:text-2xl font-bold text-blue-400">{fmt$(totalTRLNNetPipeline)}</div>
          <div className="font-body text-[10px] theme-text-muted mt-1">{pipelineDeals.length} active deals</div>
        </div>
      </div>

      {/* ═══ BREAKDOWN CARD ═══ */}
      <div className="card p-5 sm:p-6 mb-6">
        <div className="font-body font-semibold text-sm mb-4">Revenue Breakdown</div>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <span className="font-body text-[13px] theme-text-secondary">Total Firm Fees (Closed Won)</span>
            <span className="font-display text-[15px] font-bold">{fmt$(totalFirmFeesWon)}</span>
          </div>
          <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <span className="font-body text-[13px] text-brand-gold">TRLN Share (40%)</span>
            <span className="font-display text-[15px] font-bold text-brand-gold">{fmt$(totalTRLNGrossWon)}</span>
          </div>
          <div className="flex items-center justify-between py-2 pl-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <span className="font-body text-[12px] text-green-400">Partner Commissions Paid</span>
            <span className="font-body text-[13px] text-green-400">-{fmt$(commPaid)}</span>
          </div>
          <div className="flex items-center justify-between py-2 pl-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <span className="font-body text-[12px] text-yellow-400">Partner Commissions Pending</span>
            <span className="font-body text-[13px] text-yellow-400">-{fmt$(commPending)}</span>
          </div>
          <div className="flex items-center justify-between py-3 rounded-lg px-3 bg-green-500/5 border border-green-500/15">
            <span className="font-body text-[14px] font-semibold text-green-400">TRLN Net Revenue</span>
            <span className="font-display text-lg font-bold text-green-400">{fmt$(totalTRLNNetWon)}</span>
          </div>
        </div>
      </div>

      {/* ═══ DEAL-BY-DEAL TABLE ═══ */}
      <div className="card">
        <div className="px-5 py-4 flex items-center justify-between flex-wrap gap-3" style={{ borderBottom: "1px solid var(--app-border)" }}>
          <div className="font-body font-semibold text-sm">Deal Revenue Detail</div>
          <div className="flex gap-2">
            {(["all", "closedwon", "pipeline"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`font-body text-[11px] px-3 py-1.5 rounded-lg border transition-colors ${
                  filter === f ? "bg-brand-gold/10 border-brand-gold/30 text-brand-gold" : "border-[var(--app-border)] theme-text-muted"
                }`}
              >
                {f === "all" ? "All Deals" : f === "closedwon" ? "Closed Won" : "Pipeline"}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <div className="grid grid-cols-[1.5fr_0.7fr_0.8fr_0.8fr_0.7fr_0.7fr_0.7fr] gap-3 px-5 py-3 min-w-[700px]" style={{ borderBottom: "1px solid var(--app-border)" }}>
            {["Deal", "Stage", "Firm Fee", "TRLN (40%)", "Partner (25%)", "TRLN Net", "Date"].map((h) => (
              <div key={h} className="font-body text-[10px] tracking-[1px] uppercase theme-text-muted">{h}</div>
            ))}
          </div>
          {filtered.map((d) => {
            const firmFee = d.firmFeeAmount || d.estimatedRefundAmount * (d.firmFeeRate || 0.20);
            const trlnGross = firmFee * TRLN_FEE_RATE;
            const partnerComm = d.l1CommissionAmount + d.l2CommissionAmount;
            const trlnNet = trlnGross - partnerComm;
            return (
              <div key={d.id} className="grid grid-cols-[1.5fr_0.7fr_0.8fr_0.8fr_0.7fr_0.7fr_0.7fr] gap-3 px-5 py-3 items-center min-w-[700px] hover:bg-[var(--app-hover)] transition-colors" style={{ borderBottom: "1px solid var(--app-border)" }}>
                <div>
                  <div className="font-body text-[13px] font-medium truncate">{d.dealName}</div>
                  <div className="font-mono text-[10px] theme-text-muted">{d.partnerCode}</div>
                </div>
                <div>
                  <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase ${stageBadge[d.stage] || stageBadge.new_lead}`}>
                    {d.stage.replace("_", " ")}
                  </span>
                </div>
                <div className="font-body text-[13px] theme-text-secondary">{fmt$(firmFee)}</div>
                <div className="font-body text-[13px] text-brand-gold font-semibold">{fmt$(trlnGross)}</div>
                <div className="font-body text-[13px] text-red-400">-{fmt$(partnerComm)}</div>
                <div className="font-display text-[13px] font-semibold text-green-400">{fmt$(trlnNet)}</div>
                <div className="font-body text-[11px] theme-text-muted">{d.closeDate ? fmtDate(d.closeDate) : fmtDate(d.createdAt)}</div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-5 py-10 text-center font-body text-[13px] theme-text-muted">No deals found.</div>
          )}
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden">
          {filtered.map((d) => {
            const firmFee = d.firmFeeAmount || d.estimatedRefundAmount * (d.firmFeeRate || 0.20);
            const trlnGross = firmFee * TRLN_FEE_RATE;
            const partnerComm = d.l1CommissionAmount + d.l2CommissionAmount;
            const trlnNet = trlnGross - partnerComm;
            return (
              <div key={d.id} className="p-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="font-body text-[13px] font-medium">{d.dealName}</div>
                  <span className={`shrink-0 inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase ${stageBadge[d.stage] || stageBadge.new_lead}`}>
                    {d.stage.replace("_", " ")}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="font-body text-[9px] theme-text-muted uppercase">TRLN 40%</div>
                    <div className="font-body text-[13px] text-brand-gold font-semibold">{fmt$(trlnGross)}</div>
                  </div>
                  <div>
                    <div className="font-body text-[9px] theme-text-muted uppercase">Partner</div>
                    <div className="font-body text-[13px] text-red-400">-{fmt$(partnerComm)}</div>
                  </div>
                  <div>
                    <div className="font-body text-[9px] theme-text-muted uppercase">Net</div>
                    <div className="font-display text-[13px] font-semibold text-green-400">{fmt$(trlnNet)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Totals row */}
        {filtered.length > 0 && (
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderTop: "2px solid var(--app-border)" }}>
            <div className="font-body text-[12px] font-semibold theme-text-secondary">{filtered.length} deals</div>
            <div className="flex gap-6 text-right">
              <div>
                <div className="font-body text-[9px] theme-text-muted uppercase">TRLN Gross</div>
                <div className="font-body text-[13px] text-brand-gold font-semibold">
                  {fmt$(filtered.reduce((sum, d) => sum + (d.firmFeeAmount || d.estimatedRefundAmount * (d.firmFeeRate || 0.20)) * TRLN_FEE_RATE, 0))}
                </div>
              </div>
              <div>
                <div className="font-body text-[9px] theme-text-muted uppercase">Net Revenue</div>
                <div className="font-display text-[13px] font-bold text-green-400">
                  {fmt$(filtered.reduce((sum, d) => {
                    const ff = d.firmFeeAmount || d.estimatedRefundAmount * (d.firmFeeRate || 0.20);
                    return sum + ff * TRLN_FEE_RATE - d.l1CommissionAmount - d.l2CommissionAmount;
                  }, 0))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
