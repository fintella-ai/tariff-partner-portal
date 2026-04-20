"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import MentionInput from "@/components/ui/MentionInput";
import { renderAdminChatContent } from "@/lib/renderAdminChatContent";

type Thread = {
  id: string;
  type: string;
  dealId: string | null;
  dealName: string | null;
  lastMessageAt: string;
  unreadCount: number;
  messageCount: number;
};

type Mention = { id: string; messageId: string; mentionedAdminEmail: string };
type Message = {
  id: string;
  threadId: string;
  senderEmail: string;
  senderName: string;
  content: string;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  mentions: Mention[];
};

export default function TeamChatPanel() {
  return (
    <Suspense fallback={<div className="font-body text-sm text-[var(--app-text-muted)]">Loading…</div>}>
      <TeamChatInner />
    </Suspense>
  );
}

function TeamChatInner() {
  const params = useSearchParams();
  const initialThreadId = params?.get("threadId") || null;

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreadId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [dealMap, setDealMap] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  // Load thread list
  const loadThreads = useCallback(async () => {
    const r = await fetch("/api/admin/team-chat/threads");
    if (r.ok) {
      const d = await r.json();
      setThreads(d.threads || []);
      if (!activeThreadId && d.threads?.length) {
        const globalThread = d.threads.find((t: Thread) => t.type === "global");
        setActiveThreadId(globalThread?.id || d.threads[0].id);
      }
    }
  }, [activeThreadId]);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  // Load messages for active thread + connect SSE
  useEffect(() => {
    if (!activeThreadId) return;
    let cancelled = false;

    (async () => {
      const r = await fetch(`/api/admin/team-chat/threads/${activeThreadId}`);
      if (r.ok && !cancelled) {
        const d = await r.json();
        setMessages(d.messages || []);
        setDealMap(d.deals || {});
      }
      await fetch(`/api/admin/team-chat/threads/${activeThreadId}/read`, { method: "POST" });
      loadThreads();
    })();

    const es = new EventSource(`/api/admin/team-chat/stream?threadId=${activeThreadId}`);
    esRef.current = es;
    es.addEventListener("message.created", async (e: MessageEvent) => {
      const r = await fetch(`/api/admin/team-chat/threads/${activeThreadId}`);
      if (r.ok) {
        const d = await r.json();
        setMessages(d.messages || []);
        setDealMap(d.deals || {});
      }
      await fetch(`/api/admin/team-chat/threads/${activeThreadId}/read`, { method: "POST" });
    });
    es.addEventListener("message.updated", async () => {
      const r = await fetch(`/api/admin/team-chat/threads/${activeThreadId}`);
      if (r.ok) { const d = await r.json(); setMessages(d.messages || []); setDealMap(d.deals || {}); }
    });
    es.addEventListener("message.deleted", async () => {
      const r = await fetch(`/api/admin/team-chat/threads/${activeThreadId}`);
      if (r.ok) { const d = await r.json(); setMessages(d.messages || []); setDealMap(d.deals || {}); }
    });

    return () => { cancelled = true; es.close(); esRef.current = null; };
  }, [activeThreadId, loadThreads]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async () => {
    if (!draft.trim() || !activeThreadId) return;
    setSending(true);
    try {
      const r = await fetch(`/api/admin/team-chat/threads/${activeThreadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft.trim() }),
      });
      if (r.ok) setDraft("");
    } finally {
      setSending(false);
    }
  };

  const activeThread = useMemo(() => threads.find((t) => t.id === activeThreadId), [threads, activeThreadId]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h2 className="font-display text-[22px] font-bold mb-1">Team Chat</h2>
          <p className="font-body text-[13px] text-[var(--app-text-muted)]">
            Internal admin collaboration. Use @name to mention a teammate, #deal to tag a deal.
          </p>
        </div>
      </div>

      <div className="flex gap-4" style={{ height: "calc(100vh - 220px)", minHeight: 400 }}>
        {/* Rail */}
        <div className={`${activeThreadId ? "hidden md:flex" : "flex"} w-full md:w-[280px] shrink-0 card flex-col overflow-hidden`}>
          <div className="flex-1 overflow-y-auto">
            {threads.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveThreadId(t.id)}
                className={`w-full text-left px-4 py-3 border-b border-[var(--app-border)] transition-colors ${activeThreadId === t.id ? "bg-brand-gold/10" : "hover:bg-[var(--app-card-bg)]"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-body text-sm font-medium text-[var(--app-text)] truncate">
                    {t.type === "global" ? "🌐 Global Room" : t.dealName || "(deleted deal)"}
                  </div>
                  {t.unreadCount > 0 && (
                    <span className="bg-brand-gold text-brand-dark text-[9px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shrink-0">
                      {t.unreadCount}
                    </span>
                  )}
                </div>
                <div className="font-body text-[10px] text-[var(--app-text-faint)]">{t.messageCount} messages</div>
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className={`${activeThreadId ? "flex" : "hidden md:flex"} flex-1 card flex-col overflow-hidden`}>
          <div className="px-5 py-3 border-b border-[var(--app-border)]">
            <div className="font-body text-sm font-semibold text-[var(--app-text)]">
              {activeThread?.type === "global" ? "🌐 Global Room" : activeThread?.dealName || "Thread"}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
            {messages.map((msg) => (
              <div key={msg.id} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-brand-gold/20 flex items-center justify-center shrink-0 font-body text-[11px] font-semibold text-brand-gold">
                  {(msg.senderName || msg.senderEmail).slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-body text-[12px] font-semibold text-[var(--app-text)]">{msg.senderName}</span>
                    <span className="font-body text-[10px] text-[var(--app-text-faint)]">{new Date(msg.createdAt).toLocaleString()}</span>
                    {msg.editedAt && <span className="font-body text-[10px] text-[var(--app-text-faint)] italic">(edited)</span>}
                  </div>
                  <div className="font-body text-[13px] text-[var(--app-text)] leading-relaxed whitespace-pre-wrap mt-0.5">
                    {msg.deletedAt
                      ? <span className="italic text-[var(--app-text-muted)]">[message deleted]</span>
                      : renderAdminChatContent(msg.content, { deals: dealMap }).map((seg, i) =>
                          seg.type === "mention" ? (
                            <span key={i} className="bg-brand-gold/15 text-brand-gold rounded px-1">@{seg.name}</span>
                          ) : seg.type === "deal" ? (
                            <a key={i} href={`/admin/deals#${seg.dealId}`} className="bg-purple-500/15 text-purple-400 rounded px-1 hover:underline">
                              {seg.dealName || seg.dealId}
                            </a>
                          ) : (
                            <span key={i}>{seg.value}</span>
                          )
                        )
                    }
                  </div>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="p-4 border-t border-[var(--app-border)]">
            <MentionInput
              value={draft}
              onChange={setDraft}
              onSubmit={handleSend}
              disabled={sending}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
