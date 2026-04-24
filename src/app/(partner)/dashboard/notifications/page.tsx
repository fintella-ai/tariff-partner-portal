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

type TypeAgg = { type: string; count: number };

type ReadFilter = "all" | "unread" | "read";

const PAGE_SIZE = 20;

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
  channel_invite: "🔔",
  channel_message: "📢",
  dm_flag: "🚩",
};

// Human-readable labels for the type filter dropdown.
const TYPE_LABELS: Record<string, string> = {
  admin_mention: "Admin Mention",
  deal_stage_change: "Deal Stage Change",
  commission_paid: "Commission Paid",
  agreement_ready: "Agreement Ready",
  agreement_signed: "Agreement Signed",
  welcome: "Welcome",
  announcement: "Announcement",
  message: "Message",
  feature_request: "Feature Request",
  support_ticket: "Support Ticket",
  channel_invite: "Channel Invite",
  channel_message: "Channel Message",
  dm_flag: "DM Flag",
};

function prettyType(type: string): string {
  return TYPE_LABELS[type] || type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

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
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [types, setTypes] = useState<TypeAgg[]>([]);
  const [loading, setLoading] = useState(true);
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [page, setPage] = useState(0);
  const [seeAll, setSeeAll] = useState(false);
  const [marking, setMarking] = useState(false);

  const fetchNotifications = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (readFilter === "unread") qs.set("unread", "true");
    if (typeFilter) qs.set("type", typeFilter);
    if (seeAll) {
      qs.set("all", "1");
    } else {
      qs.set("limit", String(PAGE_SIZE));
      qs.set("offset", String(page * PAGE_SIZE));
    }
    fetch(`/api/notifications?${qs.toString()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        setNotifications(data.notifications || []);
        setTotal(data.total || 0);
        setUnreadCount(data.unreadCount || 0);
        setTypes(data.types || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [readFilter, typeFilter, page, seeAll]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Whenever a filter changes, reset pagination so we don't land on an
  // empty page past the new dataset's end.
  useEffect(() => { setPage(0); setSeeAll(false); }, [readFilter, typeFilter]);

  // Client-side "read" filter for the already-fetched page (API returns
  // unread-only when readFilter=="unread"; for readFilter=="read" the
  // API returns everything, so narrow here).
  const visible = notifications.filter((n) =>
    readFilter === "all" ? true : readFilter === "unread" ? !n.read : n.read
  );

  async function markOne(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
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
    setUnreadCount(0);
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

  const pageCount = seeAll ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showingFrom = seeAll ? 1 : page * PAGE_SIZE + 1;
  const showingTo = seeAll ? total : Math.min(total, (page + 1) * PAGE_SIZE);

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

      {/* Filter row — read-state pills + type dropdown + mark-all-read */}
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "unread", "read"] as const).map((f) => {
            const count = f === "all" ? total : f === "unread" ? unreadCount : total - unreadCount;
            return (
              <button
                key={f}
                onClick={() => setReadFilter(f)}
                className={`font-body text-[12px] px-3 py-1.5 rounded-full border transition-colors ${
                  readFilter === f
                    ? "bg-brand-gold/15 border-brand-gold/40 text-brand-gold"
                    : "border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"
                }`}
              >
                {f === "all" ? "All" : f === "unread" ? "Unread" : "Read"}
                <span className="ml-1.5 text-[10px] text-[var(--app-text-faint)]">({count})</span>
              </button>
            );
          })}

          {/* Type filter dropdown — populated from server aggregate so
              only types the partner actually has show up. */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="font-body text-[12px] theme-input rounded-full px-3 py-1.5 border"
            style={{ borderColor: typeFilter ? "var(--brand-gold)" : "var(--app-border)" }}
          >
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t.type} value={t.type}>
                {prettyType(t.type)} ({t.count})
              </option>
            ))}
          </select>
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
        ) : visible.length === 0 ? (
          <div className="p-12 text-center font-body text-sm text-[var(--app-text-muted)]">
            {total === 0
              ? "No notifications yet."
              : `No ${readFilter} notifications${typeFilter ? ` of type ${prettyType(typeFilter)}` : ""}.`}
          </div>
        ) : (
          <div className="divide-y divide-[var(--app-border)]">
            {visible.map((n) => {
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
                    <div className="flex items-center gap-3 mt-2">
                      <span className="font-body text-[10px] tracking-wider uppercase text-[var(--app-text-faint)]">{prettyType(n.type)}</span>
                      {!n.read && (
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); markOne(n.id); }}
                          className="font-body text-[11px] text-brand-gold/70 hover:text-brand-gold transition-colors"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
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

        {/* Pagination footer — hidden in See-all mode */}
        {!loading && total > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-[var(--app-border)]">
            <div className="font-body text-[11px] text-[var(--app-text-muted)]">
              {seeAll ? (
                <>Showing all {total}</>
              ) : (
                <>Showing {showingFrom}–{showingTo} of {total}</>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!seeAll ? (
                <>
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="font-body text-[11px] text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] border border-[var(--app-border)] rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <span className="font-body text-[11px] text-[var(--app-text-muted)]">
                    Page {page + 1} of {pageCount}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    disabled={page >= pageCount - 1}
                    className="font-body text-[11px] text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] border border-[var(--app-border)] rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
                  >
                    Next →
                  </button>
                  <button
                    onClick={() => { setSeeAll(true); setPage(0); }}
                    className="font-body text-[11px] text-brand-gold/80 hover:text-brand-gold border border-brand-gold/30 rounded-lg px-3 py-1.5 hover:bg-brand-gold/10 transition-colors"
                  >
                    See all
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setSeeAll(false)}
                  className="font-body text-[11px] text-brand-gold/80 hover:text-brand-gold border border-brand-gold/30 rounded-lg px-3 py-1.5 hover:bg-brand-gold/10 transition-colors"
                >
                  Back to paged view
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
