"use client";

import { useState, type FormEvent } from "react";

interface Props {
  token: string;
  commissionRate: number;
  onSubmitAsReferral: (data: { estimatedImportValue: string; importDateRange: string }) => void;
}

// Top importing countries affected by IEEPA — compact list for widget
const COUNTRIES = [
  { code: "CN", name: "China", flag: "\u{1F1E8}\u{1F1F3}" },
  { code: "VN", name: "Vietnam", flag: "\u{1F1FB}\u{1F1F3}" },
  { code: "TW", name: "Taiwan", flag: "\u{1F1F9}\u{1F1FC}" },
  { code: "IN", name: "India", flag: "\u{1F1EE}\u{1F1F3}" },
  { code: "TH", name: "Thailand", flag: "\u{1F1F9}\u{1F1ED}" },
  { code: "ID", name: "Indonesia", flag: "\u{1F1EE}\u{1F1E9}" },
  { code: "MY", name: "Malaysia", flag: "\u{1F1F2}\u{1F1FE}" },
  { code: "KR", name: "South Korea", flag: "\u{1F1F0}\u{1F1F7}" },
  { code: "JP", name: "Japan", flag: "\u{1F1EF}\u{1F1F5}" },
  { code: "DE", name: "Germany", flag: "\u{1F1E9}\u{1F1EA}" },
  { code: "GB", name: "United Kingdom", flag: "\u{1F1EC}\u{1F1E7}" },
  { code: "FR", name: "France", flag: "\u{1F1EB}\u{1F1F7}" },
  { code: "IT", name: "Italy", flag: "\u{1F1EE}\u{1F1F9}" },
  { code: "BD", name: "Bangladesh", flag: "\u{1F1E7}\u{1F1E9}" },
  { code: "KH", name: "Cambodia", flag: "\u{1F1F0}\u{1F1ED}" },
  { code: "PH", name: "Philippines", flag: "\u{1F1F5}\u{1F1ED}" },
  { code: "PK", name: "Pakistan", flag: "\u{1F1F5}\u{1F1F0}" },
  { code: "BR", name: "Brazil", flag: "\u{1F1E7}\u{1F1F7}" },
  { code: "CA", name: "Canada", flag: "\u{1F1E8}\u{1F1E6}" },
  { code: "MX", name: "Mexico", flag: "\u{1F1F2}\u{1F1FD}" },
];

interface CalcResult {
  countryOfOrigin: string;
  entryDate: string;
  enteredValue: number;
  ieepaRate: number;
  rateName: string;
  rateBreakdown: { fentanyl?: number; reciprocal?: number; section122?: number };
  ieepaDuty: number;
  estimatedInterest: number;
  estimatedRefund: number;
  eligibility: string;
  eligibilityReason: string;
}

export default function WidgetCalculator({ token, commissionRate, onSubmitAsReferral }: Props) {
  const [countryOfOrigin, setCountryOfOrigin] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [enteredValue, setEnteredValue] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCalculate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setCalculating(true);

    try {
      const res = await fetch("/api/widget/calculate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          countryOfOrigin,
          entryDate,
          enteredValue: parseFloat(enteredValue),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Calculation failed");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error");
    } finally {
      setCalculating(false);
    }
  };

  const handleReferral = () => {
    if (!result) return;

    // Map value to the range bucket used by referral form
    let valueBucket = "<$50K";
    if (result.enteredValue >= 2_000_000) valueBucket = "$2M+";
    else if (result.enteredValue >= 500_000) valueBucket = "$500K-$2M";
    else if (result.enteredValue >= 50_000) valueBucket = "$50K-$500K";

    onSubmitAsReferral({
      estimatedImportValue: valueBucket,
      importDateRange: result.entryDate,
    });
  };

  const fmtUsd = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <div className="p-4">
      <form onSubmit={handleCalculate} className="space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded px-3 py-2">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Country of Origin <span className="text-red-500">*</span>
          </label>
          <select
            required
            value={countryOfOrigin}
            onChange={(e) => setCountryOfOrigin(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
          >
            <option value="">Select country...</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Entry Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              required
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              min="2025-02-01"
              max="2026-02-23"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Entered Value (USD) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              required
              min="1"
              step="0.01"
              value={enteredValue}
              onChange={(e) => setEnteredValue(e.target.value)}
              placeholder="100,000"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={calculating}
          className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors text-sm"
        >
          {calculating ? "Calculating..." : "Calculate Refund"}
        </button>
      </form>

      {result && (
        <div className="mt-4 space-y-3">
          {/* Main refund card */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
            <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide mb-1">
              Estimated Refund
            </p>
            <p className="text-3xl font-bold text-emerald-700">
              {fmtUsd(result.estimatedRefund)}
            </p>
            <p className="text-xs text-emerald-500 mt-1">
              {fmtUsd(result.ieepaDuty)} duty + {fmtUsd(result.estimatedInterest)} interest
            </p>
          </div>

          {/* Rate breakdown */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Combined IEEPA Rate</span>
              <span className="font-semibold text-gray-800">{fmtPct(result.ieepaRate)}</span>
            </div>
            {result.rateBreakdown.fentanyl != null && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-400 pl-2">Fentanyl</span>
                <span className="text-gray-600">{fmtPct(result.rateBreakdown.fentanyl)}</span>
              </div>
            )}
            {result.rateBreakdown.reciprocal != null && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-400 pl-2">Reciprocal</span>
                <span className="text-gray-600">{fmtPct(result.rateBreakdown.reciprocal)}</span>
              </div>
            )}
            {result.rateBreakdown.section122 != null && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-400 pl-2">Section 122</span>
                <span className="text-gray-600">{fmtPct(result.rateBreakdown.section122)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs pt-1 border-t border-gray-200">
              <span className="text-gray-500">Eligibility</span>
              <span className={`font-medium ${result.eligibility === "eligible" ? "text-emerald-600" : "text-orange-600"}`}>
                {result.eligibility === "eligible" ? "Eligible" : "Review Needed"}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Your Commission</span>
              <span className="font-semibold text-amber-600">
                {fmtUsd(result.estimatedRefund * commissionRate / 100)}
              </span>
            </div>
          </div>

          {/* CTA button */}
          <button
            onClick={handleReferral}
            className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-lg transition-colors text-sm flex items-center justify-center gap-1.5"
          >
            Submit as Referral
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
