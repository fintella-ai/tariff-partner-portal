"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtDateTime } from "@/lib/format";
import { useResizableColumns } from "@/components/ui/ResizableTable";
import type { Email } from "./_shared";

const inboxFilters = ["All", "Unread", "Replied"] as const;
type InboxFilter = (typeof inboxFilters)[number];

/**
 * Inbox section of the Communications hub. Owns its own state:
 *   - real inbound emails from SendGrid Inbound Parse (loaded via
 *     /api/admin/inbox)
 *   - filter pills (All / Unread / Replied — server-side filter)
 *   - Reply modal with /api/admin/inbox/reply integration
 *
 * No outer <h2> or pill bar — the host page at `/admin/communications`
 * owns those.
 */
export default function EmailInboxTabImpl() {
  const { columnWidths: inboxColWidths, getResizeHandler: getInboxResizeHandler } =
    useResizableColumns([250, 300, 150, 100, 100], { storageKey: "comms-inbox" });

  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("All");
  const [inboxEmails, setInboxEmails] = useState<Email[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const loadInbox = useCallback(async () => {
    setInboxLoading(true);
    try {
      const res = await fetch(`/api/admin/inbox?filter=${inboxFilter.toLowerCase()}`);
      if (res.ok) {
        const data = await res.json();
        setInboxEmails(data.emails || []);
      }
    } catch {} finally {
      setInboxLoading(false);
    }
  }, [inboxFilter]);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  const openEmail = async (e: Email) => {
    setSelectedEmail(e);
    setReplyBody("");
    setReplyError(null);
    if (!e.read) {
      await fetch("/api/admin/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: e.id, read: true }),
      }).catch(() => {});
      setInboxEmails((prev) => prev.map((x) => (x.id === e.id ? { ...x, read: true } : x)));
    }
  };

  const sendReply = async () => {
    if (!selectedEmail || !replyBody.trim()) return;
    setReplySending(true);
    setReplyError(null);
    try {
      const res = await fetch("/api/admin/inbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inboundEmailId: selectedEmail.id, body: replyBody }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReplyError(data.error || "Failed to send");
        return;
      }
      setInboxEmails((prev) =>
        prev.map((x) => (x.id === selectedEmail.id ? { ...x, replied: true, read: true } : x))
      );
      setSelectedEmail(null);
      setReplyBody("");
    } catch (err: any) {
      setReplyError(err?.message || "Failed to send");
    } finally {
      setReplySending(false);
    }
  };

  /* Filtered inbox (server-side filter is primary, this is a fallback) */
  const filteredEmails = inboxEmails.filter((e) => {
    if (inboxFilter === "All") return true;
    if (inboxFilter === "Unread") return !e.read;
    if (inboxFilter === "Replied") return e.replied;
    return true;
  });

  return (
    <>
      {/* Inbox filters */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {inboxFilters.map((f) => (
          <button
            key={f}
            onClick={() => setInboxFilter(f)}
            className={`font-body text-sm px-4 py-1.5 rounded-full whitespace-nowrap transition ${
              inboxFilter === f
                ? "bg-brand-gold/20 text-brand-gold"
                : "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text-secondary)]"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block card overflow-x-auto">
        <table className="w-full text-left font-body text-sm" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr className="border-b border-[var(--app-border)] text-[var(--app-text-muted)] text-xs uppercase tracking-wider">
              <th className="px-4 py-3 text-center" style={{ width: inboxColWidths[0], position: "relative" }}>Sender<span {...getInboxResizeHandler(0)} /></th>
              <th className="px-4 py-3 text-center" style={{ width: inboxColWidths[1], position: "relative" }}>Subject<span {...getInboxResizeHandler(1)} /></th>
              <th className="px-4 py-3 text-center" style={{ width: inboxColWidths[2], position: "relative" }}>Date<span {...getInboxResizeHandler(2)} /></th>
              <th className="px-4 py-3 text-center" style={{ width: inboxColWidths[3], position: "relative" }}>Status<span {...getInboxResizeHandler(3)} /></th>
              <th className="px-4 py-3 text-center" style={{ width: inboxColWidths[4], position: "relative" }}>Action<span {...getInboxResizeHandler(4)} /></th>
            </tr>
          </thead>
          <tbody>
            {filteredEmails.map((e) => {
              const senderDisplay = e.fromName || e.fromEmail;
              return (
              <tr
                key={e.id}
                onClick={() => openEmail(e)}
                className={`border-b border-[var(--app-border-subtle)] hover:bg-[var(--app-hover)] transition cursor-pointer ${
                  !e.read ? "border-l-2 border-l-brand-gold" : ""
                }`}
              >
                <td className="px-4 py-3">
                  <div className={`font-medium ${!e.read ? "text-[var(--app-text)]" : "text-[var(--app-text-secondary)]"}`}>
                    {senderDisplay}
                  </div>
                  <div className="text-xs text-[var(--app-text-muted)]">{e.fromEmail}</div>
                </td>
                <td className="px-4 py-3">
                  <div className={`font-medium ${!e.read ? "text-[var(--app-text)]" : "text-[var(--app-text-secondary)]"}`}>
                    {e.subject}
                  </div>
                  <div className="text-xs text-[var(--app-text-muted)] truncate max-w-[320px]">
                    {e.textBody.slice(0, 160)}
                  </div>
                </td>
                <td className="px-4 py-3 text-[var(--app-text-secondary)] whitespace-nowrap">
                  {fmtDateTime(e.createdAt)}
                </td>
                <td className="px-4 py-3">
                  {!e.read && (
                    <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-brand-gold/20 text-brand-gold mr-1">
                      Unread
                    </span>
                  )}
                  {e.replied && (
                    <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                      Replied
                    </span>
                  )}
                  {e.read && !e.replied && (
                    <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-[var(--app-input-bg)] text-[var(--app-text-muted)]">
                      Read
                    </span>
                  )}
                  {e.supportTicketId && (
                    <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 ml-1" title="Linked to a support ticket">
                      Ticket
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={(evt) => { evt.stopPropagation(); openEmail(e); }}
                    className="text-xs px-3 py-1 rounded bg-brand-gold/20 text-brand-gold hover:bg-brand-gold/30 transition mr-1"
                  >
                    Reply
                  </button>
                  <button
                    onClick={(evt) => { evt.stopPropagation(); openEmail(e); }}
                    className="text-xs px-3 py-1 rounded bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text-secondary)] transition"
                  >
                    View
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {filteredEmails.length === 0 && (
          <p className="text-center text-[var(--app-text-muted)] font-body text-sm py-8">
            No emails match this filter.
          </p>
        )}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col gap-3">
        {filteredEmails.map((e) => {
          const senderDisplay = e.fromName || e.fromEmail;
          return (
          <div
            key={e.id}
            onClick={() => openEmail(e)}
            className={`card p-4 cursor-pointer ${!e.read ? "border-l-2 border-l-brand-gold" : ""}`}
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className={`font-body text-sm font-medium ${!e.read ? "text-[var(--app-text)]" : "text-[var(--app-text-secondary)]"}`}>
                  {senderDisplay}
                </div>
                <div className="font-body text-xs text-[var(--app-text-muted)]">{e.fromEmail}</div>
              </div>
              <span className="font-body text-xs text-[var(--app-text-muted)] whitespace-nowrap">
                {fmtDateTime(e.createdAt)}
              </span>
            </div>
            <div className={`font-body text-sm font-medium mb-1 ${!e.read ? "text-[var(--app-text)]" : "text-[var(--app-text-secondary)]"}`}>
              {e.subject}
            </div>
            <p className="font-body text-xs text-[var(--app-text-muted)] line-clamp-2 mb-3">
              {e.textBody.slice(0, 160)}
            </p>
            <div className="flex items-center justify-between">
              <div className="flex gap-1 flex-wrap">
                {!e.read && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-brand-gold/20 text-brand-gold">
                    Unread
                  </span>
                )}
                {e.replied && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                    Replied
                  </span>
                )}
                {e.read && !e.replied && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--app-input-bg)] text-[var(--app-text-muted)]">
                    Read
                  </span>
                )}
                {e.supportTicketId && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                    Ticket
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={(evt) => { evt.stopPropagation(); openEmail(e); }}
                  className="text-xs px-3 py-1 rounded bg-brand-gold/20 text-brand-gold hover:bg-brand-gold/30 transition"
                >
                  Reply
                </button>
              </div>
            </div>
          </div>
          );
        })}
        {filteredEmails.length === 0 && (
          <p className="text-center text-[var(--app-text-muted)] font-body text-sm py-8">
            {inboxLoading
              ? "Loading..."
              : "No inbound emails yet. Messages sent to your inbound.fintella.partners addresses will land here."}
          </p>
        )}
      </div>

      {/* Reply modal */}
      {selectedEmail && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setSelectedEmail(null)}
        >
          <div
            className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="font-display text-lg font-bold">{selectedEmail.subject}</div>
                <div className="font-body text-xs text-[var(--app-text-muted)] mt-1">
                  From <span className="text-[var(--app-text-secondary)]">{selectedEmail.fromName || selectedEmail.fromEmail}</span>{" "}
                  &lt;{selectedEmail.fromEmail}&gt; · {fmtDateTime(selectedEmail.createdAt)}
                </div>
                <div className="font-body text-xs text-[var(--app-text-muted)] mt-0.5">
                  To <span className="text-[var(--app-text-secondary)]">{selectedEmail.toEmail}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedEmail(null)}
                className="text-[var(--app-text-muted)] hover:text-[var(--app-text)] text-xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="border-t border-[var(--app-border)] pt-4 mb-4">
              <div className="font-body text-sm text-[var(--app-text-secondary)] whitespace-pre-wrap max-h-72 overflow-y-auto">
                {selectedEmail.textBody || "(no text body)"}
              </div>
            </div>

            {selectedEmail.supportTicketId && (
              <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="font-body text-xs text-blue-400">
                  Linked to support ticket. Replies will also post as an admin
                  message on{" "}
                  <a
                    href={`/admin/support?ticket=${selectedEmail.supportTicketId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    the ticket page
                  </a>
                  .
                </div>
              </div>
            )}

            <div className="border-t border-[var(--app-border)] pt-4">
              <label className="block font-body text-xs text-[var(--app-text-muted)] mb-2">
                Reply
              </label>
              <textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                rows={6}
                placeholder="Type your reply..."
                className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] font-body text-sm placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50 resize-y"
              />
              {replyError && (
                <div className="text-xs text-red-400 mt-2">{replyError}</div>
              )}
              <div className="flex justify-end gap-2 mt-3">
                <button
                  onClick={() => setSelectedEmail(null)}
                  className="text-sm px-4 py-2 rounded bg-[var(--app-input-bg)] text-[var(--app-text-secondary)]"
                >
                  Cancel
                </button>
                <button
                  onClick={sendReply}
                  disabled={!replyBody.trim() || replySending}
                  className="btn-gold text-sm px-4 py-2 disabled:opacity-50"
                >
                  {replySending ? "Sending..." : "Send Reply"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
