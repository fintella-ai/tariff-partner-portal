"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useDevice } from "@/lib/useDevice";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

const SUGGESTED_PROMPTS = [
  "How do commissions work on this portal?",
  "What's the status of my most recent deal?",
  "How do I invite a new partner to my downline?",
  "How much have I earned in total so far?",
  "Walk me through submitting a new client.",
];

export default function AiAssistantPage() {
  const device = useDevice();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mocked, setMocked] = useState(false);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ─── LOAD CONVERSATIONS + CONFIG ─────────────────────────────────────
  async function loadConversations() {
    try {
      const res = await fetch("/api/ai/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch {}
  }

  async function loadConfig() {
    try {
      const res = await fetch("/api/ai/chat");
      if (res.ok) {
        const data = await res.json();
        setAiEnabled(data.enabled);
      }
    } catch {}
  }

  useEffect(() => {
    Promise.all([loadConversations(), loadConfig()]).then(() => setLoading(false));
  }, []);

  // ─── LOAD A CONVERSATION'S MESSAGES ──────────────────────────────────
  const loadConversation = useCallback(async (id: string) => {
    setError("");
    try {
      const res = await fetch(`/api/ai/conversations/${id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.conversation.messages || []);
        setActiveId(id);
      }
    } catch {
      setError("Failed to load conversation.");
    }
  }, []);

  // ─── START NEW CONVERSATION ──────────────────────────────────────────
  function startNew() {
    setActiveId(null);
    setMessages([]);
    setError("");
    setSidebarOpen(false);
  }

  // ─── SEND MESSAGE ────────────────────────────────────────────────────
  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError("");

    // Optimistic user message
    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, message: trimmed }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to send message.");
        // Remove optimistic
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        return;
      }

      // Replace optimistic with real server-side messages
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimistic.id),
        data.userMessage,
        data.assistantMessage,
      ]);
      setActiveId(data.conversationId);
      setMocked(!!data.mocked);
      // Refresh conversation list so new/updated convo shows at top
      loadConversations();
    } catch {
      setError("Network error. Please try again.");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }

  // ─── DELETE CONVERSATION ─────────────────────────────────────────────
  async function deleteConversation(id: string) {
    if (!confirm("Delete this conversation permanently?")) return;
    try {
      const res = await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeId === id) {
          setActiveId(null);
          setMessages([]);
        }
      }
    } catch {}
  }

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const showEmptyState = messages.length === 0 && !activeId;

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 120px)" }}>
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-body text-[11px] text-[var(--app-text-muted)] tracking-[1px] uppercase mb-1">
              AI Assistant
            </div>
            <h2 className={`font-display ${device.isMobile ? "text-xl" : "text-2xl"} font-bold mb-1 flex items-center gap-2`}>
              Fintella PartnerOS
              <span className="font-body text-[10px] bg-brand-gold/15 text-brand-gold border border-brand-gold/30 rounded-full px-2 py-0.5 tracking-wider uppercase">
                Beta
              </span>
            </h2>
            <p className="font-body text-[12px] text-[var(--app-text-muted)]">
              Ask me anything about the portal, your deals, commissions, or downline.
            </p>
          </div>
          <div className="flex gap-2">
            {!device.isDesktop && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="font-body text-[11px] border border-[var(--app-border)] rounded-lg px-3 py-2 text-[var(--app-text-muted)] hover:text-[var(--app-text)] min-h-[44px]"
              >
                History
              </button>
            )}
            <button
              onClick={startNew}
              className="font-body text-[11px] font-semibold tracking-wider bg-brand-gold/15 border border-brand-gold/30 text-brand-gold rounded-lg px-3 py-2 hover:bg-brand-gold/25 min-h-[44px]"
            >
              + New Chat
            </button>
          </div>
        </div>

        {aiEnabled === false && (
          <div className="mt-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 font-body text-[11px] text-yellow-400">
            ⚠️ AI Assistant is running in mock mode — an admin has not configured ANTHROPIC_API_KEY. Responses are placeholders.
          </div>
        )}
      </div>

      {/* Main layout: sidebar + chat */}
      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* ── SIDEBAR (desktop inline, mobile overlay) ── */}
        {device.isDesktop ? (
          <div className="w-[260px] shrink-0 bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-[var(--app-border)] font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">
              Recent Conversations
            </div>
            <ConversationList
              conversations={conversations}
              activeId={activeId}
              loading={loading}
              onSelect={loadConversation}
              onDelete={deleteConversation}
            />
          </div>
        ) : (
          sidebarOpen && (
            <>
              <div
                className="fixed inset-0 bg-black/60 z-[998] backdrop-blur-sm"
                onClick={() => setSidebarOpen(false)}
              />
              <div className="fixed left-0 top-0 bottom-0 w-[280px] max-w-[85vw] z-[999] bg-[var(--app-bg-secondary)] border-r border-[var(--app-border)] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--app-border)]">
                  <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">
                    Conversations
                  </div>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="text-[var(--app-text-muted)] w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--app-input-bg)]"
                  >
                    ✕
                  </button>
                </div>
                <ConversationList
                  conversations={conversations}
                  activeId={activeId}
                  loading={loading}
                  onSelect={(id) => {
                    loadConversation(id);
                    setSidebarOpen(false);
                  }}
                  onDelete={deleteConversation}
                />
              </div>
            </>
          )
        )}

        {/* ── CHAT AREA ── */}
        <div className="flex-1 flex flex-col bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-xl overflow-hidden min-w-0">
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            {showEmptyState ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4">
                <div className="text-5xl mb-3">🤖</div>
                <div className="font-display text-xl font-bold mb-1">How can I help?</div>
                <div className="font-body text-[12px] text-[var(--app-text-muted)] mb-6 max-w-md">
                  I have access to your partner data and can answer questions about your deals, commissions, and how the portal works.
                </div>
                <div className="flex flex-col gap-2 w-full max-w-md">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => sendMessage(prompt)}
                      disabled={sending}
                      className="text-left bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-4 py-3 font-body text-[13px] text-[var(--app-text-secondary)] hover:border-brand-gold/30 hover:text-[var(--app-text)] transition-all disabled:opacity-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                {sending && (
                  <div className="flex justify-start">
                    <div className="bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl rounded-bl-sm px-4 py-3 max-w-[85%]">
                      <div className="flex gap-1 items-center">
                        <span className="w-2 h-2 bg-brand-gold rounded-full animate-pulse" />
                        <span className="w-2 h-2 bg-brand-gold rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
                        <span className="w-2 h-2 bg-brand-gold rounded-full animate-pulse" style={{ animationDelay: "0.4s" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Error banner */}
          {error && (
            <div className="bg-red-500/10 border-t border-red-500/20 px-4 py-2 font-body text-[12px] text-red-400">
              {error}
            </div>
          )}
          {mocked && messages.length > 0 && (
            <div className="bg-yellow-500/10 border-t border-yellow-500/20 px-4 py-2 font-body text-[11px] text-yellow-400">
              Running in mock mode — this is a placeholder response, not a real AI reply.
            </div>
          )}

          {/* Input */}
          <div className="border-t border-[var(--app-border)] p-3">
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(input);
                  }
                }}
                placeholder="Ask me anything..."
                rows={1}
                disabled={sending}
                maxLength={4000}
                className="flex-1 bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl px-4 py-3 font-body text-[13px] text-[var(--app-text)] outline-none focus:border-brand-gold/30 transition-colors resize-none max-h-32 placeholder:text-[var(--app-text-muted)] disabled:opacity-50"
                style={{ minHeight: "44px" }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || sending}
                className="bg-brand-gold/20 border border-brand-gold/30 text-brand-gold rounded-xl px-5 py-3 font-body text-[13px] font-semibold hover:bg-brand-gold/30 transition-colors disabled:opacity-50 min-h-[44px] whitespace-nowrap"
              >
                {sending ? "..." : "Send"}
              </button>
            </div>
            <div className="font-body text-[10px] text-[var(--app-text-muted)] mt-1.5 text-right">
              Enter to send · Shift+Enter for newline
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SUBCOMPONENTS ──────────────────────────────────────────────────────

function ConversationList({
  conversations,
  activeId,
  loading,
  onSelect,
  onDelete,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="p-4 font-body text-[12px] text-[var(--app-text-muted)] text-center">Loading...</div>
    );
  }
  if (conversations.length === 0) {
    return (
      <div className="p-4 font-body text-[12px] text-[var(--app-text-muted)] text-center">
        No conversations yet. Start a new chat to get help.
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto">
      {conversations.map((c) => (
        <div
          key={c.id}
          className={`group flex items-start gap-2 px-4 py-3 border-b border-[var(--app-border)] cursor-pointer transition-colors ${
            activeId === c.id ? "bg-brand-gold/10" : "hover:bg-[var(--app-input-bg)]"
          }`}
          onClick={() => onSelect(c.id)}
        >
          <div className="flex-1 min-w-0">
            <div className="font-body text-[12px] text-[var(--app-text)] font-medium truncate">
              {c.title || "Untitled"}
            </div>
            <div className="font-body text-[10px] text-[var(--app-text-muted)] mt-0.5">
              {new Date(c.updatedAt).toLocaleDateString()} · {c.messageCount} msg
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(c.id);
            }}
            className="opacity-0 group-hover:opacity-100 text-[var(--app-text-muted)] hover:text-red-400 w-7 h-7 flex items-center justify-center rounded transition-opacity"
            title="Delete conversation"
          >
            🗑
          </button>
        </div>
      ))}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-xl px-4 py-3 ${
          isUser
            ? "bg-brand-gold/15 border border-brand-gold/20 rounded-br-sm"
            : "bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-bl-sm"
        }`}
      >
        {!isUser && (
          <div className="font-body text-[10px] font-semibold text-brand-gold mb-1 tracking-wider uppercase">
            PartnerOS
          </div>
        )}
        <div className="font-body text-[13px] text-[var(--app-text)] leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </div>
        <div className="font-body text-[10px] text-[var(--app-text-muted)] mt-1.5">
          {new Date(message.createdAt).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}
