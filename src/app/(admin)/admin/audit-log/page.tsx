"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import ReportingTabs from "@/components/ui/ReportingTabs";

interface AuditEntry {
  id: string;
  createdAt: string;
  action: string;
  actorEmail: string;
  actorRole: string;
  actorId: string | null;
  targetType: string | null;
  targetId: string | null;
  details: string | null;
  ipAddress: string | null;
}

const ACTION_COLORS: Record<string, string> = {
  sign_in: "text-green-400",
  sign_out: "text-gray-400",
  "deal.create": "text-blue-400",
  "deal.update": "text-yellow-400",
  "deal.delete": "text-red-400",
  "partner.create": "text-green-400",
  "partner.update": "text-yellow-400",
  "settings.update": "text-purple-400",
  "admin.impersonate": "text-orange-400",
};

export default function AuditLogPage() {
  const { data: session } = useSession();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const PAGE_SIZE = 50;

  const role = (session?.user as any)?.role;

  useEffect(() => {
    if (role !== "super_admin") return;
    setLoading(true);
    const params = new URLSearchParams();
    if (actionFilter) params.set("action", actionFilter);
    if (actorFilter) params.set("actor", actorFilter);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(page * PAGE_SIZE));
    fetch(`/api/admin/audit-log?${params}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) { setLogs(d.logs); setTotal(d.total); } })
      .finally(() => setLoading(false));
  }, [role, actionFilter, actorFilter, page]);

  if (role !== "super_admin") {
    return (
      <div>
        <ReportingTabs />
        <div className="card p-8 text-center"><div className="text-4xl mb-4">🔒</div><p className="font-body text-sm theme-text-muted">Super Admin only.</p></div>
      </div>
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <ReportingTabs />
      <h2 className="font-display text-xl font-bold mb-1">Audit Log</h2>
      <p className="font-body text-[13px] theme-text-muted mb-6">Every sign-in, field change, and admin action — timestamped and attributed.</p>

      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Filter by action (e.g. sign_in, deal.update)"
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
          className="font-body text-[12px] bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2 w-60 text-[var(--app-text)]"
        />
        <input
          type="text"
          placeholder="Filter by actor email"
          value={actorFilter}
          onChange={(e) => { setActorFilter(e.target.value); setPage(0); }}
          className="font-body text-[12px] bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2 w-60 text-[var(--app-text)]"
        />
        <span className="font-body text-[11px] theme-text-muted self-center">{total} entries</span>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center"><div className="spinner mx-auto" /></div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center font-body text-sm theme-text-muted">No audit log entries yet. Actions will appear here as they occur.</div>
        ) : (
          <div>
            {logs.map((log) => {
              const isExpanded = expandedId === log.id;
              return (
                <div key={log.id} className="border-b border-[var(--app-border)] last:border-0">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    className="w-full text-left px-5 py-3 hover:bg-[var(--app-hover)] transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`font-mono text-[11px] font-semibold ${ACTION_COLORS[log.action] || "theme-text-secondary"}`}>
                        {log.action}
                      </span>
                      <span className="font-body text-[12px] text-[var(--app-text)]">{log.actorEmail}</span>
                      <span className="font-body text-[10px] theme-text-faint px-1.5 py-0.5 rounded border border-[var(--app-border)]">{log.actorRole}</span>
                      {log.targetType && (
                        <span className="font-mono text-[10px] theme-text-muted">{log.targetType}{log.targetId ? `:${log.targetId.slice(0, 8)}` : ""}</span>
                      )}
                      <span className="font-body text-[10px] theme-text-faint ml-auto">
                        {new Date(log.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} {new Date(log.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </span>
                      <span className="text-[10px] theme-text-muted">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </button>
                  {isExpanded && log.details && (
                    <div className="px-5 pb-3">
                      <pre className="font-mono text-[11px] text-[var(--app-text-secondary)] rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap"
                        style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)" }}>
                        {(() => { try { return JSON.stringify(JSON.parse(log.details), null, 2); } catch { return log.details; } })()}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-[var(--app-border)] flex items-center justify-between">
            <span className="font-body text-[11px] theme-text-muted">Page {page + 1} of {totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                className="font-body text-[11px] border border-[var(--app-border)] rounded px-2 py-1 theme-text-muted disabled:opacity-30">‹ Prev</button>
              <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
                className="font-body text-[11px] border border-[var(--app-border)] rounded px-2 py-1 theme-text-muted disabled:opacity-30">Next ›</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
