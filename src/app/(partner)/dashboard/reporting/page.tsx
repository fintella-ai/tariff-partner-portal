"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useDevice } from "@/lib/useDevice";
import StageBadge from "@/components/ui/StageBadge";
import StatusBadge from "@/components/ui/StatusBadge";
import { fmt$, fmtDate } from "@/lib/format";
import { FIRM_SHORT, DEFAULT_FIRM_FEE_RATE } from "@/lib/constants";
import DownlineTree, { type TreePartner } from "@/components/ui/DownlineTree";

type PageTab = "overview" | "deals" | "downline" | "commissions";

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
  const [loading, setLoading] = useState(true);

  const [pageTab, setPageTab] = useState<PageTab>("overview");
  const [dealsSubTab, setDealsSubTab] = useState<"direct" | "downline">("direct");
  const [downlineSubTab, setDownlineSubTab] = useState<"partners" | "deals">("partners");
  const [partnerView, setPartnerView] = useState<"list" | "tree">("list");
  const [commSubTab, setCommSubTab] = useState<"all" | "direct" | "downline">("all");

  // Filters (overview tab)
  const [sourceFilter, setSourceFilter] = useState<"all" | "direct" | "downline">("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [dealsRes, commRes] = await Promise.all([
        fetch("/api/deals"),
        fetch("/api/commissions"),
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
            ) : (
              <div className="overflow-x-auto">
                {filtered.map((deal, idx) => {
                  const commAmt = deal.source === "direct" ? deal.l1CommissionAmount : (deal.l2CommissionAmount || 0);
                  const commStatus = deal.source === "direct" ? deal.l1CommissionStatus : (deal.l2CommissionStatus || "pending");
                  return (
                    <div key={deal.id + deal.source} className={`px-4 sm:px-6 py-3.5 border-b border-[var(--app-border)] last:border-b-0 flex items-center justify-between gap-3 ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}>
                      <div className="flex-1 min-w-0">
                        <div className="font-body text-[13px] text-[var(--app-text)] truncate">{deal.dealName}</div>
                        <div className="font-body text-[11px] text-[var(--app-text-muted)]">
                          {deal.source === "downline" ? `via ${deal.submittingPartnerName || partnerNameMap[deal.partnerCode] || deal.partnerCode} · ` : ""}{fmtDate(deal.createdAt)}
                        </div>
                      </div>
                      <span className={`font-body text-[10px] font-semibold rounded px-1.5 py-0.5 shrink-0 ${deal.source === "direct" ? "text-brand-gold bg-brand-gold/10 border border-brand-gold/20" : "text-purple-400 bg-purple-500/10 border border-purple-500/20"}`}>{deal.source === "direct" ? "L1" : "L2"}</span>
                      <StageBadge stage={deal.stage} />
                      <div className="font-body text-[12px] text-[var(--app-text-muted)] shrink-0">{fmt$(deal.estimatedRefundAmount)}</div>
                      <div className="font-display text-[14px] font-semibold text-brand-gold shrink-0">{fmt$(commAmt)}</div>
                      <StatusBadge status={commStatus} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════ MY DEALS TAB ═══════════════ */}
      {pageTab === "deals" && (
        <>
          <div className="flex gap-1 mb-4 border-b border-[var(--app-border)]">
            {([{ id: "direct" as const, label: "My Direct Deals" }, { id: "downline" as const, label: "Downline Deals" }]).map((t) => (
              <button key={t.id} onClick={() => setDealsSubTab(t.id)} className={`font-body text-[13px] px-4 py-2.5 whitespace-nowrap transition-colors border-b-2 -mb-px ${dealsSubTab === t.id ? "text-brand-gold border-brand-gold" : "text-[var(--app-text-muted)] border-transparent hover:text-[var(--app-text-secondary)]"}`}>{t.label}</button>
            ))}
          </div>
          <div className="card">
            {(() => {
              const deals = dealsSubTab === "direct" ? directDeals : downlineDeals;
              if (deals.length === 0) return <div className="p-12 text-center font-body text-sm text-[var(--app-text-muted)]">{dealsSubTab === "direct" ? "No direct deals yet." : "No downline deals yet."}</div>;
              return deals.map((deal, idx) => {
                const commAmt = dealsSubTab === "direct" ? deal.l1CommissionAmount : (deal.l2CommissionAmount || 0);
                const commStatus = dealsSubTab === "direct" ? deal.l1CommissionStatus : (deal.l2CommissionStatus || "pending");
                return (
                  <div key={deal.id} className={`px-4 sm:px-6 py-3.5 border-b border-[var(--app-border)] last:border-b-0 ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="font-body text-[13px] font-medium text-[var(--app-text)] truncate flex-1">{deal.dealName}</div>
                      <StageBadge stage={deal.stage} />
                    </div>
                    <div className="font-body text-[11px] text-[var(--app-text-muted)] mb-2">
                      {dealsSubTab === "downline" ? `Via ${deal.submittingPartnerName || partnerNameMap[deal.partnerCode] || deal.partnerCode} · ` : ""}{fmtDate(deal.createdAt)}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="font-body text-[12px] text-[var(--app-text-muted)]">Refund: {fmt$(deal.estimatedRefundAmount)}</div>
                      <div className="flex items-center gap-3">
                        <div className="font-display text-[14px] font-semibold text-brand-gold">{fmt$(commAmt)}</div>
                        <StatusBadge status={commStatus} />
                      </div>
                    </div>
                  </div>
                );
              });
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
                  ) : (
                    downlinePartners.map((p, idx) => (
                      <div key={p.id} className={`px-4 sm:px-6 py-3.5 border-b border-[var(--app-border)] last:border-b-0 flex items-center justify-between ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}>
                        <div>
                          <div className="font-body text-[13px] font-medium text-[var(--app-text)]">{p.firstName} {p.lastName}</div>
                          <div className="font-body text-[11px] text-[var(--app-text-muted)]">{p.partnerCode} · {p.companyName || "—"}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`font-body text-[10px] font-semibold rounded-full px-2.5 py-0.5 ${p.status === "active" ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"}`}>{p.status}</span>
                          {p.commissionRate && <span className="font-body text-[11px] text-brand-gold">{Math.round(p.commissionRate * 100)}%</span>}
                        </div>
                      </div>
                    ))
                  )}
                </>
              )
            ) : (
              downlineDeals.length === 0 ? (
                <div className="p-12 text-center font-body text-sm text-[var(--app-text-muted)]">No downline deals yet.</div>
              ) : (
                downlineDeals.map((deal, idx) => (
                  <div key={deal.id} className={`px-4 sm:px-6 py-3.5 border-b border-[var(--app-border)] last:border-b-0 ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="font-body text-[13px] font-medium text-[var(--app-text)] truncate flex-1">{deal.dealName}</div>
                      <StageBadge stage={deal.stage} />
                    </div>
                    <div className="font-body text-[11px] text-[var(--app-text-muted)] mb-2">Via {deal.submittingPartnerName || partnerNameMap[deal.partnerCode] || deal.partnerCode} · {fmtDate(deal.createdAt)}</div>
                    <div className="flex items-center justify-between">
                      <div className="font-body text-[12px] text-[var(--app-text-muted)]">Refund: {fmt$(deal.estimatedRefundAmount)}</div>
                      <div className="flex items-center gap-3">
                        <div className="font-display text-[14px] font-semibold text-brand-gold">{fmt$(deal.l2CommissionAmount)}</div>
                        <StatusBadge status={deal.l2CommissionStatus} />
                      </div>
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </>
      )}

      {/* ═══════════════ COMMISSIONS TAB ═══════════════ */}
      {pageTab === "commissions" && (
        <>
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

          {/* Commission summary */}
          <div className={`grid ${device.isMobile ? "grid-cols-1" : "grid-cols-2"} ${device.gap} mb-6`}>
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
          </div>

          {/* Commission history */}
          <div className="card">
            <div className="px-4 sm:px-6 pt-4 sm:pt-5">
              <div className="font-body font-semibold text-sm">Commission History</div>
            </div>
            <div className="flex gap-1 px-4 sm:px-6 border-b border-[var(--app-border)]">
              {([{ id: "all" as const, label: "All" }, { id: "direct" as const, label: "Direct" }, { id: "downline" as const, label: "Downline" }]).map((t) => (
                <button key={t.id} onClick={() => setCommSubTab(t.id)} className={`font-body text-[13px] px-4 py-2.5 whitespace-nowrap transition-colors border-b-2 -mb-px ${commSubTab === t.id ? "text-brand-gold border-brand-gold" : "text-[var(--app-text-muted)] border-transparent hover:text-[var(--app-text-secondary)]"}`}>{t.label}</button>
              ))}
            </div>
            {(() => {
              const showDirect = commSubTab === "all" || commSubTab === "direct";
              const showDownline = commSubTab === "all" || commSubTab === "downline";
              const hasDirect = showDirect && directDeals.length > 0;
              const hasDownline = showDownline && downlineDeals.length > 0;
              if (!hasDirect && !hasDownline) return <div className="p-12 text-center font-body text-sm text-[var(--app-text-muted)]">No commission entries for this filter.</div>;
              return (
                <div>
                  {showDirect && directDeals.map((deal) => (
                    <div key={deal.id} className="px-4 sm:px-6 py-3.5 border-b border-[var(--app-border)] last:border-b-0 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-body text-[13px] text-[var(--app-text)] truncate">{deal.dealName}</div>
                        <div className="font-body text-[11px] text-[var(--app-text-muted)]">{fmtDate(deal.createdAt)}</div>
                      </div>
                      <span className="font-body text-[10px] text-brand-gold font-semibold bg-brand-gold/10 border border-brand-gold/20 rounded px-1.5 py-0.5">L1</span>
                      <div className="font-display text-[14px] font-semibold text-brand-gold">{fmt$(deal.l1CommissionAmount)}</div>
                      <StatusBadge status={deal.l1CommissionStatus} />
                    </div>
                  ))}
                  {showDownline && downlineDeals.map((deal) => (
                    <div key={deal.id} className="px-4 sm:px-6 py-3.5 border-b border-[var(--app-border)] last:border-b-0 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-body text-[13px] text-[var(--app-text)] truncate">{deal.dealName}</div>
                        <div className="font-body text-[11px] text-[var(--app-text-muted)]">via {deal.submittingPartnerName || partnerNameMap[deal.partnerCode] || deal.partnerCode} · {fmtDate(deal.createdAt)}</div>
                      </div>
                      <span className="font-body text-[10px] text-purple-400 font-semibold bg-purple-500/10 border border-purple-500/20 rounded px-1.5 py-0.5">L2</span>
                      <div className="font-display text-[14px] font-semibold text-purple-400">{fmt$(deal.l2CommissionAmount)}</div>
                      <StatusBadge status={deal.l2CommissionStatus} />
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}
