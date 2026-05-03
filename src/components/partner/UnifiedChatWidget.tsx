"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useDevice } from "@/lib/useDevice";
import type { PersonaId } from "@/lib/ai-personas";
import PartnerChatBubble from "./PartnerChatBubble";

interface Props {
  preferredPersona: PersonaId;
  liveChatEnabled: boolean;
  aiEnabled: boolean;
}

interface DmThread {
  id: string;
  counterpartyCode: string;
  counterpartyName: string;
  lastMessageAt: string;
  unreadCount: number;
}

interface Ticket {
  id: string;
  subject: string;
  status: string;
  updatedAt: string;
  hasUnreadReply: boolean;
}

type ActiveTab = "ai" | "support" | "messages";

export default function UnifiedChatWidget({ preferredPersona, liveChatEnabled, aiEnabled }: Props) {
  const { data: session } = useSession();
  const device = useDevice();
  const partnerCode = (session?.user as any)?.partnerCode;

  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("ai");

  const [dmThreads, setDmThreads] = useState<DmThread[]>([]);
  const [dmUnread, setDmUnread] = useState(0);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketUnread, setTicketUnread] = useState(0);

  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<any[]>([]);
  const [dmDraft, setDmDraft] = useState("");
  const [sendingDm, setSendingDm] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDmThreads = useCallback(async () => {
    if (!partnerCode) return;
    try {
      const res = await fetch("/api/partner-dm/threads");
      if (res.ok) {
        const data = await res.json();
        const threads: DmThread[] = data.threads || [];
        setDmThreads(threads.sort((a, b) => {
          if (a.unreadCount && !b.unreadCount) return -1;
          if (!a.unreadCount && b.unreadCount) return 1;
          return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
        }));
        setDmUnread(threads.reduce((s, t) => s + t.unreadCount, 0));
      }
    } catch {}
  }, [partnerCode]);

  const loadTickets = useCallback(async () => {
    if (!partnerCode) return;
    try {
      const res = await fetch("/api/tickets?status=open,in_progress");
      if (res.ok) {
        const data = await res.json();
        const tix: Ticket[] = (data.tickets || []).map((t: any) => ({
          id: t.id,
          subject: t.subject,
          status: t.status,
          updatedAt: t.updatedAt,
          hasUnreadReply: t.hasUnreadReply ?? false,
        }));
        setTickets(tix.sort((a, b) => {
          if (a.hasUnreadReply && !b.hasUnreadReply) return -1;
          if (!a.hasUnreadReply && b.hasUnreadReply) return 1;
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        }));
        setTicketUnread(tix.filter((t) => t.hasUnreadReply).length);
      }
    } catch {}
  }, [partnerCode]);

  useEffect(() => {
    if (open) {
      loadDmThreads();
      loadTickets();
      pollRef.current = setInterval(() => {
        loadDmThreads();
        loadTickets();
      }, 15_000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, loadDmThreads, loadTickets]);

  useEffect(() => {
    if (!open) {
      const bg = setInterval(() => { loadDmThreads(); loadTickets(); }, 60_000);
      return () => clearInterval(bg);
    }
  }, [open, loadDmThreads, loadTickets]);

  const loadThreadMessages = async (threadId: string) => {
    setSelectedThread(threadId);
    const res = await fetch(`/api/partner-dm/threads/${threadId}/messages`);
    if (res.ok) {
      const data = await res.json();
      setThreadMessages(data.messages || []);
    }
    await fetch(`/api/partner-dm/threads/${threadId}/read`, { method: "POST" }).catch(() => {});
    loadDmThreads();
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadMessages]);

  const sendDm = async () => {
    if (!dmDraft.trim() || !selectedThread) return;
    setSendingDm(true);
    const res = await fetch(`/api/partner-dm/threads/${selectedThread}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: dmDraft }),
    });
    if (res.ok) {
      setDmDraft("");
      await loadThreadMessages(selectedThread);
    }
    setSendingDm(false);
  };

  const totalUnread = dmUnread + ticketUnread;
  const priorityTab: ActiveTab = dmUnread > 0 ? "messages" : ticketUnread > 0 ? "support" : "ai";

  const fmtTime = (d: string) => {
    const ms = Date.now() - new Date(d).getTime();
    if (ms < 60_000) return "now";
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const tabStyle = (tab: ActiveTab) => {
    const isActive = activeTab === tab;
    return `relative flex-1 py-2 text-center text-[11px] font-semibold tracking-wider uppercase transition-colors ${
      isActive
        ? "text-brand-gold border-b-2 border-brand-gold"
        : "text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
    }`;
  };

  const Badge = ({ count, pulse }: { count: number; pulse?: boolean }) =>
    count > 0 ? (
      <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center ${pulse ? "animate-pulse" : ""}`}>
        {count > 9 ? "9+" : count}
      </span>
    ) : null;

  if (!aiEnabled && !liveChatEnabled) return null;

  // FAB button
  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setActiveTab(priorityTab); }}
        className="fixed z-[9998] rounded-full w-14 h-14 flex items-center justify-center shadow-lg transition-all hover:scale-110 active:scale-95"
        style={{
          background: "var(--brand-gold)",
          bottom: device.isMobile ? "calc(env(safe-area-inset-bottom, 0px) + 80px)" : 24,
          right: device.isMobile ? 16 : 24,
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#000" }}>
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </button>
    );
  }

  // Full panel
  const panelW = device.isMobile ? "100vw" : "400px";
  const panelH = device.isMobile ? "100vh" : "600px";

  return (
    <div
      className="fixed z-[9999] flex flex-col overflow-hidden"
      style={{
        width: panelW,
        height: panelH,
        bottom: device.isMobile ? 0 : 24,
        right: device.isMobile ? 0 : 24,
        borderRadius: device.isMobile ? 0 : 16,
        background: "var(--app-bg-secondary)",
        border: device.isMobile ? "none" : "1px solid var(--app-border)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--app-border)" }}>
        <span className="font-display text-sm font-bold" style={{ color: "var(--brand-gold)" }}>
          Fintella
        </span>
        <button
          onClick={() => setOpen(false)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--app-text-muted)] hover:bg-[var(--app-hover)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex" style={{ borderBottom: "1px solid var(--app-border)" }}>
        <button className={tabStyle("ai")} onClick={() => setActiveTab("ai")}>
          AI Assistant
        </button>
        <button className={tabStyle("support")} onClick={() => setActiveTab("support")}>
          <span>Support</span>
          <Badge count={ticketUnread} pulse />
        </button>
        <button className={tabStyle("messages")} onClick={() => { setActiveTab("messages"); setSelectedThread(null); }}>
          <span>Messages</span>
          <Badge count={dmUnread} pulse />
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === "ai" && (
          <div className="flex-1 overflow-hidden">
            <PartnerChatBubble
              preferredPersona={preferredPersona}
              liveChatEnabled={liveChatEnabled}
              aiEnabled={aiEnabled}
              embedded
              onClose={() => setOpen(false)}
            />
          </div>
        )}

        {activeTab === "support" && (
          <div className="flex-1 overflow-y-auto">
            {tickets.length === 0 ? (
              <div className="p-6 text-center">
                <div className="text-2xl mb-2">🎫</div>
                <div className="font-body text-sm text-[var(--app-text-muted)]">No open tickets</div>
                <a
                  href="/dashboard/support"
                  className="inline-block mt-3 font-body text-xs text-brand-gold hover:underline"
                >
                  Go to Support Page →
                </a>
              </div>
            ) : (
              <div>
                {tickets.map((t) => (
                  <a
                    key={t.id}
                    href={`/dashboard/support?ticket=${t.id}`}
                    className="block px-4 py-3 border-b border-[var(--app-border)] hover:bg-[var(--app-card-bg)] transition-colors"
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-body text-sm font-medium text-[var(--app-text)] truncate flex-1">
                        {t.subject}
                      </span>
                      {t.hasUnreadReply && (
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0 ml-2" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-body text-[10px] px-1.5 py-0.5 rounded ${
                        t.status === "open" ? "bg-amber-500/10 text-amber-400" : "bg-blue-500/10 text-blue-400"
                      }`}>
                        {t.status}
                      </span>
                      <span className="font-body text-[10px] text-[var(--app-text-faint)]">
                        {fmtTime(t.updatedAt)}
                      </span>
                    </div>
                  </a>
                ))}
                <a
                  href="/dashboard/support"
                  className="block px-4 py-3 text-center font-body text-xs text-brand-gold hover:underline"
                >
                  View all tickets →
                </a>
              </div>
            )}
          </div>
        )}

        {activeTab === "messages" && !selectedThread && (
          <div className="flex-1 overflow-y-auto">
            {dmThreads.length === 0 ? (
              <div className="p-6 text-center">
                <div className="text-2xl mb-2">💬</div>
                <div className="font-body text-sm text-[var(--app-text-muted)]">No messages yet</div>
                <div className="font-body text-xs text-[var(--app-text-faint)] mt-1">
                  Messages from your upline partner and the Fintella team will appear here.
                </div>
              </div>
            ) : (
              dmThreads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => loadThreadMessages(t.id)}
                  className="w-full text-left px-4 py-3 border-b border-[var(--app-border)] hover:bg-[var(--app-card-bg)] transition-colors"
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-body text-sm font-medium text-[var(--app-text)] truncate flex-1">
                      {t.counterpartyName}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {t.unreadCount > 0 && (
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      )}
                      <span className="font-body text-[10px] text-[var(--app-text-faint)]">
                        {fmtTime(t.lastMessageAt)}
                      </span>
                    </div>
                  </div>
                  <div className="font-body text-[10px] text-brand-gold font-mono">{t.counterpartyCode}</div>
                </button>
              ))
            )}
          </div>
        )}

        {activeTab === "messages" && selectedThread && (
          <>
            {/* Thread header */}
            <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: "1px solid var(--app-border)" }}>
              <button
                onClick={() => setSelectedThread(null)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--app-text-muted)] hover:bg-[var(--app-hover)]"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="font-body text-sm font-medium text-[var(--app-text)]">
                {dmThreads.find((t) => t.id === selectedThread)?.counterpartyName || "Chat"}
              </span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {threadMessages.map((m: any) => {
                const isMine = m.senderPartnerCode === partnerCode;
                return (
                  <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <div
                      className="max-w-[75%] px-3 py-2 rounded-2xl"
                      style={{
                        background: isMine ? "var(--brand-gold)" : "var(--app-input-bg)",
                        color: isMine ? "var(--app-button-gold-text)" : "var(--app-text)",
                      }}
                    >
                      <div className="font-body text-sm whitespace-pre-wrap">{m.content}</div>
                      <div className={`font-body text-[8px] mt-0.5 ${isMine ? "text-black/40" : "text-[var(--app-text-faint)]"}`}>
                        {fmtTime(m.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Compose */}
            <div className="px-3 py-2 flex gap-2" style={{ borderTop: "1px solid var(--app-border)" }}>
              <input
                type="text"
                value={dmDraft}
                onChange={(e) => setDmDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendDm()}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 rounded-lg font-body text-sm"
                style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)", color: "var(--app-text)", outline: "none" }}
              />
              <button
                onClick={sendDm}
                disabled={sendingDm || !dmDraft.trim()}
                className="px-3 py-2 rounded-lg font-body text-xs font-semibold disabled:opacity-40"
                style={{ background: "var(--brand-gold)", color: "var(--app-button-gold-text)" }}
              >
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
