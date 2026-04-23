"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";

interface Status {
  connected: boolean;
  connectedEmail: string | null;
  connectedAt: string | null;
  calendarId: string;
  calendars: Array<{ id: string; summary: string; primary?: boolean }>;
  oauthClientConfigured: boolean;
}

export default function GoogleCalendarCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localCalendarId, setLocalCalendarId] = useState("primary");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/google-calendar/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        setLocalCalendarId(data.calendarId || "primary");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Handle ?google_calendar=connected / ?google_calendar=error query
  // pushed by the OAuth callback, then strip it from the URL so the
  // success banner doesn't persist on reload.
  useEffect(() => {
    const param = searchParams.get("google_calendar");
    if (!param) return;
    if (param === "connected") {
      setMessage({ kind: "success", text: "Google Calendar connected." });
    } else if (param === "error") {
      const reason = searchParams.get("reason") || "unknown";
      setMessage({ kind: "error", text: `Connection failed: ${reason}` });
    }
    // Clear the query params
    router.replace("/admin/settings", { scroll: false });
  }, [searchParams, router]);

  async function handleDisconnect() {
    if (!confirm("Disconnect Google Calendar? Future Live Weekly syncs will stop posting events until you reconnect.")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/google-calendar/disconnect", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage({ kind: "error", text: data.error || "Disconnect failed" });
      } else {
        setMessage({ kind: "success", text: "Google Calendar disconnected." });
        load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleCalendarIdSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/google-calendar/calendar-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarId: localCalendarId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage({ kind: "error", text: data.error || "Save failed" });
      } else {
        setMessage({ kind: "success", text: "Target calendar updated." });
        load();
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card p-5">
        <div className="font-body text-sm text-[var(--app-text-muted)]">Loading Google Calendar status…</div>
      </div>
    );
  }

  const connected = !!status?.connected;

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-[15px] font-semibold flex items-center gap-2">
            <span aria-hidden>📅</span> Google Calendar
          </div>
          <p className="font-body text-[12px] text-[var(--app-text-muted)] mt-1 leading-relaxed">
            Connect a Google account so Fintella can post Live Weekly calls to your calendar. Partners are notified natively via Google's built-in reminders; the 📅 Sync button on <code className="font-mono">/admin/conference</code> creates or updates the event.
          </p>
        </div>
        <span className={`shrink-0 inline-block rounded-full px-2.5 py-1 font-body text-[10px] font-semibold tracking-wider uppercase ${connected ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-[var(--app-input-bg)] text-[var(--app-text-muted)] border border-[var(--app-border)]"}`}>
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>

      {message && (
        <div
          className={`rounded-lg px-3 py-2 font-body text-[12px] ${
            message.kind === "success"
              ? "bg-green-500/10 border border-green-500/20 text-green-400"
              : "bg-red-500/10 border border-red-500/20 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      {!status?.oauthClientConfigured && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 font-body text-[12px] text-amber-300 leading-relaxed">
          OAuth client not configured. Set <code className="font-mono">GOOGLE_OAUTH_CLIENT_ID</code> and <code className="font-mono">GOOGLE_OAUTH_CLIENT_SECRET</code> on Vercel, then redeploy. See the setup walkthrough in the Integrations section of the admin docs.
        </div>
      )}

      {connected && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="font-body text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1">Connected account</div>
            <div className="font-body text-[13px] text-[var(--app-text)] truncate">{status?.connectedEmail || "(unknown)"}</div>
          </div>
          <div>
            <div className="font-body text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1">Connected at</div>
            <div className="font-body text-[13px] text-[var(--app-text-secondary)]">
              {status?.connectedAt ? new Date(status.connectedAt).toLocaleString() : "—"}
            </div>
          </div>
        </div>
      )}

      {connected && (
        <div>
          <div className="font-body text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1">Target calendar</div>
          {status && status.calendars.length > 0 ? (
            <select
              value={localCalendarId}
              onChange={(e) => setLocalCalendarId(e.target.value)}
              className="w-full bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2 font-body text-[13px] text-[var(--app-text)]"
            >
              {status.calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.summary} {c.primary ? "(primary)" : ""} — {c.id}
                </option>
              ))}
              {!status.calendars.some((c) => c.id === localCalendarId) && (
                <option value={localCalendarId}>{localCalendarId}</option>
              )}
            </select>
          ) : (
            <input
              type="text"
              value={localCalendarId}
              onChange={(e) => setLocalCalendarId(e.target.value)}
              placeholder="primary"
              className="w-full bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2 font-body text-[13px] text-[var(--app-text)] font-mono"
            />
          )}
          <div className="mt-1 font-body text-[11px] text-[var(--app-text-muted)]">
            Events land on this calendar. <code className="font-mono">primary</code> is your default Google Calendar.
          </div>
          {localCalendarId !== status?.calendarId && (
            <button
              onClick={handleCalendarIdSave}
              disabled={saving}
              className="mt-2 btn-gold text-[11px] px-4 py-1.5 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save calendar choice"}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {!connected ? (
          <a
            href="/api/admin/google-calendar/oauth-start"
            className={`btn-gold text-[12px] px-5 py-2.5 ${!status?.oauthClientConfigured ? "pointer-events-none opacity-50" : ""}`}
          >
            Connect Google Calendar
          </a>
        ) : (
          <>
            <a
              href="/api/admin/google-calendar/oauth-start"
              className="font-body text-[12px] border border-[var(--app-border)] rounded-lg px-4 py-2 hover:bg-[var(--app-card-bg)] transition-colors text-[var(--app-text-secondary)]"
            >
              Reconnect
            </a>
            <button
              onClick={handleDisconnect}
              disabled={saving}
              className="font-body text-[12px] border border-red-400/25 text-red-400/80 rounded-lg px-4 py-2 hover:bg-red-400/10 transition-colors disabled:opacity-50"
            >
              Disconnect
            </button>
          </>
        )}
      </div>
    </div>
  );
}
