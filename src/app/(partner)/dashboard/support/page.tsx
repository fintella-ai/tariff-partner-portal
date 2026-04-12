"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useDevice } from "@/lib/useDevice";
import { FIRM_PHONE, TICKET_CATEGORIES } from "@/lib/constants";

type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

interface Ticket {
  id: string;
  subject: string;
  category: string;
  status: TicketStatus;
  createdAt: string;
  lastReply: string;
  messages: number;
}

interface TicketDetail {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  messages: { id: string; authorType: string; authorId: string; content: string; createdAt: string }[];
}

const STATUS_STYLES: Record<TicketStatus, { bg: string; text: string; label: string }> = {
  open: { bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-400", label: "Open" },
  in_progress: { bg: "bg-yellow-500/10 border-yellow-500/20", text: "text-yellow-400", label: "In Progress" },
  resolved: { bg: "bg-green-500/10 border-green-500/20", text: "text-green-400", label: "Resolved" },
  closed: { bg: "bg-[var(--app-input-bg)] border-[var(--app-border)]", text: "text-[var(--app-text-muted)]", label: "Closed" },
};

export default function SupportPage() {
  const { data: session } = useSession();
  const device = useDevice();
  const [view, setView] = useState<"list" | "new" | "detail">("list");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  // New ticket form
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Detail view
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);

  const fetchTickets = useCallback(() => {
    fetch("/api/tickets")
      .then((r) => r.json())
      .then((data) => setTickets(data.tickets || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!subject.trim()) e.subject = "Subject is required";
    if (!category) e.category = "Please select a category";
    if (!message.trim()) e.message = "Please describe your issue";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), category, message: message.trim() }),
      });
      if (res.ok) {
        setSubmitted(true);
        fetchTickets();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setSubject("");
    setCategory("");
    setMessage("");
    setErrors({});
    setSubmitted(false);
    setView("list");
  }

  function openTicket(id: string) {
    setView("detail");
    setDetailLoading(true);
    setReplyText("");
    fetch(`/api/tickets/${id}/messages`)
      .then((r) => r.json())
      .then((data) => setDetail(data.ticket))
      .catch(console.error)
      .finally(() => setDetailLoading(false));
  }

  async function handleReply() {
    if (!replyText.trim() || !detail) return;
    setReplying(true);
    try {
      await fetch(`/api/tickets/${detail.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyText.trim() }),
      });
      setReplyText("");
      // Refresh
      const r = await fetch(`/api/tickets/${detail.id}/messages`);
      const data = await r.json();
      setDetail(data.ticket);
      fetchTickets();
    } catch (e) {
      console.error(e);
    } finally {
      setReplying(false);
    }
  }

  const inputClass = "w-full bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-4 py-3 text-[var(--app-text)] font-body text-sm outline-none focus:border-brand-gold/40 transition-colors placeholder:text-[var(--app-text-muted)]";
  const labelClass = "font-body text-[11px] tracking-[1px] uppercase text-[var(--app-text-secondary)] mb-2 block";

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className={`font-display ${device.isMobile ? "text-lg" : "text-[22px]"} font-bold mb-1.5`}>
            Support Center
          </h2>
          <p className="font-body text-[13px] text-[var(--app-text-muted)]">
            Submit tickets, ask questions, or report issues. Call {FIRM_PHONE} for urgent help.
          </p>
        </div>
        {view === "list" && (
          <button
            onClick={() => setView("new")}
            className="btn-gold text-[12px] px-4 py-2.5 shrink-0"
          >
            + New Ticket
          </button>
        )}
      </div>

      {/* ═══ DETAIL VIEW ═══ */}
      {view === "detail" && (
        <>
          <button
            onClick={() => { setView("list"); setDetail(null); }}
            className="font-body text-[11px] text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] transition-colors mb-4 inline-block"
          >
            ← Back to Tickets
          </button>

          {detailLoading ? (
            <div className="card p-8 animate-pulse">
              <div className="h-5 w-48 bg-[var(--app-border)] rounded mb-4" />
              <div className="h-20 w-full bg-[var(--app-border)] rounded" />
            </div>
          ) : detail ? (
            <>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-display text-lg font-bold mb-1">{detail.subject}</h3>
                  <div className="flex gap-2 text-xs text-[var(--app-text-muted)]">
                    <span>{detail.category}</span>
                    <span>&middot;</span>
                    <span>{STATUS_STYLES[detail.status as TicketStatus]?.label || detail.status}</span>
                  </div>
                </div>
                <span className={`${STATUS_STYLES[detail.status as TicketStatus]?.bg || ""} ${STATUS_STYLES[detail.status as TicketStatus]?.text || ""} border rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase`}>
                  {STATUS_STYLES[detail.status as TicketStatus]?.label || detail.status}
                </span>
              </div>

              <div className="card mb-4">
                <div className="px-4 sm:px-6 py-3 border-b border-[var(--app-border)]">
                  <div className="font-body font-semibold text-sm">Messages ({detail.messages.length})</div>
                </div>
                <div className="divide-y divide-[var(--app-border)]">
                  {detail.messages.map((msg) => (
                    <div key={msg.id} className="px-4 sm:px-6 py-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`font-body text-xs font-semibold ${msg.authorType === "admin" ? "text-brand-gold" : "text-blue-400"}`}>
                          {msg.authorType === "admin" ? "Support Team" : "You"}
                        </span>
                        <span className="font-body text-[10px] text-[var(--app-text-faint)]">
                          {new Date(msg.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </span>
                      </div>
                      <div className="font-body text-sm text-[var(--app-text-secondary)] whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  ))}
                </div>
              </div>

              {detail.status !== "closed" && (
                <div className="card p-4">
                  <textarea
                    className={`${inputClass} min-h-[80px] resize-y mb-3`}
                    placeholder="Type your reply..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                  />
                  <button
                    onClick={handleReply}
                    disabled={!replyText.trim() || replying}
                    className="btn-gold text-sm px-6 py-2 disabled:opacity-50"
                  >
                    {replying ? "Sending..." : "Send Reply"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="card p-8 text-center">
              <div className="font-body text-sm text-[var(--app-text-muted)]">Ticket not found.</div>
            </div>
          )}
        </>
      )}

      {/* ═══ NEW TICKET FORM ═══ */}
      {view === "new" && !submitted && (
        <div className={`card ${device.cardPadding}`}>
          <div className="flex items-center justify-between mb-5">
            <div className="font-body font-semibold text-sm">Submit a Support Ticket</div>
            <button onClick={() => setView("list")} className="font-body text-[11px] text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] transition-colors">
              ← Back to Tickets
            </button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className={`grid ${device.isMobile ? "grid-cols-1" : "grid-cols-2"} gap-4 mb-4`}>
              <div>
                <label className={labelClass}>Subject *</label>
                <input
                  className={inputClass}
                  placeholder="Brief description of your issue"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
                {errors.subject && <div className="font-body text-[11px] text-red-400 mt-1">{errors.subject}</div>}
              </div>
              <div>
                <label className={labelClass}>Category *</label>
                <select
                  className={inputClass}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">Select a category...</option>
                  {TICKET_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                {errors.category && <div className="font-body text-[11px] text-red-400 mt-1">{errors.category}</div>}
              </div>
            </div>
            <div className="mb-5">
              <label className={labelClass}>Describe your issue *</label>
              <textarea
                className={`${inputClass} min-h-[140px] resize-y`}
                placeholder="Please provide as much detail as possible..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              {errors.message && <div className="font-body text-[11px] text-red-400 mt-1">{errors.message}</div>}
            </div>
            <button type="submit" disabled={submitting} className="btn-gold w-full">
              {submitting ? "Submitting..." : "Submit Ticket"}
            </button>
          </form>
        </div>
      )}

      {/* ═══ TICKET SUBMITTED ═══ */}
      {view === "new" && submitted && (
        <div className={`card ${device.cardPadding} text-center py-12`}>
          <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/25 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">&#10003;</span>
          </div>
          <div className="font-display text-xl font-bold text-[var(--app-text)] mb-2">Ticket Submitted</div>
          <p className="font-body text-[13px] text-[var(--app-text-secondary)] mb-6 max-w-md mx-auto">
            Our support team will review your ticket and respond shortly. You&apos;ll receive a notification when there&apos;s a reply.
          </p>
          <button onClick={resetForm} className="btn-gold text-[12px] px-6 py-2.5">
            Back to Tickets
          </button>
        </div>
      )}

      {/* ═══ TICKET LIST ═══ */}
      {view === "list" && (
        <div className="card">
          <div className="px-4 sm:px-6 py-4 border-b border-[var(--app-border)]">
            <div className="font-body font-semibold text-sm">Your Tickets ({tickets.length})</div>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <div className="font-body text-sm text-[var(--app-text-muted)]">Loading tickets...</div>
            </div>
          ) : tickets.length === 0 ? (
            <div className="p-12 text-center">
              <div className="font-body text-sm text-[var(--app-text-muted)] mb-3">No support tickets yet.</div>
              <button onClick={() => setView("new")} className="font-body text-[12px] text-brand-gold hover:text-brand-gold/80 transition-colors">
                Submit your first ticket &rarr;
              </button>
            </div>
          ) : device.isMobile ? (
            <div>
              {tickets.map((t) => {
                const s = STATUS_STYLES[t.status];
                return (
                  <div key={t.id} className="px-4 py-4 border-b border-[var(--app-border)] last:border-b-0 cursor-pointer" onClick={() => openTicket(t.id)}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="font-body text-[13px] font-medium text-[var(--app-text)] leading-snug flex-1">
                        {t.subject}
                      </div>
                      <span className={`${s.bg} ${s.text} border rounded-full px-2 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase shrink-0`}>
                        {s.label}
                      </span>
                    </div>
                    <div className="font-body text-[11px] text-[var(--app-text-muted)] mb-1">{t.category}</div>
                    <div className="flex justify-between items-center">
                      <div className="font-body text-[10px] text-[var(--app-text-faint)]">
                        Opened {new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} &middot; {t.messages} messages
                      </div>
                      <span className="font-body text-[11px] text-brand-gold/70">View &rarr;</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-[2fr_1fr_0.8fr_0.8fr_0.5fr] gap-4 px-6 py-3 border-b border-[var(--app-border)]">
                <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">Subject</div>
                <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">Category</div>
                <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">Status</div>
                <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">Last Activity</div>
                <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)] text-right">Action</div>
              </div>
              {tickets.map((t) => {
                const s = STATUS_STYLES[t.status];
                return (
                  <div key={t.id} className="grid grid-cols-[2fr_1fr_0.8fr_0.8fr_0.5fr] gap-4 px-6 py-4 border-b border-[var(--app-border)] last:border-b-0 items-center hover:bg-[var(--app-card-bg)] transition-colors cursor-pointer" onClick={() => openTicket(t.id)}>
                    <div>
                      <div className="font-body text-[13px] text-[var(--app-text)] truncate">{t.subject}</div>
                      <div className="font-body text-[10px] text-[var(--app-text-faint)] mt-0.5">{t.messages} messages</div>
                    </div>
                    <div className="font-body text-[12px] text-[var(--app-text-secondary)]">{t.category}</div>
                    <div>
                      <span className={`${s.bg} ${s.text} border rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase`}>
                        {s.label}
                      </span>
                    </div>
                    <div className="font-body text-[12px] text-[var(--app-text-muted)]">
                      {new Date(t.lastReply).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                    <div className="text-right">
                      <span className="font-body text-[11px] text-brand-gold/70 hover:text-brand-gold transition-colors">
                        View &rarr;
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
