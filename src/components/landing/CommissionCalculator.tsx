"use client";

import { useState, useMemo } from "react";

/**
 * Interactive commission calculator — #1 CRO element per research.
 * Visitor enters estimated avg client fee + monthly deal count. Live-
 * computes direct commission + downline override potential.
 */
export default function CommissionCalculator() {
  const [avgFee, setAvgFee] = useState(100_000); // avg firm fee per deal
  const [dealsPerMonth, setDealsPerMonth] = useState(3);
  const [downlineDeals, setDownlineDeals] = useState(0); // monthly downline deals you get override on

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

  const { directMonthly, overrideMonthly, totalMonthly, yearly } = useMemo(() => {
    const direct = avgFee * 0.2 * dealsPerMonth; // 20% of each
    const override = avgFee * 0.05 * downlineDeals; // 5% override
    return {
      directMonthly: direct,
      overrideMonthly: override,
      totalMonthly: direct + override,
      yearly: (direct + override) * 12,
    };
  }, [avgFee, dealsPerMonth, downlineDeals]);

  return (
    <div className="card p-6 sm:p-8 space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-[var(--brand-gold)] font-semibold mb-1">
          Commission Calculator
        </div>
        <h3 className="font-display text-2xl sm:text-3xl font-bold">
          What could your network be worth?
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SliderField
          label="Avg firm fee per deal"
          value={avgFee}
          onChange={setAvgFee}
          min={10_000}
          max={1_000_000}
          step={5_000}
          format={fmt}
        />
        <SliderField
          label="Deals you refer / month"
          value={dealsPerMonth}
          onChange={setDealsPerMonth}
          min={0}
          max={20}
          step={1}
          format={(v) => `${v} ${v === 1 ? "deal" : "deals"}`}
        />
        <SliderField
          label="Downline deals / month"
          value={downlineDeals}
          onChange={setDownlineDeals}
          min={0}
          max={30}
          step={1}
          format={(v) => `${v} ${v === 1 ? "deal" : "deals"}`}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
        <CalcCard label="Direct commission / month" value={fmt(directMonthly)} hint="20% of each deal you refer" />
        <CalcCard label="Downline override / month" value={fmt(overrideMonthly)} hint="5% override on each downline deal" />
        <CalcCard label="Projected annual earnings" value={fmt(yearly)} hint="Total × 12" highlight />
      </div>

      <p className="text-xs text-[var(--app-text-muted)] text-center">
        Illustrative estimates. Real commissions are calculated per-deal through the portal's 3-phase ledger and paid upon firm collection.
      </p>
    </div>
  );
}

function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}) {
  return (
    <label className="block space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs uppercase tracking-wider text-[var(--app-text-muted)]">{label}</span>
        <span className="font-display font-bold text-[var(--brand-gold)]">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--brand-gold)]"
      />
    </label>
  );
}

function CalcCard({ label, value, hint, highlight }: { label: string; value: string; hint: string; highlight?: boolean }) {
  return (
    <div className={`p-4 rounded-xl border ${highlight ? "bg-[var(--brand-gold)]/10 border-[var(--brand-gold)]/40" : "border-[var(--app-border)] bg-[var(--app-bg)]"}`}>
      <div className="text-xs uppercase tracking-wider text-[var(--app-text-muted)]">{label}</div>
      <div className={`font-display text-2xl sm:text-3xl font-bold mt-1 ${highlight ? "text-[var(--brand-gold)]" : ""}`}>{value}</div>
      <div className="text-xs text-[var(--app-text-muted)] mt-1">{hint}</div>
    </div>
  );
}
