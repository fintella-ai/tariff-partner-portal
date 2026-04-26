"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { PERSONAS, type PersonaId } from "@/lib/ai-personas";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  speakerPersona?: string | null;
}

interface Props {
  messages: ChatMessage[];
  sending: boolean;
  onSend: (text: string) => void;
  persona: PersonaId;
  liveChatEnabled: boolean;
  onTalkToPerson: () => void;
}

const SUGGESTED_PROMPTS = [
  "How do commissions work?",
  "What’s my latest deal status?",
  "How do I invite a partner?",
];

export default function ChatPanel({
  messages,
  sending,
  onSend,
  persona,
  liveChatEnabled,
  onTalkToPerson,
}: Props) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const p = PERSONAS[persona];

  // Auto-scroll on new messages or sending state change
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollH = textareaRef.current.scrollHeight;
      // Clamp to 3 lines (~72px)
      textareaRef.current.style.height = `${Math.min(scrollH, 72)}px`;
    }
  }, [input]);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    onSend(trimmed);
    setInput("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Message area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
        {/* AI Disclosure — required by CA SB 243, CO AI Act, UT AI Policy Act, WA chatbot law, FTC guidance */}
        <div className="mb-3 px-3 py-2 rounded-lg bg-[var(--app-card-bg)] border border-[var(--app-border)] text-center">
          <p className="font-body text-[10px] text-[var(--app-text-muted)] leading-relaxed">
            You are chatting with an <strong>AI assistant</strong>, not a human.
            This conversation is recorded and stored.
            This AI does not provide legal, tax, or financial advice.
            By continuing, you consent to the recording of this interaction.
          </p>
        </div>

        {isEmpty ? (
          /* ── Empty state ── */
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-6">
            <Image
              src={p.avatarSrc}
              alt={p.displayName}
              width={48}
              height={48}
              className="rounded-full"
              style={{ width: 48, height: 48 }}
            />
            <p className="font-body text-[13px] text-[var(--app-text)]">
              Hi! I&apos;m <strong style={{ color: p.accentHex }}>{p.displayName}</strong>.
              How can I help?
            </p>
            <div className="flex flex-col gap-2 mt-2 w-full max-w-[280px]">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onSend(prompt)}
                  className="font-body text-[12px] text-[var(--app-text-secondary)] border border-[var(--app-border)] rounded-lg px-3 py-2 hover:bg-[var(--app-hover)] transition-colors text-left"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Messages ── */
          <div className="flex flex-col gap-3">
            {messages.map((msg) => {
              const isUser = msg.role === "user";
              const speakerP =
                !isUser && msg.speakerPersona
                  ? PERSONAS[msg.speakerPersona as PersonaId] ?? p
                  : p;

              return (
                <div
                  key={msg.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"} gap-2`}
                >
                  {/* Assistant avatar */}
                  {!isUser && (
                    <Image
                      src={speakerP.avatarSrc}
                      alt={speakerP.displayName}
                      width={24}
                      height={24}
                      className="rounded-full flex-shrink-0 mt-1"
                      style={{ width: 24, height: 24 }}
                    />
                  )}
                  <div
                    className={`max-w-[80%] rounded-xl px-3 py-2 ${
                      isUser
                        ? "bg-blue-600/20 border border-blue-500/20 rounded-br-sm"
                        : "bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-bl-sm"
                    }`}
                  >
                    <div className="font-body text-[13px] text-[var(--app-text)] leading-relaxed whitespace-pre-wrap break-words">
                      {msg.content}
                    </div>
                    <div className="font-body text-[9px] text-[var(--app-text-muted)] mt-1">
                      {new Date(msg.createdAt).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Typing indicator */}
            {sending && (
              <div className="flex items-start gap-2">
                <Image
                  src={p.avatarSrc}
                  alt={p.displayName}
                  width={24}
                  height={24}
                  className="rounded-full flex-shrink-0 mt-1"
                  style={{ width: 24, height: 24 }}
                />
                <div className="bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-xl rounded-bl-sm px-3 py-2.5 flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 bg-[var(--app-text-muted)] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-[var(--app-text-muted)] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-[var(--app-text-muted)] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Input bar ── */}
      <div className="border-t border-[var(--app-border)] px-3 py-2.5">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask ${p.displayName}...`}
            className="flex-1 bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2 text-[var(--app-text)] font-body text-[13px] outline-none focus:border-brand-gold/30 transition-colors placeholder:text-[var(--app-text-muted)] resize-none"
            style={{ minHeight: 36, maxHeight: 72 }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="flex-shrink-0 bg-brand-gold/20 text-brand-gold border border-brand-gold/30 rounded-lg w-9 h-9 flex items-center justify-center font-body text-sm font-semibold hover:bg-brand-gold/30 transition-colors disabled:opacity-40"
            title="Send"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Talk to a person link */}
        {liveChatEnabled && (
          <button
            type="button"
            onClick={onTalkToPerson}
            className="mt-2 font-body text-[11px] text-[var(--app-text-muted)] hover:text-brand-gold transition-colors underline underline-offset-2"
          >
            Talk to a person
          </button>
        )}
      </div>
    </div>
  );
}
