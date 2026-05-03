"use client";

import { useState, useEffect, useCallback } from "react";

interface Country {
  code: string;
  name: string;
  flag: string;
}

interface CalcResult {
  refund: number;
  interest: number;
  total: number;
  rate: number;
  firmFee: number;
  commission: number;
  eligible: boolean;
  routingBucket: string;
  urgentDays: number | null;
}

const FIRM_FEE_RATE = 0.25;
const COMMISSION_RATE = 0.25;

export default function HeroCalculator() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState("CN");
  const [entryDate, setEntryDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    fetch("/api/tariff/rates")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.countries) setCountries(d.countries);
      })
      .catch(() => {});
  }, []);

  const calculate = async () => {
    const cleaned = value.replace(/[,$\s]/g, "");
    const num = parseFloat(cleaned);
    if (isNaN(num) || num <= 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/tariff/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: [{
            countryOfOrigin: country,
            entryDate,
            enteredValue: num,
            entryType: "01",
          }],
        }),
      });
      const data = await res.json();
      if (data?.entries?.[0]) {
        const e = data.entries[0];
        const refund = e.estimatedRefund || 0;
        const interest = e.estimatedInterest || 0;
        const total = refund + interest;
        setResult({
          refund,
          interest,
          total,
          rate: e.ieepaRate || 0,
          firmFee: total * FIRM_FEE_RATE,
          commission: total * FIRM_FEE_RATE * COMMISSION_RATE,
          eligible: e.eligible !== false,
          routingBucket: e.routingBucket || "legal_required",
          urgentDays: e.nearestDeadlineDays ?? null,
        });
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  };

  const handleDrop = useCallback((ev: React.DragEvent) => {
    ev.preventDefault();
    setDragOver(false);
  }, []);

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const selectedCountry = countries.find((c) => c.code === country);

  return (
    <div className="max-w-3xl mx-auto mb-10">
      <div
        className={`rounded-2xl overflow-hidden transition-all ${dragOver ? "ring-2 ring-[var(--brand-gold)]" : ""}`}
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid var(--app-border)",
          backdropFilter: "blur(12px)",
        }}
        onDragOver={(ev) => { ev.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {/* Header */}
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{
            background: "var(--app-gold-overlay)",
            borderBottom: "1px solid var(--app-gold-overlay-border)",
          }}
        >
          <div className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--app-gold-text)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="2" width="16" height="20" rx="2" />
              <line x1="8" y1="6" x2="16" y2="6" />
              <line x1="8" y1="10" x2="10" y2="10" />
              <line x1="14" y1="10" x2="16" y2="10" />
            </svg>
            Refund Calculator
          </div>
          <span className="text-[10px] tracking-wider uppercase" style={{ color: "var(--app-text-faint)" }}>
            {countries.length} countries &bull; Live IEEPA rates
          </span>
        </div>

        <div className="p-5">
          {/* Drag & drop zone */}
          <div
            className="mb-4 p-4 rounded-xl border-2 border-dashed text-center transition-colors cursor-pointer"
            style={{
              borderColor: dragOver ? "var(--brand-gold)" : "var(--app-border)",
              background: dragOver ? "rgba(196,160,80,0.05)" : "rgba(0,0,0,0.15)",
            }}
          >
            <div className="flex items-center justify-center gap-2 text-sm" style={{ color: "var(--app-text-muted)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Drop a CF 7501 or entry summary for instant analysis
            </div>
            <div className="text-[10px] mt-1" style={{ color: "var(--app-text-faint)" }}>
              Full document intake available after signup
            </div>
          </div>

          {/* Or manual entry */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px" style={{ background: "var(--app-border)" }} />
            <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--app-text-faint)" }}>or enter manually</span>
            <div className="flex-1 h-px" style={{ background: "var(--app-border)" }} />
          </div>

          {/* Country */}
          <div className="mb-3">
            <label className="block text-[10px] font-medium tracking-wider uppercase mb-1.5" style={{ color: "var(--app-text-muted)" }}>
              Country of Origin
            </label>
            <select
              value={country}
              onChange={(e) => { setCountry(e.target.value); setResult(null); }}
              className="w-full px-4 py-2.5 rounded-lg text-sm"
              style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--app-border)", color: "var(--app-text)", outline: "none" }}
            >
              {countries.length === 0 && <option value="CN">China</option>}
              {countries.map((c) => (
                <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
              ))}
            </select>
          </div>

          {/* Date + Value */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-[10px] font-medium tracking-wider uppercase mb-1.5" style={{ color: "var(--app-text-muted)" }}>Entry Date</label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => { setEntryDate(e.target.value); setResult(null); }}
                className="w-full px-4 py-2.5 rounded-lg text-sm"
                style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--app-border)", color: "var(--app-text)", outline: "none", colorScheme: "dark" }}
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium tracking-wider uppercase mb-1.5" style={{ color: "var(--app-text-muted)" }}>Total Entered Value (USD)</label>
              <input
                type="text"
                inputMode="numeric"
                value={value}
                onChange={(e) => { setValue(e.target.value); setResult(null); }}
                onKeyDown={(e) => e.key === "Enter" && calculate()}
                placeholder="$500,000"
                className="w-full px-4 py-2.5 rounded-lg text-sm"
                style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--app-border)", color: "var(--app-text)", outline: "none" }}
              />
            </div>
          </div>

          {/* Calculate */}
          <button
            onClick={calculate}
            disabled={loading || !value.trim()}
            className="w-full py-3 rounded-lg text-sm font-bold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)", color: "#fff" }}
          >
            {loading ? "Analyzing..." : "Calculate Refund"}
          </button>

          {/* ── Results: Full Client Summary ── */}
          {result && (
            <div className="mt-5 pt-5 space-y-4" style={{ borderTop: "1px solid var(--app-border)" }}>

              {/* Rate + Country */}
              <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: "rgba(0,0,0,0.2)" }}>
                <span className="text-xs uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>
                  {selectedCountry?.flag} {selectedCountry?.name || country} IEEPA Rate
                </span>
                <span className="font-display text-lg font-bold" style={{ color: "var(--app-text)" }}>
                  {(result.rate * 100).toFixed(0)}%
                </span>
              </div>

              {/* Financial Summary */}
              <div>
                <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--app-text-muted)" }}>
                  Client Summary
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: "Est. Duty Refund", value: fmt(result.refund), color: "var(--app-text)" },
                    { label: "Est. Interest", value: fmt(result.interest), color: "var(--app-text-secondary)" },
                    { label: "Total Recovery", value: fmt(result.total), color: "#22c55e" },
                    { label: "Your Commission", value: fmt(result.commission), color: "var(--brand-gold)" },
                  ].map((item) => (
                    <div key={item.label} className="text-center p-2.5 rounded-lg" style={{ background: "rgba(0,0,0,0.2)" }}>
                      <div className="text-[9px] font-medium tracking-wider uppercase mb-1" style={{ color: "var(--app-text-muted)" }}>{item.label}</div>
                      <div className="text-base sm:text-lg font-bold font-display" style={{ color: item.color }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Risk Analysis */}
              <div>
                <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--app-text-muted)" }}>
                  Risk Analysis
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* Eligibility */}
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ background: "rgba(0,0,0,0.2)" }}>
                    <div className={`w-2 h-2 rounded-full ${result.eligible ? "bg-emerald-400" : "bg-red-400"}`} />
                    <div>
                      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Eligibility</div>
                      <div className="text-xs font-medium" style={{ color: result.eligible ? "#22c55e" : "#ef4444" }}>
                        {result.eligible ? "Likely Eligible — Review Recommended" : "Review Needed"}
                      </div>
                    </div>
                  </div>

                  {/* Filing Path */}
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ background: "rgba(0,0,0,0.2)" }}>
                    <div className="w-2 h-2 rounded-full bg-blue-400" />
                    <div>
                      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Filing Path</div>
                      <div className="text-xs font-medium" style={{ color: "#60a5fa" }}>
                        {result.routingBucket === "self_file" ? "CAPE Phase 1" : "Legal Counsel Required"}
                      </div>
                    </div>
                  </div>

                  {/* Deadline */}
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ background: "rgba(0,0,0,0.2)" }}>
                    <div className={`w-2 h-2 rounded-full ${result.urgentDays !== null && result.urgentDays < 30 ? "bg-red-400" : "bg-amber-400"}`} />
                    <div>
                      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>180-Day Deadline</div>
                      <div className="text-xs font-medium" style={{ color: result.urgentDays !== null && result.urgentDays < 30 ? "#ef4444" : "#f59e0b" }}>
                        {result.urgentDays !== null ? `${result.urgentDays} days remaining` : "Clock is ticking"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* What Partners Get */}
              <div className="p-4 rounded-xl" style={{ background: "rgba(196,160,80,0.05)", border: "1px solid rgba(196,160,80,0.15)" }}>
                <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--brand-gold)" }}>
                  What You Get as a Partner
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {[
                    "AI-powered document intake",
                    "Detailed client refund report",
                    "19-point compliance audit",
                    "Full risk analysis per entry",
                    "Contingency-based legal backing",
                    "CIT litigation support if needed",
                    "Branded PDF for your clients",
                    "Commission on every recovery",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--app-text-secondary)" }}>
                      <span style={{ color: "var(--brand-gold)" }}>&#10003;</span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <div className="text-center pt-1">
                <a
                  href="#signup-form"
                  className="inline-block px-10 py-3 rounded-full text-sm font-bold transition-all hover:scale-105 active:scale-95"
                  style={{ background: "var(--brand-gold)", color: "var(--app-button-gold-text)" }}
                >
                  Become a Partner — Earn {fmt(result.commission)} on This Client
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-center text-[10px] mt-3 max-w-lg mx-auto leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
        Estimates based on published IEEPA executive order tariff rates for informational purposes only.
        A full entry-level review is still needed — actual amounts depend on CBP processing, entry data, and eligibility.
        Legal counsel is recommended before filing. This is not legal, tax, or compliance advice.
      </p>
    </div>
  );
}
