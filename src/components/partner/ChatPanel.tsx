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

/** Only allow safe href values — internal paths or https URLs */
function sanitizeHref(raw: string): string | null {
  if (raw.startsWith("/")) return raw;
  if (raw.startsWith("https://")) return raw;
  if (raw.startsWith("http://")) return raw;
  return null;
}

/** Render markdown links [text](url) and **bold** as React elements */
function renderMessageContent(text: string): React.ReactNode {
  const linkParts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  const elements: React.ReactNode[] = [];

  linkParts.forEach((part, i) => {
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, label, rawHref] = linkMatch;
      const href = sanitizeHref(rawHref);
      if (!href) {
        elements.push(<span key={`text-${i}`}>{label}</span>);
      } else if (href.startsWith("/")) {
        elements.push(
          <a
            key={`link-${i}`}
            href={href}
            className="text-brand-gold hover:underline font-semibold"
            onClick={(e) => {
              e.preventDefault();
              window.location.href = href;
            }}
          >
            {label}
          </a>
        );
      } else {
        elements.push(
          <a
            key={`link-${i}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-gold hover:underline font-semibold"
          >
            {label}
          </a>
        );
      }
    } else {
      // Process bold markers within non-link text
      const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
      boldParts.forEach((bp, j) => {
        const boldMatch = bp.match(/^\*\*([^*]+)\*\*$/);
        if (boldMatch) {
          elements.push(<strong key={`bold-${i}-${j}`}>{boldMatch[1]}</strong>);
        } else if (bp) {
          // Detect portal paths like /dashboard/... and make them clickable
          const pathParts = bp.split(/(\/dashboard\/[^\s,.)]+|\/admin\/[^\s,.)]+)/g);
          pathParts.forEach((pp, k) => {
            if (pp.startsWith("/dashboard/") || pp.startsWith("/admin/")) {
              elements.push(
                <a key={`path-${i}-${j}-${k}`} href={pp} className="text-brand-gold hover:underline font-semibold" onClick={(e) => { e.preventDefault(); window.location.href = pp; }}>
                  {pp}
                </a>
              );
            } else if (pp) {
              elements.push(<span key={`text-${i}-${j}-${k}`}>{pp}</span>);
            }
          });
        }
      });
    }
  });

  return elements;
}

function isSelectableListItem(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^- \d{1,2}:\d{2}\s*(AM|PM)/i.test(trimmed)) return true;
  if (/^- .{3,60}$/.test(trimmed) && !/^- \*\*/.test(trimmed)) return true;
  if (/^\d+\.\s+.{3,60}$/.test(trimmed)) return true;
  return false;
}

function extractListItemText(line: string): string {
  return line.trim().replace(/^[-•]\s+/, "").replace(/^\d+\.\s+/, "");
}

function InteractiveMessage({
  content,
  onQuickReply,
  isLastAssistant,
}: {
  content: string;
  onQuickReply: (text: string) => void;
  isLastAssistant: boolean;
}) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let currentText: string[] = [];
  let listItems: string[] = [];

  const flushText = (key: string) => {
    if (currentText.length > 0) {
      blocks.push(
        <span key={key}>{renderMessageContent(currentText.join("\n"))}</span>
      );
      currentText = [];
    }
  };

  const flushList = (key: string) => {
    if (listItems.length > 0) {
      if (isLastAssistant) {
        blocks.push(
          <div key={key} className="flex flex-wrap gap-1.5 my-1.5">
            {listItems.map((item, j) => (
              <button
                key={j}
                type="button"
                onClick={() => onQuickReply(item)}
                className="font-body text-[12px] px-3 py-1.5 rounded-lg bg-brand-gold/10 text-brand-gold border border-brand-gold/20 hover:bg-brand-gold/20 transition-colors text-left"
              >
                {renderMessageContent(item)}
              </button>
            ))}
          </div>
        );
      } else {
        blocks.push(
          <span key={key}>{renderMessageContent(listItems.map((i) => `- ${i}`).join("\n"))}</span>
        );
      }
      listItems = [];
    }
  };

  lines.forEach((line, i) => {
    if (isSelectableListItem(line)) {
      flushText(`t-${i}`);
      listItems.push(extractListItemText(line));
    } else {
      flushList(`l-${i}`);
      currentText.push(line);
    }
  });
  flushList("l-end");
  flushText("t-end");

  return <>{blocks}</>;
}

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
        {/* AI Disclosure — CA SB 243, CO AI Act, UT AI Policy Act, WA, FTC */}
        <p className="mb-2 -mx-1 font-body text-[9px] text-[var(--app-text-muted)] text-center leading-tight">
          AI assistant, not a human. Recorded. Not legal/tax/financial advice. Continuing = consent.
        </p>

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
                      {isUser ? (
                        renderMessageContent(msg.content)
                      ) : (
                        <InteractiveMessage
                          content={msg.content}
                          onQuickReply={onSend}
                          isLastAssistant={msg.id === messages.filter((m) => m.role === "assistant").at(-1)?.id}
                        />
                      )}
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
