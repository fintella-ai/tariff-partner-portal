"use client";

import { useState, useEffect, useCallback } from "react";

interface Sub {
  id: string;
  partnerCode: string;
  plan: string;
  status: string;
  priceMonthly: number;
  cardLast4: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  createdAt: string;
  partner: {
    firstName: string;
    lastName: string;
    email: string;
    companyName: string | null;
    partnerType: string;
  };
}

interface Stats {
  total: number;
  free: number;
  pro: number;
  enterprise: number;
  mrr: number;
}

const PLAN_COLORS: Record<string, { bg: string; text: string }> = {
  free: { bg: "bg-white/5", text: "text-white/50" },
  pro: { bg: "bg-[var(--brand-gold)]/10", text: "text-[var(--brand-gold)]" },
  enterprise: { bg: "bg-purple-500/10", text: "text-purple-400" },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: "bg-green-500/10", text: "text-green-400" },
  trialing: { bg: "bg-blue-500/10", text: "text-blue-400" },
  past_due: { bg: "bg-yellow-500/10", text: "text-yellow-400" },
  canceled: { bg: "bg-red-500/10", text: "text-red-400" },
};

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/subscriptions");
    if (res.ok) {
      const data = await res.json();
      setSubs(data.subscriptions || []);
      setStats(data.stats || null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function setPlan(partnerCode: string, plan: string) {
    setUpgrading(partnerCode);
    await fetch("/api/admin/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerCode, plan }),
    });
    await load();
    setUpgrading(null);
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="font-display text-xl font-bold text-[var(--app-text)] mb-4">Subscriptions</h1>
        {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-[var(--app-card-bg)] rounded-lg animate-pulse mb-3" />)}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <h1 className="font-display text-xl font-bold text-[var(--app-text)] mb-1">Subscriptions</h1>
      <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-6">Manage partner subscription plans and billing</p>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
          <StatCard label="Total" value={stats.total.toString()} />
          <StatCard label="Free" value={stats.free.toString()} />
          <StatCard label="Pro" value={stats.pro.toString()} color="gold" />
          <StatCard label="Enterprise" value={stats.enterprise.toString()} color="purple" />
          <StatCard label="MRR" value={`$${(stats.mrr / 100).toLocaleString()}`} color="green" />
        </div>
      )}

      {subs.length === 0 ? (
        <div className="py-16 text-center">
          <div className="text-4xl mb-3">💎</div>
          <p className="font-body text-sm text-[var(--app-text-muted)]">No subscriptions yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-[var(--app-border)]">
                {["Partner", "Company", "Type", "Plan", "Status", "MRR", "Actions"].map((h) => (
                  <th key={h} className="font-body text-[10px] text-[var(--app-text-muted)] tracking-wider uppercase text-left py-2 px-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => {
                const pc = PLAN_COLORS[s.plan] || PLAN_COLORS.free;
                const sc = STATUS_COLORS[s.status] || STATUS_COLORS.active;
                return (
                  <tr key={s.id} className="border-b border-[var(--app-border)]/50 hover:bg-white/2">
                    <td className="font-body text-[13px] py-3 px-3 text-[var(--app-text)]">
                      {s.partner.firstName} {s.partner.lastName}
                      <br />
                      <span className="text-[11px] text-[var(--app-text-muted)]">{s.partner.email}</span>
                    </td>
                    <td className="font-body text-[13px] py-3 px-3 text-[var(--app-text-muted)]">
                      {s.partner.companyName || "—"}
                    </td>
                    <td className="font-body text-[12px] py-3 px-3 text-[var(--app-text-muted)] capitalize">
                      {s.partner.partnerType.replace(/_/g, " ")}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${pc.bg} ${pc.text}`}>
                        {s.plan}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${sc.bg} ${sc.text}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="font-body text-[13px] py-3 px-3 font-semibold text-[var(--brand-gold)]">
                      {s.priceMonthly > 0 ? `$${(s.priceMonthly / 100).toFixed(0)}` : "—"}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex gap-1">
                        {s.plan !== "pro" && (
                          <button
                            onClick={() => setPlan(s.partnerCode, "pro")}
                            disabled={upgrading === s.partnerCode}
                            className="font-body text-[10px] px-2 py-1 rounded bg-[var(--brand-gold)]/10 text-[var(--brand-gold)] hover:bg-[var(--brand-gold)]/20 disabled:opacity-40"
                          >
                            {upgrading === s.partnerCode ? "..." : "→ Pro"}
                          </button>
                        )}
                        {s.plan !== "free" && (
                          <button
                            onClick={() => setPlan(s.partnerCode, "free")}
                            disabled={upgrading === s.partnerCode}
                            className="font-body text-[10px] px-2 py-1 rounded bg-white/5 text-[var(--app-text-muted)] hover:bg-white/10 disabled:opacity-40"
                          >
                            → Free
                          </button>
                        )}
                        {s.plan !== "enterprise" && (
                          <button
                            onClick={() => setPlan(s.partnerCode, "enterprise")}
                            disabled={upgrading === s.partnerCode}
                            className="font-body text-[10px] px-2 py-1 rounded bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 disabled:opacity-40"
                          >
                            → Ent
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: "gold" | "green" | "purple" }) {
  const tc = color === "gold" ? "text-[var(--brand-gold)]"
    : color === "green" ? "text-green-400"
    : color === "purple" ? "text-purple-400"
    : "text-[var(--app-text)]";
  return (
    <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-card-bg)] p-4 text-center">
      <div className={`font-display text-xl font-bold ${tc}`}>{value}</div>
      <div className="font-body text-[10px] text-[var(--app-text-muted)] tracking-wider uppercase">{label}</div>
    </div>
  );
}
