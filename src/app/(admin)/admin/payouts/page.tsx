"use client";

import { useState, useEffect, useCallback } from "react";
import { fmt$ } from "@/lib/format";
import PartnerLink from "@/components/ui/PartnerLink";
import DealLink from "@/components/ui/DealLink";
import ReportingTabs from "@/components/ui/ReportingTabs";
import { useResizableColumns } from "@/components/ui/ResizableTable";

type Payout = {
  id: string;
  partnerName: string;
  partnerId: string | null;
  partnerCode: string;
  tier: string;
  dealId: string;
  dealName: string;
  amount: number;
  status: "pending" | "due" | "paid";
  periodMonth: string;
  payoutDate: string | null;
  batchId: string | null;
  stripeTransferId: string | null;
  stripeStatus: string | null;
  stripePayoutsEnabled: boolean;
};

type PayoutStats = {
  totalDue: number;
  totalPending: number;
  totalPaid: number;
  partnersToPay: number;
};

const tabs = ["Due", "Pending", "Paid"] as const;
type Tab = (typeof tabs)[number];

const tierBadge: Record<string, string> = {
  L1: "bg-brand-gold/20 text-brand-gold",
  L2: "bg-purple-500/20 text-purple-400",
  L3: "bg-blue-500/20 text-blue-400",
  EP: "bg-purple-500/20 text-purple-400",
};

const statusBadge: Record<string, string> = {
  due: "bg-blue-500/20 text-blue-400",
  pending: "bg-yellow-500/20 text-yellow-400",
  paid: "bg-green-500/20 text-green-400",
};

const statusLabel: Record<string, string> = {
  due: "Due",
  pending: "Pending",
  paid: "Paid",
};

function fmtMonth(d: string) {
  if (!d) return "—";
  const [y, m] = d.split("-");
  const date = new Date(Number(y), Number(m) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function PayoutManagementPage() {
  const { columnWidths: payoutColWidths, getResizeHandler: getPayoutResizeHandler } = useResizableColumns([150, 120, 80, 100, 120, 100, 100, 100]);
  const [tab, setTab] = useState<Tab>("Due");
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [stats, setStats] = useState<PayoutStats>({ totalDue: 0, totalPending: 0, totalPaid: 0, partnersToPay: 0 });
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const fetchPayouts = useCallback(() => {
    fetch("/api/admin/payouts")
      .then((r) => r.json())
      .then((data) => {
        setPayouts(data.payouts || []);
        setStats(data.stats || { totalDue: 0, totalPending: 0, totalPaid: 0, partnersToPay: 0 });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchPayouts(); }, [fetchPayouts]);

  const filtered = payouts.filter((p) => {
    if (tab === "Due") return p.status === "due";
    if (tab === "Pending") return p.status === "pending";
    if (tab === "Paid") return p.status === "paid";
    return true;
  });

  async function handleApprove(id: string) {
    setActing(id);
    try {
      await fetch("/api/admin/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_single", commissionId: id }),
      });
      fetchPayouts();
    } catch (e) {
      console.error(e);
    } finally {
      setActing(null);
    }
  }

  async function handleCreateBatch() {
    setActing("batch");
    try {
      await fetch("/api/admin/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_batch" }),
      });
      fetchPayouts();
    } catch (e) {
      console.error(e);
    } finally {
      setActing(null);
    }
  }

  if (loading) {
    return (
      <div>
        <h2 className="font-display text-xl sm:text-2xl font-bold mb-2">Payout Management</h2>
        <p className="font-body text-sm text-[var(--app-text-muted)] mb-6">Loading payouts...</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card px-4 py-3 animate-pulse">
              <div className="h-3 w-16 bg-[var(--app-border)] rounded mb-2" />
              <div className="h-6 w-20 bg-[var(--app-border)] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <ReportingTabs />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold mb-1">Payout Management</h2>
          <p className="font-body text-sm text-[var(--app-text-muted)]">Process and track partner payouts.</p>
        </div>
        <div className="flex gap-2 self-start">
          {tab === "Due" && filtered.length > 0 && (
            <button
              onClick={handleCreateBatch}
              disabled={acting === "batch"}
              className="btn-gold text-sm px-4 py-2 rounded-lg font-body disabled:opacity-50"
            >
              {acting === "batch" ? "Creating..." : "Approve Payout Batch"}
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Due", value: fmt$(stats.totalDue) },
          { label: "Total Pending", value: fmt$(stats.totalPending) },
          { label: "Total Paid", value: fmt$(stats.totalPaid) },
          { label: "Partners to Pay", value: stats.partnersToPay },
        ].map((s) => (
          <div key={s.label} className="card px-4 py-3">
            <div className="font-body text-xs text-[var(--app-text-muted)] mb-1">{s.label}</div>
            <div className="font-display text-xl font-bold text-brand-gold">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`font-body text-sm px-4 py-1.5 rounded-full whitespace-nowrap transition ${
              tab === t
                ? "bg-brand-gold/20 text-brand-gold"
                : "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text-secondary)]"
            }`}
          >
            {t} ({payouts.filter((p) => p.status === t.toLowerCase()).length})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="font-body text-sm text-[var(--app-text-muted)]">
            No {tab.toLowerCase()} payouts found.
          </div>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block card overflow-x-auto">
            <table className="w-full text-left font-body text-sm" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr className="border-b border-[var(--app-border)] text-[var(--app-text-muted)] text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-center" style={{ width: payoutColWidths[0], position: "relative" }}>Partner<span {...getPayoutResizeHandler(0)} /></th>
                  <th className="px-4 py-3 text-center" style={{ width: payoutColWidths[1], position: "relative" }}>Deal<span {...getPayoutResizeHandler(1)} /></th>
                  <th className="px-4 py-3 text-center" style={{ width: payoutColWidths[2], position: "relative" }}>Tier<span {...getPayoutResizeHandler(2)} /></th>
                  <th className="px-4 py-3 text-center" style={{ width: payoutColWidths[3], position: "relative" }}>Amount<span {...getPayoutResizeHandler(3)} /></th>
                  <th className="px-4 py-3 text-center" style={{ width: payoutColWidths[4], position: "relative" }}>Period<span {...getPayoutResizeHandler(4)} /></th>
                  <th className="px-4 py-3 text-center" style={{ width: payoutColWidths[5], position: "relative" }}>Status<span {...getPayoutResizeHandler(5)} /></th>
                  <th className="px-4 py-3 text-center" style={{ width: payoutColWidths[6], position: "relative" }}>Stripe<span {...getPayoutResizeHandler(6)} /></th>
                  <th className="px-4 py-3 text-center" style={{ width: payoutColWidths[7], position: "relative" }}>Action<span {...getPayoutResizeHandler(7)} /></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--app-border-subtle)] hover:bg-[var(--app-card-bg)] transition">
                    <td className="px-4 py-3">
                      <PartnerLink partnerId={p.partnerId} className="text-[var(--app-text)]">{p.partnerName}</PartnerLink>
                      <div className="text-xs text-[var(--app-text-muted)]">{p.partnerCode}</div>
                    </td>
                    <td className="px-4 py-3"><DealLink dealId={p.dealId} className="text-[var(--app-text-secondary)]">{p.dealName}</DealLink></td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${tierBadge[p.tier] || tierBadge.L1}`}>
                        {p.tier}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--app-text)]">{fmt$(p.amount)}</td>
                    <td className="px-4 py-3 text-[var(--app-text-secondary)]">{fmtMonth(p.periodMonth)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${statusBadge[p.status]}`}>
                        {statusLabel[p.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.stripeTransferId ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20" title={p.stripeTransferId}>
                          Transferred
                        </span>
                      ) : p.stripeStatus === "active" && p.stripePayoutsEnabled ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">
                          Ready
                        </span>
                      ) : p.stripeStatus === "onboarding" || p.stripeStatus === "restricted" ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">
                          Pending
                        </span>
                      ) : (
                        <span className="text-[10px] text-[var(--app-text-faint)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.status === "due" ? (
                        <button
                          onClick={() => handleApprove(p.id)}
                          disabled={acting === p.id}
                          className="text-xs text-brand-gold hover:underline disabled:opacity-50"
                        >
                          {acting === p.id ? "..." : "Approve"}
                        </button>
                      ) : p.status === "pending" ? (
                        <span className="text-xs text-[var(--app-text-faint)]">Awaiting deal close</span>
                      ) : (
                        <span className="text-xs text-green-400">Paid {p.payoutDate ? new Date(p.payoutDate).toLocaleDateString() : ""}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden flex flex-col gap-3">
            {filtered.map((p) => (
              <div key={p.id} className="card p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <PartnerLink partnerId={p.partnerId} className="font-body text-sm font-medium text-[var(--app-text)]">{p.partnerName}</PartnerLink>
                    <div className="font-body text-xs text-[var(--app-text-muted)] mt-0.5">{p.partnerCode}</div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${tierBadge[p.tier] || tierBadge.L1}`}>
                    {p.tier}
                  </span>
                </div>
                <DealLink dealId={p.dealId} className="font-body text-xs text-[var(--app-text-secondary)] mb-1 block">{p.dealName}</DealLink>
                <div className="flex items-center justify-between mt-3">
                  <div>
                    <div className="font-display text-lg font-bold text-[var(--app-text)]">{fmt$(p.amount)}</div>
                    <div className="text-xs text-[var(--app-text-muted)]">{fmtMonth(p.periodMonth)}</div>
                    {p.stripeTransferId ? (
                      <div className="text-[10px] text-green-400 mt-0.5">Stripe transferred</div>
                    ) : p.stripeStatus === "active" && p.stripePayoutsEnabled ? (
                      <div className="text-[10px] text-blue-400 mt-0.5">Stripe ready</div>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusBadge[p.status]}`}>
                      {statusLabel[p.status]}
                    </span>
                    {p.status === "due" && (
                      <button
                        onClick={() => handleApprove(p.id)}
                        disabled={acting === p.id}
                        className="text-xs text-brand-gold hover:underline disabled:opacity-50"
                      >
                        Approve
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
