"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Thread {
  id: string;
  partnerCode: string;
  partnerName: string;
  companyName: string | null;
  lastMessageAt: string;
  lastMessage: string | null;
  lastMessageSender: string | null;
}

interface Message {
  id: string;
  senderPartnerCode: string;
  content: string;
  createdAt: string;
}

interface PartnerOption {
  partnerCode: string;
  firstName: string;
  lastName: string;
  companyName: string | null;
}

export default function AdminDmPanel() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [partnerInfo, setPartnerInfo] = useState<{ name: string; company: string | null; partnerCode: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<PartnerOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [newMessage, setNewMessage] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    const res = await fetch("/api/admin/partner-dm");
    if (res.ok) {
      const data = await res.json();
      setThreads(data.threads || []);
    }
  }, []);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  const loadMessages = async (threadId: string) => {
    setActiveThread(threadId);
    const res = await fetch(`/api/admin/partner-dm/${threadId}/messages`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages || []);
      setPartnerInfo(data.partner);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!draft.trim() || !activeThread) return;
    setSending(true);
    const res = await fetch(`/api/admin/partner-dm/${activeThread}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: draft }),
    });
    if (res.ok) {
      setDraft("");
      await loadMessages(activeThread);
      loadThreads();
    }
    setSending(false);
  };

  useEffect(() => {
    if (!search.trim() || search.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const res = await fetch(`/api/admin/partners?search=${encodeURIComponent(search)}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults((data.partners || []).map((p: any) => ({
          partnerCode: p.partnerCode,
          firstName: p.firstName,
          lastName: p.lastName,
          companyName: p.companyName,
        })));
      }
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const startNewThread = async (partner: PartnerOption) => {
    const res = await fetch("/api/admin/partner-dm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partnerCode: partner.partnerCode,
        content: newMessage.trim() || null,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setShowNew(false);
      setSearch("");
      setNewMessage("");
      setSearchResults([]);
      await loadThreads();
      await loadMessages(data.thread.id);
    }
  };

  const fmtTime = (d: string) => {
    const date = new Date(d);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 60_000) return "just now";
    if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
    if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="flex gap-4" style={{ height: "calc(100vh - 220px)", minHeight: 500 }}>
      {/* Thread list */}
      <div className="w-80 shrink-0 flex flex-col card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--app-border)] flex items-center justify-between">
          <span className="font-body text-xs font-semibold uppercase tracking-wider text-[var(--app-text-muted)]">
            Partner Messages
          </span>
          <button
            onClick={() => setShowNew(true)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: "var(--brand-gold)", color: "var(--app-button-gold-text)" }}
          >
            + New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 && (
            <div className="p-6 text-center text-xs text-[var(--app-text-muted)]">
              No conversations yet. Click + New to message a partner.
            </div>
          )}
          {threads.map((t) => (
            <button
              key={t.id}
              onClick={() => loadMessages(t.id)}
              className={`w-full text-left px-4 py-3 border-b border-[var(--app-border)] transition-colors hover:bg-[var(--app-card-bg)] ${
                activeThread === t.id ? "bg-[var(--app-card-bg)]" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-body text-sm font-medium text-[var(--app-text)] truncate">
                  {t.partnerName}
                </span>
                <span className="font-body text-[10px] text-[var(--app-text-faint)] shrink-0 ml-2">
                  {fmtTime(t.lastMessageAt)}
                </span>
              </div>
              <div className="font-body text-[10px] text-brand-gold font-mono">{t.partnerCode}</div>
              {t.lastMessage && (
                <div className="font-body text-xs text-[var(--app-text-muted)] truncate mt-1">
                  {t.lastMessageSender === "ADMIN" ? "You: " : ""}{t.lastMessage}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col card overflow-hidden">
        {showNew ? (
          <div className="flex-1 p-6">
            <h3 className="font-display text-lg font-bold mb-4 text-[var(--app-text)]">New Message to Partner</h3>
            <div className="mb-4">
              <label className="block font-body text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1.5">
                Search partner by name or code
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type a name or partner code..."
                autoFocus
                className="w-full px-4 py-2.5 rounded-lg font-body text-sm"
                style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)", color: "var(--app-text)", outline: "none" }}
              />
              {searching && <div className="text-xs text-[var(--app-text-muted)] mt-1">Searching...</div>}
              {searchResults.length > 0 && (
                <div className="mt-2 rounded-lg border border-[var(--app-border)] overflow-hidden" style={{ background: "var(--app-bg-secondary)" }}>
                  {searchResults.map((p) => (
                    <button
                      key={p.partnerCode}
                      onClick={() => {
                        if (newMessage.trim()) {
                          startNewThread(p);
                        } else {
                          startNewThread(p);
                        }
                      }}
                      className="w-full text-left px-4 py-2.5 border-b border-[var(--app-border)] last:border-b-0 hover:bg-[var(--app-card-bg)] transition-colors"
                    >
                      <div className="font-body text-sm font-medium text-[var(--app-text)]">
                        {p.firstName} {p.lastName}
                      </div>
                      <div className="font-body text-[10px] text-[var(--app-text-muted)]">
                        {p.partnerCode}{p.companyName ? ` · ${p.companyName}` : ""}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mb-4">
              <label className="block font-body text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1.5">
                Message (optional — send with first message or start empty thread)
              </label>
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                rows={3}
                placeholder="Type your message..."
                className="w-full px-4 py-2.5 rounded-lg font-body text-sm resize-none"
                style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)", color: "var(--app-text)", outline: "none" }}
              />
            </div>
            <button
              onClick={() => { setShowNew(false); setSearch(""); setSearchResults([]); setNewMessage(""); }}
              className="text-xs text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
            >
              Cancel
            </button>
          </div>
        ) : activeThread && partnerInfo ? (
          <>
            {/* Header */}
            <div className="px-4 py-3 border-b border-[var(--app-border)] flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-gold/10 border border-brand-gold/25 flex items-center justify-center">
                <span className="font-body text-[10px] font-bold text-brand-gold">
                  {partnerInfo.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </span>
              </div>
              <div>
                <div className="font-body text-sm font-medium text-[var(--app-text)]">{partnerInfo.name}</div>
                <div className="font-body text-[10px] text-[var(--app-text-muted)]">
                  {partnerInfo.partnerCode}{partnerInfo.company ? ` · ${partnerInfo.company}` : ""}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m) => {
                const isAdmin = m.senderPartnerCode === "ADMIN";
                return (
                  <div key={m.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                    <div
                      className="max-w-[70%] px-3.5 py-2.5 rounded-2xl"
                      style={{
                        background: isAdmin ? "var(--brand-gold)" : "var(--app-input-bg)",
                        color: isAdmin ? "var(--app-button-gold-text)" : "var(--app-text)",
                      }}
                    >
                      <div className="font-body text-sm whitespace-pre-wrap">{m.content}</div>
                      <div className={`font-body text-[9px] mt-1 ${isAdmin ? "text-black/40" : "text-[var(--app-text-faint)]"}`}>
                        {fmtTime(m.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Compose */}
            <div className="px-4 py-3 border-t border-[var(--app-border)] flex gap-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2.5 rounded-lg font-body text-sm"
                style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)", color: "var(--app-text)", outline: "none" }}
              />
              <button
                onClick={sendMessage}
                disabled={sending || !draft.trim()}
                className="px-4 py-2.5 rounded-lg font-body text-sm font-semibold disabled:opacity-40 transition-colors"
                style={{ background: "var(--brand-gold)", color: "var(--app-button-gold-text)" }}
              >
                Send
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-[var(--app-text-muted)]">
            Select a conversation or start a new one
          </div>
        )}
      </div>
    </div>
  );
}
