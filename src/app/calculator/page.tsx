"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

/* ── Types ──────────────────────────────────────────────────────────── */

interface Country {
  code: string;
  name: string;
  periods: Array<{
    rateType: string;
    rate: unknown;
    effectiveDate: string;
    endDate: string | null;
    executiveOrder: string;
    name: string;
  }>;
}

interface CalcEntry {
  index: number;
  countryOfOrigin: string;
  entryDate: string;
  enteredValue: number;
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
  routingBucket?: "self_file" | "legal_required" | "not_applicable";
}

interface CalcSummary {
  entryCount: number;
  eligibleCount: number;
  excludedCount: number;
  urgentCount: number;
  totalEnteredValue: number;
  totalEstRefund: number;
  totalEstInterest: number;
  nearestDeadline: string | null;
  deadlineDays: number | null;
}

interface RoutingBucketSummary {
  count: number;
  totalRefund: number;
  totalInterest: number;
}

interface RoutingSummary {
  selfFile: RoutingBucketSummary;
  legalRequired: RoutingBucketSummary;
  notApplicable: RoutingBucketSummary;
}

interface CalcResult {
  summary: CalcSummary;
  entries: CalcEntry[];
  routingSummary?: RoutingSummary;
}

interface AuditCheck {
  id: string;
  category: "format" | "entry" | "eligibility" | "risk";
  severity: "error" | "warning" | "info";
  passed: boolean;
  message: string;
  detail?: string;
  entryIndex?: number;
  entryNumber?: string;
  fix?: string;
}

interface AuditResult {
  passed: boolean;
  score: number;
  checks: AuditCheck[];
  errors: AuditCheck[];
  warnings: AuditCheck[];
  info: AuditCheck[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

/* ── Country flag emoji helper ─────────────────────────────────────── */

function countryFlag(code: string): string {
  if (!code || code.length !== 2) return "";
  const codePoints = code
    .toUpperCase()
    .split("")
    .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65);
  return String.fromCodePoint(...codePoints);
}

/* ── Currency formatting ───────────────────────────────────────────── */

const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const usdFmtFull = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatInputValue(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("en-US");
}

function parseInputValue(formatted: string): number {
  return Number(formatted.replace(/[^0-9]/g, "")) || 0;
}

/* ── Entry type options ────────────────────────────────────────────── */

const ENTRY_TYPES = [
  { value: "01", label: "01 - Consumption (standard)" },
  { value: "03", label: "03 - Consumption (antidumping/CVD)" },
  { value: "06", label: "06 - Consumption (FTZ)" },
  { value: "11", label: "11 - Informal" },
  { value: "21", label: "21 - Warehouse" },
  { value: "22", label: "22 - Re-warehouse" },
];

/* ── Inner calculator component ───────────────────────────────────── */

function CalculatorInner() {
  const searchParams = useSearchParams();

  // ── UTM persistence ────────────────────────────────────────────────
  useEffect(() => {
    const utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
    const utms: Record<string, string> = {};
    let hasUtm = false;
    for (const k of utmKeys) {
      const v = searchParams.get(k);
      if (v) {
        utms[k] = v;
        hasUtm = true;
      }
    }
    if (hasUtm) {
      try {
        localStorage.setItem("tie_utm", JSON.stringify(utms));
      } catch {}
    }
  }, [searchParams]);

  // ── State ──────────────────────────────────────────────────────────
  const [countries, setCountries] = useState<Country[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [countryError, setCountryError] = useState<string | null>(null);

  const [country, setCountry] = useState("");
  const [entryDate, setEntryDate] = useState("2025-06-15");
  const [valueInput, setValueInput] = useState("");
  const [numEntries, setNumEntries] = useState("1");
  const [entryType, setEntryType] = useState("01");

  const [calculating, setCalculating] = useState(false);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [auditExpanded, setAuditExpanded] = useState(false);

  const resultsRef = useRef<HTMLDivElement>(null);

  // ── Load countries ─────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/tariff/rates")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setCountries(data.countries || []);
        // Default to China if available
        const cn = (data.countries || []).find(
          (c: Country) => c.code === "CN",
        );
        if (cn) setCountry("CN");
        else if (data.countries?.length) setCountry(data.countries[0].code);
      })
      .catch((err) => {
        setCountryError("Failed to load country data. Please refresh.");
        console.error("[calculator] rates error:", err);
      })
      .finally(() => setLoadingCountries(false));
  }, []);

  // ── Calculate ──────────────────────────────────────────────────────
  const handleCalculate = useCallback(async () => {
    const enteredValue = parseInputValue(valueInput);
    if (!country) return setCalcError("Select a country of origin.");
    if (!entryDate) return setCalcError("Enter the customs entry date.");
    if (!enteredValue || enteredValue <= 0) return setCalcError("Enter a valid entered value.");

    setCalcError(null);
    setCalculating(true);
    setResult(null);
    setAuditResult(null);
    setAuditExpanded(false);
    setShowResults(false);

    const count = Math.max(1, Math.min(500, parseInt(numEntries) || 1));

    // Build entries array — replicate single entry for the count
    const entries = Array.from({ length: count }, () => ({
      countryOfOrigin: country,
      entryDate,
      enteredValue: enteredValue / count, // distribute across entries
      entryType,
    }));

    try {
      const res = await fetch("/api/tariff/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Server error (${res.status})`);
      }

      const data: CalcResult = await res.json();
      setResult(data);

      // Fire-and-forget audit call — graceful degradation on failure
      const entriesPayload = entries.map((e) => ({
        ...e,
        ieepaRate: data.entries[0]?.combinedRate ?? 0,
      }));
      fetch("/api/tariff/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: entriesPayload }),
      })
        .then((r) => r.json())
        .then((audit: AuditResult) => setAuditResult(audit))
        .catch(() => {});

      // Persist to localStorage for /apply flow
      try {
        localStorage.setItem(
          "tie_calculator_results",
          JSON.stringify({
            country,
            entryDate,
            enteredValue,
            numEntries: count,
            entryType,
            summary: data.summary,
            timestamp: Date.now(),
          }),
        );
      } catch {}

      // Animate in
      requestAnimationFrame(() => {
        setShowResults(true);
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Calculation failed";
      setCalcError(msg);
    } finally {
      setCalculating(false);
    }
  }, [country, entryDate, valueInput, numEntries, entryType]);

  const handleReset = useCallback(() => {
    setResult(null);
    setShowResults(false);
    setCalcError(null);
  }, []);

  // ── Derived values ─────────────────────────────────────────────────
  const selectedCountry = countries.find((c) => c.code === country);
  const commissionRate = 0.2;
  const commission = result ? result.summary.totalEstRefund * commissionRate : 0;

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)" }}>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, #060a14 0%, #0c1a32 40%, #0f1f3d 60%, #060a14 100%)",
          }}
        />
        {/* Decorative grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        {/* Gold accent orb */}
        <div
          className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-[0.08]"
          style={{ background: "radial-gradient(circle, var(--brand-gold) 0%, transparent 70%)" }}
        />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 pt-16 pb-12 text-center">
          {/* Logo / brand */}
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full border" style={{ borderColor: "var(--app-gold-overlay-border)", background: "var(--app-gold-overlay)" }}>
            <div className="w-2 h-2 rounded-full" style={{ background: "var(--brand-gold)" }} />
            <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--app-gold-text)" }}>
              Fintella Tariff Intelligence
            </span>
          </div>

          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-4"
            style={{
              fontFamily: '"DM Serif Display", serif',
              color: "rgba(255,255,255,0.95)",
            }}
          >
            How Much Are Your Clients Owed?
          </h1>

          <p
            className="text-lg sm:text-xl max-w-2xl mx-auto mb-2"
            style={{ color: "rgba(255,255,255,0.7)" }}
          >
            Free IEEPA tariff refund estimate — results in 30 seconds
          </p>
          <p
            className="text-sm max-w-xl mx-auto"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            No signup required. Enter one client&#39;s import data below and see their estimated refund instantly.
          </p>
        </div>
      </section>

      {/* ── Calculator Form ──────────────────────────────────────── */}
      <section className="relative -mt-4 z-10 max-w-3xl mx-auto px-4 sm:px-6">
        <div
          className="rounded-2xl border p-6 sm:p-8"
          style={{
            background: "var(--app-bg-secondary)",
            borderColor: "var(--app-card-border)",
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.4)",
          }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
              style={{ background: "var(--app-gold-overlay)", border: "1px solid var(--app-gold-overlay-border)" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--brand-gold)" }}>
                <rect x="4" y="2" width="16" height="20" rx="2" />
                <line x1="8" y1="6" x2="16" y2="6" />
                <line x1="8" y1="10" x2="16" y2="10" />
                <line x1="8" y1="14" x2="12" y2="14" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: "var(--app-text)" }}>
                Refund Calculator
              </h2>
              <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>
                Estimate IEEPA duty refund + interest for a single client
              </p>
            </div>
          </div>

          {countryError && (
            <div className="mb-4 p-3 rounded-lg border text-sm" style={{ background: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.2)", color: "#ef4444" }}>
              {countryError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {/* Country */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--app-text-secondary)" }}>
                Country of Origin
              </label>
              {loadingCountries ? (
                <div
                  className="h-11 rounded-lg animate-pulse"
                  style={{ background: "var(--app-input-bg)" }}
                />
              ) : (
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg border text-sm appearance-none cursor-pointer"
                  style={{
                    background: "var(--app-input-bg)",
                    borderColor: "var(--app-input-border)",
                    color: "var(--app-input-text)",
                  }}
                >
                  <option value="">Select country...</option>
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {countryFlag(c.code)} {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Entry date */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--app-text-secondary)" }}>
                Entry Date
              </label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border text-sm"
                style={{
                  background: "var(--app-input-bg)",
                  borderColor: "var(--app-input-border)",
                  color: "var(--app-input-text)",
                  colorScheme: "dark",
                }}
              />
            </div>

            {/* Total entered value */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--app-text-secondary)" }}>
                Total Entered Value (USD)
              </label>
              <div className="relative">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  $
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="500,000"
                  value={valueInput}
                  onChange={(e) => setValueInput(formatInputValue(e.target.value))}
                  className="w-full h-11 pl-7 pr-3 rounded-lg border text-sm"
                  style={{
                    background: "var(--app-input-bg)",
                    borderColor: "var(--app-input-border)",
                    color: "var(--app-input-text)",
                  }}
                />
              </div>
            </div>

            {/* Number of entries */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--app-text-secondary)" }}>
                Number of Entries
              </label>
              <input
                type="number"
                min={1}
                max={500}
                value={numEntries}
                onChange={(e) => setNumEntries(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border text-sm"
                style={{
                  background: "var(--app-input-bg)",
                  borderColor: "var(--app-input-border)",
                  color: "var(--app-input-text)",
                }}
              />
            </div>

            {/* Entry type */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--app-text-secondary)" }}>
                Entry Type
              </label>
              <select
                value={entryType}
                onChange={(e) => setEntryType(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border text-sm appearance-none cursor-pointer"
                style={{
                  background: "var(--app-input-bg)",
                  borderColor: "var(--app-input-border)",
                  color: "var(--app-input-text)",
                }}
              >
                {ENTRY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Error */}
          {calcError && (
            <div className="mb-4 p-3 rounded-lg border text-sm" style={{ background: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.2)", color: "#ef4444" }}>
              {calcError}
            </div>
          )}

          {/* Calculate button */}
          <button
            onClick={handleCalculate}
            disabled={calculating || loadingCountries}
            className="w-full h-12 rounded-xl font-semibold text-base transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: calculating
                ? "var(--app-input-bg)"
                : "linear-gradient(135deg, #16a34a, #15803d)",
              color: calculating ? "var(--app-text-muted)" : "#ffffff",
              boxShadow: calculating
                ? "none"
                : "0 4px 14px rgba(22,163,74,0.3)",
            }}
          >
            {calculating ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                  <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
                </svg>
                Calculating...
              </span>
            ) : (
              "Calculate Refund"
            )}
          </button>
        </div>
      </section>

      {/* ── Results Card ─────────────────────────────────────────── */}
      {result && (
        <section
          ref={resultsRef}
          className="max-w-3xl mx-auto px-4 sm:px-6 mt-8 mb-12 transition-all duration-500"
          style={{
            opacity: showResults ? 1 : 0,
            transform: showResults ? "translateY(0)" : "translateY(20px)",
          }}
        >
          <div
            className="rounded-2xl border overflow-hidden"
            style={{
              background: "var(--app-bg-secondary)",
              borderColor: "var(--app-card-border)",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.4)",
            }}
          >
            {/* Big refund number */}
            <div
              className="p-6 sm:p-8 text-center"
              style={{
                background:
                  "linear-gradient(135deg, rgba(22,163,74,0.1) 0%, rgba(16,185,129,0.05) 100%)",
                borderBottom: "1px solid var(--app-card-border)",
              }}
            >
              <p className="text-sm font-medium mb-2" style={{ color: "var(--app-text-muted)" }}>
                Estimated IEEPA Refund
              </p>
              <p
                className="text-4xl sm:text-5xl font-bold tracking-tight mb-2"
                style={{ color: "#22c55e" }}
              >
                {usdFmt.format(result.summary.totalEstRefund)}
              </p>
              <p className="text-lg" style={{ color: "var(--app-text-secondary)" }}>
                + {usdFmtFull.format(result.summary.totalEstInterest)} estimated interest
              </p>

              {selectedCountry && (
                <p className="text-sm mt-3" style={{ color: "var(--app-text-muted)" }}>
                  {countryFlag(selectedCountry.code)} {selectedCountry.name} &middot;{" "}
                  {result.entries[0] && (
                    <span>
                      {(result.entries[0].combinedRate * 100).toFixed(0)}% combined IEEPA rate
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* Stats row */}
            <div
              className="grid grid-cols-3 divide-x"
              style={{
                borderBottom: "1px solid var(--app-card-border)",
                // @ts-expect-error CSS custom property for divide color
                "--tw-divide-opacity": "1",
              }}
            >
              {[
                {
                  label: "Total Entries",
                  value: result.summary.entryCount.toLocaleString(),
                },
                {
                  label: "Eligible",
                  value: result.summary.eligibleCount.toLocaleString(),
                  accent: "#22c55e",
                },
                {
                  label: "Expiring Soon",
                  value: result.summary.urgentCount.toLocaleString(),
                  accent: result.summary.urgentCount > 0 ? "#ef4444" : undefined,
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="p-4 text-center"
                  style={{ borderColor: "var(--app-card-border)" }}
                >
                  <p className="text-xs font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
                    {stat.label}
                  </p>
                  <p
                    className="text-xl font-bold"
                    style={{ color: stat.accent || "var(--app-text)" }}
                  >
                    {stat.label === "Expiring Soon" && result.summary.urgentCount > 0 && (
                      <span className="inline-block mr-1" title="Urgent">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="inline -mt-0.5" style={{ color: "#ef4444" }}>
                          <path d="M12 2L1 21h22L12 2zm0 4l7.53 13H4.47L12 6zm-1 5v4h2v-4h-2zm0 6v2h2v-2h-2z" />
                        </svg>
                      </span>
                    )}
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Deadline warning */}
            {result.summary.deadlineDays != null && result.summary.deadlineDays > 0 && (
              <div
                className="mx-6 mt-4 p-3 rounded-lg border flex items-center gap-3"
                style={{
                  background: "rgba(239,68,68,0.08)",
                  borderColor: "rgba(239,68,68,0.2)",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <p className="text-sm" style={{ color: "#ef4444" }}>
                  <strong>{result.summary.urgentCount} {result.summary.urgentCount === 1 ? "entry" : "entries"}</strong> expiring within{" "}
                  <strong>{result.summary.deadlineDays} days</strong> — file protest before the deadline
                </p>
              </div>
            )}

            {/* Rate breakdown */}
            {result.entries[0] && (
              <div className="px-6 pt-4">
                <p className="text-xs font-medium mb-2" style={{ color: "var(--app-text-muted)" }}>
                  Rate Breakdown
                </p>
                <div className="flex flex-wrap gap-2">
                  {result.entries[0].rateBreakdown.fentanyl != null && (
                    <span
                      className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium"
                      style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}
                    >
                      Fentanyl: {(result.entries[0].rateBreakdown.fentanyl * 100).toFixed(0)}%
                    </span>
                  )}
                  {result.entries[0].rateBreakdown.reciprocal != null && (
                    <span
                      className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium"
                      style={{ background: "rgba(79,110,247,0.1)", color: "#4f6ef7" }}
                    >
                      Reciprocal: {(result.entries[0].rateBreakdown.reciprocal * 100).toFixed(0)}%
                    </span>
                  )}
                  {result.entries[0].rateBreakdown.section122 != null && (
                    <span
                      className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium"
                      style={{ background: "rgba(139,92,246,0.1)", color: "#8b5cf6" }}
                    >
                      Section 122: {(result.entries[0].rateBreakdown.section122 * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Commission preview */}
            <div
              className="mx-6 mt-4 p-4 rounded-xl border"
              style={{
                background:
                  "linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(79,110,247,0.04) 100%)",
                borderColor: "rgba(139,92,246,0.15)",
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium" style={{ color: "var(--app-text-muted)" }}>
                    Your Commission
                  </p>
                  <p
                    className="text-2xl font-bold"
                    style={{ color: "#8b5cf6" }}
                  >
                    {usdFmt.format(commission)}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
                    style={{
                      background: "rgba(139,92,246,0.15)",
                      color: "#a78bfa",
                    }}
                  >
                    {(commissionRate * 100).toFixed(0)}% referral fee
                  </span>
                </div>
              </div>
              <p className="text-xs mt-2" style={{ color: "var(--app-text-faint)" }}>
                Commission rates vary by partnership tier and agreement. Displayed rate is illustrative only.
              </p>
            </div>

            {/* Calculate Another button */}
            <div className="p-6">
              <button
                onClick={handleReset}
                className="w-full h-12 rounded-xl font-semibold text-base border transition-all duration-200"
                style={{
                  borderColor: "var(--app-border)",
                  color: "var(--app-text-secondary)",
                  background: "transparent",
                }}
              >
                Calculate Another Client
              </button>
            </div>
          </div>

          {/* Disclaimer A — below results card */}
          <p className="text-xs mt-4 px-2" style={{ color: "var(--app-text-faint)" }}>
            These estimates are for informational purposes only and do not constitute legal, tax, or customs advice. Actual refund amounts are determined by CBP and may differ. Fintella is not a law firm, customs broker, or licensed professional. Consult a qualified professional before making filing decisions.
          </p>

          {/* ── Pre-Submission Audit Score ───────────────────────────── */}
          {auditResult && (
            <div className="mt-8">
              <div
                className="rounded-xl border p-5"
                style={{
                  borderColor: auditResult.score >= 80
                    ? "rgba(34,197,94,0.3)"
                    : auditResult.score >= 50
                      ? "rgba(234,179,8,0.3)"
                      : "rgba(239,68,68,0.3)",
                  background: auditResult.score >= 80
                    ? "rgba(34,197,94,0.05)"
                    : auditResult.score >= 50
                      ? "rgba(234,179,8,0.05)"
                      : "rgba(239,68,68,0.05)",
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold"
                      style={{
                        background: auditResult.score >= 80
                          ? "rgba(34,197,94,0.15)"
                          : auditResult.score >= 50
                            ? "rgba(234,179,8,0.15)"
                            : "rgba(239,68,68,0.15)",
                        color: auditResult.score >= 80
                          ? "#22c55e"
                          : auditResult.score >= 50
                            ? "#eab308"
                            : "#ef4444",
                      }}
                    >
                      {auditResult.score}
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--app-text)" }}>
                        Pre-Submission Audit: {auditResult.score}/100
                      </p>
                      <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>
                        Passed {auditResult.summary.passed} of {auditResult.summary.total} checks
                        {auditResult.summary.warnings > 0 && (
                          <span style={{ color: "#eab308" }}>
                            {" "}&middot; {auditResult.summary.warnings} warning{auditResult.summary.warnings !== 1 ? "s" : ""}
                          </span>
                        )}
                        {auditResult.summary.failed > 0 && (
                          <span style={{ color: "#ef4444" }}>
                            {" "}&middot; {auditResult.summary.failed} error{auditResult.summary.failed !== 1 ? "s" : ""}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setAuditExpanded(!auditExpanded)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                    style={{
                      background: "var(--app-input-bg)",
                      color: "var(--app-text-secondary)",
                      border: "1px solid var(--app-border)",
                    }}
                  >
                    {auditExpanded ? "Hide Details" : "View Details"}
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="inline ml-1 transition-transform"
                      style={{ transform: auditExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                </div>

                {/* Expanded audit details */}
                {auditExpanded && (
                  <div className="mt-3 pt-3 space-y-4" style={{ borderTop: "1px solid var(--app-border)" }}>
                    {(["format", "entry", "eligibility", "risk"] as const).map((category) => {
                      const categoryChecks = auditResult.checks.filter((c) => c.category === category);
                      if (categoryChecks.length === 0) return null;
                      const categoryLabel = {
                        format: "Format",
                        entry: "Entry",
                        eligibility: "Eligibility",
                        risk: "Risk",
                      }[category];
                      return (
                        <div key={category}>
                          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--app-text-muted)" }}>
                            {categoryLabel}
                          </p>
                          <div className="space-y-1.5">
                            {categoryChecks.map((check, idx) => (
                              <div key={`${check.id}-${idx}`} className="flex items-start gap-2">
                                <span className="flex-shrink-0 mt-0.5">
                                  {check.severity === "error" && !check.passed ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#ef4444"><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>
                                  ) : check.severity === "warning" ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#eab308"><path d="M12 2L1 21h22L12 2z" /><text x="12" y="18" textAnchor="middle" fill="#000" fontSize="14" fontWeight="bold">!</text></svg>
                                  ) : (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#22c55e"><circle cx="12" cy="12" r="10" /><path d="M8 12l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                  )}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs" style={{ color: "var(--app-text-secondary)" }}>
                                    {check.message}
                                  </p>
                                  {check.fix && !check.passed && (
                                    <p className="text-xs mt-0.5" style={{ color: "var(--app-text-faint)" }}>
                                      Fix: {check.fix}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Audit disclaimer */}
                <p className="text-xs mt-3" style={{ color: "var(--app-text-faint)" }}>
                  This audit checks for common CAPE filing errors based on publicly available CBP guidance. It does not guarantee acceptance by CBP.
                </p>
              </div>
            </div>
          )}

          {/* ── Three-Option Routing ────────────────────────────────── */}
          {result.routingSummary && (() => {
            const selfCount = result.routingSummary!.selfFile.count;
            const legalCount = result.routingSummary!.legalRequired.count;
            const totalEligible = selfCount + legalCount;
            const totalRefund = result.routingSummary!.selfFile.totalRefund + result.routingSummary!.legalRequired.totalRefund;
            const naCount = result.routingSummary!.notApplicable.count;

            return (
              <div className="mt-8">
                <h3 className="text-lg font-semibold mb-4" style={{ color: "var(--app-text)" }}>
                  Filing Options
                </h3>

                {/* ── Option 1: RECOMMENDED — Full Legal Review (full width) ── */}
                <div
                  className="relative rounded-xl border-2 p-6 mb-4"
                  style={{
                    borderColor: "rgba(139,92,246,0.5)",
                    background: "rgba(139,92,246,0.05)",
                  }}
                >
                  {/* Star badge */}
                  <div
                    className="absolute -top-3 right-4 px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase"
                    style={{
                      background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
                      color: "#ffffff",
                      boxShadow: "0 2px 8px rgba(139,92,246,0.3)",
                    }}
                  >
                    RECOMMENDED
                  </div>

                  <h4 className="text-base font-semibold mb-2" style={{ color: "var(--app-text)" }}>
                    Full Legal Review + Filing Support
                  </h4>
                  <p className="text-sm mb-4" style={{ color: "var(--app-text-secondary)" }}>
                    Submit all {totalEligible} {totalEligible === 1 ? "entry" : "entries"} ({usdFmt.format(totalRefund)} estimated refund) to our legal partner. They review your data, coordinate CAPE filing, handle any rejections, file protective CIT claims, and fight offset diversions.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mb-5">
                    {[
                      "Pre-filing compliance review",
                      "Offset defense (19 CFR §24.72)",
                      "Rejection handling — instant CIT escalation",
                      "Interest verification — maximize recovery",
                      "Protective CIT filing for deadline protection",
                      "$0 upfront — contingency-based",
                    ].map((item) => (
                      <div key={item} className="flex items-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="#22c55e" className="flex-shrink-0">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M8 12l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="text-sm" style={{ color: "var(--app-text-secondary)" }}>
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => {
                      try {
                        localStorage.setItem(
                          "tie_legal_submission",
                          JSON.stringify({
                            country,
                            entryDate,
                            enteredValue: parseInputValue(valueInput),
                            numEntries: Math.max(1, Math.min(500, parseInt(numEntries) || 1)),
                            entryType,
                            summary: result.summary,
                            routingSummary: result.routingSummary,
                            entries: result.entries,
                            auditResult: auditResult || null,
                            timestamp: Date.now(),
                          }),
                        );
                      } catch {}
                      window.location.href = "/apply";
                    }}
                    className="w-full h-12 rounded-xl font-semibold text-base flex items-center justify-center gap-2 transition-all duration-200"
                    style={{
                      background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
                      color: "#ffffff",
                      boxShadow: "0 4px 14px rgba(139,92,246,0.3)",
                    }}
                  >
                    Submit All Entries for Legal Review
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </button>

                  {/* Disclaimer C — Legal referral */}
                  <p className="text-xs mt-3" style={{ color: "var(--app-text-faint)" }}>
                    By submitting, you authorize Fintella to share this entry data with our vetted legal partner for review. This is a referral, not legal representation. Attorney-client relationship is established directly with the legal partner. Referral fee per AZ Admin. Order 2020-180.
                  </p>
                </div>

                {/* ── Options 2 & 3 side-by-side ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Option 2: Self-File */}
                  <div
                    className="rounded-xl border p-5"
                    style={{
                      borderColor: "var(--app-card-border)",
                      background: "var(--app-card-bg)",
                    }}
                  >
                    <h4 className="text-sm font-semibold mb-1" style={{ color: "var(--app-text)" }}>
                      Self-File ({selfCount} eligible {selfCount === 1 ? "entry" : "entries"})
                    </h4>
                    <p className="text-xs mb-3" style={{ color: "var(--app-text-muted)" }}>
                      Download CAPE CSV and file yourself in ACE Portal.
                      {legalCount > 0 && (
                        <span>
                          {" "}{legalCount} {legalCount === 1 ? "entry needs" : "entries need"} legal counsel and {legalCount === 1 ? "is" : "are"} not included.
                        </span>
                      )}
                    </p>

                    <div className="space-y-1.5 mb-4">
                      {[
                        "No offset protection",
                        "No rejection handling",
                        "No compliance review",
                      ].map((item) => (
                        <div key={item} className="flex items-center gap-2">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                            <path d="M12 2L1 21h22L12 2zM12 9v4M12 17h.01" />
                          </svg>
                          <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>
                            {item}
                          </span>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => {
                        // Filter to self-file entries with entry numbers
                        const selfEntries = result.entries.filter(
                          (e) => e.routingBucket === "self_file",
                        );
                        // Public calculator entries won't have entry numbers —
                        // inform user that entry numbers are required
                        const withNumbers = selfEntries.filter(
                          (e) => (e as unknown as { entryNumber?: string }).entryNumber,
                        );
                        if (withNumbers.length === 0) {
                          alert(
                            "Entry numbers required for CAPE CSV. Use the partner portal for full filing package.",
                          );
                          return;
                        }
                        // Generate CSV
                        const csv = "Entry Number\n" + withNumbers
                          .map((e) => (e as unknown as { entryNumber: string }).entryNumber)
                          .join("\n");
                        const blob = new Blob([csv], { type: "text/csv" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `cape-entries-${new Date().toISOString().slice(0, 10)}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="w-full h-10 rounded-lg text-sm font-medium border transition-colors flex items-center justify-center gap-2"
                      style={{
                        borderColor: "var(--app-border)",
                        color: "var(--app-text-secondary)",
                        background: "transparent",
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Download CAPE CSV
                    </button>
                  </div>

                  {/* Option 3: Split Approach */}
                  {selfCount > 0 && legalCount > 0 && (
                    <div
                      className="rounded-xl border p-5"
                      style={{
                        borderColor: "var(--app-card-border)",
                        background: "var(--app-card-bg)",
                      }}
                    >
                      <h4 className="text-sm font-semibold mb-1" style={{ color: "var(--app-text)" }}>
                        Split Approach
                      </h4>
                      <p className="text-xs mb-3" style={{ color: "var(--app-text-muted)" }}>
                        Self-file {selfCount} eligible {selfCount === 1 ? "entry" : "entries"} ({usdFmt.format(result.routingSummary!.selfFile.totalRefund)}).
                        Submit {legalCount} complex {legalCount === 1 ? "entry" : "entries"} ({usdFmt.format(result.routingSummary!.legalRequired.totalRefund)}) to legal partner.
                      </p>

                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => {
                            const selfEntries = result.entries.filter(
                              (e) => e.routingBucket === "self_file",
                            );
                            const withNumbers = selfEntries.filter(
                              (e) => (e as unknown as { entryNumber?: string }).entryNumber,
                            );
                            if (withNumbers.length === 0) {
                              alert(
                                "Entry numbers required for CAPE CSV. Use the partner portal for full filing package.",
                              );
                              return;
                            }
                            const csv = "Entry Number\n" + withNumbers
                              .map((e) => (e as unknown as { entryNumber: string }).entryNumber)
                              .join("\n");
                            const blob = new Blob([csv], { type: "text/csv" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `cape-entries-${new Date().toISOString().slice(0, 10)}.csv`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="w-full h-10 rounded-lg text-sm font-medium border transition-colors flex items-center justify-center gap-2"
                          style={{
                            borderColor: "var(--app-border)",
                            color: "var(--app-text-secondary)",
                            background: "transparent",
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                          Download CSV
                        </button>
                        <button
                          onClick={() => {
                            try {
                              localStorage.setItem(
                                "tie_legal_submission",
                                JSON.stringify({
                                  country,
                                  entryDate,
                                  enteredValue: parseInputValue(valueInput),
                                  numEntries: legalCount,
                                  entryType,
                                  summary: result.summary,
                                  routingSummary: result.routingSummary,
                                  entries: result.entries.filter(
                                    (e) => e.routingBucket === "legal_required",
                                  ),
                                  auditResult: auditResult || null,
                                  timestamp: Date.now(),
                                }),
                              );
                            } catch {}
                            window.location.href = "/apply";
                          }}
                          className="w-full h-10 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                          style={{
                            background: "rgba(139,92,246,0.15)",
                            color: "#a78bfa",
                            border: "1px solid rgba(139,92,246,0.25)",
                          }}
                        >
                          Submit Complex to Legal
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* If no split scenario, fill second column with Not Applicable info */}
                  {(selfCount === 0 || legalCount === 0) && naCount > 0 && (
                    <div
                      className="rounded-xl border p-5"
                      style={{
                        borderColor: "var(--app-card-border)",
                        background: "var(--app-card-bg)",
                      }}
                    >
                      <h4 className="text-sm font-semibold mb-1" style={{ color: "var(--app-text-muted)" }}>
                        {naCount} Not Applicable
                      </h4>
                      <p className="text-xs" style={{ color: "var(--app-text-faint)" }}>
                        These entries do not qualify for an IEEPA tariff refund under current regulations. Estimated value: {usdFmt.format(result.routingSummary!.notApplicable.totalRefund)}.
                      </p>
                    </div>
                  )}
                </div>

                {/* Not Applicable — shown below if split scenario used the second column */}
                {selfCount > 0 && legalCount > 0 && naCount > 0 && (
                  <div
                    className="rounded-xl border p-4 mt-4"
                    style={{
                      borderColor: "rgba(107,114,128,0.2)",
                      background: "rgba(107,114,128,0.03)",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm" style={{ opacity: 0.5 }}>&#x26AA;</span>
                      <span className="text-sm" style={{ color: "var(--app-text-muted)" }}>
                        {naCount} {naCount === 1 ? "entry" : "entries"} not applicable for IEEPA refund ({usdFmt.format(result.routingSummary!.notApplicable.totalRefund)})
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </section>
      )}

      {/* ── Lead Capture + PDF Offer ─────────────────────────────── */}
      {showResults && result && (
        <LeadCaptureSection totalRefund={result.summary.totalEstRefund + result.summary.totalEstInterest} />
      )}

      {/* ── Broker Partnership CTA ─────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <div
          className="rounded-2xl border overflow-hidden"
          style={{
            borderColor: "var(--brand-gold)",
            background: "linear-gradient(135deg, rgba(176,140,48,0.08), rgba(176,140,48,0.02))",
          }}
        >
          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🤝</span>
              <span
                className="text-xs font-semibold tracking-widest uppercase"
                style={{ color: "var(--brand-gold)" }}
              >
                For Customs Brokers
              </span>
            </div>
            <h3
              className="text-xl sm:text-2xl font-bold mb-3"
              style={{ color: "var(--app-text)", fontFamily: "'DM Serif Display', Georgia, serif" }}
            >
              Turn Your Importer Book Into Passive Income
            </h3>
            <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--app-text-muted)" }}>
              Licensed customs brokers are earning <strong style={{ color: "var(--app-text)" }}>$5,000–$50,000/month</strong> in referral commissions
              by connecting their existing clients to IEEPA refund recovery. No cost to join. No risk. Your clients stay yours.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {[
                { num: "1", title: "Run the Calculator", desc: "Free estimate for any client — takes 30 seconds" },
                { num: "2", title: "Share the PDF", desc: "Professional Fintella-branded recovery analysis" },
                { num: "3", title: "Earn Commission", desc: "10–25% on every successful recovery" },
              ].map((step) => (
                <div key={step.num} className="flex items-start gap-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: "var(--brand-gold)", color: "#000" }}
                  >
                    <span className="text-xs font-bold">{step.num}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--app-text)" }}>{step.title}</p>
                    <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/apply"
                className="h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 px-6 transition-all duration-200"
                style={{
                  background: "var(--brand-gold)",
                  color: "#000",
                  boxShadow: "0 4px 14px rgba(176,140,48,0.3)",
                }}
              >
                Apply to Become a Partner
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
              <Link
                href="/partners/brokers"
                className="h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 px-6 border transition-colors"
                style={{
                  borderColor: "var(--brand-gold)",
                  color: "var(--brand-gold)",
                  background: "transparent",
                }}
              >
                Learn More
              </Link>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-12 mb-12">
          {[
            { title: "$166B", desc: "Available in IEEPA refunds" },
            { title: "83%", desc: "Of eligible importers haven't filed" },
            { title: "80 Days", desc: "Protest window — entries expiring daily" },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-xl border p-5 text-center"
              style={{
                background: "var(--app-card-bg)",
                borderColor: "var(--app-card-border)",
              }}
            >
              <p
                className="text-2xl font-bold mb-1"
                style={{ color: "var(--brand-gold)", fontFamily: "'DM Serif Display', Georgia, serif" }}
              >
                {item.title}
              </p>
              <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>

        <div className="text-center">
          <p className="text-sm mb-1" style={{ color: "var(--app-text-muted)" }}>
            Already a Fintella partner?
          </p>
          <Link
            href="/login"
            className="text-sm font-semibold transition-colors"
            style={{ color: "var(--accent-blue)" }}
          >
            Sign in to your portal
          </Link>
        </div>
      </section>

      {/* ── Sticky bottom CTA bar ─────────────────────────────── */}
      {showResults && result && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 border-t py-3 px-4 flex items-center justify-between backdrop-blur-xl"
          style={{
            background: "rgba(6,10,20,0.95)",
            borderColor: "var(--brand-gold)",
          }}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">💰</span>
            <div>
              <p className="text-sm font-bold" style={{ color: "var(--brand-gold)" }}>
                {usdFmt.format(result.summary.totalEstRefund + result.summary.totalEstInterest)} estimated recovery
              </p>
              <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>
                {result.summary.eligibleCount} eligible entries
              </p>
            </div>
          </div>
          <Link
            href="/apply"
            className="h-9 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 px-4 shrink-0"
            style={{
              background: "var(--brand-gold)",
              color: "#000",
            }}
          >
            Get Started
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer
        className="border-t py-6 text-center"
        style={{
          borderColor: "var(--app-border-subtle)",
          color: "var(--app-text-faint)",
        }}
      >
        <p className="text-xs">
          &copy; {new Date().getFullYear()} Fintella &mdash; Financial Intelligence Network. All
          rights reserved.
        </p>
        <div className="mt-2 flex items-center justify-center gap-4">
          <Link href="/privacy" className="text-xs underline" style={{ color: "var(--app-text-faint)" }}>
            Privacy
          </Link>
          <Link href="/terms" className="text-xs underline" style={{ color: "var(--app-text-faint)" }}>
            Terms
          </Link>
        </div>
        {/* Disclaimer D — tariff rate sourcing */}
        <p className="text-xs mt-4 max-w-2xl mx-auto px-4" style={{ color: "var(--app-text-faint)" }}>
          IEEPA tariff rates sourced from Federal Register executive orders and CBP guidance. Rate data covers Feb 1, 2025 &ndash; Feb 23, 2026. Report errors to support@fintella.partners.
        </p>
      </footer>
    </div>
  );
}

/* ── Page wrapper with Suspense for useSearchParams ────────────────── */

function LeadCaptureSection({ totalRefund }: { totalRefund: number }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || submitting) return;
    setSubmitting(true);

    try {
      const searchParams = new URLSearchParams(window.location.search);
      await fetch("/api/calculator/lead-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
          estimatedRefund: totalRefund,
          source: "calculator",
          utm_source: searchParams.get("utm_source") || undefined,
          utm_medium: searchParams.get("utm_medium") || undefined,
          utm_campaign: searchParams.get("utm_campaign") || undefined,
          utm_content: searchParams.get("utm_content") || undefined,
        }),
      });
      setSubmitted(true);
    } catch {
      // silent — don't block the user experience
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div
          className="rounded-2xl border p-6 sm:p-8 text-center"
          style={{
            borderColor: "rgba(22,163,74,0.3)",
            background: "rgba(22,163,74,0.05)",
          }}
        >
          <div className="text-3xl mb-3">✅</div>
          <h3 className="text-lg font-bold mb-1" style={{ color: "var(--app-text)" }}>
            Analysis Saved
          </h3>
          <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>
            We&apos;ll follow up with a detailed recovery analysis. Check your inbox.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div
        className="rounded-2xl border p-6 sm:p-8"
        style={{
          borderColor: "var(--brand-gold)",
          background: "linear-gradient(135deg, rgba(176,140,48,0.06), rgba(176,140,48,0.01))",
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">📄</span>
          <h3
            className="text-lg font-bold"
            style={{ color: "var(--app-text)", fontFamily: "'DM Serif Display', Georgia, serif" }}
          >
            Get Your Full Recovery Analysis
          </h3>
        </div>
        <p className="text-sm mb-5" style={{ color: "var(--app-text-muted)" }}>
          Enter your email to receive a professional PDF summary you can share with your clients — includes entry breakdown, audit score, filing deadlines, and recommended next steps.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="h-11 rounded-lg border px-4 text-sm flex-1"
            style={{
              background: "var(--app-input-bg)",
              borderColor: "var(--app-border)",
              color: "var(--app-text)",
            }}
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email address"
            required
            className="h-11 rounded-lg border px-4 text-sm flex-1"
            style={{
              background: "var(--app-input-bg)",
              borderColor: "var(--app-border)",
              color: "var(--app-text)",
            }}
          />
          <button
            type="submit"
            disabled={submitting || !email.trim()}
            className="h-11 rounded-lg font-semibold text-sm px-6 shrink-0 transition-all disabled:opacity-40"
            style={{
              background: "var(--brand-gold)",
              color: "#000",
              boxShadow: "0 4px 14px rgba(176,140,48,0.3)",
            }}
          >
            {submitting ? "Sending..." : "Email My Analysis"}
          </button>
        </form>
        <p className="text-xs mt-3" style={{ color: "var(--app-text-faint)" }}>
          No spam. One follow-up with your results. Unsubscribe anytime.
        </p>
      </div>
    </section>
  );
}

export default function CalculatorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)" }}>
          <div className="animate-spin h-8 w-8 rounded-full border-2" style={{ borderColor: "var(--app-border)", borderTopColor: "var(--brand-gold)" }} />
        </div>
      }
    >
      <CalculatorInner />
    </Suspense>
  );
}
