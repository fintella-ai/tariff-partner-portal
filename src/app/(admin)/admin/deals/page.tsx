"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useResizableColumns } from "@/components/ui/ResizableTable";
import { fmt$, fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { resolveDealFinancials, formatRate } from "@/lib/dealCalc";
import { parseDealPayloadLog } from "@/lib/appendDealPayload";
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
  epLevel1: string | null;
  // Deal tracking
  stage: string;
  consultBookedDate: string | null;
  consultBookedTime: string | null;
  productType: string | null;
  importedProducts: string | null;
  estimatedRefundAmount: number;
  actualRefundAmount: number | null;
  firmFeeRate: number | null;
  firmFeeAmount: number;
  l1CommissionRate: number | null;
  // Resolved at API time: deal.l1CommissionRate ?? submitting partner's
  // standard commissionRate. Lets the table render the correct % per row
  // without a client-side partnerCode→rate join.
  effectiveCommissionRate: number | null;
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
  const { data: session } = useSession();
  const isSuperAdmin = (session?.user as any)?.role === "super_admin";

  // 9 columns: Deal, Partner, Stage, Refund, Fee%, Firm Fee, Comm%, Commission, Date
  const { columnWidths: dealCols, getResizeHandler: dealResize } = useResizableColumns(
    [200, 140, 120, 120, 70, 110, 70, 110, 100],
    { storageKey: "deals" }
  );
  const dealGridCols = dealCols.map((w) => `${w}px`).join(" ");

  const [deals, setDeals] = useState<Deal[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editEpLevel1, setEditEpLevel1] = useState("");
  const [editPartnerCode, setEditPartnerCode] = useState("");
  const [partnerSearch, setPartnerSearch] = useState("");
  const [showPartnerDropdown, setShowPartnerDropdown] = useState(false);
  const partnerWrapRef = useRef<HTMLDivElement | null>(null);

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

  // Editable client-submission fields (super_admin / admin / partner_support
  // may need to correct these manually when the referral form came in with
  // typos or stale info — e.g. wrong email, wrong legal entity name).
  type ClientEdits = {
    clientFirstName: string;
    clientLastName: string;
    clientEmail: string;
    clientPhone: string;
    clientTitle: string;
    serviceOfInterest: string;
    legalEntityName: string;
    businessCity: string;
    businessState: string;
    importsGoods: string;
    importCountries: string;
    annualImportValue: string;
    importerOfRecord: string;
  };
  const emptyClientEdits: ClientEdits = {
    clientFirstName: "", clientLastName: "", clientEmail: "", clientPhone: "",
    clientTitle: "", serviceOfInterest: "", legalEntityName: "",
    businessCity: "", businessState: "", importsGoods: "", importCountries: "",
    annualImportValue: "", importerOfRecord: "",
  };
  const [editClient, setEditClient] = useState<ClientEdits>(emptyClientEdits);
  const setClientField = (k: keyof ClientEdits) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setEditClient((prev) => ({ ...prev, [k]: e.target.value }));

  // Editable financial fields. Stored as raw strings in UI so partial edits
  // ("2000000" → "2,000,000") don't fight controlled inputs, parsed on save.
  // firmFeeRatePct is the percentage form (0..100); converted to decimal
  // (0..1) on save to match the DB schema convention.
  const [editRefund, setEditRefund] = useState("");
  const [editActualRefund, setEditActualRefund] = useState("");
  const [editFirmFeeRatePct, setEditFirmFeeRatePct] = useState("");
  const [editFirmFeeAmount, setEditFirmFeeAmount] = useState("");

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

  // Close the partner-reassign combobox when the admin clicks outside.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (partnerWrapRef.current && !partnerWrapRef.current.contains(e.target as Node)) {
        setShowPartnerDropdown(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

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
      setEditRefund(deal.estimatedRefundAmount ? String(deal.estimatedRefundAmount) : "");
      setEditActualRefund(deal.actualRefundAmount != null ? String(deal.actualRefundAmount) : "");
      setEditFirmFeeRatePct(
        deal.firmFeeRate != null ? String(Math.round(deal.firmFeeRate * 10000) / 100) : ""
      );
      setEditFirmFeeAmount(deal.firmFeeAmount ? String(deal.firmFeeAmount) : "");
      setEditClient({
        clientFirstName: deal.clientFirstName || "",
        clientLastName: deal.clientLastName || "",
        clientEmail: deal.clientEmail || "",
        clientPhone: deal.clientPhone || "",
        clientTitle: deal.clientTitle || "",
        serviceOfInterest: deal.serviceOfInterest || "",
        legalEntityName: deal.legalEntityName || "",
        businessCity: deal.businessCity || "",
        businessState: deal.businessState || "",
        importsGoods: deal.importsGoods || "",
        importCountries: deal.importCountries || "",
        annualImportValue: deal.annualImportValue || "",
        importerOfRecord: deal.importerOfRecord || "",
      });
      setEditEpLevel1(deal.epLevel1 || "");
      setEditPartnerCode(deal.partnerCode || "");
      setPartnerSearch(
        deal.partnerId && deal.partnerName
          ? `${deal.partnerName} (${deal.partnerCode})`
          : (deal.partnerCode || "")
      );
      setShowPartnerDropdown(false);
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
    // Parse financial inputs: strip commas/$, convert rate percentage → decimal.
    const parseNum = (s: string): number | null => {
      const cleaned = s.replace(/[,$\s]/g, "");
      if (cleaned === "") return null;
      const n = parseFloat(cleaned);
      return isNaN(n) ? null : n;
    };
    const refundParsed = parseNum(editRefund);
    const actualRefundParsed = parseNum(editActualRefund);
    const feeAmountParsed = parseNum(editFirmFeeAmount);
    const feeRatePctParsed = parseNum(editFirmFeeRatePct);
    const feeRateDecimal =
      feeRatePctParsed == null ? null : feeRatePctParsed > 1 ? feeRatePctParsed / 100 : feeRatePctParsed;

    try {
      await fetch(`/api/admin/deals/${dealId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: editStage,
          l1CommissionStatus: editL1Status,
          l2CommissionStatus: editL2Status,
          notes: editNotes,
          estimatedRefundAmount: refundParsed ?? 0,
          actualRefundAmount: actualRefundParsed,
          firmFeeRate: feeRateDecimal,
          firmFeeAmount: feeAmountParsed ?? 0,
          ...editClient,
          // Keep composite clientName in sync with first/last edits so legacy
          // consumers reading deal.clientName still show the corrected name.
          clientName: [editClient.clientFirstName, editClient.clientLastName]
            .filter(Boolean)
            .join(" ")
            .trim(),
          // Only super_admin can modify EP Level 1 or reassign the partner.
          // Omit those keys entirely for other roles so the server-side guard
          // doesn't see an attempted edit and 403 the whole save.
          ...(isSuperAdmin ? { epLevel1: editEpLevel1 } : {}),
          ...(isSuperAdmin && editPartnerCode ? { partnerCode: editPartnerCode } : {}),
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
        <div className="min-w-[1320px]">
        {/* Header — 9 columns: Deal / Partner / Stage / Refund / Firm Fee % /
            Firm Fee / Commission % / Commission / Date. The two rate columns
            (Firm Fee % + Commission %) sit immediately before their dollar-
            amount counterparts so the eye reads "20% × $X = $Y" left to right.
            All center-aligned except Deal (left, long name) and Date (right,
            terse trailing metadata). gap-6 + min-w-[1320px] (was 1040) to
            absorb the two new columns. */}
        <div className="grid gap-6 px-5 py-3 border-b border-[var(--app-border)]" style={{ gridTemplateColumns: dealGridCols }}>
          <button onClick={() => toggleSort("dealName")} className="relative font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider text-left hover:text-[var(--app-text-secondary)]">
            Deal{sortIcon("dealName")}<span {...dealResize(0)} />
          </button>
          <div className="relative font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider text-center">Partner<span {...dealResize(1)} /></div>
          <button onClick={() => toggleSort("stage")} className="relative font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider text-center hover:text-[var(--app-text-secondary)] w-full">
            Stage{sortIcon("stage")}<span {...dealResize(2)} />
          </button>
          <button onClick={() => toggleSort("estimatedRefundAmount")} className="relative font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider text-center hover:text-[var(--app-text-secondary)] w-full">
            Refund{sortIcon("estimatedRefundAmount")}<span {...dealResize(3)} />
          </button>
          <div className="relative font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider text-center" title="Firm fee rate as a percentage of the deal refund">
            Fee %<span {...dealResize(4)} />
          </div>
          <button onClick={() => toggleSort("firmFeeAmount")} className="relative font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider text-center hover:text-[var(--app-text-secondary)] w-full">
            Firm Fee{sortIcon("firmFeeAmount")}<span {...dealResize(5)} />
          </button>
          <div className="relative font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider text-center" title="Commission rate as a percentage of the firm fee (per the partner's tier)">
            Comm %<span {...dealResize(6)} />
          </div>
          <button onClick={() => toggleSort("l1CommissionAmount")} className="relative font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider text-center hover:text-[var(--app-text-secondary)] w-full">
            Commission{sortIcon("l1CommissionAmount")}<span {...dealResize(7)} />
          </button>
          <button onClick={() => toggleSort("createdAt")} className="relative font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider text-center hover:text-[var(--app-text-secondary)]">
            Date{sortIcon("createdAt")}<span {...dealResize(8)} />
          </button>
        </div>

        {sorted.map((deal, idx) => {
          // Cross-calculate missing firm fee / commission values from the
          // siblings we DO have. E.g. if a deal has refund + firm fee amount
          // but no firm fee rate, we compute it as amount/refund and show
          // it in the % column. Same pattern for commission. Pure helper,
          // see src/lib/dealCalc.ts for precedence rules.
          const fin = resolveDealFinancials(deal);
          return (
          <div key={deal.id} id={`deal-${deal.id}`}>
            <div
              className={`grid gap-6 px-5 py-3.5 border-b border-[var(--app-border)] hover:bg-[var(--app-card-bg)] transition-colors items-center cursor-pointer ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}
              style={{ gridTemplateColumns: dealGridCols }}
              onClick={() => toggleExpand(deal)}
            >
              <div>
                <div className="font-body text-[13px] text-[var(--app-text)] font-medium truncate">{deal.dealName}</div>
                <div className="font-body text-[11px] text-[var(--app-text-muted)] truncate">{deal.clientName || deal.clientEmail || "—"}</div>
              </div>
              <div className="text-center">
                {deal.partnerId ? (
                  <>
                    <PartnerLink partnerId={deal.partnerId} className="font-body text-[12px] text-[var(--app-text-secondary)] truncate inline-block max-w-full">{deal.partnerName}</PartnerLink>
                    {deal.partnerName !== deal.partnerCode && (
                      <div className="font-mono text-[10px] text-[var(--app-text-muted)] mt-0.5 truncate">{deal.partnerCode}</div>
                    )}
                  </>
                ) : (
                  <>
                    <span className="font-body text-[12px] text-[var(--app-text-muted)] italic truncate inline-block max-w-full">Unknown</span>
                    <div className="font-mono text-[10px] text-[var(--app-text-muted)] mt-0.5 truncate">{deal.partnerCode}</div>
                  </>
                )}
              </div>
              <div className="text-center"><StageBadge stage={deal.stage} /></div>
              <div className="font-body text-[13px] text-[var(--app-text)] text-center">{fmt$(fin.refund)}</div>
              <div className="font-body text-[12px] text-[var(--app-text-muted)] text-center">
                {formatRate(fin.firmFeeRate)}
              </div>
              <div className="font-body text-[13px] text-[var(--app-text-secondary)] text-center">{fmt$(fin.firmFeeAmount)}</div>
              <div className="font-body text-[12px] text-[var(--app-text-muted)] text-center">
                {formatRate(fin.commissionRate)}
              </div>
              <div className="font-display text-[14px] font-semibold text-brand-gold text-center">{fmt$(fin.commissionAmount)}</div>
              <div className="font-body text-[12px] text-[var(--app-text-muted)] text-center">
                <div>{fmtDate(deal.createdAt)}</div>
                <div className="text-[11px] text-[var(--app-text-faint)] mt-0.5">{fmtTime(deal.createdAt)}</div>
              </div>
            </div>

            {/* Expanded detail + edit panel */}
            {/* The arrow-fn open { on the .map above means we close with
                }); at the bottom of this iteration — see below. Also note
                that `fin` (resolved financials) is in scope here and could
                be used inside the expanded detail view too if needed. */}
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

                  {/* HubSpot / external deal ID (set for HubSpot-sourced inbound + outbound-submitted deals) */}
                  {(deal as any).externalDealId && (
                    <div className="mb-3 p-2.5 rounded-lg" style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)" }}>
                      <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">HubSpot Deal ID</div>
                      <div className="font-mono text-[12px] text-[var(--app-text)] mt-0.5 select-all">{(deal as any).externalDealId}</div>
                    </div>
                  )}

                  {/* Raw source payload event log — chronological array of POST + PATCH bodies */}
                  {(deal as any).rawPayload && (() => {
                    const events = parseDealPayloadLog((deal as any).rawPayload);
                    if (events.length === 0) return null;
                    return (
                      <details className="mb-3 p-2.5 rounded-lg" style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)" }}>
                        <summary className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider cursor-pointer select-none">Raw Source Payloads ({events.length} event{events.length !== 1 ? "s" : ""})</summary>
                        <div className="mt-2 space-y-2">
                          {events.map((evt, i) => (
                            <div key={i} className="p-2 rounded" style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)" }}>
                              <div className="font-body text-[10px] text-[var(--app-text-muted)] mb-1 flex items-center gap-2">
                                <span className={`font-mono px-1.5 py-0.5 rounded ${evt.method === "POST" ? "bg-blue-500/15 text-blue-400" : "bg-purple-500/15 text-purple-400"}`}>{evt.method}</span>
                                <span>{evt.ts === "1970-01-01T00:00:00.000Z" ? "(time unknown — legacy entry)" : new Date(evt.ts).toLocaleString()}</span>
                              </div>
                              <pre className="font-mono text-[11px] text-[var(--app-text-secondary)] overflow-x-auto whitespace-pre-wrap break-all">{(() => {
                                try { return JSON.stringify(JSON.parse(evt.body), null, 2); }
                                catch { return evt.body; }
                              })()}</pre>
                            </div>
                          ))}
                        </div>
                      </details>
                    );
                  })()}

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

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3">
                    {([
                      { label: "First Name", key: "clientFirstName" },
                      { label: "Last Name", key: "clientLastName" },
                      { label: "Email", key: "clientEmail" },
                      { label: "Phone", key: "clientPhone" },
                      { label: "Business Title", key: "clientTitle" },
                      { label: "Service of Interest", key: "serviceOfInterest" },
                      { label: "Legal Entity", key: "legalEntityName" },
                      { label: "City", key: "businessCity" },
                      { label: "State", key: "businessState" },
                      { label: "Imports Goods to U.S.", key: "importsGoods" },
                      { label: "Import Countries", key: "importCountries" },
                      { label: "Annual Import Value", key: "annualImportValue" },
                      { label: "Importer of Record", key: "importerOfRecord" },
                    ] as const).map((f) => (
                      <div key={f.key}>
                        <label className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">{f.label}</label>
                        <input
                          className={`${inputClass} w-full`}
                          value={editClient[f.key]}
                          onChange={setClientField(f.key)}
                          placeholder="—"
                        />
                      </div>
                    ))}
                  </div>
                  {deal.affiliateNotes && (
                    <div className="mt-3">
                      <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">Affiliate Notes</div>
                      <div className="font-body text-[12px] text-[var(--app-text-secondary)] mt-1 bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg p-3 whitespace-pre-line">{deal.affiliateNotes}</div>
                    </div>
                  )}
                  <div className="mt-3" ref={expandedId === deal.id ? partnerWrapRef : undefined}>
                    <label className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">
                      Partner
                      {!isSuperAdmin && (
                        <span className="ml-2 text-[9px] text-[var(--app-text-faint)] normal-case tracking-normal">(super_admin only)</span>
                      )}
                    </label>
                    {isSuperAdmin ? (
                      <div className="relative sm:w-2/3">
                        <input
                          className={`${inputClass} w-full`}
                          value={partnerSearch}
                          onChange={(e) => {
                            setPartnerSearch(e.target.value);
                            setShowPartnerDropdown(true);
                          }}
                          onFocus={() => setShowPartnerDropdown(true)}
                          placeholder="Type partner name or code..."
                        />
                        {showPartnerDropdown && (() => {
                          const q = partnerSearch.trim().toLowerCase();
                          const matches = partners.filter((p) => {
                            if (!q) return true;
                            const full = `${p.firstName} ${p.lastName}`.toLowerCase();
                            return (
                              full.includes(q) ||
                              p.partnerCode.toLowerCase().includes(q)
                            );
                          }).slice(0, 10);
                          if (matches.length === 0) return null;
                          return (
                            <div className="absolute z-30 mt-1 w-full bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg shadow-lg max-h-64 overflow-auto">
                              {matches.map((p) => (
                                <button
                                  key={p.partnerCode}
                                  type="button"
                                  onClick={() => {
                                    setEditPartnerCode(p.partnerCode);
                                    setPartnerSearch(`${p.firstName} ${p.lastName} (${p.partnerCode})`);
                                    setShowPartnerDropdown(false);
                                  }}
                                  className="w-full text-left px-3 py-2 hover:bg-[var(--app-input-bg)] border-b border-[var(--app-border)] last:border-b-0 transition"
                                >
                                  <div className="font-body text-[12px] text-[var(--app-text)]">
                                    {p.firstName} {p.lastName}
                                    <span className="font-mono text-[10px] text-[var(--app-text-muted)] ml-2">({p.partnerCode})</span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                        <div className="font-body text-[10px] text-[var(--app-text-faint)] mt-1">
                          Reassign if the deal came in as &ldquo;Unknown&rdquo; or was attributed to the wrong partner.
                        </div>
                      </div>
                    ) : (
                      <div className="font-body text-[13px] text-[var(--app-text)] mt-0.5">
                        {deal.partnerId ? (
                          <>
                            {deal.partnerName}
                            <span className="font-mono text-[11px] text-[var(--app-text-muted)] ml-2">({deal.partnerCode})</span>
                          </>
                        ) : (
                          <>
                            <span className="italic text-[var(--app-text-muted)]">Unknown</span>
                            <span className="font-mono text-[11px] text-[var(--app-text-muted)] ml-2">({deal.partnerCode})</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-3">
                    <label className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">
                      EP Level 1
                      {!isSuperAdmin && (
                        <span className="ml-2 text-[9px] text-[var(--app-text-faint)] normal-case tracking-normal">(super_admin only)</span>
                      )}
                    </label>
                    {isSuperAdmin ? (
                      <input
                        className={`${inputClass} w-full sm:w-1/2`}
                        value={editEpLevel1}
                        onChange={(e) => setEditEpLevel1(e.target.value)}
                        placeholder="— (set by utm_medium on client submission)"
                      />
                    ) : (
                      <div className="font-body text-[13px] text-[var(--app-text)] mt-0.5">
                        {deal.epLevel1 || <span className="text-[var(--app-text-faint)]">— (not set)</span>}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Deal Management ── */}
                <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-3">Deal Management</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
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
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div>
                    <label className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">Estimated Refund ($)</label>
                    <input
                      className={`${inputClass} w-full`}
                      value={editRefund}
                      onChange={(e) => setEditRefund(e.target.value)}
                      placeholder="0"
                      inputMode="decimal"
                    />
                  </div>
                  <div>
                    <label className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">Actual Refund ($)</label>
                    <input
                      className={`${inputClass} w-full`}
                      value={editActualRefund}
                      onChange={(e) => setEditActualRefund(e.target.value)}
                      placeholder="—"
                      inputMode="decimal"
                      title="Set once Frost Law confirms the refund check the client actually received"
                    />
                  </div>
                  <div>
                    <label className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">Firm Fee Rate (%)</label>
                    <input
                      className={`${inputClass} w-full`}
                      value={editFirmFeeRatePct}
                      onChange={(e) => setEditFirmFeeRatePct(e.target.value)}
                      placeholder="e.g. 30"
                      inputMode="decimal"
                    />
                  </div>
                  <div>
                    <label className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">Firm Fee Amount ($)</label>
                    <input
                      className={`${inputClass} w-full`}
                      value={editFirmFeeAmount}
                      onChange={(e) => setEditFirmFeeAmount(e.target.value)}
                      placeholder="0"
                      inputMode="decimal"
                    />
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
          );
        })}

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
                  <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5">
                    {deal.partnerId ? (
                      <>
                        <PartnerLink partnerId={deal.partnerId} className="text-[var(--app-text-muted)]">{deal.partnerName}</PartnerLink>
                        {deal.partnerName !== deal.partnerCode && <span className="font-mono ml-1">· {deal.partnerCode}</span>}
                      </>
                    ) : (
                      <>
                        <span className="italic">Unknown</span>
                        <span className="font-mono ml-1">· {deal.partnerCode}</span>
                      </>
                    )}
                    <span className="ml-1">· {fmtDateTime(deal.createdAt)}</span>
                  </div>
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
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                    {([
                      { label: "First Name", key: "clientFirstName" },
                      { label: "Last Name", key: "clientLastName" },
                      { label: "Email", key: "clientEmail" },
                      { label: "Phone", key: "clientPhone" },
                      { label: "Title", key: "clientTitle" },
                      { label: "Service", key: "serviceOfInterest" },
                      { label: "Legal Entity", key: "legalEntityName" },
                      { label: "City", key: "businessCity" },
                      { label: "State", key: "businessState" },
                      { label: "Imports", key: "importsGoods" },
                      { label: "Countries", key: "importCountries" },
                      { label: "Import Value", key: "annualImportValue" },
                      { label: "Importer", key: "importerOfRecord" },
                    ] as const).map((f) => (
                      <div key={f.key}>
                        <label className="font-body text-[9px] text-[var(--app-text-faint)] uppercase block mb-0.5">{f.label}</label>
                        <input
                          className={`${inputClass} w-full !py-1.5 !text-[12px]`}
                          value={editClient[f.key]}
                          onChange={setClientField(f.key)}
                          placeholder="—"
                        />
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
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <label className="font-body text-[9px] text-[var(--app-text-faint)] uppercase block mb-0.5">Est. Refund ($)</label>
                    <input
                      className={`${inputClass} w-full !py-1.5 !text-[12px]`}
                      value={editRefund}
                      onChange={(e) => setEditRefund(e.target.value)}
                      inputMode="decimal"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="font-body text-[9px] text-[var(--app-text-faint)] uppercase block mb-0.5">Actual Refund ($)</label>
                    <input
                      className={`${inputClass} w-full !py-1.5 !text-[12px]`}
                      value={editActualRefund}
                      onChange={(e) => setEditActualRefund(e.target.value)}
                      inputMode="decimal"
                      placeholder="—"
                    />
                  </div>
                  <div>
                    <label className="font-body text-[9px] text-[var(--app-text-faint)] uppercase block mb-0.5">Fee %</label>
                    <input
                      className={`${inputClass} w-full !py-1.5 !text-[12px]`}
                      value={editFirmFeeRatePct}
                      onChange={(e) => setEditFirmFeeRatePct(e.target.value)}
                      inputMode="decimal"
                      placeholder="e.g. 30"
                    />
                  </div>
                  <div>
                    <label className="font-body text-[9px] text-[var(--app-text-faint)] uppercase block mb-0.5">Fee ($)</label>
                    <input
                      className={`${inputClass} w-full !py-1.5 !text-[12px]`}
                      value={editFirmFeeAmount}
                      onChange={(e) => setEditFirmFeeAmount(e.target.value)}
                      inputMode="decimal"
                      placeholder="0"
                    />
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
