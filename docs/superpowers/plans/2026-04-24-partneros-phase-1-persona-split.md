# PartnerOS AI — Phase 1: Persona Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-persona "Fintella PartnerOS" assistant with a **Finn + Stella** persona split — partners pick one at first use, the chat banner shows who's speaking, and the voice shifts per persona. No new capabilities; same knowledge base, same tool surface (none), same rate limits. Establishes the registry and wiring that Phase 2 (Tara) and Phase 3 (Ollie) will extend.

**Architecture:** Add a typed persona registry (`src/lib/ai-personas.ts`) that each persona's system prompt builder reads from. `generateResponse()` in `src/lib/ai.ts` accepts a `personaId` arg and builds system blocks from the registry. Partner's chosen generalist is stored on `Partner.preferredGeneralist`; admin users get the field too for Phase 3 admin-assistant use. UI adds a first-visit picker modal, a persistent persona banner in the chat header, and an "AI Preferences" section in account settings.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Prisma 5.20, Neon Postgres, NextAuth.js JWT session, Anthropic SDK (`@anthropic-ai/sdk`), Tailwind-via-CSS-variables (`var(--app-*)`), existing `theme-*` utility classes.

**Testing note:** This project has no Jest/Vitest/Playwright suite. Verification is `./node_modules/.bin/next build` (97/97 static pages), `npm run lint`, and manual dev-server spot-checks per task. Every task ends with a build + lint step; UI tasks include targeted manual checks on `npm run dev`.

**Source spec:** `docs/superpowers/specs/2026-04-24-partneros-ai-roadmap-design.md` §3.1, §3.2, §3.5, §3.6, §8.1, §9.1.

---

## File Structure

Files created or modified in Phase 1:

| Path | Action | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | Modify | Add `preferredGeneralist` to `Partner` + `User`; add `speakerPersona`, `handoffMetadata`, `attachments` to `AiMessage` |
| `src/lib/ai-personas.ts` | Create | Typed registry of persona records; voice-wrapped system prompt builders for Finn + Stella |
| `src/lib/ai.ts` | Modify | Accept `personaId` on `generateResponse`; delegate system-prompt building to persona registry |
| `src/app/api/ai/chat/route.ts` | Modify | Read partner's `preferredGeneralist` + pass to `generateResponse`; persist `speakerPersona` on assistant message |
| `public/ai-avatars/finn.svg` | Create | Abstract geometric silhouette in brand gold |
| `public/ai-avatars/stella.svg` | Create | Abstract geometric silhouette in soft rose |
| `src/components/ai/PersonaAvatar.tsx` | Create | Reusable avatar-plus-name renderer keyed by `PersonaId` |
| `src/components/ai/PersonaPickerModal.tsx` | Create | Two-card first-visit picker |
| `src/app/(partner)/dashboard/ai-assistant/page.tsx` | Modify | Persona banner in chat header, first-visit picker trigger, `MessageBubble` speaker rendering |
| `src/app/(partner)/dashboard/settings/page.tsx` | Modify | "AI Preferences" section with persona switcher |
| `src/app/api/partner/settings/route.ts` | Modify | GET returns `preferredGeneralist`; PATCH accepts + persists it |
| `.claude/session-state.md` | Modify | Refresh stale state (currently pinned at #467, we're now at #529 + this work) |

---

## Task 1: Create feature branch + verify baseline build

**Files:** none modified; confirms starting state.

- [ ] **Step 1.1: Create + switch to the Phase 1 feature branch**

```bash
git checkout main
git pull --ff-only
git checkout -b claude/partneros-phase-1-persona-split
```

- [ ] **Step 1.2: Verify baseline build passes before any changes**

```bash
./node_modules/.bin/next build
```

Expected: `✓ Generating static pages (97/97)` and `Compiled successfully`. If this fails, stop and investigate — we need a clean baseline.

- [ ] **Step 1.3: Verify lint is clean**

```bash
npm run lint
```

Expected: `✔ No ESLint warnings or errors`. If there are pre-existing warnings we inherit, note them; don't fix unrelated warnings in this plan.

---

## Task 2: Schema additions — `preferredGeneralist` + `AiMessage` persona columns

**Files:**
- Modify: `prisma/schema.prisma` (Partner, User, AiMessage models)

- [ ] **Step 2.1: Add `preferredGeneralist` field to `Partner` model**

Find the `model Partner` block in `prisma/schema.prisma`. Add this field alongside the other optional string fields (place it near the existing communications/preference fields if there's a natural cluster, otherwise just inside the block before the closing `}`):

```prisma
  preferredGeneralist       String?   // "finn" | "stella"; null = prompt on first AI visit
```

- [ ] **Step 2.2: Add `preferredGeneralist` field to `User` model**

Find the `model User` block. Add the same field:

```prisma
  preferredGeneralist       String?   // "finn" | "stella"; slot for future admin AI experience
```

- [ ] **Step 2.3: Add new columns to `AiMessage` model**

Find the existing `model AiMessage` block (around line 838). Add three new optional columns after `cacheCreationTokens`:

```prisma
  // Phase 17b — PartnerOS AI persona system
  speakerPersona      String?  // "finn" | "stella" | "tara" | "ollie"; null for user messages
  handoffMetadata     Json?    // { from, to, reason, summary, triggeredBy } — populated when a specialist handoff fires (Phase 2+)
  attachments         Json?    // [{ url, mimeType, width, height }] — populated for bug-triage screenshots (Phase 3)
```

- [ ] **Step 2.4: Regenerate the Prisma client**

```bash
npx prisma generate
```

Expected: `✔ Generated Prisma Client (vX.X.X)`. No errors.

- [ ] **Step 2.5: Apply the schema to the dev database**

```bash
npx prisma db push --accept-data-loss
```

Expected: `Your database is now in sync with your Prisma schema.`

CLAUDE.md allows `--accept-data-loss` for strictly-additive schema changes. These three columns are all nullable; no existing data is harmed.

- [ ] **Step 2.6: Verify the build still compiles**

```bash
./node_modules/.bin/next build
```

Expected: 97/97 pages, no TS errors.

- [ ] **Step 2.7: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(ai): add preferredGeneralist + AiMessage persona columns

Schema prep for Phase 1 of the PartnerOS AI persona split (spec at
docs/superpowers/specs/2026-04-24-partneros-ai-roadmap-design.md).

- Partner.preferredGeneralist: stores finn/stella choice
- User.preferredGeneralist: slot for future admin AI experience
- AiMessage.speakerPersona: which persona generated an assistant turn
- AiMessage.handoffMetadata: populated in Phase 2 when specialists hand off
- AiMessage.attachments: populated in Phase 3 for screenshot upload

All fields strictly additive + nullable. No data loss."
```

---

## Task 3: Create avatar SVGs

**Files:**
- Create: `public/ai-avatars/finn.svg`
- Create: `public/ai-avatars/stella.svg`

Note: these are intentionally abstract geometric silhouettes per spec §3.1 / §3.2. A designer can swap them in a follow-up PR without any code change — they're plain SVGs behind a registry. Brand gold is `#c4a050` (see `src/app/globals.css` / theme vars). Stella's soft rose is `#d8a5a5`.

- [ ] **Step 3.1: Create the `public/ai-avatars/` directory**

```bash
mkdir -p public/ai-avatars
```

- [ ] **Step 3.2: Create Finn's avatar SVG**

Write `public/ai-avatars/finn.svg` with this exact content:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <circle cx="32" cy="32" r="30" fill="#c4a050" opacity="0.12"/>
  <circle cx="32" cy="32" r="30" stroke="#c4a050" stroke-width="1.5" opacity="0.5"/>
  <circle cx="32" cy="24" r="9" fill="#c4a050"/>
  <path d="M14 52c0-10 8.1-18 18-18s18 8 18 18" fill="#c4a050"/>
</svg>
```

- [ ] **Step 3.3: Create Stella's avatar SVG**

Write `public/ai-avatars/stella.svg` with this exact content:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <circle cx="32" cy="32" r="30" fill="#d8a5a5" opacity="0.14"/>
  <circle cx="32" cy="32" r="30" stroke="#d8a5a5" stroke-width="1.5" opacity="0.5"/>
  <circle cx="32" cy="24" r="9" fill="#d8a5a5"/>
  <path d="M14 52c0-10 8.1-18 18-18s18 8 18 18" fill="#d8a5a5"/>
  <path d="M23 22c3-5 15-5 18 0" stroke="#d8a5a5" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
</svg>
```

- [ ] **Step 3.4: Verify both files render**

Start the dev server in the background and hit the SVGs directly:

```bash
npm run dev &
sleep 3
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/ai-avatars/finn.svg
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/ai-avatars/stella.svg
kill %1 2>/dev/null || true
```

Expected: both curls print `200`.

- [ ] **Step 3.5: Commit**

```bash
git add public/ai-avatars/
git commit -m "feat(ai): add Finn + Stella avatar SVGs

Abstract geometric silhouettes per spec §3.1/§3.2. Brand gold for Finn
(#c4a050), soft rose for Stella (#d8a5a5). Designer swap in a future PR
is a one-file replacement — the persona registry references these by
path only."
```

---

## Task 4: Create the persona registry (`src/lib/ai-personas.ts`)

**Files:**
- Create: `src/lib/ai-personas.ts`

This file is the single source of truth for persona metadata and system-prompt building. Phase 2 will add `tara` and Phase 3 will add `ollie` records + tool arrays to this same file.

- [ ] **Step 4.1: Write the persona registry module**

Write `src/lib/ai-personas.ts` with this exact content:

```ts
/**
 * PartnerOS AI — persona registry
 *
 * Single source of truth for the four-persona system. Phase 1 ships Finn
 * and Stella (generalists, same knowledge base, different voice). Phase 2
 * adds Tara (product specialist) with a knowledge-ingestion system prompt
 * block; Phase 3 adds Ollie (support specialist) with a tool registry.
 *
 * See docs/superpowers/specs/2026-04-24-partneros-ai-roadmap-design.md.
 */

import type Anthropic from "@anthropic-ai/sdk";

export type PersonaId = "finn" | "stella" | "tara" | "ollie";

export type PersonaRole =
  | "generalist"
  | "product_specialist"
  | "support_specialist";

export interface Persona {
  id: PersonaId;
  displayName: string;
  role: PersonaRole;
  avatarSrc: string;
  accentHex: string; // hex for client styling; avoids string-concat CSS vars
  tagline: string; // one-line UI subtitle shown on picker + banner
  longDescription: string; // shown on picker card + settings card
  voiceWrapperMarkdown: string; // prepended to the shared knowledge block in the system prompt
}

// Phase 1 registry — Finn + Stella only. Phase 2/3 add tara + ollie and
// extend the Persona interface with tools + systemPromptBuilder overrides.
export const PERSONAS: Record<"finn" | "stella", Persona> = {
  finn: {
    id: "finn",
    displayName: "Finn",
    role: "generalist",
    avatarSrc: "/ai-avatars/finn.svg",
    accentHex: "#c4a050",
    tagline: "Direct, data-driven. Fast answers.",
    longDescription:
      "Finn leads with the number. He pulls your deals, commissions, and downline data live, answers portal questions quickly, and gets out of your way. Best if you want short answers and fast action.",
    voiceWrapperMarkdown: [
      "## Your persona — Finn",
      "",
      "You are **Finn**, the direct, data-driven generalist on the Fintella Partner Portal AI team. Your voice is:",
      "",
      "- Short, confident sentences. Front-load the number or the answer.",
      "- Minimal small talk. Move the conversation forward.",
      '- Offer next actions with "Want me to…" or "I can…".',
      "- Never fabricate. If you do not know, say so.",
      "- Minimal emoji; mirror the partner only if they use them first.",
      "",
      'Example tone: "You have 3 deals in Closed Won. $47k pending. Want the breakdown by L1/L2?"',
    ].join("\n"),
  },
  stella: {
    id: "stella",
    displayName: "Stella",
    role: "generalist",
    avatarSrc: "/ai-avatars/stella.svg",
    accentHex: "#d8a5a5",
    tagline: "Warm, coaching. Walks you through it.",
    longDescription:
      "Stella reads the moment. She celebrates milestones, meets you where you are emotionally, then gets you the answer. Best if you want the conversation to feel like a colleague helping you, especially on client-facing turns.",
    voiceWrapperMarkdown: [
      "## Your persona — Stella",
      "",
      "You are **Stella**, the warm, relationship-focused generalist on the Fintella Partner Portal AI team. Your voice is:",
      "",
      '- Fuller sentences. Use "let\'s / we / you" framing.',
      "- Celebrate wins proactively when you have live data showing them.",
      '- Offer to "help you word" or "think through" client-facing moments.',
      "- Never saccharine. Still answer the question; the warmth is relative to Finn, not a substitute for substance.",
      "- Never fabricate. If you do not know, say so.",
      "- Minimal emoji; mirror the partner only if they use them first.",
      "",
      'Example tone: "Nice — three deals closed! Let\'s look at what\'s ready for payout and I\'ll walk you through the next step."',
    ].join("\n"),
  },
};

/**
 * Map unknown/null persona selections to the default. Use this at every
 * boundary (API read, UI render) so we never pass an invalid id downstream.
 */
export function resolvePersonaId(input: string | null | undefined): "finn" | "stella" {
  if (input === "stella") return "stella";
  return "finn"; // default fallback
}

/**
 * Build the persona-specific voice wrapper block to prepend to the shared
 * KNOWLEDGE_BASE in the Anthropic system prompt. Kept as a separate
 * (uncached) text block so the shared KNOWLEDGE_BASE keeps its cache hit
 * across personas — only this tiny wrapper is uncached.
 */
export function buildPersonaVoiceBlock(
  personaId: "finn" | "stella"
): Anthropic.Messages.TextBlockParam {
  const persona = PERSONAS[personaId];
  return {
    type: "text",
    text: persona.voiceWrapperMarkdown,
  };
}
```

- [ ] **Step 4.2: Verify the module compiles**

```bash
./node_modules/.bin/next build
```

Expected: 97/97, no TS errors. If you see `Cannot find module '@anthropic-ai/sdk'` you've picked the wrong import style — the SDK is already a dep (see `package.json`), and `src/lib/ai.ts` imports it as `import Anthropic from "@anthropic-ai/sdk"`. Match that style.

- [ ] **Step 4.3: Commit**

```bash
git add src/lib/ai-personas.ts
git commit -m "feat(ai): persona registry module (Finn + Stella)

Typed registry that Phase 2 (Tara) and Phase 3 (Ollie) will extend.
Includes voice wrapper builder that keeps KNOWLEDGE_BASE cache-hittable
across personas — only the ~200-token voice block is uncached per turn."
```

---

## Task 5: Update `src/lib/ai.ts` to accept a `personaId` argument

**Files:**
- Modify: `src/lib/ai.ts` (`generateResponse` signature + system-block assembly)

The existing `generateResponse(userContext, history)` will become `generateResponse(userContext, history, personaId)`. The cached `KNOWLEDGE_BASE` block stays in its current place (cache-preserving); the persona voice wrapper is inserted between knowledge base and user context as an uncached block.

- [ ] **Step 5.1: Import the persona helpers at the top of `src/lib/ai.ts`**

Near the top of `src/lib/ai.ts`, alongside the existing imports, add:

```ts
import {
  buildPersonaVoiceBlock,
  resolvePersonaId,
  type PersonaId,
} from "./ai-personas";
```

Place this line after the existing `import Anthropic` / `import { prisma }` imports.

- [ ] **Step 5.2: Update the `generateResponse` signature**

Find the existing function declaration in `src/lib/ai.ts`:

```ts
export async function generateResponse(
  userContext: string,
  history: ChatMessage[]
): Promise<GenerateResult> {
```

Replace that signature (keep the function body) with:

```ts
export async function generateResponse(
  userContext: string,
  history: ChatMessage[],
  personaId: PersonaId | null | undefined
): Promise<GenerateResult> {
```

- [ ] **Step 5.3: Insert the persona voice block into the system prompt assembly**

Inside `generateResponse`, find the block that builds `systemBlocks`:

```ts
const systemBlocks: Anthropic.Messages.TextBlockParam[] = [
  {
    type: "text",
    text: KNOWLEDGE_BASE,
    cache_control: { type: "ephemeral" },
  },
  {
    type: "text",
    text: userContext,
  },
];
```

Replace it with:

```ts
const resolvedPersona = resolvePersonaId(personaId);
const systemBlocks: Anthropic.Messages.TextBlockParam[] = [
  {
    type: "text",
    text: KNOWLEDGE_BASE,
    cache_control: { type: "ephemeral" },
  },
  buildPersonaVoiceBlock(resolvedPersona),
  {
    type: "text",
    text: userContext,
  },
];
```

The voice block is intentionally NOT cached: it's tiny (~200 tokens), persona-specific, and placing it after the cached KNOWLEDGE_BASE keeps the cache hit on the big block intact for both personas.

- [ ] **Step 5.4: Update the mock-fallback branch to mention the persona**

Still inside `generateResponse`, find the `if (!client)` mock branch:

```ts
if (!client) {
  const lastUserMsg = history.filter((m) => m.role === "user").pop();
  const mockReply = `[Mock Response — ANTHROPIC_API_KEY not set in environment]

I received your question: "${lastUserMsg?.content.slice(0, 200) || ""}"
```

Replace the first two lines of the mockReply template so the mock output names the persona (helpful for testing without the API key):

```ts
if (!client) {
  const lastUserMsg = history.filter((m) => m.role === "user").pop();
  const mockReply = `[Mock Response from ${resolvedPersona === "stella" ? "Stella" : "Finn"} — ANTHROPIC_API_KEY not set in environment]

I received your question: "${lastUserMsg?.content.slice(0, 200) || ""}"
```

- [ ] **Step 5.5: Verify build passes**

```bash
./node_modules/.bin/next build
```

Expected: 97/97 pages, no TS errors. TypeScript will flag every existing call site of `generateResponse` — there is exactly one, in `src/app/api/ai/chat/route.ts`. We fix that in Task 6.

If the build errors with something other than the `/api/ai/chat` call-site-argument error, stop and investigate.

- [ ] **Step 5.6: Do NOT commit yet**

The build is red because the API route still calls `generateResponse` with the old 2-arg signature. We commit Task 5 and Task 6 together so main is never broken between commits.

---

## Task 6: Pipe `preferredGeneralist` through the chat API route

**Files:**
- Modify: `src/app/api/ai/chat/route.ts`

- [ ] **Step 6.1: Load the partner's preferred generalist before calling `generateResponse`**

In `src/app/api/ai/chat/route.ts`, find this block inside the `POST` handler:

```ts
    // Build per-user dynamic context (not cached, changes frequently)
    const userContext = await buildUserContext(userId, userType);

    // Call Anthropic (or mock)
    const result = await generateResponse(userContext, history);
```

Replace it with:

```ts
    // Build per-user dynamic context (not cached, changes frequently)
    const userContext = await buildUserContext(userId, userType);

    // Resolve the caller's preferred generalist persona. Partners store it
    // on Partner.preferredGeneralist; admin users on User.preferredGeneralist
    // (admin UI for this lands later — for now admins always get the default).
    let personaId: "finn" | "stella" = "finn";
    if (userType === "partner") {
      const partnerPref = await prisma.partner.findUnique({
        where: { partnerCode: userId },
        select: { preferredGeneralist: true },
      });
      if (partnerPref?.preferredGeneralist === "stella") {
        personaId = "stella";
      }
    } else if (session.user.email) {
      const userPref = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { preferredGeneralist: true },
      });
      if (userPref?.preferredGeneralist === "stella") {
        personaId = "stella";
      }
    }

    // Call Anthropic (or mock)
    const result = await generateResponse(userContext, history, personaId);
```

- [ ] **Step 6.2: Persist `speakerPersona` on the assistant message**

Still in the same file, find this block:

```ts
    const assistantMessage = await prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: result.content,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cachedTokens: result.cacheReadTokens,
        cacheReadTokens: result.cacheReadTokens,
        cacheCreationTokens: result.cacheCreationTokens,
      },
    });
```

Add `speakerPersona: personaId` to the `data` object:

```ts
    const assistantMessage = await prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: result.content,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cachedTokens: result.cacheReadTokens,
        cacheReadTokens: result.cacheReadTokens,
        cacheCreationTokens: result.cacheCreationTokens,
        speakerPersona: personaId,
      },
    });
```

- [ ] **Step 6.3: Return `speakerPersona` in the response payload**

Find the response shape at the bottom of the handler:

```ts
      assistantMessage: {
        id: assistantMessage.id,
        role: "assistant",
        content: assistantMessage.content,
        createdAt: assistantMessage.createdAt,
      },
      mocked: result.mocked,
    });
```

Replace with:

```ts
      assistantMessage: {
        id: assistantMessage.id,
        role: "assistant",
        content: assistantMessage.content,
        createdAt: assistantMessage.createdAt,
        speakerPersona: assistantMessage.speakerPersona,
      },
      mocked: result.mocked,
      persona: personaId,
    });
```

- [ ] **Step 6.4: Update the `GET /api/ai/chat/conversations/[id]` response to include `speakerPersona`**

Open `src/app/api/ai/conversations/[id]/route.ts` (if it exists — it's the endpoint `ConversationList` uses). Find the message-selection query and make sure `speakerPersona` is included in the returned fields. The file is short (~40-80 lines).

If the route uses `prisma.aiMessage.findMany(...)` without an explicit `select`, no change needed — Prisma returns all columns by default.

If it uses an explicit `select: { ... }`, add `speakerPersona: true` to the select block.

Verify by reading the file:

```bash
cat src/app/api/ai/conversations/*/route.ts 2>/dev/null
```

- [ ] **Step 6.5: Verify build passes**

```bash
./node_modules/.bin/next build
```

Expected: 97/97, no TS errors. This is the first green build after the signature change.

- [ ] **Step 6.6: Commit Tasks 5 + 6 together**

```bash
git add src/lib/ai.ts src/app/api/ai/chat/route.ts src/app/api/ai/conversations
git commit -m "feat(ai): thread preferredGeneralist through generateResponse

generateResponse now accepts a personaId and injects the persona's voice
wrapper block between the cached KNOWLEDGE_BASE and the per-user context.
Cached knowledge stays cache-hittable for both personas; only the ~200-token
voice wrapper is uncached per turn.

The chat route looks up Partner.preferredGeneralist (or User for admins),
defaults to Finn when null, and persists speakerPersona on the assistant
message so the UI can render the correct avatar + name."
```

---

## Task 7: `PersonaAvatar` component

**Files:**
- Create: `src/components/ai/PersonaAvatar.tsx`

Reusable renderer: given a `PersonaId`, shows the avatar SVG + name with optional size + subtitle. Used by the chat header banner, the `MessageBubble`, the picker modal, and the settings card.

- [ ] **Step 7.1: Create the `src/components/ai/` directory**

```bash
mkdir -p src/components/ai
```

- [ ] **Step 7.2: Write the `PersonaAvatar` component**

Write `src/components/ai/PersonaAvatar.tsx`:

```tsx
"use client";

import Image from "next/image";
import { PERSONAS, resolvePersonaId } from "@/lib/ai-personas";

type Size = "sm" | "md" | "lg";

const SIZE_PX: Record<Size, number> = { sm: 24, md: 36, lg: 56 };

export default function PersonaAvatar({
  personaId,
  size = "md",
  showName = true,
  showTagline = false,
  className = "",
}: {
  personaId: string | null | undefined;
  size?: Size;
  showName?: boolean;
  showTagline?: boolean;
  className?: string;
}) {
  const resolved = resolvePersonaId(personaId);
  const persona = PERSONAS[resolved];
  const px = SIZE_PX[size];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Image
        src={persona.avatarSrc}
        alt={persona.displayName}
        width={px}
        height={px}
        className="rounded-full flex-shrink-0"
        style={{ width: px, height: px }}
      />
      {(showName || showTagline) && (
        <div className="flex flex-col min-w-0">
          {showName && (
            <span
              className="font-body text-[12px] font-semibold leading-tight"
              style={{ color: persona.accentHex }}
            >
              {persona.displayName}
            </span>
          )}
          {showTagline && (
            <span className="font-body text-[10px] text-[var(--app-text-muted)] leading-tight truncate">
              {persona.tagline}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7.3: Verify the component compiles**

```bash
./node_modules/.bin/next build
```

Expected: 97/97. If the build warns about the unused import when the component isn't referenced anywhere yet, that's fine — Tasks 8 and 9 use it.

- [ ] **Step 7.4: Commit**

```bash
git add src/components/ai/PersonaAvatar.tsx
git commit -m "feat(ai): PersonaAvatar component

Reusable avatar + name + optional tagline renderer keyed by PersonaId.
Used by chat header, MessageBubble, picker modal, and settings card."
```

---

## Task 8: `PersonaPickerModal` component

**Files:**
- Create: `src/components/ai/PersonaPickerModal.tsx`

Two side-by-side cards. Click a card → fires `onPick(personaId)`. Parent handles the PATCH to settings. Follows the modal-opacity convention from memory (`app-bg-secondary` + `bg-black/80` + `backdrop-blur`).

- [ ] **Step 8.1: Write the modal component**

Write `src/components/ai/PersonaPickerModal.tsx`:

```tsx
"use client";

import Image from "next/image";
import { useState } from "react";
import { PERSONAS, type PersonaId } from "@/lib/ai-personas";

export default function PersonaPickerModal({
  open,
  onPick,
  onClose,
  title = "Pick your AI assistant",
  subtitle = "You can switch any time in Account Settings.",
  allowClose = true,
}: {
  open: boolean;
  onPick: (personaId: "finn" | "stella") => void | Promise<void>;
  onClose?: () => void;
  title?: string;
  subtitle?: string;
  allowClose?: boolean;
}) {
  const [submitting, setSubmitting] = useState<PersonaId | null>(null);

  if (!open) return null;

  async function handlePick(id: "finn" | "stella") {
    setSubmitting(id);
    try {
      await onPick(id);
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl bg-[var(--app-bg-secondary)] border border-[var(--app-border)] rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-5 pt-5 pb-3 border-b border-[var(--app-border)] flex items-start justify-between gap-3">
          <div>
            <div className="font-display text-lg font-bold text-[var(--app-text)] mb-1">{title}</div>
            <div className="font-body text-[12px] text-[var(--app-text-muted)]">{subtitle}</div>
          </div>
          {allowClose && onClose && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--app-text-muted)] hover:bg-[var(--app-input-bg)]"
            >
              ✕
            </button>
          )}
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(["finn", "stella"] as const).map((id) => {
            const persona = PERSONAS[id];
            const busy = submitting === id;
            return (
              <button
                key={id}
                onClick={() => handlePick(id)}
                disabled={!!submitting}
                className="group text-left bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-xl p-4 hover:border-[var(--app-accent,#c4a050)] transition-colors disabled:opacity-50 min-h-[44px]"
                style={{ borderColor: busy ? persona.accentHex : undefined }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <Image
                    src={persona.avatarSrc}
                    alt={persona.displayName}
                    width={48}
                    height={48}
                    className="rounded-full"
                  />
                  <div>
                    <div className="font-display text-base font-bold" style={{ color: persona.accentHex }}>
                      {persona.displayName}
                    </div>
                    <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider">
                      {persona.tagline}
                    </div>
                  </div>
                </div>
                <div className="font-body text-[12px] text-[var(--app-text-secondary)] leading-relaxed">
                  {persona.longDescription}
                </div>
                <div className="mt-3 font-body text-[11px] font-semibold" style={{ color: persona.accentHex }}>
                  {busy ? "Setting…" : `Pick ${persona.displayName} →`}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8.2: Verify build**

```bash
./node_modules/.bin/next build
```

Expected: 97/97. The component is still unused; Task 9 wires it in.

- [ ] **Step 8.3: Commit**

```bash
git add src/components/ai/PersonaPickerModal.tsx
git commit -m "feat(ai): PersonaPickerModal component

Two-card side-by-side picker. Follows the modal-opacity convention
(bg-black/80 + backdrop-blur + app-bg-secondary container).
allowClose=false for the mandatory first-visit path; allowClose=true
for the switcher surface in Account Settings."
```

---

## Task 9: Wire picker + banner into the AI assistant page

**Files:**
- Modify: `src/app/(partner)/dashboard/ai-assistant/page.tsx`

Three changes:
1. Load the partner's `preferredGeneralist` on mount; if null, show the picker modal (not-closable until they pick).
2. Render a `PersonaAvatar` in the chat header showing the current generalist.
3. Update `MessageBubble` so assistant messages render the speaker's avatar + name instead of the hardcoded "PartnerOS" label.

- [ ] **Step 9.1: Add imports at the top of the page file**

Open `src/app/(partner)/dashboard/ai-assistant/page.tsx`. After the existing imports (the block ending `import PageTabBar from "@/components/ui/PageTabBar";`), add:

```tsx
import PersonaAvatar from "@/components/ai/PersonaAvatar";
import PersonaPickerModal from "@/components/ai/PersonaPickerModal";
import { resolvePersonaId } from "@/lib/ai-personas";
```

- [ ] **Step 9.2: Extend the `Message` interface to carry `speakerPersona`**

Near the top of the file, find:

```tsx
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}
```

Replace with:

```tsx
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  speakerPersona?: string | null;
}
```

- [ ] **Step 9.3: Add `preferredGeneralist` state + load logic**

Inside the `AiAssistantPage` component, after the existing `useState` declarations (right after `const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);`), add:

```tsx
  const [preferredGeneralist, setPreferredGeneralist] = useState<string | null | undefined>(undefined);
  const [pickerOpen, setPickerOpen] = useState(false);
```

(`undefined` = not yet loaded; `null` = loaded, none set; `"finn"|"stella"` = loaded + set.)

- [ ] **Step 9.4: Fetch the preference alongside existing config load**

Find the existing `loadConfig` function:

```tsx
  async function loadConfig() {
    try {
      const res = await fetch("/api/ai/chat");
      if (res.ok) {
        const data = await res.json();
        setAiEnabled(data.enabled);
      }
    } catch {}
  }
```

Add a second loader right below it:

```tsx
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
```

Then extend the `useEffect` that runs on mount:

```tsx
  useEffect(() => {
    Promise.all([loadConversations(), loadConfig()]).then(() => setLoading(false));
  }, []);
```

Replace with:

```tsx
  useEffect(() => {
    Promise.all([loadConversations(), loadConfig(), loadPersona()]).then(() => setLoading(false));
  }, []);
```

- [ ] **Step 9.5: Open the picker when `preferredGeneralist` loads as `null`**

Right after the updated `useEffect`, add:

```tsx
  // Open the picker the first time we learn the partner has no generalist set.
  useEffect(() => {
    if (preferredGeneralist === null) {
      setPickerOpen(true);
    }
  }, [preferredGeneralist]);
```

- [ ] **Step 9.6: Add the `handlePickPersona` function**

Add this function near the other handlers (e.g., right before `deleteConversation`):

```tsx
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
```

- [ ] **Step 9.7: Render the picker modal**

At the very top of the component's return (right after the opening `<div className="flex flex-col" style={{ height: "calc(100vh - 120px)" }}>`), add:

```tsx
      <PersonaPickerModal
        open={pickerOpen}
        onPick={handlePickPersona}
        onClose={preferredGeneralist ? () => setPickerOpen(false) : undefined}
        allowClose={!!preferredGeneralist}
        title={preferredGeneralist ? "Switch assistant" : "Pick your AI assistant"}
      />
```

- [ ] **Step 9.8: Replace the hardcoded "Fintella PartnerOS" heading with a persona banner**

Find the existing header:

```tsx
            <h2 className={`font-display ${device.isMobile ? "text-xl" : "text-2xl"} font-bold mb-1 flex items-center gap-2`}>
              Fintella PartnerOS
              <span className="font-body text-[10px] bg-brand-gold/15 text-brand-gold border border-brand-gold/30 rounded-full px-2 py-0.5 tracking-wider uppercase">
                Beta
              </span>
            </h2>
            <p className="font-body text-[12px] text-[var(--app-text-muted)]">
              Ask me anything about the portal, your deals, commissions, or downline.
            </p>
```

Replace with:

```tsx
            <h2 className={`font-display ${device.isMobile ? "text-xl" : "text-2xl"} font-bold mb-1 flex items-center gap-2`}>
              Fintella PartnerOS
              <span className="font-body text-[10px] bg-brand-gold/15 text-brand-gold border border-brand-gold/30 rounded-full px-2 py-0.5 tracking-wider uppercase">
                Beta
              </span>
            </h2>
            <div className="flex items-center gap-3 flex-wrap">
              <PersonaAvatar
                personaId={preferredGeneralist}
                size="sm"
                showName
                showTagline
              />
              {preferredGeneralist && (
                <button
                  onClick={() => setPickerOpen(true)}
                  className="font-body text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] hover:text-[var(--app-text)] underline-offset-2 hover:underline"
                >
                  Switch
                </button>
              )}
            </div>
```

- [ ] **Step 9.9: Update `MessageBubble` to render the speaker's avatar + name**

Scroll to the `MessageBubble` function near the bottom of the file. Replace the existing function body:

```tsx
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
```

Replace with:

```tsx
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
          <div className="mb-1">
            <PersonaAvatar
              personaId={message.speakerPersona}
              size="sm"
              showName
              showTagline={false}
            />
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
```

- [ ] **Step 9.10: Verify build**

```bash
./node_modules/.bin/next build
```

Expected: 97/97, no TS errors.

- [ ] **Step 9.11: Verify lint**

```bash
npm run lint
```

Expected: no new warnings introduced. There are existing warnings in the repo — do not fix unrelated ones.

- [ ] **Step 9.12: Manual smoke-test on dev server**

```bash
npm run dev
```

In a browser logged in as a partner with `preferredGeneralist = null` (easiest: open Prisma Studio and clear it for your test partner):

1. Open `/dashboard/ai-assistant` — the picker modal should render, not closable.
2. Click either card — modal closes, banner updates to show the picked persona.
3. Send a message — the assistant reply renders with the picked persona's avatar + name (in mock mode, the `[Mock Response from Finn/Stella]` prefix confirms the persona threaded through).
4. Click "Switch" in the header — the picker reopens, this time closable. Pick the other persona, send another message, confirm the new avatar renders.
5. Reload the page — the picked persona persists (via `preferredGeneralist`).

Stop the dev server with `Ctrl+C`.

- [ ] **Step 9.13: Commit**

```bash
git add src/app/\(partner\)/dashboard/ai-assistant/page.tsx
git commit -m "feat(ai): persona picker + banner + per-message speaker avatar

First-visit picker modal (not closable until picked) fires when
Partner.preferredGeneralist is null. Persistent persona banner with
'Switch' link in the chat header. MessageBubble renders each assistant
turn with the speaker's avatar + name."
```

---

## Task 10: "AI Preferences" section in Account Settings

**Files:**
- Modify: `src/app/(partner)/dashboard/settings/page.tsx`

Read the file structure once before making changes — the page has multiple sections already. We're adding a small card consistent with the surrounding styling.

- [ ] **Step 10.1: Review the existing settings page structure**

```bash
grep -nE "function|useState|section|div className" src/app/\(partner\)/dashboard/settings/page.tsx | head -60
```

Note where the existing sections (e.g., Personal Info, Communications, Payout) are rendered. We'll add the AI Preferences card in a similar pattern.

- [ ] **Step 10.2: Add imports at the top of the file**

After the existing imports, add:

```tsx
import PersonaAvatar from "@/components/ai/PersonaAvatar";
import { PERSONAS } from "@/lib/ai-personas";
```

- [ ] **Step 10.3: Add `preferredGeneralist` to the form state**

Find the existing `useState` block that holds the form data. It'll be a single big object state (e.g., `formData`) or multiple small useStates. Whatever pattern is used, add a `preferredGeneralist: string | null` field/state. If the pattern is a single `formData` object, include it:

```tsx
preferredGeneralist: "finn" as string,
```

Follow the file's existing naming — if the object is `formData`, use `setFormData`, etc.

- [ ] **Step 10.4: Populate the field from the GET response**

Wherever the existing GET payload is unpacked into state (look for the `loadSettings` / `useEffect` that calls `fetch("/api/partner/settings")`), include `preferredGeneralist` in the initial state:

```ts
preferredGeneralist: data.preferredGeneralist || "finn",
```

- [ ] **Step 10.5: Render the new AI Preferences section**

Pick a logical spot in the JSX — after "Personal Info" or alongside "Communications" feels natural. Insert this card (match the surrounding section wrapper styles — usually a `<section>` or `<div>` with a heading, a description, and form controls):

```tsx
{/* ── AI PREFERENCES ─────────────────────────────────────────── */}
<section className="bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-xl p-5 sm:p-6">
  <div className="mb-4">
    <h3 className="font-display text-base font-bold mb-1">AI Assistant</h3>
    <p className="font-body text-[12px] text-[var(--app-text-muted)]">
      Pick the voice you want for your PartnerOS assistant. Both have the same knowledge; only the tone differs.
    </p>
  </div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    {(["finn", "stella"] as const).map((id) => {
      const persona = PERSONAS[id];
      const selected = (formData.preferredGeneralist || "finn") === id;
      return (
        <button
          key={id}
          type="button"
          onClick={() => setFormData({ ...formData, preferredGeneralist: id })}
          className="text-left bg-[var(--app-input-bg)] rounded-lg p-3 border transition-colors"
          style={{
            borderColor: selected ? persona.accentHex : "var(--app-border)",
          }}
        >
          <div className="flex items-center gap-3">
            <PersonaAvatar personaId={id} size="md" showName={false} />
            <div className="flex-1 min-w-0">
              <div className="font-body text-[13px] font-semibold" style={{ color: persona.accentHex }}>
                {persona.displayName}
              </div>
              <div className="font-body text-[11px] text-[var(--app-text-muted)] truncate">
                {persona.tagline}
              </div>
            </div>
            {selected && (
              <span className="font-body text-[10px] font-semibold uppercase tracking-wider" style={{ color: persona.accentHex }}>
                Current
              </span>
            )}
          </div>
        </button>
      );
    })}
  </div>
</section>
```

**Important:** replace `formData` and `setFormData` with whatever the file's existing state names are. If the file uses individual `useState` hooks per field, replace with a single `setPreferredGeneralist(id)` call and read `preferredGeneralist === id`.

- [ ] **Step 10.6: Make sure the Save button PATCHes the new field**

Find the submit handler that sends the PATCH to `/api/partner/settings`. Ensure `preferredGeneralist` is in the body payload:

```ts
body: JSON.stringify({
  // ... existing fields ...
  preferredGeneralist: formData.preferredGeneralist,
}),
```

Match the exact existing style — if all fields are spread via `...formData`, no change needed because the new state field is already included.

- [ ] **Step 10.7: Verify build + lint**

```bash
./node_modules/.bin/next build && npm run lint
```

Expected: 97/97 pages, no new lint warnings.

- [ ] **Step 10.8: Manual spot-check**

```bash
npm run dev
```

As a logged-in partner:

1. Open `/dashboard/settings`.
2. Scroll to the new "AI Assistant" card.
3. Confirm the current persona is marked "Current."
4. Click the other persona card — selection visually updates.
5. Click the page's existing Save button — the PATCH fires.
6. Reload and confirm the new selection persists.
7. Go to `/dashboard/ai-assistant` — the banner reflects the new choice.

Stop dev server.

- [ ] **Step 10.9: Commit**

```bash
git add src/app/\(partner\)/dashboard/settings/page.tsx
git commit -m "feat(settings): AI Assistant persona picker in account settings

Small two-card section in /dashboard/settings letting partners switch
Finn ↔ Stella without opening the AI assistant. Piggybacks on the
existing settings PATCH — no new route surface."
```

---

## Task 11: Partner settings API — accept + return `preferredGeneralist`

**Files:**
- Modify: `src/app/api/partner/settings/route.ts` (GET + PATCH)

- [ ] **Step 11.1: Add `preferredGeneralist` to the GET response**

In `src/app/api/partner/settings/route.ts`, find the existing GET `NextResponse.json({ ... })` body. Add `preferredGeneralist` alongside the other `partner.*` fields:

```ts
preferredGeneralist: partner.preferredGeneralist || null,
```

Place it near `emailOptIn` / `smsOptIn` since those are similar preference fields.

- [ ] **Step 11.2: Accept `preferredGeneralist` in the PATCH body**

Find the PATCH handler (starts near line 73). Locate the block that destructures the body (e.g. `const { firstName, lastName, ... } = body;`) and add `preferredGeneralist` to the destructure.

Then find the `prisma.partner.update({ data: { ... } })` call. Add this line inside the `data` object, guarded against invalid values:

```ts
...(typeof preferredGeneralist === "string" &&
(preferredGeneralist === "finn" || preferredGeneralist === "stella")
  ? { preferredGeneralist }
  : {}),
```

The guard prevents injection of arbitrary strings. Only "finn" or "stella" may ever be persisted.

- [ ] **Step 11.3: Verify build**

```bash
./node_modules/.bin/next build
```

Expected: 97/97.

- [ ] **Step 11.4: End-to-end manual test**

```bash
npm run dev
```

Full flow as a logged-in partner:

1. Reset your test partner's `preferredGeneralist` to `null` via Prisma Studio.
2. Open `/dashboard/ai-assistant` — picker modal appears, not closable.
3. Pick Stella — modal closes, banner shows Stella.
4. Send a message — response renders as a Stella mock.
5. Open `/dashboard/settings` — "Current" flag shows Stella.
6. In settings, pick Finn + click Save.
7. Reload `/dashboard/ai-assistant` — banner now shows Finn. Send a message — responds as Finn.
8. Click the Switch link in the chat header — picker opens closable. Pick Stella.
9. Reload settings — Stella shows as Current.

Stop dev server.

- [ ] **Step 11.5: Commit**

```bash
git add src/app/api/partner/settings/route.ts
git commit -m "feat(api): accept preferredGeneralist on partner settings route

GET returns the current pick (null if unset). PATCH accepts finn or
stella with a strict allowlist — arbitrary strings are silently ignored
so the column can never hold an invalid value."
```

---

## Task 12: Refresh `.claude/session-state.md`

**Files:**
- Modify: `.claude/session-state.md`

The file is stale — pinned at PR #467. We're at `bc0bd5f` (PR #529) plus the Phase 1 work on this branch. This is the last task before final PR prep.

- [ ] **Step 12.1: Read the current session state**

```bash
cat .claude/session-state.md | head -40
```

Note the existing structure so the refresh keeps the same top-level sections (`🕒 Last updated`, `🌿 Git state`, `✅ This session`, `🎯 Queued`, `🧠 Context`, `📂 Relevant files`, `Previous sessions preserved below`).

- [ ] **Step 12.2: Rewrite the top section**

Replace the top of `.claude/session-state.md` (from the `# Session State` heading through `## 🧠 Context that matters for resuming`) with a fresh summary. Keep the `## Previous sessions preserved below` tail intact — that's archival content.

Use this structure (substitute the branch HEAD sha that `git rev-parse HEAD` prints):

```markdown
# Session State

🕒 Last updated: 2026-04-24 — PartnerOS AI Phase 1 (persona split) implemented on branch `claude/partneros-phase-1-persona-split`. Design spec at `docs/superpowers/specs/2026-04-24-partneros-ai-roadmap-design.md` on branch `claude/partneros-ai-roadmap-design` (commit `5d7884b`). Phase 1 branch ships Finn + Stella generalist split: persona registry, voice wrappers, first-visit picker, persistent banner, per-message speaker avatar, Account Settings switcher. No new capabilities; same knowledge base + same rate limits as pre-existing PartnerOS. Both branches are local — not yet pushed. Main is at `bc0bd5f` (#529 SendGrid engagement stats).

## 🌿 Git state
- **main HEAD:** `bc0bd5f` — feat(sendgrid): event webhook + per-template engagement stats (#529)
- **origin/main:** in sync
- **Active branch:** `claude/partneros-phase-1-persona-split` (Phase 1 impl; local only, not pushed)
- **Sibling branch:** `claude/partneros-ai-roadmap-design` (spec doc; local only, not pushed)
- **Working tree:** clean
- **Open non-dependabot PRs on origin:** 0 (#357 still DRAFT — flagged, don't merge)

## ✅ This session — PartnerOS Phase 1

**Brainstorm → spec → plan → impl:**
- Ran superpowers:brainstorming for the full PartnerOS AI roadmap (4 personas, multi-inbox routing, escalation ladder, bug triage, IT emergency call chain).
- Wrote 981-line design spec at `docs/superpowers/specs/2026-04-24-partneros-ai-roadmap-design.md` covering all three phases.
- Wrote Phase 1 implementation plan at `docs/superpowers/plans/2026-04-24-partneros-phase-1-persona-split.md`.
- Implemented Phase 1 end-to-end: schema, persona registry, avatar SVGs, system-prompt plumbing, chat API threading, picker modal, banner, settings switcher.

## 🎯 Queued next

1. **Push + open PRs** — design branch and Phase 1 branch, in that order (design first so it's citeable from the impl PR).
2. **Phase 2 — Product Specialist (Tara) + knowledge ingestion** — another plan via superpowers:writing-plans once Phase 1 merges. Includes Whisper transcription pipeline for videos/audio/weekly recordings.
3. **Phase 3 — Support Specialist (Ollie) + escalation ladder + admin-inbox routing + bug triage** — largest phase (~14 PRs).
4. **Still flagged from earlier sessions:**
   - MinIO VPS bootstrap → unblocks PR #357 note attachments.
   - SendGrid Event Webhook wiring in SendGrid dashboard (ops, John).
   - Optional: enable onboarding_nudge workflow via /admin/automations.

## 🧠 Context that matters for resuming
```

Keep everything below `## Previous sessions preserved below` untouched.

- [ ] **Step 12.3: Verify build + lint one last time**

```bash
./node_modules/.bin/next build && npm run lint
```

Expected: 97/97 pages, clean lint. This is the final verification before PR prep.

- [ ] **Step 12.4: Commit**

```bash
git add .claude/session-state.md
git commit -m "chore: refresh session-state.md for PartnerOS Phase 1

Previously pinned at #467. Now reflects main at #529 + the Phase 1
persona-split work on claude/partneros-phase-1-persona-split."
```

---

## Task 13: Final build + push + PR prep

**Files:** none modified.

- [ ] **Step 13.1: Full clean build**

```bash
./node_modules/.bin/next build
```

Expected: 97/97 pages, no errors, no new warnings.

- [ ] **Step 13.2: Full lint**

```bash
npm run lint
```

Expected: ✔ No new warnings.

- [ ] **Step 13.3: Final end-to-end manual smoke test**

```bash
npm run dev
```

Run the full flow from Step 11.4 one more time on the clean branch tip.

- [ ] **Step 13.4: Review the commit log**

```bash
git log --oneline main..HEAD
```

Expected: 9 commits, in this order:
1. `feat(ai): add preferredGeneralist + AiMessage persona columns`
2. `feat(ai): add Finn + Stella avatar SVGs`
3. `feat(ai): persona registry module (Finn + Stella)`
4. `feat(ai): thread preferredGeneralist through generateResponse`
5. `feat(ai): PersonaAvatar component`
6. `feat(ai): PersonaPickerModal component`
7. `feat(ai): persona picker + banner + per-message speaker avatar`
8. `feat(settings): AI Assistant persona picker in account settings`
9. `feat(api): accept preferredGeneralist on partner settings route`
10. `chore: refresh session-state.md for PartnerOS Phase 1`

(Order above has 10 commits since the session-state commit is Task 12.4.)

- [ ] **Step 13.5: Confirm with John before pushing**

Do NOT `git push` without explicit approval from John. Per CLAUDE.md: *"NEVER commit changes unless the user explicitly asks you to."* — same spirit applies to pushes. Report readiness and wait:

> Ready to push `claude/partneros-phase-1-persona-split` to origin and open a PR. Proceed?

- [ ] **Step 13.6: On approval — push + open PR**

```bash
git push -u origin claude/partneros-phase-1-persona-split
gh pr create --title "feat(ai): PartnerOS Phase 1 — Finn + Stella persona split" --body "$(cat <<'EOF'
## Summary

Phase 1 of the PartnerOS AI roadmap (spec: `docs/superpowers/specs/2026-04-24-partneros-ai-roadmap-design.md` on branch `claude/partneros-ai-roadmap-design`). Replaces the single-persona PartnerOS with a **Finn + Stella** generalist split. Same knowledge base, same rate limits, same tool surface — only the voice differs.

- New persona registry at `src/lib/ai-personas.ts` that Phase 2 (Tara) and Phase 3 (Ollie) will extend.
- First-visit picker modal, persistent persona banner in the chat header with a "Switch" link, per-message speaker avatar.
- AI Assistant card in Account Settings for switching without opening the assistant.
- Schema additions are strictly additive: `Partner.preferredGeneralist`, `User.preferredGeneralist`, `AiMessage.speakerPersona` / `handoffMetadata` / `attachments`.

## Test plan

- [ ] Log in as a partner with `preferredGeneralist = null` → first-visit picker appears, not closable.
- [ ] Pick Stella → banner updates, messages respond as Stella.
- [ ] Reload → Stella persists.
- [ ] Switch to Finn via header Switch link → banner + subsequent messages update.
- [ ] Open Account Settings → "Current" flag matches the chosen persona.
- [ ] Switch via settings + Save → reflected in the chat banner after reload.
- [ ] Build: `./node_modules/.bin/next build` → 97/97 static pages.
- [ ] Lint: `npm run lint` → no new warnings.
- [ ] Mock mode (no `ANTHROPIC_API_KEY`): mock response prefix correctly names the chosen persona.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 13.7: Return the PR URL**

Copy the URL `gh pr create` returns and report it back in the final message to John, along with the `main..HEAD` commit count and the final `git status` output.

---

## Self-Review (run this before declaring the plan complete)

**Spec coverage check:**

- Spec §3.1 Finn — ✓ Task 4 (registry), Task 7 (avatar renderer), Task 9 (banner + MessageBubble)
- Spec §3.2 Stella — ✓ same as Finn
- Spec §3.5 Persona metadata registry — ✓ Task 4
- Spec §3.6 User persona preference — ✓ Task 2 (schema), Task 9 (UI), Task 10 (settings), Task 11 (API)
- Spec §8.1 Phase 1 schema delta — ✓ Task 2
- Spec §9.1.1–9.1.5 — ✓ all five scoped PRs collapsed into the task flow (9.1.1 = Task 2, 9.1.2 = Task 3 + 4, 9.1.3 = Task 5, 9.1.4 = Task 6 + 7 + 8 + 9 + 10 + 11, 9.1.5 = Task 12)
- Memory housekeeping ("Fin" → "Finn") — the MEMORY.md entry and `project_fintella_partneros_roadmap.md` were updated during the spec-writing session, so no additional task needed here; session-state.md gets a fresh write in Task 12.

**Placeholder scan:**
- No "TBD" / "TODO" / "fill in later" in the plan.
- Every code block has the exact content to paste.
- All file paths are absolute within the repo.

**Type consistency:**
- `PersonaId` defined in Task 4 as `"finn" | "stella" | "tara" | "ollie"`; Task 7 / 8 / 9 use the subset type `"finn" | "stella"` consistently.
- `resolvePersonaId` signature and return type match across all call sites.
- `buildPersonaVoiceBlock` defined in Task 4, called only in Task 5; argument is the narrow `"finn" | "stella"` type.
- `PersonaAvatar` prop shape consistent across the three render sites (chat header, MessageBubble, picker card, settings card).
