"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtDateTime } from "@/lib/format";

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

      {/* Stage breakdown */}
      {stats && Object.keys(stats.byStage).length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {Object.entries(stats.byStage).map(([stage, count]) => (
            <div key={stage} className={`px-3 py-1.5 rounded-full font-body text-[11px] border whitespace-nowrap ${STAGE_COLORS[stage] || STAGE_COLORS.pending}`}>
              {stage.replace(/_/g, " ")} <span className="font-semibold ml-1">{count}</span>
            </div>
          ))}
        </div>
      )}

      {submissions.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-5xl mb-3">📊</div>
          <h3 className="text-lg font-semibold mb-1">No client submissions yet</h3>
          <p className="text-sm text-[var(--app-text-muted)]">Submissions from /recover will appear here with deal sync status.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left font-body text-sm">
            <thead>
              <tr className="border-b border-[var(--app-border)] text-[var(--app-text-muted)] text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-center">Client</th>
                <th className="px-4 py-3 text-center">Company</th>
                <th className="px-4 py-3 text-center">Location</th>
                <th className="px-4 py-3 text-center">Est. Refund</th>
                <th className="px-4 py-3 text-center">Partner</th>
                <th className="px-4 py-3 text-center">Deal Status</th>
                <th className="px-4 py-3 text-center">Match</th>
                <th className="px-4 py-3 text-center">Date</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => (
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
      )}
    </div>
  );
}
