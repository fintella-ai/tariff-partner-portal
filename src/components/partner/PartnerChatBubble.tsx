"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { PERSONAS, resolvePersonaId, type PersonaId } from "@/lib/ai-personas";
import { useDevice } from "@/lib/useDevice";
import PersonaSwitcherRow from "./PersonaSwitcherRow";
import ChatPanel, { type ChatMessage } from "./ChatPanel";
import InlineTicketForm from "./InlineTicketForm";

// ─── LOCALSTORAGE KEYS ─────────────────────────────────────────────────────
const LS_OPEN = "fintella.partner.chatBubble.open";
const LS_CONVO_ID = "fintella.partner.chatBubble.conversationId";
const LS_INTRO_SEEN = "fintella.partner.chatBubbleIntro";

interface Props {
  preferredPersona: PersonaId;
  liveChatEnabled: boolean;
  aiEnabled: boolean;
}

export default function PartnerChatBubble({
  preferredPersona,
  liveChatEnabled,
  aiEnabled,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const device = useDevice();
  const [open, setOpen] = useState(false);
  const [persona, setPersona] = useState<PersonaId>(preferredPersona);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [introSeen, setIntroSeen] = useState(true); // default true to avoid flash
  const unreadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── INLINE TICKET FORM STATE ────────────────────────────────────────────
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketPrefill, setTicketPrefill] = useState<{
    subject?: string;
    category?: string;
    description?: string;
    priority?: string;
    dealId?: string;
  }>({});
  // Whether the last assistant message mentions support (for inline link)
  const [showSupportLink, setShowSupportLink] = useState(false);

  // ─── HYDRATE FROM LOCALSTORAGE ──────────────────────────────────────────
  useEffect(() => {
    try {
      const savedOpen = localStorage.getItem(LS_OPEN);
      if (savedOpen === "true") setOpen(true);
      const savedConvo = localStorage.getItem(LS_CONVO_ID);
      if (savedConvo) setConversationId(savedConvo);
      const intro = localStorage.getItem(LS_INTRO_SEEN);
      setIntroSeen(intro === "true");
    } catch {
      // localStorage may be unavailable
    }
  }, []);

  // ─── PERSIST OPEN STATE ─────────────────────────────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(LS_OPEN, open ? "true" : "false");
    } catch {}
  }, [open]);

  // ─── PERSIST CONVERSATION ID ────────────────────────────────────────────
  useEffect(() => {
    try {
      if (conversationId) {
        localStorage.setItem(LS_CONVO_ID, conversationId);
      } else {
        localStorage.removeItem(LS_CONVO_ID);
      }
    } catch {}
  }, [conversationId]);

  // ─── MARK INTRO SEEN ON FIRST OPEN ─────────────────────────────────────
  useEffect(() => {
    if (open && !introSeen) {
      setIntroSeen(true);
      try {
        localStorage.setItem(LS_INTRO_SEEN, "true");
      } catch {}
    }
  }, [open, introSeen]);

  // ─── LOAD MESSAGES WHEN PANEL OPENS ─────────────────────────────────────
  const loadMessages = useCallback(async (convoId: string) => {
    try {
      const res = await fetch(`/api/ai/conversations/${convoId}`);
      if (res.ok) {
        const data = await res.json();
        const msgs: ChatMessage[] = (data.conversation?.messages || []).map(
          (m: {
            id: string;
            role: string;
            content: string;
            createdAt: string;
            speakerPersona?: string | null;
          }) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            createdAt: typeof m.createdAt === "string" ? m.createdAt : new Date(m.createdAt).toISOString(),
            speakerPersona: m.speakerPersona ?? null,
          })
        );
        setMessages(msgs);
      }
    } catch {
      // fail silently
    }
  }, []);

  useEffect(() => {
    if (open && conversationId) {
      loadMessages(conversationId);
    }
  }, [open, conversationId, loadMessages]);

  // ─── UNREAD POLLING (COLLAPSED ONLY) ────────────────────────────────────
  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/unread-count");
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.ai || 0);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!open) {
      fetchUnread();
      unreadTimerRef.current = setInterval(fetchUnread, 30000);
    } else {
      setUnreadCount(0);
    }
    return () => {
      if (unreadTimerRef.current) clearInterval(unreadTimerRef.current);
    };
  }, [open, fetchUnread]);

  // ─── SEND MESSAGE ───────────────────────────────────────────────────────
  async function handleSend(text: string) {
    if (!text.trim() || sending) return;
    setSending(true);

    // Optimistic user message
    const tempId = `temp-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: tempId,
      role: "user",
      content: text.trim(),
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const pinnedSpecialist: "tara" | "ollie" | undefined =
        persona === "tara" ? "tara" : persona === "ollie" ? "ollie" : undefined;

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId || undefined,
          message: text.trim(),
          pinnedSpecialist,
          currentPage: pathname,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Store conversation ID from response
        if (data.conversationId && data.conversationId !== conversationId) {
          setConversationId(data.conversationId);
        }

        // Replace optimistic + add assistant message
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== tempId);
          const final: ChatMessage[] = [...filtered];

          if (data.userMessage) {
            final.push({
              id: data.userMessage.id,
              role: "user",
              content: data.userMessage.content,
              createdAt:
                typeof data.userMessage.createdAt === "string"
                  ? data.userMessage.createdAt
                  : new Date(data.userMessage.createdAt).toISOString(),
            });
          }

          if (data.assistantMessage) {
            final.push({
              id: data.assistantMessage.id,
              role: "assistant",
              content: data.assistantMessage.content,
              createdAt:
                typeof data.assistantMessage.createdAt === "string"
                  ? data.assistantMessage.createdAt
                  : new Date(data.assistantMessage.createdAt).toISOString(),
              speakerPersona: data.assistantMessage.speakerPersona ?? null,
            });
          }

          return final;
        });

        // ── Detect create_support_ticket tool call → show inline form ──
        const toolCalls = data.assistantMessage?.toolCalls as
          | { name: string; input: Record<string, string> }[]
          | null
          | undefined;
        if (toolCalls && Array.isArray(toolCalls)) {
          const ticketCall = toolCalls.find(
            (tc) => tc.name === "create_support_ticket"
          );
          if (ticketCall) {
            const inp = ticketCall.input ?? {};
            setTicketPrefill({
              subject: inp.subject ?? "",
              category: inp.category ?? "",
              description: inp.reason ?? "",
              priority: inp.priority ?? "normal",
              dealId: inp.relatedDealId ?? "",
            });
            setShowTicketForm(true);
          }
        }

        // ── Detect support mention in text → show inline link ──
        const text = (data.assistantMessage?.content ?? "").toLowerCase();
        setShowSupportLink(
          text.includes("support ticket") || text.includes("support page")
        );
      }
    } catch {
      // On error, remove the optimistic message
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
    }
  }

  // ─── TALK TO A PERSON ───────────────────────────────────────────────────
  function handleTalkToPerson() {
    handleSend("I'd like to talk to a real person please.");
  }

  // ─── NEW CONVERSATION ───────────────────────────────────────────────────
  function handleNewConversation() {
    setConversationId(null);
    setMessages([]);
    try {
      localStorage.removeItem(LS_CONVO_ID);
    } catch {}
  }

  // ─── EXPAND TO FULL PAGE ────────────────────────────────────────────────
  function handleExpand() {
    const url = conversationId
      ? `/dashboard/ai-assistant?conversationId=${conversationId}`
      : "/dashboard/ai-assistant";
    router.push(url);
    setOpen(false);
  }

  // ─── RENDER NOTHING IF AI DISABLED ──────────────────────────────────────
  if (!aiEnabled) return null;

  const currentPersona = PERSONAS[resolvePersonaId(persona)];
  const isMobile = device.isMobile;

  // ─── COLLAPSED BUBBLE ──────────────────────────────────────────────────
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed z-40 rounded-full shadow-lg shadow-black/20 flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${
          !introSeen ? "animate-pulse" : ""
        }`}
        style={{
          width: 56,
          height: 56,
          bottom: isMobile ? "calc(88px + env(safe-area-inset-bottom, 0px))" : 24,
          right: isMobile ? 16 : 24,
          background: "var(--app-bg-secondary)",
          border: `2px solid ${conversationId ? currentPersona.accentHex + "40" : "var(--app-border)"}`,
        }}
        title={conversationId ? `Chat with ${currentPersona.displayName}` : "Chat with FinnStellaOS"}
      >
        {conversationId && messages.length > 0 ? (
          <Image
            src={currentPersona.avatarSrc}
            alt={currentPersona.displayName}
            width={48}
            height={48}
            className="rounded-full"
            style={{ width: 48, height: 48 }}
          />
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--app-text-secondary)" }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1.5 leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
    );
  }

  // ─── EXPANDED: MOBILE (FULL SCREEN) ─────────────────────────────────────
  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col pt-safe pb-safe"
        style={{ background: "var(--app-bg)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-[var(--app-border)]">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-[var(--app-text-muted)] hover:bg-[var(--app-hover)] transition-colors"
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <Image
            src={currentPersona.avatarSrc}
            alt={currentPersona.displayName}
            width={28}
            height={28}
            className="rounded-full flex-shrink-0"
            style={{ width: 28, height: 28 }}
          />
          <span
            className="font-body text-[13px] font-semibold"
            style={{ color: currentPersona.accentHex }}
          >
            {currentPersona.displayName}
          </span>
          <div className="flex-1" />
          <PersonaSwitcherRow active={persona} onSwitch={setPersona} size={24} />
          <button
            type="button"
            onClick={handleExpand}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-[var(--app-text-muted)] hover:bg-[var(--app-hover)] transition-colors"
            title="Open full view"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
            </svg>
          </button>
        </div>

        {/* Chat body */}
        <ChatPanel
          messages={messages}
          sending={sending}
          onSend={handleSend}
          persona={persona}
          liveChatEnabled={liveChatEnabled}
          onTalkToPerson={handleTalkToPerson}
        />

        {/* Inline support link */}
        {showSupportLink && !showTicketForm && (
          <div className="px-4 py-2 border-t border-[var(--app-border)]">
            <Link
              href="/dashboard/support"
              className="font-body text-[11px] text-brand-gold hover:text-brand-gold/80 transition-colors"
            >
              Open Support Page &rarr;
            </Link>
          </div>
        )}

        {/* Inline ticket form */}
        {showTicketForm && (
          <InlineTicketForm
            prefillSubject={ticketPrefill.subject}
            prefillCategory={ticketPrefill.category}
            prefillDescription={ticketPrefill.description}
            prefillPriority={ticketPrefill.priority}
            prefillDealId={ticketPrefill.dealId}
            onCreated={() => setShowTicketForm(false)}
            onCancel={() => setShowTicketForm(false)}
          />
        )}
      </div>
    );
  }

  // ─── EXPANDED: DESKTOP/TABLET (FLOATING PANEL) ──────────────────────────
  return (
    <>
      {/* Backdrop — click to close */}
      <div
        className="fixed inset-0 z-30"
        onClick={() => setOpen(false)}
        aria-hidden
      />

      {/* Panel */}
      <div
        className="fixed z-40 flex flex-col rounded-2xl shadow-2xl shadow-black/40 border border-[var(--app-border)] overflow-hidden"
        style={{
          width: 380,
          height: 520,
          bottom: 80,
          right: 24,
          maxWidth: "calc(100vw - 3rem)",
          maxHeight: "calc(100vh - 8rem)",
          background: "var(--app-bg-secondary)",
        }}
      >
        {/* Header */}
        <div className="flex flex-col border-b border-[var(--app-border)]">
          <div className="flex items-center gap-2 px-3 py-2.5">
            <Image
              src={currentPersona.avatarSrc}
              alt={currentPersona.displayName}
              width={40}
              height={40}
              className="rounded-full flex-shrink-0"
              style={{ width: 40, height: 40 }}
            />
            <span
              className="font-body text-[13px] font-semibold"
              style={{ color: currentPersona.accentHex }}
            >
              {currentPersona.displayName}
            </span>
            <div className="flex-1" />

          {/* New conversation */}
          <button
            type="button"
            onClick={handleNewConversation}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--app-text-muted)] hover:bg-[var(--app-hover)] transition-colors"
            title="New conversation"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>

          {/* Expand */}
          <button
            type="button"
            onClick={handleExpand}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--app-text-muted)] hover:bg-[var(--app-hover)] transition-colors"
            title="Open full view"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
            </svg>
          </button>

          {/* Close */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--app-text-muted)] hover:bg-[var(--app-hover)] transition-colors"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          </div>
          <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-[var(--app-bg-secondary)]">
            <PersonaSwitcherRow active={persona} onSwitch={setPersona} size={24} />
          </div>
        </div>

        {/* Chat body */}
        <ChatPanel
          messages={messages}
          sending={sending}
          onSend={handleSend}
          persona={persona}
          liveChatEnabled={liveChatEnabled}
          onTalkToPerson={handleTalkToPerson}
        />

        {/* Inline support link */}
        {showSupportLink && !showTicketForm && (
          <div className="px-4 py-2 border-t border-[var(--app-border)]">
            <Link
              href="/dashboard/support"
              className="font-body text-[11px] text-brand-gold hover:text-brand-gold/80 transition-colors"
            >
              Open Support Page &rarr;
            </Link>
          </div>
        )}

        {/* Inline ticket form */}
        {showTicketForm && (
          <InlineTicketForm
            prefillSubject={ticketPrefill.subject}
            prefillCategory={ticketPrefill.category}
            prefillDescription={ticketPrefill.description}
            prefillPriority={ticketPrefill.priority}
            prefillDealId={ticketPrefill.dealId}
            onCreated={() => setShowTicketForm(false)}
            onCancel={() => setShowTicketForm(false)}
          />
        )}
      </div>
    </>
  );
}
