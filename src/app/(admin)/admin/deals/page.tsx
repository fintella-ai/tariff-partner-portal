"use client";

import { useState, useEffect, useCallback } from "react";
import { fmt$, fmtDate } from "@/lib/format";
import StageBadge from "@/components/ui/StageBadge";
import StatusBadge from "@/components/ui/StatusBadge";
import PartnerLink from "@/components/ui/PartnerLink";

const STAGES = [
  { value: "all", label: "All Stages" },
  { value: "new_lead", label: "New Lead" },
  { value: "no_consultation", label: "No Consultation Booked" },
  { value: "consultation_booked", label: "Consultation Booked" },
  { value: "client_no_show", label: "Client No Show" },
  { value: "client_engaged", label: "Client Engaged" },
  { value: "in_process", label: "In Process" },
  { value: "closedwon", label: "Closed Won" },
  { value: "closedlost", label: "Closed Lost" },
];

const COMMISSION_STATUSES = ["pending", "due", "approved", "paid"];

type Deal = {
  id: string;
  dealName: string;
  partnerCode: string;
  partnerName: string;
  partnerId: string | null;
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
  consultBookedDate: string | null;
  consultBookedTime: string | null;
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
  paymentReceivedAt: string | null;
  paymentReceivedBy: string | null;
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

  // Deep link: auto-expand a deal from URL ?deal=xxx
  const [deepLinkDealId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("deal");
    }
    return null;
  });

  // Expanded deal for editing
  const [expandedId, setExpandedId] = useState<string | null>(deepLinkDealId);
  const [editStage, setEditStage] = useState("");
  const [editL1Status, setEditL1Status] = useState("");
  const [editL2Status, setEditL2Status] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [dealNotes, setDealNotes] = useState<Record<string, any[]>>({});

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

  // Auto-scroll to deep-linked deal after data loads
  useEffect(() => {
    if (deepLinkDealId && deals.length > 0 && expandedId === deepLinkDealId) {
      setTimeout(() => {
        const el = document.getElementById(`deal-${deepLinkDealId}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 200);
    }
  }, [deepLinkDealId, deals.length, expandedId]);

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
      // Fetch deal notes
      fetchDealNotes(deal.id);
    }
  };

  const fetchDealNotes = async (dealId: string) => {
    try {
      const res = await fetch(`/api/admin/deals/${dealId}`);
      if (res.ok) {
        const data = await res.json();
        setDealNotes((prev) => ({ ...prev, [dealId]: data.dealNotes || [] }));
      }
    } catch {}
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

  const handlePaymentReceived = async (dealId: string, dealName: string) => {
    if (!confirm(
      `Mark payment received for "${dealName}"?\n\n` +
      `This will create commission ledger entries (status "due") for L1/L2/L3 ` +
      `partners and stamp the deal. Cannot be undone via this UI.`
    )) return;
    try {
      const res = await fetch(`/api/admin/deals/${dealId}/payment-received`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to mark payment received");
        return;
      }
      alert(
        `Payment marked received.\n\n` +
        `${data.ledgerCount} commission ${data.ledgerCount === 1 ? "entry" : "entries"} ` +
        `queued for payout, totaling $${(data.totalCommission || 0).toFixed(2)}.`
      );
      fetchDeals();
      fetchDealNotes(dealId);
    } catch {
      alert("Failed to mark payment received");
    }
  };

  const inputClass = "bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-3 py-2 text-[var(--app-text)] font-body text-sm outline-none focus:border-brand-gold/40 transition-colors placeholder:text-[var(--app-text-muted)]";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="font-body text-sm text-[var(--app-text-muted)]">Loading deals...</div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-display text-xl font-bold mb-1">Deal Management</h2>
      <p className="font-body text-[13px] text-[var(--app-text-muted)] mb-6">View, filter, and manage all deals across partners.</p>

      {/* ═══ STATS ═══ */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="card p-4">
            <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">Total Deals</div>
            <div className="font-display text-2xl font-bold">{stats.totalDeals}</div>
          </div>
          <div className="card p-4">
            <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">Refund Pipeline</div>
            <div className="font-display text-2xl font-bold text-blue-400">{fmt$(stats.totalRefundPipeline)}</div>
          </div>
          <div className="card p-4">
            <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">Total Firm Fees</div>
            <div className="font-display text-2xl font-bold text-green-400">{fmt$(stats.totalFirmFees)}</div>
          </div>
          <div className="card p-4">
            <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">Total Commissions</div>
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
                      : "bg-[var(--app-card-bg)] text-[var(--app-text-secondary)] border-[var(--app-border)] hover:bg-[var(--app-card-bg)]"
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
            <option key={s.value} value={s.value} className="bg-[var(--app-bg)]">{s.label}</option>
          ))}
        </select>
        <select
          className={`${inputClass} w-full sm:w-48`}
          value={partnerFilter}
          onChange={(e) => setPartnerFilter(e.target.value)}
        >
          <option value="" className="bg-[var(--app-bg)]">All Partners</option>
          {partners.map((p) => (
            <option key={p.partnerCode} value={p.partnerCode} className="bg-[var(--app-bg)]">
              {p.firstName} {p.lastName}
            </option>
          ))}
        </select>
      </div>

      {/* ═══ RESULTS COUNT ═══ */}
      <div className="font-body text-[12px] text-[var(--app-text-muted)] mb-3">
        Showing {sorted.length} deal{sorted.length !== 1 ? "s" : ""}
        {stageFilter !== "all" ? ` in ${STAGES.find((s) => s.value === stageFilter)?.label}` : ""}
        {partnerFilter ? ` for ${partners.find((p) => p.partnerCode === partnerFilter)?.firstName || partnerFilter}` : ""}
      </div>

      {/* ═══ DESKTOP TABLE ═══ */}
      <div className="card hidden md:block overflow-x-auto">
        <div className="min-w-[1040px]">
        {/* Header — Partner / Stage / Refund / Firm Fee / Commission are
            center-aligned per design. Deal name stays left-aligned (long
            text + secondary subline) and Date stays right-aligned (terse).
            Column gap bumped to gap-6 (24px) so $128,000-style values
            don't bleed into adjacent columns. min-w bumped 920→1040 to
            absorb the extra horizontal gap budget. */}
        <div className="grid grid-cols-[1.5fr_1fr_0.8fr_0.8fr_0.8fr_0.8fr_0.6fr] gap-6 px-5 py-3 border-b border-[var(--app-border)]">
          <button onClick={() => toggleSort("dealName")} className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider text-left hover:text-[var(--app-text-secondary)]">
            Deal{sortIcon("dealName")}
          </button>
          <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider text-center">Partner</div>
          <button onClick={() => toggleSort("stage")} className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider text-center hover:text-[var(--app-text-secondary)] w-full">
            Stage{sortIcon("stage")}
          </button>
          <button onClick={() => toggleSort("estimatedRefundAmount")} className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider text-center hover:text-[var(--app-text-secondary)] w-full">
            Refund{sortIcon("estimatedRefundAmount")}
          </button>
          <button onClick={() => toggleSort("firmFeeAmount")} className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider text-center hover:text-[var(--app-text-secondary)] w-full">
            Firm Fee{sortIcon("firmFeeAmount")}
          </button>
          <button onClick={() => toggleSort("l1CommissionAmount")} className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider text-center hover:text-[var(--app-text-secondary)] w-full">
            Commission{sortIcon("l1CommissionAmount")}
          </button>
          <button onClick={() => toggleSort("createdAt")} className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider text-right hover:text-[var(--app-text-secondary)]">
            Date{sortIcon("createdAt")}
          </button>
        </div>

        {sorted.map((deal, idx) => (
          <div key={deal.id} id={`deal-${deal.id}`}>
            <div
              className={`grid grid-cols-[1.5fr_1fr_0.8fr_0.8fr_0.8fr_0.8fr_0.6fr] gap-6 px-5 py-3.5 border-b border-[var(--app-border)] hover:bg-[var(--app-card-bg)] transition-colors items-center cursor-pointer ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}
              onClick={() => toggleExpand(deal)}
            >
              <div>
                <div className="font-body text-[13px] text-[var(--app-text)] font-medium truncate">{deal.dealName}</div>
                <div className="font-body text-[11px] text-[var(--app-text-muted)] truncate">{deal.clientName || deal.clientEmail || "—"}</div>
              </div>
              <div className="text-center">
                <PartnerLink partnerId={deal.partnerId} className="font-body text-[12px] text-[var(--app-text-secondary)] truncate inline-block max-w-full">{deal.partnerName}</PartnerLink>
              </div>
              <div className="text-center"><StageBadge stage={deal.stage} /></div>
              <div className="font-body text-[13px] text-[var(--app-text)] text-center">{fmt$(deal.estimatedRefundAmount)}</div>
              <div className="font-body text-[13px] text-[var(--app-text-secondary)] text-center">{fmt$(deal.firmFeeAmount)}</div>
              <div className="font-display text-[14px] font-semibold text-brand-gold text-center">{fmt$(deal.l1CommissionAmount)}</div>
              <div className="font-body text-[12px] text-[var(--app-text-muted)] text-right">{fmtDate(deal.createdAt)}</div>
            </div>

            {/* Expanded detail + edit panel */}
            {expandedId === deal.id && (
              <div className="px-5 py-4 bg-[var(--app-card-bg)] border-b border-[var(--app-border)]">
                {/* ── Form Submission Data ── */}
                <div className="mb-4 pb-4 border-b border-[var(--app-border)]">
                  <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-3">Client Submission Details</div>

                  {/* Deal ID (static, immutable) */}
                  <div className="mb-3 p-2.5 rounded-lg" style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)" }}>
                    <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">Deal ID (Unique Identifier)</div>
                    <div className="font-mono text-[12px] text-[var(--app-text)] mt-0.5 select-all">{deal.id}</div>
                  </div>

                  {/* Consultation Date/Time */}
                  {(deal.consultBookedDate || deal.consultBookedTime) && (
                    <div className="mb-3 p-2.5 rounded-lg flex items-center gap-4" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)" }}>
                      <div>
                        <div className="font-body text-[10px] text-yellow-500/80 uppercase tracking-wider">Consultation Date</div>
                        <div className="font-body text-[13px] text-[var(--app-text)] mt-0.5">{deal.consultBookedDate || "—"}</div>
                      </div>
                      <div>
                        <div className="font-body text-[10px] text-yellow-500/80 uppercase tracking-wider">Consultation Time</div>
                        <div className="font-body text-[13px] text-[var(--app-text)] mt-0.5">{deal.consultBookedTime || "—"}</div>
                      </div>
                    </div>
                  )}

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
                        <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">{f.label}</div>
                        <div className="font-body text-[13px] text-[var(--app-text-secondary)] mt-0.5">{f.value || "—"}</div>
                      </div>
                    ))}
                  </div>
                  {deal.affiliateNotes && (
                    <div className="mt-3">
                      <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">Affiliate Notes</div>
                      <div className="font-body text-[12px] text-[var(--app-text-secondary)] mt-1 bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg p-3 whitespace-pre-line">{deal.affiliateNotes}</div>
                    </div>
                  )}
                </div>

                {/* ── Deal Management ── */}
                <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-3">Deal Management</div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
                  <div>
                    <label className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">Stage</label>
                    <select className={`${inputClass} w-full`} value={editStage} onChange={(e) => setEditStage(e.target.value)}>
                      {STAGES.filter((s) => s.value !== "all").map((s) => (
                        <option key={s.value} value={s.value} className="bg-[var(--app-bg)]">{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">L1 Commission Status</label>
                    <select className={`${inputClass} w-full`} value={editL1Status} onChange={(e) => setEditL1Status(e.target.value)}>
                      {COMMISSION_STATUSES.map((s) => (
                        <option key={s} value={s} className="bg-[var(--app-bg)]">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">L2 Commission Status</label>
                    <select className={`${inputClass} w-full`} value={editL2Status} onChange={(e) => setEditL2Status(e.target.value)}>
                      {COMMISSION_STATUSES.map((s) => (
                        <option key={s} value={s} className="bg-[var(--app-bg)]">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">Financial</label>
                    <div className="font-body text-[11px] text-[var(--app-text-muted)] space-y-0.5 mt-1">
                      <div>Firm Fee Rate: {deal.firmFeeRate ? `${(deal.firmFeeRate * 100).toFixed(0)}%` : "—"}</div>
                      <div>L2 Commission: {fmt$(deal.l2CommissionAmount)} · <StatusBadge status={deal.l2CommissionStatus} /></div>
                      <div>Partner: {deal.partnerName} ({deal.partnerCode})</div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mb-4 flex-wrap">
                  <button onClick={() => handleUpdateDeal(deal.id)} className="btn-gold text-[11px] px-4 py-2">Save Changes</button>
                  <button onClick={() => setExpandedId(null)} className="font-body text-[11px] text-[var(--app-text-muted)] border border-[var(--app-border)] rounded-lg px-4 py-2 hover:text-[var(--app-text-secondary)] transition-colors">Cancel</button>
                  {deal.stage === "closedwon" && !deal.paymentReceivedAt && (
                    <button
                      onClick={() => handlePaymentReceived(deal.id, deal.dealName)}
                      className="font-body text-[11px] font-semibold text-green-300 bg-green-500/15 border border-green-400/40 rounded-lg px-4 py-2 hover:bg-green-500/25 transition-colors min-h-[44px]"
                      title="Confirm Frost Law has paid Fintella — creates L1/L2/L3 commission ledger entries"
                    >
                      ✓ Mark Payment Received
                    </button>
                  )}
                  {deal.paymentReceivedAt && (
                    <span
                      className="font-body text-[11px] text-green-400 border border-green-500/20 bg-green-500/5 rounded-lg px-3 py-2"
                      title={`Stamped by ${deal.paymentReceivedBy || "—"}`}
                    >
                      ✓ Paid {new Date(deal.paymentReceivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  )}
                  <button onClick={() => handleDeleteDeal(deal.id, deal.dealName)} className="font-body text-[11px] text-red-400/60 border border-red-400/20 rounded-lg px-4 py-2 hover:bg-red-400/10 transition-colors ml-auto">Delete</button>
                </div>

                {/* ── Admin Notes (audit log) ── */}
                <div className="border-t border-[var(--app-border)] pt-4">
                  <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-2">Admin Notes</div>
                  <div className="flex gap-2 mb-3">
                    <textarea
                      id={`dealNote-${deal.id}`}
                      className={`${inputClass} w-full resize-none flex-1`}
                      rows={2}
                      placeholder="Add a note about this deal..."
                    />
                    <button
                      onClick={async () => {
                        const textarea = document.getElementById(`dealNote-${deal.id}`) as HTMLTextAreaElement;
                        const content = textarea?.value;
                        if (!content?.trim()) return;
                        try {
                          const res = await fetch("/api/admin/deal-notes", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ dealId: deal.id, content }),
                          });
                          if (res.ok) { textarea.value = ""; fetchDealNotes(deal.id); }
                        } catch {}
                      }}
                      className="self-end font-body text-[11px] text-brand-gold/70 border border-brand-gold/20 rounded-lg px-3 py-2 hover:bg-brand-gold/10 transition-colors shrink-0"
                    >
                      Post
                    </button>
                  </div>

                  {/* Pinned notes first, then unpinned */}
                  {(() => {
                    const notes = dealNotes[deal.id] || [];
                    const pinned = notes.filter((n: any) => n.isPinned);
                    const unpinned = notes.filter((n: any) => !n.isPinned);
                    const allSorted = [...pinned, ...unpinned];

                    return allSorted.length > 0 ? (
                      <div className="space-y-0">
                        {allSorted.map((n: any) => (
                          <div key={n.id} className={`py-2.5 ${n.isPinned ? "bg-brand-gold/[0.04] rounded-lg px-3 mb-1" : ""}`} style={{ borderBottom: !n.isPinned ? "1px solid var(--app-border)" : undefined }}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                {n.isPinned && <span className="text-[10px] text-brand-gold">&#128204;</span>}
                                <span className="font-body text-[11px] font-semibold text-[var(--app-text-secondary)]">{n.authorName}</span>
                                <span className="font-body text-[10px] text-[var(--app-text-muted)]">
                                  {new Date(n.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} {new Date(n.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                                </span>
                              </div>
                              <button
                                onClick={async () => {
                                  await fetch("/api/admin/deal-notes", {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ noteId: n.id, isPinned: !n.isPinned }),
                                  });
                                  fetchDealNotes(deal.id);
                                }}
                                className="font-body text-[9px] theme-text-muted hover:text-brand-gold transition-colors shrink-0"
                              >
                                {n.isPinned ? "Unpin" : "Pin"}
                              </button>
                            </div>
                            <div className="font-body text-[12px] text-[var(--app-text-secondary)] mt-1 whitespace-pre-wrap">{n.content}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="font-body text-[12px] text-[var(--app-text-muted)] py-2">No notes yet.</div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        ))}

        {sorted.length === 0 && (
          <div className="px-5 py-10 text-center font-body text-[13px] text-[var(--app-text-muted)]">No deals found matching your filters.</div>
        )}
        </div>
      </div>

      {/* ═══ MOBILE CARDS ═══ */}
      <div className="md:hidden space-y-3">
        {sorted.map((deal, idx) => (
          <div key={deal.id} id={`deal-m-${deal.id}`} className={`card ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}>
            <div className="p-4 cursor-pointer" onClick={() => toggleExpand(deal)}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="font-body text-[13px] font-medium text-[var(--app-text)] truncate">{deal.dealName}</div>
                  <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5"><PartnerLink partnerId={deal.partnerId} className="text-[var(--app-text-muted)]">{deal.partnerName}</PartnerLink> · {fmtDate(deal.createdAt)}</div>
                </div>
                <StageBadge stage={deal.stage} />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div>
                  <div className="font-body text-[9px] text-[var(--app-text-muted)] uppercase tracking-wider">Refund</div>
                  <div className="font-body text-[13px] text-[var(--app-text)]">{fmt$(deal.estimatedRefundAmount)}</div>
                </div>
                <div>
                  <div className="font-body text-[9px] text-[var(--app-text-muted)] uppercase tracking-wider">Firm Fee</div>
                  <div className="font-body text-[13px] text-[var(--app-text-secondary)]">{fmt$(deal.firmFeeAmount)}</div>
                </div>
                <div className="text-right">
                  <div className="font-body text-[9px] text-[var(--app-text-muted)] uppercase tracking-wider">Commission</div>
                  <div className="font-display text-sm font-semibold text-brand-gold">{fmt$(deal.l1CommissionAmount)}</div>
                </div>
              </div>
            </div>

            {expandedId === deal.id && (
              <div className="px-4 pb-4 pt-2 border-t border-[var(--app-border)]">
                {/* Form submission data */}
                <div className="mb-3 pb-3 border-b border-[var(--app-border)]">
                  <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-2">Submission Details</div>
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
                        <div className="font-body text-[9px] text-[var(--app-text-faint)] uppercase">{f.label}</div>
                        <div className="font-body text-[12px] text-[var(--app-text-secondary)]">{f.value || "—"}</div>
                      </div>
                    ))}
                  </div>
                  {deal.affiliateNotes && (
                    <div className="mt-2">
                      <div className="font-body text-[9px] text-[var(--app-text-faint)] uppercase">Affiliate Notes</div>
                      <div className="font-body text-[11px] text-[var(--app-text-secondary)] mt-0.5 whitespace-pre-line">{deal.affiliateNotes}</div>
                    </div>
                  )}
                </div>
                {/* Edit controls */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="font-body text-[10px] text-[var(--app-text-muted)] uppercase block mb-1">Stage</label>
                    <select className={`${inputClass} w-full`} value={editStage} onChange={(e) => setEditStage(e.target.value)}>
                      {STAGES.filter((s) => s.value !== "all").map((s) => (
                        <option key={s.value} value={s.value} className="bg-[var(--app-bg)]">{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-body text-[10px] text-[var(--app-text-muted)] uppercase block mb-1">L1 Status</label>
                    <select className={`${inputClass} w-full`} value={editL1Status} onChange={(e) => setEditL1Status(e.target.value)}>
                      {COMMISSION_STATUSES.map((s) => (
                        <option key={s} value={s} className="bg-[var(--app-bg)]">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
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
                {deal.stage === "closedwon" && !deal.paymentReceivedAt && (
                  <button
                    onClick={() => handlePaymentReceived(deal.id, deal.dealName)}
                    className="w-full font-body text-[12px] font-semibold text-green-300 bg-green-500/15 border border-green-400/40 rounded-lg px-4 py-3 hover:bg-green-500/25 transition-colors min-h-[44px] mb-2"
                  >
                    ✓ Mark Payment Received
                  </button>
                )}
                {deal.paymentReceivedAt && (
                  <div className="w-full text-center font-body text-[11px] text-green-400 border border-green-500/20 bg-green-500/5 rounded-lg px-3 py-2 mb-2">
                    ✓ Paid {new Date(deal.paymentReceivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                )}
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
