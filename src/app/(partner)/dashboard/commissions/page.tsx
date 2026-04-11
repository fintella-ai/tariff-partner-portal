"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import StatusBadge from "@/components/ui/StatusBadge";
import { fmt$, fmtDate } from "@/lib/format";
import { useDevice } from "@/lib/useDevice";
import {
  FIRM_SHORT,
  DEFAULT_FIRM_FEE_RATE,
  DEFAULT_L1_RATE,
  DEFAULT_L2_RATE,
  DEFAULT_L3_RATE,
} from "@/lib/constants";

interface CommissionRates {
  l1Rate: number;
  l2Rate: number;
  l3Rate: number;
  l3Enabled: boolean;
}

export default function CommissionsPage() {
  const { data: session } = useSession();
  const device = useDevice();

  const [rates, setRates] = useState<CommissionRates>({
    l1Rate: DEFAULT_L1_RATE,
    l2Rate: DEFAULT_L2_RATE,
    l3Rate: DEFAULT_L3_RATE,
    l3Enabled: false,
  });
  const [directDeals, setDirectDeals] = useState<any[]>([]);
  const [downlineDeals, setDownlineDeals] = useState<any[]>([]);
  const [downlinePartners, setDownlinePartners] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/deals");
      if (res.ok) {
        const data = await res.json();
        setDirectDeals(data.directDeals || []);
        setDownlineDeals(data.downlineDeals || []);
        setDownlinePartners(data.downlinePartners || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    async function load() {
      // Try to fetch overrides from API
      try {
        const res = await fetch("/api/commissions");
        if (res.ok) {
          const data = await res.json();
          if (data.overrides) {
            setRates({
              l1Rate: data.overrides.l1Rate ?? DEFAULT_L1_RATE,
              l2Rate: data.overrides.l2Rate ?? DEFAULT_L2_RATE,
              l3Rate: data.overrides.l3Rate ?? DEFAULT_L3_RATE,
              l3Enabled: data.overrides.l3Enabled ?? false,
            });
          }
          if (data.ledger) setLedger(data.ledger);
        }
      } catch {
        // Use defaults
      }

      loadData();
    }
    load();
  }, [loadData]);

  // Compute totals
  const totalL1Earned = directDeals.reduce(
    (s, d) => s + Number(d.l1CommissionAmount || 0), 0
  );
  const totalL1Paid = directDeals
    .filter((d) => d.l1CommissionStatus === "paid")
    .reduce((s, d) => s + Number(d.l1CommissionAmount || 0), 0);
  const totalL1Pending = totalL1Earned - totalL1Paid;

  const totalL2Earned = downlineDeals.reduce(
    (s, d) => s + Number(d.l2CommissionAmount || 0), 0
  );
  const totalL2Paid = downlineDeals
    .filter((d) => d.l2CommissionStatus === "paid")
    .reduce((s, d) => s + Number(d.l2CommissionAmount || 0), 0);
  const totalL2Pending = totalL2Earned - totalL2Paid;

  // Pipeline (not yet Closed Won) = projected but not payable
  const pipelineDirectDeals = directDeals.filter((d) => d.stage !== "closedwon");
  const projectedL1 = pipelineDirectDeals.reduce((s, d) => {
    const refund = Number(d.estimatedRefundAmount || 0);
    return s + refund * DEFAULT_FIRM_FEE_RATE * rates.l1Rate;
  }, 0);

  const pipelineDownlineDeals = downlineDeals.filter((d) => d.stage !== "closedwon");
  const projectedL2 = pipelineDownlineDeals.reduce((s, d) => {
    const refund = Number(d.estimatedRefundAmount || 0);
    return s + refund * DEFAULT_FIRM_FEE_RATE * rates.l2Rate;
  }, 0);

  // L3 projected — placeholder for when L3 deals exist
  const projectedL3 = 0;

  const totalProjected = projectedL1 + projectedL2 + projectedL3;
  const hasAnyProjected = totalProjected > 0;

  const hasDownline = downlineDeals.length > 0;
  const hasL3 = rates.l3Enabled && rates.l3Rate > 0;

  // Map partner code → name for display
  function getPartnerName(code: string): { name: string; code: string } {
    const p = downlinePartners.find((dp) => dp.partnerCode === code);
    if (p) return { name: `${p.firstName} ${p.lastName}`, code };
    return { name: code, code };
  }

  // Grand totals
  const totalL3Earned = 0; // placeholder
  const totalL3Paid = 0;
  const totalL3Pending = 0;
  const grandTotalEarned = totalL1Earned + totalL2Earned + totalL3Earned;
  const grandTotalPaid = totalL1Paid + totalL2Paid + totalL3Paid;
  const grandTotalPending = totalL1Pending + totalL2Pending + totalL3Pending;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-5">
        <div className="spinner" />
        <div className="font-body text-sm text-[var(--app-text-secondary)]">Loading commissions...</div>
      </div>
    );
  }

  return (
    <div>
      <h2 className={`font-display ${device.isMobile ? "text-lg" : "text-[22px]"} font-bold mb-1.5`}>
        Commission Summary
      </h2>
      <p className="font-body text-[13px] text-[var(--app-text-muted)] mb-6">
        All amounts based on {FIRM_SHORT}&apos;s {(DEFAULT_FIRM_FEE_RATE * 100).toFixed(0)}% fee on collected refunds.
        Commissions are only paid on <strong className="text-[var(--app-text-secondary)]">Closed Won</strong> deals.
      </p>

      {/* ═══ TOTALS BANNER ═══ */}
      <div className={`${device.cardPadding} ${device.borderRadius} border border-[var(--app-border)] bg-[var(--app-card-bg)] mb-6`}>
        <div className={`flex ${device.isMobile ? "flex-col gap-5" : "items-center justify-center gap-0"} text-center`}>
          {/* L1 Total */}
          <div className={`${device.isMobile ? "" : "flex-1"} py-2`}>
            <div className="font-body text-[9px] tracking-[1.5px] uppercase text-brand-gold/60 mb-1.5">L1 Total</div>
            <div className="font-display text-2xl sm:text-3xl font-bold text-brand-gold mb-2">{fmt$(totalL1Earned)}</div>
            <div className="flex justify-center gap-4">
              <span className="font-body text-xs sm:text-sm font-semibold text-green-400">{fmt$(totalL1Paid)} <span className="font-normal text-green-400/70">Paid</span></span>
              <span className="font-body text-xs sm:text-sm font-semibold text-yellow-400">{fmt$(totalL1Pending)} <span className="font-normal text-yellow-400/70">Pending</span></span>
            </div>
          </div>

          {/* L2 Total */}
          {hasDownline && (
            <div className={`${device.isMobile ? "" : "flex-1 border-l border-[var(--app-border)]"} py-2`}>
              {device.isMobile && <div className="border-t border-[var(--app-border)] -mt-2 mb-3" />}
              <div className="font-body text-[9px] tracking-[1.5px] uppercase text-purple-400/60 mb-1.5">L2 Total</div>
              <div className="font-display text-2xl sm:text-3xl font-bold text-purple-400 mb-2">{fmt$(totalL2Earned)}</div>
              <div className="flex justify-center gap-4">
                <span className="font-body text-xs sm:text-sm font-semibold text-green-400">{fmt$(totalL2Paid)} <span className="font-normal text-green-400/70">Paid</span></span>
                <span className="font-body text-xs sm:text-sm font-semibold text-yellow-400">{fmt$(totalL2Pending)} <span className="font-normal text-yellow-400/70">Pending</span></span>
              </div>
            </div>
          )}

          {/* L3 Total */}
          {hasL3 && (
            <div className={`${device.isMobile ? "" : "flex-1 border-l border-[var(--app-border)]"} py-2`}>
              {device.isMobile && <div className="border-t border-[var(--app-border)] -mt-2 mb-3" />}
              <div className="font-body text-[9px] tracking-[1.5px] uppercase text-cyan-400/60 mb-1.5">L3 Total</div>
              <div className="font-display text-2xl sm:text-3xl font-bold text-cyan-400 mb-2">{fmt$(totalL3Earned)}</div>
              <div className="flex justify-center gap-4">
                <span className="font-body text-xs sm:text-sm font-semibold text-green-400">{fmt$(totalL3Paid)} <span className="font-normal text-green-400/70">Paid</span></span>
                <span className="font-body text-xs sm:text-sm font-semibold text-yellow-400">{fmt$(totalL3Pending)} <span className="font-normal text-yellow-400/70">Pending</span></span>
              </div>
            </div>
          )}

          {/* Grand Total */}
          <div className={`${device.isMobile ? "" : "flex-1 border-l border-[var(--app-border)]"} py-2`}>
            {device.isMobile && <div className="border-t border-[var(--app-border)] -mt-2 mb-3" />}
            <div className="font-body text-[9px] tracking-[1.5px] uppercase text-[var(--app-text-secondary)] mb-1.5">Total Earned</div>
            <div className="font-display text-2xl sm:text-3xl font-bold text-[var(--app-text)] mb-2">{fmt$(grandTotalEarned)}</div>
            <div className="flex justify-center gap-4">
              <span className="font-body text-xs sm:text-sm font-semibold text-green-400">{fmt$(grandTotalPaid)} <span className="font-normal text-green-400/70">Paid</span></span>
              <span className="font-body text-xs sm:text-sm font-semibold text-yellow-400">{fmt$(grandTotalPending)} <span className="font-normal text-yellow-400/70">Pending</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ COMMISSION TIER CARDS ═══ */}
      <div className={`grid ${device.isMobile ? "grid-cols-1" : hasL3 ? "grid-cols-3" : hasDownline ? "grid-cols-2" : "grid-cols-1 max-w-xl"} ${device.gap} mb-6`}>
        {/* L1 Card */}
        <div className={`${device.cardPadding} border border-brand-gold/20 ${device.borderRadius} bg-brand-gold/[0.03] text-center`}>
          <div className="font-body text-[10px] tracking-[2px] uppercase text-brand-gold/80 mb-3">
            Direct Referral (L1) — {(rates.l1Rate * 100).toFixed(0)}% of fee
          </div>
          <div className={`font-display ${device.isMobile ? "text-3xl" : "text-[40px]"} font-bold text-brand-gold mb-0.5`}>
            {fmt$(totalL1Earned)}
          </div>
          <div className="font-body text-xs text-[var(--app-text-secondary)] mb-4">
            Across {directDeals.length} deal{directDeals.length !== 1 ? "s" : ""}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 sm:p-4 bg-green-500/[0.06] border border-green-500/15 rounded-lg text-center">
              <div className="font-display text-lg sm:text-[22px] font-bold text-green-400">{fmt$(totalL1Paid)}</div>
              <div className="font-body text-xs sm:text-sm font-semibold text-green-400/70 mt-1">Paid</div>
            </div>
            <div className="p-3 sm:p-4 bg-yellow-500/[0.06] border border-yellow-500/15 rounded-lg text-center">
              <div className="font-display text-lg sm:text-[22px] font-bold text-yellow-400">{fmt$(totalL1Pending)}</div>
              <div className="font-body text-xs sm:text-sm font-semibold text-yellow-400/70 mt-1">Pending</div>
            </div>
          </div>
        </div>

        {/* L2 Card — only if partner has downline */}
        {hasDownline && (
          <div className={`${device.cardPadding} border border-purple-500/20 ${device.borderRadius} bg-purple-500/[0.03] text-center`}>
            <div className="font-body text-[10px] tracking-[2px] uppercase text-purple-400/80 mb-3">
              Downline Referral (L2) — {(rates.l2Rate * 100).toFixed(0)}% of fee
            </div>
            <div className={`font-display ${device.isMobile ? "text-3xl" : "text-[40px]"} font-bold text-purple-400 mb-0.5`}>
              {fmt$(totalL2Earned)}
            </div>
            <div className="font-body text-xs text-[var(--app-text-secondary)] mb-4">
              Across {downlineDeals.length} downline deal{downlineDeals.length !== 1 ? "s" : ""}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 sm:p-4 bg-green-500/[0.06] border border-green-500/15 rounded-lg text-center">
                <div className="font-display text-lg sm:text-[22px] font-bold text-green-400">{fmt$(totalL2Paid)}</div>
                <div className="font-body text-xs sm:text-sm font-semibold text-green-400/70 mt-1">Paid</div>
              </div>
              <div className="p-3 sm:p-4 bg-yellow-500/[0.06] border border-yellow-500/15 rounded-lg text-center">
                <div className="font-display text-lg sm:text-[22px] font-bold text-yellow-400">{fmt$(totalL2Pending)}</div>
                <div className="font-body text-xs sm:text-sm font-semibold text-yellow-400/70 mt-1">Pending</div>
              </div>
            </div>
          </div>
        )}

        {/* L3 Card — only if L3 enabled */}
        {hasL3 && (
          <div className={`${device.cardPadding} border border-cyan-500/20 ${device.borderRadius} bg-cyan-500/[0.03]`}>
            <div className="font-body text-[10px] tracking-[2px] uppercase text-cyan-400/80 mb-3">
              Level 3 Downline (L3) — {(rates.l3Rate * 100).toFixed(0)}% of fee
            </div>
            <div className={`font-display ${device.isMobile ? "text-3xl" : "text-[40px]"} font-bold text-cyan-400 mb-0.5`}>
              {fmt$(0)}
            </div>
            <div className="font-body text-xs text-[var(--app-text-secondary)] mb-4">No L3 deals yet</div>
            <div className="p-3 sm:p-4 bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg text-center">
              <div className="font-body text-[12px] text-[var(--app-text-muted)]">L3 earnings appear when your downline&apos;s recruits close deals.</div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ PROJECTED EARNINGS ═══ */}
      {hasAnyProjected && (
        <div className={`${device.cardPadding} ${device.borderRadius} border border-blue-500/15 bg-blue-500/[0.03] mb-6`}>
          <div className="flex items-center gap-2 mb-3">
            <div className="font-body text-sm font-semibold text-[var(--app-text)]">Projected Earnings</div>
            <span className="font-body text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full px-2.5 py-0.5 tracking-wider uppercase">
              Not yet payable
            </span>
          </div>
          <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-4">
            Based on pipeline deals that have not yet reached Closed Won. These amounts are estimates and will only be payable once deals close.
          </p>
          <div className={`grid ${device.isMobile ? "grid-cols-1 gap-3" : hasL3 ? "grid-cols-4" : hasDownline ? "grid-cols-3" : "grid-cols-2"} ${device.isMobile ? "" : "gap-4"}`}>
            {/* Projected L1 */}
            <div className="p-3 sm:p-4 bg-brand-gold/[0.06] border border-brand-gold/15 rounded-lg text-center">
              <div className="font-body text-[9px] tracking-[1.5px] uppercase text-brand-gold/60 mb-1">Projected L1</div>
              <div className="font-display text-lg sm:text-xl font-bold text-brand-gold">{fmt$(projectedL1)}</div>
              <div className="font-body text-[10px] text-[var(--app-text-muted)] mt-1">{pipelineDirectDeals.length} pipeline deal{pipelineDirectDeals.length !== 1 ? "s" : ""}</div>
            </div>

            {/* Projected L2 */}
            {hasDownline && (
              <div className="p-3 sm:p-4 bg-purple-500/[0.06] border border-purple-500/15 rounded-lg text-center">
                <div className="font-body text-[9px] tracking-[1.5px] uppercase text-purple-400/60 mb-1">Projected L2</div>
                <div className="font-display text-lg sm:text-xl font-bold text-purple-400">{fmt$(projectedL2)}</div>
                <div className="font-body text-[10px] text-[var(--app-text-muted)] mt-1">{pipelineDownlineDeals.length} downline deal{pipelineDownlineDeals.length !== 1 ? "s" : ""}</div>
              </div>
            )}

            {/* Projected L3 */}
            {hasL3 && (
              <div className="p-3 sm:p-4 bg-cyan-500/[0.06] border border-cyan-500/15 rounded-lg text-center">
                <div className="font-body text-[9px] tracking-[1.5px] uppercase text-cyan-400/60 mb-1">Projected L3</div>
                <div className="font-display text-lg sm:text-xl font-bold text-cyan-400">{fmt$(projectedL3)}</div>
                <div className="font-body text-[10px] text-[var(--app-text-muted)] mt-1">0 L3 deals</div>
              </div>
            )}

            {/* Total Projected */}
            <div className="p-3 sm:p-4 bg-blue-500/[0.06] border border-blue-500/15 rounded-lg text-center">
              <div className="font-body text-[9px] tracking-[1.5px] uppercase text-blue-400/60 mb-1">Total Projected</div>
              <div className="font-display text-lg sm:text-xl font-bold text-blue-400">{fmt$(totalProjected)}</div>
              <div className="font-body text-[10px] text-[var(--app-text-muted)] mt-1">All levels combined</div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ HOW COMMISSIONS WORK ═══ */}
      <div className={`${device.cardPadding} ${device.borderRadius} border border-[var(--app-border)] bg-[var(--app-card-bg)] mb-6`}>
        <div className="font-body font-semibold text-sm mb-4">How Commissions Work</div>
        <div className={`grid ${device.isMobile ? "grid-cols-1" : "grid-cols-3"} gap-3`}>
          {[
            { label: "Client Refund", formula: "e.g. $100,000", color: "text-[var(--app-text-secondary)]" },
            { label: `${FIRM_SHORT} Fee (${(DEFAULT_FIRM_FEE_RATE * 100).toFixed(0)}%)`, formula: "= $20,000", color: "text-[var(--app-text-secondary)]" },
            { label: `Your L1 Cut (${(rates.l1Rate * 100).toFixed(0)}% of fee)`, formula: `= ${fmt$(100000 * DEFAULT_FIRM_FEE_RATE * rates.l1Rate)}`, color: "text-brand-gold" },
          ].map((r) => (
            <div key={r.label} className="p-3 sm:p-4 border border-[var(--app-border)] rounded-lg text-center">
              <div className="font-body text-[10px] text-[var(--app-text-muted)] mb-1.5 tracking-wider">{r.label}</div>
              <div className={`font-display text-base sm:text-lg font-bold ${r.color}`}>{r.formula}</div>
            </div>
          ))}
        </div>
        {hasDownline && (
          <div className="mt-3 p-3 bg-purple-500/[0.05] border border-purple-500/15 rounded-lg font-body text-[12px] text-[var(--app-text-secondary)] text-center">
            L2 (Downline) = {(rates.l2Rate * 100).toFixed(0)}% of {FIRM_SHORT}&apos;s fee — e.g. {fmt$(100000 * DEFAULT_FIRM_FEE_RATE * rates.l2Rate)} on a $100K refund
          </div>
        )}
        {hasL3 && (
          <div className="mt-2 p-3 bg-cyan-500/[0.05] border border-cyan-500/15 rounded-lg font-body text-[12px] text-[var(--app-text-secondary)] text-center">
            L3 (2nd-Level Downline) = {(rates.l3Rate * 100).toFixed(0)}% of {FIRM_SHORT}&apos;s fee
          </div>
        )}
      </div>

      {/* ═══ COMMISSION HISTORY ═══ */}
      <div className="card">
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-[var(--app-border)] flex items-center justify-between">
          <div className="font-body font-semibold text-sm sm:text-[15px]">Commission History</div>
          <button className="font-body text-[11px] tracking-[1px] uppercase text-brand-gold/70 border border-brand-gold/20 rounded px-3 py-1.5 hover:bg-brand-gold/10 transition-colors">
            Export CSV
          </button>
        </div>

        {ledger.length === 0 ? (
          /* Show deal-based commission list when no ledger entries exist */
          <div>
            {device.isMobile ? (
              /* Mobile cards */
              <div>
                {directDeals.map((deal) => {
                  return (
                    <div key={deal.id} className="px-4 py-3.5 border-b border-[var(--app-border)] last:border-b-0">
                      <div className="flex justify-between items-center mb-1">
                        <div className="font-body text-[13px] text-[var(--app-text)] truncate flex-1 mr-3">{deal.dealName}</div>
                        <StatusBadge status={deal.l1CommissionStatus} />
                      </div>
                      <div className="font-body text-[11px] text-[var(--app-text-muted)] mb-1">{fmtDate(deal.createdAt)}</div>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="font-body text-[10px] text-brand-gold font-semibold bg-brand-gold/10 border border-brand-gold/20 rounded px-1.5 py-0.5">L1</span>
                          <span className="font-body text-[11px] text-[var(--app-text-muted)]">Direct</span>
                          <span className="font-body text-[10px] text-[var(--app-text-faint)]">·</span>
                          <span className="font-body text-[11px] text-[var(--app-text-faint)] italic">—</span>
                        </div>
                        <div className="font-display text-sm font-semibold text-brand-gold">{fmt$(deal.l1CommissionAmount)}</div>
                      </div>
                    </div>
                  );
                })}
                {downlineDeals.map((deal) => {
                  return (
                    <div key={deal.id} className="px-4 py-3.5 border-b border-[var(--app-border)] last:border-b-0">
                      <div className="flex justify-between items-center mb-1">
                        <div className="font-body text-[13px] text-[var(--app-text)] truncate flex-1 mr-3">{deal.dealName}</div>
                        <StatusBadge status={deal.l2CommissionStatus} />
                      </div>
                      <div className="font-body text-[11px] text-[var(--app-text-muted)] mb-1">{fmtDate(deal.createdAt)}</div>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="font-body text-[10px] text-purple-400 font-semibold bg-purple-500/10 border border-purple-500/20 rounded px-1.5 py-0.5">L2</span>
                          <span className="font-body text-[11px] text-[var(--app-text-muted)] truncate max-w-[120px]">{getPartnerName(deal.partnerCode).name}</span>
                        </div>
                        <div className="font-display text-sm font-semibold text-purple-400">{fmt$(deal.l2CommissionAmount)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Desktop table: Deal | Date | Tier | Referral Partner | Commission % | Amount | Status */
              <div>
                <div className="grid grid-cols-[1.8fr_0.8fr_0.5fr_1fr_0.7fr_0.8fr_0.7fr] gap-3 px-6 py-3 border-b border-[var(--app-border)]">
                  <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">Deal</div>
                  <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">Date</div>
                  <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">Tier</div>
                  <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">Referral Partner</div>
                  <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)] text-right">Comm. %</div>
                  <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)] text-right">Amount</div>
                  <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)] text-right">Status</div>
                </div>
                {directDeals.map((deal) => {
                  return (
                    <div key={deal.id} className="grid grid-cols-[1.8fr_0.8fr_0.5fr_1fr_0.7fr_0.8fr_0.7fr] gap-3 px-6 py-3.5 border-b border-[var(--app-border)] last:border-b-0 items-center hover:bg-[var(--app-card-bg)] transition-colors">
                      <div className="font-body text-[13px] text-[var(--app-text)] truncate">{deal.dealName}</div>
                      <div className="font-body text-[12px] text-[var(--app-text-muted)]">{fmtDate(deal.createdAt)}</div>
                      <div><span className="font-body text-[10px] text-brand-gold font-semibold bg-brand-gold/10 border border-brand-gold/20 rounded px-1.5 py-0.5">L1</span></div>
                      <div className="font-body text-[12px] text-[var(--app-text-muted)] italic">— (Direct)</div>
                      <div className="font-body text-[12px] text-[var(--app-text-muted)] text-right">—</div>
                      <div className="font-display text-[14px] font-semibold text-brand-gold text-right">{fmt$(deal.l1CommissionAmount)}</div>
                      <div className="text-right"><StatusBadge status={deal.l1CommissionStatus} /></div>
                    </div>
                  );
                })}
                {downlineDeals.map((deal) => {
                  return (
                    <div key={deal.id} className="grid grid-cols-[1.8fr_0.8fr_0.5fr_1fr_0.7fr_0.8fr_0.7fr] gap-3 px-6 py-3.5 border-b border-[var(--app-border)] last:border-b-0 items-center hover:bg-[var(--app-card-bg)] transition-colors">
                      <div className="font-body text-[13px] text-[var(--app-text)] truncate">{deal.dealName}</div>
                      <div className="font-body text-[12px] text-[var(--app-text-muted)]">{fmtDate(deal.createdAt)}</div>
                      <div><span className="font-body text-[10px] text-purple-400 font-semibold bg-purple-500/10 border border-purple-500/20 rounded px-1.5 py-0.5">L2</span></div>
                      <div className="text-center">
                        <div className="font-body text-[12px] text-[var(--app-text-secondary)]">{getPartnerName(deal.partnerCode).name}</div>
                        <div className="font-body text-[9px] text-[var(--app-text-faint)] tracking-wider">{deal.partnerCode}</div>
                      </div>
                      <div className="font-body text-[12px] text-[var(--app-text-muted)] text-right">—</div>
                      <div className="font-display text-[14px] font-semibold text-purple-400 text-right">{fmt$(deal.l2CommissionAmount)}</div>
                      <div className="text-right"><StatusBadge status={deal.l2CommissionStatus} /></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Ledger-based history when DB entries exist */
          <div className="p-6 text-center font-body text-sm text-[var(--app-text-muted)]">
            Commission ledger entries will appear here once payouts are processed.
          </div>
        )}
      </div>
    </div>
  );
}
