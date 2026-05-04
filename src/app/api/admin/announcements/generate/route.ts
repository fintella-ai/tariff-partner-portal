// src/app/api/admin/announcements/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";
import { FIRM_NAME } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/announcements/generate
 *
 * Reads live system data (deals, partners, milestones, deadlines) and uses
 * Claude to draft an announcement for the admin to review, edit, and post.
 *
 * Body:
 *   - type?: "network_update" | "milestone" | "deadline_reminder" | "feature" | "general"
 *   - channelId?: string  — optional, for channel-specific context
 *   - instructions?: string — optional admin instructions to guide the AI
 *
 * Returns:
 *   - draft: string — the generated announcement text
 *   - context: object — summary of the data used
 *   - ai: boolean -- whether AI was used (false = demo-gate fallback)
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const adminEmail = session?.user?.email;
  if (!adminEmail || !isAnyAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const announcementType = body.type || "general";
  const channelId = body.channelId || null;
  const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";

  // ── GATHER SYSTEM DATA ────────────────────────────────────────────────
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    recentDealsCount,
    totalDealsCount,
    closedWonDeals,
    newPartnersCount,
    totalPartnersCount,
    partnersByType,
    totalRecoveries,
    recentMilestones,
    channelInfo,
  ] = await Promise.all([
    // Deals in last 7 days
    prisma.deal.count({
      where: { createdAt: { gte: sevenDaysAgo } },
    }),
    // Total deals
    prisma.deal.count(),
    // Recently closed won deals (last 30 days)
    prisma.deal.findMany({
      where: { stage: "closed_won", updatedAt: { gte: thirtyDaysAgo } },
      select: { dealName: true, estimatedRefundAmount: true, firmFeeAmount: true, updatedAt: true },
      take: 10,
      orderBy: { updatedAt: "desc" },
    }),
    // New partners in last 7 days
    prisma.partner.count({
      where: { signupDate: { gte: sevenDaysAgo } },
    }),
    // Total active partners
    prisma.partner.count({
      where: { status: "active" },
    }),
    // Partners grouped by type
    prisma.partner.groupBy({
      by: ["partnerType"],
      where: { status: "active" },
      _count: true,
    }),
    // Total estimated recoveries (closed_won deals)
    prisma.deal.aggregate({
      where: { stage: "closed_won" },
      _sum: { estimatedRefundAmount: true, firmFeeAmount: true },
      _count: true,
    }),
    // Recent milestones — pending commissions becoming due/paid
    prisma.commissionLedger.aggregate({
      where: { status: "paid" },
      _sum: { amount: true },
      _count: true,
    }),
    // Channel context if provided
    channelId
      ? prisma.announcementChannel.findUnique({
          where: { id: channelId },
          select: { name: true, description: true, _count: { select: { memberships: { where: { removedAt: null } } } } },
        })
      : null,
  ]);

  // Build context summary
  const contextSummary = {
    recentDeals7d: recentDealsCount,
    totalDeals: totalDealsCount,
    closedWonRecent30d: closedWonDeals.length,
    totalRecoveriesAmount: totalRecoveries._sum.estimatedRefundAmount || 0,
    totalFirmFees: totalRecoveries._sum.firmFeeAmount || 0,
    closedWonCount: totalRecoveries._count,
    newPartners7d: newPartnersCount,
    totalActivePartners: totalPartnersCount,
    partnersByType: partnersByType.map((p) => ({ type: p.partnerType, count: p._count })),
    totalCommissionsPaid: recentMilestones._sum.amount || 0,
    totalCommissionEntries: recentMilestones._count,
    channelName: channelInfo?.name || null,
    channelMembers: channelInfo?._count?.memberships || null,
  };

  // ── AI GENERATION ─────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY || "";
  if (!apiKey) {
    // Demo-gate fallback: generate a simple template
    const draft = generateDemoFallback(announcementType, contextSummary);
    return NextResponse.json({ draft, context: contextSummary, ai: false });
  }

  try {
    const client = new Anthropic({ apiKey });
    const draft = await generateWithAI(client, announcementType, contextSummary, instructions, closedWonDeals);
    return NextResponse.json({ draft, context: contextSummary, ai: true });
  } catch (err: any) {
    console.error("[announcements/generate] AI generation failed:", err?.message || err);
    // Fallback to demo generation on error
    const draft = generateDemoFallback(announcementType, contextSummary);
    return NextResponse.json({ draft, context: contextSummary, ai: false, fallback: true });
  }
}

// ── AI GENERATION ──────────────────────────────────────────────────────────

async function generateWithAI(
  client: Anthropic,
  type: string,
  context: Record<string, any>,
  instructions: string,
  recentClosedWon: Array<{ dealName: string; estimatedRefundAmount: number; firmFeeAmount: number; updatedAt: Date }>
): Promise<string> {
  const typeDescriptions: Record<string, string> = {
    network_update: "A partner network growth update highlighting new partners, new deals, or network momentum. Tone: celebratory but professional.",
    milestone: "A milestone celebration announcement (recovery totals, partner count achievements, etc.). Tone: proud, energizing, forward-looking.",
    deadline_reminder: "A deadline or compliance reminder about IEEPA 180-day protest deadlines, quarterly filing windows, or time-sensitive action items. Tone: urgent but helpful, not alarming.",
    feature: "A feature or platform announcement about new tools, capabilities, or improvements in the Fintella partner portal. Tone: excited, practical, action-oriented.",
    general: "A general update or announcement to the partner network. Choose the most appropriate tone based on the content.",
  };

  const closedWonSummary = recentClosedWon.length > 0
    ? recentClosedWon
        .map((d) => `- "${d.dealName}" — est. refund $${Math.round(d.estimatedRefundAmount).toLocaleString()}, firm fee $${Math.round(d.firmFeeAmount).toLocaleString()}`)
        .join("\n")
    : "(none in last 30 days)";

  const partnerTypeBreakdown = context.partnersByType
    .map((p: { type: string; count: number }) => `  - ${p.type}: ${p.count}`)
    .join("\n") || "  (no breakdown available)";

  const systemPrompt = `You are the ${FIRM_NAME} communications assistant. You draft announcements for the partner network.

Rules:
- Write in ${FIRM_NAME}'s voice: professional, confident, direct. B2B tone.
- Keep announcements concise — 3-8 sentences. Partners skim, not read.
- Use specific numbers from the data provided. Do not invent statistics.
- Never mention specific client names or deal names — use anonymized counts only.
- Never give legal or tax advice. Stick to network/business updates.
- Do not use excessive emojis. One or two strategic ones at most.
- Do not use hype words: "revolutionary", "game-changing", "explosive", "crushing it".
- End with a clear call-to-action when appropriate (e.g., "Submit your next client referral today").
- Format for readability: use line breaks between paragraphs. Bold key numbers if markdown is supported.
- If data is sparse (zeros or low numbers), pivot to forward-looking momentum rather than reporting embarrassing low numbers.`;

  const userPrompt = `Generate a ${type} announcement for the ${FIRM_NAME} partner network.

## Announcement Type
${typeDescriptions[type] || typeDescriptions.general}

## Live System Data (as of ${new Date().toLocaleDateString()})

**Network Growth:**
- New partners (last 7 days): ${context.newPartners7d}
- Total active partners: ${context.totalActivePartners}
- Partner breakdown:
${partnerTypeBreakdown}

**Deal Activity:**
- New deals (last 7 days): ${context.recentDeals7d}
- Total deals in pipeline: ${context.totalDeals}
- Closed Won deals (all time): ${context.closedWonCount}
- Total estimated recoveries: $${Math.round(context.totalRecoveriesAmount).toLocaleString()}
- Total firm fees: $${Math.round(context.totalFirmFees).toLocaleString()}

**Recent Closed Won Deals (last 30 days, anonymized):**
${closedWonSummary}

**Commissions:**
- Total commissions paid to partners: $${Math.round(context.totalCommissionsPaid).toLocaleString()}
- Total commission entries: ${context.totalCommissionEntries}

${context.channelName ? `**Channel Context:** This announcement is for the "${context.channelName}" channel (${context.channelMembers} members).` : ""}

${instructions ? `**Admin's Special Instructions:**\n${instructions}` : ""}

Write the announcement now. Return ONLY the announcement text — no meta-commentary, no markdown fences, no "Here's the announcement:" preamble.`;

  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text.trim() : "(AI returned no text — please try again)";
}

// ── DEMO FALLBACK ──────────────────────────────────────────────────────────

function generateDemoFallback(type: string, context: Record<string, any>): string {
  const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  switch (type) {
    case "network_update":
      return `Partner Network Update -- ${date}

Our network continues to grow! ${context.newPartners7d > 0 ? `${context.newPartners7d} new partner${context.newPartners7d === 1 ? "" : "s"} joined this week, bringing our active network to ${context.totalActivePartners} partners.` : `We now have ${context.totalActivePartners} active partners in our network.`}

${context.recentDeals7d > 0 ? `${context.recentDeals7d} new deal${context.recentDeals7d === 1 ? " was" : "s were"} submitted in the last 7 days.` : "Keep those referrals coming — every submission counts."}

Thank you for being part of the ${FIRM_NAME} network. Your referrals are making a difference for importers across the country.`;

    case "milestone":
      return `Milestone Achievement — ${date}

${context.closedWonCount > 0 ? `We have now closed ${context.closedWonCount} successful recovery case${context.closedWonCount === 1 ? "" : "s"}, representing $${Math.round(context.totalRecoveriesAmount).toLocaleString()} in estimated refunds for U.S. importers.` : `Our pipeline is building momentum with ${context.totalDeals} total deals in the system.`}

${context.totalCommissionsPaid > 0 ? `Partners have earned a combined $${Math.round(context.totalCommissionsPaid).toLocaleString()} in commissions so far.` : "Commission payouts begin as deals close — keep building your referral pipeline."}

Here's to the next milestone. Keep up the great work!`;

    case "deadline_reminder":
      return `Important Deadline Reminder — ${date}

A reminder to all partners: the IEEPA 180-day protest deadline is a hard legal cutoff. Entries from Q1 2025 are approaching their filing window.

If you have importers who haven't started their claim process, now is the time. Once the deadline passes, the opportunity to recover overpaid tariffs is gone.

Encourage your clients to submit their case as soon as possible. You can use your referral link or the Submit Client page in the portal.`;

    case "feature":
      return `New Feature Announcement — ${date}

We've been busy improving the ${FIRM_NAME} partner portal to help you work more effectively.

Check out the latest updates in the portal — new tools and improvements are live now. Log in to explore what's new.

As always, if you have questions or feedback, reach out through the Support page or reply to this announcement.`;

    default:
      return `${FIRM_NAME} Partner Update — ${date}

Here's a quick update on where we stand:

${context.totalActivePartners > 0 ? `- ${context.totalActivePartners} active partners in the network` : ""}
${context.totalDeals > 0 ? `- ${context.totalDeals} total deals in the pipeline` : ""}
${context.closedWonCount > 0 ? `- ${context.closedWonCount} deals closed successfully` : ""}
${context.totalCommissionsPaid > 0 ? `- $${Math.round(context.totalCommissionsPaid).toLocaleString()} in total commissions paid` : ""}

Thank you for your continued partnership. Let's keep the momentum going.`.replace(/\n{3,}/g, "\n\n");
  }
}
