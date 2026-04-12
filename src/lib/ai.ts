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

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const DAILY_BUDGET_USD = parseFloat(process.env.AI_DAILY_BUDGET_USD || "5");
const DAILY_MESSAGE_LIMIT = parseInt(process.env.AI_DAILY_MESSAGE_LIMIT || "50", 10);
const MAX_OUTPUT_TOKENS = 1024;

// Rough Sonnet 4.6 pricing (USD per token). Update if Anthropic changes prices.
// Input: $3/MTok, Output: $15/MTok, Cached read: $0.30/MTok, Cache write: $3.75/MTok
const PRICE_INPUT = 3 / 1_000_000;
const PRICE_OUTPUT = 15 / 1_000_000;
const PRICE_CACHE_READ = 0.3 / 1_000_000;

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
  cachedTokens: number
) {
  const today = new Date().toISOString().slice(0, 10);
  const cost =
    inputTokens * PRICE_INPUT +
    outputTokens * PRICE_OUTPUT +
    cachedTokens * PRICE_CACHE_READ;

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
  cachedTokens: number;
  mocked: boolean;
}

export async function generateResponse(
  userContext: string,
  history: ChatMessage[]
): Promise<GenerateResult> {
  const client = getClient();

  // ── MOCK FALLBACK (no API key) ──
  if (!client) {
    const lastUserMsg = history.filter((m) => m.role === "user").pop();
    const mockReply = `[Mock Response — ANTHROPIC_API_KEY not set in environment]

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
      cachedTokens: 0,
      mocked: true,
    };
  }

  // ── REAL ANTHROPIC CALL ──
  // System prompt = knowledge base (cached) + per-user context (not cached)
  // Prompt caching on the knowledge base gives ~90% discount on repeat queries.
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

  // Convert history to Anthropic message format
  const messages: Anthropic.Messages.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemBlocks,
      messages,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const content =
      textBlock && textBlock.type === "text"
        ? textBlock.text
        : "I don't have a response right now — please try again.";

    return {
      content,
      inputTokens: response.usage.input_tokens || 0,
      outputTokens: response.usage.output_tokens || 0,
      cachedTokens:
        (response.usage as any).cache_read_input_tokens ||
        (response.usage as any).cache_creation_input_tokens ||
        0,
      mocked: false,
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
