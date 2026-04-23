"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Admin workspace Google Calendar embed. Iframes
 * calendar.google.com/calendar/embed for whatever calendar id is
 * stored on PortalSettings.googleCalendarCalendarId (PR #433). The
 * iframe honors whatever Google session the admin already has in
 * their browser, so private events render inline without extra auth.
 *
 * States:
 *   - loading      → scanning status
 *   - disconnected → empty card with "Connect in Settings" link
 *   - connected    → iframe at the admin-configured calendar
 */

interface Status {
  connected: boolean;
  calendarId: string;
  connectedEmail: string | null;
}

function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

export default function CalendarEmbed() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"AGENDA" | "WEEK" | "MONTH">("AGENDA");

  useEffect(() => {
    fetch("/api/admin/google-calendar/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) { setStatus(null); return; }
        setStatus({
          connected: !!data.connected,
          calendarId: data.calendarId || "primary",
          connectedEmail: data.connectedEmail || null,
        });
      })
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);

  const tz = localTimeZone();
  const src = status
    ? `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(status.calendarId)}&ctz=${encodeURIComponent(tz)}&mode=${view}&showTitle=0&showNav=1&showDate=1&showPrint=0&showTabs=0&showCalendars=0&showTz=0`
    : "";

  return (
    <div className="card">
      <div className="px-4 sm:px-5 py-4 border-b border-[var(--app-border)] flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="font-body font-semibold text-sm flex items-center gap-2">
            <span aria-hidden>📅</span> Calendar
          </div>
          {status?.connectedEmail && (
            <div className="font-body text-[11px] theme-text-faint mt-0.5 truncate">{status.connectedEmail}</div>
          )}
        </div>
        {status?.connected && (
          <div className="flex gap-1 rounded-lg bg-[var(--app-input-bg)] p-0.5">
            {(["AGENDA", "WEEK", "MONTH"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`font-body text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                  view === v ? "bg-brand-gold/15 text-brand-gold" : "theme-text-muted hover:text-[var(--app-text)]"
                }`}
              >
                {v === "AGENDA" ? "Agenda" : v === "WEEK" ? "Week" : "Month"}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="px-5 py-10 text-center font-body text-sm theme-text-muted">Loading calendar…</div>
      ) : !status?.connected ? (
        <div className="px-5 py-10 text-center">
          <div className="font-body text-sm theme-text-muted mb-1">Google Calendar isn't connected yet.</div>
          <div className="font-body text-[12px] theme-text-faint mb-4">
            Connect the admin Google account once so events and Live Weekly syncs post to your calendar.
          </div>
          <Link
            href="/admin/settings?tab=integrations"
            className="inline-block btn-gold text-[12px] px-4 py-2"
          >
            Connect in Settings
          </Link>
        </div>
      ) : (
        <div className="w-full bg-white" style={{ height: 520 }}>
          <iframe
            src={src}
            title="Google Calendar"
            className="w-full h-full"
            frameBorder={0}
          />
        </div>
      )}
    </div>
  );
}
