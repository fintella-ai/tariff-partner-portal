# FinnStellaOS Chat Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent floating AI chat bubble to the partner portal powered by FinnStellaOS, share tools across all personas, wire audit logging into admin mutation routes, and wire engagement scoring into partner event points.

**Architecture:** The chat widget is a pure UI layer (`PartnerChatBubble.tsx`) mounted in the partner layout, communicating with existing `/api/ai/chat` and `/api/ai/conversations` endpoints. Tool sharing is achieved by splitting `OLLIE_TOOLS` into `SHARED_TOOLS` + `OLLIE_EXCLUSIVE_TOOLS` and attaching the appropriate set based on persona in the chat route. Audit/engagement wiring adds `logAudit()` and `recordActivity()` calls to existing route handlers.

**Tech Stack:** Next.js 14.2 App Router, React 18, TypeScript, Prisma 5.20, Anthropic SDK, Tailwind CSS, CSS custom properties theming

**Spec:** `docs/superpowers/specs/2026-04-26-finnstellaos-chat-widget-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/components/partner/PartnerChatBubble.tsx` | Floating bubble + expanded chat panel + mobile overlay |
| `src/components/partner/ChatPanel.tsx` | Message list + input + footer (reusable panel body) |
| `src/components/partner/PersonaSwitcherRow.tsx` | Horizontal persona avatar row with active highlight |
| `src/app/api/ai/unread-count/route.ts` | Lightweight unread count endpoint for badge polling |

### Modified Files
| File | Change |
|------|--------|
| `src/lib/ai-ollie-tools.ts` | Split tools into `SHARED_TOOLS` + `OLLIE_EXCLUSIVE_TOOLS` exports |
| `src/lib/ai.ts` | Accept optional `tools` param in `generateResponse()` |
| `src/app/api/ai/chat/route.ts` | Attach tools based on persona (shared for all, exclusive for Ollie) |
| `src/app/(partner)/dashboard/layout.tsx` | Mount `<PartnerChatBubble />` |
| `src/lib/ai-ollie-tools.ts` (startLiveChat) | Return structured fallback when no admin online instead of error string |
| ~15 admin API routes | Add `logAudit()` calls |
| ~7 partner event routes | Add `recordActivity()` calls |
| `src/app/(admin)/admin/partners/PartnersPanel.tsx` | Add engagement score column + tier badge |

---

## Task 1: Split Ollie Tools into Shared + Exclusive Exports

**Files:**
- Modify: `src/lib/ai-ollie-tools.ts` (lines 51-297 tool definitions)

- [ ] **Step 1: Create the split exports**

In `src/lib/ai-ollie-tools.ts`, replace the single `OLLIE_TOOLS` export with three exports. Find the existing array (line 51):

```typescript
export const OLLIE_TOOLS: Anthropic.Messages.Tool[] = [
```

Replace the entire `OLLIE_TOOLS` export structure. Keep every tool definition object exactly as-is, just reorganize into two arrays:

```typescript
// Tools available to ALL personas (Finn, Stella, Tara, Ollie)
export const SHARED_TOOLS: Anthropic.Messages.Tool[] = [
  // lookupDeal (existing definition, unchanged)
  { name: "lookupDeal", ... },
  // lookupCommissions (existing definition, unchanged)
  { name: "lookupCommissions", ... },
  // lookupAgreement (existing definition, unchanged)
  { name: "lookupAgreement", ... },
  // lookupDownline (existing definition, unchanged)
  { name: "lookupDownline", ... },
  // create_support_ticket (existing definition, unchanged)
  { name: "create_support_ticket", ... },
  // start_live_chat (existing definition, unchanged)
  { name: "start_live_chat", ... },
  // offer_schedule_slots (existing definition, unchanged)
  { name: "offer_schedule_slots", ... },
  // book_slot (existing definition, unchanged)
  { name: "book_slot", ... },
];

// Tools exclusive to Ollie (structured triage + phone bridge)
export const OLLIE_EXCLUSIVE_TOOLS: Anthropic.Messages.Tool[] = [
  // investigate_bug (existing definition, unchanged)
  { name: "investigate_bug", ... },
  // initiate_live_transfer (existing definition, unchanged)
  { name: "initiate_live_transfer", ... },
];

// Backward-compat: full Ollie tool set
export const OLLIE_TOOLS: Anthropic.Messages.Tool[] = [
  ...SHARED_TOOLS,
  ...OLLIE_EXCLUSIVE_TOOLS,
];
```

Move each existing tool definition object into the appropriate array. Do NOT change any tool definition content — just reorganize.

- [ ] **Step 2: Verify the build compiles**

Run: `npx next build 2>&1 | tail -20`
Expected: Clean build, no type errors. `OLLIE_TOOLS` still exported so all existing consumers work unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai-ollie-tools.ts
git commit -m "refactor: split Ollie tools into SHARED_TOOLS + OLLIE_EXCLUSIVE_TOOLS

All personas will share 8 common tools (deal lookup, commissions,
support tickets, live chat, scheduling). investigate_bug and
initiate_live_transfer stay Ollie-exclusive.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Wire Tool Sharing into Chat API Route

**Files:**
- Modify: `src/lib/ai.ts` (line ~373 `generateResponse` signature)
- Modify: `src/app/api/ai/chat/route.ts` (line ~130 where generateResponse is called)

- [ ] **Step 1: Update generateResponse to accept a tools parameter**

In `src/lib/ai.ts`, find the `GenerateOpts` interface (around line 365-371) and add `tools`:

```typescript
interface GenerateOpts {
  conversationId?: string;
  userId?: string;
  userType?: "partner" | "admin";
  tools?: Anthropic.Messages.Tool[];
}
```

Then in the `generateResponse` function body (around line 461), where it builds the `client.messages.create()` call, change the tools attachment. Currently it only attaches tools when persona is `ollie`. Change to:

Find the section that conditionally attaches Ollie tools (around lines 455-470). It likely checks `personaId === "ollie"` to decide whether to include tools. Change it to use `opts?.tools` if provided:

```typescript
const toolsToAttach = opts?.tools ?? [];
```

And pass `tools: toolsToAttach.length > 0 ? toolsToAttach : undefined` to the Anthropic API call.

The existing Ollie tool-use loop (lines 479-548) should continue to work — it checks `response.stop_reason === "tool_use"` which fires for any persona now.

- [ ] **Step 2: Update the chat route to pass persona-appropriate tools**

In `src/app/api/ai/chat/route.ts`, add imports at the top:

```typescript
import { SHARED_TOOLS, OLLIE_TOOLS } from "@/lib/ai-ollie-tools";
```

Find where `generateResponse` is called (around line 130). Before that call, determine which tools to pass:

```typescript
const toolsForPersona = effectivePersona === "ollie" 
  ? OLLIE_TOOLS 
  : SHARED_TOOLS;
```

Pass it in the opts:

```typescript
const result = await generateResponse(userContext, history, effectivePersona, {
  conversationId: conversation.id,
  userId: session.user.id,
  userType: "partner",
  tools: toolsForPersona,
});
```

- [ ] **Step 3: Verify the build compiles**

Run: `npx next build 2>&1 | tail -20`
Expected: Clean build. Finn/Stella/Tara now receive shared tools. Ollie gets all 10.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai.ts src/app/api/ai/chat/route.ts
git commit -m "feat: all AI personas now have shared tool access

Finn, Stella, and Tara gain 8 shared tools (deal lookup, commissions,
agreement, downline, support tickets, live chat, scheduling). Ollie
retains investigate_bug and initiate_live_transfer exclusively.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Update startLiveChat Fallback — Partner Choice

**Files:**
- Modify: `src/lib/ai-ollie-tools.ts` (startLiveChat function, line ~805-922)

- [ ] **Step 1: Change the no-admin-available return from error to structured response**

In `startLiveChat()`, find the block (around line 850-854):

```typescript
if (onlineAdmins.length === 0) {
    return err(
      "No admins are available for live chat right now. Offer the partner a scheduled call or open a support ticket instead."
    );
  }
```

Replace with:

```typescript
if (onlineAdmins.length === 0) {
    return ok({
      success: false,
      reason: "no_admin_available",
      message: "No admins are available for live chat right now.",
      options: [
        "open a support ticket so someone follows up",
        "schedule a call for a time that works for you",
      ],
    });
  }
```

This returns a non-error tool result so the AI can present the choice to the partner naturally, rather than receiving an error string.

- [ ] **Step 2: Verify the build compiles**

Run: `npx next build 2>&1 | tail -20`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai-ollie-tools.ts
git commit -m "fix: start_live_chat returns partner choice when no admin online

Instead of returning an error, returns structured options so the AI
persona can ask the partner whether they want a support ticket or
scheduled call. The decision stays with the partner.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Unread Count API Endpoint

**Files:**
- Create: `src/app/api/ai/unread-count/route.ts`

- [ ] **Step 1: Create the unread count endpoint**

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.partnerCode) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const partnerCode = session.user.partnerCode;

  const [aiUnread, supportUnread, chatUnread] = await Promise.all([
    // AI: conversations where last message is from assistant and not viewed
    prisma.aiMessage.count({
      where: {
        conversation: { userId: session.user.id, userType: "partner" },
        role: "assistant",
        readAt: null,
      },
    }).catch(() => 0),

    // Support tickets: admin replies not yet read
    prisma.ticketMessage.count({
      where: {
        ticket: { partnerCode },
        authorType: "admin",
        readAt: null,
      },
    }).catch(() => 0),

    // Live chat: admin messages not yet read
    prisma.chatMessage.count({
      where: {
        session: { partnerCode },
        senderType: "admin",
        readAt: null,
      },
    }).catch(() => 0),
  ]);

  return NextResponse.json({
    ai: aiUnread,
    support: supportUnread,
    chat: chatUnread,
    total: aiUnread + supportUnread + chatUnread,
  });
}
```

- [ ] **Step 2: Check if readAt field exists on the relevant models**

Run: `grep -n "readAt" prisma/schema.prisma`

If `readAt` does NOT exist on `AiMessage`, `TicketMessage`, or `ChatMessage`, we need to add it. If missing, add to schema:

```prisma
// On AiMessage model:
readAt DateTime?

// On TicketMessage model (if missing):
readAt DateTime?

// On ChatMessage model (if missing):
readAt DateTime?
```

Then run: `npx prisma generate && npx prisma db push`

If `readAt` already exists, skip this step.

- [ ] **Step 3: Verify the build compiles**

Run: `npx next build 2>&1 | tail -20`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ai/unread-count/route.ts prisma/schema.prisma
git commit -m "feat: add /api/ai/unread-count endpoint for chat bubble badge

Returns counts for unread AI messages, support ticket replies, and
live chat messages. Lightweight polling endpoint for the chat bubble.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: PersonaSwitcherRow Component

**Files:**
- Create: `src/components/partner/PersonaSwitcherRow.tsx`

- [ ] **Step 1: Create the persona switcher row**

```typescript
"use client";

import { PERSONAS, type PersonaId } from "@/lib/ai-personas";
import Image from "next/image";

interface Props {
  active: PersonaId;
  onSwitch: (id: PersonaId) => void;
  size?: number;
}

const ORDER: PersonaId[] = ["finn", "stella", "tara", "ollie"];

export default function PersonaSwitcherRow({ active, onSwitch, size = 28 }: Props) {
  return (
    <div className="flex items-center gap-1.5">
      {ORDER.map((id) => {
        const p = PERSONAS[id];
        const isActive = id === active;
        return (
          <button
            key={id}
            onClick={() => onSwitch(id)}
            title={`${p.displayName} — ${p.tagline}`}
            className={`relative rounded-full transition-all ${
              isActive
                ? "ring-2 ring-offset-1 scale-110"
                : "opacity-60 hover:opacity-100"
            }`}
            style={isActive ? { ringColor: p.accentHex } : undefined}
          >
            <Image
              src={p.avatarSrc}
              alt={p.displayName}
              width={size}
              height={size}
              className="rounded-full"
            />
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npx next build 2>&1 | tail -20`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/partner/PersonaSwitcherRow.tsx
git commit -m "feat: PersonaSwitcherRow — horizontal persona avatar picker

Tap-to-switch row for the chat bubble panel header. Active persona
gets accent-colored ring + slight scale bump.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: ChatPanel Component

**Files:**
- Create: `src/components/partner/ChatPanel.tsx`

- [ ] **Step 1: Create the chat panel body**

This component handles the message list, input field, and footer. It's extracted so it can be reused in both the floating widget and potentially the full AI assistant page.

```typescript
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { type PersonaId, PERSONAS } from "@/lib/ai-personas";
import Image from "next/image";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  speakerPersona?: string | null;
  toolCalls?: { name: string; input: unknown; output: unknown; isError?: boolean }[] | null;
}

interface Props {
  messages: Message[];
  sending: boolean;
  onSend: (text: string) => void;
  persona: PersonaId;
  liveChatEnabled: boolean;
  onTalkToPerson: () => void;
  compact?: boolean;
}

const SUGGESTED_PROMPTS = [
  "How do commissions work?",
  "What's my latest deal status?",
  "How do I invite a partner?",
];

export default function ChatPanel({
  messages,
  sending,
  onSend,
  persona,
  liveChatEnabled,
  onTalkToPerson,
  compact,
}: Props) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    onSend(text);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [input, sending, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const autoGrow = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 72) + "px";
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {messages.length === 0 && !sending && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <Image
              src={PERSONAS[persona].avatarSrc}
              alt={PERSONAS[persona].displayName}
              width={48}
              height={48}
              className="rounded-full"
            />
            <p className="text-sm theme-text-secondary">
              Hi! I&apos;m {PERSONAS[persona].displayName}. How can I help?
            </p>
            <div className="flex flex-col gap-1.5 w-full max-w-[260px]">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => onSend(p)}
                  className="text-xs px-3 py-1.5 rounded-lg theme-bg-secondary hover:theme-bg-tertiary transition text-left"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <Image
                src={PERSONAS[msg.speakerPersona as PersonaId ?? persona].avatarSrc}
                alt=""
                width={24}
                height={24}
                className="rounded-full mt-1 flex-shrink-0"
              />
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-br-sm"
                  : "theme-bg-secondary rounded-bl-sm"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex gap-2 items-start">
            <Image
              src={PERSONAS[persona].avatarSrc}
              alt=""
              width={24}
              height={24}
              className="rounded-full mt-1"
            />
            <div className="theme-bg-secondary rounded-2xl rounded-bl-sm px-3 py-2">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Footer: Talk to a person */}
      {liveChatEnabled && (
        <div className="px-3 py-1 border-t theme-border">
          <button
            onClick={onTalkToPerson}
            className="text-xs theme-text-secondary hover:theme-text-primary transition underline"
          >
            Talk to a person
          </button>
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-2 border-t theme-border flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={autoGrow}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything..."
          rows={1}
          className="flex-1 resize-none rounded-xl px-3 py-2 text-sm theme-bg-secondary outline-none max-h-[72px]"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium disabled:opacity-40 transition hover:bg-blue-700"
        >
          {sending ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npx next build 2>&1 | tail -20`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/partner/ChatPanel.tsx
git commit -m "feat: ChatPanel — reusable AI chat message list + input

Handles message rendering, typing indicator, suggested prompts,
auto-growing textarea, and 'Talk to a person' footer link.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: PartnerChatBubble — Main Widget Component

**Files:**
- Create: `src/components/partner/PartnerChatBubble.tsx`

- [ ] **Step 1: Create the bubble + panel component**

This is the main widget. It manages open/closed state, loads conversations, sends messages, and renders the floating bubble + expanded panel.

```typescript
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { type PersonaId, PERSONAS } from "@/lib/ai-personas";
import Image from "next/image";
import ChatPanel from "./ChatPanel";
import PersonaSwitcherRow from "./PersonaSwitcherRow";
import { useDevice } from "@/lib/useDevice";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  speakerPersona?: string | null;
  toolCalls?: { name: string; input: unknown; output: unknown; isError?: boolean }[] | null;
}

const LS_OPEN = "fintella.partner.chatBubble.open";
const LS_CONV = "fintella.partner.chatBubble.conversationId";
const LS_INTRO = "fintella.partner.chatBubbleIntro";

interface Props {
  preferredPersona: PersonaId;
  liveChatEnabled: boolean;
  aiEnabled: boolean;
}

export default function PartnerChatBubble({ preferredPersona, liveChatEnabled, aiEnabled }: Props) {
  const device = useDevice();
  const isMobile = device === "mobile";
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [persona, setPersona] = useState<PersonaId>(preferredPersona);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showIntro, setShowIntro] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const savedOpen = localStorage.getItem(LS_OPEN);
      if (savedOpen === "true") setOpen(true);
      const savedConv = localStorage.getItem(LS_CONV);
      if (savedConv) setConversationId(savedConv);
      if (!localStorage.getItem(LS_INTRO)) setShowIntro(true);
    } catch {}
    setHydrated(true);
  }, []);

  // Persist open state
  useEffect(() => {
    if (hydrated) localStorage.setItem(LS_OPEN, String(open));
  }, [open, hydrated]);

  // Load conversation messages when panel opens
  useEffect(() => {
    if (!open || !conversationId) return;
    (async () => {
      try {
        const res = await fetch(`/api/ai/conversations/${conversationId}`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
        }
      } catch {}
    })();
  }, [open, conversationId]);

  // Poll unread count when collapsed
  useEffect(() => {
    if (open) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    const poll = async () => {
      try {
        const res = await fetch("/api/ai/unread-count");
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(data.total || 0);
        }
      } catch {}
    };
    poll();
    pollRef.current = setInterval(poll, 30000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open]);

  // Send message
  const handleSend = useCallback(async (text: string) => {
    setSending(true);
    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          message: text,
          pinnedSpecialist: persona === "tara" ? "tara" : persona === "ollie" ? "ollie" : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.conversationId && !conversationId) {
          setConversationId(data.conversationId);
          localStorage.setItem(LS_CONV, data.conversationId);
        }
        const newMessages: Message[] = (data.messages || []).map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
          speakerPersona: m.speakerPersona,
          toolCalls: m.toolCalls,
        }));
        setMessages((prev) => {
          const withoutOptimistic = prev.filter((m) => m.id !== optimisticMsg.id);
          return [...withoutOptimistic, ...newMessages];
        });
      }
    } catch {}
    setSending(false);
  }, [conversationId, persona]);

  // Talk to a person
  const handleTalkToPerson = useCallback(() => {
    handleSend("I'd like to talk to a real person please.");
  }, [handleSend]);

  // Dismiss intro pulse
  const handleOpen = useCallback(() => {
    setOpen(true);
    setUnreadCount(0);
    if (showIntro) {
      setShowIntro(false);
      localStorage.setItem(LS_INTRO, "seen");
    }
  }, [showIntro]);

  // Expand to full page
  const handleExpand = useCallback(() => {
    const url = conversationId
      ? `/dashboard/ai-assistant?conversationId=${conversationId}`
      : "/dashboard/ai-assistant";
    window.location.href = url;
  }, [conversationId]);

  // New conversation
  const handleNewConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    localStorage.removeItem(LS_CONV);
  }, []);

  if (!hydrated || !aiEnabled) return null;

  const p = PERSONAS[persona];

  // Collapsed bubble
  if (!open) {
    return (
      <button
        onClick={handleOpen}
        className={`fixed z-40 rounded-full shadow-lg transition-all hover:scale-105 active:scale-95 ${
          isMobile ? "bottom-4 right-4" : "bottom-6 right-6"
        } ${showIntro ? "animate-pulse" : ""}`}
        style={{ width: 56, height: 56 }}
        title="Chat with FinnStellaOS"
      >
        <Image
          src={p.avatarSrc}
          alt={p.displayName}
          width={56}
          height={56}
          className="rounded-full"
        />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
    );
  }

  // Mobile: full-screen overlay
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--app-bg)" }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-safe pb-2 border-b theme-border" style={{ background: "var(--app-header-bg)" }}>
          <button onClick={() => setOpen(false)} className="text-lg">←</button>
          <Image src={p.avatarSrc} alt="" width={32} height={32} className="rounded-full" />
          <span className="font-semibold text-sm flex-1">{p.displayName}</span>
          <PersonaSwitcherRow active={persona} onSwitch={setPersona} size={24} />
          <button onClick={handleExpand} className="text-sm opacity-60 hover:opacity-100" title="Open full page">↗</button>
        </div>
        <ChatPanel
          messages={messages}
          sending={sending}
          onSend={handleSend}
          persona={persona}
          liveChatEnabled={liveChatEnabled}
          onTalkToPerson={handleTalkToPerson}
          compact
        />
      </div>
    );
  }

  // Desktop: floating panel
  return (
    <>
      {/* Backdrop — subtle, click to close */}
      <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />

      <div
        className="fixed z-40 bottom-20 right-6 flex flex-col rounded-2xl shadow-2xl border theme-border overflow-hidden"
        style={{
          width: 380,
          height: 520,
          background: "var(--app-bg)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b theme-border" style={{ background: "var(--app-header-bg)" }}>
          <Image src={p.avatarSrc} alt="" width={32} height={32} className="rounded-full" />
          <span className="font-semibold text-sm flex-1">{p.displayName}</span>
          <PersonaSwitcherRow active={persona} onSwitch={setPersona} size={24} />
          <button onClick={handleNewConversation} className="text-sm opacity-60 hover:opacity-100 ml-1" title="New conversation">+</button>
          <button onClick={handleExpand} className="text-sm opacity-60 hover:opacity-100" title="Open full page">↗</button>
          <button onClick={() => setOpen(false)} className="text-sm opacity-60 hover:opacity-100" title="Close">✕</button>
        </div>

        <ChatPanel
          messages={messages}
          sending={sending}
          onSend={handleSend}
          persona={persona}
          liveChatEnabled={liveChatEnabled}
          onTalkToPerson={handleTalkToPerson}
          compact
        />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npx next build 2>&1 | tail -20`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/partner/PartnerChatBubble.tsx
git commit -m "feat: PartnerChatBubble — floating AI chat widget

Persistent bottom-right bubble with persona avatar, unread badge,
expandable 380x520 panel (desktop) or full-screen overlay (mobile).
Persona switcher, suggested prompts, and 'Talk to a person' handoff.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Mount Widget in Partner Layout

**Files:**
- Modify: `src/app/(partner)/dashboard/layout.tsx`

- [ ] **Step 1: Add imports and mount the bubble**

At the top of `layout.tsx`, add the import:

```typescript
import PartnerChatBubble from "@/components/partner/PartnerChatBubble";
```

The layout already fetches portal settings (it accesses `aiAssistantEnabled` and `liveChatEnabled`). Find where partner settings are loaded (likely in the layout's useEffect or server component data fetch). Pass the relevant props to the bubble.

Mount `<PartnerChatBubble />` in the layout's return, after the main content area but before the closing wrapper div. Place it alongside or replacing the existing chat FAB (around line 863-875 based on the exploration). The existing "Live Chat" FAB in this layout should be replaced by the new AI-first widget which includes "Talk to a person" functionality.

```tsx
<PartnerChatBubble
  preferredPersona={(partnerSettings?.preferredGeneralist as PersonaId) ?? "finn"}
  liveChatEnabled={!!portalSettings?.liveChatEnabled}
  aiEnabled={!!portalSettings?.aiAssistantEnabled}
/>
```

- [ ] **Step 2: Verify the build compiles**

Run: `npx next build 2>&1 | tail -20`
Expected: Clean build.

- [ ] **Step 3: Test in browser**

Run: `npm run dev`
Navigate to the partner dashboard. Verify:
- Bubble appears in bottom-right corner
- Click opens the panel
- Persona switcher shows 4 avatars
- Suggested prompts appear in empty state
- Sending a message gets an AI response
- "×" closes back to bubble
- Mobile: panel goes full-screen

- [ ] **Step 4: Commit**

```bash
git add src/app/\(partner\)/dashboard/layout.tsx
git commit -m "feat: mount PartnerChatBubble in partner dashboard layout

AI chat widget now appears on all partner pages. Replaces the
previous live-chat-only FAB with FinnStellaOS AI-first approach.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Wire Audit Logging into Admin Routes

**Files:**
- Modify: ~15 admin API route files (see list below)

- [ ] **Step 1: Wire logAudit into deal routes**

For each route, import `logAudit` and `diffFields` from `@/lib/audit-log`, then call `logAudit()` after the mutation succeeds. Extract `actorEmail`, `actorRole`, `actorId` from the session, and `ipAddress` from `request.headers.get("x-forwarded-for")`, `userAgent` from `request.headers.get("user-agent")`.

**Pattern for all routes:**

```typescript
import { logAudit, diffFields } from "@/lib/audit-log";

// After successful mutation:
await logAudit({
  action: "deal.create", // varies per route
  actorEmail: session.user.email!,
  actorRole: session.user.role!,
  actorId: session.user.id,
  targetType: "deal", // varies per route
  targetId: deal.id, // varies per route
  details: { /* relevant fields */ },
  ipAddress: request.headers.get("x-forwarded-for") || undefined,
  userAgent: request.headers.get("user-agent") || undefined,
}).catch(() => {}); // fire-and-forget, never block the response
```

**Routes to wire (add logAudit to each):**

1. `src/app/api/admin/deals/route.ts` — POST (deal.create) + PATCH (deal.update)
2. `src/app/api/admin/deals/[id]/route.ts` — DELETE (deal.delete), PATCH (deal.update) if separate
3. `src/app/api/admin/deals/[id]/payment-received/route.ts` — POST (deal.payment_received)
4. `src/app/api/admin/partners/route.ts` — POST (partner.create) if exists
5. `src/app/api/admin/partners/[code]/route.ts` — PATCH (partner.update)
6. `src/app/api/admin/settings/route.ts` — PUT (settings.update) — use `diffFields(before, after)` to log only changed fields
7. `src/app/api/admin/payouts/route.ts` — POST with action create/approve/process (payout.batch_create / payout.batch_approve / payout.batch_process)
8. `src/app/api/admin/users/route.ts` — POST (admin.create)
9. `src/app/api/admin/users/[id]/route.ts` — PATCH (admin.update)
10. `src/app/api/signwell/send/route.ts` — POST (agreement.send)
11. `src/app/api/admin/announcements/route.ts` — POST (announcement.create) + PATCH (announcement.update)
12. `src/app/api/admin/invites/route.ts` — POST (invite.create)
13. `src/app/api/admin/applications/[id]/route.ts` — PATCH (application.approve / application.reject)

For update routes, capture the `before` state with a Prisma `findUnique` before the mutation, then use `diffFields(before, after)` in the details.

- [ ] **Step 2: Verify the build compiles**

Run: `npx next build 2>&1 | tail -20`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/ src/app/api/signwell/
git commit -m "feat: wire audit logging into all admin mutation routes

logAudit() now fires on deal CRUD, partner updates, settings changes,
payout batch operations, admin user management, agreement sends,
announcements, invites, and application approvals. Fire-and-forget
pattern — never blocks the response.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Wire Engagement Scoring into Event Points

**Files:**
- Modify: ~7 partner event route files

- [ ] **Step 1: Wire recordActivity into each trigger point**

Import `recordActivity` from `@/lib/engagement` in each route and call it after the relevant event succeeds.

**Pattern:**
```typescript
import { recordActivity } from "@/lib/engagement";

// After successful event:
await recordActivity(partnerCode, "deal_submitted", { dealId: deal.id }).catch(() => {});
```

**Routes to wire:**

1. **deal_submitted** — find the partner deal submission route (likely `src/app/api/deals/route.ts` POST). After deal creation:
   ```typescript
   await recordActivity(partnerCode, "deal_submitted", { dealId: deal.id }).catch(() => {});
   ```

2. **training_completed** — find `src/app/api/training/progress/route.ts` or similar. After marking module complete:
   ```typescript
   await recordActivity(partnerCode, "training_completed", { moduleId }).catch(() => {});
   ```

3. **downline_recruited** — find `src/app/api/signup/route.ts` or recruitment route. After new partner created via recruitment link:
   ```typescript
   await recordActivity(uplinePartnerCode, "downline_recruited", { newPartnerCode }).catch(() => {});
   ```

4. **link_shared** ��� find `src/app/api/referral-links/route.ts` or track endpoint. After link copy/generation:
   ```typescript
   await recordActivity(partnerCode, "link_shared", { linkId }).catch(() => {});
   ```

5. **call_attended** — find conference attendance tracking. After partner joins call:
   ```typescript
   await recordActivity(partnerCode, "call_attended", { conferenceId }).catch(() => {});
   ```

6. **email_open + email_click** — find the SendGrid event webhook route (likely `src/app/api/sendgrid/route.ts` or `src/app/api/webhook/sendgrid/route.ts`). After processing open/click events, look up the partner code from the email metadata and:
   ```typescript
   if (event.event === "open") {
     await recordActivity(partnerCode, "email_open", { messageId: event.sg_message_id }).catch(() => {});
   }
   if (event.event === "click") {
     await recordActivity(partnerCode, "email_click", { url: event.url, messageId: event.sg_message_id }).catch(() => {});
   }
   ```

- [ ] **Step 2: Verify the build compiles**

Run: `npx next build 2>&1 | tail -20`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/
git commit -m "feat: wire engagement scoring into partner event points

recordActivity() now fires on deal submission (10pts), training
completion (5pts), downline recruitment (8pts), link sharing (3pts),
call attendance (5pts), and SendGrid open/click events (1/3pts).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Engagement Tier UI on Admin Partners Table

**Files:**
- Modify: `src/app/(admin)/admin/partners/PartnersPanel.tsx` (or the main partners page component)

- [ ] **Step 1: Add engagement columns to the partners table**

Find the partners table column definitions. Add two new columns:

**Score column:**
```typescript
{
  header: "Score",
  accessorKey: "engagementScore",
  cell: ({ row }) => (
    <span className="text-sm font-mono">
      {row.original.engagementScore ?? 0}
    </span>
  ),
  sortingFn: "basic",
}
```

**Tier badge column:**
```typescript
{
  header: "Tier",
  accessorKey: "engagementTier",
  cell: ({ row }) => {
    const tier = row.original.engagementTier || "cold";
    const colors: Record<string, string> = {
      hot: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      cooling: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
      cold: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
    };
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors[tier]}`}>
        {tier === "hot" && "🔥"} {tier.charAt(0).toUpperCase() + tier.slice(1)}
      </span>
    );
  },
}
```

- [ ] **Step 2: Add tier filter dropdown**

Add a filter select above the table:

```typescript
<select
  value={tierFilter}
  onChange={(e) => setTierFilter(e.target.value)}
  className="text-sm rounded-lg px-3 py-1.5 theme-bg-secondary"
>
  <option value="">All Tiers</option>
  <option value="hot">🔥 Hot</option>
  <option value="active">Active</option>
  <option value="cooling">Cooling</option>
  <option value="cold">Cold</option>
</select>
```

Apply the filter in the data query or client-side filter.

- [ ] **Step 3: Ensure the Prisma query includes engagementScore and engagementTier**

Find the admin partners list API route (likely `src/app/api/admin/partners/route.ts`). Ensure the `select` or `include` clause fetches `engagementScore` and `engagementTier` from the Partner model.

- [ ] **Step 4: Verify the build compiles**

Run: `npx next build 2>&1 | tail -20`
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(admin\)/admin/partners/ src/app/api/admin/partners/
git commit -m "feat: engagement score + tier badge on admin partners table

Sortable score column, color-coded tier badge (hot/active/cooling/cold),
and tier filter dropdown on the admin partners list.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Create PR and Verify

- [ ] **Step 1: Push branch and create PR**

```bash
git push -u origin claude/finnstellaos-chat-widget
gh pr create --title "FinnStellaOS chat widget + audit/engagement wiring" --body "$(cat <<'EOF'
## Summary
- Persistent floating AI chat bubble on all partner pages (FinnStellaOS first responder)
- All 4 personas (Finn, Stella, Tara, Ollie) now have shared tool access
- Hybrid UI: inline 380x520 panel (desktop) / full-screen overlay (mobile) / expand to full page
- "Talk to a person" handoff: live chat if admin online, partner chooses ticket or call if not
- Unread badge with 30s polling
- Audit logging wired into ~15 admin mutation routes
- Engagement scoring wired into 7 partner event points
- Engagement tier column + badge on admin partners table

## Test plan
- [ ] Chat bubble appears on partner dashboard (bottom-right)
- [ ] Click opens panel, persona switcher works
- [ ] Sending a message gets AI response from selected persona
- [ ] Finn/Stella can now call lookupDeal, lookupCommissions etc.
- [ ] "Talk to a person" creates ticket or offers schedule when no admin online
- [ ] Mobile: panel goes full-screen with safe-area padding
- [ ] Unread badge shows count, clears on open
- [ ] Audit log entries appear in /admin/audit-log after admin actions
- [ ] Engagement scores update after partner actions
- [ ] Tier badges show correctly on /admin/partners

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Verify Vercel preview deploys successfully**

Check the PR for Vercel preview deployment link. Click through:
- Partner dashboard → bubble visible
- Open panel → send message → AI responds
- Admin → audit log → entries present
- Admin → partners → score + tier columns visible
