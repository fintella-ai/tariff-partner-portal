"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import PartnerLink from "@/components/ui/PartnerLink";

type ChatSession = {
  id: string;
  partnerCode: string;
  partnerId: string | null;
  partnerName: string;
  companyName: string | null;
  status: string;
  subject: string | null;
  lastMessage: string | null;
  lastMessageAt: string;
  lastMessageSender: string | null;
  unreadCount: number;
  createdAt: string;
};

type ChatMessage = {
  id: string;
  senderType: string;
  senderId: string;
  senderName: string | null;
  content: string;
  read: boolean;
  createdAt: string;
};

type SessionDetail = {
  id: string;
  partnerCode: string;
  partnerId: string | null;
  partnerName: string;
  partnerEmail: string | null;
  companyName: string | null;
  status: string;
  messages: ChatMessage[];
};

export default function AdminChatPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "closed">("active");
  const [soundOn, setSoundOn] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Remember the last-seen unread count per session so we can detect
  // genuinely new inbound partner messages across polls and beep only
  // when the count actually grows. Using a ref so updates don't
  // re-trigger the useEffect that reads it.
  const lastUnreadRef = useRef<Record<string, number>>({});
  const firstLoadRef = useRef(true);

  // Play a short beep via WebAudio — no asset download required.
  const playBeep = useCallback(() => {
    if (!soundOn) return;
    try {
      const ctxCtor =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!ctxCtor) return;
      const ctx = new ctxCtor();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880; // A5
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.26);
      osc.onended = () => ctx.close().catch(() => {});
    } catch {
      // Autoplay policy may block the first beep until user interacts
      // with the page. Silently swallow.
    }
  }, [soundOn]);

  const fetchSessions = useCallback(() => {
    fetch("/api/admin/chat")
      .then((r) => r.json())
      .then((data) => {
        const list: ChatSession[] = data.sessions || [];
        // Detect new inbound messages by comparing unread counts to
        // the last-known values. Skip the very first load so we don't
        // beep on existing unread counts.
        if (!firstLoadRef.current) {
          let newArrivals = 0;
          for (const s of list) {
            const prev = lastUnreadRef.current[s.id] || 0;
            if (s.unreadCount > prev) newArrivals += s.unreadCount - prev;
          }
          if (newArrivals > 0) playBeep();
        }
        const next: Record<string, number> = {};
        for (const s of list) next[s.id] = s.unreadCount;
        lastUnreadRef.current = next;
        firstLoadRef.current = false;
        setSessions(list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [playBeep]);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000); // poll every 5s
    return () => clearInterval(interval);
  }, [fetchSessions]);

  // Auto-refresh selected session
  useEffect(() => {
    if (!selectedId) return;
    const interval = setInterval(() => {
      fetch(`/api/admin/chat?sessionId=${selectedId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.session) setDetail(data.session);
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [selectedId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages?.length]);

  function openSession(id: string) {
    setSelectedId(id);
    fetch(`/api/admin/chat?sessionId=${id}`)
      .then((r) => r.json())
      .then((data) => setDetail(data.session))
      .catch(() => {});
  }

  async function handleSend() {
    if (!reply.trim() || !selectedId) return;
    setSending(true);
    try {
      await fetch("/api/admin/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", sessionId: selectedId, message: reply.trim() }),
      });
      setReply("");
      // Refresh
      const r = await fetch(`/api/admin/chat?sessionId=${selectedId}`);
      const data = await r.json();
      if (data.session) setDetail(data.session);
      fetchSessions();
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  }

  async function handleClose() {
    if (!selectedId || !confirm("Close this chat session?")) return;
    await fetch("/api/admin/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "close", sessionId: selectedId }),
    });
    setSelectedId(null);
    setDetail(null);
    fetchSessions();
  }

  const filtered = sessions.filter((s) => {
    if (filter === "active") return s.status === "active";
    if (filter === "closed") return s.status === "closed";
    return true;
  });

  const totalUnread = sessions.reduce((sum, s) => sum + s.unreadCount, 0);

  function timeAgo(d: string) {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h2 className="font-display text-[22px] font-bold mb-1">Live Chat</h2>
          <p className="font-body text-[13px] text-[var(--app-text-muted)]">
            Respond to partner conversations in real-time.
            {totalUnread > 0 && <span className="text-brand-gold font-semibold ml-2">{totalUnread} unread</span>}
          </p>
        </div>
        <button
          onClick={() => {
            setSoundOn((v) => !v);
            // Also play a test beep when turning on so the admin confirms
            // their browser is allowing audio.
            if (!soundOn) setTimeout(() => playBeep(), 50);
          }}
          title={soundOn ? "Notification sound on" : "Notification sound off"}
          className={`font-body text-[12px] border-2 rounded-lg px-3 py-2 transition-colors min-h-[44px] flex items-center gap-2 ${
            soundOn
              ? "border-brand-gold bg-brand-gold/25 hover:bg-brand-gold/30"
              : "border-brand-gold/40 bg-brand-gold/10 hover:bg-brand-gold/15"
          }`}
          style={{ filter: "saturate(1.3) brightness(1.1)" }}
        >
          {soundOn ? "🔊 Sound on" : "🔇 Sound off"}
        </button>
      </div>

      <div className="flex gap-4" style={{ height: "calc(100vh - 220px)", minHeight: 400 }}>
        {/* ── SESSION LIST (left panel — hidden on mobile when a session is selected) ── */}
        <div className={`${selectedId ? "hidden md:flex" : "flex"} w-full md:w-[320px] shrink-0 card flex-col overflow-hidden`}>
          {/* Filter tabs */}
          <div className="flex gap-1 p-3 border-b border-[var(--app-border)]">
            {(["active", "closed", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`font-body text-[11px] px-3 py-1.5 rounded-full transition capitalize ${
                  filter === f ? "bg-brand-gold/20 text-brand-gold" : "text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"
                }`}
              >
                {f} {f === "active" && totalUnread > 0 ? `(${totalUnread})` : ""}
              </button>
            ))}
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center font-body text-sm text-[var(--app-text-muted)]">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center font-body text-sm text-[var(--app-text-muted)]">No {filter === "all" ? "" : filter} conversations.</div>
            ) : (
              filtered.map((s) => (
                <div
                  key={s.id}
                  onClick={() => openSession(s.id)}
                  className={`px-4 py-3 border-b border-[var(--app-border)] cursor-pointer transition-colors ${
                    selectedId === s.id ? "bg-brand-gold/10" : "hover:bg-[var(--app-card-bg)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="font-body text-sm font-medium text-[var(--app-text)] truncate">{s.partnerName}</div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {s.unreadCount > 0 && (
                        <span className="bg-brand-gold text-brand-dark text-[9px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                          {s.unreadCount}
                        </span>
                      )}
                      <span className="font-body text-[10px] text-[var(--app-text-faint)]">{timeAgo(s.lastMessageAt)}</span>
                    </div>
                  </div>
                  <div className="font-body text-[11px] text-[var(--app-text-muted)] truncate">
                    {s.lastMessageSender === "admin" ? "You: " : ""}{s.lastMessage || s.subject || "New conversation"}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── CHAT PANEL (right — full width on mobile when session selected) ── */}
        <div className={`${selectedId ? "flex" : "hidden md:flex"} flex-1 card flex-col overflow-hidden`}>
          {!selectedId || !detail ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-3 opacity-30">💬</div>
                <div className="font-body text-sm text-[var(--app-text-muted)]">Select a conversation to start responding</div>
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="px-5 py-3 border-b border-[var(--app-border)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => { setSelectedId(null); setDetail(null); }}
                    className="md:hidden font-body text-[var(--app-text-muted)] hover:text-[var(--app-text)] min-w-[44px] min-h-[44px] flex items-center justify-center"
                  >
                    ←
                  </button>
                  <div>
                  <PartnerLink partnerId={detail.partnerId} className="font-body text-sm font-semibold text-[var(--app-text)]">
                    {detail.partnerName}
                  </PartnerLink>
                  <div className="font-body text-[11px] text-[var(--app-text-muted)]">
                    {detail.partnerCode} {detail.companyName ? `· ${detail.companyName}` : ""} {detail.partnerEmail ? `· ${detail.partnerEmail}` : ""}
                  </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {detail.status === "active" && (
                    <button onClick={handleClose} className="font-body text-[11px] text-[var(--app-text-muted)] border border-[var(--app-border)] rounded-lg px-3 py-1.5 hover:text-red-400 hover:border-red-400/30 transition-colors">
                      Close Chat
                    </button>
                  )}
                  <span className={`inline-block rounded-full px-2.5 py-1 font-body text-[10px] font-semibold tracking-wider uppercase ${
                    detail.status === "active" ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-[var(--app-input-bg)] text-[var(--app-text-muted)] border border-[var(--app-border)]"
                  }`}>
                    {detail.status}
                  </span>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
                {detail.messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.senderType === "admin" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-xl px-4 py-3 ${
                      msg.senderType === "admin"
                        ? "bg-brand-gold/15 border border-brand-gold/20 rounded-br-sm"
                        : "bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-bl-sm"
                    }`}>
                      <div className="font-body text-[11px] font-semibold mb-1" style={{ color: msg.senderType === "admin" ? "var(--app-gold-text, #c4a050)" : "var(--app-text-secondary)" }}>
                        {msg.senderName || (msg.senderType === "admin" ? "Support Agent" : "Partner")}
                      </div>
                      <div className="font-body text-[13px] text-[var(--app-text)] leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                      <div className="font-body text-[10px] text-[var(--app-text-faint)] mt-1.5">{timeAgo(msg.createdAt)}</div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply input */}
              {detail.status === "active" && (
                <div className="p-4 border-t border-[var(--app-border)]">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Type your reply..."
                      className="flex-1 bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-xl px-4 py-3 text-[var(--app-text)] font-body text-[13px] outline-none focus:border-brand-gold/30 transition-colors placeholder:text-[var(--app-text-muted)]"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    />
                    <button
                      onClick={handleSend}
                      disabled={!reply.trim() || sending}
                      className="bg-brand-gold/20 text-brand-gold border border-brand-gold/30 rounded-xl px-5 font-body text-sm font-semibold hover:bg-brand-gold/30 transition-colors disabled:opacity-50"
                    >
                      {sending ? "..." : "Send"}
                    </button>
                  </div>
                </div>
              )}

              {detail.status === "closed" && (
                <div className="p-4 border-t border-[var(--app-border)] text-center">
                  <div className="font-body text-sm text-[var(--app-text-muted)]">This conversation has been closed.</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
