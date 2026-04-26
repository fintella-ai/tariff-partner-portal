/**
 * Fintella PartnerOS — AI Assistant core library
 *
 * Handles Anthropic client initialization, system prompt construction with
 * prompt caching, partner data context injection, rate limiting, daily
 * budget enforcement, and graceful mock fallback when no API key is set.
 */

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { FIRM_NAME, FIRM_SHORT, STAGE_LABELS } from "@/lib/constants";
import {
  buildPersonaVoiceBlock,
  buildTaraSystemBlocks,
  HAND_OFF_TOOL,
  PERSONAS,
  resolvePersonaId,
  type PersonaId,
} from "./ai-personas";
import {
  OLLIE_TOOLS,
  SHARED_TOOLS,
  executeOllieTool,
  type ToolCallResult,
} from "./ai-ollie-tools";

// Max sequential tool-call rounds inside a single generateResponse invocation.
// Ollie rarely needs more than 2 lookups in one turn; a hard ceiling protects
// against runaway loops + cost blowouts.
const MAX_TOOL_ROUNDS = 4;

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const DAILY_BUDGET_USD = parseFloat(process.env.AI_DAILY_BUDGET_USD || "5");
const DAILY_MESSAGE_LIMIT = parseInt(process.env.AI_DAILY_MESSAGE_LIMIT || "50", 10);
const MAX_OUTPUT_TOKENS = 1024;

// Rough Sonnet 4.6 pricing (USD per token). Update if Anthropic changes prices.
// Input: $3/MTok, Output: $15/MTok, Cached read: $0.30/MTok, Cache write: $3.75/MTok.
// Cache WRITE (ephemeral block creation) is ~12x more expensive than cache READ
// (hit), and the Anthropic API returns them as two separate token counts —
// cache_read_input_tokens vs cache_creation_input_tokens. They must be priced
// separately, otherwise we silently undercount real spend on first-hit calls.
const PRICE_INPUT = 3 / 1_000_000;
const PRICE_OUTPUT = 15 / 1_000_000;
const PRICE_CACHE_READ = 0.3 / 1_000_000;
const PRICE_CACHE_WRITE = 3.75 / 1_000_000;

export const AI_CONFIG = {
  model: ANTHROPIC_MODEL,
  dailyBudgetUsd: DAILY_BUDGET_USD,
  dailyMessageLimit: DAILY_MESSAGE_LIMIT,
  enabled: !!ANTHROPIC_API_KEY,
};

// ─── CLIENT ─────────────────────────────────────────────────────────────────
let _client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  return _client;
}

// ─── STATIC KNOWLEDGE BASE (CACHED IN SYSTEM PROMPT) ───────────────────────
// This text is prepended to every request and cached server-side by Anthropic,
// so the effective cost is ~90% discounted on repeat queries.
const KNOWLEDGE_BASE = `
# Fintella Partner Portal Knowledge Base

## About ${FIRM_NAME} (${FIRM_SHORT})
Fintella is a partner network that helps U.S. importers recover overpaid
tariffs through legal action. Partners refer importer clients to Fintella's
affiliated law firm (Frost Law). When a refund case closes successfully, the
firm collects a fee and Fintella pays commissions to the partner(s) who
sourced the client.

## Commission Structure (Waterfall Model)
Total partner commission is capped at **25% of the firm fee** on every deal.
This 25% is split across up to three partner tiers:

- **L1 partners** earn 25% on direct deals they personally refer.
- **L2 partners** (recruited by an L1) earn a rate chosen by their L1 when
  recruiting: 10%, 15%, or 20%. The L1 keeps the remainder as an "override"
  (e.g., if L2 is 15%, L1 override on L2 deals is 10%).
- **L3 partners** (recruited by an L2, if enabled) earn 10% or 15%. L2 keeps
  the difference vs. their own rate; L1 always keeps 25% minus L2 rate.

The total across all three tiers always equals 25% of the firm fee — never
more, never less. This is called the "waterfall model."

## Deal Pipeline Stages
1. **New Lead** — client just submitted
2. **No Consultation Booked** — reached out but consultation not scheduled
3. **Consultation Booked** — initial call scheduled with firm
4. **Client No Show** — client missed consultation
5. **Client Engaged** — client signed retainer
6. **In Process** — case actively being worked
7. **Closed Won** — refund recovered, commissions payable
8. **Closed Lost** — case dismissed or client withdrew

Commissions only pay out on **Closed Won** deals after the firm receives
the refund and clears its fee.

## Partnership Agreements
Partners sign a legally binding agreement before accessing referral tools.
- L1 partners sign via SignWell e-signature (automatic)
- L2/L3 partners sign a paper agreement uploaded by their recruiting L1
- Admin reviews L1-uploaded agreements before activating L2/L3 partners
- Submit Client and Referral Links pages are locked until agreement is
  signed/approved
- Changing name or company on account settings invalidates an existing
  signed agreement (requires re-signing)

## Referral Flow
Partners have two kinds of referral URLs:
1. **Client referral**: \`https://referral.frostlawaz.com/l/ANNEXATIONPR/?utm_content={partnerCode}\`
   — send to importers so they can submit their case. Partner attribution
   happens via the utm_content param.
2. **Recruitment link**: partners generate these in the "Referral Links"
   page. Each link has a pre-set L2 or L3 commission rate. Recruits use
   the link to sign up at \`fintella.partners/signup?token=XXX\`.

## Payouts
Commissions accumulate in the Commission Ledger on Closed Won deals.
Admin creates Payout Batches to pay groups of partners at once. Partners
can see their pending/paid commissions on the Commissions page. Payout
methods include ACH, wire, and check — partners configure this in Account
Settings > Payout Information.

## Support Options
- **Live chat**: if enabled, talk to a human support rep in real time
- **Support tickets**: create a ticket from the Support page for async help
- **Training**: self-serve videos and docs in the Training section
- **Weekly call**: live Q&A with the Fintella team in the Conference section
- **This AI Assistant (PartnerOS)**: ask me anything about how the portal
  works, your deals, your commissions, or how to get things done

## What I Can and Cannot Help With
**I CAN**:
- Explain how commissions work, agreement flow, deal stages
- Answer questions about the user's own deals, commissions, and downline
- Walk partners through how to submit clients, generate referral links,
  invite downline
- Explain portal features and troubleshoot common issues
- Point users to the right page or support channel

**I CANNOT** (and should escalate to human support):
- Give legal or tax advice about tariff recovery cases
- Promise specific commission amounts or payout timelines
- Make commitments about case outcomes
- Access or modify another partner's data
- Approve payouts, sign documents, or take actions that require
  human judgment
- Answer questions about specific refund amounts or case strategy
  — those belong to Frost Law attorneys

If a user asks about anything in the "CANNOT" list, politely acknowledge
their question and offer to create a support ticket or connect them with
a human rep.

## Tone and Style
- Professional but warm — the Fintella voice is confident, helpful, direct
- Keep answers concise (3-5 sentences for simple questions)
- Use bullet points or numbered steps for procedural answers
- Never use emojis unless the user uses them first
- Never make up information — if you don't know something, say so and
  offer to create a support ticket
- Always use the user's actual partner code and data when relevant
  (it's provided in the dynamic context below each query)

## Portal Page Links

When you reference a portal page, ALWAYS use a markdown link so the partner can click to navigate there. Use these exact paths:

| Page | Link |
|------|------|
| Home | [Home](/dashboard/home) |
| Overview | [Overview](/dashboard/overview) |
| Submit Client | [Submit Client](/dashboard/submit-client) |
| My Deals | [My Deals](/dashboard/deals) |
| Commissions | [Commissions](/dashboard/commissions) |
| Downline | [Downline](/dashboard/downline) |
| Referral Links | [Referral Links](/dashboard/referral-links) |
| Training | [Training](/dashboard/training) |
| Support | [Support](/dashboard/support) |
| AI Assistant | [AI Assistant](/dashboard/ai-assistant) |
| Getting Started | [Getting Started](/dashboard/getting-started) |
| Conference Calls | [Conference](/dashboard/conference) |
| Notifications | [Notifications](/dashboard/notifications) |
| Feature Requests | [Feature Requests](/dashboard/feature-request) |
| Full Reporting | [Full Reporting](/dashboard/reporting) |

Example: "You can check your earnings on the [Commissions](/dashboard/commissions) page."
Never use bare page names — always wrap in a markdown link.
`.trim();

// ─── PARTNER CONTEXT BUILDER ───────────────────────────────────────────────
export async function buildUserContext(
  userId: string,
  userType: "partner" | "admin"
): Promise<string> {
  if (userType === "admin") {
    return `## Current User\nYou are assisting an admin user (${userId}). They have elevated access to the portal and can view all partners and deals.`;
  }

  try {
    const partner = await prisma.partner.findUnique({
      where: { partnerCode: userId },
    });

    if (!partner) {
      return `## Current User\nYou are assisting a partner with code ${userId}. No additional profile data available.`;
    }

    const [deals, commissionLedger, downlineCount, agreement] = await Promise.all([
      prisma.deal.findMany({
        where: { partnerCode: userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          dealName: true,
          stage: true,
          estimatedRefundAmount: true,
          createdAt: true,
        },
      }),
      prisma.commissionLedger.findMany({
        where: { partnerCode: userId },
        select: { amount: true, status: true },
      }),
      prisma.partner.count({
        where: { referredByPartnerCode: userId },
      }),
      prisma.partnershipAgreement.findFirst({
        where: { partnerCode: userId },
        orderBy: { updatedAt: "desc" },
        select: { status: true },
      }),
    ]);

    const totalPending = commissionLedger
      .filter((c) => c.status === "pending" || c.status === "due")
      .reduce((sum, c) => sum + c.amount, 0);
    const totalPaid = commissionLedger
      .filter((c) => c.status === "paid")
      .reduce((sum, c) => sum + c.amount, 0);

    const dealsSummary =
      deals.length > 0
        ? deals
            .map((d) => {
              const stageLabel = STAGE_LABELS[d.stage]?.label || d.stage;
              const refund = d.estimatedRefundAmount
                ? `$${Math.round(d.estimatedRefundAmount).toLocaleString()}`
                : "unknown";
              return `  - "${d.dealName}" (id: ${d.id.substring(0, 8)}) — stage: ${stageLabel}, est. refund: ${refund}`;
            })
            .join("\n")
        : "  (none yet)";

    const tierDisplay = (partner.tier || "l1").toUpperCase();

    return `
## Current User (live data)
- **Name**: ${partner.firstName || ""} ${partner.lastName || ""}
- **Partner Code**: ${partner.partnerCode}
- **Email**: ${partner.email}
- **Tier**: ${tierDisplay}
- **Commission Rate**: ${Math.round((partner.commissionRate || 0.25) * 100)}%
- **Status**: ${partner.status}
- **Company**: ${partner.companyName || "not set"}
- **Agreement**: ${agreement?.status || "not_sent"}
- **Direct downline count**: ${downlineCount}

### Commission Totals
- **Pending**: $${Math.round(totalPending).toLocaleString()}
- **Paid (lifetime)**: $${Math.round(totalPaid).toLocaleString()}

### Recent Deals (last 10)
${dealsSummary}

Use this data to give personalized answers. Reference specific deals by
name when relevant. If the user asks about a deal not in this list, tell
them you only have their 10 most recent deals and offer to help find
older ones via the Deals page.
`.trim();
  } catch (err) {
    console.error("[ai] buildUserContext error:", err);
    return `## Current User\nYou are assisting partner ${userId}. (Could not load full profile data.)`;
  }
}

// ─── RATE LIMIT + BUDGET ────────────────────────────────────────────────────
export async function checkRateLimit(
  userId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const usage = await prisma.aiUsageDay.findUnique({
    where: { userId_date: { userId, date: today } },
  });

  if (!usage) return { allowed: true };

  if (usage.messageCount >= DAILY_MESSAGE_LIMIT) {
    return {
      allowed: false,
      reason: `Daily message limit reached (${DAILY_MESSAGE_LIMIT} messages/day). Please try again tomorrow, or use live chat / support tickets for urgent questions.`,
    };
  }

  if (usage.totalCostUsd >= DAILY_BUDGET_USD) {
    return {
      allowed: false,
      reason: `AI Assistant is at daily capacity. Please use live chat or support tickets for urgent questions. We'll be back online tomorrow.`,
    };
  }

  return { allowed: true };
}

export async function recordUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number
) {
  const today = new Date().toISOString().slice(0, 10);
  // Cost is the sum of four distinct token types. Cache reads ($0.30/MTok)
  // and cache writes ($3.75/MTok) MUST be accounted separately — combining
  // them understates real spend on any call that creates new cache blocks.
  const cost =
    inputTokens * PRICE_INPUT +
    outputTokens * PRICE_OUTPUT +
    cacheReadTokens * PRICE_CACHE_READ +
    cacheCreationTokens * PRICE_CACHE_WRITE;

  await prisma.aiUsageDay.upsert({
    where: { userId_date: { userId, date: today } },
    create: {
      userId,
      date: today,
      messageCount: 1,
      totalCostUsd: cost,
    },
    update: {
      messageCount: { increment: 1 },
      totalCostUsd: { increment: cost },
    },
  });

  return cost;
}

// ─── GENERATE RESPONSE ──────────────────────────────────────────────────────
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  /** Tokens served from the Anthropic prompt cache (cache hit — cheap). */
  cacheReadTokens: number;
  /** Tokens written to the prompt cache as part of this request (cache miss — expensive). */
  cacheCreationTokens: number;
  mocked: boolean;
  /**
   * Populated when a generalist calls the `hand_off` tool. Controller
   * (`/api/ai/chat/route.ts`) re-invokes generateResponse with the target
   * specialist + the summary prepended to history.
   */
  handOff?: {
    to: "tara" | "ollie";
    reason: string;
    summary: string;
  };
  /**
   * Trace of any DB tool calls Ollie executed while producing this reply.
   * Persisted on AiMessage.toolCalls so the UI can render chips.
   */
  toolCalls?: ToolCallResult[];
}

interface GenerateOpts {
  /** Partner code or admin email — used to scope Ollie's DB tools. */
  userId?: string;
  /** Caller type — Ollie's tools are partner-scoped only for Phase 3b. */
  userType?: "partner" | "admin";
  /** AiConversation.id — write tools (create_support_ticket) link the
   *  AiEscalation audit row back to the source conversation. */
  conversationId?: string;
}

export async function generateResponse(
  userContext: string,
  history: ChatMessage[],
  personaId: PersonaId | null | undefined,
  opts?: GenerateOpts
): Promise<GenerateResult> {
  const client = getClient();
  const resolvedPersona = resolvePersonaId(personaId);
  const persona = PERSONAS[resolvedPersona];

  // ── MOCK FALLBACK (no API key) ──
  if (!client) {
    const lastUserMsg = history.filter((m) => m.role === "user").pop();
    const mockReply = `[Mock Response from ${persona.displayName} — ANTHROPIC_API_KEY not set in environment]

I received your question: "${lastUserMsg?.content.slice(0, 200) || ""}"

In production, I would consult the Fintella knowledge base and your personal portal data to give you a tailored answer. To enable real AI responses, add ANTHROPIC_API_KEY to your Vercel environment variables and redeploy.

In the meantime, you can:
- Browse the Training section for self-serve guides
- Create a support ticket from the Support page
- Join the weekly live call via the Conference page`;

    return {
      content: mockReply,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      mocked: true,
    };
  }

  // ── REAL ANTHROPIC CALL ──
  // System-prompt assembly branches on persona.role:
  // - generalists (Finn, Stella) + support_specialist (Ollie): cached portal
  //   KNOWLEDGE_BASE + uncached voice wrapper + user context. Ollie reuses the
  //   portal KB because her scope is portal-ops / how-to / troubleshooting,
  //   not the refund product specifically.
  // - product_specialist (Tara): cached product-knowledge blob (with its own
  //   cache_control) + uncached voice wrapper + user context.
  let systemBlocks: Anthropic.Messages.TextBlockParam[];
  if (persona.role === "product_specialist") {
    const taraBlocks = await buildTaraSystemBlocks();
    systemBlocks = [...taraBlocks, { type: "text", text: userContext }];
  } else {
    systemBlocks = [
      {
        type: "text",
        text: KNOWLEDGE_BASE,
        cache_control: { type: "ephemeral" },
      },
      buildPersonaVoiceBlock(resolvedPersona as "finn" | "stella" | "ollie"),
      {
        type: "text",
        text: userContext,
      },
    ];
  }

  // Tool surface per persona:
  // - Generalists (Finn, Stella): hand_off + shared tools (lookups, tickets, scheduling).
  // - Product specialist (Tara): shared tools only (no hand_off, no Ollie-exclusive).
  // - Support specialist (Ollie): SHARED_TOOLS + OLLIE_EXCLUSIVE_TOOLS (no hand_off).
  const tools: Anthropic.Messages.Tool[] | undefined =
    persona.role === "generalist"
      ? [HAND_OFF_TOOL, ...SHARED_TOOLS]
      : resolvedPersona === "ollie"
        ? OLLIE_TOOLS
        : persona.role === "product_specialist"
          ? SHARED_TOOLS
          : undefined;

  // Convert history to Anthropic message format
  const messages: Anthropic.Messages.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Rolling token + tool-call trace across the tool-use loop.
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  const toolCallTrace: ToolCallResult[] = [];

  try {
    let response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemBlocks,
      messages,
      ...(tools ? { tools } : {}),
    });

    inputTokens += response.usage.input_tokens || 0;
    outputTokens += response.usage.output_tokens || 0;
    cacheReadTokens += (response.usage as any).cache_read_input_tokens || 0;
    cacheCreationTokens +=
      (response.usage as any).cache_creation_input_tokens || 0;

    // Unified tool-use loop. Any persona with tools (Finn, Stella, Tara, Ollie)
    // may trigger tool calls. hand_off calls break out to the handoff path;
    // all other tool calls are executed and re-invoked in-loop.
    let handOff: GenerateResult["handOff"];
    let round = 0;
    while (response.stop_reason === "tool_use" && round < MAX_TOOL_ROUNDS) {
      round += 1;
      const toolUses = response.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
      );
      if (toolUses.length === 0) break;

      // If any tool_use block is hand_off, break out to the handoff path
      // instead of executing it — hand_off flips control to a different
      // persona rather than continuing this conversation.
      const handOffCall = toolUses.find((tu) => tu.name === "hand_off");
      if (handOffCall) {
        const input = handOffCall.input as {
          to?: string;
          reason?: string;
          summary?: string;
        };
        if (input.to === "tara" || input.to === "ollie") {
          handOff = {
            to: input.to,
            reason: input.reason ?? "",
            summary: input.summary ?? "",
          };
        }
        break; // exit the tool loop — handOff is handled below
      }

      // Execute each tool the model requested and build tool_result blocks.
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const exec = await executeOllieTool(tu.name, tu.input, {
          userId: opts?.userId ?? "",
          userType: opts?.userType ?? "admin",
          conversationId: opts?.conversationId,
        });
        toolCallTrace.push({
          name: tu.name,
          input: tu.input,
          output: exec.output,
          ...(exec.isError ? { isError: true } : {}),
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(exec.output),
          ...(exec.isError ? { is_error: true } : {}),
        });
      }

      // Append assistant turn (tool calls) + user turn (tool results) and
      // re-invoke.
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });

      response = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemBlocks,
        messages,
        ...(tools ? { tools } : {}),
      });
      inputTokens += response.usage.input_tokens || 0;
      outputTokens += response.usage.output_tokens || 0;
      cacheReadTokens +=
        (response.usage as any).cache_read_input_tokens || 0;
      cacheCreationTokens +=
        (response.usage as any).cache_creation_input_tokens || 0;
    }

    const textBlock = response.content.find(
      (b): b is Anthropic.Messages.TextBlock => b.type === "text"
    );
    const content =
      textBlock?.text ??
      (handOff
        ? `(handing you off to ${handOff.to} for that one)`
        : toolCallTrace.length > 0
          ? "(Looked up your data but couldn't compose a reply. Please try rephrasing.)"
          : "I don't have a response right now — please try again.");

    // ── GAP DETECTION (Tara / product_specialist) ──
    // When Tara's response contains phrases indicating she lacks knowledge,
    // log a gap row so admins can identify training content holes.
    if (resolvedPersona === "tara" && opts?.conversationId && opts?.userId) {
      const GAP_INDICATORS = [
        "i don't have that information",
        "i don't have enough information",
        "not covered in my knowledge base",
        "i'm not sure about that",
        "i don't have specific details",
        "beyond what i currently know",
        "i don't have access to that",
        "not in my training materials",
      ];
      const lower = content.toLowerCase();
      const isGap = GAP_INDICATORS.some((indicator) => lower.includes(indicator));
      if (isGap) {
        const lastUserMsg = history.filter((m) => m.role === "user").pop();
        prisma.aiKnowledgeGap
          .create({
            data: {
              conversationId: opts.conversationId,
              messageId: "",
              partnerCode: opts.userId,
              question: lastUserMsg?.content.slice(0, 500) || "Unknown question",
              taraResponse: content.slice(0, 500),
            },
          })
          .catch(() => {}); // fire-and-forget — never block the response
      }
    }

    // ── FAQ CANDIDATE HARVESTING ──
    // Capture good Q&A pairs from ALL personas for admin review.
    // Fire-and-forget — never block the response.
    if (opts?.conversationId && opts?.userId) {
      const lastUserMsgFaq = history.filter((m) => m.role === "user").pop();
      const userText = lastUserMsgFaq?.content?.trim() || "";
      const isQuestion =
        /\?/.test(userText) ||
        /^(how|what|why|when|where|who|can|does|is|do)\b/i.test(userText);
      const isSubstantive = content.length > 100;
      const FAQ_GAP_PHRASES = [
        "i don't have",
        "not covered in my knowledge",
        "i'm not sure about that",
        "beyond what i currently know",
      ];
      const isGapFaq = FAQ_GAP_PHRASES.some((p) =>
        content.toLowerCase().includes(p)
      );

      if (isQuestion && isSubstantive && !isGapFaq && userText.length > 10) {
        // Auto-categorize based on keywords
        let suggestedCategory = "general";
        const lowerFaq =
          userText.toLowerCase() + " " + content.toLowerCase();
        if (/commission|payout|earn|payment|rate/.test(lowerFaq))
          suggestedCategory = "commissions";
        else if (/lead|client|submit|referral|deal/.test(lowerFaq))
          suggestedCategory = "leads";
        else if (
          /tariff|refund|ieepa|301|import|duty|customs/.test(lowerFaq)
        )
          suggestedCategory = "tariff_refunds";
        else if (/bug|error|broken|login|password|portal/.test(lowerFaq))
          suggestedCategory = "technical";

        prisma.aiFaqCandidate
          .create({
            data: {
              conversationId: opts.conversationId,
              partnerCode: opts.userId,
              question: userText.slice(0, 500),
              answer: content.slice(0, 2000),
              suggestedCategory,
            },
          })
          .catch(() => {}); // fire-and-forget
      }
    }

    return {
      content,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      mocked: false,
      ...(handOff ? { handOff } : {}),
      ...(toolCallTrace.length > 0 ? { toolCalls: toolCallTrace } : {}),
    };
  } catch (err: any) {
    console.error("[ai] generateResponse error:", err?.message || err);
    throw new Error(
      err?.status === 401
        ? "AI service authentication failed. Please contact support."
        : err?.status === 429
          ? "AI service is rate-limited. Please try again in a moment."
          : "AI service temporarily unavailable. Please try live chat or create a support ticket."
    );
  }
}

// ─── CONVERSATION TITLE GENERATION ─────────────────────────────────────────
export function deriveConversationTitle(firstUserMessage: string): string {
  const cleaned = firstUserMessage.trim().replace(/\s+/g, " ");
  if (cleaned.length <= 60) return cleaned;
  return cleaned.slice(0, 57) + "...";
}
