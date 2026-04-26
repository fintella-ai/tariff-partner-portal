"use client";

import { useState, useEffect, useCallback } from "react";

interface Trigger {
  key: string;
  template: string;
  event: string;
  callSite: string;
  recipient: string;
}

const EMAIL_TRIGGERS: Trigger[] = [
  {
    key: "welcome",
    template: "welcome",
    event: "Partner signup completes",
    callSite: "src/app/api/signup/route.ts",
    recipient: "New partner",
  },
  {
    key: "signup_notification",
    template: "signup_notification",
    event: "Partner signup completes (inviter chain)",
    callSite: "src/app/api/signup/route.ts",
    recipient: "Upline partner who invited them",
  },
  {
    key: "agreement_ready",
    template: "agreement_ready",
    event: "Admin dispatches SignWell agreement",
    callSite: "src/app/api/admin/agreement/[partnerCode]/route.ts",
    recipient: "Partner being onboarded",
  },
  {
    key: "agreement_signed",
    template: "agreement_signed",
    event: "SignWell document_completed webhook",
    callSite: "src/app/api/signwell/webhook/route.ts",
    recipient: "Partner (welcome-aboard confirmation)",
  },
  {
    key: "l1_invite",
    template: "l1_invite",
    event: "Admin creates L1 invite (incl. resend + bulk-resend)",
    callSite: "src/app/api/admin/invites/route.ts",
    recipient: "Invited prospect",
  },
  {
    key: "partner_added_to_channel",
    template: "partner_added_to_channel",
    event: "Admin adds partner to an AnnouncementChannel",
    callSite: "src/app/api/admin/channels/[id]/members/route.ts",
    recipient: "Partner being added",
  },
  {
    key: "deal_status_update",
    template: "deal_status_update",
    event: "Referral webhook PATCH changes a deal stage",
    callSite: "src/app/api/webhook/referral/route.ts",
    recipient: "Submitting partner",
  },
  {
    key: "commission_payment_notification",
    template: "commission_payment_notification",
    event: "Commission ledger row flips to paid during payout batch",
    callSite: "src/app/api/admin/payouts/route.ts",
    recipient: "Paid partner",
  },
  {
    key: "password_reset",
    template: "password_reset",
    event: "Partner / admin submits forgot-password form",
    callSite: "src/app/api/auth/forgot-password/route.ts",
    recipient: "Account holder",
  },
  {
    key: "monthly_newsletter",
    template: "monthly_newsletter",
    event: "Vercel cron — 1st of each month",
    callSite: "src/app/api/cron/monthly-newsletter/route.ts",
    recipient: "Every active partner",
  },
];

type EmailLogEntry = {
  id: string;
  toEmail: string;
  subject: string;
  template: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
};

export default function HardcodedTriggersDoc() {
  const [logs, setLogs] = useState<EmailLogEntry[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logPage, setLogPage] = useState(0);
  const [logFilter, setLogFilter] = useState("");
  const [logStatusFilter, setLogStatusFilter] = useState("");
  const [logLoading, setLogLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLogLoading(true);
    const params = new URLSearchParams();
    params.set("limit", "20");
    params.set("offset", String(logPage * 20));
    if (logFilter) params.set("template", logFilter);
    if (logStatusFilter) params.set("status", logStatusFilter);
    try {
      const res = await fetch(`/api/admin/email-logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setLogTotal(data.total || 0);
      }
    } catch {} finally { setLogLoading(false); }
  }, [logPage, logFilter, logStatusFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => { setLogPage(0); }, [logFilter, logStatusFilter]);

  return (
    <div>
      <div className="card p-5 sm:p-6 mb-6 border-brand-gold/30 bg-brand-gold/[0.03]">
        <div className="font-body text-[13px] font-semibold text-[var(--app-text)] mb-2">Why these aren&apos;t in the Workflows tab</div>
        <p className="font-body text-[13px] text-[var(--app-text-secondary)] leading-relaxed">
          These emails fire from direct <code className="font-mono text-[11px] bg-[var(--app-input-bg)] px-1.5 py-0.5 rounded">sendXxxEmail()</code> calls at the event site (signup, SignWell webhook, referral webhook, payout batch, etc.). They&apos;re always-on and can&apos;t be toggled from the admin UI. The editable <strong>copy</strong> for each — subject, body, from, reply-to — still lives in the matching Email Templates row; the helper consults it at send time and falls back to hardcoded content only if the row is missing or disabled.
        </p>
        <p className="font-body text-[13px] text-[var(--app-text-secondary)] leading-relaxed mt-3">
          To add new behavior (delay, conditional send, Slack ping, SMS companion) on top of one of these, create a workflow on the matching <strong>trigger</strong> in the Workflows tab — the trigger still fires for every event, so workflow actions can react to it even though the primary send is hardcoded.
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="hidden md:grid grid-cols-[1fr_1.4fr_1fr_1fr] gap-4 px-4 py-3 border-b border-[var(--app-border)] bg-[var(--app-card-bg)]">
          <div className="font-body text-[10px] tracking-[1.5px] uppercase text-[var(--app-text-muted)]">Template</div>
          <div className="font-body text-[10px] tracking-[1.5px] uppercase text-[var(--app-text-muted)]">Event</div>
          <div className="font-body text-[10px] tracking-[1.5px] uppercase text-[var(--app-text-muted)]">Recipient</div>
          <div className="font-body text-[10px] tracking-[1.5px] uppercase text-[var(--app-text-muted)]">Call site</div>
        </div>
        {EMAIL_TRIGGERS.map((t) => (
          <div
            key={t.key}
            className="md:grid md:grid-cols-[1fr_1.4fr_1fr_1fr] md:gap-4 px-4 py-4 border-b border-[var(--app-border)] last:border-b-0"
          >
            <div className="font-body text-[13px] font-semibold text-[var(--app-text)] mb-1 md:mb-0">
              <code className="font-mono text-[12px] text-brand-gold">{t.template}</code>
            </div>
            <div className="font-body text-[12px] text-[var(--app-text-secondary)] mb-1 md:mb-0 leading-snug">{t.event}</div>
            <div className="font-body text-[12px] text-[var(--app-text-secondary)] mb-1 md:mb-0">{t.recipient}</div>
            <div className="font-body text-[11px] text-[var(--app-text-muted)] font-mono break-all">{t.callSite}</div>
          </div>
        ))}
      </div>

      {/* ═══ EXECUTION LOG ═══ */}
      <div className="card overflow-hidden mt-6">
        <div className="px-4 py-3 border-b border-[var(--app-border)] flex items-center justify-between flex-wrap gap-2">
          <div className="font-body text-sm font-semibold">Execution Log</div>
          <div className="flex gap-2">
            <select
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value)}
              className="text-xs font-body bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-md px-2 py-1.5 text-[var(--app-text)]"
            >
              <option value="">All templates</option>
              {EMAIL_TRIGGERS.map((t) => (
                <option key={t.key} value={t.template}>{t.template}</option>
              ))}
            </select>
            <select
              value={logStatusFilter}
              onChange={(e) => setLogStatusFilter(e.target.value)}
              className="text-xs font-body bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-md px-2 py-1.5 text-[var(--app-text)]"
            >
              <option value="">All statuses</option>
              <option value="sent">Sent</option>
              <option value="demo">Demo</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        {logLoading ? (
          <div className="px-4 py-8 text-center font-body text-sm text-[var(--app-text-muted)]">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="px-4 py-8 text-center font-body text-sm text-[var(--app-text-muted)]">No logs match this filter.</div>
        ) : (
          <>
            <div className="hidden md:grid grid-cols-[1fr_1.5fr_0.8fr_0.6fr_1fr] gap-3 px-4 py-2 border-b border-[var(--app-border)] bg-[var(--app-card-bg)]">
              <div className="font-body text-[10px] tracking-[1.5px] uppercase text-[var(--app-text-muted)]">Template</div>
              <div className="font-body text-[10px] tracking-[1.5px] uppercase text-[var(--app-text-muted)]">Subject</div>
              <div className="font-body text-[10px] tracking-[1.5px] uppercase text-[var(--app-text-muted)]">To</div>
              <div className="font-body text-[10px] tracking-[1.5px] uppercase text-[var(--app-text-muted)]">Status</div>
              <div className="font-body text-[10px] tracking-[1.5px] uppercase text-[var(--app-text-muted)]">Sent At</div>
            </div>
            {logs.map((l) => (
              <div key={l.id} className="md:grid md:grid-cols-[1fr_1.5fr_0.8fr_0.6fr_1fr] md:gap-3 px-4 py-3 border-b border-[var(--app-border)] last:border-b-0 hover:bg-[var(--app-card-bg)] transition-colors">
                <div className="font-mono text-[12px] text-brand-gold truncate">{l.template}</div>
                <div className="font-body text-[12px] text-[var(--app-text-secondary)] truncate">{l.subject}</div>
                <div className="font-body text-[12px] text-[var(--app-text-muted)] truncate">{l.toEmail}</div>
                <div>
                  <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase ${
                    l.status === "sent" ? "bg-green-500/10 text-green-400 border border-green-500/20" :
                    l.status === "failed" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                    "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                  }`}>{l.status}</span>
                  {l.errorMessage && <div className="font-body text-[10px] text-red-400 mt-0.5 truncate" title={l.errorMessage}>{l.errorMessage}</div>}
                </div>
                <div className="font-body text-[11px] text-[var(--app-text-muted)]">
                  {new Date(l.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </div>
              </div>
            ))}
          </>
        )}

        {logTotal > 20 && (
          <div className="flex items-center justify-center gap-3 px-4 py-3 border-t border-[var(--app-border)]">
            <button
              onClick={() => setLogPage((p) => Math.max(0, p - 1))}
              disabled={logPage === 0}
              className="font-body text-[11px] px-3 py-1.5 rounded-md border border-[var(--app-border)] disabled:opacity-40"
            >Previous</button>
            <span className="font-body text-[11px] text-[var(--app-text-muted)]">
              Page {logPage + 1} of {Math.ceil(logTotal / 20)}
            </span>
            <button
              onClick={() => setLogPage((p) => p + 1)}
              disabled={(logPage + 1) * 20 >= logTotal}
              className="font-body text-[11px] px-3 py-1.5 rounded-md border border-[var(--app-border)] disabled:opacity-40"
            >Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
