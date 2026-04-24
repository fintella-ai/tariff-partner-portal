"use client";

/**
 * /admin/ai-activity — live observability into Ollie's behavior.
 *
 * Aggregates the last 7 days of:
 *   - Tool call totals by name (usage + error rate)
 *   - Escalations by rung (ticket / live_chat / live_call / scheduled_call)
 *   - Escalations by inbox (where Ollie routed them)
 *   - Recent 25 escalations (raw feed)
 *   - Online admins (heartbeat-driven, 2-min window)
 *   - Per-inbox admin-assignment coverage
 *
 * Phase 3c observability (spec §5.11 "failure modes" → gives us a place
 * to watch). Read-only for all 4 admin roles.
 */
import { useEffect, useState } from "react";

interface ActivityPayload {
  windowDays: number;
  generatedAt: string;
  stats: {
    escalations: {
      byRung: { rung: string; count: number }[];
      byInbox: {
        inboxId: string | null;
        inboxRole: string;
        inboxDisplayName: string;
        count: number;
      }[];
      byPriority: { priority: string; count: number }[];
    };
    toolCalls: {
      total: number;
      messagesWithTools: number;
      avgPerMessage: number;
      byName: {
        name: string;
        count: number;
        errors: number;
        errorRate: number;
      }[];
    };
    cache?: {
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheCreationTokens: number;
      hitRate: number;
      costUsd: number;
    };
  };
  onlineAdmins: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    lastHeartbeatAt: string | null;
    availableForLiveChat: boolean;
    availableForLiveCall: boolean;
  }[];
  inboxes: {
    id: string;
    role: string;
    displayName: string;
    emailAddress: string;
    assignedCount: number;
  }[];
  recentEscalations: {
    id: string;
    conversationId: string;
    rung: string;
    status: string;
    partnerCode: string;
    category: string | null;
    priority: string;
    reason: string | null;
    inboxRole: string | null;
    inboxDisplayName: string | null;
    createdAt: string;
  }[];
}

export default function AiActivityPage() {
  const [data, setData] = useState<ActivityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      const res = await fetch("/api/admin/ai-activity");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as ActivityPayload;
      setData(d);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Auto-refresh every 30s so the page feels live.
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  if (loading && !data) {
    return (
      <div className="p-6 font-body text-[13px] text-[var(--app-text-muted)]">
        Loading AI activity…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6 font-body text-[13px] text-red-500">
        Failed to load: {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[22px] font-bold text-[var(--app-text)]">
          AI Activity
        </h1>
        <p className="font-body text-[12px] text-[var(--app-text-muted)] mt-1">
          What Ollie + the generalists have been doing over the last{" "}
          {data.windowDays} days. Refreshes every 30s.
        </p>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Tool calls"
          value={data.stats.toolCalls.total.toLocaleString()}
          sub={`avg ${data.stats.toolCalls.avgPerMessage} / Ollie reply`}
        />
        <StatCard
          label="Escalations"
          value={data.stats.escalations.byRung
            .reduce((a, r) => a + r.count, 0)
            .toLocaleString()}
          sub={`${data.stats.escalations.byRung.length} rung type(s)`}
        />
        <StatCard
          label="Admins online now"
          value={data.onlineAdmins.length.toString()}
          sub={`heartbeat < 2 min`}
        />
        <StatCard
          label="Inboxes w/out assignees"
          value={data.inboxes
            .filter((i) => i.assignedCount === 0)
            .length.toString()}
          sub={`${data.inboxes.length} inboxes total`}
          warn={data.inboxes.some((i) => i.assignedCount === 0)}
        />
      </div>

      {/* Prompt cache + cost panel — Phase 4. Only shown when cache data
          is present (backfill tolerant). */}
      {data.stats.cache && (
        <section className="card p-5">
          <h2 className="font-display text-[14px] font-semibold text-[var(--app-text)] mb-3">
            Anthropic prompt cache (last {data.windowDays}d)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <MiniStat
              label="Cache hit rate"
              value={`${(data.stats.cache.hitRate * 100).toFixed(0)}%`}
              sub={data.stats.cache.hitRate > 0.7
                ? "healthy"
                : data.stats.cache.hitRate > 0.3
                  ? "warming"
                  : "cold"}
              warn={data.stats.cache.hitRate < 0.3}
            />
            <MiniStat
              label="Input tokens"
              value={formatCompact(data.stats.cache.inputTokens)}
              sub="uncached new input"
            />
            <MiniStat
              label="Cache read"
              value={formatCompact(data.stats.cache.cacheReadTokens)}
              sub="cheap hits"
            />
            <MiniStat
              label="Cache write"
              value={formatCompact(data.stats.cache.cacheCreationTokens)}
              sub="expensive misses"
              warn={
                data.stats.cache.cacheCreationTokens >
                data.stats.cache.cacheReadTokens * 0.5
              }
            />
          </div>
          <div className="font-body text-[12px] text-[var(--app-text-muted)]">
            Approx spend this window:{" "}
            <span className="text-[var(--app-text)] font-semibold">
              ${data.stats.cache.costUsd.toFixed(2)}
            </span>{" "}
            at Sonnet 4.6 pricing
          </div>
        </section>
      )}

      {/* Tool-call breakdown */}
      <section className="card p-5">
        <h2 className="font-display text-[14px] font-semibold text-[var(--app-text)] mb-3">
          Tool usage (last {data.windowDays}d)
        </h2>
        {data.stats.toolCalls.byName.length === 0 ? (
          <div className="font-body text-[12px] text-[var(--app-text-muted)] italic">
            No tool calls in window.
          </div>
        ) : (
          <div className="space-y-1.5">
            {data.stats.toolCalls.byName.map((t) => (
              <ToolBar key={t.name} tool={t} max={data.stats.toolCalls.byName[0]?.count || 1} />
            ))}
          </div>
        )}
      </section>

      {/* Escalations grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <section className="card p-5">
          <h2 className="font-display text-[14px] font-semibold text-[var(--app-text)] mb-3">
            By rung
          </h2>
          <KvList items={data.stats.escalations.byRung.map((r) => ({ k: r.rung, v: r.count }))} empty="No escalations yet." />
        </section>
        <section className="card p-5">
          <h2 className="font-display text-[14px] font-semibold text-[var(--app-text)] mb-3">
            By inbox
          </h2>
          <KvList
            items={data.stats.escalations.byInbox.map((r) => ({
              k: r.inboxDisplayName,
              v: r.count,
            }))}
            empty="No routed escalations."
          />
        </section>
        <section className="card p-5">
          <h2 className="font-display text-[14px] font-semibold text-[var(--app-text)] mb-3">
            By priority
          </h2>
          <KvList
            items={data.stats.escalations.byPriority.map((r) => ({
              k: r.priority,
              v: r.count,
            }))}
            empty="No priorities logged."
          />
        </section>
      </div>

      {/* Online admins */}
      <section className="card p-5">
        <h2 className="font-display text-[14px] font-semibold text-[var(--app-text)] mb-3">
          Online admins (last 2 min)
        </h2>
        {data.onlineAdmins.length === 0 ? (
          <div className="font-body text-[12px] text-[var(--app-text-muted)] italic">
            No admins online right now.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {data.onlineAdmins.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1.5 bg-green-500/10 text-green-500 border border-green-500/30 rounded-full px-2.5 py-1 font-body text-[11px]"
                title={`${a.role} · chat=${a.availableForLiveChat ? "yes" : "no"} · call=${a.availableForLiveCall ? "yes" : "no"}`}
              >
                <span className="w-2 h-2 rounded-full bg-green-500" />
                {a.name || a.email}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Recent escalations feed */}
      <section className="card p-5">
        <h2 className="font-display text-[14px] font-semibold text-[var(--app-text)] mb-3">
          Recent escalations
        </h2>
        {data.recentEscalations.length === 0 ? (
          <div className="font-body text-[12px] text-[var(--app-text-muted)] italic">
            No escalations yet. Ollie hasn&apos;t opened a ticket or transferred
            a conversation to a human.
          </div>
        ) : (
          <div className="divide-y divide-[var(--app-border)]">
            {data.recentEscalations.map((e) => (
              <div
                key={e.id}
                className="py-2 flex items-start gap-3 text-[12px] font-body"
              >
                <span
                  className={`shrink-0 inline-block w-[90px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider text-[9px] text-center ${rungColor(
                    e.rung
                  )}`}
                >
                  {e.rung.replace(/_/g, " ")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[var(--app-text)]">
                    <span className="font-mono text-[11px]">{e.partnerCode}</span>{" "}
                    → {e.inboxDisplayName || "(unrouted)"}
                    {e.priority !== "normal" && (
                      <span
                        className={`ml-2 uppercase text-[9px] font-semibold ${priorityColor(e.priority)}`}
                      >
                        {e.priority}
                      </span>
                    )}
                  </div>
                  <div className="text-[var(--app-text-muted)] text-[11px] mt-0.5 truncate">
                    {e.reason || e.category || ""}
                  </div>
                </div>
                <span className="shrink-0 text-[var(--app-text-faint)] text-[10px]">
                  {new Date(e.createdAt).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="text-[10px] text-[var(--app-text-faint)] text-right font-body">
        Generated {new Date(data.generatedAt).toLocaleTimeString()}
      </div>
    </div>
  );
}

// ─── PRESENTATIONAL HELPERS ───────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`card p-4 ${
        warn ? "border-amber-500/30 bg-amber-500/5" : ""
      }`}
    >
      <div className="font-body text-[10px] uppercase tracking-wider text-[var(--app-text-muted)]">
        {label}
      </div>
      <div
        className={`font-display text-[22px] font-bold mt-1 ${
          warn ? "text-amber-500" : "text-[var(--app-text)]"
        }`}
      >
        {value}
      </div>
      <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5">
        {sub}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`border rounded-md p-2.5 ${
        warn
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-[var(--app-border)] bg-[var(--app-input-bg)]"
      }`}
    >
      <div className="font-body text-[9px] uppercase tracking-wider text-[var(--app-text-muted)]">
        {label}
      </div>
      <div
        className={`font-display text-[18px] font-bold mt-0.5 ${
          warn ? "text-amber-500" : "text-[var(--app-text)]"
        }`}
      >
        {value}
      </div>
      <div className="font-body text-[10px] text-[var(--app-text-muted)]">
        {sub}
      </div>
    </div>
  );
}

/** Format 12345 → "12.3k", 123456 → "123k", 1234567 → "1.2M". */
function formatCompact(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0) + "k";
  return (n / 1_000_000).toFixed(1) + "M";
}

function ToolBar({
  tool,
  max,
}: {
  tool: { name: string; count: number; errors: number; errorRate: number };
  max: number;
}) {
  const pct = Math.round((tool.count / max) * 100);
  const errorBadge =
    tool.errorRate > 0 ? (
      <span className="text-red-500 font-body text-[10px]">
        {tool.errors} err ({(tool.errorRate * 100).toFixed(0)}%)
      </span>
    ) : null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-body text-[12px] text-[var(--app-text)]">
          {tool.name}
        </span>
        <span className="font-body text-[11px] text-[var(--app-text-muted)]">
          {tool.count} {errorBadge}
        </span>
      </div>
      <div className="h-1.5 bg-[var(--app-input-bg)] rounded-full overflow-hidden mt-0.5">
        <div
          className={`h-full ${
            tool.errorRate > 0.05
              ? "bg-amber-500/60"
              : "bg-brand-gold/60"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function KvList({
  items,
  empty,
}: {
  items: { k: string; v: number }[];
  empty: string;
}) {
  if (items.length === 0) {
    return (
      <div className="font-body text-[12px] text-[var(--app-text-muted)] italic">
        {empty}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {items.map((it) => (
        <div
          key={it.k}
          className="flex items-baseline justify-between gap-3 font-body text-[12px]"
        >
          <span className="text-[var(--app-text)]">{it.k}</span>
          <span className="text-[var(--app-text-muted)]">{it.v}</span>
        </div>
      ))}
    </div>
  );
}

function rungColor(rung: string): string {
  switch (rung) {
    case "support_ticket":
      return "bg-brand-gold/15 text-[var(--app-gold-text)]";
    case "live_chat":
      return "bg-blue-500/15 text-blue-500";
    case "live_call":
      return "bg-red-500/15 text-red-500";
    case "scheduled_call":
      return "bg-purple-500/15 text-purple-500";
    default:
      return "bg-[var(--app-input-bg)] text-[var(--app-text-muted)]";
  }
}

function priorityColor(p: string): string {
  switch (p) {
    case "urgent":
      return "text-red-500";
    case "high":
      return "text-amber-500";
    case "low":
      return "text-[var(--app-text-muted)]";
    default:
      return "text-[var(--app-text-muted)]";
  }
}
