"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

function fmt$(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function EarningsCalculatorPage() {
  const { data: session } = useSession();
  const [commissionRate, setCommissionRate] = useState(0.25);
  const [tier, setTier] = useState("l1");

  // Inputs
  const [clientsPerMonth, setClientsPerMonth] = useState(5);
  const [avgDuties, setAvgDuties] = useState(500000);
  const [firmFeeRate, setFirmFeeRate] = useState(0.20);
  const [l2Partners, setL2Partners] = useState(0);
  const [l2ClientsPerMonth, setL2ClientsPerMonth] = useState(3);
  const [l2Rate, setL2Rate] = useState(0.15);

  useEffect(() => {
    fetch("/api/commissions").then((r) => r.ok ? r.json() : null).then((data) => {
      if (data?.commissionRate) setCommissionRate(data.commissionRate);
      if (data?.tier) setTier(data.tier);
    }).catch(() => {});
  }, []);

  // Calculations
  const avgRefund = avgDuties * 0.85;
  const avgFirmFee = avgRefund * firmFeeRate;
  const myRatePerDeal = avgFirmFee * commissionRate;
  const monthlyDirect = clientsPerMonth * myRatePerDeal;
  const yearlyDirect = monthlyDirect * 12;

  const l1Override = Math.max(0, commissionRate - l2Rate);
  const l2MonthlyPerPartner = l2ClientsPerMonth * avgFirmFee * l1Override;
  const totalL2Monthly = l2Partners * l2MonthlyPerPartner;
  const totalL2Yearly = totalL2Monthly * 12;

  const totalMonthly = monthlyDirect + totalL2Monthly;
  const totalYearly = yearlyDirect + totalL2Yearly;

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-[22px] font-bold mb-1">Earnings Calculator</h2>
        <p className="font-body text-[13px] text-[var(--app-text-muted)]">
          Model your potential earnings based on referral volume. Adjust the sliders to see projections.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inputs */}
        <div className="space-y-5">
          <div className="card p-5">
            <h3 className="font-body font-semibold text-sm mb-4">Your Direct Referrals</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1">
                  <label className="font-body text-[12px] text-[var(--app-text-muted)]">Clients referred per month</label>
                  <span className="font-body text-[13px] font-semibold text-brand-gold">{clientsPerMonth}</span>
                </div>
                <input type="range" min={1} max={50} value={clientsPerMonth} onChange={(e) => setClientsPerMonth(Number(e.target.value))} className="w-full accent-[#c4a050]" />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <label className="font-body text-[12px] text-[var(--app-text-muted)]">Avg. tariff duties per client</label>
                  <span className="font-body text-[13px] font-semibold text-brand-gold">{fmt$(avgDuties)}</span>
                </div>
                <input type="range" min={50000} max={10000000} step={50000} value={avgDuties} onChange={(e) => setAvgDuties(Number(e.target.value))} className="w-full accent-[#c4a050]" />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <label className="font-body text-[12px] text-[var(--app-text-muted)]">Firm fee rate</label>
                  <span className="font-body text-[13px] font-semibold text-brand-gold">{Math.round(firmFeeRate * 100)}%</span>
                </div>
                <input type="range" min={0.10} max={0.40} step={0.01} value={firmFeeRate} onChange={(e) => setFirmFeeRate(Number(e.target.value))} className="w-full accent-[#c4a050]" />
              </div>
              <div className="pt-2 border-t border-[var(--app-border)]">
                <div className="flex justify-between text-[12px] text-[var(--app-text-muted)]">
                  <span>Your commission rate</span>
                  <span className="font-semibold text-[var(--app-text)]">{Math.round(commissionRate * 100)}%</span>
                </div>
                <div className="flex justify-between text-[12px] text-[var(--app-text-muted)] mt-1">
                  <span>Per deal earning</span>
                  <span className="font-semibold text-green-400">{fmt$(myRatePerDeal)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h3 className="font-body font-semibold text-sm mb-4">Downline Override Earnings</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1">
                  <label className="font-body text-[12px] text-[var(--app-text-muted)]">L2 partners you recruit</label>
                  <span className="font-body text-[13px] font-semibold text-brand-gold">{l2Partners}</span>
                </div>
                <input type="range" min={0} max={20} value={l2Partners} onChange={(e) => setL2Partners(Number(e.target.value))} className="w-full accent-[#c4a050]" />
              </div>
              {l2Partners > 0 && (
                <>
                  <div>
                    <div className="flex justify-between mb-1">
                      <label className="font-body text-[12px] text-[var(--app-text-muted)]">Clients per L2 per month</label>
                      <span className="font-body text-[13px] font-semibold text-brand-gold">{l2ClientsPerMonth}</span>
                    </div>
                    <input type="range" min={1} max={20} value={l2ClientsPerMonth} onChange={(e) => setL2ClientsPerMonth(Number(e.target.value))} className="w-full accent-[#c4a050]" />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <label className="font-body text-[12px] text-[var(--app-text-muted)]">L2 commission rate</label>
                      <span className="font-body text-[13px] font-semibold text-brand-gold">{Math.round(l2Rate * 100)}%</span>
                    </div>
                    <input type="range" min={0.05} max={commissionRate - 0.05} step={0.05} value={l2Rate} onChange={(e) => setL2Rate(Number(e.target.value))} className="w-full accent-[#c4a050]" />
                  </div>
                  <div className="pt-2 border-t border-[var(--app-border)]">
                    <div className="flex justify-between text-[12px] text-[var(--app-text-muted)]">
                      <span>Your override rate</span>
                      <span className="font-semibold text-[var(--app-text)]">{Math.round(l1Override * 100)}%</span>
                    </div>
                    <div className="flex justify-between text-[12px] text-[var(--app-text-muted)] mt-1">
                      <span>Override per L2 deal</span>
                      <span className="font-semibold text-cyan-400">{fmt$(avgFirmFee * l1Override)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="space-y-5">
          <div className="card p-6 border-brand-gold/20">
            <h3 className="font-body font-semibold text-sm mb-5 text-center">Projected Earnings</h3>
            <div className="text-center mb-6">
              <div className="font-display text-4xl font-bold text-brand-gold mb-1">{fmt$(totalMonthly)}</div>
              <div className="font-body text-[12px] text-[var(--app-text-muted)]">per month</div>
            </div>
            <div className="text-center mb-6">
              <div className="font-display text-2xl font-bold text-green-400 mb-1">{fmt$(totalYearly)}</div>
              <div className="font-body text-[12px] text-[var(--app-text-muted)]">per year</div>
            </div>

            <div className="space-y-3 pt-4 border-t border-[var(--app-border)]">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-body text-[13px] text-[var(--app-text)]">Direct Referrals</div>
                  <div className="font-body text-[11px] text-[var(--app-text-muted)]">{clientsPerMonth} clients × {fmt$(myRatePerDeal)}</div>
                </div>
                <div className="text-right">
                  <div className="font-body text-[14px] font-semibold text-green-400">{fmt$(monthlyDirect)}/mo</div>
                  <div className="font-body text-[11px] text-[var(--app-text-muted)]">{fmt$(yearlyDirect)}/yr</div>
                </div>
              </div>
              {l2Partners > 0 && (
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-body text-[13px] text-[var(--app-text)]">Downline Overrides</div>
                    <div className="font-body text-[11px] text-[var(--app-text-muted)]">{l2Partners} partners × {l2ClientsPerMonth} clients × {fmt$(avgFirmFee * l1Override)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-body text-[14px] font-semibold text-cyan-400">{fmt$(totalL2Monthly)}/mo</div>
                    <div className="font-body text-[11px] text-[var(--app-text-muted)]">{fmt$(totalL2Yearly)}/yr</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card p-5">
            <h3 className="font-body font-semibold text-sm mb-3">Per-Deal Breakdown</h3>
            <div className="space-y-2 text-[12px]">
              <div className="flex justify-between"><span className="text-[var(--app-text-muted)]">Avg. duties paid by client</span><span>{fmt$(avgDuties)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--app-text-muted)]">Estimated refund (~85%)</span><span>{fmt$(avgRefund)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--app-text-muted)]">Firm fee ({Math.round(firmFeeRate * 100)}%)</span><span>{fmt$(avgFirmFee)}</span></div>
              <div className="flex justify-between pt-2 border-t border-[var(--app-border)]"><span className="text-[var(--app-text-muted)]">Your commission ({Math.round(commissionRate * 100)}%)</span><span className="font-semibold text-green-400">{fmt$(myRatePerDeal)}</span></div>
              {l2Partners > 0 && (
                <div className="flex justify-between"><span className="text-[var(--app-text-muted)]">Override per L2 deal ({Math.round(l1Override * 100)}%)</span><span className="font-semibold text-cyan-400">{fmt$(avgFirmFee * l1Override)}</span></div>
              )}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-brand-gold/5 border border-brand-gold/15">
            <div className="font-body text-[12px] text-brand-gold/80">
              These projections assume all referred clients qualify and their claims are recovered. Actual earnings depend on client eligibility, recovery amounts, and timing. Past results do not guarantee future performance.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
