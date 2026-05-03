"use client";

import { useState } from "react";

interface Props {
  splitRate: number;
}

const FIRM_FEE_RATE = 0.25;

export default function HeroCalculator({ splitRate }: Props) {
  const [dutyInput, setDutyInput] = useState("");
  const [result, setResult] = useState<{
    refund: number;
    firmFee: number;
    yourCommission: number;
  } | null>(null);

  const calculate = () => {
    const cleaned = dutyInput.replace(/[,$\s]/g, "");
    const duty = parseFloat(cleaned);
    if (isNaN(duty) || duty <= 0) return;
    const refund = duty;
    const firmFee = refund * FIRM_FEE_RATE;
    const yourCommission = firmFee * (splitRate / 100);
    setResult({ refund, firmFee, yourCommission });
  };

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div
      className="max-w-2xl mx-auto mb-10 rounded-2xl overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid var(--app-border)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        className="px-5 py-3 flex items-center gap-2 text-xs font-semibold tracking-widest uppercase"
        style={{
          background: "var(--app-gold-overlay)",
          color: "var(--app-gold-text)",
          borderBottom: "1px solid var(--app-gold-overlay-border)",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <line x1="8" y1="6" x2="16" y2="6" />
          <line x1="8" y1="10" x2="10" y2="10" />
          <line x1="14" y1="10" x2="16" y2="10" />
          <line x1="8" y1="14" x2="10" y2="14" />
        </svg>
        Try It Now — Instant Refund Estimate
      </div>

      <div className="p-6">
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="flex-1">
            <label
              className="block text-xs font-medium tracking-wider uppercase mb-2"
              style={{ color: "var(--app-text-muted)" }}
            >
              Client&apos;s IEEPA Duties Paid
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={dutyInput}
              onChange={(e) => {
                setDutyInput(e.target.value);
                setResult(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && calculate()}
              placeholder="e.g. $250,000"
              className="w-full px-4 py-3 rounded-lg text-base font-medium"
              style={{
                background: "rgba(0,0,0,0.3)",
                border: "1px solid var(--app-border)",
                color: "var(--app-text)",
                outline: "none",
              }}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={calculate}
              className="w-full sm:w-auto px-8 py-3 rounded-lg text-sm font-bold transition-all hover:scale-105 active:scale-95"
              style={{
                background: "var(--brand-gold)",
                color: "var(--app-button-gold-text)",
              }}
            >
              Calculate
            </button>
          </div>
        </div>

        {result && (
          <div
            className="grid grid-cols-3 gap-4 pt-5"
            style={{ borderTop: "1px solid var(--app-border)" }}
          >
            <div className="text-center">
              <div
                className="text-xs font-medium tracking-wider uppercase mb-1"
                style={{ color: "var(--app-text-muted)" }}
              >
                Client Refund
              </div>
              <div
                className="text-xl sm:text-2xl font-bold font-display"
                style={{ color: "var(--app-text)" }}
              >
                {fmt(result.refund)}
              </div>
            </div>
            <div className="text-center">
              <div
                className="text-xs font-medium tracking-wider uppercase mb-1"
                style={{ color: "var(--app-text-muted)" }}
              >
                Firm Fee (25%)
              </div>
              <div
                className="text-xl sm:text-2xl font-bold font-display"
                style={{ color: "var(--app-text-secondary)" }}
              >
                {fmt(result.firmFee)}
              </div>
            </div>
            <div className="text-center">
              <div
                className="text-xs font-medium tracking-wider uppercase mb-1"
                style={{ color: "var(--brand-gold)" }}
              >
                Your Commission ({splitRate}%)
              </div>
              <div
                className="text-xl sm:text-2xl font-bold font-display"
                style={{ color: "var(--brand-gold)" }}
              >
                {fmt(result.yourCommission)}
              </div>
            </div>
          </div>
        )}

        {!result && (
          <div
            className="text-center text-xs pt-3"
            style={{ color: "var(--app-text-faint)" }}
          >
            Enter your client&apos;s IEEPA duty amount to see what you&apos;d earn
          </div>
        )}
      </div>
    </div>
  );
}
