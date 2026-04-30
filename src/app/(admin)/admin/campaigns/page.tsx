"use client";

import { useState, useEffect, useCallback } from "react";
import { fmt$ } from "@/lib/format";

interface CampaignStep {
  id: string;
  stepNumber: number;
  templateKey: string;
  delayDays: number;
  sentCount: number;
  openCount: number;
  clickCount: number;
}

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: string;
  audience: string;
  totalLeads: number;
  sentCount: number;
  openCount: number;
  clickCount: number;
  convertCount: number;
  unsubCount: number;
  startedAt: string | null;
  createdAt: string;
  steps: CampaignStep[];
  _count: { enrollments: number };
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: "bg-white/5", text: "text-white/50" },
  active: { bg: "bg-green-500/10", text: "text-green-400" },
  paused: { bg: "bg-yellow-500/10", text: "text-yellow-400" },
  completed: { bg: "bg-blue-500/10", text: "text-blue-400" },
};

const TEMPLATE_LABELS: Record<string, string> = {
  broker_drip_1_intro: "Cold Intro — Calculator Hook",
  broker_drip_2_value: "Value Prop — Commission Math",
  broker_drip_3_urgency: "Urgency — Deadline Warning",
  broker_drip_4_social_proof: "Social Proof — Broker Success",
  broker_drip_5_last_chance: "Last Chance — Personal Offer",
  broker_recruitment_cold: "Legacy Cold Email",
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/campaigns");
    if (res.ok) {
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createDefaultCampaign() {
    setCreating(true);
    const res = await fetch("/api/admin/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Broker Outreach v1",
        description: "5-step drip sequence for CBP-listed customs brokers. Drives to /calculator as lead-gen hook.",
        audience: "all_leads",
        steps: [
          { templateKey: "broker_drip_1_intro", delayDays: 0 },
          { templateKey: "broker_drip_2_value", delayDays: 3 },
          { templateKey: "broker_drip_3_urgency", delayDays: 5 },
          { templateKey: "broker_drip_4_social_proof", delayDays: 5 },
          { templateKey: "broker_drip_5_last_chance", delayDays: 7 },
        ],
      }),
    });
    if (res.ok) await load();
    setCreating(false);
  }

  async function enrollAll(campaignId: string) {
    setEnrolling(campaignId);
    await fetch(`/api/admin/campaigns/${campaignId}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    await load();
    setEnrolling(null);
  }

  async function toggleStatus(campaign: Campaign) {
    const newStatus = campaign.status === "active" ? "paused" : "active";
    await fetch(`/api/admin/campaigns/${campaign.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    await load();
  }

  function pct(num: number, den: number): string {
    if (den === 0) return "0%";
    return ((num / den) * 100).toFixed(1) + "%";
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="font-display text-xl font-bold text-[var(--app-text)]">Campaigns</h1>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-[var(--app-card-bg)] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-xl font-bold text-[var(--app-text)]">
            Email Campaigns
          </h1>
          <p className="font-body text-[12px] text-[var(--app-text-muted)] mt-1">
            Multi-step drip sequences for broker outreach
          </p>
        </div>
        {campaigns.length === 0 && (
          <button
            onClick={createDefaultCampaign}
            disabled={creating}
            className="font-body text-[13px] font-medium px-5 py-2.5 rounded-lg bg-[var(--brand-gold)] text-black hover:bg-[var(--brand-gold)]/90 transition-colors disabled:opacity-40"
          >
            {creating ? "Creating..." : "Create Broker Outreach Campaign"}
          </button>
        )}
      </div>

      {campaigns.length === 0 && !creating && (
        <div className="py-16 text-center">
          <div className="text-5xl mb-4">📧</div>
          <p className="font-body text-sm text-[var(--app-text-muted)]">
            No campaigns yet. Create the default 5-step broker outreach campaign to get started.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {campaigns.map((c) => {
          const sc = STATUS_COLORS[c.status] || STATUS_COLORS.draft;
          const isExpanded = expandedId === c.id;

          return (
            <div key={c.id} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-card-bg)] overflow-hidden">
              {/* Header */}
              <div
                className="p-4 sm:p-5 cursor-pointer hover:bg-white/2 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : c.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${sc.bg} ${sc.text}`}>
                      {c.status}
                    </span>
                    <h3 className="font-body text-[14px] font-semibold text-[var(--app-text)]">{c.name}</h3>
                  </div>
                  <span className="font-body text-[12px] text-[var(--app-text-muted)]">
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </div>
                {c.description && (
                  <p className="font-body text-[12px] text-[var(--app-text-muted)] mt-1 ml-[72px]">{c.description}</p>
                )}

                {/* Summary stats */}
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mt-4">
                  <StatCard label="Enrolled" value={c.totalLeads.toLocaleString()} />
                  <StatCard label="Sent" value={c.sentCount.toLocaleString()} />
                  <StatCard label="Open Rate" value={pct(c.openCount, c.sentCount)} color={c.openCount > 0 ? "green" : undefined} />
                  <StatCard label="Click Rate" value={pct(c.clickCount, c.sentCount)} color={c.clickCount > 0 ? "blue" : undefined} />
                  <StatCard label="Conversions" value={c.convertCount.toString()} color={c.convertCount > 0 ? "green" : undefined} />
                  <StatCard label="Unsubs" value={c.unsubCount.toString()} color={c.unsubCount > 0 ? "red" : undefined} />
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-[var(--app-border)] p-4 sm:p-5 space-y-4">
                  {/* Step funnel */}
                  <h4 className="font-body text-[12px] font-semibold text-[var(--app-text)] tracking-wider uppercase">
                    Drip Sequence
                  </h4>
                  <div className="space-y-2">
                    {c.steps.map((step) => (
                      <div key={step.id} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-white/2">
                        <div className="w-7 h-7 rounded-full bg-[var(--brand-gold)]/20 flex items-center justify-center shrink-0">
                          <span className="font-body text-[11px] font-bold text-[var(--brand-gold)]">{step.stepNumber}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-body text-[12px] text-[var(--app-text)] font-medium truncate">
                            {TEMPLATE_LABELS[step.templateKey] || step.templateKey}
                          </div>
                          <div className="font-body text-[10px] text-[var(--app-text-muted)]">
                            {step.delayDays === 0 ? "Immediate" : `+${step.delayDays} days`}
                          </div>
                        </div>
                        <div className="flex gap-4 shrink-0">
                          <MiniStat label="Sent" value={step.sentCount} />
                          <MiniStat label="Opens" value={step.openCount} color="green" />
                          <MiniStat label="Clicks" value={step.clickCount} color="blue" />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => toggleStatus(c)}
                      className={`font-body text-[12px] font-medium px-4 py-2 rounded-lg transition-colors ${
                        c.status === "active"
                          ? "bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20"
                          : "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                      }`}
                    >
                      {c.status === "active" ? "Pause Campaign" : "Activate Campaign"}
                    </button>
                    <button
                      onClick={() => enrollAll(c.id)}
                      disabled={enrolling === c.id}
                      className="font-body text-[12px] font-medium px-4 py-2 rounded-lg bg-[var(--brand-gold)]/10 text-[var(--brand-gold)] hover:bg-[var(--brand-gold)]/20 transition-colors disabled:opacity-40"
                    >
                      {enrolling === c.id ? "Enrolling..." : "Enroll All Leads"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: "green" | "blue" | "red" }) {
  const textColor = color === "green" ? "text-green-400"
    : color === "blue" ? "text-blue-400"
    : color === "red" ? "text-red-400"
    : "text-[var(--app-text)]";

  return (
    <div className="text-center">
      <div className={`font-display text-lg font-bold ${textColor}`}>{value}</div>
      <div className="font-body text-[10px] text-[var(--app-text-muted)] tracking-wider uppercase">{label}</div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color?: "green" | "blue" }) {
  const textColor = color === "green" ? "text-green-400" : color === "blue" ? "text-blue-400" : "text-[var(--app-text-muted)]";
  return (
    <div className="text-center">
      <div className={`font-body text-[12px] font-semibold ${textColor}`}>{value}</div>
      <div className="font-body text-[9px] text-[var(--app-text-muted)]">{label}</div>
    </div>
  );
}
