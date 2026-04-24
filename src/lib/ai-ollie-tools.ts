/**
 * PartnerOS AI — Ollie's tool surface (Phase 3b + 3c.2).
 *
 * Partner-scoped tools Ollie can call mid-conversation. Every execute
 * function re-scopes every query to the signed-in partner's partnerCode —
 * the LLM cannot spoof a target code. Admin callers (no partnerCode on
 * session) get a friendly "tool not available for admins yet" result rather
 * than a crash.
 *
 * Spec: docs/superpowers/specs/2026-04-24-partneros-ai-roadmap-design.md §3.4, §7, §9.3 rows 3.7 + 3.8.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { STAGE_LABELS } from "@/lib/constants";

export type OllieToolName =
  | "lookupDeal"
  | "lookupCommissions"
  | "lookupAgreement"
  | "lookupDownline"
  | "create_support_ticket";

// Categories Ollie may assign to a ticket. These feed AdminInbox.categories
// to route email + notifications. Keep this list in sync with the seed in
// scripts/seed-all.js + the spec §7.2 table.
const TICKET_CATEGORIES = [
  "deal_tracking",
  "portal_question",
  "tech_error",
  "other",
  "agreement_question",
  "legal_question",
  "enterprise_inquiry",
  "ceo_escalation",
  "commission_question",
  "payment_question",
] as const;

const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export const OLLIE_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "lookupDeal",
    description:
      "Look up one of the partner's own deals by partial deal name or client name. Returns stage, estimated refund, firm fee, commission status, and last activity. If no match, returns empty results. Use this whenever the partner asks about the status of a specific deal they referred.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
          description:
            "Partial match against deal name, legal entity name, or client name. Case-insensitive. Minimum 2 characters.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "lookupCommissions",
    description:
      "Look up the partner's commission ledger entries. Filter by status (pending, due, paid, all). Returns per-entry amount, tier, deal name, and a totals block. Use this when a partner asks 'how much am I owed', 'what have I been paid', 'why is my commission showing X'.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string" as const,
          enum: ["pending", "due", "paid", "all"],
          description:
            "Which lifecycle bucket to return. 'all' returns everything. Defaults to 'all' if omitted.",
        },
      },
      required: [],
    },
  },
  {
    name: "lookupAgreement",
    description:
      "Look up the partner's partnership agreement record. Returns status (not_sent / pending / signed / amended), signed date, template rate, and whether a SignWell document exists. Use this when a partner asks 'is my agreement signed', 'where do I find my agreement', 'am I activated'.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "lookupDownline",
    description:
      "Look up partners the current partner has recruited. depth=1 returns direct recruits only (their L2s). depth=2 also returns L3s recruited by those L2s. Returns partnerCode, name, status, tier, rate, and signup date. Use this when a partner asks about their downline, who they've recruited, or why a recruit isn't showing up.",
    input_schema: {
      type: "object" as const,
      properties: {
        depth: {
          type: "number" as const,
          enum: [1, 2],
          description: "1 = direct recruits only. 2 = direct + grand-downline.",
        },
      },
      required: [],
    },
  },
  {
    name: "create_support_ticket",
    description:
      "Create a support ticket on behalf of the partner when a question can't be resolved in-chat or requires human action. ALWAYS confirm with the partner first before calling — state the subject, category, and priority you'd file, and only fire after they agree. Category determines which admin inbox gets notified (support / legal / admin / accounting). Use this as the fallback when lookups don't resolve the question, when the partner explicitly asks to open a ticket, or when you detect a stuck deal (isStale on lookupDeal) and they accept your offer to open one.",
    input_schema: {
      type: "object" as const,
      properties: {
        subject: {
          type: "string" as const,
          description:
            "Short headline for the ticket (under 80 chars). Example: \"Oceanport deal stuck in Consultation Booked for 21 days\".",
        },
        category: {
          type: "string" as const,
          enum: [...TICKET_CATEGORIES] as unknown as string[],
          description:
            "Routing category. deal_tracking = deal stage questions; portal_question = how-to; tech_error = portal bug; commission_question / payment_question = accounting inbox; agreement_question / legal_question = legal inbox; enterprise_inquiry / ceo_escalation = admin inbox; other = general support.",
        },
        priority: {
          type: "string" as const,
          enum: [...TICKET_PRIORITIES] as unknown as string[],
          description:
            "Infer from tone + time sensitivity. urgent = partner says something is blocking them right now; high = time-sensitive (consultation tomorrow, payout pending); normal = standard question; low = curiosity / nice-to-have.",
        },
        reason: {
          type: "string" as const,
          description:
            "2-4 sentence summary of what happened + what the partner needs. Written as admin-facing context, not partner-facing reply copy. Include relevant deal names / IDs / commission amounts when known.",
        },
        relatedDealId: {
          type: "string" as const,
          description:
            "Optional — the 8-char deal ID from a prior lookupDeal result if the ticket is about a specific deal.",
        },
      },
      required: ["subject", "category", "priority", "reason"],
    },
  },
];

export interface ToolCallResult {
  name: OllieToolName | string;
  input: unknown;
  output: unknown;
  isError?: boolean;
}

function ok(output: unknown): { output: unknown; isError?: boolean } {
  return { output };
}
function err(message: string): { output: unknown; isError: true } {
  return { output: { error: message }, isError: true };
}

interface ExecuteCtx {
  userId: string;
  userType: "partner" | "admin";
  /** Required for tools that write (e.g. create_support_ticket) so the
   *  AiEscalation audit row can link back to the conversation. Lookup
   *  tools tolerate absence. */
  conversationId?: string;
}

/**
 * Dispatch a tool call to its execute function. Always scopes to the caller's
 * partnerCode — never to a code supplied in tool input.
 */
export async function executeOllieTool(
  name: string,
  input: unknown,
  ctx: ExecuteCtx
): Promise<{ output: unknown; isError?: boolean }> {
  if (ctx.userType !== "partner") {
    return err(
      "This tool is only available on partner-scoped conversations. Admin data lookups are not yet supported."
    );
  }
  const partnerCode = ctx.userId;
  const args = (input ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "lookupDeal":
        return ok(await lookupDeal(partnerCode, args));
      case "lookupCommissions":
        return ok(await lookupCommissions(partnerCode, args));
      case "lookupAgreement":
        return ok(await lookupAgreement(partnerCode));
      case "lookupDownline":
        return ok(await lookupDownline(partnerCode, args));
      case "create_support_ticket":
        return await createSupportTicket(partnerCode, args, ctx);
      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e: any) {
    return err(e?.message || "Tool execution failed");
  }
}

// ─── IMPLEMENTATIONS ──────────────────────────────────────────────────────

async function lookupDeal(
  partnerCode: string,
  args: Record<string, unknown>
) {
  const query = String(args.query ?? "").trim();
  if (query.length < 2) {
    return { matches: [], note: "Query must be at least 2 characters." };
  }

  const deals = await prisma.deal.findMany({
    where: {
      partnerCode,
      OR: [
        { dealName: { contains: query, mode: "insensitive" } },
        { legalEntityName: { contains: query, mode: "insensitive" } },
        { clientFirstName: { contains: query, mode: "insensitive" } },
        { clientLastName: { contains: query, mode: "insensitive" } },
        { clientName: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: {
      id: true,
      dealName: true,
      stage: true,
      legalEntityName: true,
      estimatedRefundAmount: true,
      actualRefundAmount: true,
      firmFeeAmount: true,
      l1CommissionStatus: true,
      l2CommissionStatus: true,
      l3CommissionStatus: true,
      paymentReceivedAt: true,
      closeDate: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // "Stale" = not in a terminal stage AND no updates in 14+ days. Surfaces
  // as `isStale: true` on the tool output so Ollie can proactively offer to
  // open a ticket to nudge the firm.
  const TERMINAL_STAGES = new Set([
    "closed_won",
    "closedwon",
    "closed_lost",
    "closedlost",
    "client_no_show",
  ]);
  const STALE_DAYS = 14;
  const now = Date.now();

  return {
    matches: deals.map((d) => {
      const daysSinceLastActivity = Math.floor(
        (now - d.updatedAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      const isStale =
        !TERMINAL_STAGES.has(d.stage) && daysSinceLastActivity >= STALE_DAYS;
      return {
        dealId: d.id.substring(0, 8),
        dealName: d.dealName,
        legalEntity: d.legalEntityName,
        stage: d.stage,
        stageLabel: STAGE_LABELS[d.stage]?.label || d.stage,
        estimatedRefund: d.estimatedRefundAmount || 0,
        actualRefund: d.actualRefundAmount ?? null,
        firmFee: d.firmFeeAmount || 0,
        commissionStatus: {
          l1: d.l1CommissionStatus,
          l2: d.l2CommissionStatus,
          l3: d.l3CommissionStatus,
        },
        paymentReceivedAt: d.paymentReceivedAt?.toISOString() ?? null,
        closeDate: d.closeDate?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
        lastActivityAt: d.updatedAt.toISOString(),
        daysSinceLastActivity,
        isStale,
      };
    }),
    count: deals.length,
    note:
      deals.length === 5
        ? "Showing first 5 matches. Narrow the query for a more specific result."
        : undefined,
  };
}

async function lookupCommissions(
  partnerCode: string,
  args: Record<string, unknown>
) {
  const rawStatus = String(args.status ?? "all").toLowerCase();
  const status =
    rawStatus === "pending" || rawStatus === "due" || rawStatus === "paid"
      ? rawStatus
      : "all";

  const where =
    status === "all" ? { partnerCode } : { partnerCode, status };

  const entries = await prisma.commissionLedger.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      dealName: true,
      tier: true,
      amount: true,
      status: true,
      periodMonth: true,
      payoutDate: true,
      payoutMethod: true,
      createdAt: true,
    },
  });

  const totals = entries.reduce(
    (acc, e) => {
      acc.count += 1;
      acc.totalAmount += e.amount;
      if (e.status === "pending") acc.pending += e.amount;
      if (e.status === "due") acc.due += e.amount;
      if (e.status === "paid") acc.paid += e.amount;
      return acc;
    },
    { count: 0, totalAmount: 0, pending: 0, due: 0, paid: 0 }
  );

  return {
    filter: status,
    entries: entries.map((e) => ({
      entryId: e.id.substring(0, 8),
      dealName: e.dealName ?? "(unnamed deal)",
      tier: e.tier,
      amount: e.amount,
      status: e.status,
      periodMonth: e.periodMonth,
      payoutDate: e.payoutDate?.toISOString() ?? null,
      payoutMethod: e.payoutMethod,
      createdAt: e.createdAt.toISOString(),
    })),
    totals,
    note:
      entries.length === 50
        ? "Showing most recent 50 entries. Older history is on the Commissions page."
        : undefined,
  };
}

async function lookupAgreement(partnerCode: string) {
  const agreement = await prisma.partnershipAgreement.findFirst({
    where: { partnerCode },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      status: true,
      version: true,
      templateRate: true,
      templateId: true,
      sentDate: true,
      signedDate: true,
      signwellDocumentId: true,
      documentUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!agreement) {
    return {
      hasAgreement: false,
      note: "No partnership agreement on file yet. One is typically created when the admin activates the partner or when recruitment invite flow completes.",
    };
  }

  return {
    hasAgreement: true,
    agreementId: agreement.id.substring(0, 8),
    status: agreement.status,
    version: agreement.version,
    rate: agreement.templateRate,
    templateId: agreement.templateId,
    sentAt: agreement.sentDate?.toISOString() ?? null,
    signedAt: agreement.signedDate?.toISOString() ?? null,
    hasSignwellDoc: !!agreement.signwellDocumentId,
    hasDocumentUrl: !!agreement.documentUrl,
    lastUpdatedAt: agreement.updatedAt.toISOString(),
  };
}

async function lookupDownline(
  partnerCode: string,
  args: Record<string, unknown>
) {
  const depthNum = Number(args.depth ?? 1);
  const depth: 1 | 2 = depthNum === 2 ? 2 : 1;

  const direct = await prisma.partner.findMany({
    where: { referredByPartnerCode: partnerCode },
    orderBy: { signupDate: "desc" },
    take: 50,
    select: {
      partnerCode: true,
      firstName: true,
      lastName: true,
      status: true,
      tier: true,
      commissionRate: true,
      signupDate: true,
    },
  });

  let grandDownline: typeof direct = [];
  if (depth === 2 && direct.length > 0) {
    const directCodes = direct.map((p) => p.partnerCode);
    grandDownline = await prisma.partner.findMany({
      where: { referredByPartnerCode: { in: directCodes } },
      orderBy: { signupDate: "desc" },
      take: 100,
      select: {
        partnerCode: true,
        firstName: true,
        lastName: true,
        status: true,
        tier: true,
        commissionRate: true,
        signupDate: true,
      },
    });
  }

  const toRow = (p: (typeof direct)[number]) => ({
    partnerCode: p.partnerCode,
    name: `${p.firstName} ${p.lastName}`.trim(),
    status: p.status,
    tier: p.tier,
    rate: p.commissionRate,
    signupDate: p.signupDate.toISOString(),
  });

  return {
    depth,
    directRecruits: direct.map(toRow),
    directCount: direct.length,
    grandDownline: depth === 2 ? grandDownline.map(toRow) : undefined,
    grandDownlineCount: depth === 2 ? grandDownline.length : undefined,
    note:
      direct.length === 50
        ? "Showing 50 most recent direct recruits."
        : undefined,
  };
}

// ─── WRITE TOOLS ──────────────────────────────────────────────────────────
// Tools that mutate state. Each one records an `AiEscalation` row alongside
// the primary write so we have a clean audit trail of what Ollie actually
// did on behalf of the partner.

async function createSupportTicket(
  partnerCode: string,
  args: Record<string, unknown>,
  ctx: ExecuteCtx
) {
  const subject = String(args.subject ?? "").trim().slice(0, 200);
  const category = String(args.category ?? "other");
  const priorityRaw = String(args.priority ?? "normal");
  const priority = (TICKET_PRIORITIES as readonly string[]).includes(priorityRaw)
    ? priorityRaw
    : "normal";
  const reason = String(args.reason ?? "").trim();
  const relatedDealId =
    typeof args.relatedDealId === "string" && args.relatedDealId.trim().length > 0
      ? args.relatedDealId.trim()
      : null;

  if (!subject) return err("Ticket subject is required.");
  if (!reason) return err("Ticket reason is required.");
  if (!(TICKET_CATEGORIES as readonly string[]).includes(category)) {
    return err(`Unknown category: ${category}`);
  }

  // Route to the correct inbox. Fall back to `support` if the category isn't
  // mapped — never drop a ticket on the floor.
  const routedInbox =
    (await prisma.adminInbox.findFirst({
      where: { categories: { has: category } },
      select: { id: true, role: true, emailAddress: true, displayName: true },
    })) ??
    (await prisma.adminInbox.findUnique({
      where: { role: "support" },
      select: { id: true, role: true, emailAddress: true, displayName: true },
    }));

  // Compose a body that preserves the Ollie-authored context so admins can
  // action without re-reading the whole conversation.
  const body = relatedDealId
    ? `${reason}\n\n(Related deal: ${relatedDealId})`
    : reason;

  const ticket = await prisma.supportTicket.create({
    data: {
      partnerCode,
      subject,
      category,
      priority,
      messages: {
        create: {
          authorType: "partner",
          authorId: partnerCode,
          content: body,
        },
      },
    },
    select: { id: true, subject: true, category: true, priority: true, createdAt: true },
  });

  // Audit trail. Link to conversation when we have an id; otherwise record
  // just the ticketId + routing decision so support still gets the context.
  if (ctx.conversationId) {
    await prisma.aiEscalation.create({
      data: {
        conversationId: ctx.conversationId,
        rung: "support_ticket",
        status: "succeeded",
        targetInboxId: routedInbox?.id ?? null,
        partnerCode,
        category,
        priority,
        reason: subject,
        payload: {
          ticketId: ticket.id,
          relatedDealId,
          routedToInbox: routedInbox?.role ?? null,
          inboxEmail: routedInbox?.emailAddress ?? null,
        },
      },
    });
  }

  return ok({
    ticketId: ticket.id.substring(0, 8),
    subject: ticket.subject,
    category: ticket.category,
    priority: ticket.priority,
    createdAt: ticket.createdAt.toISOString(),
    routedTo: routedInbox
      ? { role: routedInbox.role, displayName: routedInbox.displayName }
      : { role: "support", displayName: "Partner Support" },
    partnerLink: `/dashboard/support`,
    note:
      "Ticket created and routed. A ticket email to the target inbox will fire in a follow-up PR (Phase 3c.3). Partner can view and reply from the Support page.",
  });
}
