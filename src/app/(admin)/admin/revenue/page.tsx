"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { fmt$, fmtDate } from "@/lib/format";
import PartnerLink from "@/components/ui/PartnerLink";
import DealLink from "@/components/ui/DealLink";
import ReportingTabs from "@/components/ui/ReportingTabs";
import SortHeader, { type SortDir } from "@/components/ui/SortHeader";

type SortKey = string;

// ─── Per-admin layout (drag-to-reorder via "Edit layout" button) ──────────
// Same pattern as /admin/reports and /admin (AdminWorkspacePage). Section
// order persists in localStorage.
type SectionId = "summary" | "breakdown" | "enterprise" | "deals";
const DEFAULT_SECTION_ORDER: SectionId[] = ["summary", "breakdown", "enterprise", "deals"];
const LAYOUT_KEY = "fintella.admin.revenue.layout.v1";

function readLayout(): SectionId[] {
  if (typeof window === "undefined") return DEFAULT_SECTION_ORDER;
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    if (!raw) return DEFAULT_SECTION_ORDER;
    const parsed = JSON.parse(raw) as SectionId[];
    const known = new Set<SectionId>(DEFAULT_SECTION_ORDER);
    const preserved = parsed.filter((s) => known.has(s));
    const appended = DEFAULT_SECTION_ORDER.filter((s) => !preserved.includes(s));
    return [...preserved, ...appended];
  } catch {
    return DEFAULT_SECTION_ORDER;
  }
}

const FINTELLA_FEE_RATE = 0.40; // Fintella receives 40% of firm fee (Frost Law contract)
const MAX_PARTNER_RATE = 0.25;  // Maximum commission rate any partner can have (used for projected pipeline fallback)

// Shape returned by /api/admin/enterprise — mirrors the shape used on
// the Custom Commissions → Enterprise Reporting tab. Duplicated here
// (not imported) to keep the page self-contained; the types are stable
// since both screens consume the same endpoint.
type EnterprisePartnerData = {
  id: string;
  partnerCode: string;
  partnerId: string | null;
  partnerName: string;
  companyName: string | null;
  totalRate: number;
  overrideRate: number;
  applyToAll: boolean;
  status: string;
  notes: string | null;
  createdAt: string;
  overrides: {
    id: string;
    l1PartnerCode: string;
    l1PartnerId: string | null;
    l1PartnerName: string;
    l1PartnerStatus: string;
    status: string;
    createdAt: string;
  }[];
  summary: {
    totalDeals: number;
    totalDealAmount: number;
    totalFirmFees: number;
    totalOverrideEarnings: number;
    closedWonDeals: number;
  };
  dealBreakdown: {
    id: string;
    dealName: string;
    partnerCode: string;
    partnerName: string;
    stage: string;
    dealAmount: number;
    firmFee: number;
    fintellaGross: number;
    l1Commission: number;
    overrideAmount: number;
    fintellaNetAfterEnterprise: number;
    createdAt: string;
  }[];
};

interface Deal {
  id: string;
  dealName: string;
  partnerCode: string;
  partnerId: string | null;
  stage: string;
  estimatedRefundAmount: number;
  actualRefundAmount: number | null;
  firmFeeRate: number | null;
  firmFeeAmount: number;
  l1CommissionRate: number | null;
  // Server-resolved fallback: deal.l1CommissionRate ?? submittingPartner.commissionRate.
  // Used as the per-deal commission rate in the Comm % column.
  effectiveCommissionRate: number | null;
  l1CommissionAmount: number;
  l1CommissionStatus: string;
  l2CommissionAmount: number;
  l2CommissionStatus: string;
  l3CommissionAmount: number;
  l3CommissionStatus: string;
  closeDate: string | null;
  createdAt: string;
}

// Stage-aware refund: closed_won deals prefer actualRefundAmount when set,
// matching the resolveDealFinancials rule. Used for pipeline + closed-won
// firm fee derivation when the DB firmFeeAmount is 0.
const stageAwareRefund = (d: Deal): number => {
  if (d.stage === "closedwon" && d.actualRefundAmount && d.actualRefundAmount > 0) {
    return d.actualRefundAmount;
  }
  return d.estimatedRefundAmount;
};

// Effective firm fee: stored value wins (except closed_won with actual set,
// where we recompute from rate × actual to honor the stage-aware base); else
// compute from firmFeeRate × refund with 20% default rate fallback for
// pipeline projections where rate isn't yet set.
const effectiveFirmFee = (d: Deal): number => {
  const refund = stageAwareRefund(d);
  const usingActual = d.stage === "closedwon" && d.actualRefundAmount && d.actualRefundAmount > 0;
  if (d.firmFeeAmount > 0 && !usingActual) return d.firmFeeAmount;
  const rate = d.firmFeeRate ?? 0.20;
  return refund * rate;
};

// Partner commission total for a deal: sum of all three tier snapshots.
// These are populated by the webhook's waterfall write (PR #370) regardless
// of Enabled/Disabled mode, so summing them gives the correct total partner
// payout for either payout model.
const partnerCommission = (d: Deal): number =>
  d.l1CommissionAmount + d.l2CommissionAmount + d.l3CommissionAmount;

// Per-deal commission rate for display. Falls back through the same chain
// the admin deals table uses: custom per-deal rate → submitting partner's
// standard rate → null (render "—").
const commissionRate = (d: Deal): number | null =>
  d.l1CommissionRate ?? d.effectiveCommissionRate ?? null;

// Pipeline projection: until a deal closes there's no ledger, so project
// using the partner's standard rate × firm fee.
const projectedPartnerCommission = (d: Deal): number => {
  const rate = commissionRate(d) ?? MAX_PARTNER_RATE;
  return effectiveFirmFee(d) * rate;
};

const stageBadge: Record<string, string> = {
  new_lead: "bg-gray-500/10 text-gray-400 border border-gray-500/20",
  no_consultation: "bg-red-500/10 text-red-400 border border-red-500/20",
  consultation_booked: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  client_no_show: "bg-red-500/10 text-red-400 border border-red-500/20",
  client_engaged: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  in_process: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  closedwon: "bg-green-500/10 text-green-400 border border-green-500/20",
  closedlost: "bg-red-500/10 text-red-400 border border-red-500/20",
};

export default function RevenuePage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  // Enterprise-partner data, duplicated from the Custom Commissions →
  // Enterprise Reporting tab so the company revenue page has EP totals
  // in the same view as firm-fee totals + a breakdown table per EP.
  const [enterprises, setEnterprises] = useState<EnterprisePartnerData[]>([]);
  const [epLoading, setEpLoading] = useState(true);

  // Drag-to-reorder layout state (per-admin via localStorage)
  const [sectionOrder, setSectionOrder] = useState<SectionId[]>(DEFAULT_SECTION_ORDER);
  const [editMode, setEditMode] = useState(false);
  const [draggedSection, setDraggedSection] = useState<SectionId | null>(null);

  useEffect(() => { setSectionOrder(readLayout()); }, []);

  const persistLayout = useCallback((next: SectionId[]) => {
    setSectionOrder(next);
    if (typeof window !== "undefined") {
      try { window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(next)); } catch {}
    }
  }, []);

  const onSectionDragStart = (e: React.DragEvent, id: SectionId) => {
    if (!editMode) return;
    setDraggedSection(id);
    e.dataTransfer.effectAllowed = "move";
  };
  const onSectionDragOver = (e: React.DragEvent) => {
    if (!editMode || !draggedSection) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const onSectionDrop = (e: React.DragEvent, targetId: SectionId) => {
    if (!editMode || !draggedSection) return;
    e.preventDefault();
    if (draggedSection === targetId) { setDraggedSection(null); return; }
    const next = [...sectionOrder];
    const src = next.indexOf(draggedSection);
    const dst = next.indexOf(targetId);
    if (src < 0 || dst < 0) { setDraggedSection(null); return; }
    next.splice(src, 1);
    next.splice(dst, 0, draggedSection);
    persistLayout(next);
    setDraggedSection(null);
  };
  const [filter, setFilter] = useState<"all" | "closedwon" | "pipeline">("all");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterPartner, setFilterPartner] = useState("");
  const [filterStage, setFilterStage] = useState("");
  const [filterMinAmount, setFilterMinAmount] = useState("");
  const [filterMaxAmount, setFilterMaxAmount] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("dealName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

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

  const fetchEnterprises = useCallback(() => {
    setEpLoading(true);
    fetch("/api/admin/enterprise")
      .then((r) => r.json())
      .then((d) => setEnterprises(Array.isArray(d?.enterprises) ? d.enterprises : []))
      .catch(() => setEnterprises([]))
      .finally(() => setEpLoading(false));
  }, []);

  useEffect(() => { fetchEnterprises(); }, [fetchEnterprises]);

  // Aggregate across every ACTIVE enterprise partner. Totals flow into
  // the top revenue cards + breakdown card as a company-wide line.
  const activeEPs = enterprises.filter((e) => e.status === "active");
  const totalEnterpriseOverride = activeEPs.reduce(
    (s, ep) => s + (ep.summary?.totalOverrideEarnings || 0),
    0,
  );

  // Filter and sort deals
  const filtered = useMemo(() => {
    let base = deals.filter((d) => {
      if (filter === "closedwon") return d.stage === "closedwon";
      if (filter === "pipeline") return d.stage !== "closedwon" && d.stage !== "closedlost";
      return true;
    });

    // Text search
    if (search) {
      const q = search.toLowerCase();
      base = base.filter((d) =>
        d.dealName.toLowerCase().includes(q) ||
        d.partnerCode.toLowerCase().includes(q)
      );
    }

    // Advanced filters
    if (filterPartner) {
      const q = filterPartner.toLowerCase();
      base = base.filter((d) => d.partnerCode.toLowerCase().includes(q));
    }
    if (filterStage) {
      base = base.filter((d) => d.stage === filterStage);
    }
    if (filterMinAmount) {
      const min = parseFloat(filterMinAmount);
      if (!isNaN(min)) base = base.filter((d) => d.estimatedRefundAmount >= min);
    }
    if (filterMaxAmount) {
      const max = parseFloat(filterMaxAmount);
      if (!isNaN(max)) base = base.filter((d) => d.estimatedRefundAmount <= max);
    }

    return [...base].sort((a, b) => {
      const getFintellaGross = (d: Deal) => effectiveFirmFee(d) * FINTELLA_FEE_RATE;
      const getPartnerComm = (d: Deal) => (d.stage === "closedwon" ? partnerCommission(d) : projectedPartnerCommission(d));
      const getFintellaNet = (d: Deal) => getFintellaGross(d) - getPartnerComm(d);

      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortKey) {
        case "dealName": aVal = a.dealName.toLowerCase(); bVal = b.dealName.toLowerCase(); break;
        case "stage": aVal = a.stage; bVal = b.stage; break;
        case "dealAmount": aVal = stageAwareRefund(a); bVal = stageAwareRefund(b); break;
        case "firmFee": aVal = effectiveFirmFee(a); bVal = effectiveFirmFee(b); break;
        case "fintellaGross": aVal = getFintellaGross(a); bVal = getFintellaGross(b); break;
        case "commRate": aVal = commissionRate(a) ?? 0; bVal = commissionRate(b) ?? 0; break;
        case "commAmount": aVal = getPartnerComm(a); bVal = getPartnerComm(b); break;
        case "fintellaNet": aVal = getFintellaNet(a); bVal = getFintellaNet(b); break;
        case "date": aVal = a.closeDate || a.createdAt; bVal = b.closeDate || b.createdAt; break;
        default: return 0;
      }

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [deals, filter, search, filterPartner, filterStage, filterMinAmount, filterMaxAmount, sortKey, sortDir]);

  // ── Revenue calculations ──────────────────────────────────────────────
  const closedWonDeals = deals.filter((d) => d.stage === "closedwon");
  const pipelineDeals = deals.filter((d) => d.stage !== "closedwon" && d.stage !== "closedlost");

  // Closed Won (realized revenue) — stage-aware refund, all three tiers.
  const totalDealAmountWon = closedWonDeals.reduce((sum, d) => sum + stageAwareRefund(d), 0);
  const totalFirmFeesWon = closedWonDeals.reduce((sum, d) => sum + effectiveFirmFee(d), 0);
  const totalFintellaGrossWon = totalFirmFeesWon * FINTELLA_FEE_RATE;
  const totalPartnerCommWon = closedWonDeals.reduce((sum, d) => sum + partnerCommission(d), 0);
  const totalFintellaNetWon = totalFintellaGrossWon - totalPartnerCommWon;
  // Fintella's bottom line after paying out enterprise overrides too.
  // Used alongside totalFintellaNetWon so the breakdown can show both.
  const totalFintellaNetAfterEnterprise = totalFintellaNetWon - totalEnterpriseOverride;

  // Commission breakdown — paid vs pending/due. Status is tracked on the
  // L1 row for simple reporting; the L2/L3 rows flip together during payout.
  const commPaid = closedWonDeals
    .filter((d) => d.l1CommissionStatus === "paid")
    .reduce((sum, d) => sum + partnerCommission(d), 0);
  const commPending = totalPartnerCommWon - commPaid;

  // Pipeline (projected revenue) — each deal's commission projected at its
  // own partner's rate, not a flat 25%.
  const totalFirmFeesPipeline = pipelineDeals.reduce((sum, d) => sum + effectiveFirmFee(d), 0);
  const totalFintellaGrossPipeline = totalFirmFeesPipeline * FINTELLA_FEE_RATE;
  const totalPartnerCommPipeline = pipelineDeals.reduce((sum, d) => sum + projectedPartnerCommission(d), 0);
  const totalFintellaNetPipeline = totalFintellaGrossPipeline - totalPartnerCommPipeline;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="font-body text-sm theme-text-muted">Loading revenue data...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div style={{ order: -1 }}>
        <ReportingTabs />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h2 className="font-display text-[22px] font-bold mb-1">Company Revenue</h2>
            <p className="font-body text-[13px] theme-text-muted">
              Fintella receives {Math.round(FINTELLA_FEE_RATE * 100)}% of firm fees. Partner commission rates vary per deal (up to {Math.round(MAX_PARTNER_RATE * 100)}%); totals below use each deal&rsquo;s own rate.
            </p>
          </div>
          <button
            onClick={() => setEditMode((v) => !v)}
            className={`font-body text-[12px] px-3 py-2 rounded-lg border transition-colors shrink-0 ${
              editMode
                ? "bg-brand-gold text-black border-brand-gold font-semibold"
                : "border-[var(--app-border)] theme-text-secondary hover:bg-brand-gold/10 hover:border-brand-gold/40"
            }`}
            title="Drag to reorder sections — saved per admin via localStorage"
          >
            {editMode ? "✓ Done editing" : "✎ Edit layout"}
          </button>
        </div>
      </div>

      {/* ═══ REVENUE SUMMARY ═══ */}
      <section
        key="summary"
        draggable={editMode}
        onDragStart={(e) => onSectionDragStart(e, "summary")}
        onDragOver={onSectionDragOver}
        onDrop={(e) => onSectionDrop(e, "summary")}
        className={`${editMode ? "rounded-lg ring-1 ring-brand-gold/25 p-2 cursor-move mb-6" : ""}`}
        style={{ order: sectionOrder.indexOf("summary") }}
      >
        {editMode && (
          <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">⋮⋮ Revenue Summary — drag to reorder</div>
        )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <div className="stat-card">
          <div className="font-body text-[9px] tracking-[1.5px] uppercase theme-text-muted mb-2">Total Deal Value</div>
          <div className="font-display text-xl sm:text-2xl font-bold">{fmt$(totalDealAmountWon)}</div>
          <div className="font-body text-[10px] theme-text-muted mt-1">{closedWonDeals.length} closed won deals</div>
        </div>
        <div className="stat-card">
          <div className="font-body text-[9px] tracking-[1.5px] uppercase theme-text-muted mb-2">Fintella Gross (40%)</div>
          <div className="font-display text-xl sm:text-2xl font-bold text-brand-gold">{fmt$(totalFintellaGrossWon)}</div>
          <div className="font-body text-[10px] theme-text-muted mt-1">Of firm fees earned</div>
        </div>
        <div className="stat-card">
          <div className="font-body text-[9px] tracking-[1.5px] uppercase theme-text-muted mb-2">Partner Commissions</div>
          <div className="font-display text-xl sm:text-2xl font-bold text-red-400">-{fmt$(totalPartnerCommWon)}</div>
          <div className="font-body text-[10px] theme-text-muted mt-1">
            <span className="text-green-400">{fmt$(commPaid)} paid</span> · <span className="text-yellow-400">{fmt$(commPending)} pending</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="font-body text-[9px] tracking-[1.5px] uppercase theme-text-muted mb-2">Enterprise Overrides</div>
          <div className="font-display text-xl sm:text-2xl font-bold text-purple-400">-{fmt$(totalEnterpriseOverride)}</div>
          <div className="font-body text-[10px] theme-text-muted mt-1">{activeEPs.length} active enterprise partner{activeEPs.length === 1 ? "" : "s"}</div>
        </div>
        <div className="stat-card">
          <div className="font-body text-[9px] tracking-[1.5px] uppercase theme-text-muted mb-2">Fintella Net Revenue</div>
          <div className="font-display text-xl sm:text-2xl font-bold text-green-400">{fmt$(totalFintellaNetAfterEnterprise)}</div>
          <div className="font-body text-[10px] theme-text-muted mt-1">After partner + enterprise payouts</div>
        </div>
        <div className="stat-card">
          <div className="font-body text-[9px] tracking-[1.5px] uppercase theme-text-muted mb-2">Pipeline (Projected)</div>
          <div className="font-display text-xl sm:text-2xl font-bold text-blue-400">{fmt$(totalFintellaNetPipeline)}</div>
          <div className="font-body text-[10px] theme-text-muted mt-1">{pipelineDeals.length} active deals</div>
        </div>
      </div>
      </section>

      {/* ═══ BREAKDOWN CARD ═══ */}
      <section
        key="breakdown"
        draggable={editMode}
        onDragStart={(e) => onSectionDragStart(e, "breakdown")}
        onDragOver={onSectionDragOver}
        onDrop={(e) => onSectionDrop(e, "breakdown")}
        className={`${editMode ? "rounded-lg ring-1 ring-brand-gold/25 p-2 cursor-move mb-6" : ""}`}
        style={{ order: sectionOrder.indexOf("breakdown") }}
      >
        {editMode && (
          <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">⋮⋮ Revenue Breakdown — drag to reorder</div>
        )}
      <div className="card p-5 sm:p-6 mb-6">
        <div className="font-body font-semibold text-sm mb-4">Revenue Breakdown</div>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <span className="font-body text-[13px] theme-text-secondary">Total Deal Value (Closed Won)</span>
            <span className="font-display text-[15px] font-bold">{fmt$(totalDealAmountWon)}</span>
          </div>
          <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <span className="font-body text-[13px] theme-text-secondary">Total Firm Fees</span>
            <span className="font-display text-[15px] font-bold">{fmt$(totalFirmFeesWon)}</span>
          </div>
          <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <span className="font-body text-[13px] text-brand-gold">Fintella Share (40%)</span>
            <span className="font-display text-[15px] font-bold text-brand-gold">{fmt$(totalFintellaGrossWon)}</span>
          </div>
          <div className="flex items-center justify-between py-2 pl-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <span className="font-body text-[12px] text-green-400">Partner Commissions Paid</span>
            <span className="font-body text-[13px] text-green-400">-{fmt$(commPaid)}</span>
          </div>
          <div className="flex items-center justify-between py-2 pl-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <span className="font-body text-[12px] text-yellow-400">Partner Commissions Pending</span>
            <span className="font-body text-[13px] text-yellow-400">-{fmt$(commPending)}</span>
          </div>
          <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <span className="font-body text-[13px] text-[var(--app-text-secondary)]">Fintella Net (after partner commissions)</span>
            <span className="font-display text-[15px] font-bold text-[var(--app-text-secondary)]">{fmt$(totalFintellaNetWon)}</span>
          </div>
          <div className="flex items-center justify-between py-2 pl-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <span className="font-body text-[12px] text-purple-400">Enterprise Overrides ({activeEPs.length} active EP{activeEPs.length === 1 ? "" : "s"})</span>
            <span className="font-body text-[13px] text-purple-400">-{fmt$(totalEnterpriseOverride)}</span>
          </div>
          <div className="flex items-center justify-between py-3 rounded-lg px-3 bg-green-500/5 border border-green-500/15">
            <span className="font-body text-[14px] font-semibold text-green-400">Fintella Net After Enterprise</span>
            <span className="font-display text-lg font-bold text-green-400">{fmt$(totalFintellaNetAfterEnterprise)}</span>
          </div>
        </div>
      </div>
      </section>

      {/* ═══ ENTERPRISE REPORTING & PAYOUTS ═══
          Duplicated from the Custom Commissions → Enterprise Reporting
          tab so the company revenue page carries the per-EP breakdown
          in one place. Same data source (/api/admin/enterprise) and the
          same per-EP card shape: 5 summary metrics + per-deal table
          with Fintella 40% / L1 commission / enterprise override /
          Fintella net.  */}
      <section
        key="enterprise"
        draggable={editMode}
        onDragStart={(e) => onSectionDragStart(e, "enterprise")}
        onDragOver={onSectionDragOver}
        onDrop={(e) => onSectionDrop(e, "enterprise")}
        className={`mb-6 ${editMode ? "rounded-lg ring-1 ring-brand-gold/25 p-2 cursor-move" : ""}`}
        style={{ order: sectionOrder.indexOf("enterprise") }}
      >
        {editMode && (
          <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">⋮⋮ Enterprise Reporting &amp; Payouts — drag to reorder</div>
        )}
      <div>
        <h3 className="font-display text-lg font-bold mb-1">Enterprise Reporting &amp; Payouts</h3>
        <p className="font-body text-[13px] theme-text-muted mb-5">
          Deal-level breakdown for each active enterprise partner — Fintella&rsquo;s 40% gross share, L1 commission paid, EP override paid, and net company profit after all payouts.
        </p>

        {epLoading ? (
          <div className="card p-8 text-center"><div className="font-body text-sm theme-text-muted">Loading enterprise data...</div></div>
        ) : activeEPs.length === 0 ? (
          <div className="card p-10 text-center">
            <div className="font-body text-sm theme-text-muted">
              No active enterprise partners. Add one in <span className="text-brand-gold">Custom Commissions</span> → <span className="text-brand-gold">Custom Commissions</span> tab.
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {activeEPs.map((ep) => {
              const activeDeals = ep.dealBreakdown;
              const totalOverride = ep.summary.totalOverrideEarnings;
              const totalL1Comm = activeDeals.reduce((s, d) => s + d.l1Commission, 0);
              const totalFintellaGross = activeDeals.reduce((s, d) => s + d.fintellaGross, 0);
              const totalNetAfterAll = activeDeals.reduce((s, d) => s + d.fintellaNetAfterEnterprise, 0);

              return (
                <div key={ep.id} className="card">
                  <div className="px-5 py-4 border-b border-[var(--app-border)]">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <PartnerLink partnerId={ep.partnerId} className="font-body text-[15px] font-semibold text-[var(--app-text)]">{ep.partnerName}</PartnerLink>
                          <span className="font-body text-xs text-purple-400 font-semibold">+{Math.round(ep.overrideRate * 100)}% override</span>
                        </div>
                        <div className="font-body text-[11px] theme-text-muted mt-0.5">{ep.partnerCode} &middot; {activeDeals.length} deal{activeDeals.length === 1 ? "" : "s"} across {ep.overrides.filter((o) => o.status === "active").length} L1 partner{ep.overrides.filter((o) => o.status === "active").length === 1 ? "" : "s"}</div>
                      </div>
                    </div>
                  </div>

                  {/* Summary metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 px-5 py-4 border-b border-[var(--app-border)]">
                    {[
                      { label: "Fintella 40%", value: fmt$(totalFintellaGross), color: "text-brand-gold" },
                      { label: "L1 Commission", value: fmt$(totalL1Comm), color: "text-red-400" },
                      { label: `Enterprise ${Math.round(ep.overrideRate * 100)}%`, value: fmt$(totalOverride), color: "text-purple-400" },
                      { label: "Total Payout", value: fmt$(totalL1Comm + totalOverride), color: "text-orange-400" },
                      { label: "Fintella Net Profit", value: fmt$(totalNetAfterAll), color: "text-green-400" },
                    ].map((m) => (
                      <div key={m.label}>
                        <div className="font-body text-[10px] theme-text-muted uppercase tracking-wider mb-1">{m.label}</div>
                        <div className={`font-display text-base font-bold ${m.color}`}>{m.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Deal breakdown — desktop */}
                  {activeDeals.length > 0 && (
                    <>
                      <div className="hidden md:block overflow-x-auto">
                        <div className="grid grid-cols-[1.4fr_0.6fr_0.6fr_0.6fr_0.6fr_0.6fr_0.6fr] gap-2 px-5 py-2.5 border-b border-[var(--app-border)] min-w-[700px]">
                          {["Deal", "L1 Partner", "Firm Fee", "Fintella 40%", "L1 Comm", `EP ${Math.round(ep.overrideRate * 100)}%`, "Net"].map((h) => (
                            <div key={h} className="font-body text-[10px] tracking-[1px] uppercase theme-text-muted">{h}</div>
                          ))}
                        </div>
                        {activeDeals.map((d) => (
                          <div key={d.id} className="grid grid-cols-[1.4fr_0.6fr_0.6fr_0.6fr_0.6fr_0.6fr_0.6fr] gap-2 px-5 py-3 items-center min-w-[700px] hover:bg-[var(--app-hover)] transition-colors border-b border-[var(--app-border)] last:border-b-0">
                            <div>
                              <DealLink dealId={d.id} className="font-body text-[13px] font-medium truncate block">{d.dealName}</DealLink>
                              <div className="font-body text-[10px] theme-text-muted">{d.stage.replace("_", " ")}</div>
                            </div>
                            <PartnerLink partnerId={null} className="font-body text-[12px] theme-text-secondary truncate">{d.partnerName}</PartnerLink>
                            <div className="font-body text-[13px] theme-text-secondary">{fmt$(d.firmFee)}</div>
                            <div className="font-body text-[13px] text-brand-gold font-semibold">{fmt$(d.fintellaGross)}</div>
                            <div className="font-body text-[13px] text-red-400">-{fmt$(d.l1Commission)}</div>
                            <div className="font-body text-[13px] text-purple-400 font-semibold">-{fmt$(d.overrideAmount)}</div>
                            <div className="font-display text-[13px] font-semibold text-green-400">{fmt$(d.fintellaNetAfterEnterprise)}</div>
                          </div>
                        ))}
                      </div>

                      {/* Deal breakdown — mobile cards */}
                      <div className="md:hidden divide-y divide-[var(--app-border)]">
                        {activeDeals.map((d) => (
                          <div key={d.id} className="px-4 py-4">
                            <DealLink dealId={d.id} className="font-body text-sm font-medium text-[var(--app-text)] mb-1 block">{d.dealName}</DealLink>
                            <div className="font-body text-xs theme-text-muted mb-2">{d.partnerName} &middot; {d.stage.replace("_", " ")}</div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                              <div className="flex justify-between"><span className="font-body text-xs theme-text-muted">Fintella 40%</span><span className="font-body text-xs text-brand-gold font-semibold">{fmt$(d.fintellaGross)}</span></div>
                              <div className="flex justify-between"><span className="font-body text-xs theme-text-muted">L1 Comm</span><span className="font-body text-xs text-red-400">-{fmt$(d.l1Commission)}</span></div>
                              <div className="flex justify-between"><span className="font-body text-xs theme-text-muted">EP Override</span><span className="font-body text-xs text-purple-400 font-semibold">-{fmt$(d.overrideAmount)}</span></div>
                              <div className="flex justify-between"><span className="font-body text-xs theme-text-muted">Net</span><span className="font-body text-xs text-green-400 font-semibold">{fmt$(d.fintellaNetAfterEnterprise)}</span></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {activeDeals.length === 0 && (
                    <div className="px-5 py-8 text-center font-body text-[13px] theme-text-muted">No deals from assigned L1 partners yet.</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      </section>

      {/* ═══ DEAL-BY-DEAL TABLE ═══ */}
      <section
        key="deals"
        draggable={editMode}
        onDragStart={(e) => onSectionDragStart(e, "deals")}
        onDragOver={onSectionDragOver}
        onDrop={(e) => onSectionDrop(e, "deals")}
        className={`${editMode ? "rounded-lg ring-1 ring-brand-gold/25 p-2 cursor-move mb-6" : ""}`}
        style={{ order: sectionOrder.indexOf("deals") }}
      >
        {editMode && (
          <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">⋮⋮ Deal Revenue Detail — drag to reorder</div>
        )}
      <div className="card">
        <div className="px-5 py-4 flex flex-col gap-3" style={{ borderBottom: "1px solid var(--app-border)" }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="font-body font-semibold text-sm">Deal Revenue Detail</div>
            <div className="flex gap-2 flex-wrap">
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
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`font-body text-[11px] px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
                  showFilters ? "bg-purple-500/10 border-purple-500/30 text-purple-400" : "border-[var(--app-border)] theme-text-muted"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filters
              </button>
            </div>
          </div>

          {/* Search bar */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search deals by name or partner code..."
            className="w-full theme-input rounded-lg px-4 py-2.5 font-body text-[13px] outline-none focus:border-brand-gold/40 transition-colors"
          />

          {/* Advanced filters */}
          {showFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 rounded-lg" style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)" }}>
              <div>
                <label className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-1 block">Partner Code</label>
                <input value={filterPartner} onChange={(e) => setFilterPartner(e.target.value)} placeholder="e.g. PTNABC" className="w-full theme-input rounded-lg px-3 py-2 font-body text-[12px] outline-none" />
              </div>
              <div>
                <label className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-1 block">Stage</label>
                <select value={filterStage} onChange={(e) => setFilterStage(e.target.value)} className="w-full theme-input rounded-lg px-3 py-2 font-body text-[12px] outline-none">
                  <option value="">All Stages</option>
                  <option value="new_lead">New Lead</option>
                  <option value="no_consultation">No Consultation Booked</option>
                  <option value="consultation_booked">Consultation Booked</option>
                  <option value="client_no_show">Client No Show</option>
                  <option value="client_engaged">Client Engaged</option>
                  <option value="in_process">In Process</option>
                  <option value="closedwon">Closed Won</option>
                  <option value="closedlost">Closed Lost</option>
                </select>
              </div>
              <div>
                <label className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-1 block">Min Deal Amount</label>
                <input type="number" value={filterMinAmount} onChange={(e) => setFilterMinAmount(e.target.value)} placeholder="$0" className="w-full theme-input rounded-lg px-3 py-2 font-body text-[12px] outline-none" />
              </div>
              <div>
                <label className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-1 block">Max Deal Amount</label>
                <input type="number" value={filterMaxAmount} onChange={(e) => setFilterMaxAmount(e.target.value)} placeholder="No max" className="w-full theme-input rounded-lg px-3 py-2 font-body text-[12px] outline-none" />
              </div>
              <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                <button onClick={() => { setFilterPartner(""); setFilterStage(""); setFilterMinAmount(""); setFilterMaxAmount(""); setSearch(""); }} className="font-body text-[11px] theme-text-muted hover:text-brand-gold transition-colors">
                  Clear All Filters
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Desktop table — 9 cols: Deal | Stage | Deal Amt | Firm Fee | Fintella 40% | Comm % | Comm $ | Fintella Net | Date */}
        <div className="hidden sm:block overflow-x-auto">
          <div className="grid grid-cols-[1.3fr_0.55fr_0.65fr_0.65fr_0.65fr_0.4fr_0.6fr_0.6fr_0.55fr] gap-2 px-5 py-3 min-w-[880px]" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <SortHeader label="Deal" sortKey="dealName" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} />
            <SortHeader label="Stage" sortKey="stage" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} />
            <SortHeader label="Deal Amt" sortKey="dealAmount" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} />
            <SortHeader label="Firm Fee" sortKey="firmFee" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} />
            <SortHeader label="Fintella 40%" sortKey="fintellaGross" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} />
            <SortHeader label="Comm %" sortKey="commRate" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} />
            <SortHeader label="Comm $" sortKey="commAmount" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} />
            <SortHeader label="Fintella Net" sortKey="fintellaNet" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} />
            <SortHeader label="Date" sortKey="date" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} />
          </div>
          {filtered.map((d) => {
            const firmFee = effectiveFirmFee(d);
            const fintellaGross = firmFee * FINTELLA_FEE_RATE;
            const partnerCommAmt = d.stage === "closedwon" ? partnerCommission(d) : projectedPartnerCommission(d);
            const fintellaNet = fintellaGross - partnerCommAmt;
            const rate = commissionRate(d);
            const isProjected = d.stage !== "closedwon";
            return (
              <div key={d.id} className="grid grid-cols-[1.3fr_0.55fr_0.65fr_0.65fr_0.65fr_0.4fr_0.6fr_0.6fr_0.55fr] gap-2 px-5 py-3 items-center min-w-[880px] hover:bg-[var(--app-hover)] transition-colors" style={{ borderBottom: "1px solid var(--app-border)" }}>
                <div>
                  <DealLink dealId={d.id} className="font-body text-[13px] font-medium truncate block">{d.dealName}</DealLink>
                  <PartnerLink partnerId={d.partnerId} className="font-mono text-[10px] theme-text-muted">{d.partnerCode}</PartnerLink>
                </div>
                <div className="text-center">
                  <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase ${stageBadge[d.stage] || stageBadge.new_lead}`}>
                    {d.stage.replace("_", " ")}
                  </span>
                </div>
                <div className="font-body text-[13px]">{fmt$(stageAwareRefund(d))}</div>
                <div className="font-body text-[13px] theme-text-secondary">{fmt$(firmFee)}</div>
                <div className="font-body text-[13px] text-brand-gold font-semibold">{fmt$(fintellaGross)}</div>
                <div className="font-body text-[13px] theme-text-secondary">
                  {rate != null ? `${(rate * 100).toFixed(0)}%` : "—"}
                </div>
                <div className={`font-body text-[13px] ${isProjected ? "text-red-400/60 italic" : "text-red-400"}`} title={isProjected ? "Projected — ledger not yet written" : "Actual ledger total"}>
                  -{fmt$(partnerCommAmt)}
                </div>
                <div className="font-display text-[13px] font-semibold text-green-400">{fmt$(fintellaNet)}</div>
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
            const firmFee = effectiveFirmFee(d);
            const fintellaGross = firmFee * FINTELLA_FEE_RATE;
            const partnerCommAmt = d.stage === "closedwon" ? partnerCommission(d) : projectedPartnerCommission(d);
            const fintellaNet = fintellaGross - partnerCommAmt;
            const rate = commissionRate(d);
            const isProjected = d.stage !== "closedwon";
            return (
              <div key={d.id} className="p-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <DealLink dealId={d.id} className="font-body text-[13px] font-medium">{d.dealName}</DealLink>
                  <span className={`shrink-0 inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase ${stageBadge[d.stage] || stageBadge.new_lead}`}>
                    {d.stage.replace("_", " ")}
                  </span>
                </div>
                <div className="font-body text-[11px] theme-text-muted mb-2">
                  Deal: {fmt$(stageAwareRefund(d))} · Fee: {fmt$(firmFee)} · {rate != null ? `${(rate * 100).toFixed(0)}% partner rate` : "no rate"}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="font-body text-[10px] theme-text-muted uppercase">Fintella 40%</div>
                    <div className="font-body text-[13px] text-brand-gold font-semibold">{fmt$(fintellaGross)}</div>
                  </div>
                  <div>
                    <div className="font-body text-[10px] theme-text-muted uppercase">Comm $</div>
                    <div className={`font-body text-[13px] ${isProjected ? "text-red-400/60 italic" : "text-red-400"}`}>-{fmt$(partnerCommAmt)}</div>
                  </div>
                  <div>
                    <div className="font-body text-[10px] theme-text-muted uppercase">Net</div>
                    <div className="font-display text-[13px] font-semibold text-green-400">{fmt$(fintellaNet)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Totals row — uses stage-aware helpers consistent with the table cells above */}
        {filtered.length > 0 && (
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderTop: "2px solid var(--app-border)" }}>
            <div className="font-body text-[12px] font-semibold theme-text-secondary">{filtered.length} deals</div>
            <div className="flex gap-4 sm:gap-6 text-right flex-wrap">
              <div>
                <div className="font-body text-[9px] theme-text-muted uppercase">Deal Total</div>
                <div className="font-body text-[13px] font-semibold">
                  {fmt$(filtered.reduce((sum, d) => sum + stageAwareRefund(d), 0))}
                </div>
              </div>
              <div>
                <div className="font-body text-[9px] theme-text-muted uppercase">Firm Fees</div>
                <div className="font-body text-[13px] theme-text-secondary font-semibold">
                  {fmt$(filtered.reduce((sum, d) => sum + effectiveFirmFee(d), 0))}
                </div>
              </div>
              <div>
                <div className="font-body text-[9px] theme-text-muted uppercase">Fintella 40%</div>
                <div className="font-body text-[13px] text-brand-gold font-semibold">
                  {fmt$(filtered.reduce((sum, d) => sum + effectiveFirmFee(d) * FINTELLA_FEE_RATE, 0))}
                </div>
              </div>
              <div>
                <div className="font-body text-[9px] theme-text-muted uppercase">Comm $</div>
                <div className="font-body text-[13px] text-red-400 font-semibold">
                  -{fmt$(filtered.reduce((sum, d) => sum + (d.stage === "closedwon" ? partnerCommission(d) : projectedPartnerCommission(d)), 0))}
                </div>
              </div>
              <div>
                <div className="font-body text-[9px] theme-text-muted uppercase">Net Revenue</div>
                <div className="font-display text-[13px] font-bold text-green-400">
                  {fmt$(filtered.reduce((sum, d) => {
                    const ff = effectiveFirmFee(d);
                    const partner = d.stage === "closedwon" ? partnerCommission(d) : projectedPartnerCommission(d);
                    return sum + ff * FINTELLA_FEE_RATE - partner;
                  }, 0))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      </section>
    </div>
  );
}
