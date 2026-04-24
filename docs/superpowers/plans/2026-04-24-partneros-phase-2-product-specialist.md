# PartnerOS AI — Phase 2: Product Specialist (Tara) + Knowledge Ingestion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add **Tara** — the tariff-refund product SME — as the first specialist persona. Finn and Stella gain a `hand_off` tool they call when the question needs product depth. Tara's system prompt is built from a cached knowledge blob combining all published training modules, FAQs, and PDF/audio/video transcripts — regenerated when admins save content.

**Architecture:** Extends the `PERSONAS` registry shipped in Phase 1 with a Tara record. `generateResponse()` in `src/lib/ai.ts` grows to route specialist turns through a different system-prompt builder that reads from a cached knowledge blob. A new `AiKnowledgeVersion` singleton drives Anthropic prompt-cache invalidation — its value is embedded as a comment at the top of the blob so Anthropic's exact-match cache key flips on every admin save.

**Source spec:** `docs/superpowers/specs/2026-04-24-partneros-ai-roadmap-design.md` §3.3, §4, §8.2, §9.2.

**Tech Stack:** Same as Phase 1 (Next.js 14 App Router, Prisma 5.20, Anthropic SDK). New deps: `pdf-parse` (PDF text extraction, Phase 2b), `OPENAI_API_KEY` env (Whisper transcription, Phase 2c).

**Testing:** Same as Phase 1 — `./node_modules/.bin/next build` + manual dev-server verification. No Jest/Vitest in this repo.

---

## Phase 2 chunking (ship-in-order)

Given the full Phase 2 scope (~10 PRs in the spec), this plan delivers it in four **independently-shippable chunks** so Tara is useful on day one without waiting for the whole ingestion pipeline.

| Chunk | Ships | Depends on |
|---|---|---|
| **2a — Tara MVP** | Tara persona, NEVER_SAY_RULES, simple knowledge builder (TrainingModule.content + FAQ only), `hand_off` tool on Finn/Stella, visible handoff banner, "Talk to Tara" button | Phase 1 merged (`b459e50`) ✓ |
| **2b — PDF + Glossary** | `pdf-parse` integration, `TrainingResource.extractedText`, new `TrainingGlossary` model + admin UI, partner-side Glossary tab | 2a merged |
| **2c — Whisper pipeline** | `OPENAI_API_KEY` env, `AiTranscriptionJob` queue, Vercel Cron worker, enqueue hooks on module/resource/conference saves, `videoTranscript` / `audioTranscript` / `conference.transcript` columns | 2b merged |
| **2d — Polish** | Per-item AI opt-out if we hit 150k tokens, glossary tooltips across partner portal, admin "re-extract all" bulk button, token-usage dashboard tile | 2c merged + real-world usage data |

This plan details **Chunks 2a and 2b fully**. Chunks 2c and 2d get their own follow-up plans when we're ready to execute them — tuning knobs like Whisper cost budgeting + per-item ingestion gates benefit from real load data.

---

# Chunk 2a — Tara MVP

## File Structure (2a)

| Path | Action | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | Modify | Add `AiKnowledgeVersion` singleton model |
| `src/lib/ai-personas.ts` | Modify | Add `tara` record; extend `PERSONAS` map; update type unions |
| `src/lib/ai-compliance.ts` | Create | Hardcoded `NEVER_SAY_RULES` const |
| `src/lib/ai-knowledge.ts` | Create | `buildProductSpecialistPrompt()` — reads TrainingModule + FAQ, assembles cached block |
| `src/lib/ai.ts` | Modify | Route persona to correct system-prompt builder based on `role` field |
| `src/app/api/ai/chat/route.ts` | Modify | Handle `hand_off` tool-use responses from Finn/Stella; dispatch to Tara; persist `handoffMetadata` |
| `src/app/api/admin/training/modules/route.ts` | Modify | Bump `AiKnowledgeVersion` on create/update/delete |
| `src/app/api/admin/training/modules/[id]/route.ts` | Modify | Same |
| `src/app/api/admin/training/faq/route.ts` | Modify | Same |
| `src/app/api/admin/training/faq/[id]/route.ts` | Modify | Same |
| `src/lib/ai-knowledge-version.ts` | Create | Tiny helper `bumpKnowledgeVersion()` used by mutation routes |
| `public/ai-avatars/tara.svg` | Create | Tara's avatar — book-and-spectacles, slate blue (`#5e7eb8`) |
| `src/app/(partner)/dashboard/ai-assistant/page.tsx` | Modify | "Talk to Tara" button; transition banner when `speakerPersona` changes mid-conversation; pin/unpin |

## Task 1 (2a): Feature branch + baseline

- [ ] **Step 1.1:** Confirm branch state

```bash
git checkout main && git pull --ff-only
git checkout -b claude/partneros-phase-2a-tara-mvp
```

- [ ] **Step 1.2:** Baseline build

```bash
./node_modules/.bin/next build 2>&1 | grep -E "Compiled|Error" | head -5
```

Expected: `Compiled successfully`, 177/177 pages.

## Task 2 (2a): Add `AiKnowledgeVersion` schema

- [ ] **Step 2.1:** Append to `prisma/schema.prisma` near the other AI models (around line 870):

```prisma
// Singleton row whose value is embedded in Tara's cached system prompt
// (as an HTML comment). Bumping the value invalidates Anthropic's exact-
// match prompt cache, forcing a fresh cache block write on next request.
model AiKnowledgeVersion {
  id          String    @id @default("singleton")
  version     BigInt    @default(0)
  updatedAt   DateTime  @updatedAt
}
```

- [ ] **Step 2.2:** Regenerate client + verify build

```bash
npx prisma generate
./node_modules/.bin/next build 2>&1 | grep -E "Compiled|Error" | head -5
```

- [ ] **Step 2.3:** Commit

```bash
git add prisma/schema.prisma
git commit -m "feat(ai): add AiKnowledgeVersion singleton for cache invalidation

Single-row model whose version number is embedded as an HTML comment at
the top of Tara's cached system prompt. Any mutation to training content
bumps this value, changing the exact text of the cached block, which
invalidates Anthropic's prompt cache and forces a fresh write on next
request.

Strictly additive; Vercel deploy runs prisma db push automatically."
```

## Task 3 (2a): `NEVER_SAY_RULES` compliance floor

- [ ] **Step 3.1:** Create `src/lib/ai-compliance.ts`:

```ts
/**
 * PartnerOS AI — hardcoded compliance floor
 *
 * Injected verbatim at the top of Tara's (Phase 2) and the Support
 * Specialist's (Phase 3) system prompts, ABOVE any admin-editable
 * training content. Hardcoded so an accidental admin edit to a
 * training module cannot remove the safety floor.
 *
 * See the design spec §4.4 for rationale.
 */
export const NEVER_SAY_RULES: readonly string[] = [
  "Do not guarantee any specific refund amount, percentage, or dollar figure to a prospect.",
  "Do not promise any timeline for refund receipt — only describe typical historical ranges.",
  "Do not give legal advice; redirect to Frost Law attorneys. Fintella partners are not attorneys.",
  "Do not give tax advice; redirect to the prospect's own CPA.",
  "Do not discuss specific refund amounts from other clients — confidentiality.",
  "Do not imply Fintella has any government affiliation, endorsement, or authority.",
  "Avoid the phrases: 'guaranteed', 'risk-free', 'free money', 'easy cash', 'exclusive government program'.",
  "Always disclose when rebutting objections: 'Refund outcomes vary by case; past results do not guarantee future outcomes.'",
  "Always disclose in any marketing material: 'Services provided by Frost Law, a licensed law firm.'",
];

/**
 * Render the compliance rules as a markdown block suitable for the system
 * prompt. Deterministic output — same rules → same text → same cache key.
 */
export function renderComplianceBlock(): string {
  return [
    "# Compliance rules (MUST follow — non-negotiable safety floor)",
    "",
    ...NEVER_SAY_RULES.map((r, i) => `${i + 1}. ${r}`),
  ].join("\n");
}
```

- [ ] **Step 3.2:** Verify build

```bash
./node_modules/.bin/next build 2>&1 | grep -E "Compiled|Error" | head -5
```

- [ ] **Step 3.3:** Commit

```bash
git add src/lib/ai-compliance.ts
git commit -m "feat(ai): NEVER_SAY_RULES compliance floor for specialists

Hardcoded list of tariff/legal/marketing rules injected above any
admin-editable content in Tara's system prompt. Cannot be removed by
editing training modules in the admin UI.

Phase 3's Support Specialist (Ollie) will reuse renderComplianceBlock()
when she drafts marketing-copy reviews."
```

## Task 4 (2a): Knowledge version bump helper

- [ ] **Step 4.1:** Create `src/lib/ai-knowledge-version.ts`:

```ts
/**
 * Tiny helper to bump AiKnowledgeVersion.version whenever admin
 * training content changes. Idempotent — always upserts the singleton
 * row and increments the version. Call this from every training /
 * faq / glossary / conference mutation handler.
 */
import { prisma } from "@/lib/prisma";

const SINGLETON_ID = "singleton";

export async function bumpKnowledgeVersion(): Promise<bigint> {
  const row = await prisma.aiKnowledgeVersion.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, version: BigInt(1) },
    update: { version: { increment: 1 } },
  });
  return row.version;
}

export async function getKnowledgeVersion(): Promise<bigint> {
  const row = await prisma.aiKnowledgeVersion.findUnique({
    where: { id: SINGLETON_ID },
  });
  return row?.version ?? BigInt(0);
}
```

- [ ] **Step 4.2:** Verify build + commit

```bash
./node_modules/.bin/next build 2>&1 | grep -E "Compiled|Error" | head -5
git add src/lib/ai-knowledge-version.ts
git commit -m "feat(ai): bumpKnowledgeVersion helper

Upserts the AiKnowledgeVersion singleton on every mutation. Called from
admin training / FAQ mutation routes (next task) to invalidate Tara's
prompt cache."
```

## Task 5 (2a): Knowledge prompt builder (MVP — no PDFs/transcripts yet)

- [ ] **Step 5.1:** Create `src/lib/ai-knowledge.ts`:

```ts
/**
 * PartnerOS AI — Product Specialist knowledge assembly
 *
 * Builds the large cached system-prompt block for Tara. Reads all
 * published TrainingModules + FAQs and concatenates into one markdown
 * blob. Chunk 2a: modules + FAQs only. Chunk 2b adds PDFs + glossary.
 * Chunk 2c adds audio/video transcripts + weekly-call transcripts.
 *
 * The cache-version comment at the top flips on every knowledge
 * mutation, forcing Anthropic's prompt cache to rewrite. Effective cost
 * is a one-time ~$0.30-0.50 cache-write per save; all subsequent
 * requests hit the cache cheaply.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { renderComplianceBlock } from "./ai-compliance";
import { getKnowledgeVersion } from "./ai-knowledge-version";

export async function buildProductSpecialistPrompt(): Promise<Anthropic.Messages.TextBlockParam> {
  const [version, modules, faqs] = await Promise.all([
    getKnowledgeVersion(),
    prisma.trainingModule.findMany({
      where: { published: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      select: { title: true, category: true, content: true },
    }),
    prisma.fAQ.findMany({
      where: { published: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      select: { question: true, answer: true, category: true },
    }),
  ]);

  const text = [
    `<!-- knowledge version: ${version.toString()} -->`,
    renderComplianceBlock(),
    "",
    "# Training modules",
    modules.length
      ? modules
          .map(
            (m) =>
              `## ${m.title} [${m.category}]\n\n${m.content ?? "(no content)"}`
          )
          .join("\n\n")
      : "(no training modules published)",
    "",
    "# FAQs",
    faqs.length
      ? faqs
          .map((f) => `### ${f.question}\n\n${f.answer}`)
          .join("\n\n")
      : "(no FAQs published)",
  ].join("\n\n");

  return {
    type: "text",
    text,
    cache_control: { type: "ephemeral" },
  };
}
```

- [ ] **Step 5.2:** Verify build + commit

```bash
./node_modules/.bin/next build 2>&1 | grep -E "Compiled|Error" | head -5
git add src/lib/ai-knowledge.ts
git commit -m "feat(ai): buildProductSpecialistPrompt (Chunk 2a — modules + FAQs)

Assembles Tara's cached system-prompt block from compliance rules +
all published TrainingModule.content + all published FAQ rows. The
cache-version comment at the top of the output flips on every knowledge
mutation, forcing Anthropic prompt-cache invalidation.

Chunk 2b extends to PDFs + glossary. Chunk 2c adds audio/video
transcripts + weekly-call recordings."
```

## Task 6 (2a): Tara persona record + avatar

- [ ] **Step 6.1:** Create `public/ai-avatars/tara.svg` — book-and-spectacles silhouette in slate blue:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <circle cx="32" cy="32" r="30" fill="#5e7eb8" opacity="0.12"/>
  <circle cx="32" cy="32" r="30" stroke="#5e7eb8" stroke-width="1.5" opacity="0.5"/>
  <rect x="14" y="22" width="36" height="28" rx="3" fill="#5e7eb8" opacity="0.85"/>
  <line x1="32" y1="22" x2="32" y2="50" stroke="#1a2540" stroke-width="1.2"/>
  <circle cx="24" cy="18" r="4" stroke="#5e7eb8" stroke-width="1.8" fill="none"/>
  <circle cx="40" cy="18" r="4" stroke="#5e7eb8" stroke-width="1.8" fill="none"/>
  <line x1="28" y1="18" x2="36" y2="18" stroke="#5e7eb8" stroke-width="1.8"/>
</svg>
```

- [ ] **Step 6.2:** Extend `src/lib/ai-personas.ts` — add Tara to the PersonaId union + PERSONAS map + resolvePersonaId:

```ts
// Change the PersonaId union (already includes all four in Phase 1, no change needed)
// Extend PERSONAS record from Record<"finn" | "stella", Persona> to include "tara"
export const PERSONAS: Record<"finn" | "stella" | "tara", Persona> = {
  finn: { /* unchanged */ },
  stella: { /* unchanged */ },
  tara: {
    id: "tara",
    displayName: "Tara",
    role: "product_specialist",
    avatarSrc: "/ai-avatars/tara.svg",
    accentHex: "#5e7eb8",
    tagline: "Tariff refund expert. Cites sources.",
    longDescription:
      "Tara has read every training module, watched every weekly call, and knows the compliance rules cold. Ask her about pitch scripts, pre-qualification questions, rebuttals, marketing-copy compliance, or anything about the refund service itself. Finn and Stella hand off to her automatically when a question needs product depth.",
    voiceWrapperMarkdown: [
      "## Your persona — Tara",
      "",
      "You are **Tara**, the tariff refund product SME on the Fintella Partner Portal AI team. Your voice is:",
      "",
      "- Authoritative but not stiff. Structured answers — numbered or bulleted when it helps clarity.",
      "- Cite sources explicitly: \"Per the Eligibility module…\", \"From the pitch-script playbook…\". Builds trust.",
      "- Always distinguish what Fintella does (partner network) from what Frost Law does (legal filing).",
      "- Proactively flag compliance risks in marketing-copy requests: point out the rule before suggesting a compliant rewrite.",
      "- Never invent. If the answer isn't in your knowledge base, say so and offer to hand the conversation back to Stella to open a ticket.",
      "- Use the `hand_back` tool when the conversation shifts back to a general portal question Finn or Stella can handle.",
      "",
      "When a prospect-facing marketing / pitch-copy question comes up, your first instinct is ALWAYS to check the compliance rules above. If the partner's phrasing violates one, rewrite it compliantly and explain why.",
    ].join("\n"),
  },
};

// Extend resolvePersonaId signature
export function resolvePersonaId(input: string | null | undefined): "finn" | "stella" | "tara" {
  if (input === "stella") return "stella";
  if (input === "tara") return "tara";
  return "finn";
}
```

Note — `buildPersonaVoiceBlock` signature change: takes any `PersonaId` now, but Tara's system prompt is built differently (compliance + knowledge base, not just voice wrapper). Keep `buildPersonaVoiceBlock` for Finn/Stella; Tara uses a new builder.

- [ ] **Step 6.3:** Add a new builder specifically for Tara in `src/lib/ai-personas.ts`:

```ts
import { buildProductSpecialistPrompt } from "./ai-knowledge";

/**
 * Tara's system prompt is compliance rules + cached knowledge blob +
 * voice wrapper. The voice wrapper is tiny + persona-specific so it
 * stays uncached. The knowledge blob is cached via the TextBlockParam's
 * cache_control set inside buildProductSpecialistPrompt.
 */
export async function buildTaraSystemBlocks(): Promise<Anthropic.Messages.TextBlockParam[]> {
  const knowledge = await buildProductSpecialistPrompt();
  return [
    knowledge,
    {
      type: "text",
      text: PERSONAS.tara.voiceWrapperMarkdown,
    },
  ];
}
```

- [ ] **Step 6.4:** Verify build + commit

```bash
./node_modules/.bin/next build 2>&1 | grep -E "Compiled|Error" | head -5
git add src/lib/ai-personas.ts public/ai-avatars/tara.svg
git commit -m "feat(ai): Tara persona record + avatar + system-blocks builder

Adds the product-specialist persona to the PERSONAS registry. Her
system prompt is built differently from the generalists: compliance
rules + cached knowledge blob (from buildProductSpecialistPrompt) +
the tiny uncached voice wrapper.

Avatar is book-and-spectacles in slate blue (#5e7eb8), visually
distinct from Finn's gold and Stella's rose silhouettes."
```

## Task 7 (2a): Route specialist turns through the right builder

- [ ] **Step 7.1:** Extend `src/lib/ai.ts::generateResponse()` to branch on persona role. Find the existing `systemBlocks` assembly:

```ts
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

Replace with role-aware assembly:

```ts
import { PERSONAS, buildTaraSystemBlocks } from "./ai-personas";

// ... inside generateResponse ...
const persona = PERSONAS[resolvedPersona as keyof typeof PERSONAS];
let systemBlocks: Anthropic.Messages.TextBlockParam[];
if (persona?.role === "product_specialist") {
  // Tara: her own compliance + knowledge prompt; portal KNOWLEDGE_BASE
  // is NOT needed since everything she needs is in her own corpus.
  const taraBlocks = await buildTaraSystemBlocks();
  systemBlocks = [
    ...taraBlocks,
    { type: "text", text: userContext },
  ];
} else {
  // Finn / Stella: portal KNOWLEDGE_BASE + voice wrapper + user context
  systemBlocks = [
    { type: "text", text: KNOWLEDGE_BASE, cache_control: { type: "ephemeral" } },
    buildPersonaVoiceBlock(resolvedPersona as "finn" | "stella"),
    { type: "text", text: userContext },
  ];
}
```

- [ ] **Step 7.2:** Update `resolvePersonaId` usage — it now returns `"finn" | "stella" | "tara"` so the cast in the mock branch needs to handle tara:

Find the mock branch:

```ts
if (!client) {
  const lastUserMsg = history.filter((m) => m.role === "user").pop();
  const mockReply = `[Mock Response from ${resolvedPersona === "stella" ? "Stella" : "Finn"} — ...]`;
```

Replace with:

```ts
if (!client) {
  const lastUserMsg = history.filter((m) => m.role === "user").pop();
  const displayName = PERSONAS[resolvedPersona as keyof typeof PERSONAS]?.displayName ?? "Finn";
  const mockReply = `[Mock Response from ${displayName} — ANTHROPIC_API_KEY not set in environment]

I received your question: "${lastUserMsg?.content.slice(0, 200) || ""}"
```

- [ ] **Step 7.3:** Verify build + commit

```bash
./node_modules/.bin/next build 2>&1 | grep -E "Compiled|Error" | head -5
git add src/lib/ai.ts
git commit -m "feat(ai): route specialist turns to role-specific system prompt

generateResponse now branches on the persona's role:
- generalists (Finn, Stella): existing KNOWLEDGE_BASE + voice wrapper
- product_specialist (Tara): compliance rules + knowledge blob + voice
  wrapper (no portal KNOWLEDGE_BASE — Tara's corpus is self-contained)

Mock-mode response prefix correctly names the routed persona even
without a live API key."
```

## Task 8 (2a): `hand_off` tool on Finn/Stella + dispatch

- [ ] **Step 8.1:** Define the tool in `src/lib/ai-personas.ts`:

```ts
// Append near the bottom of the file
export const HAND_OFF_TOOL: Anthropic.Messages.Tool = {
  name: "hand_off",
  description:
    "Transfer the conversation to a specialist when the user's question requires deep product knowledge. Only call when you cannot answer confidently from the portal knowledge base. Do NOT use for questions about the user's own deals, commissions, or portal how-to — answer those yourself.",
  input_schema: {
    type: "object" as const,
    properties: {
      to: {
        type: "string" as const,
        enum: ["tara"], // phase 3 extends to ollie
        description: "Which specialist to hand off to.",
      },
      reason: {
        type: "string" as const,
        description:
          "One-line summary of why the specialist is needed (e.g. \"partner asked about pitch script compliance\").",
      },
      summary: {
        type: "string" as const,
        description:
          "2-3 sentence recap of the conversation so far. The specialist sees this as the opening context so the user does not have to re-explain.",
      },
    },
    required: ["to", "reason", "summary"],
  },
};
```

- [ ] **Step 8.2:** Attach the tool to generalist requests. In `src/lib/ai.ts::generateResponse`, extend the `messages.create` call:

```ts
// Only generalists get the hand_off tool (specialists don't hand off to each other in Phase 2)
const tools: Anthropic.Messages.Tool[] | undefined =
  persona?.role === "generalist" ? [HAND_OFF_TOOL] : undefined;

const response = await client.messages.create({
  model: ANTHROPIC_MODEL,
  max_tokens: MAX_OUTPUT_TOKENS,
  system: systemBlocks,
  messages,
  ...(tools ? { tools } : {}),
});
```

- [ ] **Step 8.3:** Detect tool-use response in `src/app/api/ai/chat/route.ts`. After the first `generateResponse` call, inspect the result for a `hand_off` tool call and re-invoke with the specialist:

Update the shape of `GenerateResult` in `src/lib/ai.ts` to carry the tool use:

```ts
export interface GenerateResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  mocked: boolean;
  // Phase 2: set when the assistant called a tool. Controller may choose
  // to re-invoke with a different persona + the tool's summary prepended.
  handOff?: {
    to: "tara";
    reason: string;
    summary: string;
  };
}
```

Extend `generateResponse` to detect and return the tool use:

```ts
// Replace existing:
//   const textBlock = response.content.find((b) => b.type === "text");
//   const content = textBlock?.text ?? "...";
// with:

const toolUseBlock = response.content.find(
  (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
);
let handOff: GenerateResult["handOff"];
if (toolUseBlock && toolUseBlock.name === "hand_off") {
  const input = toolUseBlock.input as { to: string; reason: string; summary: string };
  if (input.to === "tara") {
    handOff = {
      to: "tara",
      reason: input.reason ?? "",
      summary: input.summary ?? "",
    };
  }
}

const textBlock = response.content.find(
  (b): b is Anthropic.Messages.TextBlock => b.type === "text"
);
const content =
  textBlock?.text ??
  (handOff ? `[handing you off to ${handOff.to}]` : "I don't have a response right now — please try again.");

return {
  content,
  inputTokens: response.usage.input_tokens || 0,
  outputTokens: response.usage.output_tokens || 0,
  cacheReadTokens: (response.usage as any).cache_read_input_tokens || 0,
  cacheCreationTokens: (response.usage as any).cache_creation_input_tokens || 0,
  mocked: false,
  handOff,
};
```

- [ ] **Step 8.4:** In the chat API route, detect `handOff` and re-invoke with Tara:

After the existing `const result = await generateResponse(userContext, history, personaId);`:

```ts
let finalResult = result;
let finalPersonaId: "finn" | "stella" | "tara" = personaId;
let handoffMeta: any = null;

if (result.handOff) {
  finalPersonaId = result.handOff.to;
  handoffMeta = {
    from: personaId,
    to: result.handOff.to,
    reason: result.handOff.reason,
    summary: result.handOff.summary,
    triggeredBy: "llm_tool",
  };

  // Prepend the summary as a user-turn so the specialist has context
  const specialistHistory: ChatMessage[] = [
    ...history,
    {
      role: "user",
      content: `[context from ${personaId}]: ${result.handOff.summary}`,
    },
  ];
  finalResult = await generateResponse(userContext, specialistHistory, finalPersonaId);
}
```

Then persist the assistant message with `finalResult.content`, `finalPersonaId` as `speakerPersona`, and `handoffMeta` as `handoffMetadata`:

```ts
const assistantMessage = await prisma.aiMessage.create({
  data: {
    conversationId: conversation.id,
    role: "assistant",
    content: finalResult.content,
    inputTokens: (result.inputTokens ?? 0) + (finalResult === result ? 0 : finalResult.inputTokens ?? 0),
    outputTokens: (result.outputTokens ?? 0) + (finalResult === result ? 0 : finalResult.outputTokens ?? 0),
    cachedTokens: finalResult.cacheReadTokens,
    cacheReadTokens: (result.cacheReadTokens ?? 0) + (finalResult === result ? 0 : finalResult.cacheReadTokens ?? 0),
    cacheCreationTokens: (result.cacheCreationTokens ?? 0) + (finalResult === result ? 0 : finalResult.cacheCreationTokens ?? 0),
    speakerPersona: finalPersonaId,
    handoffMetadata: handoffMeta ?? undefined,
  },
});
```

Return the handoff metadata in the response payload so the UI can render the transition banner:

```ts
return NextResponse.json({
  conversationId: conversation.id,
  userMessage: { /* unchanged */ },
  assistantMessage: {
    id: assistantMessage.id,
    role: "assistant",
    content: assistantMessage.content,
    createdAt: assistantMessage.createdAt,
    speakerPersona: assistantMessage.speakerPersona,
    handoffMetadata: assistantMessage.handoffMetadata,
  },
  mocked: finalResult.mocked,
  persona: finalPersonaId,
});
```

- [ ] **Step 8.5:** Verify build

```bash
./node_modules/.bin/next build 2>&1 | grep -E "Compiled|Error" | head -5
```

- [ ] **Step 8.6:** Commit

```bash
git add src/lib/ai-personas.ts src/lib/ai.ts src/app/api/ai/chat/route.ts
git commit -m "feat(ai): hand_off tool on Finn/Stella + Tara dispatch

Generalists now carry a hand_off tool. When they decide a question
needs Tara's depth, they emit a tool_use block with to/reason/summary.
The chat route detects this, re-invokes generateResponse with Tara as
the persona + the summary prepended as context, and persists the
handoff metadata on the assistant message so the UI can render a
transition banner."
```

## Task 9 (2a): Bump knowledge version on training + FAQ saves

- [ ] **Step 9.1:** Identify the mutation routes. Likely candidates:

```bash
ls src/app/api/admin/training/
ls src/app/api/admin/training/modules/
ls src/app/api/admin/training/faq/
```

Expected structure (from the codebase scan):
- `src/app/api/admin/training/modules/route.ts` (POST + list)
- `src/app/api/admin/training/modules/[id]/route.ts` (PATCH + DELETE)
- `src/app/api/admin/training/faq/route.ts` (POST + list)
- `src/app/api/admin/training/faq/[id]/route.ts` (PATCH + DELETE)

- [ ] **Step 9.2:** For each of the 4 route files, add at the top:

```ts
import { bumpKnowledgeVersion } from "@/lib/ai-knowledge-version";
```

And after every successful mutation (POST body after `await prisma.trainingModule.create(...)`, PATCH body after the update, DELETE body after the delete), add:

```ts
// Invalidate Tara's cached system prompt so the next request rebuilds it.
await bumpKnowledgeVersion().catch((e) => {
  console.error("[ai-knowledge] bumpKnowledgeVersion failed", e);
});
```

Placement rule: inside the success path, after the DB write, before the `NextResponse.json` return. Wrap in `.catch` so a version-bump failure never fails the mutation itself.

- [ ] **Step 9.3:** Verify build + commit

```bash
./node_modules/.bin/next build 2>&1 | grep -E "Compiled|Error" | head -5
git add src/app/api/admin/training/
git commit -m "feat(ai): bump knowledge version on training + FAQ mutations

TrainingModule and FAQ POST/PATCH/DELETE routes now call
bumpKnowledgeVersion() after every successful write, so Tara's cached
system prompt regenerates on next request. Failures are logged but
never fail the mutation itself."
```

## Task 10 (2a): "Talk to Tara" button + transition banner

- [ ] **Step 10.1:** In `src/app/(partner)/dashboard/ai-assistant/page.tsx`:

Extend the Message interface with handoff metadata (already set in Phase 1 schema):

```ts
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
    triggeredBy?: string;
  } | null;
}
```

- [ ] **Step 10.2:** Add a "Talk to Tara" pin in the header button row, next to the existing "Switch" link:

```tsx
<button
  onClick={() => setPinnedSpecialist("tara")}
  className="font-body text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] hover:text-[#5e7eb8] underline-offset-2 hover:underline"
>
  Talk to Tara
</button>
```

And add `pinnedSpecialist` state + server-side routing (controller passes it through in the chat POST):

```ts
const [pinnedSpecialist, setPinnedSpecialist] = useState<"tara" | null>(null);

// In sendMessage, include in body:
body: JSON.stringify({
  conversationId: activeId,
  message: trimmed,
  pinnedSpecialist: pinnedSpecialist ?? undefined,
}),
```

Server side in `src/app/api/ai/chat/route.ts` accepts `pinnedSpecialist` and overrides `personaId` when set:

```ts
const { conversationId, message, pinnedSpecialist } = body as {
  conversationId?: string;
  message?: string;
  pinnedSpecialist?: "tara";
};

// ... after resolving partner persona ...
let effectivePersonaId: "finn" | "stella" | "tara" = personaId;
if (pinnedSpecialist === "tara") {
  effectivePersonaId = "tara";
}
// Use effectivePersonaId everywhere below instead of personaId
```

- [ ] **Step 10.3:** Render the transition banner before each handoff message in `MessageBubble`:

```tsx
// Where MessageBubble is called in the map:
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
        <div className="flex items-center gap-2 my-3 px-3 py-2 rounded-lg bg-[var(--app-input-bg)] border border-[var(--app-border)]">
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
```

- [ ] **Step 10.4:** When pinned to Tara, show a "Back to [Stella]" link in the header that clears the pin:

```tsx
{pinnedSpecialist === "tara" && (
  <button
    onClick={() => setPinnedSpecialist(null)}
    className="font-body text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] hover:text-[var(--app-text)] underline-offset-2 hover:underline"
  >
    ← Back to {preferredGeneralist === "stella" ? "Stella" : "Finn"}
  </button>
)}
```

- [ ] **Step 10.5:** Verify build + commit

```bash
./node_modules/.bin/next build 2>&1 | grep -E "Compiled|Error" | head -5
git add src/app/\(partner\)/dashboard/ai-assistant/page.tsx src/app/api/ai/chat/route.ts
git commit -m "feat(ai): Talk to Tara button + transition banner

Partner can force-pin Tara for the rest of the conversation via a
\"Talk to Tara\" button in the chat header. Pin clears via \"← Back to
Finn/Stella\". Transition banners render before any assistant turn
whose speakerPersona differs from the previous assistant turn, so the
partner sees when Tara steps in via LLM-orchestrated handoff."
```

## Task 11 (2a): Refresh session-state + final build + open PR

- [ ] **Step 11.1:** Append to `.claude/session-state.md` (use Edit with targeted replacements — the file has an immutable `## Previous sessions preserved below` archival section):

Update the top paragraph to mention Phase 2a. Update "## 🌿 Git state" with the new branch + main state. Append to "## ✅ This session" a section summarizing the Phase 2a commits.

- [ ] **Step 11.2:** Final build

```bash
./node_modules/.bin/next build 2>&1 | grep -E "Compiled|Error" | head -5
```

- [ ] **Step 11.3:** Push + open PR

```bash
git push -u origin claude/partneros-phase-2a-tara-mvp
gh pr create --base main --title "feat(ai): PartnerOS Phase 2a — Tara product specialist (MVP)" --body "$(cat <<'EOF'
## Summary

Phase 2a of the PartnerOS AI roadmap. Adds **Tara** — the tariff refund product SME — as the first specialist persona. Finn and Stella gain a `hand_off` tool they call when a question needs product depth.

**Scope:** Tara's knowledge is assembled from all published `TrainingModule.content` and `FAQ` rows today. PDFs (Chunk 2b) and audio/video transcripts (Chunk 2c) are separate follow-up PRs so this one stays shippable without waiting for the full ingestion pipeline.

### What ships

- New `AiKnowledgeVersion` singleton model — cache-invalidation driver.
- `src/lib/ai-compliance.ts` — hardcoded `NEVER_SAY_RULES` safety floor.
- `src/lib/ai-knowledge.ts` — `buildProductSpecialistPrompt()` that assembles compliance + modules + FAQs into one cached block.
- `src/lib/ai-knowledge-version.ts` — `bumpKnowledgeVersion()` helper called from every training/FAQ mutation route.
- Tara persona record + slate-blue book avatar in the registry.
- `hand_off` tool on Finn and Stella's system prompts.
- Chat route detects the tool call and re-invokes with Tara + the summary prepended.
- UI: "Talk to Tara" button + "← Back to Finn/Stella" + transition banner when speaker changes mid-conversation.

### What does NOT change yet

- PDF text extraction (Chunk 2b)
- Audio/video/weekly-call transcription via Whisper (Chunk 2c)
- Admin Glossary tab + partner-side Glossary tooltips (Chunk 2b/2d)

## Test plan

- [ ] Ask Finn "how do I pitch this to a prospect in compliance-safe language?" — expect hand_off to Tara; transition banner renders
- [ ] Ask Finn "what's my pipeline total?" — expect Finn answers directly (no handoff)
- [ ] Click "Talk to Tara" button — subsequent messages speak as Tara until "← Back" clicked
- [ ] Admin creates a new TrainingModule → next AI turn uses the updated knowledge (verify via `AiKnowledgeVersion` version bump + mock-mode cache behavior)
- [ ] Tara refuses to quote a specific refund dollar figure when asked a pre-qualification question

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Chunk 2b — PDF extraction + Glossary

*(Written as a plan-within-a-plan so it can be executed when 2a has merged. The schema + pipeline specs below are authoritative — use them directly rather than re-brainstorming.)*

## Chunk 2b file structure

| Path | Action | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | Modify | Add `TrainingResource.extractedText` + `extractedAt`; add `TrainingGlossary` model |
| `package.json` | Modify | Add `pdf-parse` dependency |
| `src/lib/pdf-extraction.ts` | Create | Helper that extracts text from a PDF buffer |
| `src/app/api/admin/training/resources/route.ts` | Modify | On POST: if `fileType === "pdf"`, extract text + store `extractedText`; bump knowledge version |
| `src/app/api/admin/training/resources/[id]/route.ts` | Modify | PATCH: re-extract if fileUrl changes; bump |
| `src/app/api/admin/dev/re-extract-pdfs/route.ts` | Create | Admin button — iterates all PDF resources + re-extracts |
| `src/app/(admin)/admin/dev/...` | Modify | Add "Re-extract PDFs" button to existing Dev panel |
| `src/app/api/admin/training/glossary/route.ts` | Create | GET list / POST create |
| `src/app/api/admin/training/glossary/[id]/route.ts` | Create | GET / PATCH / DELETE |
| `src/app/(admin)/admin/training/...` | Modify | Add Glossary tab to admin training page |
| `src/app/(partner)/dashboard/training/...` | Modify | Add Glossary tab to partner training page |
| `src/lib/ai-knowledge.ts` | Modify | Include `TrainingResource.extractedText` + `TrainingGlossary.definition` in prompt assembly |

## Chunk 2b task summary

1. Schema: `TrainingResource.extractedText` / `extractedAt` + `TrainingGlossary` (id / term / aliases / definition / category / sortOrder / published / timestamps)
2. `pdf-parse` dependency (`npm install pdf-parse`) + lightweight wrapper in `src/lib/pdf-extraction.ts`
3. Hook into training resources POST/PATCH to extract on upload
4. Admin `re-extract-pdfs` backfill endpoint + button
5. Glossary admin CRUD routes + tab
6. Partner-side Glossary tab on `/dashboard/training`
7. Extend `buildProductSpecialistPrompt()` to include PDFs + glossary
8. Verify token budget — if close to 150k, add `includeInAI: Boolean` opt-out on each model
9. PR + review

---

# Chunks 2c + 2d (plans defer to execution time)

**2c — Whisper transcription pipeline.** Schema: `TrainingModule.videoTranscript`, `TrainingResource.audioTranscript`, `ConferenceSchedule.transcript`, plus `AiTranscriptionJob` queue table. New env `OPENAI_API_KEY` (demo-gated). Vercel Cron worker processes pending jobs. Enqueue hooks on module/resource/conference saves. One-time backfill button. Each transcription completion bumps `AiKnowledgeVersion`.

**2d — Polish.** Per-item `includeInAI: Boolean` opt-out if we hit the token ceiling. Glossary tooltips across the partner portal via a thin `<GlossaryTerm>` wrapper that reads from a client-cached glossary fetch. Token-usage dashboard tile in `/admin/dev`.

These chunks will get dedicated plans written against real usage data after 2a + 2b ship.

---

## Self-Review

**Spec coverage (2a):**
- Spec §3.3 (Tara character) — ✓ Task 6 (persona record + voice wrapper)
- Spec §4.4 (compliance floor) — ✓ Task 3
- Spec §4.5 (cached-prompt assembly) — ✓ Task 5
- Spec §4.6 (cache invalidation triggers) — ✓ Tasks 4 + 9
- Spec §8.2 (schema additions) — partial: `AiKnowledgeVersion` in Task 2; `TrainingResource.extractedText`, transcription columns, `TrainingGlossary`, `AiTranscriptionJob` deferred to 2b/2c per chunking
- Spec §9.2 PR 2.9 (hand_off tool + routing) — ✓ Task 8
- Spec §9.2 PR 2.10 (UI — Talk to Tara, transition banner) — ✓ Task 10

**Placeholder scan:**
- Each code block has full content ready to paste
- File paths are absolute within the repo
- No TBDs or TODOs remain

**Type consistency:**
- `PersonaId` union stays `"finn" | "stella" | "tara" | "ollie"` (defined in Phase 1, Ollie unused until Phase 3)
- `PERSONAS` record expands from `Record<"finn" | "stella", Persona>` to `Record<"finn" | "stella" | "tara", Persona>`
- `resolvePersonaId` return type expands to match
- `buildTaraSystemBlocks()` signature is `Promise<Anthropic.Messages.TextBlockParam[]>`, matches the shape consumed by `generateResponse`
- `GenerateResult.handOff` is `{ to: "tara"; reason: string; summary: string } | undefined`; Phase 3 will expand `to` to include `"ollie"`
