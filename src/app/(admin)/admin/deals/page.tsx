"use client";

import { useState, useEffect, useCallback } from "react";
import { fmt$, fmtDate } from "@/lib/format";
import StageBadge from "@/components/ui/StageBadge";
import StatusBadge from "@/components/ui/StatusBadge";

const STAGES = [
  { value: "all", label: "All Stages" },
  { value: "new_lead", label: "New Lead" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "consultation_booked", label: "Consultation Booked" },
  { value: "engaged", label: "Engaged" },
  { value: "closedwon", label: "Closed Won" },
  { value: "closedlost", label: "Closed Lost" },
];

const COMMISSION_STATUSES = ["pending", "due", "approved", "paid"];

type Deal = {
  id: string;
  dealName: string;
  partnerCode: string;
  partnerName: string;
  // Client contact
  clientFirstName: string | null;
  clientLastName: string | null;
  clientName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  clientTitle: string | null;
  // Form submission data
  serviceOfInterest: string | null;
  legalEntityName: string | null;
  businessCity: string | null;
  businessState: string | null;
  importsGoods: string | null;
  importCountries: string | null;
  annualImportValue: string | null;
  importerOfRecord: string | null;
  affiliateNotes: string | null;
  // Deal tracking
  stage: string;
  productType: string | null;
  importedProducts: string | null;
  estimatedRefundAmount: number;
  firmFeeRate: number | null;
  firmFeeAmount: number;
  l1CommissionAmount: number;
  l1CommissionStatus: string;
  l2CommissionAmount: number;
  l2CommissionStatus: string;
  notes: string | null;
  createdAt: string;
};

type SortField = "dealName" | "estimatedRefundAmount" | "firmFeeAmount" | "l1CommissionAmount" | "createdAt" | "stage";

export default function AdminDealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [partnerFilter, setPartnerFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [partners, setPartners] = useState<{ partnerCode: string; firstName: string; lastName: string }[]>([]);

  // Expanded deal for editing
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editStage, setEditStage] = useState("");
  const [editL1Status, setEditL1Status] = useState("");
  const [editL2Status, setEditL2Status] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const fetchDeals = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (stageFilter !== "all") params.set("stage", stageFilter);
      if (partnerFilter) params.set("partner", partnerFilter);
      if (search) params.set("search", search);

      const res = await fetch(`/api/admin/deals?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setDeals(data.deals || []);
        setStats(data.stats || null);
        setPartners(data.partners || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [stageFilter, partnerFilter, search]);

  useEffect(() => { fetchDeals(); }, [fetchDeals]);

  // Sort deals
  const sorted = [...deals].sort((a, b) => {
    let aVal: any = a[sortField];
    let bVal: any = b[sortField];
    if (typeof aVal === "string") aVal = aVal.toLowerCase();
    if (typeof bVal === "string") bVal = bVal.toLowerCase();
    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  // Expand deal for editing
  const toggleExpand = (deal: Deal) => {
    if (expandedId === deal.id) {
      setExpandedId(null);
    } else {
      setExpandedId(deal.id);
      setEditStage(deal.stage);
      setEditL1Status(deal.l1CommissionStatus);
      setEditL2Status(deal.l2CommissionStatus);
      setEditNotes(deal.notes || "");
    }
  };

  const handleUpdateDeal = async (dealId: string) => {
    try {
      await fetch(`/api/admin/deals/${dealId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: editStage,
          l1CommissionStatus: editL1Status,
          l2CommissionStatus: editL2Status,
          notes: editNotes,
        }),
      });
      setExpandedId(null);
      fetchDeals();
    } catch {}
  };

  const handleDeleteDeal = async (dealId: string, dealName: string) => {
    if (!confirm(`Delete deal "${dealName}"?`)) return;
    try {
      await fetch(`/api/admin/deals/${dealId}`, { method: "DELETE" });
      fetchDeals();
    } catch {}
  };

  const inputClass = "bg-white/5 border border-white/[0.12] rounded-lg px-3 py-2 text-white font-body text-sm outline-none focus:border-brand-gold/40 transition-colors placeholder:text-white/30";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="font-body text-sm text-white/40">Loading deals...</div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-display text-xl font-bold mb-1">Deal Management</h2>
      <p className="font-body text-[13px] text-white/40 mb-6">View, filter, and manage all deals across partners.</p>

      {/* ═══ STATS ═══ */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="card p-4">
            <div className="font-body text-[11px] text-white/30 uppercase tracking-wider mb-1">Total Deals</div>
            <div className="font-display text-2xl font-bold">{stats.totalDeals}</div>
          </div>
          <div className="card p-4">
            <div className="font-body text-[11px] text-white/30 uppercase tracking-wider mb-1">Refund Pipeline</div>
            <div className="font-display text-2xl font-bold text-blue-400">{fmt$(stats.totalRefundPipeline)}</div>
          </div>
          <div className="card p-4">
            <div className="font-body text-[11px] text-white/30 uppercase tracking-wider mb-1">Total Firm Fees</div>
            <div className="font-display text-2xl font-bold text-green-400">{fmt$(stats.totalFirmFees)}</div>
          </div>
          <div className="card p-4">
            <div className="font-body text-[11px] text-white/30 uppercase tracking-wider mb-1">Total Commissions</div>
            <div className="font-display text-2xl font-bold text-brand-gold">{fmt$(stats.totalCommissions)}</div>
          </div>
        </div>
      )}

      {/* ═══ STAGE PIPELINE ═══ */}
      {stats?.byStage && (
        <div className="card p-4 sm:p-5 mb-6">
          <div className="font-body font-semibold text-sm mb-3">Deal Pipeline</div>
          <div className="flex flex-wrap gap-2">
            {STAGES.filter((s) => s.value !== "all").map((s) => {
              const count = stats.byStage[s.value] || 0;
              return (
                <button
                  key={s.value}
                  onClick={() => setStageFilter(stageFilter === s.value ? "all" : s.value)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-body text-[12px] transition-colors border ${
                    stageFilter === s.value
                      ? "bg-brand-gold/20 text-brand-gold border-brand-gold/30"
                      : "bg-white/[0.03] text-white/50 border-white/[0.06] hover:bg-white/[0.06]"
                  }`}
                >
                  <StageBadge stage={s.value} />
                  <span className="font-semibold">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ FILTERS ═══ */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          className={`${inputClass} flex-1`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search deals, clients, partners..."
        />
        <select
          className={`${inputClass} w-full sm:w-48`}
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
        >
          {STAGES.map((s) => (
            <option key={s.value} value={s.value} className="bg-brand-dark">{s.label}</option>
          ))}
        </select>
        <select
          className={`${inputClass} w-full sm:w-48`}
          value={partnerFilter}
          onChange={(e) => setPartnerFilter(e.target.value)}
        >
          <option value="" className="bg-brand-dark">All Partners</option>
          {partners.map((p) => (
            <option key={p.partnerCode} value={p.partnerCode} className="bg-brand-dark">
              {p.firstName} {p.lastName}
            </option>
          ))}
        </select>
      </div>

      {/* ═══ RESULTS COUNT ═══ */}
      <div className="font-body text-[12px] text-white/30 mb-3">
        Showing {sorted.length} deal{sorted.length !== 1 ? "s" : ""}
        {stageFilter !== "all" ? ` in ${STAGES.find((s) => s.value === stageFilter)?.label}` : ""}
        {partnerFilter ? ` for ${partners.find((p) => p.partnerCode === partnerFilter)?.firstName || partnerFilter}` : ""}
      </div>

      {/* ═══ DESKTOP TABLE ═══ */}
      <div className="card hidden md:block">
        {/* Header */}
        <div className="grid grid-cols-[1.5fr_1fr_0.8fr_0.8fr_0.8fr_0.8fr_0.6fr] gap-3 px-5 py-3 border-b border-white/[0.06]">
          <button onClick={() => toggleSort("dealName")} className="font-body text-[11px] text-white/30 uppercase tracking-wider text-left hover:text-white/50">
            Deal{sortIcon("dealName")}
          </button>
          <div className="font-body text-[11px] text-white/30 uppercase tracking-wider">Partner</div>
          <button onClick={() => toggleSort("stage")} className="font-body text-[11px] text-white/30 uppercase tracking-wider text-left hover:text-white/50">
            Stage{sortIcon("stage")}
          </button>
          <button onClick={() => toggleSort("estimatedRefundAmount")} className="font-body text-[11px] text-white/30 uppercase tracking-wider text-left hover:text-white/50">
            Refund{sortIcon("estimatedRefundAmount")}
          </button>
          <button onClick={() => toggleSort("firmFeeAmount")} className="font-body text-[11px] text-white/30 uppercase tracking-wider text-left hover:text-white/50">
            Firm Fee{sortIcon("firmFeeAmount")}
          </button>
          <button onClick={() => toggleSort("l1CommissionAmount")} className="font-body text-[11px] text-white/30 uppercase tracking-wider text-left hover:text-white/50">
            Commission{sortIcon("l1CommissionAmount")}
          </button>
          <button onClick={() => toggleSort("createdAt")} className="font-body text-[11px] text-white/30 uppercase tracking-wider text-right hover:text-white/50">
            Date{sortIcon("createdAt")}
          </button>
        </div>

        {sorted.map((deal) => (
          <div key={deal.id}>
            <div
              className="grid grid-cols-[1.5fr_1fr_0.8fr_0.8fr_0.8fr_0.8fr_0.6fr] gap-3 px-5 py-3.5 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02] transition-colors items-center cursor-pointer"
              onClick={() => toggleExpand(deal)}
            >
              <div>
                <div className="font-body text-[13px] text-white/80 font-medium truncate">{deal.dealName}</div>
                <div className="font-body text-[11px] text-white/30 truncate">{deal.clientName || deal.clientEmail || "—"}</div>
              </div>
              <div className="font-body text-[12px] text-white/50 truncate">{deal.partnerName}</div>
              <div><StageBadge stage={deal.stage} /></div>
              <div className="font-body text-[13px] text-white/80">{fmt$(deal.estimatedRefundAmount)}</div>
              <div className="font-body text-[13px] text-white/60">{fmt$(deal.firmFeeAmount)}</div>
              <div className="font-display text-[14px] font-semibold text-brand-gold">{fmt$(deal.l1CommissionAmount)}</div>
              <div className="font-body text-[12px] text-white/40 text-right">{fmtDate(deal.createdAt)}</div>
            </div>

            {/* Expanded detail + edit panel */}
            {expandedId === deal.id && (
              <div className="px-5 py-4 bg-white/[0.02] border-b border-white/[0.06]">
                {/* ── Form Submission Data ── */}
                <div className="mb-4 pb-4 border-b border-white/[0.06]">
                  <div className="font-body text-[11px] text-white/30 uppercase tracking-wider mb-3">Client Submission Details</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2.5">
                    {[
                      { label: "Contact Name", value: [deal.clientFirstName, deal.clientLastName].filter(Boolean).join(" ") || deal.clientName },
                      { label: "Email", value: deal.clientEmail },
                      { label: "Phone", value: deal.clientPhone },
                      { label: "Business Title", value: deal.clientTitle },
                      { label: "Service of Interest", value: deal.serviceOfInterest },
                      { label: "Legal Entity", value: deal.legalEntityName },
                      { label: "City", value: deal.businessCity },
                      { label: "State", value: deal.businessState },
                      { label: "Imports Goods to U.S.", value: deal.importsGoods },
                      { label: "Import Countries", value: deal.importCountries },
                      { label: "Annual Import Value", value: deal.annualImportValue },
                      { label: "Importer of Record", value: deal.importerOfRecord },
                    ].map((f) => (
                      <div key={f.label}>
                        <div className="font-body text-[10px] text-white/30 uppercase tracking-wider">{f.label}</div>
                        <div className="font-body text-[13px] text-white/70 mt-0.5">{f.value || "—"}</div>
                      </div>
                    ))}
                  </div>
                  {deal.affiliateNotes && (
                    <div className="mt-3">
                      <div className="font-body text-[10px] text-white/30 uppercase tracking-wider">Affiliate Notes</div>
                      <div className="font-body text-[12px] text-white/50 mt-1 bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 whitespace-pre-line">{deal.affiliateNotes}</div>
                    </div>
                  )}
                </div>

                {/* ── Deal Management ── */}
                <div className="font-body text-[11px] text-white/30 uppercase tracking-wider mb-3">Deal Management</div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
                  <div>
                    <label className="font-body text-[10px] text-white/40 uppercase tracking-wider block mb-1">Stage</label>
                    <select className={`${inputClass} w-full`} value={editStage} onChange={(e) => setEditStage(e.target.value)}>
                      {STAGES.filter((s) => s.value !== "all").map((s) => (
                        <option key={s.value} value={s.value} className="bg-brand-dark">{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-body text-[10px] text-white/40 uppercase tracking-wider block mb-1">L1 Commission Status</label>
                    <select className={`${inputClass} w-full`} value={editL1Status} onChange={(e) => setEditL1Status(e.target.value)}>
                      {COMMISSION_STATUSES.map((s) => (
                        <option key={s} value={s} className="bg-brand-dark">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-body text-[10px] text-white/40 uppercase tracking-wider block mb-1">L2 Commission Status</label>
                    <select className={`${inputClass} w-full`} value={editL2Status} onChange={(e) => setEditL2Status(e.target.value)}>
                      {COMMISSION_STATUSES.map((s) => (
                        <option key={s} value={s} className="bg-brand-dark">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-body text-[10px] text-white/40 uppercase tracking-wider block mb-1">Financial</label>
                    <div className="font-body text-[11px] text-white/40 space-y-0.5 mt-1">
                      <div>Firm Fee Rate: {deal.firmFeeRate ? `${(deal.firmFeeRate * 100).toFixed(0)}%` : "—"}</div>
                      <div>L2 Commission: {fmt$(deal.l2CommissionAmount)} · <StatusBadge status={deal.l2CommissionStatus} /></div>
                      <div>Partner: {deal.partnerName} ({deal.partnerCode})</div>
                    </div>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="font-body text-[10px] text-white/40 uppercase tracking-wider block mb-1">Admin Notes</label>
                  <textarea
                    className={`${inputClass} w-full resize-none`}
                    rows={2}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Admin notes on this deal..."
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleUpdateDeal(deal.id)} className="btn-gold text-[11px] px-4 py-2">Save Changes</button>
                  <button onClick={() => setExpandedId(null)} className="font-body text-[11px] text-white/40 border border-white/10 rounded-lg px-4 py-2 hover:text-white/60 transition-colors">Cancel</button>
                  <button onClick={() => handleDeleteDeal(deal.id, deal.dealName)} className="font-body text-[11px] text-red-400/60 border border-red-400/20 rounded-lg px-4 py-2 hover:bg-red-400/10 transition-colors ml-auto">Delete</button>
                </div>
              </div>
            )}
          </div>
        ))}

        {sorted.length === 0 && (
          <div className="px-5 py-10 text-center font-body text-[13px] text-white/30">No deals found matching your filters.</div>
        )}
      </div>

      {/* ═══ MOBILE CARDS ═══ */}
      <div className="md:hidden space-y-3">
        {sorted.map((deal) => (
          <div key={deal.id} className="card">
            <div className="p-4 cursor-pointer" onClick={() => toggleExpand(deal)}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="font-body text-[13px] font-medium text-white truncate">{deal.dealName}</div>
                  <div className="font-body text-[11px] text-white/40 mt-0.5">{deal.partnerName} · {fmtDate(deal.createdAt)}</div>
                </div>
                <StageBadge stage={deal.stage} />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div>
                  <div className="font-body text-[9px] text-white/30 uppercase tracking-wider">Refund</div>
                  <div className="font-body text-[13px] text-white/80">{fmt$(deal.estimatedRefundAmount)}</div>
                </div>
                <div>
                  <div className="font-body text-[9px] text-white/30 uppercase tracking-wider">Firm Fee</div>
                  <div className="font-body text-[13px] text-white/60">{fmt$(deal.firmFeeAmount)}</div>
                </div>
                <div className="text-right">
                  <div className="font-body text-[9px] text-white/30 uppercase tracking-wider">Commission</div>
                  <div className="font-display text-sm font-semibold text-brand-gold">{fmt$(deal.l1CommissionAmount)}</div>
                </div>
              </div>
            </div>

            {expandedId === deal.id && (
              <div className="px-4 pb-4 pt-2 border-t border-white/[0.06]">
                {/* Form submission data */}
                <div className="mb-3 pb-3 border-b border-white/[0.06]">
                  <div className="font-body text-[10px] text-white/30 uppercase tracking-wider mb-2">Submission Details</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {[
                      { label: "Contact", value: [deal.clientFirstName, deal.clientLastName].filter(Boolean).join(" ") || deal.clientName },
                      { label: "Email", value: deal.clientEmail },
                      { label: "Phone", value: deal.clientPhone },
                      { label: "Title", value: deal.clientTitle },
                      { label: "Service", value: deal.serviceOfInterest },
                      { label: "Business", value: deal.legalEntityName },
                      { label: "Location", value: [deal.businessCity, deal.businessState].filter(Boolean).join(", ") },
                      { label: "Imports", value: deal.importsGoods },
                      { label: "Countries", value: deal.importCountries },
                      { label: "Import Value", value: deal.annualImportValue },
                      { label: "Importer", value: deal.importerOfRecord },
                    ].map((f) => (
                      <div key={f.label}>
                        <div className="font-body text-[9px] text-white/25 uppercase">{f.label}</div>
                        <div className="font-body text-[12px] text-white/60">{f.value || "—"}</div>
                      </div>
                    ))}
                  </div>
                  {deal.affiliateNotes && (
                    <div className="mt-2">
                      <div className="font-body text-[9px] text-white/25 uppercase">Affiliate Notes</div>
                      <div className="font-body text-[11px] text-white/50 mt-0.5 whitespace-pre-line">{deal.affiliateNotes}</div>
                    </div>
                  )}
                </div>
                {/* Edit controls */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="font-body text-[10px] text-white/40 uppercase block mb-1">Stage</label>
                    <select className={`${inputClass} w-full`} value={editStage} onChange={(e) => setEditStage(e.target.value)}>
                      {STAGES.filter((s) => s.value !== "all").map((s) => (
                        <option key={s.value} value={s.value} className="bg-brand-dark">{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-body text-[10px] text-white/40 uppercase block mb-1">L1 Status</label>
                    <select className={`${inputClass} w-full`} value={editL1Status} onChange={(e) => setEditL1Status(e.target.value)}>
                      {COMMISSION_STATUSES.map((s) => (
                        <option key={s} value={s} className="bg-brand-dark">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <textarea
                  className={`${inputClass} w-full resize-none mb-3`}
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Notes..."
                />
                <div className="flex gap-2">
                  <button onClick={() => handleUpdateDeal(deal.id)} className="btn-gold text-[11px] px-4 py-2 flex-1">Save</button>
                  <button onClick={() => handleDeleteDeal(deal.id, deal.dealName)} className="font-body text-[11px] text-red-400/60 border border-red-400/20 rounded-lg px-3 py-2 hover:bg-red-400/10 transition-colors">Del</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
