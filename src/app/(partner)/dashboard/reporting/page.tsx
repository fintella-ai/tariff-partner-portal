"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useDevice } from "@/lib/useDevice";
import StageBadge from "@/components/ui/StageBadge";
import StatusBadge from "@/components/ui/StatusBadge";
import { fmt$, fmtDate, fmtDateTime } from "@/lib/format";
import { FIRM_SHORT, DEFAULT_FIRM_FEE_RATE } from "@/lib/constants";
import DownlineTree, { type TreePartner } from "@/components/ui/DownlineTree";
import SortHeader, { type SortDir } from "@/components/ui/SortHeader";
import { compareRows } from "@/lib/sortRows";
import DocumentsView from "@/components/partner/DocumentsView";

type PageTab = "overview" | "deals" | "downline" | "commissions" | "documents";

export default function PartnerReportingPage() {
  const { data: session } = useSession();
  const device = useDevice();
  const router = useRouter();
  const user = session?.user as any;

  const [directDeals, setDirectDeals] = useState<any[]>([]);
  const [downlineDeals, setDownlineDeals] = useState<any[]>([]);
  const [downlinePartners, setDownlinePartners] = useState<any[]>([]);
  const [l3Partners, setL3Partners] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [commissionRate, setCommissionRate] = useState(0.25);
  const [tier, setTier] = useState("l1");
  const [payoutDownlineEnabled, setPayoutDownlineEnabled] = useState(false);
  const [topL1PayoutDownlineEnabled, setTopL1PayoutDownlineEnabled] = useState<boolean | null>(null);
  const [commDownlineDeals, setCommDownlineDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Enterprise Partner data — null for non-EP partners (hides the entire
  // EP summary card + Enterprise sub-tab).
  const [epData, setEpData] = useState<null | {
    overrideRate: number;
    applyToAll: boolean;
    coveredPartners: Array<{ partnerCode: string; name: string; dealCount: number }>;
    coveredCount: number | null;
    totalOverrideEarnings: number;
    totalDeals: number;
    deals: Array<{
      id: string;
      dealName: string;
      createdAt: string;
      l1PartnerCode: string;
      l1PartnerName: string;
      stage: string;
      estimatedRefundAmount: number;
      firmFeeRate: number | null;
      firmFeeAmount: number;
      overrideAmount: number;
      status: string;
    }>;
  }>(null);

  const [pageTab, setPageTab] = useState<PageTab>("overview");
  const [dealsSubTab, setDealsSubTab] = useState<"direct" | "downline">("direct");
  const [downlineSubTab, setDownlineSubTab] = useState<"partners" | "deals">("partners");
  const [partnerView, setPartnerView] = useState<"list" | "tree">("list");
  const [commSubTab, setCommSubTab] = useState<"all" | "direct" | "downline" | "enterprise">("all");

  const [expandedDealId, setExpandedDealId] = useState<string | null>(null);

  // Filters (overview tab)
  const [sourceFilter, setSourceFilter] = useState<"all" | "direct" | "downline">("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // ── Sort state (one pair per table) ──
  const [overviewSort, setOverviewSort] = useState<string>("createdAt");
  const [overviewDir, setOverviewDir] = useState<SortDir>("desc");
  const [myDealsSort, setMyDealsSort] = useState<string>("createdAt");
  const [myDealsDir, setMyDealsDir] = useState<SortDir>("desc");
  const [downlinePartnersSort, setDownlinePartnersSort] = useState<string>("firstName");
  const [downlinePartnersDir, setDownlinePartnersDir] = useState<SortDir>("asc");
  const [downlineDealsSort, setDownlineDealsSort] = useState<string>("createdAt");
  const [downlineDealsDir, setDownlineDealsDir] = useState<SortDir>("desc");
  const [commSort, setCommSort] = useState<string>("createdAt");
  const [commDir, setCommDir] = useState<SortDir>("desc");

  const cycleSort = (
    key: string,
    current: string,
    dir: SortDir,
    setKey: (k: string) => void,
    setDir: (d: SortDir) => void
  ) => {
    if (current === key) setDir(dir === "asc" ? "desc" : "asc");
    else { setKey(key); setDir("asc"); }
  };

  const loadData = useCallback(async () => {
    try {
      const [dealsRes, commRes, epRes] = await Promise.all([
        fetch("/api/deals"),
        fetch("/api/commissions"),
        fetch("/api/partner/enterprise"),
      ]);
      if (dealsRes.ok) {
        const data = await dealsRes.json();
        setDirectDeals(data.directDeals || []);
        setDownlineDeals(data.downlineDeals || []);
        setDownlinePartners(data.downlinePartners || []);
        setL3Partners(data.l3Partners || []);
      }
      if (commRes.ok) {
        const data = await commRes.json();
        if (data.tier) setTier(data.tier);
        if (typeof data.commissionRate === "number") setCommissionRate(data.commissionRate);
        if (data.ledger) setLedger(data.ledger);
        if (typeof data.payoutDownlineEnabled === "boolean") setPayoutDownlineEnabled(data.payoutDownlineEnabled);
        if (data.topL1PayoutDownlineEnabled !== undefined) setTopL1PayoutDownlineEnabled(data.topL1PayoutDownlineEnabled);
        if (Array.isArray(data.downlineDeals)) setCommDownlineDeals(data.downlineDeals);
      }
      if (epRes.ok) {
        const data = await epRes.json();
        setEpData(data.isEnterprise ? data : null);
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

  // Combined deals
  const allDeals = useMemo(() => [
    ...directDeals.map((d) => ({ ...d, source: "direct" as const })),
    ...downlineDeals.map((d) => ({ ...d, source: "downline" as const })),
  ], [directDeals, downlineDeals]);

  const stages = useMemo(() => Array.from(new Set(allDeals.map((d) => d.stage))).sort(), [allDeals]);

  // Filtered deals (overview)
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

  const overviewAccessors = useMemo(() => ({
    commission: (d: any) => (d.source === "direct" ? d.l1CommissionAmount : (d.l2CommissionAmount || 0)),
    status: (d: any) => (d.source === "direct" ? d.l1CommissionStatus : (d.l2CommissionStatus || "pending")),
    createdAt: (d: any) => d.createdAt,
  }), []);

  const sortedFiltered = useMemo(
    () => [...filtered].sort((a, b) => compareRows(a, b, overviewSort, overviewDir, overviewAccessors)),
    [filtered, overviewSort, overviewDir, overviewAccessors]
  );

  const myDealsAccessors = useMemo(() => ({
    status: (d: any) => d.l1CommissionStatus,
    commission: (d: any) => d.l1CommissionAmount,
    createdAt: (d: any) => d.createdAt,
  }), []);

  const sortedDirectDeals = useMemo(
    () => [...directDeals].sort((a, b) => compareRows(a, b, myDealsSort, myDealsDir, myDealsAccessors)),
    [directDeals, myDealsSort, myDealsDir, myDealsAccessors]
  );

  const downlinePartnersAccessors = useMemo(() => ({
    firstName: (p: any) => `${p.firstName || ""} ${p.lastName || ""}`.trim(),
    override: (p: any) => Math.max(0, commissionRate - (p.commissionRate || 0)),
  }), [commissionRate]);

  const sortedDownlinePartners = useMemo(
    () => [...downlinePartners].sort((a, b) => compareRows(a, b, downlinePartnersSort, downlinePartnersDir, downlinePartnersAccessors)),
    [downlinePartners, downlinePartnersSort, downlinePartnersDir, downlinePartnersAccessors]
  );

  const downlineDealsAccessors = useMemo(() => ({
    submittingPartner: (d: any) => d.submittingPartnerName || partnerNameMap[d.partnerCode || ""] || d.partnerCode || "",
    commission: (d: any) => d.l2CommissionAmount || 0,
    status: (d: any) => d.l2CommissionStatus || "pending",
    createdAt: (d: any) => d.createdAt,
  }), [partnerNameMap]);

  const sortedDownlineDeals = useMemo(
    () => [...downlineDeals].sort((a, b) => compareRows(a, b, downlineDealsSort, downlineDealsDir, downlineDealsAccessors)),
    [downlineDeals, downlineDealsSort, downlineDealsDir, downlineDealsAccessors]
  );

  // Metrics
  const totalL1 = directDeals.reduce((s, d) => s + Number(d.l1CommissionAmount || 0), 0);
  const totalL2 = downlineDeals.reduce((s, d) => s + Number(d.l2CommissionAmount || 0), 0);
  const totalRefund = allDeals.reduce((s, d) => s + Number(d.estimatedRefundAmount || 0), 0);
  const l1Paid = directDeals.filter((d) => d.l1CommissionStatus === "paid").reduce((s, d) => s + Number(d.l1CommissionAmount || 0), 0);
  const l1Pending = totalL1 - l1Paid;
  const l2Paid = downlineDeals.filter((d) => d.l2CommissionStatus === "paid").reduce((s, d) => s + Number(d.l2CommissionAmount || 0), 0);
  const l2Pending = totalL2 - l2Paid;
  const closedWon = allDeals.filter((d) => d.stage === "closedwon" || d.stage === "closed_won").length;
  const closedLost = allDeals.filter((d) => d.stage === "closedlost" || d.stage === "closed_lost").length;

  const inputClass = "font-body text-[12px] bg-[var(--app-input-bg)] border border-[var(--app-input-border)] text-[var(--app-input-text)] rounded-lg px-3 py-2 min-h-[40px]";

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-5">
        <div className="spinner" />
        <div className="font-body text-sm text-[var(--app-text-secondary)]">Loading reports...</div>
      </div>
    );
  }

  return (
    <div>
      <h2 className={`font-display ${device.isMobile ? "text-lg" : "text-[22px]"} font-bold mb-1.5`}>Reporting</h2>
      <p className="font-body text-[13px] text-[var(--app-text-muted)] mb-4">
        Deals, downline, commissions, and metrics in one place.
      </p>

      {/* ═══ PAGE TABS ═══ */}
      <div className="flex gap-1 mb-6 border-b border-[var(--app-border)] overflow-x-auto">
        {([
          { id: "overview" as const, label: "Overview" },
          { id: "deals" as const, label: "My Deals" },
          { id: "downline" as const, label: "Downline" },
          { id: "commissions" as const, label: "Commissions" },
          { id: "documents" as const, label: "Documents" },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setPageTab(t.id)}
            className={`font-body text-[13px] px-4 py-2.5 whitespace-nowrap transition-colors border-b-2 -mb-px ${
              pageTab === t.id
                ? "text-brand-gold border-brand-gold"
                : "text-[var(--app-text-muted)] border-transparent hover:text-[var(--app-text-secondary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════ OVERVIEW TAB ═══════════════ */}
      {pageTab === "overview" && (
        <>
          {/* Metric cards */}
          <div className={`grid ${device.isMobile ? "grid-cols-2" : "grid-cols-4"} ${device.gap} mb-6`}>
            {[
              { label: "Total Deals", value: String(allDeals.length), sub: `${directDeals.length} direct · ${downlineDeals.length} downline` },
              { label: "Refund Pipeline", value: fmt$(totalRefund), sub: `${allDeals.length - closedWon - closedLost} in pipeline` },
              { label: "Total Commission", value: fmt$(totalL1 + totalL2), sub: `L1: ${fmt$(totalL1)} · L2: ${fmt$(totalL2)}` },
              { label: "Closed Won", value: String(closedWon), sub: `${closedLost} lost` },
            ].map((s) => (
              <div key={s.label} className="stat-card">
                <div className="font-body text-[9px] tracking-[1.5px] uppercase text-[var(--app-text-muted)] mb-2">{s.label}</div>
                <div className="font-display text-[22px] sm:text-[28px] font-bold text-brand-gold mb-0.5">{s.value}</div>
                <div className="font-body text-[11px] text-[var(--app-text-muted)]">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Payout status */}
          <div className={`grid grid-cols-3 ${device.gap} mb-6`}>
            <div className="p-4 border border-green-500/20 rounded-xl bg-green-500/[0.04] text-center">
              <div className="font-body text-[9px] tracking-[1.5px] uppercase text-green-400/70 mb-1">Paid</div>
              <div className="font-display text-xl sm:text-2xl font-bold text-green-400">{fmt$(l1Paid + l2Paid)}</div>
            </div>
            <div className="p-4 border border-yellow-500/20 rounded-xl bg-yellow-500/[0.04] text-center">
              <div className="font-body text-[9px] tracking-[1.5px] uppercase text-yellow-400/70 mb-1">Pending</div>
              <div className="font-display text-xl sm:text-2xl font-bold text-yellow-400">{fmt$(l1Pending + l2Pending)}</div>
            </div>
            <div className="p-4 border border-blue-500/20 rounded-xl bg-blue-500/[0.04] text-center">
              <div className="font-body text-[9px] tracking-[1.5px] uppercase text-blue-400/70 mb-1">Team Size</div>
              <div className="font-display text-xl sm:text-2xl font-bold text-blue-400">{downlinePartners.length}</div>
            </div>
          </div>

          {/* Filters */}
          <div className="card mb-6">
            <div className="px-4 sm:px-6 py-4">
              <div className="font-body font-semibold text-sm mb-3">Filters</div>
              <div className={`grid ${device.isMobile ? "grid-cols-1 gap-3" : "grid-cols-4 gap-3"}`}>
                <input type="text" placeholder="Search deals, clients, partners..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className={inputClass} />
                <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as any)} className={inputClass}>
                  <option value="all">All Sources</option>
                  <option value="direct">Direct Only</option>
                  <option value="downline">Downline Only</option>
                </select>
                <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className={inputClass}>
                  <option value="all">All Stages</option>
                  {stages.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</option>)}
                </select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputClass}>
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="due">Due</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
            </div>
          </div>

          {/* Filtered deals table */}
          <div className="card">
            <div className="px-4 sm:px-6 py-4 border-b border-[var(--app-border)]">
              <div className="font-body font-semibold text-sm">Showing {filtered.length} of {allDeals.length} deals</div>
            </div>
            {filtered.length === 0 ? (
              <div className="p-12 text-center font-body text-sm text-[var(--app-text-muted)]">No deals match your filters.</div>
            ) : device.isMobile ? (
              <div>
                {filtered.map((deal, idx) => {
                  const commAmt = deal.source === "direct" ? deal.l1CommissionAmount : (deal.l2CommissionAmount || 0);
                  const commStatus = deal.source === "direct" ? deal.l1CommissionStatus : (deal.l2CommissionStatus || "pending");
                  return (
                    <div key={deal.id + deal.source} className={`px-4 py-3.5 border-b border-[var(--app-border)] last:border-b-0 ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="font-body text-[13px] font-medium text-[var(--app-text)] truncate flex-1">{deal.dealName}</div>
                        <StageBadge stage={deal.stage} />
                      </div>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-body text-[10px] font-semibold rounded px-1.5 py-0.5 ${deal.source === "direct" ? "text-brand-gold bg-brand-gold/10 border border-brand-gold/20" : "text-purple-400 bg-purple-500/10 border border-purple-500/20"}`}>{deal.source === "direct" ? "L1 Direct" : "L2 Downline"}</span>
                        <div className="font-body text-[11px] text-[var(--app-text-muted)]">{fmtDate(deal.createdAt)}</div>
                      </div>
                      <div className="flex items-center justify-between">
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
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--app-border)]">
                      {(() => {
                        const on = (k: string) => cycleSort(k, overviewSort, overviewDir, setOverviewSort, setOverviewDir);
                        const H = (props: { label: string; k: string; className?: string; sortable?: boolean }) => (

                          <th className={props.className || "px-3 py-3 text-center"}>

                            <span className="font-body text-[10px] tracking-[1px] uppercase theme-text-muted">{props.label}</span>

                          </th>

                        );
                        return (<>
                          <H label="Deal" k="dealName" className="px-4 sm:px-6 py-3 text-left" />
                          <H label="Partner" k="source" />
                          <H label="Stage" k="stage" />
                          <H label="Refund" k="estimatedRefundAmount" />
                          <H label="Fee %" k="firmFeeRate" />
                          <H label="Firm Fee" k="firmFeeAmount" sortable={false} />
                          <H label="Comm %" k="commRate" sortable={false} />
                          <H label="Commission" k="commission" />
                          <H label="Date" k="createdAt" />
                        </>);
                      })()}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFiltered.map((deal, idx) => {
                      const commAmt = deal.source === "direct" ? deal.l1CommissionAmount : (deal.l2CommissionAmount || 0);
                      const commStatus = deal.source === "direct" ? deal.l1CommissionStatus : (deal.l2CommissionStatus || "pending");
                      const partnerName = deal.source === "downline" ? (deal.submittingPartnerName || partnerNameMap[deal.partnerCode || ""] || deal.partnerCode) : null;
                      const feeRate = deal.firmFeeRate ? `${Math.round(deal.firmFeeRate * 100)}%` : "—";
                      const firmFeeAmt = deal.firmFeeAmount || (deal.estimatedRefundAmount * (deal.firmFeeRate || 0));
                      const commRate = deal.source === "direct" ? (commissionRate ? `${Math.round(commissionRate * 100)}%` : "—") : "—";
                      return (<React.Fragment key={deal.id + deal.source}>
                        <tr onClick={() => setExpandedDealId(expandedDealId === deal.id ? null : deal.id)} className={`border-b border-[var(--app-border)] last:border-b-0 hover:bg-[var(--app-card-bg)] transition-colors cursor-pointer ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}>
                          <td className="px-4 sm:px-6 py-3.5">
                            <div className="font-body text-[13px] text-[var(--app-text)] truncate">{deal.dealName}</div>
                            {partnerName && <div className="font-body text-[11px] text-[var(--app-text-muted)] truncate">via {partnerName}</div>}
                          </td>
                          <td className="px-3 py-3.5 text-center">
                            {deal.source === "downline" && partnerName ? (
                              <div className="font-body text-[12px] text-[var(--app-text-secondary)] truncate">{partnerName}</div>
                            ) : (
                              <span className="font-body text-[10px] font-semibold rounded px-1.5 py-0.5 text-brand-gold bg-brand-gold/10 border border-brand-gold/20">You</span>
                            )}
                          </td>
                          <td className="px-3 py-3.5 text-center"><StageBadge stage={deal.stage} /></td>
                          <td className="px-3 py-3.5 text-center font-body text-[13px] text-[var(--app-text)]">{fmt$(deal.estimatedRefundAmount)}</td>
                          <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-muted)]">{feeRate}</td>
                          <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-muted)]">{fmt$(firmFeeAmt)}</td>
                          <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-muted)]">{commRate}</td>
                          <td className="px-3 py-3.5 text-center font-display text-[14px] font-semibold text-brand-gold">{fmt$(commAmt)}</td>
                          <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-muted)]">{fmtDate(deal.createdAt)}</td>
                        </tr>
                        {expandedDealId === deal.id && (
                          <tr><td colSpan={9} className="p-0"><DealDetailPanel deal={deal} /></td></tr>
                        )}
                        </React.Fragment>);
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════ MY DEALS TAB ═══════════════ */}
      {pageTab === "deals" && (
        <>
          <div className="card">
            {(() => {
              const deals = sortedDirectDeals;
              const isDownline = false;
              if (deals.length === 0) return <div className="p-12 text-center font-body text-sm text-[var(--app-text-muted)]">{isDownline ? "No downline deals yet." : "No direct deals yet."}</div>;
              return device.isMobile ? (
                <div>
                  {deals.map((deal, idx) => {
                    const commAmt = isDownline ? (deal.l2CommissionAmount || 0) : deal.l1CommissionAmount;
                    const commStatus = isDownline ? (deal.l2CommissionStatus || "pending") : deal.l1CommissionStatus;
                    return (
                      <div key={deal.id} className={`px-4 py-3.5 border-b border-[var(--app-border)] last:border-b-0 ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="font-body text-[13px] font-medium text-[var(--app-text)] truncate flex-1">{deal.dealName}</div>
                          <StageBadge stage={deal.stage} />
                        </div>
                        <div className="font-body text-[11px] text-[var(--app-text-muted)] mb-2">{isDownline ? `Via ${deal.submittingPartnerName || partnerNameMap[deal.partnerCode] || deal.partnerCode} · ` : ""}{fmtDate(deal.createdAt)}</div>
                        <div className="flex items-center justify-between">
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
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[var(--app-border)]">
                        {(() => {
                          const on = (k: string) => cycleSort(k, myDealsSort, myDealsDir, setMyDealsSort, setMyDealsDir);
                          const H = (props: { label: string; k: string; className?: string; sortable?: boolean }) => (

                            <th className={props.className || "px-3 py-3 text-center"}>

                              <span className="font-body text-[10px] tracking-[1px] uppercase theme-text-muted">{props.label}</span>

                            </th>

                          );
                          return (<>
                            <H label="Deal" k="dealName" className="px-4 sm:px-6 py-3 text-left" />
                            <H label="Stage" k="stage" />
                            <H label="Refund" k="estimatedRefundAmount" />
                            <H label="Fee %" k="firmFeeRate" />
                            <H label="Firm Fee" k="firmFeeAmount" sortable={false} />
                            <H label="Comm %" k="commRate" sortable={false} />
                            <H label="Commission" k="commission" />
                            <H label="Date" k="createdAt" />
                          </>);
                        })()}
                      </tr>
                    </thead>
                    <tbody>
                      {deals.map((deal, idx) => {
                        const commAmt = isDownline ? (deal.l2CommissionAmount || 0) : deal.l1CommissionAmount;
                        const partner = isDownline ? (deal.submittingPartnerName || partnerNameMap[deal.partnerCode] || deal.partnerCode) : null;
                        const feeRate = deal.firmFeeRate ? `${Math.round(deal.firmFeeRate * 100)}%` : "—";
                        const firmFeeAmt = deal.firmFeeAmount || (deal.estimatedRefundAmount * (deal.firmFeeRate || 0));
                        const dealCommRate = commissionRate ? `${Math.round(commissionRate * 100)}%` : "—";
                        return (<React.Fragment key={deal.id}>
                          <tr onClick={() => setExpandedDealId(expandedDealId === deal.id ? null : deal.id)} className={`border-b border-[var(--app-border)] last:border-b-0 hover:bg-[var(--app-card-bg)] transition-colors cursor-pointer ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}>
                            <td className="px-4 sm:px-6 py-3.5">
                              <div className="font-body text-[13px] text-[var(--app-text)] truncate">{deal.dealName}</div>
                              {partner && <div className="font-body text-[11px] text-[var(--app-text-muted)] truncate">via {partner}</div>}
                            </td>
                            <td className="px-3 py-3.5 text-center"><StageBadge stage={deal.stage} /></td>
                            <td className="px-3 py-3.5 text-center font-body text-[13px] text-[var(--app-text)]">{fmt$(deal.estimatedRefundAmount)}</td>
                            <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-muted)]">{feeRate}</td>
                            <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-muted)]">{fmt$(firmFeeAmt)}</td>
                            <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-muted)]">{dealCommRate}</td>
                            <td className="px-3 py-3.5 text-center font-display text-[14px] font-semibold text-brand-gold">{fmt$(commAmt)}</td>
                            <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-muted)]">{fmtDate(deal.createdAt)}</td>
                          </tr>
                          {expandedDealId === deal.id && (
                            <tr><td colSpan={8} className="p-0"><DealDetailPanel deal={deal} /></td></tr>
                          )}
                        </React.Fragment>);
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </>
      )}

      {/* ═══════════════ DOWNLINE TAB ═══════════════ */}
      {pageTab === "downline" && (
        <>
          <div className="flex gap-1 mb-4 border-b border-[var(--app-border)]">
            {([{ id: "partners" as const, label: "Your Partners" }, { id: "deals" as const, label: "Downline Deals" }]).map((t) => (
              <button key={t.id} onClick={() => setDownlineSubTab(t.id)} className={`font-body text-[13px] px-4 py-2.5 whitespace-nowrap transition-colors border-b-2 -mb-px ${downlineSubTab === t.id ? "text-brand-gold border-brand-gold" : "text-[var(--app-text-muted)] border-transparent hover:text-[var(--app-text-secondary)]"}`}>{t.label}</button>
            ))}
          </div>
          <div className="card">
            {downlineSubTab === "partners" ? (
              downlinePartners.length === 0 ? (
                <div className="p-12 text-center font-body text-sm text-[var(--app-text-muted)]">No downline partners yet. Share your recruitment link to build your team.</div>
              ) : (
                <>
                  {/* List / Tree toggle */}
                  <div className="px-4 sm:px-6 py-3 border-b border-[var(--app-border)] flex justify-end">
                    <div className="flex bg-[var(--app-input-bg)] rounded-lg p-0.5">
                      <button onClick={() => setPartnerView("list")} className={`font-body text-[11px] px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${partnerView === "list" ? "bg-brand-gold/15 text-brand-gold" : "text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"}`}>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
                        List
                      </button>
                      <button onClick={() => setPartnerView("tree")} className={`font-body text-[11px] px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${partnerView === "tree" ? "bg-brand-gold/15 text-brand-gold" : "text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"}`}>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v4m0 0a4 4 0 014 4h2a2 2 0 012 2v2M12 8a4 4 0 00-4 4H6a2 2 0 00-2 2v2m8-8v4m0 0a2 2 0 012 2v2m-2-4a2 2 0 00-2 2v2" /></svg>
                        Tree
                      </button>
                    </div>
                  </div>
                  {partnerView === "tree" ? (
                    (() => {
                      const rootPartner: TreePartner = {
                        id: "self",
                        partnerCode: user?.partnerCode || "YOU",
                        firstName: user?.name?.split(" ")[0] || "You",
                        lastName: user?.name?.split(" ").slice(1).join(" ") || "",
                        status: "active",
                        children: downlinePartners.map((p) => ({
                          id: p.id,
                          partnerCode: p.partnerCode,
                          firstName: p.firstName,
                          lastName: p.lastName,
                          status: p.status,
                          commissionRate: p.commissionRate,
                          children: l3Partners
                            .filter((l3) => l3.referredByPartnerCode === p.partnerCode)
                            .map((l3) => ({
                              id: l3.id,
                              partnerCode: l3.partnerCode,
                              firstName: l3.firstName,
                              lastName: l3.lastName,
                              status: l3.status,
                              commissionRate: (l3 as any).commissionRate,
                              children: [],
                            })),
                        })),
                      };
                      return <DownlineTree root={rootPartner} isMobile={device.isMobile} />;
                    })()
                  ) : device.isMobile ? (
                    downlinePartners.map((p, idx) => {
                      const theirRate = p.commissionRate || 0;
                      const override = commissionRate - theirRate;
                      return (
                      <div key={p.id} className={`px-4 py-3.5 border-b border-[var(--app-border)] last:border-b-0 ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <div className="font-body text-[13px] font-medium text-[var(--app-text)]">{p.firstName} {p.lastName}</div>
                            <div className="font-body text-[11px] text-[var(--app-text-muted)]">{p.partnerCode} · {p.companyName || "—"}</div>
                          </div>
                          <span className={`font-body text-[10px] font-semibold rounded-full px-2.5 py-0.5 ${p.status === "active" ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"}`}>{p.status}</span>
                        </div>
                        <div className="flex items-center gap-4 font-body text-[11px]">
                          <span className="text-purple-400">Their: {theirRate ? `${Math.round(theirRate * 100)}%` : "—"}</span>
                          <span className="text-brand-gold">Override: {override > 0 ? `${Math.round(override * 100)}%` : "—"}</span>
                          <span className="text-green-400">Total: {commissionRate ? `${Math.round(commissionRate * 100)}%` : "—"}</span>
                        </div>
                      </div>);
                    })
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-[var(--app-border)]">
                            {(() => {
                              const on = (k: string) => cycleSort(k, downlinePartnersSort, downlinePartnersDir, setDownlinePartnersSort, setDownlinePartnersDir);
                              const H = (props: { label: string; k: string; className?: string; sortable?: boolean }) => (

                                <th className={props.className || "px-3 py-3 text-center"}>

                                  <span className="font-body text-[10px] tracking-[1px] uppercase theme-text-muted">{props.label}</span>

                                </th>

                              );
                              return (<>
                                <H label="Partner" k="firstName" className="px-4 sm:px-6 py-3 text-left" />
                                <H label="Code" k="partnerCode" />
                                <H label="Company" k="companyName" />
                                <H label="Status" k="status" />
                                <H label="Their Rate" k="commissionRate" />
                                <H label="Your Override" k="override" />
                                <H label="Your Total" k="yourTotal" sortable={false} />
                              </>);
                            })()}
                          </tr>
                        </thead>
                        <tbody>
                          {sortedDownlinePartners.map((p, idx) => {
                            const theirRate = p.commissionRate || 0;
                            const override = commissionRate - theirRate;
                            return (
                            <tr key={p.id} className={`border-b border-[var(--app-border)] last:border-b-0 hover:bg-[var(--app-card-bg)] transition-colors ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}>
                              <td className="px-4 sm:px-6 py-3.5 font-body text-[13px] font-medium text-[var(--app-text)]">{p.firstName} {p.lastName}</td>
                              <td className="px-3 py-3.5 text-center font-mono text-[12px] text-[var(--app-text-muted)]">{p.partnerCode}</td>
                              <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-secondary)]">{p.companyName || "—"}</td>
                              <td className="px-3 py-3.5 text-center">
                                <span className={`font-body text-[10px] font-semibold rounded-full px-2.5 py-0.5 ${p.status === "active" ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"}`}>{p.status}</span>
                              </td>
                              <td className="px-3 py-3.5 text-center font-body text-[12px] text-purple-400 font-semibold">{theirRate ? `${Math.round(theirRate * 100)}%` : "—"}</td>
                              <td className="px-3 py-3.5 text-center font-body text-[12px] text-brand-gold font-semibold">{override > 0 ? `${Math.round(override * 100)}%` : "—"}</td>
                              <td className="px-3 py-3.5 text-center font-body text-[12px] text-green-400 font-semibold">{commissionRate ? `${Math.round(commissionRate * 100)}%` : "—"}</td>
                            </tr>);
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )
            ) : (
              downlineDeals.length === 0 ? (
                <div className="p-12 text-center font-body text-sm text-[var(--app-text-muted)]">No downline deals yet.</div>
              ) : device.isMobile ? (
                downlineDeals.map((deal, idx) => (
                  <div key={deal.id} className={`px-4 py-3.5 border-b border-[var(--app-border)] last:border-b-0 ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="font-body text-[13px] font-medium text-[var(--app-text)] truncate flex-1">{deal.dealName}</div>
                      <StageBadge stage={deal.stage} />
                    </div>
                    <div className="font-body text-[11px] text-[var(--app-text-muted)] mb-2">Via {deal.submittingPartnerName || partnerNameMap[deal.partnerCode] || deal.partnerCode} · {fmtDate(deal.createdAt)}</div>
                    <div className="flex items-center justify-between">
                      <div className="font-body text-[12px] text-[var(--app-text-muted)]">Refund: {fmt$(deal.estimatedRefundAmount)}</div>
                      <div className="flex items-center gap-2">
                        <div className="font-display text-sm font-semibold text-brand-gold">{fmt$(deal.l2CommissionAmount)}</div>
                        <StatusBadge status={deal.l2CommissionStatus} />
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[var(--app-border)]">
                        {(() => {
                          const on = (k: string) => cycleSort(k, downlineDealsSort, downlineDealsDir, setDownlineDealsSort, setDownlineDealsDir);
                          const H = (props: { label: string; k: string; className?: string; sortable?: boolean }) => (

                            <th className={props.className || "px-3 py-3 text-center"}>

                              <span className="font-body text-[10px] tracking-[1px] uppercase theme-text-muted">{props.label}</span>

                            </th>

                          );
                          return (<>
                            <H label="Deal" k="dealName" className="px-4 sm:px-6 py-3 text-left" />
                            <H label="Partner" k="submittingPartner" />
                            <H label="Stage" k="stage" />
                            <H label="Refund" k="estimatedRefundAmount" />
                            <H label="Fee %" k="firmFeeRate" />
                            <H label="Firm Fee" k="firmFeeAmount" sortable={false} />
                            <H label="Comm %" k="commRate" sortable={false} />
                            <H label="Commission" k="commission" />
                            <H label="Date" k="createdAt" />
                          </>);
                        })()}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedDownlineDeals.map((deal, idx) => {
                        const firmFeeAmt = deal.firmFeeAmount || (deal.estimatedRefundAmount * (deal.firmFeeRate || 0));
                        // Partner's own commission rate on their downline deal. We don't have
                        // the submitting partner's rate directly in this row, so derive from
                        // l2CommissionAmount / firmFeeAmount when both are populated; else em-dash.
                        const commRateNum = firmFeeAmt > 0 && deal.l2CommissionAmount ? (deal.l2CommissionAmount / firmFeeAmt) : null;
                        const commRate = commRateNum != null ? `${Math.round(commRateNum * 100)}%` : "—";
                        return (
                        <tr key={deal.id} className={`border-b border-[var(--app-border)] last:border-b-0 hover:bg-[var(--app-card-bg)] transition-colors ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}>
                          <td className="px-4 sm:px-6 py-3.5 font-body text-[13px] text-[var(--app-text)] truncate">{deal.dealName}</td>
                          <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-secondary)]">{deal.submittingPartnerName || partnerNameMap[deal.partnerCode] || deal.partnerCode}</td>
                          <td className="px-3 py-3.5 text-center"><StageBadge stage={deal.stage} /></td>
                          <td className="px-3 py-3.5 text-center font-body text-[13px] text-[var(--app-text)]">{fmt$(deal.estimatedRefundAmount)}</td>
                          <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-muted)]">{deal.firmFeeRate ? `${Math.round(deal.firmFeeRate * 100)}%` : "—"}</td>
                          <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-muted)]">{fmt$(firmFeeAmt)}</td>
                          <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-muted)]">{commRate}</td>
                          <td className="px-3 py-3.5 text-center font-display text-[14px] font-semibold text-brand-gold">{fmt$(deal.l2CommissionAmount)}</td>
                          <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-muted)]">{fmtDate(deal.createdAt)}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        </>
      )}

      {/* ═══════════════ COMMISSIONS TAB ═══════════════ */}
      {pageTab === "commissions" && (
        <>
          {/* Task 11: Enabled badge for L1s with payoutDownlineEnabled=true */}
          {tier === "l1" && payoutDownlineEnabled && (
            <div className="mb-4 rounded-lg border border-brand-gold/30 bg-brand-gold/5 px-4 py-3">
              <div className="flex items-start gap-2">
                <span className="text-brand-gold text-[14px] leading-none mt-0.5">★</span>
                <div>
                  <div className="font-body text-[12px] font-semibold text-[var(--app-text)]">
                    Payout Downline Partners: Enabled
                  </div>
                  <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5">
                    Fintella is paying your L2/L3 downline directly. You receive the override portion for downline deals.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* How it works */}
          <div className={`${device.cardPadding} ${device.borderRadius} border border-[var(--app-border)] bg-[var(--app-card-bg)] mb-6`}>
            <div className="font-body font-semibold text-sm mb-4">How Commissions Work</div>
            <div className={`grid ${device.isMobile ? "grid-cols-1" : "grid-cols-3"} gap-3`}>
              {[
                { label: "Client Refund", formula: "e.g. $100,000", color: "text-[var(--app-text-secondary)]" },
                { label: `${FIRM_SHORT} Fee (${(DEFAULT_FIRM_FEE_RATE * 100).toFixed(0)}%)`, formula: "= $20,000", color: "text-[var(--app-text-secondary)]" },
                { label: `Your Cut (${(commissionRate * 100).toFixed(0)}% of fee)`, formula: `= ${fmt$(100000 * DEFAULT_FIRM_FEE_RATE * commissionRate)}`, color: "text-brand-gold" },
              ].map((r) => (
                <div key={r.label} className="p-3 sm:p-4 border border-[var(--app-border)] rounded-lg text-center">
                  <div className="font-body text-[10px] text-[var(--app-text-muted)] mb-1.5 tracking-wider">{r.label}</div>
                  <div className={`font-display text-base sm:text-lg font-bold ${r.color}`}>{r.formula}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Commission summary. The grid adapts to the number of cards in
              play: Direct L1 is always shown; Downline appears once the
              partner has downline deals; Enterprise appears only when the
              current partner is an active EP. When all three are present
              we stretch to 3 columns on desktop so nothing squishes. */}
          {(() => {
            const cardCount = 1 + (downlineDeals.length > 0 ? 1 : 0) + (epData ? 1 : 0);
            const gridCols = device.isMobile
              ? "grid-cols-1"
              : cardCount >= 3 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-2";
            return (
              <div className={`grid ${gridCols} ${device.gap} mb-6`}>
                <div className={`${device.cardPadding} border border-brand-gold/20 ${device.borderRadius} bg-brand-gold/[0.03] text-center`}>
                  <div className="font-body text-[10px] tracking-[2px] uppercase text-brand-gold/80 mb-3">Direct (L1) — {(commissionRate * 100).toFixed(0)}% of fee</div>
                  <div className="font-display text-[28px] font-bold text-brand-gold mb-2">{fmt$(totalL1)}</div>
                  <div className="flex justify-center gap-4">
                    <span className="font-body text-sm font-semibold text-green-400">{fmt$(l1Paid)} <span className="font-normal text-green-400/70">Paid</span></span>
                    <span className="font-body text-sm font-semibold text-yellow-400">{fmt$(l1Pending)} <span className="font-normal text-yellow-400/70">Pending</span></span>
                  </div>
                </div>
                {downlineDeals.length > 0 && (
                  <div className={`${device.cardPadding} border border-purple-500/20 ${device.borderRadius} bg-purple-500/[0.03] text-center`}>
                    <div className="font-body text-[10px] tracking-[2px] uppercase text-purple-400/80 mb-3">Downline Override (L2)</div>
                    <div className="font-display text-[28px] font-bold text-purple-400 mb-2">{fmt$(totalL2)}</div>
                    <div className="flex justify-center gap-4">
                      <span className="font-body text-sm font-semibold text-green-400">{fmt$(l2Paid)} <span className="font-normal text-green-400/70">Paid</span></span>
                      <span className="font-body text-sm font-semibold text-yellow-400">{fmt$(l2Pending)} <span className="font-normal text-yellow-400/70">Pending</span></span>
                    </div>
                  </div>
                )}
                {epData && (
                  <div className={`${device.cardPadding} border border-purple-500/30 ${device.borderRadius} bg-purple-500/[0.05] text-center`}>
                    <div className="font-body text-[10px] tracking-[2px] uppercase text-purple-400/90 mb-3">
                      Enterprise Override — {Math.round(epData.overrideRate * 100)}%
                    </div>
                    <div className="font-display text-[28px] font-bold text-purple-400 mb-2">{fmt$(epData.totalOverrideEarnings)}</div>
                    <div className="font-body text-[12px] text-[var(--app-text-muted)]">
                      Coverage:{" "}
                      <span className="text-[var(--app-text-secondary)] font-medium">
                        {epData.applyToAll
                          ? "All Partners"
                          : epData.coveredCount === 1
                            ? "1 L1 partner"
                            : `${epData.coveredCount ?? 0} L1 partners`}
                      </span>
                      {" · "}
                      <span className="text-[var(--app-text-secondary)] font-medium">{epData.totalDeals} deal{epData.totalDeals === 1 ? "" : "s"}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Commission history */}
          <div className="card">
            <div className="px-4 sm:px-6 pt-4 sm:pt-5">
              <div className="font-body font-semibold text-sm">Commission History</div>
            </div>
            <div className="flex gap-1 px-4 sm:px-6 border-b border-[var(--app-border)]">
              {([
                { id: "all" as const, label: "All" },
                { id: "direct" as const, label: "Direct" },
                { id: "downline" as const, label: "Downline" },
                // Enterprise sub-tab only exists for active EPs. Hidden
                // entirely for everyone else so the tab strip doesn't leak
                // that this feature exists.
                ...(epData ? [{ id: "enterprise" as const, label: "Enterprise" }] : []),
              ]).map((t) => (
                <button key={t.id} onClick={() => setCommSubTab(t.id)} className={`font-body text-[13px] px-4 py-2.5 whitespace-nowrap transition-colors border-b-2 -mb-px ${commSubTab === t.id ? "text-brand-gold border-brand-gold" : "text-[var(--app-text-muted)] border-transparent hover:text-[var(--app-text-secondary)]"}`}>{t.label}</button>
              ))}
            </div>
            {(() => {
              // Enterprise sub-tab renders its own table sourced from the
              // EP API. The Commission column becomes "Enterprise
              // Commission" and amounts come from the override rate × firm
              // fee, not the partner's own waterfall.
              if (commSubTab === "enterprise" && epData) {
                if (epData.deals.length === 0) {
                  return <div className="p-12 text-center font-body text-sm text-[var(--app-text-muted)]">No enterprise override deals yet.</div>;
                }
                return device.isMobile ? (
                  <div>
                    {epData.deals.map((d) => (
                      <div key={d.id} className="px-4 py-3.5 border-b border-[var(--app-border)] last:border-b-0">
                        <div className="flex justify-between items-center mb-1">
                          <div className="font-body text-[13px] text-[var(--app-text)] truncate flex-1 mr-3 text-left">{d.dealName}</div>
                          <StatusBadge status={d.status} />
                        </div>
                        <div className="font-body text-[11px] text-[var(--app-text-muted)] text-left mb-2">covers {d.l1PartnerName}</div>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="font-body text-[10px] font-semibold rounded px-1.5 py-0.5 text-purple-400 bg-purple-500/10 border border-purple-500/20">EP</span>
                            <span className="font-body text-[11px] text-[var(--app-text-muted)]">{fmtDate(d.createdAt)}</span>
                          </div>
                          <div className="font-display text-sm font-semibold text-purple-400">{fmt$(d.overrideAmount)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[var(--app-border)]">
                          {(() => {
                            const H = (props: { label: string; className?: string; isLast?: boolean }) => (
                              <th className={`${props.className || "px-3 py-3 text-center"} ${props.isLast ? "" : "border-r border-[var(--app-border)]"}`}>
                                <span className="font-body text-[10px] tracking-[1px] uppercase theme-text-muted">{props.label}</span>
                              </th>
                            );
                            return (<>
                              <H label="Deal" className="px-4 sm:px-6 py-3 text-left" />
                              <H label="Date" />
                              <H label="L1 Partner" />
                              <H label="Refund" />
                              <H label="Fee %" />
                              <H label="Firm Fee" />
                              <H label="Override %" />
                              <H label="Enterprise Commission" />
                              <H label="Status" isLast />
                            </>);
                          })()}
                        </tr>
                      </thead>
                      <tbody>
                        {epData.deals.map((d, idx) => {
                          const feeRate = d.firmFeeRate ? `${Math.round(Number(d.firmFeeRate) * 100)}%` : "—";
                          const overridePct = `${Math.round(epData.overrideRate * 100)}%`;
                          return (
                            <tr key={d.id} className={`border-b border-[var(--app-border)] last:border-b-0 hover:bg-[var(--app-card-bg)] transition-colors ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}>
                              <td className="px-4 sm:px-6 py-3.5">
                                <div className="font-body text-[13px] text-[var(--app-text)] truncate text-left">{d.dealName}</div>
                              </td>
                              <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-muted)]">{fmtDate(d.createdAt)}</td>
                              <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-secondary)] truncate">{d.l1PartnerName}</td>
                              <td className="px-3 py-3.5 text-center font-body text-[13px] text-[var(--app-text)]">{fmt$(d.estimatedRefundAmount)}</td>
                              <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-muted)]">{feeRate}</td>
                              <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-muted)]">{fmt$(d.firmFeeAmount)}</td>
                              <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-muted)]">{overridePct}</td>
                              <td className="px-3 py-3.5 text-center font-display text-[14px] font-semibold text-purple-400">{fmt$(d.overrideAmount)}</td>
                              <td className="px-3 py-3.5 text-center"><StatusBadge status={d.status} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              }

              const showDirect = commSubTab === "all" || commSubTab === "direct";
              const showDownline = commSubTab === "all" || commSubTab === "downline";
              const hasDirect = showDirect && directDeals.length > 0;
              const hasDownline = showDownline && downlineDeals.length > 0;
              if (!hasDirect && !hasDownline) return <div className="p-12 text-center font-body text-sm text-[var(--app-text-muted)]">No commission entries for this filter.</div>;
              // `_amt` / `_status` always reflect what the viewing partner
              // (L1) earns on the deal — the full L1 rate on direct rows and
              // the L1 override (L1 rate − submitter rate) on downline rows.
              // `_tier` still signals the deal source (L1 direct vs L2
              // downline) via the colored badge.
              const commDeals = [
                ...(showDirect ? directDeals.map((d) => ({ ...d, _tier: "l1" as const, _amt: d.l1CommissionAmount, _status: d.l1CommissionStatus })) : []),
                ...(showDownline ? downlineDeals.map((d) => ({ ...d, _tier: "l2" as const, _amt: d.l1CommissionAmount, _status: d.l1CommissionStatus })) : []),
              ];
              const commAccessors: Record<string, (d: any) => unknown> = {
                dealName: (d) => d.dealName,
                createdAt: (d) => d.createdAt,
                tier: (d) => d._tier,
                status: (d) => d._status,
                commission: (d) => d._amt,
              };
              const sortedCommDeals = [...commDeals].sort((a, b) => compareRows(a, b, commSort, commDir, commAccessors));
              return device.isMobile ? (
                <div>
                  {commDeals.map((deal) => (
                    <div key={deal.id + deal._tier} className="px-4 py-3.5 border-b border-[var(--app-border)] last:border-b-0">
                      <div className="flex justify-between items-center mb-1">
                        <div className="font-body text-[13px] text-[var(--app-text)] truncate flex-1 mr-3">{deal.dealName}</div>
                        <StatusBadge status={deal._status} />
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className={`font-body text-[10px] font-semibold rounded px-1.5 py-0.5 ${deal._tier === "l1" ? "text-brand-gold bg-brand-gold/10 border border-brand-gold/20" : "text-purple-400 bg-purple-500/10 border border-purple-500/20"}`}>{deal._tier.toUpperCase()}</span>
                          <span className="font-body text-[11px] text-[var(--app-text-muted)]">{fmtDate(deal.createdAt)}</span>
                        </div>
                        <div className={`font-display text-sm font-semibold ${deal._tier === "l1" ? "text-brand-gold" : "text-purple-400"}`}>{fmt$(deal._amt)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[var(--app-border)]">
                        {(() => {
                          // Plain (non-sortable) header row. Vertical dividers
                          // live only in the header per design; body rows stay
                          // clean. Deal column is left-aligned; everything
                          // else is centered.
                          const H = (props: { label: string; className?: string; isLast?: boolean }) => (
                            <th className={`${props.className || "px-3 py-3 text-center"} ${props.isLast ? "" : "border-r border-[var(--app-border)]"}`}>
                              <span className="font-body text-[10px] tracking-[1px] uppercase theme-text-muted">{props.label}</span>
                            </th>
                          );
                          return (<>
                            <H label="Deal" className="px-4 sm:px-6 py-3 text-left" />
                            <H label="Date" />
                            <H label="Tier" />
                            <H label="Refund" />
                            <H label="Fee %" />
                            <H label="Firm Fee" />
                            <H label="Comm %" />
                            <H label="Commission" />
                            <H label="Status" isLast />
                          </>);
                        })()}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedCommDeals.map((deal, idx) => {
                        const feeRate = deal.firmFeeRate ? `${Math.round(Number(deal.firmFeeRate) * 100)}%` : "—";
                        const firmFeeAmt = Number(deal.firmFeeAmount || 0) || Number(deal.estimatedRefundAmount || 0) * Number(deal.firmFeeRate || 0);
                        // Commission % reflects the partner + tier on this
                        // row: for L1 direct rows it's the user's L1 rate; for
                        // L2 downline rows it's the downline partner's L2 rate
                        // (both computed from the row amount ÷ firm fee, which
                        // always lands on the correct waterfall bracket).
                        const commPctNum = firmFeeAmt > 0 && deal._amt != null ? (Number(deal._amt) / firmFeeAmt) * 100 : null;
                        const commPct = commPctNum != null ? `${Math.round(commPctNum)}%` : "—";
                        return (
                          <tr key={deal.id + deal._tier} className={`border-b border-[var(--app-border)] last:border-b-0 hover:bg-[var(--app-card-bg)] transition-colors ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}>
                            <td className="px-4 sm:px-6 py-3.5">
                              <div className="font-body text-[13px] text-[var(--app-text)] truncate text-left">{deal.dealName}</div>
                              {deal._tier === "l2" && <div className="font-body text-[11px] text-[var(--app-text-muted)] truncate text-left">via {deal.submittingPartnerName || partnerNameMap[deal.partnerCode] || deal.partnerCode}</div>}
                            </td>
                            <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-muted)]">{fmtDate(deal.createdAt)}</td>
                            <td className="px-3 py-3.5 text-center">
                              <span className={`font-body text-[10px] font-semibold rounded px-1.5 py-0.5 ${deal._tier === "l1" ? "text-brand-gold bg-brand-gold/10 border border-brand-gold/20" : "text-purple-400 bg-purple-500/10 border border-purple-500/20"}`}>{deal._tier.toUpperCase()}</span>
                            </td>
                            <td className="px-3 py-3.5 text-center font-body text-[13px] text-[var(--app-text)]">{fmt$(deal.estimatedRefundAmount)}</td>
                            <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-muted)]">{feeRate}</td>
                            <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-muted)]">{fmt$(firmFeeAmt)}</td>
                            <td className="px-3 py-3.5 text-center font-body text-[12px] text-[var(--app-text-muted)]">{commPct}</td>
                            <td className={`px-3 py-3.5 text-center font-display text-[14px] font-semibold ${deal._tier === "l1" ? "text-brand-gold" : "text-purple-400"}`}>{fmt$(deal._amt)}</td>
                            <td className="px-3 py-3.5 text-center"><StatusBadge status={deal._status} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>

          {/* Task 12: Downline Accounting subsection for Disabled L1s with downline deals */}
          {tier === "l1" && !payoutDownlineEnabled && commDownlineDeals.length > 0 && (
            <div className="mt-6 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg-secondary)] p-5">
              <div className="mb-3">
                <div className="font-body text-[14px] font-semibold text-[var(--app-text)]">
                  Downline Accounting
                </div>
                <div className="font-body text-[12px] text-[var(--app-text-muted)] mt-0.5">
                  What you owe your downline based on your private sub-partner agreements. Fintella pays you the full rate for every deal in your subtree — these amounts are what you&rsquo;re expected to pay out yourself.
                </div>
              </div>

              <div className="space-y-2">
                {commDownlineDeals.map((d) => {
                  const l1Received = d.l1CommissionAmount + d.l2CommissionAmount + d.l3CommissionAmount;
                  const owedToDownline = d.l2CommissionAmount + d.l3CommissionAmount;
                  const kept = l1Received - owedToDownline;
                  return (
                    <div key={d.dealId} className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="font-body text-[12px] font-medium text-[var(--app-text)] truncate">{d.dealName}</div>
                        <div className="font-body text-[11px] text-[var(--app-text-muted)] shrink-0">
                          ${d.firmFeeAmount.toLocaleString()} firm fee
                        </div>
                      </div>
                      <div className="font-body text-[11px] text-[var(--app-text-secondary)] grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
                        <div>You received from Fintella</div>
                        <div className="text-right font-mono">${l1Received.toLocaleString()}</div>
                        <div>
                          You owe {d.submitterPartnerName} ({d.submitterTier.toUpperCase()} @ {(d.submitterRate * 100).toFixed(0)}%)
                        </div>
                        <div className="text-right font-mono">${owedToDownline.toLocaleString()}</div>
                        <div className="text-[var(--app-text-muted)]">You keep</div>
                        <div className="text-right font-mono text-[var(--app-text-muted)]">${kept.toLocaleString()}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--app-border)]">
                {(() => {
                  const totalReceived = commDownlineDeals.reduce((s, d) => s + d.l1CommissionAmount + d.l2CommissionAmount + d.l3CommissionAmount, 0);
                  const totalOwed = commDownlineDeals.reduce((s, d) => s + d.l2CommissionAmount + d.l3CommissionAmount, 0);
                  const totalKept = totalReceived - totalOwed;
                  return (
                    <div className="font-body text-[12px] grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
                      <div className="font-semibold">Total received from Fintella</div>
                      <div className="text-right font-mono font-semibold">${totalReceived.toLocaleString()}</div>
                      <div className="font-semibold">Total owed to downline</div>
                      <div className="text-right font-mono font-semibold">${totalOwed.toLocaleString()}</div>
                      <div className="font-semibold">Total kept</div>
                      <div className="text-right font-mono font-semibold">${totalKept.toLocaleString()}</div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Task 13: "Paid by upline" note for L2/L3 under a Disabled L1 with no ledger entries */}
          {tier !== "l1" && topL1PayoutDownlineEnabled === false && ledger.length === 0 && (
            <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg-secondary)] px-4 py-3 my-3">
              <div className="font-body text-[12px] text-[var(--app-text-secondary)]">
                Your commissions are paid by your upline partner. Contact them for details.
              </div>
              <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-1">
                Fintella is not responsible for paying you directly under your upline&rsquo;s current configuration.
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════ DOCUMENTS TAB (mounts the shared DocumentsView) ═══════════════ */}
      {pageTab === "documents" && <DocumentsView />}
    </div>
  );
}

/* ── Read-only deal detail panel ── */
function DealDetailPanel({ deal }: { deal: any }) {
  return (
    <div className="px-4 sm:px-6 py-5 bg-[var(--app-card-bg)] border-b border-t border-[var(--app-border)]">
      {/* Deal ID */}
      <div className="mb-4 p-3 rounded-lg" style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)" }}>
        <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">Deal ID</div>
        <div className="font-mono text-[12px] text-[var(--app-text)] mt-0.5 select-all">{deal.id}</div>
      </div>

      {/* Client Info */}
      <div className="mb-4">
        <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-3">Client Information</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5">
          {[
            { label: "Client Name", value: deal.clientName || [deal.clientFirstName, deal.clientLastName].filter(Boolean).join(" ") },
            { label: "Email", value: deal.clientEmail },
            { label: "Phone", value: deal.clientPhone },
            { label: "Business Title", value: deal.clientTitle },
            { label: "Company / Entity", value: deal.legalEntityName },
            { label: "Service", value: deal.serviceOfInterest },
            { label: "City", value: deal.businessCity },
            { label: "State", value: deal.businessState },
          ].filter((f) => f.value).map((f) => (
            <div key={f.label}>
              <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">{f.label}</div>
              <div className="font-body text-[13px] text-[var(--app-text-secondary)] mt-0.5">{f.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Consultation */}
      {(deal.consultBookedDate || deal.consultBookedTime) && (
        <div className="mb-4 p-3 rounded-lg flex items-center gap-4" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)" }}>
          <div>
            <div className="font-body text-[10px] text-yellow-500/80 uppercase tracking-wider">Consultation Date</div>
            <div className="font-body text-[13px] text-[var(--app-text)] mt-0.5">{deal.consultBookedDate || "—"}</div>
          </div>
          {deal.consultBookedTime && <div>
            <div className="font-body text-[10px] text-yellow-500/80 uppercase tracking-wider">Consultation Time</div>
            <div className="font-body text-[13px] text-[var(--app-text)] mt-0.5">{deal.consultBookedTime}</div>
          </div>}
        </div>
      )}

      {/* Tariff Info */}
      {(deal.importsGoods || deal.importCountries || deal.annualImportValue) && (
        <div className="mb-4">
          <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-3">Tariff Information</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5">
            {[
              { label: "Imports Goods", value: deal.importsGoods },
              { label: "Import Countries", value: deal.importCountries },
              { label: "Annual Import Value", value: deal.annualImportValue },
              { label: "Importer of Record", value: deal.importerOfRecord },
            ].filter((f) => f.value).map((f) => (
              <div key={f.label}>
                <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">{f.label}</div>
                <div className="font-body text-[13px] text-[var(--app-text-secondary)] mt-0.5">{f.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Financials */}
      <div>
        <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-3">Financial Summary</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Estimated Refund", value: fmt$(deal.estimatedRefundAmount), highlight: false },
            { label: "Firm Fee", value: fmt$(deal.firmFeeAmount), highlight: false },
            { label: "Commission", value: fmt$(deal.l1CommissionAmount || deal.l2CommissionAmount || 0), highlight: true },
            { label: "Status", value: (deal.l1CommissionStatus || deal.l2CommissionStatus || "pending").replace(/^\w/, (c: string) => c.toUpperCase()), highlight: false },
          ].map((f) => (
            <div key={f.label} className="p-3 rounded-lg" style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)" }}>
              <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">{f.label}</div>
              <div className={`font-display text-base font-bold ${f.highlight ? "text-brand-gold" : "text-[var(--app-text)]"}`}>{f.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      {deal.affiliateNotes && (
        <div className="mt-4 p-3 rounded-lg" style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)" }}>
          <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">Your Referral Notes</div>
          <div className="font-body text-[13px] text-[var(--app-text-secondary)] whitespace-pre-wrap">{deal.affiliateNotes}</div>
        </div>
      )}

      <div className="mt-3 font-body text-[10px] text-[var(--app-text-faint)]">Submitted {fmtDateTime(deal.createdAt)}</div>
    </div>
  );
}
