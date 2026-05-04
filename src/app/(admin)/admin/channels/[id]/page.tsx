// src/app/(admin)/admin/channels/[id]/page.tsx
"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import AnnouncementCard from "@/components/ui/AnnouncementCard";
import CallLinkComposer, { type CallMetaInput } from "@/components/ui/CallLinkComposer";
import ChannelMemberManager from "@/components/admin/ChannelMemberManager";

type Channel = {
  id: string;
  name: string;
  description: string | null;
  segmentRule: string | null;
  archivedAt: string | null;
  _count: { memberships: number; threads: number };
};

type Message = {
  id: string;
  authorEmail: string;
  authorName: string;
  content: string;
  messageType: string;
  callMeta: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  channelId: string;
};

type ReplyThread = {
  id: string;
  partnerCode: string;
  partnerName: string;
  lastMessageAt: string;
  unreadCount: number;
};

type ReplyMessage = {
  id: string;
  threadId: string;
  senderType: string;
  senderName: string;
  content: string;
  createdAt: string;
};

export default function AdminChannelDetailPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm opacity-70">Loading…</div>}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const params = useParams<{ id: string }>();
  const channelId = params?.id as string;

  const [channel, setChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threads, setThreads] = useState<ReplyThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ReplyMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [replyDraft, setReplyDraft] = useState("");
  const [showCallLink, setShowCallLink] = useState(false);
  const [pendingCall, setPendingCall] = useState<CallMetaInput | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const feedBottomRef = useRef<HTMLDivElement>(null);

  // AI generation state
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiType, setAiType] = useState<string>("general");
  const [aiInstructions, setAiInstructions] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiUsedAi, setAiUsedAi] = useState(false);

  const loadChannel = useCallback(async () => {
    const r = await fetch(`/api/admin/channels/${channelId}`);
    if (!r.ok) return;
    const d = await r.json();
    setChannel(d.channel);
    setMessages(d.recentMessages || []);
  }, [channelId]);

  const loadThreads = useCallback(async () => {
    const r = await fetch(`/api/admin/channels/${channelId}/reply-threads`);
    if (r.ok) {
      const d = await r.json();
      setThreads(d.threads || []);
    }
  }, [channelId]);

  useEffect(() => {
    if (!channelId) return;
    loadChannel();
    loadThreads();
  }, [channelId, loadChannel, loadThreads]);

  // SSE
  useEffect(() => {
    if (!channelId) return;
    const es = new EventSource(`/api/admin/channels/stream?channelId=${channelId}`);
    esRef.current = es;
    const onAnnouncement = () => { loadChannel(); };
    const onReply = () => { loadThreads(); if (activeThreadId) loadThread(activeThreadId); };
    es.addEventListener("channel.announcement.created", onAnnouncement);
    es.addEventListener("channel.announcement.updated", onAnnouncement);
    es.addEventListener("channel.announcement.deleted", onAnnouncement);
    es.addEventListener("channel.reply.created", onReply);
    return () => {
      es.removeEventListener("channel.announcement.created", onAnnouncement);
      es.removeEventListener("channel.announcement.updated", onAnnouncement);
      es.removeEventListener("channel.announcement.deleted", onAnnouncement);
      es.removeEventListener("channel.reply.created", onReply);
      es.close();
      esRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  useEffect(() => {
    feedBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const loadThread = async (id: string) => {
    const r = await fetch(`/api/admin/channels/reply-threads/${id}/messages`);
    if (r.ok) {
      const d = await r.json();
      setThreadMessages(d.messages || []);
    }
  };

  const openThread = async (id: string) => {
    setActiveThreadId(id);
    await loadThread(id);
    await loadThreads();
  };

  const sendAnnouncement = async () => {
    if (!draft.trim() && !pendingCall) return;
    setSending(true);
    setError(null);
    try {
      const payload: any = {
        content: draft.trim() || (pendingCall?.title ?? "Call link"),
        messageType: pendingCall ? "call_link" : "text",
      };
      if (pendingCall) payload.callMeta = pendingCall;
      const r = await fetch(`/api/admin/channels/${channelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      setDraft("");
      setPendingCall(null);
      setShowCallLink(false);
      await loadChannel();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const sendReply = async () => {
    if (!activeThreadId || !replyDraft.trim()) return;
    setSending(true);
    try {
      const r = await fetch(`/api/admin/channels/reply-threads/${activeThreadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: replyDraft.trim() }),
      });
      if (r.ok) {
        setReplyDraft("");
        await loadThread(activeThreadId);
        await loadThreads();
      }
    } finally {
      setSending(false);
    }
  };

  const resync = async () => {
    const r = await fetch(`/api/admin/channels/${channelId}/resync`, { method: "POST" });
    if (r.ok) {
      const d = await r.json();
      alert(`Resync complete: ${d.added ?? 0} member${d.added === 1 ? "" : "s"} added`);
      await loadChannel();
    }
  };

  const archive = async () => {
    if (!confirm("Archive this channel? Partners will no longer see it.")) return;
    const r = await fetch(`/api/admin/channels/${channelId}`, { method: "DELETE" });
    if (r.ok) window.location.href = "/admin/channels";
  };

  const generateWithAi = async () => {
    setAiGenerating(true);
    setAiError(null);
    try {
      const r = await fetch("/api/admin/announcements/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: aiType,
          channelId,
          instructions: aiInstructions.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      const data = await r.json();
      setDraft(data.draft || "");
      setAiUsedAi(data.ai === true);
      setShowAiPanel(false);
      setAiInstructions("");
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiGenerating(false);
    }
  };

  if (!channel) return <div className="p-6 text-sm opacity-70">Loading channel…</div>;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto grid gap-4 md:grid-cols-[1fr_320px]">
      {/* Feed + compose */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-semibold">{channel.name}</h1>
            {channel.description && <div className="text-sm opacity-80">{channel.description}</div>}
            <div className="text-xs opacity-60 mt-1">
              {channel._count.memberships} member{channel._count.memberships === 1 ? "" : "s"} · {channel._count.threads} reply thread{channel._count.threads === 1 ? "" : "s"}
            </div>
          </div>
          <div className="flex gap-2">
            {channel.segmentRule && (
              <button type="button" onClick={resync} className="theme-btn-secondary text-sm px-3 py-1.5">
                Resync segment
              </button>
            )}
            <button type="button" onClick={archive} className="theme-btn-secondary text-sm px-3 py-1.5">
              Archive
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {messages.length === 0 && (
            <div className="theme-card p-6 text-center text-sm opacity-70">
              No announcements yet. Post the first below.
            </div>
          )}
          {messages.map((m) => <AnnouncementCard key={m.id} message={m} />)}
          <div ref={feedBottomRef} />
        </div>

        {/* AI Generate Panel */}
        {showAiPanel && (
          <div className="theme-card p-4 space-y-3 border-l-4 border-[var(--app-accent,#3b82f6)]">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Generate with AI</div>
              <button
                type="button"
                onClick={() => { setShowAiPanel(false); setAiError(null); }}
                className="text-xs opacity-60 hover:opacity-100"
              >
                Close
              </button>
            </div>

            <div>
              <label className="block text-[11px] tracking-wider uppercase opacity-60 mb-1">Announcement Type</label>
              <select
                className="theme-input w-full text-sm"
                value={aiType}
                onChange={(e) => setAiType(e.target.value)}
              >
                <option value="general">General Update</option>
                <option value="network_update">Partner Network Update</option>
                <option value="milestone">Milestone Announcement</option>
                <option value="deadline_reminder">Deadline Reminder</option>
                <option value="feature">Feature Announcement</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] tracking-wider uppercase opacity-60 mb-1">
                Special Instructions (optional)
              </label>
              <textarea
                className="theme-input w-full text-sm"
                rows={2}
                placeholder="e.g., Focus on customs brokers, mention the new calculator, highlight Q1 deadlines..."
                value={aiInstructions}
                onChange={(e) => setAiInstructions(e.target.value)}
              />
            </div>

            {aiError && <div className="text-xs text-red-500">{aiError}</div>}

            <div className="flex items-center justify-between">
              <div className="text-[11px] opacity-50">
                AI reads live deals, partners, and milestones to draft the announcement.
              </div>
              <button
                type="button"
                disabled={aiGenerating}
                onClick={generateWithAi}
                className="theme-btn-primary text-sm px-4 py-1.5 disabled:opacity-50"
              >
                {aiGenerating ? "Generating..." : "Generate Draft"}
              </button>
            </div>
          </div>
        )}

        {/* Compose */}
        <div className="theme-card p-3 space-y-2 sticky bottom-2">
          {aiUsedAi && draft && (
            <div className="text-[11px] px-2 py-1 rounded bg-[var(--app-accent,#3b82f6)]/10 text-[var(--app-accent,#3b82f6)] flex items-center justify-between">
              <span>AI-generated draft -- review and edit before posting</span>
              <button type="button" onClick={() => setAiUsedAi(false)} className="opacity-60 hover:opacity-100 ml-2">Dismiss</button>
            </div>
          )}
          <textarea
            className="theme-input w-full text-sm"
            rows={draft.length > 200 ? 6 : 2}
            placeholder="Write an announcement…"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); if (aiUsedAi) setAiUsedAi(false); }}
          />
          {showCallLink && !pendingCall && (
            <CallLinkComposer
              onCancel={() => setShowCallLink(false)}
              onInsert={(meta) => { setPendingCall(meta); setShowCallLink(false); }}
            />
          )}
          {pendingCall && (
            <div className="text-xs opacity-80 flex items-center gap-2">
              Call attached: {pendingCall.title || pendingCall.url}
              <button type="button" onClick={() => setPendingCall(null)} className="text-red-500">Remove</button>
            </div>
          )}
          {error && <div className="text-xs text-red-500">{error}</div>}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCallLink((v) => !v)}
                className="text-sm theme-btn-secondary px-3 py-1.5"
              >
                {showCallLink ? "Close" : "Add call link"}
              </button>
              <button
                type="button"
                onClick={() => setShowAiPanel((v) => !v)}
                className="text-sm theme-btn-secondary px-3 py-1.5"
              >
                {showAiPanel ? "Close AI" : "Generate with AI"}
              </button>
            </div>
            <button
              type="button"
              disabled={sending || (!draft.trim() && !pendingCall)}
              onClick={sendAnnouncement}
              className="theme-btn-primary text-sm px-3 py-1.5 disabled:opacity-50"
            >
              {sending ? "Posting…" : "Post announcement"}
            </button>
          </div>
        </div>
      </div>

      {/* Replies panel */}
      <div className="space-y-2">
        <ChannelMemberManager channelId={channelId} onMembersChanged={loadChannel} />

        <div className="text-sm font-medium">💬 Reply threads</div>
        {threads.length === 0 && (
          <div className="text-xs opacity-70">No partner has replied yet.</div>
        )}
        {threads.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => openThread(t.id)}
            className={`theme-card p-2 block w-full text-left ${activeThreadId === t.id ? "ring-2 ring-[var(--app-accent,#3b82f6)]" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">{t.partnerName}</div>
              {t.unreadCount > 0 && (
                <span className="theme-pill text-[11px] bg-red-500 text-white">{t.unreadCount}</span>
              )}
            </div>
            <div className="text-[11px] opacity-60">{new Date(t.lastMessageAt).toLocaleString()}</div>
          </button>
        ))}

        {activeThreadId && (
          <div className="theme-card p-2 space-y-2">
            <div className="text-xs font-medium opacity-70">Conversation</div>
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {threadMessages.map((m) => (
                <div
                  key={m.id}
                  className={`text-sm p-2 rounded ${m.senderType === "admin" ? "bg-[var(--app-accent,#3b82f6)]/10 ml-4" : "bg-black/5 mr-4"}`}
                >
                  <div className="text-[11px] opacity-60">{m.senderName} · {new Date(m.createdAt).toLocaleString()}</div>
                  <div className="whitespace-pre-wrap break-words">{m.content}</div>
                </div>
              ))}
            </div>
            <textarea
              className="theme-input w-full text-sm"
              rows={2}
              placeholder="Reply to this partner…"
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
            />
            <button
              type="button"
              disabled={sending || !replyDraft.trim()}
              onClick={sendReply}
              className="theme-btn-primary text-sm px-3 py-1.5 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send reply"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
