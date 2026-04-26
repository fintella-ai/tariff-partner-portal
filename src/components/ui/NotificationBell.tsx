"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  link: string | null;
  createdAt: string;
};

const MENTION_TYPES = new Set(["admin_mention", "channel_reply"]);
type Tab = "all" | "mentions";

const TYPE_ICONS: Record<string, string> = {
  deal_update: "📋",
  commission_paid: "💰",
  document_request: "📄",
  ticket_response: "🎫",
  agreement_signed: "✍️",
  partner_joined: "👤",
  payout_processed: "💳",
  system: "🔔",
  admin_mention: "👋",
  channel_announcement: "📣",
  channel_reply: "💬",
  partner_dm_message: "💬",
  partner_dm_flag: "🚩",
  partner_dm_flag_outcome: "✅",
};

export default function NotificationBell({ draggable = false }: { draggable?: boolean } = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // ── Drag state ──
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const handleDragStart = useCallback((clientX: number, clientY: number) => {
    if (!draggable) return;
    dragStartPos.current = {
      x: clientX,
      y: clientY,
      ox: dragOffset?.x ?? 0,
      oy: dragOffset?.y ?? 0,
    };
    setIsDragging(true);
  }, [draggable, dragOffset]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (clientX: number, clientY: number) => {
      if (!dragStartPos.current) return;
      const dx = clientX - dragStartPos.current.x;
      const dy = clientY - dragStartPos.current.y;
      setDragOffset({
        x: dragStartPos.current.ox + dx,
        y: dragStartPos.current.oy + dy,
      });
    };
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onEnd = () => {
      setIsDragging(false);
      dragStartPos.current = null;
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onEnd);
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onEnd);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onEnd);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onEnd);
    };
  }, [isDragging]);

  const fetchNotifications = useCallback(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((data) => {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // poll every 30s
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function markRead(id: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchNotifications();
  }

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    fetchNotifications();
  }

  function handleClick(n: Notification) {
    if (!n.read) markRead(n.id);
    if (n.link) {
      router.push(n.link);
      setOpen(false);
    }
  }

  const visibleNotifications = tab === "mentions"
    ? notifications.filter((n) => MENTION_TYPES.has(n.type))
    : notifications;

  const mentionUnread = notifications.filter(
    (n) => MENTION_TYPES.has(n.type) && !n.read
  ).length;

  function timeAgo(d: string) {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  return (
    <div
      ref={ref}
      className="relative"
      style={
        draggable && dragOffset
          ? { transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`, transition: isDragging ? "none" : "transform 0.15s ease" }
          : undefined
      }
    >
      {draggable && (
        <div
          className="absolute -top-2 left-1/2 -translate-x-1/2 w-6 h-2 rounded-full bg-[var(--app-border)] opacity-0 hover:opacity-60 transition-opacity z-10"
          style={{ cursor: isDragging ? "grabbing" : "grab" }}
          onMouseDown={(e) => { e.preventDefault(); handleDragStart(e.clientX, e.clientY); }}
          onTouchStart={(e) => { if (e.touches.length === 1) handleDragStart(e.touches[0].clientX, e.touches[0].clientY); }}
          title="Drag to reposition"
        />
      )}
      <button
        onClick={() => { if (!isDragging) setOpen(!open); }}
        className={`relative font-body text-lg border-2 rounded-lg px-3 py-2 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center backdrop-blur-sm ${
          unreadCount > 0
            ? "border-brand-gold bg-brand-gold/25 animate-pulse shadow-[0_0_16px_rgba(196,160,80,0.5)]"
            : "border-brand-gold/70 bg-brand-gold/10 hover:bg-brand-gold/20"
        }`}
        style={{ filter: "saturate(1.3) brightness(1.1)" }}
        title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}` : "Notifications"}
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-[340px] max-h-[420px] bg-[var(--app-popover-bg)] border border-[var(--app-border)] rounded-xl shadow-2xl shadow-black/30 z-[1000] overflow-hidden">
          <div className="px-4 pt-3 pb-0 border-b border-[var(--app-border)]">
            <div className="flex items-center justify-between mb-2">
              <div className="font-body text-sm font-semibold text-[var(--app-text)]">
                Notifications {unreadCount > 0 && <span className="text-brand-gold">({unreadCount})</span>}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="font-body text-[10px] text-brand-gold hover:text-brand-gold/80 transition-colors"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="flex gap-1">
              {(["all", "mentions"] as Tab[]).map((t) => {
                const active = tab === t;
                const label = t === "all" ? "All" : "Mentions";
                const badge = t === "mentions" ? mentionUnread : 0;
                return (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`font-body text-[11px] px-3 py-1.5 rounded-t-md transition-colors ${
                      active
                        ? "bg-[var(--app-card-bg)] text-[var(--app-text)] font-semibold border border-b-0 border-[var(--app-border)] -mb-px"
                        : "text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"
                    }`}
                  >
                    {label}
                    {badge > 0 && (
                      <span className="ml-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-[16px] inline-flex items-center justify-center px-1">
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="overflow-y-auto max-h-[360px]">
            {visibleNotifications.length === 0 ? (
              <div className="p-8 text-center">
                <div className="font-body text-sm text-[var(--app-text-muted)]">
                  {tab === "mentions" ? "No mentions yet" : "No notifications yet"}
                </div>
              </div>
            ) : (
              visibleNotifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`px-4 py-3 border-b border-[var(--app-border)] last:border-b-0 cursor-pointer transition-colors hover:bg-[var(--app-card-bg)] ${
                    !n.read ? "bg-brand-gold/[0.03]" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-base mt-0.5">{TYPE_ICONS[n.type] || "🔔"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className={`font-body text-[13px] font-medium truncate ${!n.read ? "text-[var(--app-text)]" : "text-[var(--app-text-secondary)]"}`}>
                          {n.title}
                        </div>
                        {!n.read && (
                          <span className="w-2 h-2 rounded-full bg-brand-gold shrink-0" />
                        )}
                      </div>
                      <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5 line-clamp-2">
                        {n.message}
                      </div>
                      <div className="font-body text-[10px] text-[var(--app-text-faint)] mt-1">
                        {timeAgo(n.createdAt)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
