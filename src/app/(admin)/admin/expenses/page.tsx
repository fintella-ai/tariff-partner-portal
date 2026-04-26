"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { isStarSuperAdminEmail } from "@/lib/starSuperAdmin";
import ReportingTabs from "@/components/ui/ReportingTabs";
import { fmt$ } from "@/lib/format";

type ServiceStatus = "active" | "trial" | "idle" | "pending";

interface Service {
  name: string;
  plan: string;
  monthlyCost: number;
  status: ServiceStatus;
  note?: string;
  startDate?: string;
}

interface Category {
  title: string;
  icon: string;
  services: Service[];
}

const CATEGORIES: Category[] = [
  {
    title: "Hosting & Infrastructure",
    icon: "🏗️",
    services: [
      { name: "Vercel (Fintella Portal)", plan: "Pro", monthlyCost: 20, status: "active", startDate: "2026-03-01" },
      { name: "Vercel (Fintella OS)", plan: "Pro Trial", monthlyCost: 0, status: "trial", note: "Check expiry" },
      { name: "Neon Postgres", plan: "Pro", monthlyCost: 19, status: "active", startDate: "2026-03-01" },
      { name: "Contabo VPS", plan: "Tier 2", monthlyCost: 23, status: "idle", note: "Planned for MinIO", startDate: "2026-04-01" },
      { name: "GitHub", plan: "Free", monthlyCost: 0, status: "active" },
      { name: "Cloudflare", plan: "Free", monthlyCost: 0, status: "active" },
    ],
  },
  {
    title: "Integrations",
    icon: "🔌",
    services: [
      { name: "SignWell", plan: "Paid", monthlyCost: 30, status: "active", note: "E-signatures", startDate: "2026-04-01" },
      { name: "SendGrid", plan: "Upgraded", monthlyCost: 79, status: "active", note: "Transactional email", startDate: "2026-04-01" },
      { name: "Twilio SMS", plan: "Pending", monthlyCost: 0, status: "pending", note: "Waiting on A2P 10DLC approval" },
      { name: "Twilio Voice", plan: "Usage-based", monthlyCost: 5, status: "active", startDate: "2026-04-20" },
      { name: "Sentry", plan: "Team", monthlyCost: 29, status: "active", note: "Error monitoring", startDate: "2026-04-26" },
      { name: "Google Workspace", plan: "Business Starter", monthlyCost: 7.20, status: "active", note: "Calendar, Meet, Drive, Gmail", startDate: "2026-04-01" },
    ],
  },
  {
    title: "AI & Development",
    icon: "🤖",
    services: [
      { name: "Anthropic Claude API", plan: "Usage-based", monthlyCost: 40, status: "active", note: "FinnStellaOS + video gen", startDate: "2026-04-20" },
      { name: "Claude Code", plan: "Max / Team", monthlyCost: 150, status: "active", note: "Development AI", startDate: "2026-04-01" },
      { name: "HeyGen", plan: "Creator", monthlyCost: 29, status: "active", note: "AI avatar videos", startDate: "2026-04-24" },
    ],
  },
  {
    title: "Domains",
    icon: "🌐",
    services: [
      { name: "fintella.partners", plan: "Annual", monthlyCost: 2.50, status: "active", note: "~$30/yr" },
      { name: "trln.partners", plan: "Annual", monthlyCost: 2.50, status: "active", note: "Staging" },
    ],
  },
];

const STATUS_STYLE: Record<ServiceStatus, { bg: string; text: string; label: string }> = {
  active:  { bg: "bg-green-500/10 border-green-500/20", text: "text-green-400", label: "Active" },
  trial:   { bg: "bg-yellow-500/10 border-yellow-500/20", text: "text-yellow-400", label: "Trial" },
  idle:    { bg: "bg-gray-500/10 border-gray-500/20", text: "text-gray-400", label: "Idle" },
  pending: { bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-400", label: "Pending" },
};

function monthsSince(startDate: string): number {
  const start = new Date(startDate);
  const now = new Date();
  return Math.max(1, Math.ceil((now.getTime() - start.getTime()) / (30.44 * 24 * 60 * 60 * 1000)));
}

export default function ExpensesPage() {
  const { data: session, status } = useSession();
  const [aiUsage, setAiUsage] = useState<{ totalMessages: number; totalTokens: number; todayMessages: number } | null>(null);
  const [liveUsage, setLiveUsage] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    fetch("/api/admin/ai-activity")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) setAiUsage({ totalMessages: d.totalMessages || 0, totalTokens: d.totalTokens || 0, todayMessages: d.todayMessages || 0 });
      })
      .catch(() => {});
    fetch("/api/admin/billing/usage")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.usage) setLiveUsage(d.usage); })
      .catch(() => {});
  }, []);

  const user = session?.user as any;
  const role = user?.role || "";

  if (status === "loading") {
    return <div className="flex items-center justify-center min-h-[40vh]"><div className="spinner" /></div>;
  }

  if (role !== "super_admin") {
    return (
      <div>
        <ReportingTabs />
        <div className="card p-8 text-center max-w-md mx-auto">
          <div className="text-4xl mb-4">🔒</div>
          <h2 className="font-display text-lg font-bold mb-2">Access Restricted</h2>
          <p className="font-body text-sm theme-text-muted">Expenses is only available to Super Admins.</p>
        </div>
      </div>
    );
  }

  const allServices = CATEGORIES.flatMap((c) => c.services);
  const totalMonthly = allServices.reduce((sum, s) => sum + s.monthlyCost, 0);
  const totalPaidEstimate = allServices.reduce((sum, s) => {
    if (!s.startDate || s.monthlyCost === 0) return sum;
    return sum + s.monthlyCost * monthsSince(s.startDate);
  }, 0);

  return (
    <div>
      <ReportingTabs />

      <h2 className="font-display text-xl font-bold mb-1">Business Expenses</h2>
      <p className="font-body text-[13px] theme-text-muted mb-6">Software subscriptions, infrastructure, and operating costs.</p>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="stat-card">
          <div className="font-body text-[9px] tracking-[1.5px] uppercase theme-text-muted mb-2">Monthly Burn</div>
          <div className="font-display text-2xl font-bold text-orange-400">{fmt$(totalMonthly)}</div>
          <div className="font-body text-[10px] theme-text-muted mt-1">{allServices.filter((s) => s.monthlyCost > 0).length} paid services</div>
        </div>
        <div className="stat-card">
          <div className="font-body text-[9px] tracking-[1.5px] uppercase theme-text-muted mb-2">Annual Projection</div>
          <div className="font-display text-2xl font-bold">{fmt$(totalMonthly * 12)}</div>
          <div className="font-body text-[10px] theme-text-muted mt-1">At current burn rate</div>
        </div>
        <div className="stat-card">
          <div className="font-body text-[9px] tracking-[1.5px] uppercase theme-text-muted mb-2">Total Paid (Est.)</div>
          <div className="font-display text-2xl font-bold text-red-400">{fmt$(totalPaidEstimate)}</div>
          <div className="font-body text-[10px] theme-text-muted mt-1">Since each service started</div>
        </div>
        {aiUsage && (
          <div className="stat-card">
            <div className="font-body text-[9px] tracking-[1.5px] uppercase theme-text-muted mb-2">AI Usage (PartnerOS)</div>
            <div className="font-display text-2xl font-bold text-purple-400">{aiUsage.totalMessages.toLocaleString()}</div>
            <div className="font-body text-[10px] theme-text-muted mt-1">{aiUsage.todayMessages} today · {((aiUsage.totalTokens || 0) / 1_000_000).toFixed(1)}M tokens total</div>
          </div>
        )}
      </div>

      {/* Live usage from APIs */}
      {liveUsage && (
        <div className="card p-5 mb-6">
          <div className="font-body font-semibold text-sm mb-4">Live Service Usage (This Month)</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {liveUsage.twilio?.status === "ok" && (
              <div className="rounded-xl border border-[var(--app-border)] p-4">
                <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">Twilio</div>
                <div className="font-display text-lg font-bold text-blue-400">${liveUsage.twilio.thisMonth?.toFixed(2)}</div>
                <div className="font-body text-[11px] theme-text-muted mt-1">
                  {liveUsage.twilio.calls} calls · {liveUsage.twilio.sms} SMS
                </div>
              </div>
            )}
            {liveUsage.sendgrid?.status === "ok" && (
              <div className="rounded-xl border border-[var(--app-border)] p-4">
                <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">SendGrid (30 days)</div>
                <div className="font-display text-lg font-bold text-green-400">{liveUsage.sendgrid.last30Days?.sent?.toLocaleString()}</div>
                <div className="font-body text-[11px] theme-text-muted mt-1">
                  {liveUsage.sendgrid.last30Days?.delivered?.toLocaleString()} delivered
                </div>
              </div>
            )}
            {liveUsage.sentry?.status === "ok" && (
              <div className="rounded-xl border border-[var(--app-border)] p-4">
                <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">Sentry (30 days)</div>
                <div className="font-display text-lg font-bold text-orange-400">{liveUsage.sentry.totalErrors30d?.toLocaleString()}</div>
                <div className="font-body text-[11px] theme-text-muted mt-1">errors tracked</div>
              </div>
            )}
            {liveUsage.googleWorkspace?.status === "ok" && (
              <div className="rounded-xl border border-[var(--app-border)] p-4">
                <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">Google Workspace</div>
                <div className="font-display text-lg font-bold text-blue-400">
                  {liveUsage.googleWorkspace.seats} seat{liveUsage.googleWorkspace.seats === 1 ? "" : "s"}
                </div>
                <div className="font-body text-[11px] theme-text-muted mt-1">
                  {liveUsage.googleWorkspace.plan} · ${liveUsage.googleWorkspace.monthlyPerSeat}/seat/mo · ~${liveUsage.googleWorkspace.estimatedMonthly}/mo
                </div>
              </div>
            )}
            {liveUsage.googleWorkspace?.status === "scope_missing" && (
              <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">Google Workspace</div>
                <div className="font-body text-[11px] text-yellow-400">
                  Re-connect Google Calendar in Settings → Integrations to enable Workspace billing data.
                </div>
              </div>
            )}
            {liveUsage.anthropic?.status === "ok" && (
              <div className="rounded-xl border border-[var(--app-border)] p-4">
                <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">Anthropic AI</div>
                <div className="font-display text-lg font-bold text-purple-400">~${liveUsage.anthropic.estimatedCost?.toFixed(2)}</div>
                <div className="font-body text-[11px] theme-text-muted mt-1">
                  {liveUsage.anthropic.thisMonthMessages} messages this month · {liveUsage.anthropic.totalMessages} total
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Category breakdowns */}
      {CATEGORIES.map((cat) => {
        const catTotal = cat.services.reduce((s, svc) => s + svc.monthlyCost, 0);
        return (
          <div key={cat.title} className="card mb-4 overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--app-border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>{cat.icon}</span>
                <span className="font-body text-[13px] font-semibold">{cat.title}</span>
              </div>
              <span className="font-body text-[12px] text-orange-400 font-semibold">{fmt$(catTotal)}/mo</span>
            </div>
            <div>
              {cat.services.map((svc) => {
                const style = STATUS_STYLE[svc.status];
                const totalPaid = svc.startDate ? svc.monthlyCost * monthsSince(svc.startDate) : 0;
                return (
                  <div key={svc.name} className="flex items-center gap-4 px-5 py-3 border-b border-[var(--app-border)] last:border-0 hover:bg-[var(--app-hover)] transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="font-body text-[13px] text-[var(--app-text)]">{svc.name}</div>
                      {svc.note && <div className="font-body text-[10px] theme-text-muted">{svc.note}</div>}
                    </div>
                    <div className="font-body text-[11px] theme-text-muted text-right w-20">{svc.plan}</div>
                    <div className="font-body text-[13px] font-semibold text-right w-20">
                      {svc.monthlyCost > 0 ? `${fmt$(svc.monthlyCost)}/mo` : "Free"}
                    </div>
                    {svc.startDate && svc.monthlyCost > 0 && (
                      <div className="font-body text-[11px] theme-text-muted text-right w-24">
                        {fmt$(totalPaid)} total
                      </div>
                    )}
                    <span className={`font-body text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${style.bg} ${style.text}`}>
                      {style.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="font-body text-[11px] theme-text-faint text-center mt-4">
        Costs are estimates based on plan rates and start dates. Log into each service dashboard for exact billing.
      </div>
    </div>
  );
}
