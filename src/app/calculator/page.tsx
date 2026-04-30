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

interface CalcResult {
  summary: CalcSummary;
  entries: CalcEntry[];
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
            </div>

            {/* CTA buttons */}
            <div className="p-6 flex flex-col sm:flex-row gap-3">
              <Link
                href="/apply"
                className="flex-1 h-12 rounded-xl font-semibold text-base flex items-center justify-center gap-2 transition-all duration-200"
                style={{
                  background: "var(--accent-gradient)",
                  color: "#ffffff",
                  boxShadow: "0 4px 14px rgba(79,110,247,0.3)",
                }}
              >
                Submit This Client
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
              <button
                onClick={handleReset}
                className="flex-1 h-12 rounded-xl font-semibold text-base border transition-all duration-200"
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
        </section>
      )}

      {/* ── Below the fold — stats + sign in ─────────────────────── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
          {[
            {
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                </svg>
              ),
              title: "$3.4T+",
              desc: "In IEEPA tariffs assessed since April 2025",
            },
            {
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              ),
              title: "180 Days",
              desc: "Protest filing deadline from liquidation date",
            },
            {
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              ),
              title: "Act Now",
              desc: "Deadlines are expiring daily — every day costs your clients money",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-xl border p-5 text-center"
              style={{
                background: "var(--app-card-bg)",
                borderColor: "var(--app-card-border)",
              }}
            >
              <div
                className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center"
                style={{
                  background: "var(--app-gold-overlay)",
                  color: "var(--brand-gold)",
                }}
              >
                {item.icon}
              </div>
              <p className="text-xl font-bold mb-1" style={{ color: "var(--app-text)" }}>
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
      </footer>
    </div>
  );
}

/* ── Page wrapper with Suspense for useSearchParams ────────────────── */

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
