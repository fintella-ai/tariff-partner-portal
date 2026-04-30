"use client";

import { useState, useEffect, useCallback, useRef, type ChangeEvent } from "react";
import { fmt$, fmtDate } from "@/lib/format";

/* ═══════════════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════════════ */

interface EntryRow {
  id: string;
  entryNumber: string;
  countryCode: string;
  entryDate: string;
  enteredValue: string;
  ieepaRate: number | null;
  rateLoading: boolean;
}

interface CalcResult {
  index: number;
  countryOfOrigin: string;
  entryDate: string;
  enteredValue: number;
  entryNumber?: string;
  combinedRate: number;
  rateBreakdown: { fentanyl?: number; reciprocal?: number; section122?: number };
  estimatedDuty: number;
  estimatedInterest: number;
  eligibility: {
    status: string;
    reason: string;
    deadlineDays?: number;
    isUrgent?: boolean;
  };
}

interface CalcSummary {
  totalEnteredValue: number;
  totalEstimatedRefund: number;
  totalEstimatedInterest: number;
  totalRefundWithInterest: number;
  eligibleEntries: number;
  totalEntries: number;
  nearestDeadlineDays: number | null;
}

interface CountryOption {
  code: string;
  name: string;
  flag: string;
}

interface DossierRow {
  id: string;
  clientCompany: string;
  status: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  _count?: { entries: number };
  estimatedRefund?: number;
  nearestDeadlineDays?: number | null;
}

type TabId = "quick-estimate" | "bulk-upload" | "document-ai" | "dossiers";

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════ */

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "quick-estimate", label: "Quick Estimate", icon: "⚡" },
  { id: "bulk-upload", label: "Bulk Upload", icon: "📄" },
  { id: "document-ai", label: "Document Intake", icon: "🤖" },
  { id: "dossiers", label: "My Dossiers", icon: "📁" },
];

const COUNTRY_FLAGS: Record<string, string> = {
  CN: "🇨🇳", VN: "🇻🇳", TW: "🇹🇼", KR: "🇰🇷", JP: "🇯🇵",
  TH: "🇹🇭", IN: "🇮🇳", ID: "🇮🇩", MY: "🇲🇾", BD: "🇧🇩",
  DE: "🇩🇪", IT: "🇮🇹", FR: "🇫🇷", GB: "🇬🇧", ES: "🇪🇸",
  MX: "🇲🇽", CA: "🇨🇦", BR: "🇧🇷", PH: "🇵🇭", PK: "🇵🇰",
  KH: "🇰🇭", LK: "🇱🇰", MM: "🇲🇲", NL: "🇳🇱", IE: "🇮🇪",
  SE: "🇸🇪", BE: "🇧🇪", CH: "🇨🇭", AT: "🇦🇹", PL: "🇵🇱",
  IL: "🇮🇱", ZA: "🇿🇦", AU: "🇦🇺", NZ: "🇳🇿", SG: "🇸🇬",
  HK: "🇭🇰", TR: "🇹🇷", RU: "🇷🇺", CL: "🇨🇱", CO: "🇨🇴",
  AR: "🇦🇷", PE: "🇵🇪", EG: "🇪🇬", AE: "🇦🇪", SA: "🇸🇦",
};

const FALLBACK_COUNTRIES: CountryOption[] = [
  { code: "CN", name: "China", flag: "🇨🇳" },
  { code: "VN", name: "Vietnam", flag: "🇻🇳" },
  { code: "TW", name: "Taiwan", flag: "🇹🇼" },
  { code: "KR", name: "South Korea", flag: "🇰🇷" },
  { code: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "TH", name: "Thailand", flag: "🇹🇭" },
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩" },
  { code: "MY", name: "Malaysia", flag: "🇲🇾" },
  { code: "BD", name: "Bangladesh", flag: "🇧🇩" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "IT", name: "Italy", flag: "🇮🇹" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "MX", name: "Mexico", flag: "🇲🇽" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "BR", name: "Brazil", flag: "🇧🇷" },
  { code: "PH", name: "Philippines", flag: "🇵🇭" },
  { code: "PK", name: "Pakistan", flag: "🇵🇰" },
];

const DEMO_CSV_ROWS: EntryRow[] = [
  { id: "d1", entryNumber: "ENT-2025-001", countryCode: "CN", entryDate: "2025-04-15", enteredValue: "850000", ieepaRate: null, rateLoading: false },
  { id: "d2", entryNumber: "ENT-2025-002", countryCode: "VN", entryDate: "2025-05-02", enteredValue: "320000", ieepaRate: null, rateLoading: false },
  { id: "d3", entryNumber: "ENT-2025-003", countryCode: "DE", entryDate: "2025-06-10", enteredValue: "175000", ieepaRate: null, rateLoading: false },
  { id: "d4", entryNumber: "ENT-2025-004", countryCode: "CN", entryDate: "2025-03-20", enteredValue: "1200000", ieepaRate: null, rateLoading: false },
  { id: "d5", entryNumber: "ENT-2025-005", countryCode: "TW", entryDate: "2025-07-01", enteredValue: "460000", ieepaRate: null, rateLoading: false },
  { id: "d6", entryNumber: "ENT-2025-006", countryCode: "KR", entryDate: "2025-04-28", enteredValue: "290000", ieepaRate: null, rateLoading: false },
  { id: "d7", entryNumber: "ENT-2025-007", countryCode: "JP", entryDate: "2025-05-15", enteredValue: "540000", ieepaRate: null, rateLoading: false },
  { id: "d8", entryNumber: "ENT-2025-008", countryCode: "IN", entryDate: "2025-06-22", enteredValue: "195000", ieepaRate: null, rateLoading: false },
];

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  draft:     { bg: "bg-white/5",         text: "text-white/60",   label: "Draft" },
  analyzing: { bg: "bg-purple-500/10",   text: "text-purple-400", label: "Analyzing" },
  ready:     { bg: "bg-green-500/10",    text: "text-green-400",  label: "Ready" },
  submitted: { bg: "bg-yellow-500/10",   text: "text-yellow-400", label: "Submitted" },
  converted: { bg: "bg-blue-500/10",     text: "text-blue-400",   label: "Converted" },
};

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

let nextId = 1;
function uid(): string {
  return `r_${Date.now()}_${nextId++}`;
}

function emptyRow(): EntryRow {
  return {
    id: uid(),
    entryNumber: "",
    countryCode: "",
    entryDate: "",
    enteredValue: "",
    ieepaRate: null,
    rateLoading: false,
  };
}

/** Parse CSV/TSV text into rows of string arrays */
function parseCSV(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  // Detect delimiter
  const firstLine = lines[0];
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  return lines.map((line) => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === delimiter) {
          result.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }
    result.push(current.trim());
    return result;
  });
}

/** Attempt to auto-map header columns */
function autoMapColumns(headers: string[]): {
  entryNumber: number;
  country: number;
  date: number;
  value: number;
} {
  const map = { entryNumber: -1, country: -1, date: -1, value: -1 };
  headers.forEach((h, i) => {
    const lh = h.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (lh.includes("entry") && (lh.includes("number") || lh.includes("num") || lh.includes("no"))) map.entryNumber = i;
    else if (lh.includes("country") || lh.includes("origin") || lh.includes("coo")) map.country = i;
    else if (lh.includes("date") || lh.includes("entry") && map.entryNumber !== i) map.date = i;
    else if (lh.includes("value") || lh.includes("amount") || lh.includes("entered") || lh.includes("cost")) map.value = i;
  });
  // Fallback: guess by position if only 3-4 columns
  if (map.country === -1 && headers.length >= 3) map.country = 0;
  if (map.date === -1 && headers.length >= 3) map.date = 1;
  if (map.value === -1 && headers.length >= 3) map.value = headers.length >= 4 ? 3 : 2;
  return map;
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function CalculatorPage() {
  const [activeTab, setActiveTab] = useState<TabId>("quick-estimate");
  const [commissionRate, setCommissionRate] = useState(0.20);

  // Load partner commission rate
  useEffect(() => {
    fetch("/api/commissions")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.commissionRate) setCommissionRate(data.commissionRate);
      })
      .catch(() => {});
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="font-display text-xl sm:text-2xl font-bold mb-1">
          Tariff Calculator
        </h2>
        <p className="font-body text-[13px] text-[var(--app-text-muted)]">
          Estimate IEEPA tariff refunds, upload entry data, and manage client dossiers.
        </p>
      </div>

      {/* Tabs */}
      <div className="card">
        <div className="flex gap-1 px-4 sm:px-6 pt-4 sm:pt-5 border-b border-[var(--app-border)] overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`font-body text-[13px] px-3 sm:px-4 py-2.5 whitespace-nowrap transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
                activeTab === t.id
                  ? "text-brand-gold border-brand-gold"
                  : "text-[var(--app-text-muted)] border-transparent hover:text-[var(--app-text-secondary)]"
              }`}
            >
              <span className="text-sm">{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.label.split(" ")[0]}</span>
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-6">
          {activeTab === "quick-estimate" && (
            <QuickEstimateTab commissionRate={commissionRate} />
          )}
          {activeTab === "bulk-upload" && (
            <BulkUploadTab commissionRate={commissionRate} />
          )}
          {activeTab === "document-ai" && <DocumentAiTab />}
          {activeTab === "dossiers" && <DossiersTab />}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 1 — QUICK ESTIMATE
   ═══════════════════════════════════════════════════════════════════════════ */

function QuickEstimateTab({ commissionRate }: { commissionRate: number }) {
  const [rows, setRows] = useState<EntryRow[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [countries, setCountries] = useState<CountryOption[]>(FALLBACK_COUNTRIES);
  const [results, setResults] = useState<CalcResult[] | null>(null);
  const [summary, setSummary] = useState<CalcSummary | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const rateCache = useRef<Map<string, number | null>>(new Map());

  // Load countries from API
  useEffect(() => {
    fetch("/api/tariff/rates")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.countries?.length) {
          setCountries(
            data.countries.map((c: { code: string; name: string }) => ({
              code: c.code,
              name: c.name,
              flag: COUNTRY_FLAGS[c.code] || "🏳️",
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  // Rate lookup when country + date change
  const lookupRate = useCallback(
    async (rowId: string, countryCode: string, entryDate: string) => {
      if (!countryCode || !entryDate) return;
      const cacheKey = `${countryCode}_${entryDate}`;
      if (rateCache.current.has(cacheKey)) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === rowId ? { ...r, ieepaRate: rateCache.current.get(cacheKey) ?? null, rateLoading: false } : r
          )
        );
        return;
      }
      setRows((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, rateLoading: true } : r))
      );
      try {
        const res = await fetch("/api/tariff/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entries: [{ countryOfOrigin: countryCode, entryDate, enteredValue: 100000 }],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const rate = data.entries?.[0]?.combinedRate ?? null;
          rateCache.current.set(cacheKey, rate);
          setRows((prev) =>
            prev.map((r) =>
              r.id === rowId ? { ...r, ieepaRate: rate, rateLoading: false } : r
            )
          );
        } else {
          setRows((prev) =>
            prev.map((r) => (r.id === rowId ? { ...r, rateLoading: false } : r))
          );
        }
      } catch {
        setRows((prev) =>
          prev.map((r) => (r.id === rowId ? { ...r, rateLoading: false } : r))
        );
      }
    },
    []
  );

  function updateRow(id: string, field: keyof EntryRow, value: string) {
    setRows((prev) => {
      const updated = prev.map((r) => {
        if (r.id !== id) return r;
        const newRow = { ...r, [field]: value };
        // If country or date changed, trigger rate lookup
        if (field === "countryCode" || field === "entryDate") {
          const cc = field === "countryCode" ? value : r.countryCode;
          const dt = field === "entryDate" ? value : r.entryDate;
          if (cc && dt) {
            setTimeout(() => lookupRate(id, cc, dt), 0);
          } else {
            newRow.ieepaRate = null;
          }
        }
        return newRow;
      });
      return updated;
    });
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(id: string) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  }

  async function calculate() {
    const validRows = rows.filter((r) => r.countryCode && r.entryDate && r.enteredValue);
    if (validRows.length === 0) return;

    setCalculating(true);
    setResults(null);
    setSummary(null);

    try {
      const res = await fetch("/api/tariff/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: validRows.map((r) => ({
            countryOfOrigin: r.countryCode,
            entryDate: r.entryDate,
            enteredValue: Number(r.enteredValue),
            entryNumber: r.entryNumber || undefined,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data.entries || []);
        setSummary(data.summary || null);
      }
    } catch {
      // silent
    }
    setCalculating(false);
  }

  async function saveAsDraft() {
    setSaving(true);
    setSaveMsg("");
    try {
      // Create dossier
      const dRes = await fetch("/api/partner/dossiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientCompany: "Quick Estimate Draft",
          source: "portal",
        }),
      });
      if (dRes.ok) {
        setSaveMsg("Saved as draft dossier!");
      } else {
        const err = await dRes.json().catch(() => ({}));
        setSaveMsg((err as { error?: string }).error || "Failed to save");
      }
    } catch {
      setSaveMsg("Network error");
    }
    setSaving(false);
  }

  function exportCSV() {
    if (!results?.length) return;
    const header = "Entry #,Country,Date,Entered Value,IEEPA Rate,Est. Refund,Est. Interest,Eligibility,Deadline Days\n";
    const csvRows = results.map((r) =>
      [
        r.entryNumber || "",
        r.countryOfOrigin,
        r.entryDate,
        r.enteredValue,
        (r.combinedRate * 100).toFixed(1) + "%",
        r.estimatedDuty.toFixed(2),
        r.estimatedInterest.toFixed(2),
        r.eligibility.status,
        r.eligibility.deadlineDays ?? "",
      ].join(",")
    );
    const blob = new Blob([header + csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tariff-estimate-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const validCount = rows.filter((r) => r.countryCode && r.entryDate && r.enteredValue).length;

  return (
    <div className="space-y-6">
      {/* Entry rows */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-body font-semibold text-sm">Entry Data</h3>
          <button
            onClick={addRow}
            className="font-body text-[12px] px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
          >
            + Add Row
          </button>
        </div>

        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <div className="min-w-[700px] px-4 sm:px-0">
            {/* Table header */}
            <div className="grid grid-cols-[120px_160px_130px_140px_100px_40px] gap-2 mb-2">
              <div className="font-body text-[10px] text-[var(--app-text-muted)] tracking-wider uppercase">Entry #</div>
              <div className="font-body text-[10px] text-[var(--app-text-muted)] tracking-wider uppercase">Country</div>
              <div className="font-body text-[10px] text-[var(--app-text-muted)] tracking-wider uppercase">Entry Date</div>
              <div className="font-body text-[10px] text-[var(--app-text-muted)] tracking-wider uppercase">Entered Value</div>
              <div className="font-body text-[10px] text-[var(--app-text-muted)] tracking-wider uppercase">IEEPA Rate</div>
              <div />
            </div>

            {rows.map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-[120px_160px_130px_140px_100px_40px] gap-2 mb-2 items-center"
              >
                <input
                  type="text"
                  value={row.entryNumber}
                  onChange={(e) => updateRow(row.id, "entryNumber", e.target.value)}
                  placeholder="Optional"
                  className="font-body text-[13px] px-2.5 py-2 rounded-lg bg-[var(--app-card-bg)] border border-[var(--app-border)] text-[var(--app-text)] placeholder:text-[var(--app-text-muted)]/40 focus:outline-none focus:border-brand-gold/40"
                />
                <select
                  value={row.countryCode}
                  onChange={(e) => updateRow(row.id, "countryCode", e.target.value)}
                  className="font-body text-[13px] px-2.5 py-2 rounded-lg bg-[var(--app-card-bg)] border border-[var(--app-border)] text-[var(--app-text)] focus:outline-none focus:border-brand-gold/40 appearance-none"
                >
                  <option value="">Select...</option>
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={row.entryDate}
                  onChange={(e) => updateRow(row.id, "entryDate", e.target.value)}
                  className="font-body text-[13px] px-2.5 py-2 rounded-lg bg-[var(--app-card-bg)] border border-[var(--app-border)] text-[var(--app-text)] focus:outline-none focus:border-brand-gold/40"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  value={row.enteredValue}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9.]/g, "");
                    updateRow(row.id, "enteredValue", v);
                  }}
                  placeholder="$0"
                  className="font-body text-[13px] px-2.5 py-2 rounded-lg bg-[var(--app-card-bg)] border border-[var(--app-border)] text-[var(--app-text)] placeholder:text-[var(--app-text-muted)]/40 focus:outline-none focus:border-brand-gold/40"
                />
                <div
                  className={`font-body text-[13px] px-2.5 py-2 rounded-lg text-center ${
                    row.rateLoading
                      ? "bg-blue-500/5 text-blue-400 animate-pulse"
                      : row.ieepaRate !== null
                      ? "bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold"
                      : "bg-[var(--app-card-bg)] text-[var(--app-text-muted)]/40"
                  }`}
                >
                  {row.rateLoading
                    ? "..."
                    : row.ieepaRate !== null
                    ? `${(row.ieepaRate * 100).toFixed(0)}%`
                    : "—"}
                </div>
                <button
                  onClick={() => removeRow(row.id)}
                  className="text-[var(--app-text-muted)] hover:text-red-400 transition-colors text-sm p-1"
                  title="Remove row"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={calculate}
          disabled={validCount === 0 || calculating}
          className="font-body text-[13px] font-medium px-5 py-2.5 rounded-lg bg-brand-gold text-black hover:bg-brand-gold/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {calculating ? "Calculating..." : `Calculate (${validCount})`}
        </button>
        <button
          onClick={saveAsDraft}
          disabled={saving}
          className="font-body text-[13px] px-4 py-2.5 rounded-lg bg-white/5 border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-white/10 transition-colors disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save as Draft"}
        </button>
        {results && results.length > 0 && (
          <button
            onClick={exportCSV}
            className="font-body text-[13px] px-4 py-2.5 rounded-lg bg-white/5 border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-white/10 transition-colors"
          >
            Generate CAPE CSV
          </button>
        )}
      </div>

      {saveMsg && (
        <p className={`font-body text-[12px] ${saveMsg.includes("Saved") ? "text-green-400" : "text-red-400"}`}>
          {saveMsg}
        </p>
      )}

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard
            label="Est. Refund"
            value={fmt$(summary.totalEstimatedRefund)}
            color="green"
          />
          <SummaryCard
            label="Est. Interest"
            value={fmt$(summary.totalEstimatedInterest)}
            color="blue"
          />
          <SummaryCard
            label="Your Commission"
            value={fmt$(summary.totalEstimatedRefund * commissionRate * 0.20)}
            sub={`${(commissionRate * 100).toFixed(0)}% rate`}
            color="purple"
          />
          <SummaryCard
            label="Nearest Deadline"
            value={
              summary.nearestDeadlineDays !== null && summary.nearestDeadlineDays !== undefined
                ? `${summary.nearestDeadlineDays} days`
                : "N/A"
            }
            color={
              summary.nearestDeadlineDays !== null &&
              summary.nearestDeadlineDays !== undefined &&
              summary.nearestDeadlineDays <= 90
                ? "red"
                : "gray"
            }
          />
        </div>
      )}

      {/* Results table */}
      {results && results.length > 0 && (
        <div>
          <h3 className="font-body font-semibold text-sm mb-3">Results</h3>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-[var(--app-border)]">
                  {["#", "Country", "Date", "Value", "Rate", "Refund", "Interest", "Status", "Deadline"].map((h) => (
                    <th
                      key={h}
                      className="font-body text-[10px] text-[var(--app-text-muted)] tracking-wider uppercase text-left py-2 px-3 first:pl-4"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr
                    key={i}
                    className={`border-b border-[var(--app-border)]/50 ${
                      i % 2 === 1 ? "bg-[rgba(59,130,246,0.02)]" : ""
                    }`}
                  >
                    <td className="font-body text-[13px] py-2.5 px-3 pl-4 text-[var(--app-text-muted)]">
                      {r.entryNumber || r.index + 1}
                    </td>
                    <td className="font-body text-[13px] py-2.5 px-3 text-[var(--app-text)]">
                      {COUNTRY_FLAGS[r.countryOfOrigin] || ""} {r.countryOfOrigin}
                    </td>
                    <td className="font-body text-[13px] py-2.5 px-3 text-[var(--app-text-secondary)]">
                      {fmtDate(r.entryDate)}
                    </td>
                    <td className="font-body text-[13px] py-2.5 px-3 text-[var(--app-text)]">
                      {fmt$(r.enteredValue)}
                    </td>
                    <td className="font-body text-[13px] py-2.5 px-3 font-semibold text-blue-400">
                      {(r.combinedRate * 100).toFixed(0)}%
                    </td>
                    <td className="font-body text-[13px] py-2.5 px-3 font-semibold text-green-400">
                      {fmt$(r.estimatedDuty)}
                    </td>
                    <td className="font-body text-[13px] py-2.5 px-3 text-blue-400">
                      {fmt$(r.estimatedInterest)}
                    </td>
                    <td className="py-2.5 px-3">
                      <EligibilityBadge status={r.eligibility.status} />
                    </td>
                    <td className="font-body text-[13px] py-2.5 px-3">
                      {r.eligibility.deadlineDays != null ? (
                        <span
                          className={
                            r.eligibility.isUrgent
                              ? "text-red-400 font-semibold"
                              : "text-[var(--app-text-muted)]"
                          }
                        >
                          {r.eligibility.deadlineDays}d
                        </span>
                      ) : (
                        <span className="text-[var(--app-text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 2 — BULK UPLOAD
   ═══════════════════════════════════════════════════════════════════════════ */

function BulkUploadTab({ commissionRate }: { commissionRate: number }) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<string[][] | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [results, setResults] = useState<CalcResult[] | null>(null);
  const [summary, setSummary] = useState<CalcSummary | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function processFile(f: File) {
    setFile(f);
    setResults(null);
    setSummary(null);
    setError("");

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) {
        setError("Could not read file");
        return;
      }
      const parsed = parseCSV(text);
      if (parsed.length < 2) {
        setError("File must contain a header row and at least one data row");
        return;
      }
      setHeaders(parsed[0]);
      setParsedRows(parsed.slice(1));
    };
    reader.readAsText(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  }

  function loadDemoData() {
    const demoHeaders = ["Entry Number", "Country", "Entry Date", "Entered Value"];
    const demoRows = DEMO_CSV_ROWS.map((r) => [r.entryNumber, r.countryCode, r.entryDate, r.enteredValue]);
    setFile(null);
    setHeaders(demoHeaders);
    setParsedRows(demoRows);
    setResults(null);
    setSummary(null);
    setError("");
  }

  async function calculateAll() {
    if (!parsedRows?.length || !headers.length) return;
    setCalculating(true);
    setError("");

    const colMap = autoMapColumns(headers);
    const entries = parsedRows
      .map((row) => ({
        entryNumber: colMap.entryNumber >= 0 ? row[colMap.entryNumber] : undefined,
        countryOfOrigin: colMap.country >= 0 ? row[colMap.country] : "",
        entryDate: colMap.date >= 0 ? row[colMap.date] : "",
        enteredValue: colMap.value >= 0 ? Number(row[colMap.value]?.replace(/[^0-9.]/g, "")) : 0,
      }))
      .filter((e) => e.countryOfOrigin && e.entryDate && e.enteredValue > 0);

    if (entries.length === 0) {
      setError("No valid entries found. Check column mapping.");
      setCalculating(false);
      return;
    }

    try {
      const res = await fetch("/api/tariff/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data.entries || []);
        setSummary(data.summary || null);
      } else {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error || "Calculation failed");
      }
    } catch {
      setError("Network error");
    }
    setCalculating(false);
  }

  function exportResults() {
    if (!results?.length) return;
    const header = "Entry #,Country,Date,Value,IEEPA Rate,Est. Refund,Est. Interest,Eligibility,Deadline Days\n";
    const csvRows = results.map((r) =>
      [
        r.entryNumber || "",
        r.countryOfOrigin,
        r.entryDate,
        r.enteredValue,
        (r.combinedRate * 100).toFixed(1) + "%",
        r.estimatedDuty.toFixed(2),
        r.estimatedInterest.toFixed(2),
        r.eligibility.status,
        r.eligibility.deadlineDays ?? "",
      ].join(",")
    );
    const blob = new Blob([header + csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tariff-bulk-results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      {!parsedRows && (
        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-brand-gold/60 bg-brand-gold/5"
                : "border-[var(--app-border)] hover:border-[var(--app-text-muted)]/30"
            }`}
          >
            <div className="text-3xl mb-3">📁</div>
            <p className="font-body text-sm text-[var(--app-text-secondary)] mb-1">
              Drag & drop your file here, or click to browse
            </p>
            <p className="font-body text-[11px] text-[var(--app-text-muted)]">
              Accepts .csv, .tsv files with entry data
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={handleFileInput}
              className="hidden"
            />
          </div>

          <div className="text-center">
            <button
              onClick={loadDemoData}
              className="font-body text-[12px] px-4 py-2 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors"
            >
              Try with Demo Data
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="font-body text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Preview table */}
      {parsedRows && !results && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-body font-semibold text-sm">
              Preview ({parsedRows.length} rows)
              {file && (
                <span className="font-normal text-[var(--app-text-muted)] ml-2">
                  {file.name}
                </span>
              )}
            </h3>
            <button
              onClick={() => {
                setParsedRows(null);
                setHeaders([]);
                setFile(null);
              }}
              className="font-body text-[12px] text-[var(--app-text-muted)] hover:text-red-400 transition-colors"
            >
              Clear
            </button>
          </div>

          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-[var(--app-border)]">
                  {headers.map((h, i) => (
                    <th
                      key={i}
                      className="font-body text-[10px] text-[var(--app-text-muted)] tracking-wider uppercase text-left py-2 px-3"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedRows.slice(0, 20).map((row, ri) => (
                  <tr
                    key={ri}
                    className={`border-b border-[var(--app-border)]/50 ${
                      ri % 2 === 1 ? "bg-[rgba(59,130,246,0.02)]" : ""
                    }`}
                  >
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className="font-body text-[13px] py-2 px-3 text-[var(--app-text-secondary)]"
                      >
                        {cell || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
                {parsedRows.length > 20 && (
                  <tr>
                    <td
                      colSpan={headers.length}
                      className="font-body text-[12px] text-[var(--app-text-muted)] py-3 px-3 text-center"
                    >
                      ... and {parsedRows.length - 20} more rows
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={calculateAll}
              disabled={calculating}
              className="font-body text-[13px] font-medium px-5 py-2.5 rounded-lg bg-brand-gold text-black hover:bg-brand-gold/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {calculating ? "Calculating..." : `Calculate All (${parsedRows.length})`}
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {results && results.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-body font-semibold text-sm">Results ({results.length} entries)</h3>
            <button
              onClick={() => {
                setResults(null);
                setSummary(null);
                setParsedRows(null);
                setHeaders([]);
                setFile(null);
              }}
              className="font-body text-[12px] text-[var(--app-text-muted)] hover:text-red-400 transition-colors"
            >
              Start Over
            </button>
          </div>

          {/* Summary cards */}
          {summary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <SummaryCard label="Est. Refund" value={fmt$(summary.totalEstimatedRefund)} color="green" />
              <SummaryCard label="Est. Interest" value={fmt$(summary.totalEstimatedInterest)} color="blue" />
              <SummaryCard
                label="Your Commission"
                value={fmt$(summary.totalEstimatedRefund * commissionRate * 0.20)}
                sub={`${(commissionRate * 100).toFixed(0)}% rate`}
                color="purple"
              />
              <SummaryCard
                label="Nearest Deadline"
                value={
                  summary.nearestDeadlineDays != null
                    ? `${summary.nearestDeadlineDays} days`
                    : "N/A"
                }
                color={
                  summary.nearestDeadlineDays != null && summary.nearestDeadlineDays <= 90
                    ? "red"
                    : "gray"
                }
              />
            </div>
          )}

          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-[var(--app-border)]">
                  {["#", "Country", "Date", "Value", "Rate", "Refund", "Interest", "Status", "Deadline"].map((h) => (
                    <th
                      key={h}
                      className="font-body text-[10px] text-[var(--app-text-muted)] tracking-wider uppercase text-left py-2 px-3"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr
                    key={i}
                    className={`border-b border-[var(--app-border)]/50 ${
                      i % 2 === 1 ? "bg-[rgba(59,130,246,0.02)]" : ""
                    }`}
                  >
                    <td className="font-body text-[13px] py-2.5 px-3 text-[var(--app-text-muted)]">
                      {r.entryNumber || r.index + 1}
                    </td>
                    <td className="font-body text-[13px] py-2.5 px-3 text-[var(--app-text)]">
                      {COUNTRY_FLAGS[r.countryOfOrigin] || ""} {r.countryOfOrigin}
                    </td>
                    <td className="font-body text-[13px] py-2.5 px-3 text-[var(--app-text-secondary)]">
                      {fmtDate(r.entryDate)}
                    </td>
                    <td className="font-body text-[13px] py-2.5 px-3 text-[var(--app-text)]">
                      {fmt$(r.enteredValue)}
                    </td>
                    <td className="font-body text-[13px] py-2.5 px-3 font-semibold text-blue-400">
                      {(r.combinedRate * 100).toFixed(0)}%
                    </td>
                    <td className="font-body text-[13px] py-2.5 px-3 font-semibold text-green-400">
                      {fmt$(r.estimatedDuty)}
                    </td>
                    <td className="font-body text-[13px] py-2.5 px-3 text-blue-400">
                      {fmt$(r.estimatedInterest)}
                    </td>
                    <td className="py-2.5 px-3">
                      <EligibilityBadge status={r.eligibility.status} />
                    </td>
                    <td className="font-body text-[13px] py-2.5 px-3">
                      {r.eligibility.deadlineDays != null ? (
                        <span className={r.eligibility.isUrgent ? "text-red-400 font-semibold" : "text-[var(--app-text-muted)]"}>
                          {r.eligibility.deadlineDays}d
                        </span>
                      ) : (
                        <span className="text-[var(--app-text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bulk actions */}
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={exportResults}
              className="font-body text-[13px] px-4 py-2.5 rounded-lg bg-white/5 border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-white/10 transition-colors"
            >
              Export CSV
            </button>
            <button
              onClick={() => {
                // Save as dossier — fire and forget
                fetch("/api/partner/dossiers", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    clientCompany: file?.name?.replace(/\.[^.]+$/, "") || "Bulk Upload",
                    source: "csv_upload",
                  }),
                }).catch(() => {});
              }}
              className="font-body text-[13px] px-4 py-2.5 rounded-lg bg-white/5 border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-white/10 transition-colors"
            >
              Save as Dossier
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 3 — DOCUMENT INTAKE (AI) — Coming Soon
   ═══════════════════════════════════════════════════════════════════════════ */

function DocumentAiTab() {
  return (
    <div className="py-12 text-center">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[11px] font-body font-medium mb-4">
        Coming Soon
      </div>
      <div className="text-4xl mb-4">🤖</div>
      <h3 className="font-display text-lg font-semibold mb-2">
        AI Document Intake
      </h3>
      <p className="font-body text-[13px] text-[var(--app-text-muted)] max-w-md mx-auto leading-relaxed">
        Upload CF 7501 entry summaries, ACE reports, and commercial invoices.
        AI will automatically extract entry data, classify HTS codes, and
        calculate refund eligibility — no manual data entry required.
      </p>
      <div className="mt-6 space-y-2 max-w-sm mx-auto">
        {[
          { icon: "📋", text: "CF 7501 Entry Summaries" },
          { icon: "🏛️", text: "ACE Portal Reports" },
          { icon: "📄", text: "Commercial Invoices" },
          { icon: "📦", text: "Bills of Lading" },
        ].map((item) => (
          <div
            key={item.text}
            className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white/3 border border-[var(--app-border)]"
          >
            <span className="text-lg">{item.icon}</span>
            <span className="font-body text-[13px] text-[var(--app-text-muted)]">
              {item.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 4 — MY DOSSIERS
   ═══════════════════════════════════════════════════════════════════════════ */

function DossiersTab() {
  const [dossiers, setDossiers] = useState<DossierRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/partner/dossiers")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.dossiers) setDossiers(data.dossiers);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 bg-[var(--app-card-bg)] rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (dossiers.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="text-4xl mb-3">📁</div>
        <p className="font-body text-sm text-[var(--app-text-muted)]">
          No dossiers yet. Use Quick Estimate or Bulk Upload to create one.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full min-w-[700px]">
        <thead>
          <tr className="border-b border-[var(--app-border)]">
            {["Client Company", "Entries", "Est. Refund", "Status", "Source", "Created"].map((h) => (
              <th
                key={h}
                className="font-body text-[10px] text-[var(--app-text-muted)] tracking-wider uppercase text-left py-2 px-3 first:pl-4"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dossiers.map((d, i) => {
            const st = STATUS_BADGE[d.status] || STATUS_BADGE.draft;
            return (
              <tr
                key={d.id}
                className={`border-b border-[var(--app-border)]/50 hover:bg-white/3 transition-colors ${
                  i % 2 === 1 ? "bg-[rgba(59,130,246,0.02)]" : ""
                }`}
              >
                <td className="font-body text-[13px] py-3 px-3 pl-4 text-[var(--app-text)] font-medium">
                  {d.clientCompany}
                </td>
                <td className="font-body text-[13px] py-3 px-3 text-[var(--app-text-secondary)]">
                  {d._count?.entries ?? 0}
                </td>
                <td className="font-body text-[13px] py-3 px-3 font-semibold text-green-400">
                  {d.estimatedRefund ? fmt$(d.estimatedRefund) : "—"}
                </td>
                <td className="py-3 px-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${st.bg} ${st.text}`}
                  >
                    {st.label}
                  </span>
                </td>
                <td className="font-body text-[13px] py-3 px-3 text-[var(--app-text-muted)] capitalize">
                  {d.source?.replace(/_/g, " ") || "—"}
                </td>
                <td className="font-body text-[13px] py-3 px-3 text-[var(--app-text-muted)]">
                  {fmtDate(d.createdAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

function SummaryCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: "green" | "blue" | "purple" | "red" | "gray";
}) {
  const colors = {
    green:  { bg: "bg-green-500/10",  border: "border-green-500/20",  text: "text-green-400" },
    blue:   { bg: "bg-blue-500/10",   border: "border-blue-500/20",   text: "text-blue-400" },
    purple: { bg: "bg-purple-500/10", border: "border-purple-500/20", text: "text-purple-400" },
    red:    { bg: "bg-red-500/10",    border: "border-red-500/20",    text: "text-red-400" },
    gray:   { bg: "bg-white/5",       border: "border-white/10",      text: "text-[var(--app-text-secondary)]" },
  };
  const c = colors[color];

  return (
    <div className={`rounded-xl p-4 ${c.bg} border ${c.border}`}>
      <div className="font-body text-[10px] text-[var(--app-text-muted)] tracking-wider uppercase mb-1">
        {label}
      </div>
      <div className={`font-display text-lg font-bold ${c.text}`}>{value}</div>
      {sub && (
        <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5">
          {sub}
        </div>
      )}
    </div>
  );
}

function EligibilityBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    eligible: "bg-green-500/10 text-green-400",
    ineligible: "bg-red-500/10 text-red-400",
    partial: "bg-yellow-500/10 text-yellow-400",
    error: "bg-red-500/10 text-red-400",
    pending: "bg-white/5 text-white/60",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-body font-medium ${
        styles[status] || styles.pending
      }`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
