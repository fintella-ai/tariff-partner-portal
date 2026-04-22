// src/app/(partner)/dashboard/announcements/page.tsx
"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import AnnouncementCard from "@/components/ui/AnnouncementCard";
import PageTabBar from "@/components/ui/PageTabBar";

type ChannelMessage = {
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

type Channel = {
  id: string;
  name: string;
  description: string | null;
  recentMessages: ChannelMessage[];
};

type ReplyMessage = {
  id: string;
  senderType: string;
  senderName: string;
  content: string;
  createdAt: string;
};

export default function PartnerAnnouncementsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm opacity-70">Loading…</div>}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const params = useSearchParams();
  const initialChannelId = params?.get("channelId") || null;

  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [openReply, setOpenReply] = useState<Record<string, boolean>>({});
  const [replyThreads, setReplyThreads] = useState<Record<string, ReplyMessage[]>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const esMapRef = useRef<Record<string, EventSource>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/announcements");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setChannels(d.channels || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-open reply for channelId in URL
  useEffect(() => {
    if (initialChannelId) {
      setOpenReply((prev) => ({ ...prev, [initialChannelId]: true }));
    }
  }, [initialChannelId]);

  // Load reply thread lazily
  const loadThread = async (channelId: string) => {
    const r = await fetch(`/api/announcements/${channelId}/reply-thread`);
    if (r.ok) {
      const d = await r.json();
      setReplyThreads((prev) => ({ ...prev, [channelId]: d.messages || [] }));
    }
  };

  // SSE per channel
  useEffect(() => {
    // Close any streams for channels we no longer track
    const ids = new Set(channels.map((c) => c.id));
    Object.keys(esMapRef.current).forEach((id) => {
      if (!ids.has(id)) {
        esMapRef.current[id].close();
        delete esMapRef.current[id];
      }
    });
    // Open streams for newly seen channels
    channels.forEach((c) => {
      if (esMapRef.current[c.id]) return;
      const es = new EventSource(`/api/announcements/stream?channelId=${c.id}`);
      esMapRef.current[c.id] = es;
      const reload = () => { load(); };
      const replyReload = () => { if (openReply[c.id]) loadThread(c.id); };
      es.addEventListener("channel.announcement.created", reload);
      es.addEventListener("channel.announcement.updated", reload);
      es.addEventListener("channel.announcement.deleted", reload);
      es.addEventListener("channel.reply.created", replyReload);
    });
    return () => {
      // Don't close on every render — only when component unmounts (cleanup in final)
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels.map((c) => c.id).join(",")]);

  useEffect(() => {
    return () => {
      Object.values(esMapRef.current).forEach((es) => es.close());
      esMapRef.current = {};
    };
  }, []);

  const toggleReply = async (channelId: string) => {
    const next = !openReply[channelId];
    setOpenReply((prev) => ({ ...prev, [channelId]: next }));
    if (next && !replyThreads[channelId]) await loadThread(channelId);
  };

  const sendReply = async (channelId: string) => {
    const draft = (replyDrafts[channelId] || "").trim();
    if (!draft) return;
    try {
      const r = await fetch(`/api/announcements/${channelId}/reply-thread`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      setReplyDrafts((prev) => ({ ...prev, [channelId]: "" }));
      await loadThread(channelId);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">

      <PageTabBar
        title="Communications"
        tabs={[
          { label: "Live Weekly Call", href: "/dashboard/conference" },
          { label: "Announcements", href: "/dashboard/announcements" },
          { label: "Messages", href: "/dashboard/messages" },
          { label: "Notifications", href: "/dashboard/notifications" },
        ]}
      />
      <h1 className="text-2xl font-semibold">📣 Announcements</h1>
      {error && <div className="text-sm text-red-500">{error}</div>}
      {loading && <div className="text-sm opacity-70">Loading…</div>}
      {!loading && channels.length === 0 && (
        <div className="theme-card p-6 text-center text-sm opacity-70">
          You are not a member of any announcement channel yet. Your admin will add you when relevant.
        </div>
      )}
      {channels.map((c) => (
        <div key={c.id} className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <h2 className="text-lg font-medium">{c.name}</h2>
              {c.description && <div className="text-sm opacity-80">{c.description}</div>}
            </div>
          </div>
          <div className="space-y-2">
            {c.recentMessages.length === 0 && (
              <div className="theme-card p-4 text-sm opacity-70">No announcements yet.</div>
            )}
            {c.recentMessages.map((m) => <AnnouncementCard key={m.id} message={m} />)}
          </div>

          <div>
            <button
              type="button"
              onClick={() => toggleReply(c.id)}
              className="text-sm theme-btn-secondary px-3 py-1.5"
            >
              {openReply[c.id] ? "Hide reply thread" : "💬 Reply privately to admin"}
            </button>
          </div>

          {openReply[c.id] && (
            <div className="theme-card p-3 space-y-2">
              <div className="text-xs opacity-70">Private thread — only you and the admin team see this.</div>
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {(replyThreads[c.id] || []).map((m) => (
                  <div
                    key={m.id}
                    className={`text-sm p-2 rounded ${m.senderType === "partner" ? "bg-[var(--app-accent,#3b82f6)]/10 ml-4" : "bg-black/5 mr-4"}`}
                  >
                    <div className="text-[11px] opacity-60">{m.senderName} · {new Date(m.createdAt).toLocaleString()}</div>
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  </div>
                ))}
                {(replyThreads[c.id] || []).length === 0 && (
                  <div className="text-xs opacity-70">No messages yet — send the first one below.</div>
                )}
              </div>
              <textarea
                className="theme-input w-full text-sm"
                rows={2}
                placeholder="Type a private message…"
                value={replyDrafts[c.id] || ""}
                onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [c.id]: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => sendReply(c.id)}
                disabled={!(replyDrafts[c.id] || "").trim()}
                className="theme-btn-primary text-sm px-3 py-1.5 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
