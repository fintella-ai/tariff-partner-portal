"use client";

import { useState, useEffect, useCallback } from "react";

interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  state: string | null;
  notes: string | null;
}

interface Reply {
  id: string;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  textBody: string;
  read: boolean;
  replied: boolean;
  aiDraft: string | null;
  aiDraftAt: string | null;
  sentReply: string | null;
  sentReplyAt: string | null;
  leadId: string | null;
  campaignId: string | null;
  createdAt: string;
  lead: Lead | null;
}

type Filter = "all" | "unread" | "unreplied" | "replied";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "unreplied", label: "Needs Reply" },
  { id: "replied", label: "Replied" },
];

export default function CampaignRepliesPage() {
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftLoading, setDraftLoading] = useState<string | null>(null);
  const [sendLoading, setSendLoading] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/campaign-replies?filter=${filter}`);
    if (res.ok) {
      const data = await res.json();
      setReplies(data.replies || []);
      setTotal(data.total || 0);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function generateDraft(id: string) {
    setDraftLoading(id);
    const res = await fetch(`/api/admin/campaign-replies/${id}/draft`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setReplies((prev) =>
        prev.map((r) => r.id === id ? { ...r, aiDraft: data.draft, aiDraftAt: new Date().toISOString(), read: true } : r)
      );
      setEditDraft(data.draft);
      setEditingId(id);
    }
    setDraftLoading(null);
  }

  async function sendReply(id: string, text: string) {
    setSendLoading(id);
    const res = await fetch(`/api/admin/campaign-replies/${id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply: text }),
    });
    if (res.ok) {
      setReplies((prev) =>
        prev.map((r) => r.id === id ? { ...r, replied: true, sentReply: text, sentReplyAt: new Date().toISOString() } : r)
      );
      setEditingId(null);
      setSelectedId(null);
    }
    setSendLoading(null);
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  const selected = replies.find((r) => r.id === selectedId);

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-xl font-bold text-[var(--app-text)]">
            Campaign Replies
          </h1>
          <p className="font-body text-[12px] text-[var(--app-text-muted)] mt-1">
            Broker responses to outreach emails — AI-assisted reply drafting
          </p>
        </div>
        <span className="font-body text-[12px] text-[var(--app-text-muted)]">
          {total} total replies
        </span>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 border-b border-[var(--app-border)]">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => { setFilter(f.id); setSelectedId(null); }}
            className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${
              filter === f.id
                ? "text-[var(--brand-gold)] border-[var(--brand-gold)]"
                : "text-[var(--app-text-muted)] border-transparent hover:text-[var(--app-text-secondary)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-[var(--app-card-bg)] rounded-lg animate-pulse" />
          ))}
        </div>
      ) : replies.length === 0 ? (
        <div className="py-16 text-center">
          <div className="text-4xl mb-3">📬</div>
          <p className="font-body text-sm text-[var(--app-text-muted)]">
            No replies yet. Replies from campaign emails will appear here.
          </p>
        </div>
      ) : (
        <div className="flex gap-4">
          {/* Reply list */}
          <div className="w-2/5 space-y-2 max-h-[70vh] overflow-y-auto">
            {replies.map((r) => (
              <button
                key={r.id}
                onClick={() => { setSelectedId(r.id); setEditingId(null); }}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  selectedId === r.id
                    ? "border-[var(--brand-gold)] bg-[var(--brand-gold)]/5"
                    : "border-[var(--app-border)] bg-[var(--app-card-bg)] hover:bg-white/3"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {!r.read && <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />}
                  <span className="font-body text-[13px] font-medium text-[var(--app-text)] truncate">
                    {r.lead ? `${r.lead.firstName} ${r.lead.lastName}` : r.fromName || r.fromEmail}
                  </span>
                  {r.replied && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">Replied</span>}
                  {r.aiDraft && !r.replied && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">AI Draft</span>}
                </div>
                <p className="font-body text-[11px] text-[var(--app-text-muted)] truncate">{r.subject}</p>
                <p className="font-body text-[10px] text-[var(--app-text-muted)] mt-1">{fmtDate(r.createdAt)}</p>
              </button>
            ))}
          </div>

          {/* Reply detail */}
          <div className="w-3/5">
            {selected ? (
              <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-card-bg)] p-5 space-y-4">
                {/* Header */}
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-body text-[14px] font-semibold text-[var(--app-text)]">
                      {selected.lead ? `${selected.lead.firstName} ${selected.lead.lastName}` : selected.fromName || "Unknown"}
                    </h3>
                    <span className="font-body text-[11px] text-[var(--app-text-muted)]">{fmtDate(selected.createdAt)}</span>
                  </div>
                  <p className="font-body text-[11px] text-[var(--app-text-muted)]">{selected.fromEmail}</p>
                  {selected.lead?.state && (
                    <p className="font-body text-[10px] text-[var(--app-text-muted)]">Location: {selected.lead.state}</p>
                  )}
                </div>

                {/* Subject */}
                <div className="border-b border-[var(--app-border)] pb-3">
                  <p className="font-body text-[12px] font-medium text-[var(--app-text)]">{selected.subject}</p>
                </div>

                {/* Body */}
                <div className="bg-white/2 rounded-lg p-4">
                  <p className="font-body text-[13px] text-[var(--app-text)] whitespace-pre-wrap leading-relaxed">
                    {selected.textBody}
                  </p>
                </div>

                {/* Sent reply */}
                {selected.replied && selected.sentReply && (
                  <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-semibold text-green-400 tracking-wider uppercase">Reply Sent</span>
                      {selected.sentReplyAt && (
                        <span className="text-[10px] text-[var(--app-text-muted)]">{fmtDate(selected.sentReplyAt)}</span>
                      )}
                    </div>
                    <p className="font-body text-[12px] text-[var(--app-text)] whitespace-pre-wrap">{selected.sentReply}</p>
                  </div>
                )}

                {/* AI Draft / Actions */}
                {!selected.replied && (
                  <div className="space-y-3">
                    {editingId === selected.id ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-semibold text-purple-400 tracking-wider uppercase">AI Draft — Edit Before Sending</span>
                        </div>
                        <textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          rows={6}
                          className="w-full rounded-lg border p-3 font-body text-[13px] resize-none"
                          style={{
                            background: "var(--app-input-bg)",
                            borderColor: "var(--app-border)",
                            color: "var(--app-text)",
                          }}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => sendReply(selected.id, editDraft)}
                            disabled={sendLoading === selected.id || !editDraft.trim()}
                            className="font-body text-[12px] font-medium px-4 py-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors disabled:opacity-40"
                          >
                            {sendLoading === selected.id ? "Sending..." : "Send Reply"}
                          </button>
                          <button
                            onClick={() => generateDraft(selected.id)}
                            disabled={draftLoading === selected.id}
                            className="font-body text-[12px] font-medium px-4 py-2 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-40"
                          >
                            {draftLoading === selected.id ? "Regenerating..." : "Regenerate"}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="font-body text-[12px] px-3 py-2 rounded-lg text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : selected.aiDraft ? (
                      <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-semibold text-purple-400 tracking-wider uppercase">AI-Generated Draft</span>
                          {selected.aiDraftAt && (
                            <span className="text-[10px] text-[var(--app-text-muted)]">{fmtDate(selected.aiDraftAt)}</span>
                          )}
                        </div>
                        <p className="font-body text-[12px] text-[var(--app-text)] whitespace-pre-wrap mb-3">{selected.aiDraft}</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => sendReply(selected.id, selected.aiDraft!)}
                            disabled={sendLoading === selected.id}
                            className="font-body text-[12px] font-medium px-4 py-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors disabled:opacity-40"
                          >
                            {sendLoading === selected.id ? "Sending..." : "Send As-Is"}
                          </button>
                          <button
                            onClick={() => { setEditDraft(selected.aiDraft!); setEditingId(selected.id); }}
                            className="font-body text-[12px] font-medium px-4 py-2 rounded-lg bg-[var(--brand-gold)]/10 text-[var(--brand-gold)] hover:bg-[var(--brand-gold)]/20 transition-colors"
                          >
                            Edit Draft
                          </button>
                          <button
                            onClick={() => generateDraft(selected.id)}
                            disabled={draftLoading === selected.id}
                            className="font-body text-[12px] px-3 py-2 rounded-lg text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-colors disabled:opacity-40"
                          >
                            {draftLoading === selected.id ? "..." : "Regenerate"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => generateDraft(selected.id)}
                        disabled={draftLoading === selected.id}
                        className="w-full font-body text-[13px] font-medium py-3 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                      >
                        {draftLoading === selected.id ? (
                          <>
                            <span className="w-3 h-3 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                            Generating AI Reply...
                          </>
                        ) : (
                          <>
                            <span>🤖</span>
                            Generate AI Reply
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-card-bg)] p-12 text-center">
                <div className="text-3xl mb-3">📧</div>
                <p className="font-body text-sm text-[var(--app-text-muted)]">
                  Select a reply to view and respond
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
