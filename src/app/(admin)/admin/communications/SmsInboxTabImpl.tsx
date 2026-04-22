"use client";

import { useEffect, useState } from "react";
import { fmtDate, fmtDateTime, fmtPhone } from "@/lib/format";
import { useResizableColumns } from "@/components/ui/ResizableTable";

type OptedInPartner = {
  id: string;
  partnerCode: string;
  firstName: string;
  lastName: string;
  mobilePhone: string;
  status: string;
  optInDate: string | null;
  messagesSent: number;
};

type NotOptedInPartner = {
  id: string;
  partnerCode: string;
  firstName: string;
  lastName: string;
  mobilePhone: string;
  status: string;
};

type OptedOutPartner = NotOptedInPartner & { stoppedAt?: string };

type FilterView = "all" | "opted_in" | "not_opted_in" | "opted_out";

/**
 * SMS → Inbox sub-tab. Mirrors the Email → Inbox sub-tab layout:
 *   - Top stats cards: Opted-in count / Messages sent this month / Delivery rate
 *   - Filter pills: All · Opted-In · Not Opted-In · Opted-Out (with counts)
 *   - Section(s) rendered based on the active filter
 *   - Bulk opt-in button in the Not-Opted-In section header
 *
 * Everything is queried live from /api/admin/sms/partners — no demo data.
 */
export default function SmsInboxTabImpl() {
  const { columnWidths, getResizeHandler } =
    useResizableColumns([200, 180, 150, 120], { storageKey: "comms-sms-inbox" });

  const [optedIn, setOptedIn] = useState<OptedInPartner[]>([]);
  const [notOptedIn, setNotOptedIn] = useState<NotOptedInPartner[]>([]);
  const [optedOut, setOptedOut] = useState<OptedOutPartner[]>([]);
  const [sentThisMonth, setSentThisMonth] = useState(0);
  const [deliveryRate, setDeliveryRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState<FilterView>("all");
  const [bulking, setBulking] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sms/partners");
      if (res.ok) {
        const d = await res.json();
        setOptedIn(d.optedIn || []);
        setNotOptedIn(d.notOptedIn || []);
        setOptedOut(d.optedOut || []);
        setSentThisMonth(d.messagesSentThisMonth || 0);
        setDeliveryRate(typeof d.deliveryRate === "number" ? d.deliveryRate : null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function handleBulkOptIn() {
    const count = notOptedIn.length;
    if (!count) return;
    if (!confirm(
      `Send the opt-in request SMS to ${count} partner(s)?\n\n` +
      `This fan-outs the "opt_in_request" template. Opted-out (STOP) partners are skipped automatically. ` +
      `Until Twilio A2P 10DLC is approved, every send goes to demo mode.`
    )) return;
    setBulking(true);
    setBulkResult(null);
    try {
      const res = await fetch("/api/admin/sms/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "opt_in_request" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBulkResult(`Error: ${data.error || "bulk send failed"}`);
      } else {
        const results: Array<{ status: string }> = data.results || [];
        const sent = results.filter((r) => r.status === "sent").length;
        const demo = results.filter((r) => r.status === "demo").length;
        const skipped = results.filter((r) => r.status === "skipped_stop" || r.status === "skipped_optout").length;
        const failed = results.filter((r) => r.status === "failed").length;
        setBulkResult(`Fanned out: ${sent} sent · ${demo} demo · ${skipped} skipped · ${failed} failed`);
      }
      await refresh();
    } catch (e: any) {
      setBulkResult(`Network error: ${e?.message || "unknown"}`);
    } finally {
      setBulking(false);
    }
  }

  const deliveryRateStr = deliveryRate === null ? "—" : `${Math.round(deliveryRate * 100)}%`;

  const pills: { id: FilterView; label: string; count: number }[] = [
    { id: "all",          label: "All",           count: optedIn.length + notOptedIn.length + optedOut.length },
    { id: "opted_in",     label: "Opted-In",      count: optedIn.length },
    { id: "not_opted_in", label: "Not Opted-In",  count: notOptedIn.length },
    { id: "opted_out",    label: "Opted-Out",     count: optedOut.length },
  ];

  const showOptedIn = filter === "all" || filter === "opted_in";
  const showNotOptedIn = filter === "all" || filter === "not_opted_in";
  const showOptedOut = filter === "all" || filter === "opted_out";

  return (
    <>
      <h3 className="font-display text-lg font-bold mb-1">SMS Notifications</h3>
      <p className="font-body text-xs text-[var(--app-text-muted)] mb-6">
        Manage SMS messaging for opted-in partners. All SMS templates are disabled pending Twilio A2P 10DLC approval.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card px-4 py-3">
          <div className="font-body text-xs text-[var(--app-text-muted)] mb-1">Total Partners Opted In</div>
          <div className="font-display text-xl font-bold text-brand-gold">{optedIn.length}</div>
        </div>
        <div className="card px-4 py-3">
          <div className="font-body text-xs text-[var(--app-text-muted)] mb-1">Messages Sent This Month</div>
          <div className="font-display text-xl font-bold text-brand-gold">{sentThisMonth}</div>
        </div>
        <div className="card px-4 py-3">
          <div className="font-body text-xs text-[var(--app-text-muted)] mb-1">Delivery Rate</div>
          <div className="font-display text-xl font-bold text-brand-gold">{deliveryRateStr}</div>
          <div className="font-body text-[10px] text-[var(--app-text-muted)] mt-0.5">
            sent / (sent + failed) — excludes demo sends
          </div>
        </div>
      </div>

      {/* Filter pills — mirror Email Inbox */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {pills.map((p) => (
          <button
            key={p.id}
            onClick={() => setFilter(p.id)}
            className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors ${
              filter === p.id
                ? "bg-brand-gold/15 text-brand-gold border-brand-gold/40"
                : "text-[var(--app-text-muted)] border-[var(--app-border)] hover:text-[var(--app-text-secondary)]"
            }`}
          >
            {p.label} <span className="text-[10px] opacity-70">({p.count})</span>
          </button>
        ))}
      </div>

      {loading && (
        <div className="font-body text-xs text-[var(--app-text-muted)] mb-4">Loading partners…</div>
      )}

      {/* Opted-in partners */}
      {showOptedIn && (
        <div className="card overflow-x-auto mb-6">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--app-border)]">
            <h4 className="font-display text-sm font-bold">Opted-In Partners ({optedIn.length})</h4>
          </div>
          {optedIn.length === 0 ? (
            <div className="px-4 py-6 text-center font-body text-xs text-[var(--app-text-muted)]">
              No partners have opted in yet.
            </div>
          ) : (
            <>
              <table className="w-full text-left font-body text-sm hidden sm:table" style={{ tableLayout: "fixed" }}>
                <thead>
                  <tr className="border-b border-[var(--app-border)] text-[var(--app-text-muted)] text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 text-center" style={{ width: columnWidths[0], position: "relative" }}>Partner<span {...getResizeHandler(0)} /></th>
                    <th className="px-4 py-3 text-center" style={{ width: columnWidths[1], position: "relative" }}>Phone<span {...getResizeHandler(1)} /></th>
                    <th className="px-4 py-3 text-center" style={{ width: columnWidths[2], position: "relative" }}>Opt-In Date<span {...getResizeHandler(2)} /></th>
                    <th className="px-4 py-3 text-center" style={{ width: columnWidths[3], position: "relative" }}>Messages Sent<span {...getResizeHandler(3)} /></th>
                  </tr>
                </thead>
                <tbody>
                  {optedIn.map((p) => (
                    <tr key={p.id} className="border-b border-[var(--app-border-subtle)] hover:bg-[var(--app-hover)] transition">
                      <td className="px-4 py-3 text-center text-[var(--app-text)]">{p.firstName} {p.lastName}</td>
                      <td className="px-4 py-3 text-center text-[var(--app-text-secondary)] font-mono text-xs">{fmtPhone(p.mobilePhone)}</td>
                      <td className="px-4 py-3 text-center text-[var(--app-text-secondary)]">{p.optInDate ? fmtDate(p.optInDate) : "—"}</td>
                      <td className="px-4 py-3 text-center text-[var(--app-text-secondary)]">{p.messagesSent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="sm:hidden flex flex-col">
                {optedIn.map((p) => (
                  <div key={p.id} className="px-4 py-3 border-b border-[var(--app-border-subtle)]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-body text-sm text-[var(--app-text)]">{p.firstName} {p.lastName}</span>
                      <span className="font-mono text-xs text-[var(--app-text-muted)]">{fmtPhone(p.mobilePhone)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-body text-xs text-[var(--app-text-muted)]">
                        Opted in {p.optInDate ? fmtDate(p.optInDate) : "—"}
                      </span>
                      <span className="font-body text-xs text-[var(--app-text-muted)]">{p.messagesSent} messages</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Not opted-in partners */}
      {showNotOptedIn && (
        <div className="card overflow-x-auto mb-6">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--app-border)] gap-3 flex-wrap">
            <div>
              <h4 className="font-display text-sm font-bold">Not Opted In ({notOptedIn.length})</h4>
              <p className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5">
                Partners with a mobile on file who haven&apos;t opted in yet. STOP-replied partners are excluded.
              </p>
            </div>
            <button
              disabled={bulking || notOptedIn.length === 0}
              onClick={handleBulkOptIn}
              className="text-xs px-3 py-1.5 rounded bg-brand-gold/20 text-brand-gold hover:bg-brand-gold/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bulking ? "Sending…" : `Send Bulk Opt-In Request (${notOptedIn.length})`}
            </button>
          </div>
          {bulkResult && (
            <div className="px-4 py-2 text-xs bg-[var(--app-card-bg)] border-b border-[var(--app-border)] font-body text-[var(--app-text-secondary)]">
              {bulkResult}
            </div>
          )}
          {notOptedIn.length === 0 ? (
            <div className="px-4 py-6 text-center font-body text-xs text-[var(--app-text-muted)]">
              Everyone with a mobile is either opted in or has declined.
            </div>
          ) : (
            <table className="w-full text-left font-body text-sm" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr className="border-b border-[var(--app-border)] text-[var(--app-text-muted)] text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-center">Partner</th>
                  <th className="px-4 py-3 text-center">Code</th>
                  <th className="px-4 py-3 text-center">Phone</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {notOptedIn.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--app-border-subtle)]">
                    <td className="px-4 py-3 text-center text-[var(--app-text)]">{p.firstName} {p.lastName}</td>
                    <td className="px-4 py-3 text-center text-[var(--app-text-secondary)] font-mono text-xs">{p.partnerCode}</td>
                    <td className="px-4 py-3 text-center text-[var(--app-text-secondary)] font-mono text-xs">{fmtPhone(p.mobilePhone)}</td>
                    <td className="px-4 py-3 text-center text-[var(--app-text-muted)] capitalize">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Opted-out (STOP) partners */}
      {showOptedOut && (
        <div className="card overflow-x-auto mb-6">
          <div className="px-4 py-3 border-b border-[var(--app-border)]">
            <h4 className="font-display text-sm font-bold">Opted Out / Unsubscribed ({optedOut.length})</h4>
            <p className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5">
              Partners who replied STOP. Bulk sends skip these automatically.
            </p>
          </div>
          {optedOut.length === 0 ? (
            <div className="px-4 py-6 text-center font-body text-xs text-[var(--app-text-muted)]">
              No unsubscribes on record.
            </div>
          ) : (
            <table className="w-full text-left font-body text-sm" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr className="border-b border-[var(--app-border)] text-[var(--app-text-muted)] text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-center">Partner</th>
                  <th className="px-4 py-3 text-center">Code</th>
                  <th className="px-4 py-3 text-center">Phone</th>
                  <th className="px-4 py-3 text-center">Stopped</th>
                </tr>
              </thead>
              <tbody>
                {optedOut.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--app-border-subtle)]">
                    <td className="px-4 py-3 text-center text-[var(--app-text)]">{p.firstName} {p.lastName}</td>
                    <td className="px-4 py-3 text-center text-[var(--app-text-secondary)] font-mono text-xs">{p.partnerCode}</td>
                    <td className="px-4 py-3 text-center text-[var(--app-text-secondary)] font-mono text-xs">{fmtPhone(p.mobilePhone)}</td>
                    <td className="px-4 py-3 text-center text-[var(--app-text-muted)]">{p.stoppedAt ? fmtDateTime(p.stoppedAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <p className="font-body text-xs text-[var(--app-text-muted)] italic">
        Partners must opt in to receive SMS notifications. STOP keyword replies flip the opt-in flag off automatically.
      </p>
    </>
  );
}
