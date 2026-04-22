"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtDateTime, fmtPhone } from "@/lib/format";

type LogRow = {
  id: string;
  partnerCode: string | null;
  partnerId: string | null;
  partnerName: string | null;
  direction: string;
  toPhone: string;
  fromPhone: string;
  body: string;
  template: string;
  status: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  createdAt: string;
  repliedAt: string | null;
};

type FilterView = "all" | "unread" | "replied";

/**
 * SMS → SMS Log sub-tab. Paginated list of every SmsLog row with partner
 * attribution and a computed reply indicator.
 *
 * A note on "read receipts": Twilio's standard SMS API doesn't expose
 * message-read events — only delivery state (sent / delivered / failed /
 * skipped_optout / demo). So the drill-down is framed around whether a
 * partner has *replied* (inbound SmsLog row after the outbound createdAt),
 * not whether they've opened the message.
 */
export default function SmsLogTabImpl() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [counts, setCounts] = useState<{ all: number; unread: number; replied: number }>({ all: 0, unread: 0, replied: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterView>("all");

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/sms/log?filter=${filter}&limit=200`);
      if (res.ok) {
        const d = await res.json();
        setLogs(d.logs || []);
        setCounts(d.counts || { all: 0, unread: 0, replied: 0 });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [filter]);

  const pills: { id: FilterView; label: string; count: number }[] = [
    { id: "all",     label: "All",     count: counts.all },
    { id: "unread",  label: "Unread",  count: counts.unread },
    { id: "replied", label: "Replied", count: counts.replied },
  ];

  return (
    <>
      <h3 className="font-display text-lg font-bold mb-1">SMS Log</h3>
      <p className="font-body text-xs text-[var(--app-text-muted)] mb-6">
        Every outbound send (partner-attributed) plus inbound replies. Twilio&apos;s standard SMS API doesn&apos;t expose read receipts —
        &quot;Replied&quot; means the partner sent an inbound message after our outbound; &quot;Unread&quot; means we haven&apos;t received a reply yet.
      </p>

      <div className="flex flex-wrap gap-2 mb-5">
        {pills.map((p) => (
          <button
            key={p.id}
            onClick={() => setFilter(p.id)}
            className={`font-body text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition border ${
              filter === p.id
                ? "bg-brand-gold/20 border-brand-gold text-brand-gold"
                : "bg-[var(--app-input-bg)] border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]"
            }`}
          >
            {p.label} ({p.count})
          </button>
        ))}
      </div>

      {loading ? (
        <p className="font-body text-sm text-[var(--app-text-muted)]">Loading…</p>
      ) : logs.length === 0 ? (
        <div className="card px-4 py-8 text-center">
          <p className="font-body text-sm text-[var(--app-text-muted)]">No SMS messages yet.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-[var(--app-border)]">
              <tr>
                <th className="font-body text-xs uppercase tracking-wider text-[var(--app-text-muted)] font-semibold px-4 py-3">When</th>
                <th className="font-body text-xs uppercase tracking-wider text-[var(--app-text-muted)] font-semibold px-4 py-3">Partner</th>
                <th className="font-body text-xs uppercase tracking-wider text-[var(--app-text-muted)] font-semibold px-4 py-3">Dir</th>
                <th className="font-body text-xs uppercase tracking-wider text-[var(--app-text-muted)] font-semibold px-4 py-3">Template</th>
                <th className="font-body text-xs uppercase tracking-wider text-[var(--app-text-muted)] font-semibold px-4 py-3">Message</th>
                <th className="font-body text-xs uppercase tracking-wider text-[var(--app-text-muted)] font-semibold px-4 py-3">Status</th>
                <th className="font-body text-xs uppercase tracking-wider text-[var(--app-text-muted)] font-semibold px-4 py-3">Replied?</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-[var(--app-border)] last:border-b-0 align-top">
                  <td className="font-body text-xs text-[var(--app-text-secondary)] px-4 py-3 whitespace-nowrap">
                    {fmtDateTime(l.createdAt)}
                  </td>
                  <td className="font-body text-sm text-[var(--app-text)] px-4 py-3 whitespace-nowrap">
                    {l.partnerId ? (
                      <Link href={`/admin/partners/${l.partnerId}`} className="hover:text-brand-gold transition">
                        {l.partnerName || l.partnerCode || "—"}
                      </Link>
                    ) : (
                      <span className="text-[var(--app-text-muted)]">
                        {l.partnerName || l.partnerCode || fmtPhone(l.direction === "outbound" ? l.toPhone : l.fromPhone) || "—"}
                      </span>
                    )}
                  </td>
                  <td className="font-body text-xs px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded ${
                      l.direction === "inbound"
                        ? "bg-blue-500/15 text-blue-400"
                        : "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)]"
                    }`}>
                      {l.direction === "inbound" ? "In" : "Out"}
                    </span>
                  </td>
                  <td className="font-body text-xs text-[var(--app-text-secondary)] px-4 py-3 whitespace-nowrap">
                    {l.template}
                  </td>
                  <td className="font-body text-sm text-[var(--app-text)] px-4 py-3 max-w-md">
                    <div className="line-clamp-2" title={l.body}>{l.body}</div>
                    {l.errorMessage && (
                      <div className="font-body text-xs text-red-400 mt-1" title={l.errorMessage}>
                        {l.errorMessage.slice(0, 80)}{l.errorMessage.length > 80 ? "…" : ""}
                      </div>
                    )}
                  </td>
                  <td className="font-body text-xs px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={l.status} />
                  </td>
                  <td className="font-body text-xs text-[var(--app-text-secondary)] px-4 py-3 whitespace-nowrap">
                    {l.direction === "inbound"
                      ? <span className="text-[var(--app-text-muted)]">—</span>
                      : l.repliedAt
                        ? <span className="text-green-400" title={fmtDateTime(l.repliedAt)}>Yes</span>
                        : <span className="text-[var(--app-text-muted)]">No</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    sent:            "bg-green-500/15 text-green-400",
    delivered:       "bg-green-500/15 text-green-400",
    received:        "bg-blue-500/15 text-blue-400",
    demo:            "bg-amber-500/15 text-amber-400",
    failed:          "bg-red-500/15 text-red-400",
    skipped_optout:  "bg-[var(--app-input-bg)] text-[var(--app-text-muted)]",
  };
  const cls = styles[status] || "bg-[var(--app-input-bg)] text-[var(--app-text-muted)]";
  const label = status === "skipped_optout" ? "skipped" : status;
  return <span className={`px-2 py-0.5 rounded ${cls}`}>{label}</span>;
}
