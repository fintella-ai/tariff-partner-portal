"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageTabBar from "@/components/ui/PageTabBar";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  href: string | null;
  read: boolean;
  createdAt: string;
};

type Filter = "all" | "unread" | "read";

// Matches the bell dropdown's type → emoji map so in-app icons stay
// consistent across surfaces.
const TYPE_ICONS: Record<string, string> = {
  admin_mention: "👋",
  deal_stage_change: "📈",
  commission_paid: "💲",
  agreement_ready: "✍️",
  agreement_signed: "📝",
  welcome: "👋",
  announcement: "📣",
  message: "💬",
  feature_request: "💡",
  support_ticket: "🎫",
};

function fmtRelative(iso: string): string {
  const when = new Date(iso).getTime();
  const diffSec = Math.floor((Date.now() - when) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [marking, setMarking] = useState(false);

  const fetchNotifications = useCallback(() => {
    fetch("/api/notifications", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setNotifications(data.notifications || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const filtered = notifications.filter((n) =>
    filter === "all" ? true : filter === "unread" ? !n.read : n.read
  );
  const unreadCount = notifications.filter((n) => !n.read).length;

  async function markOne(id: string) {
    // Optimistic flip
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      // Silent — next fetch reconciles.
    }
  }

  async function markAllRead() {
    if (unreadCount === 0) return;
    setMarking(true);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
    } catch {
      // Silent.
    } finally {
      setMarking(false);
    }
  }

  return (
    <div>
      <PageTabBar
        title="Communications"
        tabs={[
          { label: "Live Weekly Call", href: "/dashboard/conference" },
          { label: "Announcements", href: "/dashboard/announcements" },
          { label: "Messages", href: "/dashboard/messages" },
          { label: "Notifications", href: "/dashboard/notifications" },
        ]}
      />

      {/* Filter tabs + mark-all-read */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex gap-2">
          {(["all", "unread", "read"] as const).map((f) => {
            const count = f === "all" ? notifications.length : f === "unread" ? unreadCount : notifications.length - unreadCount;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`font-body text-[12px] px-3 py-1.5 rounded-full border transition-colors ${
                  filter === f
                    ? "bg-brand-gold/15 border-brand-gold/40 text-brand-gold"
                    : "border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"
                }`}
              >
                {f === "all" ? "All" : f === "unread" ? "Unread" : "Read"}
                <span className="ml-1.5 text-[10px] text-[var(--app-text-faint)]">({count})</span>
              </button>
            );
          })}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            disabled={marking}
            className="font-body text-[11px] text-brand-gold/80 hover:text-brand-gold border border-brand-gold/30 rounded-lg px-3 py-1.5 hover:bg-brand-gold/10 transition-colors disabled:opacity-50"
          >
            {marking ? "Marking…" : `Mark all read (${unreadCount})`}
          </button>
        )}
      </div>

      {/* Log */}
      <div className="card">
        {loading ? (
          <div className="p-12 text-center font-body text-sm text-[var(--app-text-muted)]">Loading notifications…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center font-body text-sm text-[var(--app-text-muted)]">
            {filter === "all" ? "No notifications yet." : `No ${filter} notifications.`}
          </div>
        ) : (
          <div className="divide-y divide-[var(--app-border)]">
            {filtered.map((n) => {
              const icon = TYPE_ICONS[n.type] || "🔔";
              const body = (
                <div className={`flex items-start gap-3 px-4 sm:px-5 py-3 transition-colors ${
                  n.read ? "" : "bg-brand-gold/[0.04]"
                } hover:bg-[var(--app-card-bg)]`}>
                  <span className="text-xl shrink-0 mt-0.5">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className={`font-body text-[13px] ${n.read ? "text-[var(--app-text-secondary)]" : "text-[var(--app-text)] font-semibold"}`}>
                        {n.title}
                      </div>
                      <span className="font-body text-[10px] text-[var(--app-text-faint)] shrink-0 whitespace-nowrap">{fmtRelative(n.createdAt)}</span>
                    </div>
                    {n.message && (
                      <div className="font-body text-[12px] text-[var(--app-text-muted)] mt-1 leading-relaxed">{n.message}</div>
                    )}
                    {!n.read && (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); markOne(n.id); }}
                        className="font-body text-[11px] text-brand-gold/70 hover:text-brand-gold mt-2 transition-colors"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              );
              return n.href ? (
                <Link key={n.id} href={n.href} onClick={() => !n.read && markOne(n.id)} className="block">
                  {body}
                </Link>
              ) : (
                <div key={n.id}>{body}</div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
