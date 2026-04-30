"use client";

import { useState, useEffect } from "react";

interface AnalyticsData {
  total: number;
  approved: number;
  pending: number;
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
  researchJobs: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  CAPE_UPDATE: "CAPE Update",
  LEGAL_CHANGE: "Legal Change",
  TARIFF_RATE: "Tariff Rate",
  STRATEGY_TIP: "Strategy Tip",
  COUNTRY_POLICY: "Country Policy",
  BROKER_GUIDANCE: "Broker Guidance",
  LEGAL_GUIDANCE: "Legal Guidance",
  GENERAL: "General",
};

const CATEGORY_COLORS: Record<string, string> = {
  CAPE_UPDATE: "#3b82f6",
  LEGAL_CHANGE: "#ef4444",
  TARIFF_RATE: "#a855f7",
  STRATEGY_TIP: "#22c55e",
  COUNTRY_POLICY: "#f97316",
  BROKER_GUIDANCE: "#06b6d4",
  LEGAL_GUIDANCE: "#eab308",
  GENERAL: "#6b7280",
};

export default function KnowledgeAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Fetch all entries + research jobs for analytics
        const [knowledgeRes, jobsRes] = await Promise.all([
          fetch("/api/admin/knowledge?limit=1000"),
          fetch("/api/admin/research/jobs"),
        ]);

        const knowledgeData = knowledgeRes.ok ? await knowledgeRes.json() : { entries: [], total: 0 };
        const jobsData = jobsRes.ok ? await jobsRes.json() : { jobs: [] };

        const entries = knowledgeData.entries || [];
        const byCategory: Record<string, number> = {};
        const bySource: Record<string, number> = {};
        let approved = 0;
        let pending = 0;

        for (const entry of entries) {
          byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
          bySource[entry.sourceType] = (bySource[entry.sourceType] || 0) + 1;
          if (entry.isApproved) approved++;
          else pending++;
        }

        setData({
          total: knowledgeData.total || entries.length,
          approved,
          pending,
          byCategory,
          bySource,
          researchJobs: (jobsData.jobs || []).length,
        });
      } catch {
        // graceful fallback
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return <div className="text-center py-12 text-[var(--app-text-muted)]">Loading analytics...</div>;
  }

  if (!data) {
    return <div className="text-center py-12 text-[var(--app-text-muted)]">Could not load analytics.</div>;
  }

  const maxCategoryCount = Math.max(1, ...Object.values(data.byCategory));

  return (
    <div className="space-y-8">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Entries" value={data.total} />
        <StatCard label="Approved" value={data.approved} accent="green" />
        <StatCard label="Pending Review" value={data.pending} accent="yellow" />
        <StatCard label="Research Jobs" value={data.researchJobs} accent="blue" />
      </div>

      {/* Source breakdown */}
      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg-secondary)] p-6">
        <h3 className="text-sm font-semibold text-[var(--app-text)] mb-4">Entries by Source</h3>
        <div className="flex flex-wrap gap-4">
          {Object.entries(data.bySource).map(([source, count]) => (
            <div key={source} className="flex items-center gap-2">
              <span className={`inline-block w-3 h-3 rounded-full ${
                source === "ADMIN_PASTE" ? "bg-brand-gold" :
                source === "WEB_RESEARCH" ? "bg-blue-400" :
                "bg-gray-400"
              }`} />
              <span className="text-sm text-[var(--app-text-secondary)]">
                {source === "ADMIN_PASTE" ? "Admin" : source === "WEB_RESEARCH" ? "Research" : "System"}: {count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Category bar chart */}
      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg-secondary)] p-6">
        <h3 className="text-sm font-semibold text-[var(--app-text)] mb-4">Entries by Category</h3>
        <div className="space-y-3">
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
            const count = data.byCategory[key] || 0;
            const pct = (count / maxCategoryCount) * 100;
            return (
              <div key={key} className="flex items-center gap-3">
                <div className="w-32 text-xs text-[var(--app-text-muted)] text-right shrink-0">{label}</div>
                <div className="flex-1 h-6 rounded-full bg-[var(--app-bg)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: CATEGORY_COLORS[key] || "#6b7280", minWidth: count > 0 ? "8px" : "0" }}
                  />
                </div>
                <div className="w-8 text-xs text-[var(--app-text-secondary)] text-right">{count}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  const accentClasses =
    accent === "green" ? "border-green-500/20 bg-green-500/5" :
    accent === "yellow" ? "border-yellow-500/20 bg-yellow-500/5" :
    accent === "blue" ? "border-blue-500/20 bg-blue-500/5" :
    "border-[var(--app-border)] bg-[var(--app-bg-secondary)]";

  return (
    <div className={`rounded-xl border p-5 ${accentClasses}`}>
      <div className="text-2xl font-bold text-[var(--app-text)]">{value.toLocaleString()}</div>
      <div className="text-xs text-[var(--app-text-muted)] mt-1">{label}</div>
    </div>
  );
}
