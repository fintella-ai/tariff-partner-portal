"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useDevice } from "@/lib/useDevice";
import PageTabBar from "@/components/ui/PageTabBar";
import PersonaAvatar from "@/components/ai/PersonaAvatar";
import PersonaPickerModal from "@/components/ai/PersonaPickerModal";

interface ToolCallRecord {
  name: string;
  input: unknown;
  output: unknown;
  isError?: boolean;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  speakerPersona?: string | null;
  handoffMetadata?: {
    from?: string;
    to?: string;
    reason?: string;
    summary?: string;
    triggeredBy?: "llm_tool" | "user_button";
  } | null;
  toolCalls?: ToolCallRecord[] | null;
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
  const [preferredGeneralist, setPreferredGeneralist] = useState<string | null | undefined>(undefined);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pinnedSpecialist, setPinnedSpecialist] = useState<"tara" | "ollie" | null>(null);
  // Pending screenshot uploads — staged before send so Ollie's
  // investigate_bug tool can reference the URLs. Each item is a blob URL
  // returned by /api/ai/upload.
  const [pendingAttachments, setPendingAttachments] = useState<
    { url: string; name: string }[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  async function loadPersona() {
    try {
      const res = await fetch("/api/partner/settings");
      if (res.ok) {
        const data = await res.json();
        setPreferredGeneralist(data.preferredGeneralist ?? null);
      } else {
        setPreferredGeneralist(null);
      }
    } catch {
      setPreferredGeneralist(null);
    }
  }

  useEffect(() => {
    Promise.all([loadConversations(), loadConfig(), loadPersona()]).then(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (preferredGeneralist === null) {
      setPickerOpen(true);
    }
  }, [preferredGeneralist]);

  async function handlePickPersona(personaId: "finn" | "stella") {
    try {
      const res = await fetch("/api/partner/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredGeneralist: personaId }),
      });
      if (res.ok) {
        setPreferredGeneralist(personaId);
        setPickerOpen(false);
      } else {
        setError("Could not save your preference. Please try again.");
      }
    } catch {
      setError("Network error saving your preference.");
    }
  }

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

  // ─── UPLOAD ATTACHMENT ───────────────────────────────────────────────
  async function handleAttachmentSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so selecting the same file twice still fires change.
    if (e.target) e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/ai/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
        return;
      }
      setPendingAttachments((prev) => [
        ...prev,
        { url: data.url, name: file.name },
      ]);
    } catch {
      setError("Upload failed — network error");
    } finally {
      setUploading(false);
    }
  }

  function removeAttachment(url: string) {
    setPendingAttachments((prev) => prev.filter((a) => a.url !== url));
  }

  // ─── SEND MESSAGE ────────────────────────────────────────────────────
  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError("");

    // If the partner staged screenshots, append a visible hint to the
    // message so Ollie sees the URLs in her history + can pass them to
    // investigate_bug's screenshotUrls arg.
    const attachmentsNote =
      pendingAttachments.length > 0
        ? `\n\n[Partner attached ${pendingAttachments.length} screenshot${pendingAttachments.length === 1 ? "" : "s"}]:\n${pendingAttachments.map((a) => `- ${a.url}`).join("\n")}`
        : "";
    const messageToSend = `${trimmed}${attachmentsNote}`;

    // Optimistic user message — shows the trimmed text only, attachment
    // context is hidden from the rendered bubble.
    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    const attachmentsSnapshot = pendingAttachments;
    setPendingAttachments([]);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeId,
          message: messageToSend,
          pinnedSpecialist: pinnedSpecialist ?? undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to send message.");
        // Remove optimistic + restore staged attachments so the partner
        // can re-send without re-uploading.
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setPendingAttachments(attachmentsSnapshot);
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
      setPendingAttachments(attachmentsSnapshot);
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
      {/* Gate on !loading so the modal never flashes during SSR hydration /
         initial data fetch — preferredGeneralist transitions undefined → null
         which would briefly mount then unmount the picker without this guard. */}
      {!loading && (
        <PersonaPickerModal
          open={pickerOpen}
          onPick={handlePickPersona}
          onClose={preferredGeneralist ? () => setPickerOpen(false) : undefined}
          allowClose={!!preferredGeneralist}
          title={preferredGeneralist ? "Switch assistant" : "Pick your AI assistant"}
        />
      )}

      <PageTabBar
        title="Partner Support"
        tabs={[
          { label: "FinnStellaOS", href: "/dashboard/ai-assistant" },
          { label: "Support Tickets", href: "/dashboard/support" },
        ]}
      />
      {/* Header */}
      <div className="mb-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-body text-[11px] text-[var(--app-text-muted)] tracking-[1px] uppercase mb-1">
              AI Assistant
            </div>
            <h2 className={`font-display ${device.isMobile ? "text-xl" : "text-3xl"} font-bold flex items-center gap-2`}>
              FinnStellaOS
              <span className="font-body text-[10px] bg-brand-gold/15 text-brand-gold border border-brand-gold/30 rounded-full px-2 py-0.5 tracking-wider uppercase">
                Beta
              </span>
            </h2>
          </div>
          <div className="flex gap-2 shrink-0">
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

        {/* Persona + Switch/Talk to — enlarged on desktop */}
        <div className="flex items-center gap-4">
          <PersonaAvatar
            personaId={preferredGeneralist}
            size={device.isMobile ? "sm" : "lg"}
            showName
            showTagline
          />
        </div>

        {/* Switch / Specialist tabs — centered */}
        <div className="flex items-center justify-center gap-4 py-2 border-y border-[var(--app-border)]">
          {preferredGeneralist && (
            <button
              onClick={() => setPickerOpen(true)}
              className="font-body text-[11px] uppercase tracking-wider font-semibold text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition"
            >
              Switch
            </button>
          )}
          {pinnedSpecialist ? (
            <button
              onClick={() => setPinnedSpecialist(null)}
              className="font-body text-[11px] uppercase tracking-wider font-semibold text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition"
            >
              ← Back to {preferredGeneralist === "stella" ? "Stella" : "Finn"}
            </button>
          ) : (
            <>
              <button
                onClick={() => setPinnedSpecialist("tara")}
                className="font-body text-[11px] uppercase tracking-wider font-semibold text-[var(--app-text-muted)] hover:text-[#5e7eb8] transition"
              >
                Talk to Tara
              </button>
              <button
                onClick={() => setPinnedSpecialist("ollie")}
                className="font-body text-[11px] uppercase tracking-wider font-semibold text-[var(--app-text-muted)] hover:text-[#4a9d9c] transition"
              >
                Talk to Ollie
              </button>
            </>
          )}
        </div>

        {aiEnabled === false && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 font-body text-[11px] text-yellow-400">
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
            {/* AI Disclosure — CA SB 243, CO AI Act, UT AI Policy Act, WA chatbot law, FTC */}
            <div className="mb-4 px-4 py-2.5 rounded-lg bg-[var(--app-input-bg)] border border-[var(--app-border)] text-center">
              <p className="font-body text-[11px] text-[var(--app-text-muted)] leading-relaxed">
                You are chatting with an <strong>AI assistant</strong>, not a human.
                This conversation is recorded and stored.
                This AI does not provide legal, tax, or financial advice.
                By continuing, you consent to the recording of this interaction.
              </p>
            </div>

            {showEmptyState ? (
              <div className="flex flex-col items-center text-center px-4 pt-8 sm:pt-16">
                <div className="text-5xl mb-4">🤖</div>
                <div className="font-display text-xl font-bold mb-2">How can I help?</div>
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
                {messages.map((msg, i) => {
                  const prev = messages[i - 1];
                  const showTransition =
                    msg.role === "assistant" &&
                    msg.speakerPersona &&
                    prev?.role === "assistant" &&
                    prev.speakerPersona &&
                    prev.speakerPersona !== msg.speakerPersona;
                  return (
                    <div key={msg.id}>
                      {showTransition && (
                        <div className="flex items-center gap-2 my-2 px-3 py-2 rounded-lg bg-[var(--app-input-bg)] border border-[var(--app-border)]">
                          <PersonaAvatar personaId={prev?.speakerPersona} size="sm" showName />
                          <span className="font-body text-[10px] text-[var(--app-text-muted)]">→</span>
                          <PersonaAvatar personaId={msg.speakerPersona} size="sm" showName />
                          {msg.handoffMetadata?.reason && (
                            <span className="font-body text-[10px] text-[var(--app-text-muted)] italic truncate">
                              {msg.handoffMetadata.reason}
                            </span>
                          )}
                        </div>
                      )}
                      <MessageBubble message={msg} />
                    </div>
                  );
                })}
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
            {/* Staged screenshot thumbnails — appear above the textarea when
                the partner has uploaded but not yet sent. Click × to remove. */}
            {pendingAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {pendingAttachments.map((a) => (
                  <div
                    key={a.url}
                    className="relative group border border-[var(--app-border)] rounded-md overflow-hidden bg-[var(--app-input-bg)]"
                  >
                    <img
                      src={a.url}
                      alt={a.name}
                      className="h-14 w-14 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.url)}
                      className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] leading-none hover:bg-red-500"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 items-end">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleAttachmentSelect}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || sending}
                title="Attach a screenshot"
                className="shrink-0 bg-[var(--app-input-bg)] border border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-brand-gold rounded-xl px-3 py-3 font-body text-[14px] min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50"
              >
                {uploading ? "…" : "📎"}
              </button>
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
              Enter to send · Shift+Enter for newline · 📎 to attach a screenshot
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
  const toolCalls = Array.isArray(message.toolCalls) ? message.toolCalls : [];
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
          <div className="mb-1">
            <PersonaAvatar
              personaId={message.speakerPersona}
              size="sm"
              showName
              showTagline={false}
            />
          </div>
        )}
        {toolCalls.length > 0 && (
          <div className="mb-2 flex flex-col gap-1.5">
            {toolCalls.map((tc, i) => (
              <ToolCallChip key={i} call={tc} />
            ))}
          </div>
        )}
        <div className="font-body text-[13px] text-[var(--app-text)] leading-relaxed whitespace-pre-wrap break-words">
          <LinkifiedText text={message.content} />
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

// ─── OLLIE TOOL-CALL CHIP ─────────────────────────────────────────────────
// Renders a compact summary chip for each DB lookup Ollie ran to produce the
// reply. Click to expand and see the raw input + output JSON. Works in both
// light + dark themes via var(--app-*) vars; no hardcoded hex.
const TOOL_LABELS: Record<string, string> = {
  lookupDeal: "Deal lookup",
  lookupCommissions: "Commission lookup",
  lookupAgreement: "Agreement lookup",
  lookupDownline: "Downline lookup",
  create_support_ticket: "Ticket created",
  start_live_chat: "Live chat started",
  initiate_live_transfer: "Live call initiated",
  offer_schedule_slots: "Slots offered",
  book_slot: "Call booked",
  investigate_bug: "Bug triaged",
};

function ToolCallChip({ call }: { call: ToolCallRecord }) {
  const [open, setOpen] = useState(false);
  const label = TOOL_LABELS[call.name] || call.name;
  const summary = describeToolCall(call);
  return (
    <div
      className={`rounded-md border text-[11px] ${
        call.isError
          ? "border-red-500/30 bg-red-500/5"
          : "border-[var(--app-border)] bg-[var(--app-surface)]"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left"
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm leading-none" aria-hidden>
            🔎
          </span>
          <span className="font-body font-medium text-[var(--app-text)] shrink-0">
            {label}
          </span>
          <span className="font-body text-[var(--app-text-muted)] truncate">
            {summary}
          </span>
        </span>
        <span className="font-body text-[var(--app-text-muted)] shrink-0">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div className="border-t border-[var(--app-border)] px-2.5 py-2 space-y-2 font-mono text-[10px] leading-snug">
          <div>
            <div className="text-[var(--app-text-muted)] mb-0.5">input</div>
            <pre className="overflow-x-auto text-[var(--app-text)]">
              {safeJson(call.input)}
            </pre>
          </div>
          <div>
            <div className="text-[var(--app-text-muted)] mb-0.5">
              {call.isError ? "error" : "output"}
            </div>
            <pre className="overflow-x-auto text-[var(--app-text)]">
              {safeJson(call.output)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function describeToolCall(call: ToolCallRecord): string {
  const input = (call.input ?? {}) as Record<string, unknown>;
  const output = (call.output ?? {}) as Record<string, unknown>;
  if (call.isError) return "failed";
  switch (call.name) {
    case "lookupDeal": {
      const q = typeof input.query === "string" ? `"${input.query}"` : "";
      const n = typeof output.count === "number" ? output.count : undefined;
      return `${q}${n !== undefined ? ` — ${n} match${n === 1 ? "" : "es"}` : ""}`;
    }
    case "lookupCommissions": {
      const status =
        typeof input.status === "string" ? input.status : "all";
      const totals = (output.totals ?? {}) as Record<string, number>;
      const count = totals.count ?? 0;
      return `${status} · ${count} entr${count === 1 ? "y" : "ies"}`;
    }
    case "lookupAgreement": {
      const has = output.hasAgreement;
      const status =
        typeof output.status === "string" ? ` · ${output.status}` : "";
      return has === false ? "none on file" : `found${status}`;
    }
    case "lookupDownline": {
      const depth = typeof input.depth === "number" ? input.depth : 1;
      const direct =
        typeof output.directCount === "number" ? output.directCount : 0;
      const grand =
        typeof output.grandDownlineCount === "number"
          ? output.grandDownlineCount
          : undefined;
      return depth === 2 && grand !== undefined
        ? `direct ${direct} · grand ${grand}`
        : `direct ${direct}`;
    }
    case "create_support_ticket": {
      const routed = (output.routedTo ?? {}) as Record<string, unknown>;
      const role =
        typeof routed.role === "string" ? routed.role : "support";
      const priority =
        typeof output.priority === "string" ? ` · ${output.priority}` : "";
      return `routed to ${role}${priority}`;
    }
    case "start_live_chat": {
      const n =
        typeof output.onlineAdminsNotified === "number"
          ? output.onlineAdminsNotified
          : 0;
      const subj =
        typeof output.subject === "string" ? output.subject.slice(0, 40) : "";
      return `${n} admin${n === 1 ? "" : "s"} · ${subj}`;
    }
    case "initiate_live_transfer": {
      const n =
        typeof output.onlineAdminsNotified === "number"
          ? output.onlineAdminsNotified
          : 0;
      const routed = (output.routedTo ?? {}) as Record<string, unknown>;
      const role =
        typeof routed.role === "string" ? routed.role : "support";
      return `${n} admin${n === 1 ? "" : "s"} · ${role}`;
    }
    case "offer_schedule_slots": {
      const slots = Array.isArray(output.slots) ? output.slots : [];
      const inbox = (output.inbox ?? {}) as Record<string, unknown>;
      const role = typeof inbox.role === "string" ? inbox.role : "support";
      return `${slots.length} slot${slots.length === 1 ? "" : "s"} · ${role}`;
    }
    case "book_slot": {
      const startUtc =
        typeof output.startUtc === "string" ? output.startUtc : "";
      const when = startUtc
        ? new Date(startUtc).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : "";
      const routed = (output.routedTo ?? {}) as Record<string, unknown>;
      const role = typeof routed.role === "string" ? routed.role : "";
      return `${when}${role ? ` · ${role}` : ""}`;
    }
    case "investigate_bug": {
      const classification =
        typeof output.classification === "string"
          ? output.classification.replace(/_/g, " ")
          : "";
      const priority =
        typeof output.priority === "string" ? output.priority : "";
      return `${classification}${priority ? ` · ${priority}` : ""}`;
    }
    default:
      return "";
  }
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

// ─── Linkified text — turns portal paths and URLs into clickable links ──────

function LinkifiedText({ text }: { text: string }) {
  const parts = text.split(/((?:https?:\/\/[^\s]+)|(?:\/dashboard\/[^\s,.)]+)|(?:\/admin\/[^\s,.)]+)|\[([^\]]+)\]\(([^)]+)\))/g);
  const result: React.ReactNode[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    // Markdown link: [text](url)
    const mdMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (mdMatch) {
      result.push(
        <a key={i} href={mdMatch[2]} className="text-brand-gold underline underline-offset-2 hover:text-brand-gold/80" target={mdMatch[2].startsWith("http") ? "_blank" : undefined} rel={mdMatch[2].startsWith("http") ? "noopener noreferrer" : undefined}>
          {mdMatch[1]}
        </a>
      );
      continue;
    }

    // Portal path: /dashboard/... or /admin/...
    if (part.startsWith("/dashboard/") || part.startsWith("/admin/")) {
      result.push(
        <a key={i} href={part} className="text-brand-gold underline underline-offset-2 hover:text-brand-gold/80">
          {part}
        </a>
      );
      continue;
    }

    // Full URL
    if (part.startsWith("http://") || part.startsWith("https://")) {
      result.push(
        <a key={i} href={part} className="text-brand-gold underline underline-offset-2 hover:text-brand-gold/80" target="_blank" rel="noopener noreferrer">
          {part}
        </a>
      );
      continue;
    }

    result.push(part);
  }

  return <>{result}</>;
}
