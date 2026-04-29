"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getPermissions, type AdminRole } from "@/lib/permissions";
import WorkspaceStatCard from "@/components/admin/WorkspaceStatCard";
import AttentionFeedRow, { type AttentionItem, type AttentionSource } from "@/components/admin/AttentionFeedRow";
import PartnerContextDrawer from "@/components/admin/PartnerContextDrawer";
import ActivityTimeline from "@/components/admin/ActivityTimeline";
import CommunicationsWidget from "@/components/admin/CommunicationsWidget";
import CalendarEmbed from "@/components/admin/CalendarEmbed";
import { fmt$ } from "@/lib/format";

/**
 * Admin Workspace — the default /admin landing.
 *
 * Consolidates "what needs my attention" across the portal into one
 * screen: hero metrics, a unified Needs-Attention feed (merged from
 * 7 admin endpoints), and quick-link shortcuts. Data is fetched
 * client-side via Promise.allSettled so a single broken endpoint
 * doesn't nuke the whole dashboard. Polls every 60s.
 *
 * Role gating mirrors permissions.ts — accounting role doesn't see
 * messaging widgets; partner_support doesn't see payout widgets.
 */

const POLL_MS = 60_000;
type TaskFilter = "all_tasks" | "meetings" | "overdue";
const TASK_TABS: Array<{ id: TaskFilter; label: string; sources: AttentionSource[] | "all_realtime" | "overdue" }> = [
  { id: "all_tasks",  label: "All",       sources: "all_realtime" },
  { id: "meetings",   label: "Meetings",  sources: ["meeting"] },
  { id: "overdue",    label: "Overdue",   sources: "overdue" },
];
const REALTIME_SOURCES = new Set<AttentionSource>(["meeting" as const, "chat" as const, "ticket" as const]);

type AttentionFilter = "all_attention" | "messages" | "support" | "onboarding" | "payouts";
const ATTENTION_TABS: Array<{ id: AttentionFilter; label: string; sources: AttentionSource[] | "all_attention" }> = [
  { id: "all_attention", label: "All",        sources: "all_attention" },
  { id: "messages",      label: "Messages",   sources: ["email", "sms"] },
  { id: "support",       label: "Support",    sources: ["ticket"] },
  { id: "onboarding",    label: "Onboarding", sources: ["agreement", "invite", "partner"] },
  { id: "payouts",       label: "Payouts",    sources: ["payout"] },
];

interface Stats {
  unreadMessages: number;
  openTickets: number;
  pendingPayouts: { count: number; amount: number };
  unsignedAgreements: number;
  pendingPartners: number;
  openInvites: number;
  featureRequests: number;
}

const INITIAL_STATS: Stats = {
  unreadMessages: 0,
  openTickets: 0,
  pendingPayouts: { count: 0, amount: 0 },
  unsignedAgreements: 0,
  pendingPartners: 0,
  openInvites: 0,
  featureRequests: 0,
};

type SectionId = "stats" | "quicklinks" | "calendar" | "tasks_activity" | "communications" | "needs_attention";
const DEFAULT_SECTION_ORDER: SectionId[] = ["stats", "quicklinks", "calendar", "tasks_activity", "communications", "needs_attention"];
const LAYOUT_KEY = "fintella.admin.workspace.layout.v5";

function readLayout(): SectionId[] {
  if (typeof window === "undefined") return DEFAULT_SECTION_ORDER;
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    if (!raw) return DEFAULT_SECTION_ORDER;
    const parsed = JSON.parse(raw) as SectionId[];
    // Reconcile: drop unknown ids, append missing defaults, preserves order.
    const known = new Set<SectionId>(DEFAULT_SECTION_ORDER);
    const preserved = parsed.filter((s) => known.has(s));
    const appended = DEFAULT_SECTION_ORDER.filter((s) => !preserved.includes(s));
    return [...preserved, ...appended];
  } catch {
    return DEFAULT_SECTION_ORDER;
  }
}

export default function AdminWorkspacePage() {
  const { data: session } = useSession();
  const role = ((session?.user as any)?.role || "admin") as AdminRole;
  const permissions = getPermissions(role);
  const adminName = (session?.user as any)?.name || "Admin";

  const [stats, setStats] = useState<Stats>(INITIAL_STATS);
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all_tasks");
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>("all_attention");

  // Right-rail partner context drawer state
  const [drawerPartnerCode, setDrawerPartnerCode] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openPartnerDrawer = useCallback((code: string) => {
    setDrawerPartnerCode(code);
    setDrawerOpen(true);
  }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Per-admin layout — section order + edit-mode toggle. Stored in
  // localStorage so it's per-browser/per-admin with no schema change.
  const [sectionOrder, setSectionOrder] = useState<SectionId[]>(DEFAULT_SECTION_ORDER);
  const [editMode, setEditMode] = useState(false);
  const [draggedSection, setDraggedSection] = useState<SectionId | null>(null);

  // Hydrate layout from localStorage on mount (client only).
  useEffect(() => {
    setSectionOrder(readLayout());
  }, []);

  const persistLayout = useCallback((next: SectionId[]) => {
    setSectionOrder(next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
      } catch {
        // localStorage quota / privacy mode — best-effort
      }
    }
  }, []);

  const onSectionDragStart = (e: React.DragEvent, id: SectionId) => {
    if (!editMode) return;
    setDraggedSection(id);
    e.dataTransfer.effectAllowed = "move";
  };
  const onSectionDragOver = (e: React.DragEvent) => {
    if (!editMode || !draggedSection) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const onSectionDrop = (e: React.DragEvent, targetId: SectionId) => {
    if (!editMode || !draggedSection) return;
    e.preventDefault();
    if (draggedSection === targetId) { setDraggedSection(null); return; }
    const next = [...sectionOrder];
    const src = next.indexOf(draggedSection);
    const dst = next.indexOf(targetId);
    if (src < 0 || dst < 0) { setDraggedSection(null); return; }
    next.splice(src, 1);
    next.splice(dst, 0, draggedSection);
    persistLayout(next);
    setDraggedSection(null);
  };

  const loadWorkspace = useCallback(async () => {
    const [
      inboxRes,
      smsRes,
      chatRes,
      ticketsRes,
      payoutsRes,
      partnersRes,
      featuresRes,
      invitesRes,
      bookingsRes,
    ] = await Promise.allSettled([
      fetch("/api/admin/inbox").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/admin/sms/log").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/admin/chat").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/admin/support").then((r) => (r.ok ? r.json() : null)),
      permissions.canEditPayouts
        ? fetch("/api/admin/payouts").then((r) => (r.ok ? r.json() : null))
        : Promise.resolve(null),
      fetch("/api/admin/partners").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/admin/feature-requests").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/admin/invites").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/admin/booking-slots").then((r) => (r.ok ? r.json() : null)),
    ]);

    // Each value is either null (endpoint failed / not permitted) or the
    // parsed JSON; no throws reach here because of allSettled.
    const inbox = inboxRes.status === "fulfilled" ? inboxRes.value : null;
    const sms = smsRes.status === "fulfilled" ? smsRes.value : null;
    const chat = chatRes.status === "fulfilled" ? chatRes.value : null;
    const tickets = ticketsRes.status === "fulfilled" ? ticketsRes.value : null;
    const payouts = payoutsRes.status === "fulfilled" ? payoutsRes.value : null;
    const partners = partnersRes.status === "fulfilled" ? partnersRes.value : null;
    const features = featuresRes.status === "fulfilled" ? featuresRes.value : null;
    const invites = invitesRes.status === "fulfilled" ? invitesRes.value : null;
    const bookingSlots = bookingsRes.status === "fulfilled" ? bookingsRes.value : null;

    // ─── Derived stats ─────────────────────────────────────────────
    const emailUnread = inbox?.stats?.unread ?? 0;
    const smsInbound = Array.isArray(sms?.logs)
      ? (sms.logs as Array<{ direction: string }>).filter((l) => l.direction === "inbound").length
      : 0;
    const chatUnread = Array.isArray(chat?.sessions)
      ? (chat.sessions as Array<{ unreadCount?: number }>).reduce((s, c) => s + (c.unreadCount || 0), 0)
      : 0;
    const unreadMessages = emailUnread + smsInbound + chatUnread;

    const openTicketList = Array.isArray(tickets?.tickets)
      ? (tickets.tickets as Array<{ status: string }>).filter((t) => t.status !== "resolved")
      : [];
    const openTickets = openTicketList.length;

    const pendingPayouts = {
      count: Array.isArray(payouts?.payouts)
        ? (payouts.payouts as Array<{ status: string }>).filter((p) => p.status === "due").length
        : 0,
      amount: payouts?.stats?.totalDue ?? 0,
    };

    const partnerList = Array.isArray(partners?.partners) ? (partners.partners as any[]) : [];
    const unsignedAgreements = partnerList.filter((p) => {
      const ag = p.agreement ?? p.agreementStatus;
      const status = typeof ag === "object" ? ag?.status : ag;
      return status === "pending";
    }).length;
    const pendingPartners = partnerList.filter((p) => p.status === "pending").length;

    const featureRequests = features?.stats?.submitted ?? 0;

    const openInvites = Array.isArray(invites?.invites)
      ? (invites.invites as any[]).filter((i) => i.status === "active" && !i.usedByPartnerCode)
      : [];

    setStats({
      unreadMessages,
      openTickets,
      pendingPayouts,
      unsignedAgreements,
      pendingPartners,
      openInvites: openInvites.length,
      featureRequests,
    });

    // ─── Build the unified Needs-Attention feed ────────────────────
    const feed: AttentionItem[] = [];

    // Emails: unread inbound — due in 24h
    if (Array.isArray(inbox?.emails)) {
      for (const e of inbox.emails as any[]) {
        if (e.read) continue;
        const dueAt = new Date(new Date(e.createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString();
        feed.push({
          id: `email:${e.id}`,
          source: "email",
          partnerCode: e.partnerCode || null,
          partnerName: e.fromName || e.fromEmail || null,
          summary: e.subject || "(no subject)",
          createdAt: e.createdAt,
          href: "/admin/communications",
          actionLabel: "Reply",
          taskStatus: "new",
          dueAt,
        });
      }
    }

    // Inbound SMS
    if (Array.isArray(sms?.logs)) {
      for (const s of sms.logs as any[]) {
        if (s.direction !== "inbound") continue;
        feed.push({
          id: `sms:${s.id}`,
          source: "sms",
          partnerCode: s.partnerCode || null,
          partnerName: s.partnerName || null,
          summary: s.body?.slice(0, 140) || "(empty SMS)",
          createdAt: s.createdAt,
          href: "/admin/communications",
          actionLabel: "Reply",
        });
      }
    }

    // Live chat sessions — all active as tasks, closed as completed
    if (Array.isArray(chat?.sessions)) {
      for (const c of chat.sessions as any[]) {
        const isActive = c.status === "active";
        const hasUnread = (c.unreadCount || 0) > 0;
        if (!isActive && !hasUnread) continue;
        feed.push({
          id: `chat:${c.id}`,
          source: "chat",
          partnerCode: c.partnerCode || null,
          partnerName: c.partnerName || null,
          summary: hasUnread
            ? `${c.unreadCount} unread message${c.unreadCount === 1 ? "" : "s"}`
            : c.lastMessage?.slice(0, 80) || "Live chat session",
          createdAt: c.lastMessageAt || c.updatedAt || c.createdAt,
          href: "/admin/support",
          actionLabel: hasUnread ? "Reply" : "View",
          taskStatus: hasUnread ? "new" : isActive ? "in_process" : "completed",
          dueAt: c.createdAt,
        });
      }
    }

    // Support tickets — open/in_progress as tasks, resolved as completed
    if (Array.isArray(tickets?.tickets)) {
      for (const t of tickets.tickets as any[]) {
        const status = t.status as string;
        const isResolved = status === "resolved" || status === "closed";
        const isNew = status === "open";
        feed.push({
          id: `ticket:${t.id}`,
          source: "ticket",
          partnerCode: t.partnerCode || null,
          partnerName: t.partnerName || null,
          summary: `${t.subject || "(no subject)"}${t.priority === "urgent" ? " ⚡" : t.priority === "high" ? " 🔥" : ""}`,
          createdAt: t.updatedAt || t.createdAt,
          href: `/admin/support?ticketId=${t.id}`,
          actionLabel: isResolved ? "Done" : "Review",
          taskStatus: isResolved ? "completed" : isNew ? "new" : "in_process",
          dueAt: t.createdAt,
        });
      }
    }

    // Unsigned agreements (need admin nudge)
    for (const p of partnerList) {
      const ag = p.agreement ?? p.agreementStatus;
      const status = typeof ag === "object" ? ag?.status : ag;
      if (status !== "pending") continue;
      feed.push({
        id: `agreement:${p.id || p.partnerCode}`,
        source: "agreement",
        partnerCode: p.partnerCode || null,
        partnerName: `${p.firstName || ""} ${p.lastName || ""}`.trim() || null,
        summary: "Agreement sent, not signed yet",
        createdAt: (typeof ag === "object" ? ag?.sentDate : null) || p.updatedAt || p.createdAt,
        href: `/admin/partners/${p.id}`,
        actionLabel: "Nudge",
      });
    }

    // New partners awaiting activation
    for (const p of partnerList) {
      if (p.status !== "pending") continue;
      feed.push({
        id: `partner:${p.id || p.partnerCode}`,
        source: "partner",
        partnerCode: p.partnerCode || null,
        partnerName: `${p.firstName || ""} ${p.lastName || ""}`.trim() || null,
        summary: "Signed up, awaiting activation",
        createdAt: p.createdAt,
        href: `/admin/partners/${p.id}`,
        actionLabel: "Activate",
      });
    }

    // Open recruitment invites — admin-generated L1 invites that are
    // still active and haven't been used yet. These are partners-to-be
    // who haven't clicked the signup link. Surfaced in Onboarding so
    // admins can nudge / resend.
    for (const inv of openInvites) {
      feed.push({
        id: `invite:${inv.id}`,
        source: "invite",
        partnerCode: null,
        partnerName: inv.invitedName || inv.invitedEmail || null,
        summary: inv.invitedEmail
          ? `Invited ${inv.invitedEmail} — not signed up yet`
          : "Open invite — not used yet",
        createdAt: inv.lastReminderSentAt || inv.createdAt,
        href: "/admin/partners",
        actionLabel: "Nudge",
      });
    }

    // Due payouts (only if the role can see them)
    if (permissions.canEditPayouts && Array.isArray(payouts?.payouts)) {
      for (const p of payouts.payouts as any[]) {
        if (p.status !== "due") continue;
        feed.push({
          id: `payout:${p.id}`,
          source: "payout",
          partnerCode: p.partnerCode || null,
          partnerName: p.partnerName || null,
          summary: `${fmt$(p.amount)} ${p.tier ? `(${p.tier})` : ""} — ${p.dealName || "deal"}`,
          createdAt: p.createdAt || p.dealStageUpdatedAt || new Date().toISOString(),
          href: "/admin/payouts",
          actionLabel: "Batch",
        });
      }
    }

    // Submitted feature requests (super_admin only — endpoint 403s otherwise)
    if (Array.isArray(features?.requests)) {
      for (const r of features.requests as any[]) {
        if (r.status !== "submitted") continue;
        feed.push({
          id: `feature:${r.id}`,
          source: "feature",
          partnerCode: r.submittedBy || null,
          partnerName: r.submittedByName || null,
          summary: r.title || "(untitled request)",
          createdAt: r.createdAt,
          href: "/admin/features",
          actionLabel: "Review",
        });
      }
    }

    // Today's scheduled meetings (booking slots with confirmed bookings)
    if (Array.isArray(bookingSlots?.slots)) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      for (const slot of bookingSlots.slots as any[]) {
        const slotTime = new Date(slot.startsAt).getTime();
        if (slotTime < todayStart.getTime() || slotTime > todayEnd.getTime()) continue;
        if (!slot.bookings?.length) continue;

        const time = new Date(slot.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        const endTime = new Date(slot.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        const names = (slot.bookings as any[]).map((b: any) => b.name).join(", ");
        const meetUrl = slot.location === "google_meet" && slot.googleEventId
          ? `https://calendar.google.com/calendar/event?eid=${slot.googleEventId}`
          : null;

        feed.push({
          id: `meeting:${slot.id}`,
          source: "meeting",
          partnerCode: null,
          partnerName: names || null,
          summary: `${slot.title} · ${time} – ${endTime}`,
          createdAt: slot.startsAt,
          href: meetUrl || "/admin/booking-slots",
          actionLabel: meetUrl ? "Join" : "View",
        });
      }
    }

    // Oldest first — most stale bubbles to the top, top 50 shown.
    for (const item of feed) { item.assignee = adminName; }
    feed.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    setItems(feed.slice(0, 100));

    setLastRefreshed(new Date());
    setLoading(false);
  }, [permissions.canEditPayouts]);

  useEffect(() => {
    loadWorkspace();
    const id = setInterval(loadWorkspace, POLL_MS);
    return () => clearInterval(id);
  }, [loadWorkspace]);

  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);

  const taskItems = useMemo(() => {
    const todaysItems = items.filter((i) => {
      const isRealtime = REALTIME_SOURCES.has(i.source);
      const isToday = new Date(i.createdAt).getTime() >= todayStart;
      return isRealtime || (isToday && (i.source === "email" || i.source === "sms"));
    });
    const active = TASK_TABS.find((t) => t.id === taskFilter);
    if (!active || active.sources === "all_realtime") return todaysItems;
    if (active.sources === "overdue") {
      const cutoff = Date.now() - 48 * 60 * 60 * 1000;
      return items.filter((i) => new Date(i.createdAt).getTime() < cutoff && i.taskStatus !== "completed");
    }
    const allowed = new Set(active.sources);
    return todaysItems.filter((i) => allowed.has(i.source));
  }, [taskFilter, items, todayStart]);

  const attentionItems = useMemo(() => {
    const olderItems = items.filter((i) => {
      const isRealtime = REALTIME_SOURCES.has(i.source);
      const isToday = new Date(i.createdAt).getTime() >= todayStart;
      if (isRealtime) return false;
      if ((i.source === "email" || i.source === "sms") && isToday) return false;
      return true;
    });
    const active = ATTENTION_TABS.find((t) => t.id === attentionFilter);
    if (!active || active.sources === "all_attention") return olderItems;
    const allowed = new Set(active.sources);
    return olderItems.filter((i) => allowed.has(i.source));
  }, [attentionFilter, items, todayStart]);

  const showMessagingCard = permissions.canEditDeals || role === "super_admin" || role === "admin" || role === "partner_support";
  const showPayoutsCard = permissions.canEditPayouts;
  const showFeatureCard = role === "super_admin";

  // Build the three reorderable sections as a map so we can render
  // them in whatever order sectionOrder dictates. Quick Links is NOT
  // reorderable — it stays pinned below the rest.
  const sectionRenderers: Record<SectionId, () => JSX.Element> = {
    stats: () => (
      <section
        key="stats"
        draggable={editMode}
        onDragStart={(e) => onSectionDragStart(e, "stats")}
        onDragOver={onSectionDragOver}
        onDrop={(e) => onSectionDrop(e, "stats")}
        className={`mb-6 ${editMode ? "rounded-lg ring-1 ring-brand-gold/25 p-2 cursor-move" : ""}`}
      >
        {editMode && (
          <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">
            ⋮⋮ Stats row — drag to reorder
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {renderStatCards()}
        </div>
      </section>
    ),
    quicklinks: () => (
      <section
        key="quicklinks"
        draggable={editMode}
        onDragStart={(e) => onSectionDragStart(e, "quicklinks")}
        onDragOver={onSectionDragOver}
        onDrop={(e) => onSectionDrop(e, "quicklinks")}
        className={`mb-6 ${editMode ? "rounded-lg ring-1 ring-brand-gold/25 p-2 cursor-move" : ""}`}
      >
        {editMode && (
          <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">
            ⋮⋮ Quick Links — drag to reorder
          </div>
        )}
        <div className="card p-4 sm:p-5">
          <div className="font-body font-semibold text-sm mb-3">Quick Links</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <QuickLink href="/admin/support" label="+ New Ticket" icon="🎫" />
            <QuickLink href="/admin/communications" label="Send SMS" icon="💬" />
            <QuickLink href="/admin/communications" label="Send Email" icon="📧" />
            <CopyLinkButton url="https://fintella.partners" label="Copy Landing Link" icon="🔗" />
            <QuickLink href="/admin/applications" label="Partner Leads" icon="📩" />
            <QuickLink href="/admin/partners" label="+ Invite Partner" icon="👥" />
            {showPayoutsCard && <QuickLink href="/admin/payouts" label="Run Payout Batch" icon="💰" />}
            <QuickLink href="/admin/conference" label="+ Live Weekly" icon="📹" />
          </div>
        </div>
      </section>
    ),
    calendar: () => (
      <section
        key="calendar"
        draggable={editMode}
        onDragStart={(e) => onSectionDragStart(e, "calendar")}
        onDragOver={onSectionDragOver}
        onDrop={(e) => onSectionDrop(e, "calendar")}
        className={`mb-6 ${editMode ? "rounded-lg ring-1 ring-brand-gold/25 p-2 cursor-move" : ""}`}
      >
        {editMode && (
          <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">
            ⋮⋮ Calendar — drag to reorder
          </div>
        )}
        <CalendarEmbed />
      </section>
    ),
    tasks_activity: () => (
      <section
        key="tasks_activity"
        draggable={editMode}
        onDragStart={(e) => onSectionDragStart(e, "tasks_activity")}
        onDragOver={onSectionDragOver}
        onDrop={(e) => onSectionDrop(e, "tasks_activity")}
        className={`mb-6 ${editMode ? "rounded-lg ring-1 ring-brand-gold/25 p-2 cursor-move" : ""}`}
      >
        {editMode && (
          <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">
            ⋮⋮ Tasks + Activity — drag to reorder
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>{renderTasksFeed()}</div>
          <div><ActivityTimeline refreshKey={lastRefreshed?.getTime() || 0} /></div>
        </div>
      </section>
    ),
    communications: () => (
      <section
        key="communications"
        draggable={editMode}
        onDragStart={(e) => onSectionDragStart(e, "communications")}
        onDragOver={onSectionDragOver}
        onDrop={(e) => onSectionDrop(e, "communications")}
        className={`mb-6 ${editMode ? "rounded-lg ring-1 ring-brand-gold/25 p-2 cursor-move" : ""}`}
      >
        {editMode && (
          <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">
            ⋮⋮ Communications Hub — drag to reorder
          </div>
        )}
        <CommunicationsWidget refreshKey={lastRefreshed?.getTime() || 0} />
      </section>
    ),
    needs_attention: () => (
      <section
        key="needs_attention"
        draggable={editMode}
        onDragStart={(e) => onSectionDragStart(e, "needs_attention")}
        onDragOver={onSectionDragOver}
        onDrop={(e) => onSectionDrop(e, "needs_attention")}
        className={`mb-6 ${editMode ? "rounded-lg ring-1 ring-brand-gold/25 p-2 cursor-move" : ""}`}
      >
        {editMode && (
          <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">
            ⋮⋮ Needs Attention — drag to reorder
          </div>
        )}
        {renderNeedsAttention()}
      </section>
    ),
  };

  function renderStatCards() {
    return (
      <>
        {showMessagingCard && (
          <WorkspaceStatCard
            label="Unread Messages"
            value={loading ? "—" : stats.unreadMessages.toLocaleString()}
            sub="Email + SMS + Live Chat"
            href="/admin/communications"
          />
        )}
        <WorkspaceStatCard
          label="Open Tickets"
          value={loading ? "—" : stats.openTickets.toLocaleString()}
          sub="Support queue"
          href="/admin/support"
        />
        {showPayoutsCard && (
          <WorkspaceStatCard
            label="Payouts Due"
            value={loading ? "—" : fmt$(stats.pendingPayouts.amount)}
            sub={`${stats.pendingPayouts.count} row${stats.pendingPayouts.count === 1 ? "" : "s"} ready to batch`}
            href="/admin/payouts"
          />
        )}
        <WorkspaceStatCard
          label="Unsigned Agreements"
          value={loading ? "—" : stats.unsignedAgreements.toLocaleString()}
          sub="Partners need to sign"
          href="/admin/partners"
        />
        <WorkspaceStatCard
          label="Pending Signups"
          value={loading ? "—" : stats.pendingPartners.toLocaleString()}
          sub={loading ? "Awaiting activation" : `Awaiting activation · ${stats.openInvites} open invite${stats.openInvites === 1 ? "" : "s"}`}
          href="/admin/partners"
        />
        {showFeatureCard && (
          <WorkspaceStatCard
            label="Feature Requests"
            value={loading ? "—" : stats.featureRequests.toLocaleString()}
            sub="Submitted"
            href="/admin/features"
          />
        )}
      </>
    );
  }

  function renderTasksFeed() {
    return (
      <div className="card">
        <div className="px-4 sm:px-5 pt-4 pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="font-body font-semibold text-sm">Admin Tasks</div>
            <div className="font-body text-[11px] theme-text-faint">
              {taskItems.length} task{taskItems.length === 1 ? "" : "s"} today
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {TASK_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTaskFilter(t.id)}
                className={`font-body text-[12px] font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
                  taskFilter === t.id
                    ? "bg-brand-gold/15 text-brand-gold"
                    : "theme-text-muted hover:text-[var(--app-text)] hover:bg-[var(--app-card-bg)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="border-t border-[var(--app-border)]">
          {loading ? (
            <div className="px-5 py-8 text-center font-body text-sm theme-text-muted">Scanning…</div>
          ) : taskItems.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <div className="font-body text-sm theme-text-muted">✅ All clear — no tasks right now.</div>
            </div>
          ) : (
            taskItems.map((item) => (
              <AttentionFeedRow key={item.id} item={item} onSelectPartner={openPartnerDrawer} />
            ))
          )}
        </div>
      </div>
    );
  }

  function renderNeedsAttention() {
    return (
      <div className="card">
        <div className="px-4 sm:px-5 pt-4 pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="font-body font-semibold text-sm">Needs Attention</div>
            <div className="font-body text-[11px] theme-text-faint">
              {attentionItems.length} item{attentionItems.length === 1 ? "" : "s"} · oldest first
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {ATTENTION_TABS.filter((t) => {
              if (t.id === "payouts") return showPayoutsCard;
              if (t.id === "messages") return showMessagingCard;
              return true;
            }).map((t) => (
              <button
                key={t.id}
                onClick={() => setAttentionFilter(t.id)}
                className={`font-body text-[12px] font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
                  attentionFilter === t.id
                    ? "bg-brand-gold/15 text-brand-gold"
                    : "theme-text-muted hover:text-[var(--app-text)] hover:bg-[var(--app-card-bg)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="border-t border-[var(--app-border)]">
          {loading ? (
            <div className="px-5 py-8 text-center font-body text-sm theme-text-muted">Scanning…</div>
          ) : attentionItems.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <div className="font-body text-sm theme-text-muted">🎉 Nothing needs attention.</div>
            </div>
          ) : (
            attentionItems.map((item) => (
              <AttentionFeedRow key={item.id} item={item} onSelectPartner={openPartnerDrawer} />
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-[22px] font-bold mb-1">
            Workspace
          </h2>
          <p className="font-body text-[13px] text-[var(--app-text-muted)]">
            {adminName ? `Welcome back, ${adminName}. ` : ""}Everything that needs your attention, in one place.
            {lastRefreshed && (
              <span className="theme-text-faint"> · Refreshed {lastRefreshed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
            )}
          </p>
        </div>
        <button
          onClick={() => setEditMode((v) => !v)}
          className={`font-body text-[12px] px-3 py-2 rounded-lg border transition-colors ${
            editMode
              ? "bg-brand-gold text-black border-brand-gold font-semibold"
              : "border-[var(--app-border)] theme-text-secondary hover:bg-brand-gold/10 hover:border-brand-gold/40"
          }`}
          title="Drag to reorder sections — saved per admin via localStorage"
        >
          {editMode ? "✓ Done editing" : "✎ Edit layout"}
        </button>
      </div>

      {/* Render reorderable sections in the admin's chosen order */}
      {sectionOrder.map((id) => sectionRenderers[id]())}

      {/* Right-rail partner context drawer */}
      <PartnerContextDrawer
        open={drawerOpen}
        partnerCode={drawerPartnerCode}
        onClose={closeDrawer}
      />
    </div>
  );
}

function QuickLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 py-3 rounded-lg border border-[var(--app-border)] hover:border-brand-gold/40 hover:bg-brand-gold/5 transition-colors"
    >
      <span className="text-base" aria-hidden>{icon}</span>
      <span className="font-body text-[12px] text-[var(--app-text-secondary)] truncate">{label}</span>
    </Link>
  );
}

function CopyLinkButton({ url, label, icon }: { url: string; label: string; icon: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-2 px-3 py-3 rounded-lg border border-[var(--app-border)] hover:border-brand-gold/40 hover:bg-brand-gold/5 transition-colors"
    >
      <span className="text-base" aria-hidden>{icon}</span>
      <span className="font-body text-[12px] text-[var(--app-text-secondary)] truncate">
        {copied ? "Copied!" : label}
      </span>
    </button>
  );
}
