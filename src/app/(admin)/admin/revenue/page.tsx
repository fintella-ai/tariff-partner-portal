"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { fmt$, fmtDate } from "@/lib/format";
import PartnerLink from "@/components/ui/PartnerLink";
import DealLink from "@/components/ui/DealLink";
import ReportingTabs from "@/components/ui/ReportingTabs";
import { useSession } from "next-auth/react";

type RevenueTab = "Revenue" | "Custom Commissions" | "Enterprise Reporting";

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

type SortDir = "asc" | "desc";
type SortKey = string;

function SortHeader({ label, sortKey, currentSort, currentDir, onSort }: {
  label: string; sortKey: string; currentSort: string; currentDir: SortDir; onSort: (key: string) => void;
}) {
  const isActive = currentSort === sortKey;
  return (
    <button onClick={() => onSort(sortKey)} className="flex items-center gap-1 font-body text-[10px] tracking-[1px] uppercase theme-text-muted hover:text-brand-gold transition-colors text-left">
      {label}
      <span className={`text-[8px] flex flex-col leading-none ${isActive ? "text-brand-gold" : "theme-text-faint"}`}>
        <span className={isActive && currentDir === "asc" ? "text-brand-gold" : ""}>&#9650;</span>
        <span className={isActive && currentDir === "desc" ? "text-brand-gold" : ""}>&#9660;</span>
      </span>
    </button>
  );
}

const FINTELLA_FEE_RATE = 0.40; // Fintella receives 40% of firm fee
const PARTNER_RATE = 0.25;  // Partners receive 25% of firm fee
const FINTELLA_NET_RATE = FINTELLA_FEE_RATE - PARTNER_RATE; // 15% net to Fintella

interface Deal {
  id: string;
  dealName: string;
  partnerCode: string;
  partnerId: string | null;
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
  no_consultation: "bg-red-500/10 text-red-400 border border-red-500/20",
  consultation_booked: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  client_no_show: "bg-red-500/10 text-red-400 border border-red-500/20",
  client_engaged: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  in_process: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  closedwon: "bg-green-500/10 text-green-400 border border-green-500/20",
  closedlost: "bg-red-500/10 text-red-400 border border-red-500/20",
};

export default function RevenuePage() {
  const { data: session } = useSession();
  const isSuperAdmin = (session?.user as any)?.role === "super_admin";
  const [activeTab, setActiveTab] = useState<RevenueTab>("Revenue");

  // Enterprise state
  const [enterprises, setEnterprises] = useState<EnterprisePartnerData[]>([]);
  const [epLoading, setEpLoading] = useState(false);
  const [showAddEP, setShowAddEP] = useState(false);
  const [newEPCode, setNewEPCode] = useState("");
  const [newEPRate, setNewEPRate] = useState("30");
  const [newEPNotes, setNewEPNotes] = useState("");
  const [newEPApplyAll, setNewEPApplyAll] = useState(false);
  const [epSubmitting, setEpSubmitting] = useState(false);
  const [addOverrideFor, setAddOverrideFor] = useState<string | null>(null);
  const [newL1Code, setNewL1Code] = useState("");
  const [expandedEP, setExpandedEP] = useState<string | null>(null);

  const fetchEnterprises = useCallback(() => {
    setEpLoading(true);
    fetch("/api/admin/enterprise")
      .then((r) => r.json())
      .then((data) => setEnterprises(data.enterprises || []))
      .catch(() => {})
      .finally(() => setEpLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab !== "Revenue") fetchEnterprises();
  }, [activeTab, fetchEnterprises]);

  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
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
      const getFirmFee = (d: Deal) => d.firmFeeAmount || d.estimatedRefundAmount * (d.firmFeeRate || 0.20);
      const getFintellaGross = (d: Deal) => getFirmFee(d) * FINTELLA_FEE_RATE;
      const getPartnerComm = (d: Deal) => d.l1CommissionAmount + d.l2CommissionAmount;
      const getFintellaNet = (d: Deal) => getFintellaGross(d) - getPartnerComm(d);

      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortKey) {
        case "dealName": aVal = a.dealName.toLowerCase(); bVal = b.dealName.toLowerCase(); break;
        case "stage": aVal = a.stage; bVal = b.stage; break;
        case "dealAmount": aVal = a.estimatedRefundAmount; bVal = b.estimatedRefundAmount; break;
        case "firmFee": aVal = getFirmFee(a); bVal = getFirmFee(b); break;
        case "fintellaGross": aVal = getFintellaGross(a); bVal = getFintellaGross(b); break;
        case "partnerComm": aVal = getPartnerComm(a); bVal = getPartnerComm(b); break;
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

  // Closed Won (realized revenue)
  const totalDealAmountWon = closedWonDeals.reduce((sum, d) => sum + d.estimatedRefundAmount, 0);
  const totalFirmFeesWon = closedWonDeals.reduce((sum, d) => sum + d.firmFeeAmount, 0);
  const totalFintellaGrossWon = totalFirmFeesWon * FINTELLA_FEE_RATE;
  const totalPartnerCommWon = closedWonDeals.reduce((sum, d) => sum + d.l1CommissionAmount + d.l2CommissionAmount, 0);
  const totalFintellaNetWon = totalFintellaGrossWon - totalPartnerCommWon;

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
  const totalFintellaGrossPipeline = totalFirmFeesPipeline * FINTELLA_FEE_RATE;
  const totalPartnerCommPipeline = totalFirmFeesPipeline * PARTNER_RATE;
  const totalFintellaNetPipeline = totalFintellaGrossPipeline - totalPartnerCommPipeline;

  // All deals
  const totalFirmFeesAll = totalFirmFeesWon + totalFirmFeesPipeline;
  const totalFintellaGrossAll = totalFirmFeesAll * FINTELLA_FEE_RATE;
  const totalFintellaNetAll = totalFintellaGrossAll - totalPartnerCommWon - totalPartnerCommPipeline;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="font-body text-sm theme-text-muted">Loading revenue data...</div>
      </div>
    );
  }

  return (
    <div>
      <ReportingTabs />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="font-display text-[22px] font-bold mb-1">Company Revenue</h2>
          <p className="font-body text-[13px] theme-text-muted">
            Fintella receives {Math.round(FINTELLA_FEE_RATE * 100)}% of firm fees. Partner field receives {Math.round(PARTNER_RATE * 100)}%. Net to Fintella: {Math.round(FINTELLA_NET_RATE * 100)}%.
          </p>
        </div>
      </div>

      {/* ═══ TABS ═══ */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {(["Revenue", "Custom Commissions", "Enterprise Reporting"] as RevenueTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`font-body text-sm px-4 py-2 rounded-full whitespace-nowrap transition ${
              activeTab === t
                ? "bg-brand-gold/20 text-brand-gold"
                : "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {activeTab === "Revenue" && (<>
      {/* ═══ REVENUE SUMMARY ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
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
          <div className="font-body text-[9px] tracking-[1.5px] uppercase theme-text-muted mb-2">Partner Commissions (25%)</div>
          <div className="font-display text-xl sm:text-2xl font-bold text-red-400">-{fmt$(totalPartnerCommWon)}</div>
          <div className="font-body text-[10px] theme-text-muted mt-1">
            <span className="text-green-400">{fmt$(commPaid)} paid</span> · <span className="text-yellow-400">{fmt$(commPending)} pending</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="font-body text-[9px] tracking-[1.5px] uppercase theme-text-muted mb-2">Fintella Net Revenue (15%)</div>
          <div className="font-display text-xl sm:text-2xl font-bold text-green-400">{fmt$(totalFintellaNetWon)}</div>
          <div className="font-body text-[10px] theme-text-muted mt-1">After partner commissions</div>
        </div>
        <div className="stat-card">
          <div className="font-body text-[9px] tracking-[1.5px] uppercase theme-text-muted mb-2">Pipeline (Projected)</div>
          <div className="font-display text-xl sm:text-2xl font-bold text-blue-400">{fmt$(totalFintellaNetPipeline)}</div>
          <div className="font-body text-[10px] theme-text-muted mt-1">{pipelineDeals.length} active deals</div>
        </div>
      </div>

      {/* ═══ BREAKDOWN CARD ═══ */}
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
          <div className="flex items-center justify-between py-3 rounded-lg px-3 bg-green-500/5 border border-green-500/15">
            <span className="font-body text-[14px] font-semibold text-green-400">Fintella Net Revenue</span>
            <span className="font-display text-lg font-bold text-green-400">{fmt$(totalFintellaNetWon)}</span>
          </div>
        </div>
      </div>

      {/* ═══ DEAL-BY-DEAL TABLE ═══ */}
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

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <div className="grid grid-cols-[1.4fr_0.6fr_0.7fr_0.7fr_0.7fr_0.6fr_0.6fr_0.6fr] gap-2 px-5 py-3 min-w-[800px]" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <SortHeader label="Deal" sortKey="dealName" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} />
            <SortHeader label="Stage" sortKey="stage" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} />
            <SortHeader label="Deal Amt" sortKey="dealAmount" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} />
            <SortHeader label="Firm Fee" sortKey="firmFee" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} />
            <SortHeader label="Fintella 40%" sortKey="fintellaGross" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} />
            <SortHeader label="Partner 25%" sortKey="partnerComm" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} />
            <SortHeader label="Fintella Net" sortKey="fintellaNet" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} />
            <SortHeader label="Date" sortKey="date" currentSort={sortKey} currentDir={sortDir} onSort={toggleSort} />
          </div>
          {filtered.map((d) => {
            const firmFee = d.firmFeeAmount || d.estimatedRefundAmount * (d.firmFeeRate || 0.20);
            const fintellaGross = firmFee * FINTELLA_FEE_RATE;
            const partnerComm = d.l1CommissionAmount + d.l2CommissionAmount;
            const fintellaNet = fintellaGross - partnerComm;
            return (
              <div key={d.id} className="grid grid-cols-[1.4fr_0.6fr_0.7fr_0.7fr_0.7fr_0.6fr_0.6fr_0.6fr] gap-2 px-5 py-3 items-center min-w-[800px] hover:bg-[var(--app-hover)] transition-colors" style={{ borderBottom: "1px solid var(--app-border)" }}>
                <div>
                  <DealLink dealId={d.id} className="font-body text-[13px] font-medium truncate block">{d.dealName}</DealLink>
                  <PartnerLink partnerId={d.partnerId} className="font-mono text-[10px] theme-text-muted">{d.partnerCode}</PartnerLink>
                </div>
                <div className="text-center">
                  <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase ${stageBadge[d.stage] || stageBadge.new_lead}`}>
                    {d.stage.replace("_", " ")}
                  </span>
                </div>
                <div className="font-body text-[13px]">{fmt$(d.estimatedRefundAmount)}</div>
                <div className="font-body text-[13px] theme-text-secondary">{fmt$(firmFee)}</div>
                <div className="font-body text-[13px] text-brand-gold font-semibold">{fmt$(fintellaGross)}</div>
                <div className="font-body text-[13px] text-red-400">-{fmt$(partnerComm)}</div>
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
            const firmFee = d.firmFeeAmount || d.estimatedRefundAmount * (d.firmFeeRate || 0.20);
            const fintellaGross = firmFee * FINTELLA_FEE_RATE;
            const partnerComm = d.l1CommissionAmount + d.l2CommissionAmount;
            const fintellaNet = fintellaGross - partnerComm;
            return (
              <div key={d.id} className="p-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <DealLink dealId={d.id} className="font-body text-[13px] font-medium">{d.dealName}</DealLink>
                  <span className={`shrink-0 inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase ${stageBadge[d.stage] || stageBadge.new_lead}`}>
                    {d.stage.replace("_", " ")}
                  </span>
                </div>
                <div className="font-body text-[11px] theme-text-muted mb-2">Deal: {fmt$(d.estimatedRefundAmount)} · Fee: {fmt$(firmFee)}</div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="font-body text-[10px] theme-text-muted uppercase">Fintella 40%</div>
                    <div className="font-body text-[13px] text-brand-gold font-semibold">{fmt$(fintellaGross)}</div>
                  </div>
                  <div>
                    <div className="font-body text-[10px] theme-text-muted uppercase">Partner</div>
                    <div className="font-body text-[13px] text-red-400">-{fmt$(partnerComm)}</div>
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

        {/* Totals row */}
        {filtered.length > 0 && (
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderTop: "2px solid var(--app-border)" }}>
            <div className="font-body text-[12px] font-semibold theme-text-secondary">{filtered.length} deals</div>
            <div className="flex gap-4 sm:gap-6 text-right flex-wrap">
              <div>
                <div className="font-body text-[9px] theme-text-muted uppercase">Deal Total</div>
                <div className="font-body text-[13px] font-semibold">
                  {fmt$(filtered.reduce((sum, d) => sum + d.estimatedRefundAmount, 0))}
                </div>
              </div>
              <div>
                <div className="font-body text-[9px] theme-text-muted uppercase">Firm Fees</div>
                <div className="font-body text-[13px] theme-text-secondary font-semibold">
                  {fmt$(filtered.reduce((sum, d) => sum + (d.firmFeeAmount || d.estimatedRefundAmount * (d.firmFeeRate || 0.20)), 0))}
                </div>
              </div>
              <div>
                <div className="font-body text-[9px] theme-text-muted uppercase">Fintella 40%</div>
                <div className="font-body text-[13px] text-brand-gold font-semibold">
                  {fmt$(filtered.reduce((sum, d) => sum + (d.firmFeeAmount || d.estimatedRefundAmount * (d.firmFeeRate || 0.20)) * FINTELLA_FEE_RATE, 0))}
                </div>
              </div>
              <div>
                <div className="font-body text-[9px] theme-text-muted uppercase">Net Revenue</div>
                <div className="font-display text-[13px] font-bold text-green-400">
                  {fmt$(filtered.reduce((sum, d) => {
                    const ff = d.firmFeeAmount || d.estimatedRefundAmount * (d.firmFeeRate || 0.20);
                    return sum + ff * FINTELLA_FEE_RATE - d.l1CommissionAmount - d.l2CommissionAmount;
                  }, 0))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      </>)}

      {/* ═══ CUSTOM COMMISSIONS TAB ═══ */}
      {activeTab === "Custom Commissions" && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-display text-lg font-bold mb-1">Enterprise Partners</h3>
              <p className="font-body text-[13px] theme-text-muted">
                Enterprise partners earn a custom override above the standard 25% L1 rate on all L1 partners placed under them.
              </p>
            </div>
            {isSuperAdmin && (
              <button onClick={() => setShowAddEP(!showAddEP)} className="btn-gold text-[12px] px-4 py-2.5 shrink-0">
                {showAddEP ? "Cancel" : "+ Add Enterprise Partner"}
              </button>
            )}
          </div>

          {!isSuperAdmin && (
            <div className="card p-6 text-center mb-6">
              <div className="font-body text-sm theme-text-muted">Only super admins can manage enterprise partners. Contact your super admin for changes.</div>
            </div>
          )}

          {/* Add Enterprise Partner form */}
          {showAddEP && isSuperAdmin && (
            <div className="card p-5 mb-6">
              <div className="font-body font-semibold text-sm mb-4">Add New Enterprise Partner</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="font-body text-[11px] tracking-[1px] uppercase theme-text-secondary mb-2 block">Partner Code *</label>
                  <input
                    className="w-full theme-input rounded-lg px-4 py-3 font-body text-sm outline-none focus:border-brand-gold/40 transition-colors"
                    placeholder="e.g. PTN4R7K9X"
                    value={newEPCode}
                    onChange={(e) => setNewEPCode(e.target.value.toUpperCase())}
                  />
                </div>
                <div>
                  <label className="font-body text-[11px] tracking-[1px] uppercase theme-text-secondary mb-2 block">Total Commission Rate *</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      className="w-full theme-input rounded-lg px-4 py-3 font-body text-sm outline-none focus:border-brand-gold/40 transition-colors"
                      placeholder="30"
                      value={newEPRate}
                      onChange={(e) => setNewEPRate(e.target.value)}
                      min="26"
                      max="100"
                    />
                    <span className="font-body text-sm theme-text-muted shrink-0">%</span>
                  </div>
                  <div className="font-body text-[10px] theme-text-muted mt-1">
                    Override: {Math.max(0, parseFloat(newEPRate || "0") - 25)}% above standard 25%
                  </div>
                </div>
                <div>
                  <label className="font-body text-[11px] tracking-[1px] uppercase theme-text-secondary mb-2 block">Notes</label>
                  <input
                    className="w-full theme-input rounded-lg px-4 py-3 font-body text-sm outline-none focus:border-brand-gold/40 transition-colors"
                    placeholder="Optional notes..."
                    value={newEPNotes}
                    onChange={(e) => setNewEPNotes(e.target.value)}
                  />
                </div>
              </div>
              <label className="flex items-center gap-3 mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newEPApplyAll}
                  onChange={(e) => setNewEPApplyAll(e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--app-border)] accent-brand-gold"
                />
                <div>
                  <div className="font-body text-sm text-[var(--app-text)]">Apply to All Partners</div>
                  <div className="font-body text-[11px] theme-text-muted">Override applies to ALL partner deals in the portal (no need to add individual partner codes)</div>
                </div>
              </label>
              <button
                onClick={async () => {
                  if (!newEPCode.trim()) return alert("Partner code is required");
                  const rate = parseFloat(newEPRate);
                  if (isNaN(rate) || rate <= 25) return alert("Rate must be higher than 25%");
                  setEpSubmitting(true);
                  try {
                    const res = await fetch("/api/admin/enterprise", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "create", partnerCode: newEPCode.trim(), totalRate: rate / 100, applyToAll: newEPApplyAll, notes: newEPNotes || null }),
                    });
                    const data = await res.json();
                    if (!res.ok) { alert(data.error || "Failed"); return; }
                    setShowAddEP(false);
                    setNewEPCode("");
                    setNewEPRate("30");
                    setNewEPNotes("");
                    setNewEPApplyAll(false);
                    fetchEnterprises();
                  } catch { alert("Network error"); }
                  finally { setEpSubmitting(false); }
                }}
                disabled={epSubmitting}
                className="btn-gold text-sm px-6 py-2 disabled:opacity-50"
              >
                {epSubmitting ? "Creating..." : "Create Enterprise Partner"}
              </button>
            </div>
          )}

          {/* Enterprise Partners List */}
          {epLoading ? (
            <div className="card p-8 text-center"><div className="font-body text-sm theme-text-muted">Loading enterprise partners...</div></div>
          ) : enterprises.length === 0 ? (
            <div className="card p-12 text-center">
              <div className="font-body text-sm theme-text-muted">No enterprise partners yet.</div>
              {isSuperAdmin && <div className="font-body text-xs theme-text-faint mt-2">Click &quot;Add Enterprise Partner&quot; to create one.</div>}
            </div>
          ) : (
            <div className="space-y-4">
              {enterprises.map((ep) => (
                <div key={ep.id} className="card">
                  {/* Enterprise Partner Header */}
                  <div className="px-5 py-4 border-b border-[var(--app-border)] cursor-pointer" onClick={() => setExpandedEP(expandedEP === ep.id ? null : ep.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <PartnerLink partnerId={ep.partnerId} className="font-body text-[15px] font-semibold text-[var(--app-text)]">
                            {ep.partnerName}
                          </PartnerLink>
                          <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase ${
                            ep.status === "terminated"
                              ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                              : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                          }`}>
                            {ep.status === "terminated" ? "Terminated" : "Enterprise"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs theme-text-muted">
                          <span>{ep.partnerCode}</span>
                          <span>&middot;</span>
                          <span className="text-brand-gold font-semibold">{Math.round(ep.totalRate * 100)}% total</span>
                          <span>&middot;</span>
                          <span className="text-purple-400 font-semibold">{Math.round(ep.overrideRate * 100)}% override</span>
                          <span>&middot;</span>
                          <span>{ep.applyToAll ? "All Partners" : `${ep.overrides.filter((o) => o.status === "active").length} L1 partners`}</span>
                          {ep.applyToAll && <span className="inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase bg-green-500/10 text-green-400 border border-green-500/20 ml-1">GLOBAL</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-display text-lg font-bold text-brand-gold">{fmt$(ep.summary.totalOverrideEarnings)}</div>
                        <div className="font-body text-[10px] theme-text-muted">override earnings</div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expandedEP === ep.id && (
                    <div className="px-5 py-4">
                      {/* Apply to All toggle (for existing EP) */}
                      {isSuperAdmin && (
                        <label className="flex items-center gap-3 mb-4 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ep.applyToAll}
                            onChange={async (e) => {
                              await fetch("/api/admin/enterprise", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ action: "update", partnerCode: ep.partnerCode, applyToAll: e.target.checked }),
                              });
                              fetchEnterprises();
                            }}
                            className="w-4 h-4 rounded border-[var(--app-border)] accent-brand-gold"
                          />
                          <div>
                            <div className="font-body text-sm text-[var(--app-text)]">Apply to All Partners</div>
                            <div className="font-body text-[11px] theme-text-muted">Override on ALL partner deals in the portal</div>
                          </div>
                        </label>
                      )}

                      {/* Assigned L1 Partners (hidden when applyToAll) */}
                      {!ep.applyToAll && (
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="font-body text-[11px] tracking-[1.5px] uppercase theme-text-muted">Assigned L1 Partners</div>
                          {isSuperAdmin && (
                            <button onClick={() => setAddOverrideFor(addOverrideFor === ep.partnerCode ? null : ep.partnerCode)} className="font-body text-[11px] text-brand-gold hover:underline">
                              + Add L1 Partner
                            </button>
                          )}
                        </div>

                        {/* Add L1 form */}
                        {addOverrideFor === ep.partnerCode && isSuperAdmin && (
                          <div className="flex gap-2 mb-3">
                            <input
                              className="flex-1 theme-input rounded-lg px-3 py-2 font-body text-sm outline-none focus:border-brand-gold/40"
                              placeholder="L1 Partner Code..."
                              value={newL1Code}
                              onChange={(e) => setNewL1Code(e.target.value.toUpperCase())}
                            />
                            <button
                              onClick={async () => {
                                if (!newL1Code.trim()) return;
                                try {
                                  const res = await fetch("/api/admin/enterprise", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ action: "add_override", enterprisePartnerCode: ep.partnerCode, l1PartnerCode: newL1Code.trim() }),
                                  });
                                  const data = await res.json();
                                  if (!res.ok) { alert(data.error || "Failed"); return; }
                                  setNewL1Code("");
                                  setAddOverrideFor(null);
                                  fetchEnterprises();
                                } catch { alert("Network error"); }
                              }}
                              className="btn-gold text-xs px-4 py-2"
                            >
                              Add
                            </button>
                          </div>
                        )}

                        {ep.overrides.filter((o) => o.status === "active").length === 0 ? (
                          <div className="font-body text-xs theme-text-muted py-2">No L1 partners assigned yet.</div>
                        ) : (
                          <div className="space-y-1">
                            {ep.overrides.filter((o) => o.status === "active").map((o) => (
                              <div key={o.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[var(--app-card-bg)] transition-colors">
                                <div className="flex items-center gap-3">
                                  <PartnerLink partnerId={o.l1PartnerId} className="font-body text-sm text-[var(--app-text)]">
                                    {o.l1PartnerName}
                                  </PartnerLink>
                                  <span className="font-body text-[10px] theme-text-muted tracking-wider">{o.l1PartnerCode}</span>
                                  <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[9px] tracking-wider uppercase ${
                                    o.l1PartnerStatus === "active" ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"
                                  }`}>
                                    {o.l1PartnerStatus}
                                  </span>
                                </div>
                                {isSuperAdmin && (
                                  <button
                                    onClick={async () => {
                                      if (!confirm(`Remove ${o.l1PartnerName} from ${ep.partnerName}'s enterprise overrides?`)) return;
                                      await fetch("/api/admin/enterprise", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ action: "remove_override", overrideId: o.id }),
                                      });
                                      fetchEnterprises();
                                    }}
                                    className="font-body text-[10px] text-red-400/60 hover:text-red-400 transition-colors"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      )}

                      {ep.applyToAll && (
                        <div className="mb-4 p-3 rounded-lg bg-green-500/5 border border-green-500/10">
                          <div className="font-body text-sm text-green-400 font-semibold mb-0.5">Global Override Active</div>
                          <div className="font-body text-[11px] theme-text-muted">This enterprise partner earns a {Math.round(ep.overrideRate * 100)}% override on ALL partner deals in the portal.</div>
                        </div>
                      )}

                      {/* Summary stats */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                        {[
                          { label: "Total Deals", value: ep.summary.totalDeals },
                          { label: "Closed Won", value: ep.summary.closedWonDeals },
                          { label: "Override Earnings", value: fmt$(ep.summary.totalOverrideEarnings), highlight: true },
                          { label: "Deal Volume", value: fmt$(ep.summary.totalDealAmount) },
                        ].map((s) => (
                          <div key={s.label} className="card px-3 py-2.5">
                            <div className="font-body text-[10px] theme-text-muted uppercase tracking-wider mb-1">{s.label}</div>
                            <div className={`font-display text-lg font-bold ${s.highlight ? "text-purple-400" : "text-brand-gold"}`}>{s.value}</div>
                          </div>
                        ))}
                      </div>

                      {ep.notes && (
                        <div className="font-body text-xs theme-text-muted italic mb-4">Note: {ep.notes}</div>
                      )}

                      {/* Remove / Terminate actions */}
                      {isSuperAdmin && (
                        <div className="flex gap-3 pt-3 mt-3" style={{ borderTop: "1px solid var(--app-border)" }}>
                          {ep.status === "active" && (
                            <button
                              onClick={async () => {
                                if (!confirm(`Terminate enterprise status for ${ep.partnerName}?\n\nThis will STOP all future override tracking but KEEP all historical data and past earnings.`)) return;
                                await fetch("/api/admin/enterprise", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ action: "update", partnerCode: ep.partnerCode, status: "terminated" }),
                                });
                                fetchEnterprises();
                              }}
                              className="font-body text-[11px] text-yellow-400 border border-yellow-400/20 rounded-lg px-4 py-2 hover:bg-yellow-400/10 transition-colors"
                            >
                              Terminate (Keep Data)
                            </button>
                          )}
                          {ep.status === "terminated" && (
                            <button
                              onClick={async () => {
                                if (!confirm(`Reactivate enterprise status for ${ep.partnerName}?`)) return;
                                await fetch("/api/admin/enterprise", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ action: "update", partnerCode: ep.partnerCode, status: "active" }),
                                });
                                fetchEnterprises();
                              }}
                              className="font-body text-[11px] text-green-400 border border-green-400/20 rounded-lg px-4 py-2 hover:bg-green-400/10 transition-colors"
                            >
                              Reactivate
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              if (!confirm(`PERMANENTLY REMOVE ${ep.partnerName} as an enterprise partner?\n\nThis will DELETE all enterprise tracking data, override records, and earnings history. This cannot be undone.`)) return;
                              if (!confirm(`Are you absolutely sure? Type the partner code to confirm.\n\nThis action is IRREVERSIBLE.`)) return;
                              await fetch("/api/admin/enterprise", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ action: "delete", partnerCode: ep.partnerCode }),
                              });
                              fetchEnterprises();
                            }}
                            className="font-body text-[11px] text-red-400/60 border border-red-400/15 rounded-lg px-4 py-2 hover:bg-red-400/10 hover:text-red-400 transition-colors"
                          >
                            Remove (Delete All Data)
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ ENTERPRISE REPORTING TAB ═══ */}
      {activeTab === "Enterprise Reporting" && (
        <div>
          <h3 className="font-display text-lg font-bold mb-1">Enterprise Reporting & Payouts</h3>
          <p className="font-body text-[13px] theme-text-muted mb-6">
            Deal-level breakdown showing Fintella 40% share, L1 partner commission, enterprise override, and net company profit after all payouts.
          </p>

          {epLoading ? (
            <div className="card p-8 text-center"><div className="font-body text-sm theme-text-muted">Loading...</div></div>
          ) : enterprises.filter((e) => e.status === "active").length === 0 ? (
            <div className="card p-12 text-center">
              <div className="font-body text-sm theme-text-muted">No active enterprise partners. Add one in the Custom Commissions tab.</div>
            </div>
          ) : (
            <div className="space-y-6">
              {enterprises.filter((e) => e.status === "active").map((ep) => {
                const activeDeals = ep.dealBreakdown;
                const totalOverride = ep.summary.totalOverrideEarnings;
                const totalL1Comm = activeDeals.reduce((s, d) => s + d.l1Commission, 0);
                const totalFintellaGross = activeDeals.reduce((s, d) => s + d.fintellaGross, 0);
                const totalNetAfterAll = activeDeals.reduce((s, d) => s + d.fintellaNetAfterEnterprise, 0);

                return (
                  <div key={ep.id} className="card">
                    <div className="px-5 py-4 border-b border-[var(--app-border)]">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <PartnerLink partnerId={ep.partnerId} className="font-body text-[15px] font-semibold text-[var(--app-text)]">{ep.partnerName}</PartnerLink>
                            <span className="font-body text-xs text-purple-400 font-semibold">{Math.round(ep.totalRate * 100)}% ({Math.round(ep.overrideRate * 100)}% override)</span>
                          </div>
                          <div className="font-body text-[11px] theme-text-muted mt-0.5">{ep.partnerCode} &middot; {activeDeals.length} deals across {ep.overrides.filter((o) => o.status === "active").length} L1 partners</div>
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

                    {/* Deal breakdown table - Desktop */}
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

                        {/* Mobile cards */}
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
      )}
    </div>
  );
}
