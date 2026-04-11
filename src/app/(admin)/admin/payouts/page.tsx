"use client";

import { useState } from "react";
import { fmt$ } from "@/lib/format";

type Payout = {
  id: string;
  partnerName: string;
  partnerCode: string;
  tier: "L1" | "L2";
  dealName: string;
  amount: number;
  status: "pending" | "due" | "paid";
  periodMonth: string;
  payoutDate: string | null;
};

const payouts: Payout[] = [
  {
    id: "PO-3001",
    partnerName: "Summit Legal Group",
    partnerCode: "SLG-001",
    tier: "L1",
    dealName: "Meridian Steel Import Recovery",
    amount: 4250,
    status: "due",
    periodMonth: "2026-03",
    payoutDate: null,
  },
  {
    id: "PO-3002",
    partnerName: "Apex Trade Advisors",
    partnerCode: "ATA-012",
    tier: "L2",
    dealName: "Pacific Rim Tariff Refund",
    amount: 1875,
    status: "due",
    periodMonth: "2026-03",
    payoutDate: null,
  },
  {
    id: "PO-3003",
    partnerName: "Redstone Recovery LLC",
    partnerCode: "RRL-045",
    tier: "L1",
    dealName: "Atlantic Chemical Duty Claim",
    amount: 6100,
    status: "pending",
    periodMonth: "2026-03",
    payoutDate: null,
  },
  {
    id: "PO-3004",
    partnerName: "Pinnacle Partners",
    partnerCode: "PP-008",
    tier: "L1",
    dealName: "Great Lakes Auto Parts Recovery",
    amount: 3400,
    status: "paid",
    periodMonth: "2026-02",
    payoutDate: "2026-03-01",
  },
  {
    id: "PO-3005",
    partnerName: "Liberty Tariff Solutions",
    partnerCode: "LTS-023",
    tier: "L2",
    dealName: "Southeast Textile Refund",
    amount: 950,
    status: "paid",
    periodMonth: "2026-02",
    payoutDate: "2026-03-01",
  },
  {
    id: "PO-3006",
    partnerName: "Northgate Consulting",
    partnerCode: "NGC-031",
    tier: "L1",
    dealName: "Midwest Agriculture Tariff Claim",
    amount: 2800,
    status: "pending",
    periodMonth: "2026-03",
    payoutDate: null,
  },
];

const tabs = ["Due", "Pending", "Paid"] as const;
type Tab = (typeof tabs)[number];

const tierBadge: Record<Payout["tier"], string> = {
  L1: "bg-brand-gold/20 text-brand-gold",
  L2: "bg-purple-500/20 text-purple-400",
};

const statusBadge: Record<Payout["status"], string> = {
  due: "bg-blue-500/20 text-blue-400",
  pending: "bg-yellow-500/20 text-yellow-400",
  paid: "bg-green-500/20 text-green-400",
};

const statusLabel: Record<Payout["status"], string> = {
  due: "Due",
  pending: "Pending",
  paid: "Paid",
};

function fmtMonth(d: string) {
  const [y, m] = d.split("-");
  const date = new Date(Number(y), Number(m) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function PayoutManagementPage() {
  const [tab, setTab] = useState<Tab>("Due");

  const filtered = payouts.filter((p) => {
    if (tab === "Due") return p.status === "due";
    if (tab === "Pending") return p.status === "pending";
    if (tab === "Paid") return p.status === "paid";
    return true;
  });

  const totalDue = payouts
    .filter((p) => p.status === "due")
    .reduce((s, p) => s + p.amount, 0);
  const totalPending = payouts
    .filter((p) => p.status === "pending")
    .reduce((s, p) => s + p.amount, 0);
  const totalPaid = payouts
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + p.amount, 0);
  const partnersToPay = new Set(
    payouts.filter((p) => p.status === "due").map((p) => p.partnerCode)
  ).size;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold mb-1">
            Payout Management
          </h2>
          <p className="font-body text-sm text-[var(--app-text-muted)]">
            Process and track partner payouts.
          </p>
        </div>
        <div className="flex gap-2 self-start">
          <button className="font-body text-sm px-4 py-2 rounded-lg bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] transition">
            Export CSV
          </button>
          {tab === "Due" && (
            <button className="btn-gold text-sm px-4 py-2 rounded-lg font-body">
              Approve Payout Batch
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Due", value: fmt$(totalDue) },
          { label: "Total Pending", value: fmt$(totalPending) },
          { label: "Total Paid This Month", value: fmt$(totalPaid) },
          { label: "Partners to Pay", value: partnersToPay },
        ].map((s) => (
          <div key={s.label} className="card px-4 py-3">
            <div className="font-body text-xs text-[var(--app-text-muted)] mb-1">
              {s.label}
            </div>
            <div className="font-display text-xl font-bold text-brand-gold">
              {s.value}
            </div>
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
            {t}
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block card overflow-x-auto">
        <table className="w-full text-left font-body text-sm">
          <thead>
            <tr className="border-b border-[var(--app-border)] text-[var(--app-text-muted)] text-xs uppercase tracking-wider">
              <th className="px-4 py-3">Partner</th>
              <th className="px-4 py-3">Deal</th>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr
                key={p.id}
                className="border-b border-[var(--app-border-subtle)] hover:bg-[var(--app-card-bg)] transition"
              >
                <td className="px-4 py-3">
                  <div className="text-[var(--app-text)]">{p.partnerName}</div>
                  <div className="text-xs text-[var(--app-text-muted)]">{p.partnerCode}</div>
                </td>
                <td className="px-4 py-3 text-[var(--app-text-secondary)]">{p.dealName}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${tierBadge[p.tier]}`}
                  >
                    {p.tier}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-[var(--app-text)]">
                  {fmt$(p.amount)}
                </td>
                <td className="px-4 py-3 text-[var(--app-text-secondary)]">
                  {fmtMonth(p.periodMonth)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block text-xs px-2 py-0.5 rounded-full ${statusBadge[p.status]}`}
                  >
                    {statusLabel[p.status]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {p.status === "due" ? (
                    <button className="text-xs text-brand-gold hover:underline">
                      Approve
                    </button>
                  ) : p.status === "pending" ? (
                    <span className="text-xs text-[var(--app-text-faint)]">Awaiting deal</span>
                  ) : (
                    <button className="text-xs text-brand-gold hover:underline">
                      View Receipt
                    </button>
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
                <div className="font-body text-sm font-medium text-[var(--app-text)]">
                  {p.partnerName}
                </div>
                <div className="font-body text-xs text-[var(--app-text-muted)] mt-0.5">
                  {p.partnerCode}
                </div>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${tierBadge[p.tier]}`}
              >
                {p.tier}
              </span>
            </div>
            <div className="font-body text-xs text-[var(--app-text-secondary)] mb-1">
              {p.dealName}
            </div>
            <div className="flex items-center justify-between mt-3">
              <div>
                <div className="font-display text-lg font-bold text-[var(--app-text)]">
                  {fmt$(p.amount)}
                </div>
                <div className="text-xs text-[var(--app-text-muted)]">
                  {fmtMonth(p.periodMonth)}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${statusBadge[p.status]}`}
                >
                  {statusLabel[p.status]}
                </span>
                {p.status === "due" ? (
                  <button className="text-xs text-brand-gold hover:underline">
                    Approve
                  </button>
                ) : p.status === "paid" ? (
                  <button className="text-xs text-brand-gold hover:underline">
                    View Receipt
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
