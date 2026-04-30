"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { W, RADII, SHADOWS, glassCardStyle, goldButtonStyle, inputStyle } from "./widget-theme";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const WELCOME = "Hi! I can help you set up and use the Fintella widget in your TMS. What do you need help with?";
const CHIPS = ["How to install", "Troubleshoot", "Features"];

export default function WidgetChat({ token }: { token: string }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: WELCOME },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;

    const userMsg: Message = { role: "user", content: text.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/widget/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: updated }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply || "Sorry, I could not respond." }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Network error — please try again." }]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [messages, sending, token]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Messages area */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: "auto", padding: 16,
          display: "flex", flexDirection: "column", gap: 10,
        }}
      >
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: "flex",
            justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
          }}>
            <div style={{
              maxWidth: "85%", padding: "10px 14px", borderRadius: RADII.md,
              fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap",
              ...(msg.role === "user"
                ? {
                    background: "rgba(196,160,80,0.08)",
                    border: "1px solid rgba(196,160,80,0.12)",
                    color: W.text,
                  }
                : {
                    ...glassCardStyle(),
                    color: W.textSecondary,
                    boxShadow: SHADOWS.card,
                  }),
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {/* Quick-action chips after welcome only */}
        {messages.length === 1 && !sending && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, justifyContent: "center" }}>
            {CHIPS.map((chip, i) => (
              <button
                key={chip}
                onClick={() => sendMessage(chip)}
                style={{
                  background: "rgba(196,160,80,0.08)",
                  border: "1px solid rgba(196,160,80,0.2)",
                  color: W.gold, fontSize: 12, fontWeight: 600,
                  padding: "8px 18px", borderRadius: RADII.full,
                  cursor: "pointer", transition: "all 0.3s",
                  animation: `chipGlow 2.5s ease-in-out ${i * 0.3}s infinite`,
                  boxShadow: "0 0 8px rgba(196,160,80,0.1)",
                }}
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Typing indicator */}
        {sending && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{
              ...glassCardStyle(), padding: "10px 18px",
              display: "flex", gap: 4, alignItems: "center",
            }}>
              {[0, 1, 2].map((dot) => (
                <div key={dot} style={{
                  width: 6, height: 6, borderRadius: "50%", background: W.gold,
                  animation: `dotPulse 1.4s ease-in-out ${dot * 0.16}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div style={{
        padding: "10px 16px 14px",
        borderTop: `1px solid ${W.border}`,
        display: "flex", gap: 8, alignItems: "flex-end",
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the widget..."
          rows={1}
          style={{
            ...inputStyle(),
            flex: 1, resize: "none",
            maxHeight: 80, minHeight: 40,
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || sending}
          style={{
            ...goldButtonStyle(!input.trim() || sending),
            width: 40, height: 40, padding: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, borderRadius: RADII.sm + 2,
          }}
        >
          ↑
        </button>
      </div>

      <style>{`
        @keyframes dotPulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
        @keyframes chipGlow {
          0%, 100% {
            box-shadow: 0 0 8px rgba(196,160,80,0.1);
            border-color: rgba(196,160,80,0.2);
            background: rgba(196,160,80,0.08);
          }
          50% {
            box-shadow: 0 0 16px rgba(196,160,80,0.3), 0 0 4px rgba(196,160,80,0.15) inset;
            border-color: rgba(196,160,80,0.4);
            background: rgba(196,160,80,0.14);
          }
        }
      `}</style>
    </div>
  );
}
