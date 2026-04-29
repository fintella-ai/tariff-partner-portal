"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface CommStats {
  emails: { sent: number; opened: number; bounced: number; recent: { to: string; subject: string; status: string; createdAt: string }[] };
  sms: { sent: number; delivered: number; failed: number };
  tickets: { open: number; pending: number; resolved: number };
}

function relativeAge(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return "now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function CommunicationsWidget({ refreshKey }: { refreshKey: number }) {
  const [stats, setStats] = useState<CommStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [emailRes, smsRes, ticketRes] = await Promise.allSettled([
          fetch("/api/admin/communications/stats").then((r) => r.ok ? r.json() : null),
          fetch("/api/admin/communications/sms-stats").then((r) => r.ok ? r.json() : null),
          fetch("/api/admin/support").then((r) => r.ok ? r.json() : null),
        ]);

        const emailData = emailRes.status === "fulfilled" ? emailRes.value : null;
        const smsData = smsRes.status === "fulfilled" ? smsRes.value : null;
        const ticketData = ticketRes.status === "fulfilled" ? ticketRes.value : null;

        if (cancelled) return;
        setStats({
          emails: {
            sent: emailData?.totalSent ?? 0,
            opened: emailData?.totalOpened ?? 0,
            bounced: emailData?.totalBounced ?? 0,
            recent: emailData?.recent ?? [],
          },
          sms: {
            sent: smsData?.totalSent ?? 0,
            delivered: smsData?.totalDelivered ?? 0,
            failed: smsData?.totalFailed ?? 0,
          },
          tickets: {
            open: ticketData?.tickets?.filter((t: any) => t.status === "open").length ?? 0,
            pending: ticketData?.tickets?.filter((t: any) => t.status === "pending").length ?? 0,
            resolved: ticketData?.tickets?.filter((t: any) => t.status === "resolved" || t.status === "closed").length ?? 0,
          },
        });
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-[var(--app-border)] flex items-center justify-between">
        <h3 className="font-display text-sm font-bold">Communications Hub</h3>
        <Link href="/admin/communications" className="font-body text-[11px] text-brand-gold hover:underline">
          Open Hub →
        </Link>
      </div>

      {loading ? (
        <div className="px-5 py-8 text-center font-body text-sm theme-text-muted">Loading...</div>
      ) : !stats ? (
        <div className="px-5 py-8 text-center font-body text-sm theme-text-muted">Unable to load communications data</div>
      ) : (
        <div className="p-5 space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <div className="text-center">
              <div className="font-display text-lg font-bold text-blue-400">{stats.emails.sent}</div>
              <div className="font-body text-[9px] theme-text-muted uppercase tracking-wider">Emails Sent</div>
            </div>
            <div className="text-center">
              <div className="font-display text-lg font-bold text-green-400">{stats.emails.opened}</div>
              <div className="font-body text-[9px] theme-text-muted uppercase tracking-wider">Opened</div>
            </div>
            <div className="text-center">
              <div className="font-display text-lg font-bold text-red-400">{stats.emails.bounced}</div>
              <div className="font-body text-[9px] theme-text-muted uppercase tracking-wider">Bounced</div>
            </div>
            <div className="text-center">
              <div className="font-display text-lg font-bold text-purple-400">{stats.sms.sent}</div>
              <div className="font-body text-[9px] theme-text-muted uppercase tracking-wider">SMS Sent</div>
            </div>
            <div className="text-center">
              <div className="font-display text-lg font-bold text-orange-400">{stats.tickets.open}</div>
              <div className="font-body text-[9px] theme-text-muted uppercase tracking-wider">Open Tickets</div>
            </div>
            <div className="text-center">
              <div className="font-display text-lg font-bold text-emerald-400">{stats.tickets.resolved}</div>
              <div className="font-body text-[9px] theme-text-muted uppercase tracking-wider">Resolved</div>
            </div>
          </div>

          {/* Recent emails */}
          {stats.emails.recent.length > 0 && (
            <div>
              <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">Recent Emails</div>
              <div className="space-y-1">
                {stats.emails.recent.slice(0, 5).map((e, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-[var(--app-input-bg)] transition text-[12px]">
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold truncate block">{e.subject}</span>
                      <span className="theme-text-muted text-[11px]">→ {e.to}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase ${
                        e.status === "sent" ? "bg-green-500/15 text-green-400" :
                        e.status === "demo" ? "bg-yellow-500/15 text-yellow-400" :
                        "bg-red-500/15 text-red-400"
                      }`}>{e.status}</span>
                      <span className="theme-text-faint text-[10px]">{relativeAge(e.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div className="flex gap-2 flex-wrap">
            <Link href="/admin/communications" className="font-body text-[11px] px-3 py-1.5 rounded-lg border border-[var(--app-border)] theme-text-secondary hover:bg-[var(--app-input-bg)] transition">
              📧 Compose Email
            </Link>
            <Link href="/admin/communications?tab=sms" className="font-body text-[11px] px-3 py-1.5 rounded-lg border border-[var(--app-border)] theme-text-secondary hover:bg-[var(--app-input-bg)] transition">
              💬 Send SMS
            </Link>
            <Link href="/admin/support" className="font-body text-[11px] px-3 py-1.5 rounded-lg border border-[var(--app-border)] theme-text-secondary hover:bg-[var(--app-input-bg)] transition">
              🎧 Support Tickets
            </Link>
            <Link href="/admin/communications?tab=templates" className="font-body text-[11px] px-3 py-1.5 rounded-lg border border-[var(--app-border)] theme-text-secondary hover:bg-[var(--app-input-bg)] transition">
              📋 Templates
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
