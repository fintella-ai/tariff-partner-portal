"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

// ─── Types ──────────────────────────────────────────────────────────────────

type Tab = "links" | "errors" | "email" | "webhook" | "commits";

type Commit = {
  sha: string;
  fullSha: string;
  message: string;
  author: string;
  date: string;
  url: string;
};

type DevData = {
  commits: Commit[];
  source: string;
  deployment: {
    commitSha: string;
    fullSha: string;
    branch: string;
    deployUrl: string;
    deployedAt: string | null;
    repo: string;
  };
  githubTokenConfigured: boolean;
};

type SentryIssue = {
  id: string;
  title: string;
  culprit: string;
  level: string;
  count: number;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
  status: string;
};

type ErrorsData = {
  issues: SentryIssue[];
  configured: boolean;
  total?: number;
  message?: string;
  error?: string;
};

type ApiLog = {
  id: string;
  createdAt: string;
  method: string;
  path: string;
  sourceIp: string | null;
  headers: string | null;
  body: string | null;
  responseStatus: number | null;
  responseBody: string | null;
  durationMs: number | null;
  error: string | null;
};

// ─── Webhook test presets ────────────────────────────────────────────────────

type Method = "POST" | "PATCH" | "GET";

const POST_PRESETS = [
  {
    label: "Minimal (new lead)",
    description: "Smallest valid payload",
    payload: { utm_content: "DEMO01", first_name: "Jane", last_name: "Doe", legal_entity_name: "Acme Imports LLC" },
  },
  {
    label: "Full lead",
    description: "All common fields",
    payload: {
      utm_content: "DEMO01", first_name: "John", last_name: "Smith",
      email: "john@acmeimports.com", phone: "+14105551234",
      business_title: "VP of Supply Chain", legal_entity_name: "Acme Imports LLC",
      service_of_interest: "Tariff Refund Support", city: "Baltimore", state: "MD",
      imports_goods: "Yes", import_countries: "China, Vietnam",
      annual_import_value: "$5M - $10M", importer_of_record: "Acme Imports LLC",
      affiliate_notes: "Referred via weekly networking event. Strong fit.", stage: "new_lead",
    },
  },
  {
    label: "Consultation booked",
    description: "Lead with scheduled consult",
    payload: {
      utm_content: "DEMO01", first_name: "Maria", last_name: "Garcia",
      email: "maria@globalmanuf.com", legal_entity_name: "Global Manufacturing Co",
      service_of_interest: "Tariff Refund Support", city: "Los Angeles", state: "CA",
      imports_goods: "Yes", annual_import_value: "$10M - $25M",
      stage: "consultation_booked", consult_booked_date: "2026-05-15", consult_booked_time: "14:00",
    },
  },
  {
    label: "Closed won",
    description: "Deal ready for commission",
    payload: {
      utm_content: "DEMO01", first_name: "Robert", last_name: "Chen",
      email: "robert@pacificimports.com", legal_entity_name: "Pacific Imports Inc",
      service_of_interest: "Tariff Refund Support", stage: "closedwon",
    },
  },
];

const PATCH_PRESETS = [
  {
    label: "Move to consultation_booked",
    description: "Update stage + add consult date",
    payload: { dealId: "REPLACE_WITH_DEAL_ID", stage: "consultation_booked", consult_booked_date: "2026-05-15", consult_booked_time: "14:00" },
  },
  {
    label: "Move to client_engaged",
    description: "Deal signed retainer",
    payload: { dealId: "REPLACE_WITH_DEAL_ID", stage: "client_engaged" },
  },
  {
    label: "Closed won",
    description: "Refund recovered",
    payload: { dealId: "REPLACE_WITH_DEAL_ID", stage: "closedwon" },
  },
  {
    label: "Closed lost",
    description: "Deal dropped with reason",
    payload: { dealId: "REPLACE_WITH_DEAL_ID", stage: "closedlost", closed_lost_reason: "Client chose a competitor" },
  },
];

// ─── Utility ─────────────────────────────────────────────────────────────────

function prettyJson(s: string | null | undefined): string {
  if (!s) return "";
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function statusColor(code: number | null): string {
  if (!code) return "text-red-400";
  if (code < 300) return "text-green-400";
  if (code < 500) return "text-yellow-400";
  return "text-red-400";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// ── Quick Links Tab ──
function QuickLinksTab({ data }: { data: DevData | null }) {
  const d = data?.deployment;
  return (
    <div className="space-y-5">
      {/* Current Deployment */}
      <div className="card p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">🚀</span>
          <div className="font-body font-semibold text-sm">Current Deployment</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-lg" style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)" }}>
            <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-1">Commit</div>
            <div className="font-mono text-[13px] text-brand-gold select-all">{d?.commitSha || "unknown"}</div>
          </div>
          <div className="p-3 rounded-lg" style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)" }}>
            <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-1">Branch</div>
            <div className="font-mono text-[13px] text-[var(--app-text)]">{d?.branch || "main"}</div>
          </div>
          <div className="p-3 rounded-lg sm:col-span-2" style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)" }}>
            <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-1">Repository</div>
            <div className="font-mono text-[12px] theme-text-secondary break-all">{d?.repo || "—"}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {d?.repo && (
            <a href={`https://github.com/${d.repo}`} target="_blank" rel="noopener noreferrer"
              className="font-body text-[11px] text-brand-gold border border-brand-gold/20 rounded-lg px-4 py-2 hover:bg-brand-gold/10 transition-colors min-h-[44px] flex items-center">
              GitHub Repo ↗
            </a>
          )}
          {d?.repo && (
            <a href={`https://github.com/${d.repo}/commits/${d.branch || "main"}`} target="_blank" rel="noopener noreferrer"
              className="font-body text-[11px] theme-text-secondary border border-[var(--app-border)] rounded-lg px-4 py-2 hover:bg-[var(--app-card-bg)] transition-colors min-h-[44px] flex items-center">
              All Commits ↗
            </a>
          )}
        </div>
      </div>

      {/* Link grid */}
      <div className="card p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">🔗</span>
          <div className="font-body font-semibold text-sm">Quick Links</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a href="https://claude.ai/code" target="_blank" rel="noopener noreferrer"
            className="p-3.5 rounded-lg border border-brand-gold/30 bg-brand-gold/[0.05] hover:border-brand-gold/50 hover:bg-brand-gold/[0.10] transition-colors">
            <div className="font-body text-sm text-brand-gold mb-1 flex items-center gap-1.5">🤖 Claude Code ↗</div>
            <div className="font-body text-[10px] theme-text-muted">Open a Claude Code session to build features or fix bugs</div>
          </a>
          <a href="https://docs.claude.com/en/docs/claude-code" target="_blank" rel="noopener noreferrer"
            className="p-3.5 rounded-lg border border-[var(--app-border)] hover:border-brand-gold/30 transition-colors">
            <div className="font-body text-sm text-[var(--app-text)] mb-1">Claude Code Docs ↗</div>
            <div className="font-body text-[10px] theme-text-muted">Official documentation for Claude Code CLI</div>
          </a>
          <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer"
            className="p-3.5 rounded-lg border border-[var(--app-border)] hover:border-brand-gold/30 transition-colors">
            <div className="font-body text-sm text-[var(--app-text)] mb-1">Vercel Dashboard ↗</div>
            <div className="font-body text-[10px] theme-text-muted">Deployment logs, env vars, analytics</div>
          </a>
          <a href="https://console.neon.tech/" target="_blank" rel="noopener noreferrer"
            className="p-3.5 rounded-lg border border-[var(--app-border)] hover:border-brand-gold/30 transition-colors">
            <div className="font-body text-sm text-[var(--app-text)] mb-1">Neon Database ↗</div>
            <div className="font-body text-[10px] theme-text-muted">PostgreSQL database console</div>
          </a>
          <a href="https://console.twilio.com/" target="_blank" rel="noopener noreferrer"
            className="p-3.5 rounded-lg border border-[var(--app-border)] hover:border-brand-gold/30 transition-colors">
            <div className="font-body text-sm text-[var(--app-text)] mb-1">Twilio Dashboard ↗</div>
            <div className="font-body text-[10px] theme-text-muted">SMS, voice, A2P 10DLC, messaging services</div>
          </a>
          <a href="https://app.sendgrid.com/" target="_blank" rel="noopener noreferrer"
            className="p-3.5 rounded-lg border border-[var(--app-border)] hover:border-brand-gold/30 transition-colors">
            <div className="font-body text-sm text-[var(--app-text)] mb-1">SendGrid ↗</div>
            <div className="font-body text-[10px] theme-text-muted">Transactional email, domain auth, stats</div>
          </a>
          <a href="https://sentry.io/organizations/" target="_blank" rel="noopener noreferrer"
            className="p-3.5 rounded-lg border border-[var(--app-border)] hover:border-brand-gold/30 transition-colors">
            <div className="font-body text-sm text-[var(--app-text)] mb-1">Sentry ↗</div>
            <div className="font-body text-[10px] theme-text-muted">Error tracking, performance monitoring</div>
          </a>
          <a href="/docs/webhook-guide" target="_blank"
            className="p-3.5 rounded-lg border border-[var(--app-border)] hover:border-brand-gold/30 transition-colors">
            <div className="font-body text-sm text-[var(--app-text)] mb-1">Webhook Guide</div>
            <div className="font-body text-[10px] theme-text-muted">Frost Law referral webhook integration spec</div>
          </a>
          {d?.repo && (
            <a href={`https://github.com/${d.repo}/blob/main/CLAUDE.md`} target="_blank" rel="noopener noreferrer"
              className="p-3.5 rounded-lg border border-[var(--app-border)] hover:border-brand-gold/30 transition-colors">
              <div className="font-body text-sm text-[var(--app-text)] mb-1">CLAUDE.md ↗</div>
              <div className="font-body text-[10px] theme-text-muted">Project context and architecture notes</div>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Recent Errors Tab ──
function ErrorsTab({ errors }: { errors: ErrorsData | null }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--app-border)] flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-lg">🚨</span>
          <div>
            <div className="font-body font-semibold text-sm">Recent Errors (Last 24h)</div>
            <div className="font-body text-[11px] theme-text-muted">
              {errors?.configured
                ? `${errors.total || 0} unresolved issue${errors.total === 1 ? "" : "s"} from Sentry`
                : "Sentry not configured"}
            </div>
          </div>
        </div>
        {errors?.configured && (
          <a href="https://sentry.io/organizations/" target="_blank" rel="noopener noreferrer"
            className="font-body text-[11px] text-brand-gold hover:underline">
            Open Sentry ↗
          </a>
        )}
      </div>

      {!errors?.configured ? (
        <div className="px-5 py-8 text-center">
          <div className="font-body text-[12px] theme-text-muted mb-2">
            Set <code className="text-brand-gold">SENTRY_AUTH_TOKEN</code>, <code className="text-brand-gold">SENTRY_ORG</code>, and{" "}
            <code className="text-brand-gold">SENTRY_PROJECT</code> in Vercel env vars to enable live error tracking.
          </div>
          <div className="font-body text-[11px] theme-text-muted">
            Errors are still captured if <code>SENTRY_DSN</code> is set — this panel just fetches the list.
          </div>
        </div>
      ) : errors.error ? (
        <div className="px-5 py-6 text-center">
          <div className="font-body text-[12px] text-red-400">{errors.error}</div>
        </div>
      ) : errors.issues.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <div className="text-3xl mb-2">✅</div>
          <div className="font-body text-[13px] theme-text-secondary">No unresolved errors in the last 24 hours.</div>
          <div className="font-body text-[11px] theme-text-muted mt-1">Your portal is healthy.</div>
        </div>
      ) : (
        <div>
          {errors.issues.map((issue, idx) => (
            <div key={issue.id}
              className={`px-5 py-3.5 border-b border-[var(--app-border)] last:border-b-0 ${idx % 2 === 1 ? "bg-[rgba(239,68,68,0.02)]" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-body text-[13px] text-[var(--app-text)] mb-1 break-words font-medium">{issue.title}</div>
                  {issue.culprit && <div className="font-mono text-[10px] theme-text-muted break-all mb-1">{issue.culprit}</div>}
                  <div className="flex items-center gap-2 font-body text-[10px] theme-text-muted flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded uppercase tracking-wider ${
                      issue.level === "error" || issue.level === "fatal"
                        ? "bg-red-500/10 text-red-400 border border-red-500/20"
                        : issue.level === "warning"
                          ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                          : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                    }`}>{issue.level}</span>
                    <span>·</span>
                    <span>{issue.count} event{issue.count === 1 ? "" : "s"}</span>
                    {issue.userCount > 0 && <><span>·</span><span>{issue.userCount} user{issue.userCount === 1 ? "" : "s"}</span></>}
                    <span>·</span>
                    <span>Last seen {new Date(issue.lastSeen).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  </div>
                </div>
                {issue.permalink && (
                  <a href={issue.permalink} target="_blank" rel="noopener noreferrer"
                    className="font-body text-[10px] text-brand-gold hover:underline shrink-0">View ↗</a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Send Test Email Tab ──
function EmailTab({ userEmail }: { userEmail: string }) {
  const [to, setTo] = useState(userEmail);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean; status: string; messageId: string | null; error?: string; sentAt?: string; to?: string;
  } | null>(null);

  useEffect(() => { if (userEmail && !to) setTo(userEmail); }, [userEmail, to]);

  const send = async () => {
    if (!to.trim()) return;
    setSending(true); setResult(null);
    try {
      const res = await fetch("/api/admin/dev/test-email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim() }),
      });
      const data = await res.json();
      setResult(res.ok ? data : { ok: false, status: "failed", messageId: null, error: data.error || `HTTP ${res.status}` });
    } catch (err: any) {
      setResult({ ok: false, status: "failed", messageId: null, error: err?.message || "Network error" });
    } finally { setSending(false); }
  };

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">✉️</span>
        <div className="font-body font-semibold text-sm">Send Test Email</div>
      </div>
      <p className="font-body text-[12px] theme-text-muted mb-4 leading-relaxed">
        Diagnostic SendGrid send. Calls the same <code className="font-mono text-[11px]">sendEmail()</code> code path as every
        transactional email and writes the result to <code className="font-mono text-[11px]">EmailLog</code> with{" "}
        <code className="font-mono text-[11px]">template=&quot;test&quot;</code>. Use this to verify{" "}
        <code className="font-mono text-[11px]">SENDGRID_API_KEY</code> auth and From-domain authorization.
      </p>
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input type="email" value={to} onChange={(e) => setTo(e.target.value)}
          placeholder="recipient@example.com" disabled={sending}
          className="flex-1 bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] outline-none focus:border-brand-gold/40 transition-colors placeholder:text-[var(--app-text-muted)]" />
        <button onClick={send} disabled={sending || !to.trim()}
          className="btn-gold text-[12px] px-5 py-2.5 disabled:opacity-50 min-h-[44px]">
          {sending ? "Sending…" : "Send Test Email"}
        </button>
      </div>
      {result && (
        <div className="rounded-lg p-3 mt-2 font-body text-[12px] leading-relaxed"
          style={{ background: result.ok ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", border: `1px solid ${result.ok ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}` }}>
          <div className="flex items-center gap-2 mb-1">
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: result.ok ? "#22c55e" : "#ef4444", display: "inline-block" }} />
            <span className="font-semibold" style={{ color: result.ok ? "#22c55e" : "#ef4444" }}>{result.status.toUpperCase()}</span>
            {result.to && <span className="theme-text-muted text-[11px]">→ {result.to}</span>}
          </div>
          {result.status === "sent" && result.messageId && (
            <div className="theme-text-secondary">Message ID: <code className="font-mono text-[11px] select-all">{result.messageId}</code></div>
          )}
          {result.status === "demo" && (
            <div className="theme-text-secondary">
              <code className="font-mono text-[11px]">SENDGRID_API_KEY</code> is not set — send was a no-op but an EmailLog row was written with <code className="font-mono text-[11px]">status=&quot;demo&quot;</code>.
            </div>
          )}
          {result.status === "failed" && result.error && (
            <div className="theme-text-secondary mt-1 break-words"><span className="text-red-400">Error:</span> {result.error}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Recent Commits Tab ──
function CommitsTab({ data }: { data: DevData | null }) {
  const commits = data?.commits || [];
  const d = data?.deployment;
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--app-border)]">
        <div className="font-body font-semibold text-sm">Recent Commits</div>
        <div className="font-body text-[11px] theme-text-muted">
          {data?.source === "github_api" ? "Live from GitHub API" : "GitHub token not configured — showing static info"}
        </div>
      </div>
      {commits.length === 0 ? (
        <div className="p-8 text-center">
          <div className="font-body text-sm theme-text-muted mb-2">No commits to display.</div>
          <div className="font-body text-[11px] theme-text-faint">
            Add a <code className="font-mono text-brand-gold">GITHUB_TOKEN</code> env var in Vercel with read access to enable the live commit feed.
          </div>
        </div>
      ) : (
        <div>
          {commits.map((c, idx) => (
            <div key={c.fullSha}
              className={`px-5 py-3 border-b border-[var(--app-border)] last:border-b-0 ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-body text-[13px] text-[var(--app-text)] mb-1 break-words">{c.message}</div>
                  <div className="flex items-center gap-2 font-body text-[10px] theme-text-muted">
                    <span className="font-mono text-brand-gold">{c.sha}</span>
                    <span>·</span><span>{c.author}</span><span>·</span>
                    <span>{new Date(c.date).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  </div>
                </div>
                <a href={c.url} target="_blank" rel="noopener noreferrer"
                  className="font-body text-[10px] text-brand-gold hover:underline shrink-0">View ↗</a>
              </div>
            </div>
          ))}
        </div>
      )}
      {d?.repo && (
        <div className="px-5 py-3 border-t border-[var(--app-border)]">
          <a href={`https://github.com/${d.repo}/commits/${d.branch || "main"}`} target="_blank" rel="noopener noreferrer"
            className="font-body text-[11px] text-brand-gold hover:underline">View all commits on GitHub ↗</a>
        </div>
      )}
    </div>
  );
}

// ── API Log section (inside Webhook tab) ──
function ApiLogSection() {
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/dev/api-log");
      if (res.ok) { const d = await res.json(); setLogs(d.logs || []); }
    } finally { setLoading(false); }
  };

  const clearLogs = async () => {
    if (!confirm("Clear all API request logs? This cannot be undone.")) return;
    setClearing(true);
    try {
      await fetch("/api/admin/dev/api-log", { method: "DELETE" });
      setLogs([]);
    } finally { setClearing(false); }
  };

  useEffect(() => { fetchLogs(); }, []);

  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(fetchLogs, 5000);
    } else {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [autoRefresh]);

  const methodBadge = (m: string) => {
    const colors: Record<string, string> = {
      POST: "bg-blue-500/15 text-blue-400 border-blue-500/30",
      PATCH: "bg-purple-500/15 text-purple-400 border-purple-500/30",
      GET: "bg-green-500/15 text-green-400 border-green-500/30",
      PUT: "bg-orange-500/15 text-orange-400 border-orange-500/30",
      DELETE: "bg-red-500/15 text-red-400 border-red-500/30",
    };
    return (
      <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border ${colors[m] || "bg-[var(--app-input-bg)] theme-text-muted border-[var(--app-border)]"}`}>
        {m}
      </span>
    );
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--app-border)] flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-body font-semibold text-sm">Incoming API Log</div>
          <div className="font-body text-[11px] theme-text-muted">
            All requests to <code className="font-mono text-[10px] text-brand-gold">/api/webhook/referral</code> — auth values redacted
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setAutoRefresh((p) => !p)}
            className={`font-body text-[11px] border rounded-lg px-3 py-1.5 min-h-[36px] transition-colors ${
              autoRefresh
                ? "bg-brand-gold/10 border-brand-gold/30 text-brand-gold"
                : "border-[var(--app-border)] theme-text-muted hover:border-brand-gold/20"
            }`}
          >
            {autoRefresh ? "⏸ Auto" : "▶ Auto"} 5s
          </button>
          <button onClick={fetchLogs} disabled={loading}
            className="font-body text-[11px] border border-[var(--app-border)] theme-text-muted rounded-lg px-3 py-1.5 min-h-[36px] hover:border-brand-gold/20 transition-colors disabled:opacity-50">
            {loading ? "…" : "↺ Refresh"}
          </button>
          {logs.length > 0 && (
            <button onClick={clearLogs} disabled={clearing}
              className="font-body text-[11px] border border-red-500/20 text-red-400 rounded-lg px-3 py-1.5 min-h-[36px] hover:bg-red-500/5 transition-colors disabled:opacity-50">
              🗑 Clear
            </button>
          )}
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <div className="font-body text-sm theme-text-muted mb-1">No requests logged yet.</div>
          <div className="font-body text-[11px] theme-text-faint">
            Every call to <code className="font-mono">/api/webhook/referral</code> will appear here — from Frost Law, the test harness, or anywhere else.
          </div>
        </div>
      ) : (
        <div>
          {logs.map((log) => {
            const isExpanded = expandedId === log.id;
            const statusCode = log.responseStatus;
            return (
              <div key={log.id} className="border-b border-[var(--app-border)] last:border-b-0">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  className="w-full text-left px-5 py-3 hover:bg-[var(--app-hover)] transition-colors"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    {methodBadge(log.method)}
                    <span className={`font-mono text-[12px] font-semibold ${statusColor(statusCode)}`}>
                      {statusCode ?? "ERR"}
                    </span>
                    {log.durationMs != null && (
                      <span className="font-body text-[11px] theme-text-muted">{log.durationMs}ms</span>
                    )}
                    {log.sourceIp && (
                      <span className="font-mono text-[11px] theme-text-muted">{log.sourceIp}</span>
                    )}
                    <span className="font-body text-[11px] theme-text-muted ml-auto">
                      {relativeTime(log.createdAt)}
                    </span>
                    {log.error && (
                      <span className="font-body text-[10px] text-red-400 border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 rounded">
                        error
                      </span>
                    )}
                    <span className="font-body text-[10px] theme-text-muted">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                  {log.error && (
                    <div className="mt-1 font-body text-[11px] text-red-400 truncate">{log.error}</div>
                  )}
                </button>

                {isExpanded && (
                  <div className="px-5 pb-4 space-y-3 bg-[var(--app-bg-secondary)]">
                    <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted pt-2">
                      {new Date(log.createdAt).toLocaleString()} · {log.path}
                    </div>

                    {log.headers && (
                      <div>
                        <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-1">Request Headers</div>
                        <pre className="font-mono text-[11px] text-[var(--app-text)] overflow-x-auto whitespace-pre-wrap break-all rounded-lg px-3 py-2.5"
                          style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)" }}>
                          {prettyJson(log.headers)}
                        </pre>
                      </div>
                    )}

                    {log.body && (
                      <div>
                        <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-1">Request Body</div>
                        <pre className="font-mono text-[11px] text-[var(--app-text)] overflow-x-auto whitespace-pre-wrap break-all rounded-lg px-3 py-2.5"
                          style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)" }}>
                          {prettyJson(log.body)}
                        </pre>
                      </div>
                    )}

                    {log.responseBody && (
                      <div>
                        <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-1">Response Body</div>
                        <pre className="font-mono text-[11px] text-[var(--app-text)] overflow-x-auto whitespace-pre-wrap break-all rounded-lg px-3 py-2.5"
                          style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)" }}>
                          {prettyJson(log.responseBody)}
                        </pre>
                      </div>
                    )}

                    {log.error && (
                      <div>
                        <div className="font-body text-[10px] uppercase tracking-wider text-red-400 mb-1">Error</div>
                        <div className="font-mono text-[11px] text-red-400 rounded-lg px-3 py-2.5"
                          style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
                          {log.error}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Custom API Sender section (inside Webhook tab) ──
type HeaderRow = { key: string; value: string; id: number };

function CustomSenderSection() {
  const [url, setUrl] = useState("https://fintella.partners/api/webhook/referral");
  const [method, setMethod] = useState("POST");
  const [headers, setHeaders] = useState<HeaderRow[]>([
    { key: "Content-Type", value: "application/json", id: 1 },
    { key: "x-fintella-api-key", value: "", id: 2 },
  ]);
  const [bodyText, setBodyText] = useState('{\n  "utm_content": "DEMO01",\n  "first_name": "Test"\n}');
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [parseError, setParseError] = useState("");
  const [nextId, setNextId] = useState(3);

  const addHeader = () => {
    setHeaders((p) => [...p, { key: "", value: "", id: nextId }]);
    setNextId((p) => p + 1);
  };
  const removeHeader = (id: number) => setHeaders((p) => p.filter((h) => h.id !== id));
  const updateHeader = (id: number, field: "key" | "value", val: string) =>
    setHeaders((p) => p.map((h) => (h.id === id ? { ...h, [field]: val } : h)));

  const isBodyMethod = !["GET", "HEAD"].includes(method);
  const parsedBody = useMemo(() => {
    if (!isBodyMethod) return null;
    try { return JSON.parse(bodyText); } catch { return null; }
  }, [bodyText, isBodyMethod]);

  const send = async () => {
    setSending(true); setParseError(""); setResponse(null);
    let parsedBodyVal: unknown = undefined;
    if (isBodyMethod) {
      try { parsedBodyVal = JSON.parse(bodyText); }
      catch (e: any) { setParseError(`Invalid JSON: ${e?.message}`); setSending(false); return; }
    }
    const headerMap: Record<string, string> = {};
    for (const h of headers) { if (h.key.trim()) headerMap[h.key.trim()] = h.value; }

    try {
      const res = await fetch("/api/admin/dev/api-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, method, headers: headerMap, body: parsedBodyVal }),
      });
      const data = await res.json();
      setResponse(res.ok ? data : { ...data, ok: false, status: res.status });
    } catch (err: any) {
      setResponse({ status: 0, statusText: "Network error", ok: false, body: { error: err?.message } });
    } finally { setSending(false); }
  };

  const HTTP_METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"];

  return (
    <div className="card p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">🛰️</span>
        <div className="font-body font-semibold text-sm">Custom API Request</div>
      </div>
      <p className="font-body text-[12px] theme-text-muted leading-relaxed">
        Send arbitrary HTTP requests with full control over URL, method, headers, and body. Proxied server-side to avoid CORS.
      </p>

      {/* URL + Method */}
      <div className="flex gap-2 flex-col sm:flex-row">
        <select value={method} onChange={(e) => setMethod(e.target.value)}
          className="w-full sm:w-28 bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-3 py-2.5 font-mono text-[12px] text-[var(--app-text)] outline-none focus:border-brand-gold/40 transition-colors shrink-0">
          {HTTP_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/api/endpoint"
          className="flex-1 bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-3 py-2.5 font-mono text-[12px] text-[var(--app-text)] outline-none focus:border-brand-gold/40 transition-colors placeholder:text-[var(--app-text-muted)]" />
      </div>

      {/* Headers */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted">Headers</div>
          <button onClick={addHeader}
            className="font-body text-[11px] text-brand-gold border border-brand-gold/20 rounded px-2.5 py-1 hover:bg-brand-gold/10 transition-colors min-h-[32px]">
            + Add
          </button>
        </div>
        <div className="space-y-1.5">
          {headers.map((h) => (
            <div key={h.id} className="flex gap-2">
              <input value={h.key} onChange={(e) => updateHeader(h.id, "key", e.target.value)}
                placeholder="Header-Name"
                className="w-[40%] bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded px-2.5 py-1.5 font-mono text-[11px] text-[var(--app-text)] outline-none focus:border-brand-gold/40 transition-colors placeholder:text-[var(--app-text-muted)]" />
              <input value={h.value} onChange={(e) => updateHeader(h.id, "value", e.target.value)}
                placeholder="value"
                className="flex-1 bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded px-2.5 py-1.5 font-mono text-[11px] text-[var(--app-text)] outline-none focus:border-brand-gold/40 transition-colors placeholder:text-[var(--app-text-muted)]" />
              <button onClick={() => removeHeader(h.id)}
                className="px-2 rounded border border-[var(--app-border)] theme-text-muted hover:border-red-500/30 hover:text-red-400 transition-colors min-w-[32px]"
                title="Remove header">✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      {isBodyMethod && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted">Body (JSON)</div>
            <span className="font-body text-[10px]">
              {parsedBody ? <span className="text-green-400">✓ Valid JSON</span> : <span className="text-red-400">✗ Invalid JSON</span>}
            </span>
          </div>
          <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)}
            rows={8} spellCheck={false}
            className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 font-mono text-[12px] text-[var(--app-text)] outline-none focus:border-brand-gold/30 transition-colors resize-y" />
          {parseError && <div className="mt-1 font-body text-[11px] text-red-400">{parseError}</div>}
        </div>
      )}

      {/* Send */}
      <button onClick={send} disabled={sending || !url.trim()}
        className="w-full bg-brand-gold/15 border border-brand-gold/30 text-brand-gold rounded-lg py-3 font-body text-sm font-semibold hover:bg-brand-gold/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]">
        {sending ? "Sending…" : `Send ${method} →`}
      </button>

      {/* Response */}
      {response && (
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${response.ok ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}` }}>
          <div className={`px-4 py-2.5 flex items-center gap-3 flex-wrap ${response.ok ? "bg-green-500/5" : "bg-red-500/5"}`}>
            <span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded border ${
              response.ok ? "bg-green-500/15 text-green-400 border-green-500/30" : "bg-red-500/15 text-red-400 border-red-500/30"
            }`}>
              {response.status || "ERR"} {response.statusText}
            </span>
            <span className="font-mono text-[11px] theme-text-muted">{response.method} {response.url}</span>
            {response.durationMs != null && (
              <span className="font-body text-[11px] theme-text-muted ml-auto">{response.durationMs}ms</span>
            )}
          </div>
          <div className="px-4 py-3">
            <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">Response Body</div>
            <pre className="font-mono text-[11px] text-[var(--app-text)] overflow-x-auto whitespace-pre-wrap break-all rounded-lg px-3 py-2.5"
              style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)" }}>
              {typeof response.body === "string" ? response.body : JSON.stringify(response.body, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Webhook Test Tab (harness + custom sender + API log) ──
function WebhookTab() {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("POST");
  const [payloadText, setPayloadText] = useState(JSON.stringify(POST_PRESETS[0].payload, null, 2));
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [parseError, setParseError] = useState("");

  const parsedPayload = useMemo(() => {
    if (method === "GET") return null;
    try { return JSON.parse(payloadText); } catch { return null; }
  }, [payloadText, method]);

  const presets = method === "PATCH" ? PATCH_PRESETS : POST_PRESETS;

  function switchMethod(m: Method) {
    setMethod(m); setResponse(null); setParseError("");
    if (m === "POST") setPayloadText(JSON.stringify(POST_PRESETS[0].payload, null, 2));
    else if (m === "PATCH") setPayloadText(JSON.stringify(PATCH_PRESETS[0].payload, null, 2));
    else setPayloadText("");
  }

  async function sendRequest() {
    setSending(true); setParseError(""); setResponse(null);
    let payload: unknown = undefined;
    if (method !== "GET") {
      try { payload = JSON.parse(payloadText); }
      catch (e: any) { setParseError(`Invalid JSON: ${e?.message}`); setSending(false); return; }
    }
    try {
      const res = await fetch("/api/admin/dev/webhook-test", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, payload }),
      });
      const data = await res.json();
      setResponse(res.ok ? data : { status: res.status, statusText: res.statusText, ok: false, url: "/api/webhook/referral", method, body: data, secretInjected: false });
    } catch (err: any) {
      setResponse({ status: 0, statusText: "Network error", ok: false, url: "", method, body: { error: err?.message }, secretInjected: false });
    } finally { setSending(false); }
  }

  return (
    <div className="space-y-6">
      {/* ── Referral Webhook Harness ── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">🧪</span>
          <div>
            <div className="font-body font-semibold text-sm">Referral Webhook Harness</div>
            <div className="font-body text-[11px] theme-text-muted">
              Test <code className="text-brand-gold">/api/webhook/referral</code> with auto-injected auth — exactly as Frost Law calls it
            </div>
          </div>
        </div>

        {/* Method */}
        <div className="card p-4 mb-4">
          <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-3">Method</div>
          <div className="flex gap-2 flex-wrap">
            {(["POST", "PATCH", "GET"] as Method[]).map((m) => (
              <button key={m} onClick={() => switchMethod(m)}
                className={`font-body text-[12px] font-semibold tracking-wider border rounded-lg px-4 py-2 min-h-[44px] transition-all ${
                  method === m
                    ? "bg-brand-gold/15 border-brand-gold/30 text-brand-gold"
                    : "border-[var(--app-border)] theme-text-muted hover:text-[var(--app-text)]"
                }`}>{m}</button>
            ))}
          </div>
          <div className="font-body text-[11px] theme-text-muted mt-3">
            {method === "POST" && "Create a new deal. Returns the generated dealId."}
            {method === "PATCH" && "Update an existing deal. Requires dealId from a prior POST or from /admin/deals."}
            {method === "GET" && "Health check — returns endpoint status and field documentation."}
          </div>
        </div>

        {/* Presets */}
        {method !== "GET" && (
          <div className="card p-4 mb-4">
            <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-3">Presets</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {presets.map((p) => (
                <button key={p.label} onClick={() => { setPayloadText(JSON.stringify(p.payload, null, 2)); setParseError(""); setResponse(null); }}
                  className="text-left bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-4 py-3 hover:border-brand-gold/30 transition-all">
                  <div className="font-body text-[13px] font-medium text-[var(--app-text)]">{p.label}</div>
                  <div className="font-body text-[11px] theme-text-muted mt-0.5">{p.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Payload editor */}
        {method !== "GET" && (
          <div className="card p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted">Payload (JSON)</div>
              <span className="font-body text-[10px]">
                {parsedPayload ? <span className="text-green-400">✓ Valid JSON</span> : <span className="text-red-400">✗ Invalid JSON</span>}
              </span>
            </div>
            <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)}
              rows={14} spellCheck={false}
              className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 font-mono text-[12px] text-[var(--app-text)] outline-none focus:border-brand-gold/30 transition-colors resize-y" />
            {parseError && <div className="mt-2 font-body text-[11px] text-red-400">{parseError}</div>}
          </div>
        )}

        {/* Send button */}
        <button onClick={sendRequest} disabled={sending || (method !== "GET" && !parsedPayload)}
          className="w-full bg-brand-gold/20 border border-brand-gold/30 text-brand-gold rounded-lg py-3 font-body text-sm font-semibold hover:bg-brand-gold/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px] mb-4">
          {sending ? "Sending…" : `Send ${method} to /api/webhook/referral`}
        </button>

        {/* Response */}
        {response && (
          <div className="card overflow-hidden mb-2">
            <div className={`px-5 py-3 border-b border-[var(--app-border)] flex items-center justify-between gap-2 flex-wrap ${response.ok ? "bg-green-500/5" : "bg-red-500/5"}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`font-body text-[11px] font-bold uppercase tracking-wider rounded px-2 py-1 border ${
                  response.ok ? "bg-green-500/15 text-green-400 border-green-500/30" : "bg-red-500/15 text-red-400 border-red-500/30"
                }`}>{response.status || "ERR"} {response.statusText}</span>
                <span className="font-mono text-[11px] theme-text-muted">{response.method} {response.url}</span>
              </div>
              {response.secretInjected && (
                <span className="font-body text-[10px] text-brand-gold bg-brand-gold/10 border border-brand-gold/20 rounded px-2 py-0.5">🔐 SECRET INJECTED</span>
              )}
            </div>
            <div className="px-5 py-4">
              <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">Response Body</div>
              <pre className="font-mono text-[11px] text-[var(--app-text)] overflow-x-auto whitespace-pre-wrap break-all rounded-lg px-3 py-2.5"
                style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)" }}>
                {typeof response.body === "string" ? response.body : JSON.stringify(response.body, null, 2)}
              </pre>
              {response.ok && method === "POST" && response.body?.dealId && (
                <div className="mt-4 flex gap-2 flex-wrap">
                  <button onClick={() => router.push(`/admin/deals?deal=${response.body.dealId}`)}
                    className="font-body text-[12px] font-semibold bg-brand-gold/15 border border-brand-gold/30 text-brand-gold rounded-lg px-4 py-2 hover:bg-brand-gold/25 transition-colors min-h-[44px]">
                    View Deal in Admin ↗
                  </button>
                  <button onClick={() => {
                    switchMethod("PATCH");
                    setPayloadText(JSON.stringify({ ...PATCH_PRESETS[0].payload, dealId: response.body.dealId }, null, 2));
                    setResponse(null);
                  }} className="font-body text-[12px] font-semibold border border-[var(--app-border)] theme-text-secondary rounded-lg px-4 py-2 hover:border-brand-gold/30 hover:text-[var(--app-text)] transition-colors min-h-[44px]">
                    Test PATCH on this deal →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* How it works */}
        <div className="card p-4">
          <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">How it works</div>
          <ul className="font-body text-[12px] theme-text-secondary space-y-1.5 list-disc list-inside">
            <li>Payload is proxied through <code className="text-brand-gold">/api/admin/dev/webhook-test</code> (super_admin only) which injects <code>REFERRAL_WEBHOOK_SECRET</code> server-side.</li>
            <li>The proxy calls the real webhook at <code className="text-brand-gold">/api/webhook/referral</code> — same auth, same handlers, same DB writes.</li>
            <li>Calls are recorded in the Incoming API Log section below.</li>
          </ul>
        </div>
      </div>

      {/* ── Custom API Sender ── */}
      <CustomSenderSection />

      {/* ── Incoming API Log ── */}
      <ApiLogSection />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "links",   label: "Quick Links",       icon: "🔗" },
  { id: "errors",  label: "Recent Errors",     icon: "🚨" },
  { id: "email",   label: "Send Test Email",   icon: "✉️" },
  { id: "webhook", label: "Webhook Test",      icon: "🧪" },
  { id: "commits", label: "Recent Commits",    icon: "📦" },
];

export default function DevPage() {
  const { data: session } = useSession();
  const isSuperAdmin = (session?.user as any)?.role === "super_admin";
  const userEmail = (session?.user as any)?.email || "";

  const [tab, setTab] = useState<Tab>("links");
  const [data, setData] = useState<DevData | null>(null);
  const [errors, setErrors] = useState<ErrorsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSuperAdmin) { setLoading(false); return; }
    Promise.all([
      fetch("/api/admin/dev").then((r) => r.json()).catch(() => null),
      fetch("/api/admin/dev/errors").then((r) => r.json()).catch(() => null),
    ])
      .then(([devData, errorsData]) => { setData(devData); setErrors(errorsData); })
      .finally(() => setLoading(false));
  }, [isSuperAdmin]);

  if (!isSuperAdmin) {
    return (
      <div className="card p-12 text-center">
        <div className="font-body text-sm theme-text-muted">This page is restricted to super admins only.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <h2 className="font-display text-[22px] font-bold mb-2">Development</h2>
        <p className="font-body text-[13px] theme-text-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-[22px] font-bold mb-1">Development</h2>
        <p className="font-body text-[13px] theme-text-muted">Portal internals, deployment info, API testing, and recent code changes.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1" style={{ borderBottom: "1px solid var(--app-border)" }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 font-body text-[12px] font-medium px-3 py-2.5 rounded-t-lg whitespace-nowrap min-h-[44px] transition-all ${
              tab === t.id
                ? "bg-brand-gold/10 text-brand-gold border-b-2 border-brand-gold"
                : "theme-text-muted hover:text-[var(--app-text)] hover:bg-[var(--app-hover)]"
            }`}>
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "links"   && <QuickLinksTab data={data} />}
      {tab === "errors"  && <ErrorsTab errors={errors} />}
      {tab === "email"   && <EmailTab userEmail={userEmail} />}
      {tab === "webhook" && <WebhookTab />}
      {tab === "commits" && <CommitsTab data={data} />}
    </div>
  );
}
