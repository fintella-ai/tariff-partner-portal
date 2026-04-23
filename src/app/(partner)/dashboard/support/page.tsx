"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useDevice } from "@/lib/useDevice";
import { SUPPORT_EMAIL, TICKET_CATEGORIES } from "@/lib/constants";
import PageTabBar from "@/components/ui/PageTabBar";

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

  // Deal / partner reference fields
  const [dealIds, setDealIds] = useState<string[]>([""]);
  const [multipleDealIds, setMultipleDealIds] = useState(false);
  const [l2PartnerCode, setL2PartnerCode] = useState("");
  const [l3PartnerCode, setL3PartnerCode] = useState("");
  const [partnerDeals, setPartnerDeals] = useState<any[]>([]);
  const [downlinePartners, setDownlinePartners] = useState<any[]>([]);
  const [l3Partners, setL3Partners] = useState<any[]>([]);
  const [l3Enabled, setL3Enabled] = useState(false);

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

  // Fetch deals and downline for reference fields
  useEffect(() => {
    fetch("/api/deals")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.directDeals) setPartnerDeals(data.directDeals);
        if (data?.downlinePartners) setDownlinePartners(data.downlinePartners);
        // Check if any downline partner has L3 enabled (user is L1 with L3 capability)
        if (data?.l3Partners?.length > 0) {
          setL3Enabled(true);
          setL3Partners(data.l3Partners);
        }
      })
      .catch(() => {});
  }, []);

  // Auto-open new ticket form from URL params (e.g., from Deal Support button)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("newTicket") === "true") {
      setView("new");
      if (params.get("subject")) setSubject(params.get("subject") || "");
      if (params.get("category")) setCategory(params.get("category") || "");
      if (params.get("dealRef")) {
        setMessage(params.get("dealRef") || "");
        // Extract deal ID from dealRef if present
        const dealRefMatch = (params.get("dealRef") || "").match(/ID:\s*([^\]]+)/);
        if (dealRefMatch) setDealIds([dealRefMatch[1].trim()]);
      }
    }
  }, []);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!subject.trim()) e.subject = "Subject is required";
    if (!category) e.category = "Please select a category";
    if (!message.trim()) e.message = "Please describe your issue";
    // Deal tracking requires at least one deal ID
    if (category === "Deal Tracking" && !dealIds.some((id) => id.trim())) {
      e.dealIds = "At least one Deal ID is required for deal tracking issues";
    }
    // Commission Question about downline requires at least one partner code
    if (category === "Commission Question" && downlinePartners.length > 0) {
      // Only require if they have downline (otherwise it's about their own commissions)
    }
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
        body: JSON.stringify({
          subject: subject.trim(),
          category,
          message: [
            message.trim(),
            dealIds.some((id) => id.trim()) ? `\n\nDeal ID(s): ${dealIds.filter((id) => id.trim()).join(", ")}` : "",
            l2PartnerCode ? `\nL2 Partner: ${l2PartnerCode}` : "",
            l3PartnerCode ? `\nL3 Partner: ${l3PartnerCode}` : "",
          ].filter(Boolean).join(""),
        }),
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
    setDealIds([""]);
    setMultipleDealIds(false);
    setL2PartnerCode("");
    setL3PartnerCode("");
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

      <PageTabBar
        title="Partner Support"
        tabs={[
          { label: "PartnerOS AI", href: "/dashboard/ai-assistant" },
          { label: "Support Tickets", href: "/dashboard/support" },
        ]}
      />
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className={`font-display ${device.isMobile ? "text-lg" : "text-[22px]"} font-bold mb-1.5`}>
            Support Center
          </h2>
          <p className="font-body text-[13px] text-[var(--app-text-muted)]">
            Submit a ticket below, start a live chat, or email <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-gold hover:underline">{SUPPORT_EMAIL}</a>.
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
                          {new Date(msg.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
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
            {/* ── Deal ID fields (required for Deal Tracking, optional for Commission Question) ── */}
            {(category === "Deal Tracking" || category === "Commission Question") && (
              <div className="mb-4 p-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-card-bg)]">
                <div className="flex items-center justify-between mb-3">
                  <label className={labelClass} style={{ marginBottom: 0 }}>Deal ID {category === "Deal Tracking" ? "*" : "(optional)"}</label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={multipleDealIds}
                      onChange={(e) => {
                        setMultipleDealIds(e.target.checked);
                        if (!e.target.checked) setDealIds([dealIds[0] || ""]);
                      }}
                      className="w-3.5 h-3.5 rounded accent-brand-gold"
                    />
                    <span className="font-body text-[11px] text-[var(--app-text-muted)]">Multiple deals?</span>
                  </label>
                </div>
                {dealIds.map((id, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <select
                      className={inputClass}
                      value={id}
                      onChange={(e) => {
                        const updated = [...dealIds];
                        updated[idx] = e.target.value;
                        setDealIds(updated);
                      }}
                    >
                      <option value="">Select a deal or paste ID...</option>
                      {partnerDeals.map((d: any) => (
                        <option key={d.id} value={d.id}>{d.dealName} ({d.id.slice(0, 8)}...)</option>
                      ))}
                    </select>
                    {multipleDealIds && dealIds.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setDealIds(dealIds.filter((_, i) => i !== idx))}
                        className="font-body text-xs text-red-400/60 hover:text-red-400 px-2 shrink-0"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                {/* Manual entry fallback */}
                {dealIds.some((id) => !id) && (
                  <input
                    className={`${inputClass} mt-1`}
                    placeholder="Or paste Deal ID manually..."
                    value={dealIds[dealIds.length - 1]}
                    onChange={(e) => {
                      const updated = [...dealIds];
                      updated[updated.length - 1] = e.target.value;
                      setDealIds(updated);
                    }}
                  />
                )}
                {multipleDealIds && (
                  <button
                    type="button"
                    onClick={() => setDealIds([...dealIds, ""])}
                    className="font-body text-[11px] text-brand-gold hover:underline mt-2"
                  >
                    + Add another Deal ID
                  </button>
                )}
                {errors.dealIds && <div className="font-body text-[11px] text-red-400 mt-2">{errors.dealIds}</div>}
              </div>
            )}

            {/* ── Partner ID fields (shown for Commission Question + Deal Tracking when has downline) ── */}
            {(category === "Commission Question" || category === "Deal Tracking") && downlinePartners.length > 0 && (
              <div className="mb-4 p-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-card-bg)]">
                <div className="font-body text-[11px] text-[var(--app-text-muted)] mb-3">
                  {category === "Commission Question" ? "If this is about a downline partner, select them below:" : "Related downline partner (optional):"}
                </div>
                <div className={`grid ${device.isMobile ? "grid-cols-1" : l3Enabled ? "grid-cols-2" : "grid-cols-1"} gap-4`}>
                  <div>
                    <label className={labelClass}>L2 Partner</label>
                    <select
                      className={inputClass}
                      value={l2PartnerCode}
                      onChange={(e) => setL2PartnerCode(e.target.value)}
                    >
                      <option value="">Select L2 partner (optional)...</option>
                      {downlinePartners.map((p: any) => (
                        <option key={p.partnerCode} value={p.partnerCode}>{p.firstName} {p.lastName} ({p.partnerCode})</option>
                      ))}
                    </select>
                  </div>
                  {l3Enabled && (
                    <div>
                      <label className={labelClass}>L3 Partner</label>
                      <select
                        className={inputClass}
                        value={l3PartnerCode}
                        onChange={(e) => setL3PartnerCode(e.target.value)}
                      >
                        <option value="">Select L3 partner (optional)...</option>
                        {l3Partners.map((p: any) => (
                          <option key={p.partnerCode} value={p.partnerCode}>{p.firstName} {p.lastName} ({p.partnerCode})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            )}

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
                        Opened {new Date(t.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} &middot; {t.messages} messages
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
                      {new Date(t.lastReply).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
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
