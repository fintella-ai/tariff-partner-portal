"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

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

export default function DevPage() {
  const { data: session } = useSession();
  const isSuperAdmin = (session?.user as any)?.role === "super_admin";
  const [data, setData] = useState<DevData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSuperAdmin) { setLoading(false); return; }
    fetch("/api/admin/dev")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
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
        <p className="font-body text-[13px] theme-text-muted mb-6">Loading...</p>
      </div>
    );
  }

  const d = data?.deployment;
  const commits = data?.commits || [];

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-[22px] font-bold mb-1">Development</h2>
        <p className="font-body text-[13px] theme-text-muted">Portal version, deployment info, and recent code changes.</p>
      </div>

      {/* ─── CURRENT DEPLOYMENT ─── */}
      <div className="card p-5 sm:p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">🚀</span>
          <div className="font-body font-semibold text-sm">Current Deployment</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <div className="font-mono text-[12px] text-[var(--app-text-secondary)] break-all">{d?.repo || "—"}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {d?.repo && (
            <a
              href={`https://github.com/${d.repo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-body text-[11px] text-brand-gold border border-brand-gold/20 rounded-lg px-4 py-2 hover:bg-brand-gold/10 transition-colors"
            >
              View on GitHub ↗
            </a>
          )}
          {d?.repo && (
            <a
              href={`https://github.com/${d.repo}/commits/${d.branch || "main"}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-body text-[11px] theme-text-secondary border border-[var(--app-border)] rounded-lg px-4 py-2 hover:bg-[var(--app-card-bg)] transition-colors"
            >
              All Commits ↗
            </a>
          )}
        </div>
      </div>

      {/* ─── CLAUDE CODE ─── */}
      <div className="card p-5 sm:p-6 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">🤖</span>
          <div className="font-body font-semibold text-sm">Claude Code</div>
        </div>
        <p className="font-body text-[12px] theme-text-muted mb-4 leading-relaxed">
          Open a Claude Code session to build new features, fix bugs, or make changes to the portal. Claude Code runs in a separate environment with access to the codebase.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href="https://claude.ai/code"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-gold text-[12px] px-5 py-2.5"
          >
            Open Claude Code ↗
          </a>
          <a
            href="https://docs.claude.com/en/docs/claude-code"
            target="_blank"
            rel="noopener noreferrer"
            className="font-body text-[11px] theme-text-secondary border border-[var(--app-border)] rounded-lg px-4 py-2.5 hover:bg-[var(--app-card-bg)] transition-colors"
          >
            Documentation ↗
          </a>
        </div>
      </div>

      {/* ─── RECENT COMMITS ─── */}
      <div className="card">
        <div className="px-5 py-4 border-b border-[var(--app-border)] flex items-center justify-between">
          <div>
            <div className="font-body font-semibold text-sm">Recent Commits</div>
            <div className="font-body text-[11px] theme-text-muted">
              {data?.source === "github_api" ? "Live from GitHub API" : "GitHub token not configured — showing static info"}
            </div>
          </div>
        </div>

        {commits.length === 0 ? (
          <div className="p-8 text-center">
            <div className="font-body text-sm theme-text-muted mb-2">No commits to display.</div>
            <div className="font-body text-[11px] theme-text-faint">
              To enable live commit feed, add a <code className="font-mono text-brand-gold">GITHUB_TOKEN</code> environment variable in Vercel with read access to the repo.
            </div>
          </div>
        ) : (
          <div>
            {commits.map((c, idx) => (
              <div
                key={c.fullSha}
                className={`px-5 py-3 border-b border-[var(--app-border)] last:border-b-0 ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-body text-[13px] text-[var(--app-text)] mb-1 break-words">{c.message}</div>
                    <div className="flex items-center gap-2 font-body text-[10px] theme-text-muted">
                      <span className="font-mono text-brand-gold">{c.sha}</span>
                      <span>·</span>
                      <span>{c.author}</span>
                      <span>·</span>
                      <span>{new Date(c.date).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                    </div>
                  </div>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-body text-[10px] text-brand-gold hover:underline shrink-0"
                  >
                    View ↗
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── DOCUMENTATION ─── */}
      <div className="card p-5 sm:p-6 mt-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">📚</span>
          <div className="font-body font-semibold text-sm">Quick Links</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a href="/docs/webhook-guide" target="_blank" className="p-3 rounded-lg border border-[var(--app-border)] hover:border-brand-gold/30 transition-colors">
            <div className="font-body text-sm text-[var(--app-text)] mb-1">Webhook Guide</div>
            <div className="font-body text-[10px] theme-text-muted">Frost Law referral webhook integration docs</div>
          </a>
          <a href={d?.repo ? `https://github.com/${d.repo}/blob/main/CLAUDE.md` : "#"} target="_blank" rel="noopener noreferrer" className="p-3 rounded-lg border border-[var(--app-border)] hover:border-brand-gold/30 transition-colors">
            <div className="font-body text-sm text-[var(--app-text)] mb-1">CLAUDE.md ↗</div>
            <div className="font-body text-[10px] theme-text-muted">Project context & architecture notes</div>
          </a>
          <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" className="p-3 rounded-lg border border-[var(--app-border)] hover:border-brand-gold/30 transition-colors">
            <div className="font-body text-sm text-[var(--app-text)] mb-1">Vercel Dashboard ↗</div>
            <div className="font-body text-[10px] theme-text-muted">Deployment logs, env vars, analytics</div>
          </a>
          <a href="https://console.neon.tech/" target="_blank" rel="noopener noreferrer" className="p-3 rounded-lg border border-[var(--app-border)] hover:border-brand-gold/30 transition-colors">
            <div className="font-body text-sm text-[var(--app-text)] mb-1">Neon Database ↗</div>
            <div className="font-body text-[10px] theme-text-muted">PostgreSQL database console</div>
          </a>
        </div>
      </div>
    </div>
  );
}
