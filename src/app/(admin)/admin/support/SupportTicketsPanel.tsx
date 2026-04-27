"use client";

import { useState, useEffect, useCallback } from "react";
import PartnerLink from "@/components/ui/PartnerLink";
import { fmtDateTime } from "@/lib/format";
import { useResizableColumns } from "@/components/ui/ResizableTable";

type Ticket = {
  id: string;
  partnerId: string | null;
  partnerName: string;
  partnerCode: string;
  companyName: string | null;
  subject: string;
  category: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  createdAt: string;
  lastReply: string;
  messageCount: number;
};

type TicketDetail = {
  id: string;
  partnerCode: string;
  partnerName: string;
  partnerEmail: string | null;
  companyName: string | null;
  subject: string;
  category: string;
  status: string;
  priority: string;
  adminNotes: string | null;
  messages: { id: string; authorType: string; authorId: string; content: string; createdAt: string }[];
};

type Stats = { total: number; open: number; inProgress: number; resolved: number };

const tabs = ["All", "Open", "In Progress", "Resolved"] as const;
type Tab = (typeof tabs)[number];

// Transform a support message into React nodes with clickable deal-ID links.
// Partners include a "Deal ID(s): id1, id2, ..." line when they open a ticket
// from the Deal Tracking category (see /dashboard/support). This turns each
// comma-separated id into an <a> that opens /admin/deals?deal=<id> in a new
// tab so the support ticket stays open while you investigate the deal.
function renderSupportMessage(content: string): React.ReactNode {
  const lines = content.split("\n");
  return lines.map((line, i) => {
    const dealMatch = line.match(/^(\s*Deal ID\(s\):\s*)(.*)$/);
    if (dealMatch) {
      const ids = dealMatch[2]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return (
        <span key={i}>
          {dealMatch[1]}
          {ids.map((id, j) => (
            <span key={`${id}-${j}`}>
              <a
                href={`/admin/deals?deal=${encodeURIComponent(id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-gold underline decoration-brand-gold/40 hover:decoration-brand-gold transition-colors"
                title="Open this deal in a new tab"
              >
                {id}
              </a>
              {j < ids.length - 1 ? ", " : ""}
            </span>
          ))}
          {i < lines.length - 1 ? "\n" : ""}
        </span>
      );
    }
    return (
      <span key={i}>
        {line}
        {i < lines.length - 1 ? "\n" : ""}
      </span>
    );
  });
}

const priorityBadge: Record<string, string> = {
  low: "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)]",
  normal: "bg-blue-500/20 text-blue-400",
  high: "bg-orange-500/20 text-orange-400",
  urgent: "bg-red-500/20 text-red-400",
};

const statusBadge: Record<string, string> = {
  open: "bg-blue-500/20 text-blue-400",
  in_progress: "bg-yellow-500/20 text-yellow-400",
  resolved: "bg-green-500/20 text-green-400",
  closed: "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)]",
};

const statusLabel: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

// Ticket list + detail both show full date + time for consistency.
const fmtDate = fmtDateTime;

export default function SupportTicketsPanel() {
  const { columnWidths: ticketColWidths, getResizeHandler: getTicketResizeHandler } = useResizableColumns([200, 150, 120, 100, 100, 150, 80], { storageKey: "support-tickets" });
  const [tab, setTab] = useState<Tab>("All");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, open: 0, inProgress: 0, resolved: 0 });
  const [loading, setLoading] = useState(true);

  // Detail view
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const fetchTickets = useCallback(() => {
    fetch("/api/admin/support")
      .then((r) => r.json())
      .then((data) => {
        setTickets(data.tickets || []);
        setStats(data.stats || { total: 0, open: 0, inProgress: 0, resolved: 0 });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  function openTicket(id: string) {
    setSelectedId(id);
    setDetailLoading(true);
    setReply("");
    fetch(`/api/admin/support/${id}`)
      .then((r) => r.json())
      .then((data) => setDetail(data.ticket))
      .catch(console.error)
      .finally(() => setDetailLoading(false));
  }

  async function handleReply() {
    if (!reply.trim() || !selectedId) return;
    setSending(true);
    try {
      await fetch(`/api/admin/support/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: reply.trim() }),
      });
      setReply("");
      // Refresh detail
      const r = await fetch(`/api/admin/support/${selectedId}`);
      const data = await r.json();
      setDetail(data.ticket);
      fetchTickets();
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  }

  async function updateStatus(status: string) {
    if (!selectedId) return;
    await fetch(`/api/admin/support/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const r = await fetch(`/api/admin/support/${selectedId}`);
    const data = await r.json();
    setDetail(data.ticket);
    fetchTickets();
  }

  const filtered = tickets.filter((t) => {
    if (tab === "All") return true;
    if (tab === "Open") return t.status === "open";
    if (tab === "In Progress") return t.status === "in_progress";
    if (tab === "Resolved") return t.status === "resolved";
    return true;
  });

  // ─── DETAIL VIEW ───────────────────────────────────────────────────
  if (selectedId && detail) {
    return (
      <div>
        <button
          onClick={() => { setSelectedId(null); setDetail(null); }}
          className="font-body text-[12px] text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] transition-colors mb-4 inline-block"
        >
          ← Back to Tickets
        </button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
          <div>
            <h2 className="font-display text-xl font-bold mb-1">{detail.subject}</h2>
            <div className="flex flex-wrap gap-2 text-xs text-[var(--app-text-muted)]">
              <span>{detail.partnerName}</span>
              <span>&middot;</span>
              <span>{detail.partnerCode}</span>
              <span>&middot;</span>
              <span>{detail.category}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <span className={`inline-block text-xs px-2.5 py-1 rounded-full ${priorityBadge[detail.priority]}`}>
              {detail.priority}
            </span>
            <span className={`inline-block text-xs px-2.5 py-1 rounded-full ${statusBadge[detail.status]}`}>
              {statusLabel[detail.status]}
            </span>
          </div>
        </div>

        {/* Status actions */}
        <div className="flex gap-2 mb-6">
          {detail.status !== "resolved" && (
            <button onClick={() => updateStatus("resolved")} className="font-body text-xs px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition">
              Mark Resolved
            </button>
          )}
          {detail.status === "resolved" && (
            <button onClick={() => updateStatus("open")} className="font-body text-xs px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition">
              Reopen
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="card mb-4">
          <div className="px-6 py-4 border-b border-[var(--app-border)]">
            <div className="font-body font-semibold text-sm">Conversation ({detail.messages.length} messages)</div>
          </div>
          <div className="divide-y divide-[var(--app-border)]">
            {detail.messages.map((msg) => (
              <div key={msg.id} className="px-6 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`font-body text-xs font-semibold ${msg.authorType === "admin" ? "text-brand-gold" : "text-blue-400"}`}>
                    {msg.authorType === "admin" ? "Admin" : detail.partnerName}
                  </span>
                  <span className="font-body text-[10px] text-[var(--app-text-faint)]">
                    {fmtDateTime(msg.createdAt)}
                  </span>
                </div>
                <div className="font-body text-sm text-[var(--app-text-secondary)] whitespace-pre-wrap">{renderSupportMessage(msg.content)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Reply */}
        {detail.status !== "resolved" && (
          <div className="card p-4">
            <textarea
              className="w-full bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-4 py-3 text-[var(--app-text)] font-body text-sm outline-none focus:border-brand-gold/40 transition-colors placeholder:text-[var(--app-text-muted)] min-h-[100px] resize-y mb-3"
              placeholder="Type your reply..."
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
            <button
              onClick={handleReply}
              disabled={!reply.trim() || sending}
              className="btn-gold text-sm px-6 py-2 disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send Reply"}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (detailLoading) {
    return (
      <div>
        <h2 className="font-display text-xl font-bold mb-4">Loading ticket...</h2>
        <div className="card p-8 animate-pulse">
          <div className="h-4 w-48 bg-[var(--app-border)] rounded mb-4" />
          <div className="h-20 w-full bg-[var(--app-border)] rounded" />
        </div>
      </div>
    );
  }

  // ─── LIST VIEW ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div>
        <h2 className="font-display text-xl sm:text-2xl font-bold mb-2">Support Tickets</h2>
        <p className="font-body text-sm text-[var(--app-text-muted)] mb-6">Loading tickets...</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card px-4 py-3 animate-pulse">
              <div className="h-3 w-16 bg-[var(--app-border)] rounded mb-2" />
              <div className="h-6 w-10 bg-[var(--app-border)] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-display text-xl sm:text-2xl font-bold mb-2">Support Tickets</h2>
      <p className="font-body text-sm text-[var(--app-text-muted)] mb-6">Manage and respond to partner support tickets.</p>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Tickets", value: stats.total },
          { label: "Open", value: stats.open },
          { label: "In Progress", value: stats.inProgress },
          { label: "Resolved", value: stats.resolved },
        ].map((s) => (
          <div key={s.label} className="card px-4 py-3">
            <div className="font-body text-xs text-[var(--app-text-muted)] mb-1">{s.label}</div>
            <div className="font-display text-xl font-bold text-brand-gold">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`font-body text-sm px-4 py-1.5 rounded-full whitespace-nowrap transition ${
              tab === t
                ? "bg-brand-gold/20 text-brand-gold"
                : "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text-secondary)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="font-body text-sm text-[var(--app-text-muted)]">No {tab === "All" ? "" : tab.toLowerCase()} tickets found.</div>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block card overflow-x-auto">
            <table className="w-full text-left font-body text-sm" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr className="border-b border-[var(--app-border)] text-[var(--app-text-muted)] text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-center" style={{ width: ticketColWidths[0], position: "relative" }}>Subject<span {...getTicketResizeHandler(0)} /></th>
                  <th className="px-4 py-3 text-center" style={{ width: ticketColWidths[1], position: "relative" }}>Partner<span {...getTicketResizeHandler(1)} /></th>
                  <th className="px-4 py-3 text-center" style={{ width: ticketColWidths[2], position: "relative" }}>Category<span {...getTicketResizeHandler(2)} /></th>
                  <th className="px-4 py-3 text-center" style={{ width: ticketColWidths[3], position: "relative" }}>Priority<span {...getTicketResizeHandler(3)} /></th>
                  <th className="px-4 py-3 text-center" style={{ width: ticketColWidths[4], position: "relative" }}>Status<span {...getTicketResizeHandler(4)} /></th>
                  <th className="px-4 py-3 text-center" style={{ width: ticketColWidths[5], position: "relative" }}>Last Activity<span {...getTicketResizeHandler(5)} /></th>
                  <th className="px-4 py-3 text-center" style={{ width: ticketColWidths[6], position: "relative" }}>Action<span {...getTicketResizeHandler(6)} /></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b border-[var(--app-border-subtle)] hover:bg-[var(--app-card-bg)] transition cursor-pointer" onClick={() => openTicket(t.id)}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--app-text)]">{t.subject}</div>
                      <div className="text-xs text-[var(--app-text-muted)]">{t.messageCount} messages</div>
                    </td>
                    <td className="px-4 py-3">
                      <PartnerLink partnerId={t.partnerId} className="text-[var(--app-text)]">{t.partnerName}</PartnerLink>
                      <div className="text-xs text-[var(--app-text-muted)]">{t.partnerCode}</div>
                    </td>
                    <td className="px-4 py-3 text-[var(--app-text-secondary)]">{t.category}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full capitalize ${priorityBadge[t.priority]}`}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${statusBadge[t.status]}`}>
                        {statusLabel[t.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--app-text-secondary)]">{fmtDate(t.lastReply)}</td>
                    <td className="px-4 py-3">
                      <button className="text-xs text-brand-gold hover:underline" onClick={(e) => { e.stopPropagation(); openTicket(t.id); }}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden flex flex-col gap-3">
            {filtered.map((t) => (
              <div key={t.id} className="card p-4 cursor-pointer" onClick={() => openTicket(t.id)}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-body text-sm font-medium text-[var(--app-text)]">{t.subject}</div>
                    <div className="font-body text-xs text-[var(--app-text-muted)] mt-0.5">{t.messageCount} messages</div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize shrink-0 ${priorityBadge[t.priority]}`}>
                    {t.priority}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--app-text-secondary)] mb-3">
                  <PartnerLink partnerId={t.partnerId} className="text-[var(--app-text-secondary)]">{t.partnerName}</PartnerLink>
                  <span>&middot;</span>
                  <span>{t.category}</span>
                  <span>&middot;</span>
                  <span>{fmtDate(t.lastReply)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge[t.status]}`}>
                    {statusLabel[t.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
