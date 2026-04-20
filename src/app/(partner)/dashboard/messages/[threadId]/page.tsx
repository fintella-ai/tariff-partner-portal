// src/app/(partner)/dashboard/messages/[threadId]/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import FlagButton from "@/components/ui/FlagButton";

type Message = {
  id: string;
  threadId: string;
  senderPartnerCode: string;
  content: string;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
};

type Thread = {
  id: string;
  participantA: string;
  participantB: string;
  lastMessageAt: string;
  createdAt: string;
};

export default function ConversationPage() {
  const params = useParams() as { threadId?: string };
  const threadId = params?.threadId;

  const { data: session } = useSession();
  const me = (session?.user as any)?.partnerCode || null;

  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!threadId) return;
    try {
      const r = await fetch(`/api/partner-dm/threads/${threadId}`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      const d = await r.json();
      setThread(d.thread);
      setMessages(d.messages || []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [threadId]);

  useEffect(() => { load(); }, [load]);

  // Mark read on mount and whenever messages change
  useEffect(() => {
    if (!threadId) return;
    fetch(`/api/partner-dm/threads/${threadId}/read`, { method: "POST" }).catch(() => {});
  }, [threadId, messages.length]);

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  // SSE live push
  useEffect(() => {
    if (!threadId) return;
    const es = new EventSource(`/api/partner-dm/stream?threadId=${threadId}`);
    const refresh = () => load();
    es.addEventListener("partner_dm.message.created", refresh);
    es.addEventListener("partner_dm.message.updated", refresh);
    es.addEventListener("partner_dm.message.deleted", refresh);
    es.onerror = () => { /* EventSource auto-reconnects */ };
    return () => { es.close(); };
  }, [threadId, load]);

  async function send() {
    const content = draft.trim();
    if (!content || sending || !threadId) return;
    setSending(true);
    try {
      const r = await fetch(`/api/partner-dm/threads/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        alert(d.error || `Send failed (${r.status})`);
        return;
      }
      setDraft("");
      await load();
    } finally {
      setSending(false);
    }
  }

  if (error) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Link href="/dashboard/messages" className="font-body text-[12px] underline">← Back to messages</Link>
        <div className="mt-4 text-red-400 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] max-w-3xl mx-auto">
      <div className="p-4 border-b border-[var(--app-border)] flex items-center justify-between">
        <Link href="/dashboard/messages" className="font-body text-[12px] underline">← Messages</Link>
        <div className="font-body text-[12px] text-[var(--app-text-muted)]">
          {thread ? `With ${thread.participantA === me ? thread.participantB : thread.participantA}` : "Loading…"}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="font-body text-[12px] text-[var(--app-text-muted)] text-center py-6">
            No messages yet. Start the conversation below.
          </div>
        )}
        {messages.map((m) => {
          const isMine = me != null && m.senderPartnerCode === me;
          const deleted = !!m.deletedAt;
          return (
            <div key={m.id} className={`group flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-xl px-3 py-2 ${isMine ? "bg-blue-500/15 text-blue-200 border border-blue-500/30" : "bg-[var(--app-bg-secondary)] border border-[var(--app-border)]"}`}>
                <div className="font-body text-[11px] text-[var(--app-text-muted)] mb-0.5 flex items-center gap-2">
                  <span>{m.senderPartnerCode}</span>
                  <span>·</span>
                  <span>{new Date(m.createdAt).toLocaleString()}</span>
                  {m.editedAt && <span className="italic">(edited)</span>}
                  {!isMine && !deleted && <FlagButton messageId={m.id} />}
                </div>
                <div className="font-body text-[13px] whitespace-pre-wrap">
                  {deleted ? <em className="opacity-60">message deleted</em> : m.content}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-[var(--app-border)]">
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Type a message — Enter to send, Shift+Enter for newline"
            rows={2}
            className="flex-1 bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-3 py-2 font-body text-[13px]"
          />
          <button
            onClick={send}
            disabled={sending || !draft.trim()}
            className="font-body text-[12px] px-4 py-2 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/30 disabled:opacity-40"
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
