"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtDateTime } from "@/lib/format";

const PIPELINE_STAGES = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "lead_submitted", label: "Lead Submitted" },
  { value: "meeting_booked", label: "Meeting Booked" },
  { value: "meeting_missed", label: "Meeting Missed" },
  { value: "qualified", label: "Qualified" },
  { value: "disqualified", label: "Disqualified" },
  { value: "client_engaged", label: "Client Engaged" },
  { value: "in_process", label: "In Process" },
  { value: "closedwon", label: "Closed Won" },
];

interface Submission {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  companyName: string;
  city: string | null;
  state: string | null;
  partnerCode: string | null;
  estimatedDuties: number | null;
  estimatedRefund: number | null;
  importCategory: string | null;
  annualImportValue: string | null;
  dealId: string | null;
  dealStage: string | null;
  source: string;
  createdAt: string;
}

interface Stats {
  total: number;
  linked: number;
  unlinked: number;
  byStage: Record<string, number>;
  byPartner: Record<string, number>;
  bySource: Record<string, number>;
  funnel: { submitted: number; qualified: number; disqualified: number; engaged: number; inProcess: number; won: number };
}

const STAGE_COLORS: Record<string, string> = {
  lead_submitted: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  meeting_booked: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  qualified: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  client_engaged: "bg-green-500/10 text-green-400 border-green-500/20",
  in_process: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  closedwon: "bg-green-500/10 text-green-300 border-green-500/20",
  pending: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

function fmt$(n: number | null): string {
  if (n == null || n === 0) return "—";
  return `$${n.toLocaleString()}`;
}

export default function ClientSubmissionsTab() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/client-submissions");
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data.submissions || []);
        setStats(data.stats || null);
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-center py-12 font-body text-sm text-[var(--app-text-muted)]">Loading client submissions...</div>;

  return (
    <div>
      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="card p-4 text-center">
            <div className="font-display text-2xl text-[var(--app-text)]">{stats.total}</div>
            <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mt-1">Total Submissions</div>
          </div>
          <div className="card p-4 text-center">
            <div className="font-display text-2xl text-green-400">{stats.linked}</div>
            <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mt-1">Matched to Deal</div>
          </div>
          <div className="card p-4 text-center">
            <div className="font-display text-2xl text-amber-400">{stats.unlinked}</div>
            <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mt-1">Not Found</div>
          </div>
          <div className="card p-4 text-center">
            <div className="font-display text-2xl text-brand-gold">
              {stats.total > 0 ? `${Math.round((stats.linked / stats.total) * 100)}%` : "—"}
            </div>
            <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mt-1">Match Rate</div>
          </div>
        </div>
      )}

      {/* Conversion Funnel */}
      {stats && stats.funnel && (
        <div className="card p-5 mb-6">
          <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-3">Conversion Funnel</div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {([
              { label: "Submitted", value: stats.funnel.submitted, color: "text-blue-400" },
              { label: "Qualified", value: stats.funnel.qualified, color: "text-emerald-400" },
              { label: "Disqualified", value: stats.funnel.disqualified, color: "text-red-400" },
              { label: "Client Engaged", value: stats.funnel.engaged, color: "text-green-400" },
              { label: "In Process", value: stats.funnel.inProcess, color: "text-purple-400" },
              { label: "Won", value: stats.funnel.won, color: "text-brand-gold" },
            ] as const).map((s) => (
              <div key={s.label} className="text-center">
                <div className={`font-display text-xl ${s.color}`}>{s.value}</div>
                <div className="font-body text-[9px] text-[var(--app-text-muted)] uppercase tracking-wider mt-0.5">{s.label}</div>
                {stats.funnel.submitted > 0 && s.label !== "Submitted" && s.label !== "Disqualified" && (
                  <div className="font-body text-[9px] text-[var(--app-text-faint)] mt-0.5">
                    {Math.round((s.value / stats.funnel.submitted) * 100)}% rate
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stage + Source breakdown side by side */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {/* By Stage */}
          {Object.keys(stats.byStage).length > 0 && (
            <div className="card p-4">
              <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-3">By Deal Stage</div>
              <div className="space-y-2">
                {Object.entries(stats.byStage).sort(([,a], [,b]) => b - a).map(([stage, count]) => (
                  <div key={stage} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase border ${STAGE_COLORS[stage] || STAGE_COLORS.pending}`}>
                        {stage.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 rounded-full bg-[var(--app-input-bg)] overflow-hidden">
                        <div className="h-full rounded-full bg-brand-gold/60" style={{ width: `${(count / stats.total) * 100}%` }} />
                      </div>
                      <span className="font-body text-[12px] text-[var(--app-text-secondary)] w-8 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* By Partner / Source */}
          {Object.keys(stats.byPartner).length > 0 && (
            <div className="card p-4">
              <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-3">By Partner Source</div>
              <div className="space-y-2">
                {Object.entries(stats.byPartner).sort(([,a], [,b]) => b - a).map(([partner, count]) => (
                  <div key={partner} className="flex items-center justify-between">
                    <span className="font-body text-[12px] text-[var(--app-text-secondary)] font-mono">{partner === "direct" ? "Direct (no partner)" : partner}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 rounded-full bg-[var(--app-input-bg)] overflow-hidden">
                        <div className="h-full rounded-full bg-brand-gold/60" style={{ width: `${(count / stats.total) * 100}%` }} />
                      </div>
                      <span className="font-body text-[12px] text-[var(--app-text-secondary)] w-8 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pipeline stage tabs */}
      <div className="mb-4 border-b border-[var(--app-border)] overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {PIPELINE_STAGES.map((s) => {
            const count = s.value === "all"
              ? submissions.length
              : submissions.filter((sub) => (sub.dealStage || "pending") === s.value).length;
            const active = stageFilter === s.value;
            return (
              <button
                key={s.value}
                onClick={() => setStageFilter(s.value)}
                className={`font-body text-[12px] px-3 py-2 rounded-t-lg border border-b-0 transition-colors whitespace-nowrap min-h-[36px] ${
                  active
                    ? "text-brand-gold border-[var(--app-border)] bg-[var(--app-card-bg)] -mb-px font-semibold"
                    : "text-[var(--app-text-muted)] border-transparent hover:text-[var(--app-text-secondary)] hover:bg-brand-gold/5"
                }`}
              >
                {s.label}
                <span className={`ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${active ? "bg-brand-gold/20 text-brand-gold" : "bg-[var(--app-input-bg)] text-[var(--app-text-muted)]"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, company, partner code..."
          className="w-full bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-4 py-2.5 text-[var(--app-text)] font-body text-sm outline-none focus:border-brand-gold/40 transition-colors placeholder:text-[var(--app-text-muted)]"
        />
      </div>

      {(() => {
        const filtered = submissions
          .filter((s) => stageFilter === "all" || (s.dealStage || "pending") === stageFilter)
          .filter((s) => {
            if (!search) return true;
            const q = search.toLowerCase();
            return (
              s.firstName.toLowerCase().includes(q) ||
              s.lastName.toLowerCase().includes(q) ||
              s.email.toLowerCase().includes(q) ||
              s.companyName.toLowerCase().includes(q) ||
              (s.partnerCode || "").toLowerCase().includes(q)
            );
          });

        return filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-5xl mb-3">📊</div>
          <h3 className="text-lg font-semibold mb-1">{search || stageFilter !== "all" ? "No submissions match this filter" : "No client submissions yet"}</h3>
          <p className="text-sm text-[var(--app-text-muted)]">Submissions from /recover will appear here with deal sync status.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <div className="font-body text-[12px] text-[var(--app-text-muted)] px-4 py-2 border-b border-[var(--app-border)]">
            Showing {filtered.length} submission{filtered.length !== 1 ? "s" : ""}{stageFilter !== "all" ? ` in ${PIPELINE_STAGES.find((s) => s.value === stageFilter)?.label}` : ""}
          </div>
          <table className="w-full text-left font-body text-sm">
            <thead>
              <tr className="border-b border-[var(--app-border)] text-[var(--app-text-muted)] text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-center">Client</th>
                <th className="px-4 py-3 text-center">Company</th>
                <th className="px-4 py-3 text-center">Location</th>
                <th className="px-4 py-3 text-center">Est. Refund</th>
                <th className="px-4 py-3 text-center">Partner</th>
                <th className="px-4 py-3 text-center">Deal Stage</th>
                <th className="px-4 py-3 text-center">Match</th>
                <th className="px-4 py-3 text-center">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-[var(--app-border-subtle)] hover:bg-[var(--app-hover)] transition">
                  <td className="px-4 py-3">
                    <div className="font-medium text-[13px]">{s.firstName} {s.lastName}</div>
                    <div className="text-[11px] text-[var(--app-text-muted)]">{s.email}</div>
                    {s.phone && <div className="text-[10px] text-[var(--app-text-faint)]">{s.phone}</div>}
                  </td>
                  <td className="px-4 py-3 text-center text-[12px] text-[var(--app-text-secondary)]">{s.companyName}</td>
                  <td className="px-4 py-3 text-center text-[12px] text-[var(--app-text-secondary)]">
                    {s.city && s.state ? `${s.city}, ${s.state}` : s.state || "—"}
                  </td>
                  <td className="px-4 py-3 text-center text-[13px] text-green-400 font-semibold">{fmt$(s.estimatedRefund)}</td>
                  <td className="px-4 py-3 text-center text-[12px] font-mono text-[var(--app-text-secondary)]">{s.partnerCode || "Direct"}</td>
                  <td className="px-4 py-3 text-center">
                    {s.dealStage ? (
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase border ${STAGE_COLORS[s.dealStage] || STAGE_COLORS.pending}`}>
                        {s.dealStage.replace(/_/g, " ")}
                      </span>
                    ) : (
                      <span className="text-[11px] text-[var(--app-text-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {s.dealId ? (
                      <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase bg-green-500/10 text-green-400 border border-green-500/20">
                        Matched
                      </span>
                    ) : (
                      <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        Not Found
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-[12px] text-[var(--app-text-muted)] whitespace-nowrap">{fmtDateTime(s.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      })()}
    </div>
  );
}
