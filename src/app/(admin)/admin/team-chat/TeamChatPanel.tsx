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

export default function TeamChatPanel({
  searchQuery,
  compact,
}: { searchQuery?: string; compact?: boolean } = {}) {
  return (
    <Suspense fallback={<div className="font-body text-sm text-[var(--app-text-muted)]">Loading…</div>}>
      <TeamChatInner searchQuery={searchQuery || ""} compact={!!compact} />
    </Suspense>
  );
}

function TeamChatInner({ searchQuery, compact }: { searchQuery: string; compact: boolean }) {
  const params = useSearchParams();
  const initialThreadId = params?.get("threadId") || null;

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreadId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [dealMap, setDealMap] = useState<Record<string, string>>({});
  const [partnerMap, setPartnerMap] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // Local deal-thread filter used on the standalone /admin/internal-chats
  // page. The compact (widget) mode keeps reading the parent-provided
  // `searchQuery` prop.
  const [dealSearch, setDealSearch] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  // Auto-select the global thread exactly once on initial load. Without
  // this guard the "back to thread list" button in compact mode would
  // glitch — setting activeThreadId=null would immediately re-run
  // loadThreads and snap back into the global room.
  const didAutoSelect = useRef(false);

  // Load partner list once for `[partner:CODE]` token rendering. Best-
  // effort: if the endpoint 403s for the role we just skip and let the
  // chips fall back to showing the raw code.
  useEffect(() => {
    fetch("/api/admin/partners")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.partners) return;
        const map: Record<string, string> = {};
        for (const p of d.partners as any[]) {
          map[p.partnerCode] = `${p.firstName || ""} ${p.lastName || ""}`.trim() || p.partnerCode;
        }
        setPartnerMap(map);
      })
      .catch(() => {});
  }, []);

  // Load thread list
  const loadThreads = useCallback(async () => {
    const r = await fetch("/api/admin/team-chat/threads");
    if (r.ok) {
      const d = await r.json();
      setThreads(d.threads || []);
      if (!activeThreadId && d.threads?.length && !didAutoSelect.current) {
        const globalThread = d.threads.find((t: Thread) => t.type === "global");
        setActiveThreadId(globalThread?.id || d.threads[0].id);
        didAutoSelect.current = true;
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
    <div className={compact ? "h-full flex flex-col" : ""}>
      {/* Page-header block is only useful on the full /admin/internal-
          chats route. Inside the widget (compact) we skip it — the
          widget's own draggable header already labels the surface. */}
      {!compact && (
        <div className="flex items-center justify-between mb-6 gap-3">
          <div>
            <h2 className="font-display text-[22px] font-bold mb-1">Team Chat</h2>
            <p className="font-body text-[13px] text-[var(--app-text-muted)]">
              Internal admin collaboration. Use @name to mention a teammate, #deal to tag a deal.
            </p>
          </div>
        </div>
      )}

      <div
        className={compact ? "flex gap-0 flex-1 min-h-0" : "flex gap-4"}
        style={
          compact
            ? undefined
            : { height: "calc(100vh - 220px)", minHeight: 400 }
        }
      >
        {/* Rail — in compact mode (embedded in the chat widget) we
            drop the md: breakpoint and use mobile-style single-pane
            stacking based only on whether a thread is active. */}
        <div className={`${
          compact
            ? (activeThreadId ? "hidden" : "flex")
            : (activeThreadId ? "hidden md:flex" : "flex")
        } w-full ${compact ? "" : "md:w-[280px]"} shrink-0 card flex-col overflow-hidden`}>
          {/* Inline deal-thread search — non-compact only. The compact
              widget has its own search input at the widget level. Keeps
              the thread list lean when the admin has dozens of deal
              threads: Global Room always renders, deal threads only
              appear when the query has ≥2 chars. */}
          {!compact && (
            <div className="px-3 py-2 border-b border-[var(--app-border)]">
              <input
                type="text"
                value={dealSearch}
                onChange={(e) => setDealSearch(e.target.value)}
                placeholder="Search deal threads… (type 2+ chars)"
                className="w-full rounded-lg px-3 py-1.5 font-body text-[12px] bg-[var(--app-input-bg)] border border-[var(--app-border)] focus:border-brand-gold/40 focus:outline-none"
              />
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {(() => {
              // Compact widget uses parent-provided searchQuery; standalone
              // page uses local `dealSearch`. Deal threads (non-global) are
              // hidden until the query has ≥2 chars — prevents the list
              // from becoming a wall of every deal once volume grows.
              const q = (compact ? (searchQuery || "") : dealSearch).trim().toLowerCase();
              const visible = threads.filter((t) => {
                if (t.type === "global") return true;
                if (q.length < 2) return false;
                const title = (t.dealName || "").toLowerCase();
                return title.includes(q);
              });
              const hint = !compact && q.length < 2
                ? "Type 2+ characters above to search deal threads."
                : (q.length >= 2 && visible.every((t) => t.type === "global"))
                  ? `No deal threads match "${q}".`
                  : null;
              return (<>
                {visible.map((t) => (
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
                {hint && (
                  <div className="px-4 py-6 text-center font-body text-[11px] text-[var(--app-text-muted)] leading-relaxed">
                    {hint}
                  </div>
                )}
              </>);
            })()}
          </div>
        </div>

        {/* Messages */}
        <div className={`${
          compact
            ? (activeThreadId ? "flex" : "hidden")
            : (activeThreadId ? "flex" : "hidden md:flex")
        } flex-1 card flex-col overflow-hidden`}>
          <div className="px-5 py-3 border-b border-[var(--app-border)] flex items-center gap-2">
            {/* Back-to-threads affordance in compact mode — without it
                the widget can't return to the thread list on small
                widths (both panels don't fit side-by-side). */}
            {compact && activeThreadId && (
              <button
                onClick={() => setActiveThreadId(null)}
                className="w-7 h-7 flex items-center justify-center rounded-md theme-text-muted hover:bg-brand-gold/10 transition-colors -ml-1"
                aria-label="Back to thread list"
                title="Back to threads"
              >
                ‹
              </button>
            )}
            <div className="font-body text-sm font-semibold text-[var(--app-text)] truncate">
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
                      : renderAdminChatContent(msg.content, { deals: dealMap, partners: partnerMap }).map((seg, i) =>
                          seg.type === "mention" ? (
                            <span key={i} className="bg-brand-gold/15 text-brand-gold rounded px-1">@{seg.name}</span>
                          ) : seg.type === "deal" ? (
                            <a key={i} href={`/admin/deals#${seg.dealId}`} className="bg-purple-500/15 text-purple-400 rounded px-1 hover:underline">
                              {seg.dealName || seg.dealId}
                            </a>
                          ) : seg.type === "partner" ? (
                            <a key={i} href={`/admin/partners?code=${seg.partnerCode}`} className="bg-pink-500/15 text-pink-300 rounded px-1 hover:underline" title={seg.partnerCode}>
                              &{seg.partnerName || seg.partnerCode}
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
