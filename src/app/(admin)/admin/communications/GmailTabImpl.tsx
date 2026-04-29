"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { fmtDateTime } from "@/lib/format";

interface GmailMsg {
  id: string;
  threadId: string;
  from: string;
  fromEmail: string;
  to: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
  hasAttachments: boolean;
}

interface GmailFull extends GmailMsg {
  body: string;
  htmlBody: string | null;
  cc: string;
  replyTo: string;
  messageId: string;
}

const ALIASES = [
  { key: "all",      label: "All Mail",  email: "" },
  { key: "admin",    label: "Admin",     email: "admin@fintella.partners" },
  { key: "support",  label: "Support",   email: "support@fintella.partners" },
  { key: "outreach", label: "Outreach",  email: "outreach@fintella.partners" },
  { key: "noreply",  label: "No-Reply",  email: "noreply@fintella.partners" },
  { key: "john",     label: "John",      email: "john@fintella.partners" },
  { key: "partners", label: "Partners",  email: "partners@fintella.partners" },
];

const SEND_FROM = ALIASES.filter((a) => a.email);

export default function GmailTabImpl() {
  const [alias, setAlias] = useState("all");
  const [search, setSearch] = useState("");
  const [messages, setMessages] = useState<GmailMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextPage, setNextPage] = useState<string | undefined>();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  // Thread/message viewer
  const [viewThread, setViewThread] = useState<GmailFull[] | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  // Reply
  const [replyBody, setReplyBody] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replySuccess, setReplySuccess] = useState(false);

  // Compose
  const [composing, setComposing] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeFrom, setComposeFrom] = useState("admin@fintella.partners");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  const loadMessages = useCallback(async (pageToken?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ alias, maxResults: "30" });
      if (search) params.set("q", search);
      if (pageToken) params.set("pageToken", pageToken);

      const res = await fetch(`/api/admin/gmail?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load");
        return;
      }

      if (pageToken) {
        setMessages((prev) => [...prev, ...(data.messages || [])]);
      } else {
        setMessages(data.messages || []);
      }
      setNextPage(data.nextPageToken);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [alias, search]);

  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/gmail?countOnly=true");
      if (res.ok) {
        const data = await res.json();
        setCounts(data.counts || {});
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadMessages();
    loadCounts();
  }, [loadMessages, loadCounts]);

  const openThread = async (msg: GmailMsg) => {
    setViewLoading(true);
    setViewThread(null);
    setReplyBody("");
    setReplyError(null);
    setReplySuccess(false);
    try {
      const res = await fetch(`/api/admin/gmail/${msg.threadId}?thread=true`);
      if (res.ok) {
        const data = await res.json();
        setViewThread(data.thread || []);
      }
    } catch {}
    setViewLoading(false);
  };

  const sendReply = async () => {
    if (!viewThread?.length || !replyBody.trim()) return;
    const last = viewThread[viewThread.length - 1];
    setReplySending(true);
    setReplyError(null);
    try {
      const replyTo = last.replyTo || last.fromEmail;
      const res = await fetch("/api/admin/gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: replyTo,
          subject: last.subject.startsWith("Re:") ? last.subject : `Re: ${last.subject}`,
          body: replyBody,
          inReplyTo: last.messageId,
          threadId: last.threadId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReplyError(data.error || "Send failed");
      } else {
        setReplyBody("");
        setReplySuccess(true);
        setTimeout(() => setReplySuccess(false), 3000);
      }
    } catch {
      setReplyError("Network error");
    } finally {
      setReplySending(false);
    }
  };

  const sendCompose = async () => {
    if (!composeTo || !composeSubject || !composeBody) return;
    setComposeSending(true);
    setComposeError(null);
    try {
      const res = await fetch("/api/admin/gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: composeTo,
          from: composeFrom,
          subject: composeSubject,
          body: composeBody,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setComposeError(data.error || "Send failed");
      } else {
        setComposing(false);
        setComposeTo("");
        setComposeSubject("");
        setComposeBody("");
        loadMessages();
      }
    } catch {
      setComposeError("Network error");
    } finally {
      setComposeSending(false);
    }
  };

  return (
    <>
      {/* Alias filter pills */}
      <div className="flex gap-2 mb-3 overflow-x-auto">
        {ALIASES.map((a) => (
          <button
            key={a.key}
            onClick={() => setAlias(a.key)}
            className={`font-body text-left px-3 py-1.5 rounded-xl whitespace-nowrap transition-colors shrink-0 border ${
              alias === a.key
                ? "bg-brand-gold/15 text-brand-gold border-brand-gold/40"
                : "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] border-[var(--app-border)] hover:border-brand-gold/30"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold">{a.label}</span>
              {a.key !== "all" && (counts[a.key] || 0) > 0 && (
                <span className="inline-block bg-brand-gold text-black text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {counts[a.key]}
                </span>
              )}
            </div>
            {a.email && (
              <div className="text-[10px] opacity-60 font-mono leading-tight mt-0.5">{a.email}</div>
            )}
          </button>
        ))}
      </div>

      {/* Search + Compose */}
      <div className="flex gap-2 mb-4">
        <form
          onSubmit={(e) => { e.preventDefault(); loadMessages(); }}
          className="flex-1 flex gap-2"
        >
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Gmail..."
            className="flex-1 bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2 font-body text-sm text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/40"
          />
          <button
            type="submit"
            className="font-body text-sm px-4 py-2 rounded-lg bg-brand-gold/20 text-brand-gold hover:bg-brand-gold/30 transition"
          >
            Search
          </button>
        </form>
        <button
          onClick={() => { setComposing(true); setComposeError(null); }}
          className="btn-gold text-sm px-4 py-2"
        >
          Compose
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 font-body text-sm">
          {error}
        </div>
      )}

      {/* Message list */}
      <div className="card overflow-hidden">
        {messages.map((msg) => (
          <div
            key={msg.id}
            onClick={() => openThread(msg)}
            className={`flex items-start gap-3 px-4 py-3 border-b border-[var(--app-border-subtle)] hover:bg-[var(--app-hover)] transition cursor-pointer ${
              msg.unread ? "border-l-2 border-l-brand-gold" : ""
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`font-body text-sm truncate ${msg.unread ? "font-semibold text-[var(--app-text)]" : "text-[var(--app-text-secondary)]"}`}>
                  {msg.from.split("<")[0].trim() || msg.fromEmail}
                </span>
                <span className="font-body text-[10px] text-[var(--app-text-muted)] whitespace-nowrap">
                  {fmtDateTime(msg.date)}
                </span>
                {msg.hasAttachments && (
                  <span className="text-[10px]" title="Has attachments">📎</span>
                )}
              </div>
              <div className={`font-body text-[13px] truncate ${msg.unread ? "font-medium text-[var(--app-text)]" : "text-[var(--app-text-secondary)]"}`}>
                {msg.subject || "(no subject)"}
              </div>
              <div className="font-body text-xs text-[var(--app-text-muted)] truncate mt-0.5">
                {msg.snippet}
              </div>
            </div>
          </div>
        ))}

        {messages.length === 0 && !loading && (
          <div className="text-center py-12 font-body text-sm text-[var(--app-text-muted)]">
            {error ? "Could not load Gmail." : "No messages found."}
          </div>
        )}

        {loading && (
          <div className="text-center py-8 font-body text-sm text-[var(--app-text-muted)]">
            Loading...
          </div>
        )}

        {nextPage && !loading && (
          <button
            onClick={() => loadMessages(nextPage)}
            className="w-full py-3 text-center font-body text-sm text-brand-gold hover:bg-brand-gold/10 transition"
          >
            Load more
          </button>
        )}
      </div>

      {/* Thread viewer modal */}
      {(viewThread || viewLoading) && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => { setViewThread(null); setViewLoading(false); }}
        >
          <div
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 rounded-xl border border-[var(--app-border)] shadow-2xl"
            style={{ backgroundColor: "var(--app-bg-secondary)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {viewLoading ? (
              <div className="text-center py-12 font-body text-sm text-[var(--app-text-muted)]">Loading thread...</div>
            ) : viewThread && viewThread.length > 0 ? (
              <>
                <div className="flex items-start justify-between mb-4">
                  <div className="font-display text-lg font-bold">{viewThread[0].subject}</div>
                  <button
                    onClick={() => setViewThread(null)}
                    className="text-[var(--app-text-muted)] hover:text-[var(--app-text)] text-xl leading-none ml-3"
                  >
                    &times;
                  </button>
                </div>

                <div className="space-y-4 mb-6">
                  {viewThread.map((msg, i) => (
                    <div key={msg.id} className={`rounded-lg border border-[var(--app-border)] p-4 ${i === viewThread.length - 1 ? "bg-[var(--app-card-bg)]" : ""}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-body text-sm font-medium">{msg.from}</div>
                          <div className="font-body text-xs text-[var(--app-text-muted)]">
                            To: {msg.to}{msg.cc ? ` · Cc: ${msg.cc}` : ""}
                          </div>
                        </div>
                        <span className="font-body text-[10px] text-[var(--app-text-muted)] whitespace-nowrap">
                          {fmtDateTime(msg.date)}
                        </span>
                      </div>
                      {msg.htmlBody ? (
                        <iframe
                          srcDoc={msg.htmlBody}
                          sandbox=""
                          className="w-full max-h-96 border-0 rounded bg-white"
                          style={{ minHeight: 200 }}
                          title="Email content"
                        />
                      ) : (
                        <div className="font-body text-sm text-[var(--app-text-secondary)] whitespace-pre-wrap max-h-96 overflow-y-auto">
                          {msg.body || "(no body)"}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Reply area */}
                <div className="border-t border-[var(--app-border)] pt-4">
                  <label className="block font-body text-xs text-[var(--app-text-muted)] mb-2">Reply</label>
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    rows={5}
                    placeholder="Type your reply..."
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] font-body text-sm placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50 resize-y"
                  />
                  {replyError && <div className="text-xs text-red-400 mt-2">{replyError}</div>}
                  {replySuccess && <div className="text-xs text-green-400 mt-2">Reply sent!</div>}
                  <div className="flex justify-end gap-2 mt-3">
                    <button
                      onClick={() => setViewThread(null)}
                      className="text-sm px-4 py-2 rounded bg-[var(--app-input-bg)] text-[var(--app-text-secondary)]"
                    >
                      Close
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
              </>
            ) : (
              <div className="text-center py-12 font-body text-sm text-[var(--app-text-muted)]">No messages in thread.</div>
            )}
          </div>
        </div>
      )}

      {/* Compose modal */}
      {composing && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setComposing(false)}
        >
          <div
            className="w-full max-w-2xl p-6 rounded-xl border border-[var(--app-border)] shadow-2xl"
            style={{ backgroundColor: "var(--app-bg-secondary)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="font-display text-lg font-bold">New Email</div>
              <button
                onClick={() => setComposing(false)}
                className="text-[var(--app-text-muted)] hover:text-[var(--app-text)] text-xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="font-body text-xs text-[var(--app-text-muted)] mb-1 block">From</label>
                <select
                  value={composeFrom}
                  onChange={(e) => setComposeFrom(e.target.value)}
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2 font-body text-sm text-[var(--app-text)]"
                >
                  {SEND_FROM.map((a) => (
                    <option key={a.key} value={a.email}>{a.label} — {a.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-body text-xs text-[var(--app-text-muted)] mb-1 block">To</label>
                <input
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="recipient@example.com"
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2 font-body text-sm text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50"
                />
              </div>
              <div>
                <label className="font-body text-xs text-[var(--app-text-muted)] mb-1 block">Subject</label>
                <input
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Subject"
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2 font-body text-sm text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50"
                />
              </div>
              <div>
                <label className="font-body text-xs text-[var(--app-text-muted)] mb-1 block">Message</label>
                <textarea
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  rows={8}
                  placeholder="Type your message..."
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] font-body text-sm placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50 resize-y"
                />
              </div>
            </div>

            {composeError && <div className="text-xs text-red-400 mt-2">{composeError}</div>}

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setComposing(false)}
                className="text-sm px-4 py-2 rounded bg-[var(--app-input-bg)] text-[var(--app-text-secondary)]"
              >
                Cancel
              </button>
              <button
                onClick={sendCompose}
                disabled={!composeTo || !composeSubject || !composeBody || composeSending}
                className="btn-gold text-sm px-4 py-2 disabled:opacity-50"
              >
                {composeSending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
