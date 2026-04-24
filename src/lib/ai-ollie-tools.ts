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
import { getOnlineAdminsForInbox } from "@/lib/admin-online";
import { getOfferedSlots } from "@/lib/scheduling";
import { emergencyCallSuperAdmin } from "@/lib/emergency-call";
import { initiateBridgedCall } from "@/lib/twilio-voice";
import { createEventOnInboxCalendar } from "@/lib/google-calendar";

export type OllieToolName =
  | "lookupDeal"
  | "lookupCommissions"
  | "lookupAgreement"
  | "lookupDownline"
  | "create_support_ticket"
  | "start_live_chat"
  | "initiate_live_transfer"
  | "offer_schedule_slots"
  | "book_slot"
  | "investigate_bug";

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
    name: "start_live_chat",
    description:
      "Hand the conversation off to a live human via in-portal chat. Fires when the partner wants to talk to a person NOW and an admin assigned to the relevant inbox is online + has availableForLiveChat=true. Creates a ChatSession + seeds it with the partner's question + notifies the admins. DO NOT call if you haven't just verified an admin is available — call lookupAdminAvailability first (coming soon) or let the tool fail gracefully and fall back to create_support_ticket.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string" as const,
          enum: [...TICKET_CATEGORIES] as unknown as string[],
          description:
            "Which admin inbox should pick this up (same enum as create_support_ticket).",
        },
        reason: {
          type: "string" as const,
          description:
            "One-line summary of what the partner wants to talk about. Becomes the ChatSession subject.",
        },
        partnerMessage: {
          type: "string" as const,
          description:
            "Optional opening message to seed the chat — usually the partner's most recent turn in the Ollie conversation so the admin can pick up where Ollie left off.",
        },
      },
      required: ["category", "reason"],
    },
  },
  {
    name: "investigate_bug",
    description:
      "Run a structured bug triage when a partner reports a portal issue (button broken, error, page not loading, etc.). Interview the partner first for symptom + browser + device + exact error text. Then call this tool with the collected info. The tool runs auto-diagnostics (checks the partner's account state), classifies outcome (user_error / needs_admin_investigation / confirmed_bug), and on `confirmed_bug` automatically fires the IT emergency call chain + creates a high-priority tech_error ticket. DO NOT call this tool speculatively — only call when the partner has described a concrete issue.",
    input_schema: {
      type: "object" as const,
      properties: {
        symptom: {
          type: "string" as const,
          description:
            "1-2 sentence description of what's broken from the partner's words. Example: \"Submit Client button does nothing when I click it\" or \"Page goes blank after signing agreement\".",
        },
        browser: {
          type: "string" as const,
          description:
            "Browser + version the partner is using if they shared it (e.g. \"Chrome 120\"). Empty string if unknown.",
        },
        device: {
          type: "string" as const,
          description:
            "Device the partner is on — \"iPhone 15\" / \"Windows 11 laptop\" / \"iPad\" / etc. Empty if unknown.",
        },
        errorText: {
          type: "string" as const,
          description:
            "Exact error message the partner saw, if any. Preserves case + punctuation. Empty string if the partner didn't see an explicit error.",
        },
        whenStarted: {
          type: "string" as const,
          description:
            "Partner's best guess at when the issue started — \"just now\", \"this morning\", \"since yesterday\". Empty string if unknown.",
        },
        screenshotUrls: {
          type: "array" as const,
          items: { type: "string" as const },
          description:
            "Optional. Public URLs of screenshots the partner uploaded via the chat's paperclip button. Each URL came from /api/ai/upload. Include them here so the ticket body surfaces them for admin triage and the AiEscalation payload records them for audit.",
        },
      },
      required: ["symptom"],
    },
  },
  {
    name: "offer_schedule_slots",
    description:
      "Show the partner available 15-minute (or inbox-configured) slots for a scheduled call. Resolves category → AdminInbox → offered slots over the next 3 business days. Returns an empty slots list if the inbox has acceptScheduledCalls=false or isn't configured — fall back to opening a ticket in that case. Use this when the partner doesn't need a human NOW but wants to book time.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string" as const,
          enum: [...TICKET_CATEGORIES] as unknown as string[],
          description: "Which admin inbox will own the call (same enum as create_support_ticket).",
        },
        daysAhead: {
          type: "number" as const,
          description: "How many business days forward to search. Defaults to 3, max 14.",
        },
      },
      required: ["category"],
    },
  },
  {
    name: "book_slot",
    description:
      "Book a scheduled call slot the partner just picked from offer_schedule_slots. Creates a Google Calendar event on the inbox's connected calendar (when OAuth is set up), records an AiEscalation, fans out admin notifications, and returns a confirmation. Pass the exact startUtc from the slot the partner chose.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string" as const,
          enum: [...TICKET_CATEGORIES] as unknown as string[],
          description: "Same category you passed to offer_schedule_slots.",
        },
        startUtc: {
          type: "string" as const,
          description: "ISO UTC instant of the slot the partner picked (copy from the slot.startUtc field returned by offer_schedule_slots).",
        },
        reason: {
          type: "string" as const,
          description: "One-line summary of what the call is about — shown to the admin so they can prep.",
        },
        partnerPhone: {
          type: "string" as const,
          description: "Optional — partner's preferred call-back number. E.164 preferred.",
        },
      },
      required: ["category", "startUtc", "reason"],
    },
  },
  {
    name: "initiate_live_transfer",
    description:
      "Initiate a live phone transfer — Twilio will bridge a call between the partner and an on-call admin. ALWAYS confirm the partner's phone number in conversation before calling this tool. NEVER dial silently. The tool records the intent + notifies eligible admins; the actual Twilio bridge fires in a follow-up PR. If no admins with availableForLiveCall=true are online right now, the tool will return an error — fall back to offering a scheduled call or a support ticket.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string" as const,
          enum: [...TICKET_CATEGORIES] as unknown as string[],
          description: "Which admin inbox should receive the call.",
        },
        partnerPhone: {
          type: "string" as const,
          description:
            "Partner's phone number as they just confirmed to you. E.164 preferred, but the tool will normalize.",
        },
        reason: {
          type: "string" as const,
          description:
            "One-line summary of what the partner wants to discuss on the call.",
        },
      },
      required: ["category", "partnerPhone", "reason"],
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
      case "start_live_chat":
        return await startLiveChat(partnerCode, args, ctx);
      case "initiate_live_transfer":
        return await initiateLiveTransfer(partnerCode, args, ctx);
      case "offer_schedule_slots":
        return await offerScheduleSlots(args);
      case "book_slot":
        return await bookSlot(partnerCode, args, ctx);
      case "investigate_bug":
        return await investigateBug(partnerCode, args, ctx);
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

  // Fan out internal bell notifications to the admins who handle this
  // inbox. Phase 3c.3b — internal-only (Ollie-created tickets flow through
  // the same in-portal Notification / /admin/support path admins already
  // use for human-created tickets, no external email).
  //
  // Preference order:
  //   1. AdminInbox.assignedAdminIds if the inbox has explicit assignees
  //   2. Otherwise fall back to every super_admin / admin / partner_support
  //      user (accounting excluded — they don't work the support queue)
  const partnerProfile = await prisma.partner.findUnique({
    where: { partnerCode },
    select: { firstName: true, lastName: true },
  });
  const partnerName =
    partnerProfile
      ? `${partnerProfile.firstName ?? ""} ${partnerProfile.lastName ?? ""}`.trim() || partnerCode
      : partnerCode;

  let recipientAdminEmails: string[] = [];
  const assignedIds = routedInbox
    ? await prisma.adminInbox
        .findUnique({
          where: { id: routedInbox.id },
          select: { assignedAdminIds: true },
        })
        .then((r) => r?.assignedAdminIds ?? [])
    : [];
  if (assignedIds.length > 0) {
    const assigned = await prisma.user.findMany({
      where: { id: { in: assignedIds } },
      select: { email: true },
    });
    recipientAdminEmails = assigned.map((u) => u.email);
  }
  if (recipientAdminEmails.length === 0) {
    const fallback = await prisma.user.findMany({
      where: { role: { in: ["super_admin", "admin", "partner_support"] } },
      select: { email: true },
    });
    recipientAdminEmails = fallback.map((u) => u.email);
  }

  const inboxLabel = routedInbox
    ? `${routedInbox.displayName} inbox`
    : "Support inbox";
  const notifTitle =
    priority === "urgent" || priority === "high"
      ? `New ${priority} ticket from Ollie`
      : "New ticket from Ollie";
  const notifMessage = `${partnerName} → ${inboxLabel} · ${ticket.subject}`;
  const notifLink = `/admin/support?ticketId=${ticket.id}`;

  await Promise.all(
    recipientAdminEmails.map((email) =>
      prisma.notification
        .create({
          data: {
            recipientType: "admin",
            recipientId: email,
            type: "ai_ticket_routed",
            title: notifTitle,
            message: notifMessage,
            link: notifLink,
          },
        })
        .catch(() => {})
    )
  );

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
    adminsNotified: recipientAdminEmails.length,
    routedViaAssignedAdmins: assignedIds.length > 0,
    note:
      assignedIds.length > 0
        ? `Ticket created, routed to ${inboxLabel}, and ${recipientAdminEmails.length} assigned admin${recipientAdminEmails.length === 1 ? "" : "s"} notified. Partner can view and reply from the Support page.`
        : `Ticket created and routed to ${inboxLabel}. Inbox has no admins assigned yet — notified all ${recipientAdminEmails.length} support-eligible admins as fallback. Partner can view and reply from the Support page.`,
  });
}

// ─── LIVE ESCALATION TOOLS (Phase 3c.4c) ──────────────────────────────────

async function startLiveChat(
  partnerCode: string,
  args: Record<string, unknown>,
  ctx: ExecuteCtx
) {
  const category = String(args.category ?? "other");
  const reason = String(args.reason ?? "").trim();
  const partnerMessage = typeof args.partnerMessage === "string" ? args.partnerMessage.trim() : "";
  if (!reason) return err("Reason is required for live chat.");
  if (!(TICKET_CATEGORIES as readonly string[]).includes(category)) {
    return err(`Unknown category: ${category}`);
  }

  const routedInbox =
    (await prisma.adminInbox.findFirst({
      where: { categories: { has: category } },
      select: { id: true, role: true, displayName: true, assignedAdminIds: true },
    })) ??
    (await prisma.adminInbox.findUnique({
      where: { role: "support" },
      select: { id: true, role: true, displayName: true, assignedAdminIds: true },
    }));

  // Find online admins assigned to this inbox who are available for live chat.
  const candidateIds = routedInbox?.assignedAdminIds ?? [];
  const onlineAssigned = candidateIds.length
    ? (await getOnlineAdminsForInbox(candidateIds)).filter((a) => a.availableForLiveChat)
    : [];

  // Fallback: no assignee online — check any support-eligible admin online with the flag.
  let onlineAdmins = onlineAssigned;
  let usedFallback = false;
  if (onlineAdmins.length === 0) {
    const fallback = await prisma.user.findMany({
      where: {
        role: { in: ["super_admin", "admin", "partner_support"] },
        availableForLiveChat: true,
        lastHeartbeatAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
      },
      select: { id: true, email: true, name: true },
    });
    onlineAdmins = fallback as any;
    usedFallback = fallback.length > 0;
  }

  if (onlineAdmins.length === 0) {
    return err(
      "No admins are available for live chat right now. Offer the partner a scheduled call or open a support ticket instead."
    );
  }

  // Create ChatSession + seed with partner's opening message.
  const session = await prisma.chatSession.create({
    data: {
      partnerCode,
      subject: reason.slice(0, 120),
      messages: partnerMessage
        ? {
            create: {
              senderType: "partner",
              senderId: partnerCode,
              content: partnerMessage,
            },
          }
        : undefined,
    },
    select: { id: true, subject: true, createdAt: true },
  });

  // Audit + notify.
  if (ctx.conversationId) {
    await prisma.aiEscalation.create({
      data: {
        conversationId: ctx.conversationId,
        rung: "live_chat",
        status: "initiated",
        targetInboxId: routedInbox?.id ?? null,
        partnerCode,
        category,
        priority: "normal",
        reason,
        payload: {
          sessionId: session.id,
          routedToInbox: routedInbox?.role ?? null,
          onlineAdminCount: onlineAdmins.length,
          fallbackUsed: usedFallback,
        },
      },
    });
  }

  await Promise.all(
    onlineAdmins.map((a) =>
      prisma.notification
        .create({
          data: {
            recipientType: "admin",
            recipientId: a.email,
            type: "ai_live_chat_transfer",
            title: "Ollie transferred a live chat",
            message: `${partnerCode} → ${routedInbox?.displayName ?? "Support"} · ${session.subject ?? reason}`,
            link: `/admin/support?chatSessionId=${session.id}`,
          },
        })
        .catch(() => {})
    )
  );

  return ok({
    sessionId: session.id.substring(0, 8),
    subject: session.subject,
    createdAt: session.createdAt.toISOString(),
    onlineAdminsNotified: onlineAdmins.length,
    fallbackUsed: usedFallback,
    partnerLink: "/dashboard/support",
    note: `Live chat session created and ${onlineAdmins.length} admin(s) notified. Partner should click through to the Support page; admin will join momentarily.`,
  });
}

async function initiateLiveTransfer(
  partnerCode: string,
  args: Record<string, unknown>,
  ctx: ExecuteCtx
) {
  const category = String(args.category ?? "other");
  const reason = String(args.reason ?? "").trim();
  const rawPhone = String(args.partnerPhone ?? "").trim();

  if (!reason) return err("Reason is required.");
  if (!rawPhone) return err("Partner phone is required — confirm it with the partner before calling this tool.");
  const clean = rawPhone.replace(/[^\d+]/g, "");
  if (!/^\+?\d{7,15}$/.test(clean)) {
    return err("Partner phone format invalid — needs 7-15 digits, optionally leading +.");
  }
  const phone = clean.startsWith("+") ? clean : `+${clean}`;
  if (!(TICKET_CATEGORIES as readonly string[]).includes(category)) {
    return err(`Unknown category: ${category}`);
  }

  const routedInbox =
    (await prisma.adminInbox.findFirst({
      where: { categories: { has: category } },
      select: { id: true, role: true, displayName: true, assignedAdminIds: true },
    })) ??
    (await prisma.adminInbox.findUnique({
      where: { role: "support" },
      select: { id: true, role: true, displayName: true, assignedAdminIds: true },
    }));

  const candidateIds = routedInbox?.assignedAdminIds ?? [];
  const onlineAssigned = candidateIds.length
    ? (await getOnlineAdminsForInbox(candidateIds)).filter((a) => a.availableForLiveCall)
    : [];

  let onlineAdmins = onlineAssigned;
  let usedFallback = false;
  if (onlineAdmins.length === 0) {
    const fallback = await prisma.user.findMany({
      where: {
        role: { in: ["super_admin", "admin", "partner_support"] },
        availableForLiveCall: true,
        lastHeartbeatAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
      },
      select: { id: true, email: true, name: true },
    });
    onlineAdmins = fallback as any;
    usedFallback = fallback.length > 0;
  }

  if (onlineAdmins.length === 0) {
    return err(
      "No admins are available for live phone transfer right now. Offer the partner a scheduled call (15-min slot) or a support ticket."
    );
  }

  // Fire the actual Twilio bridged call. initiateBridgedCall dials
  // TWILIO_ADMIN_PHONE (on-call admin) first; when that admin picks up,
  // our /api/twilio/voice-webhook <Dial>s the partner's number and
  // bridges the two legs. Demo-gated: when TWILIO_* env vars are unset,
  // returns status=demo and logs a CallLog row without making a real call.
  const dial = await initiateBridgedCall({
    to: phone,
    partnerCode,
    initiatedByEmail: "ollie@fintella.partners",
    initiatedByName: "Ollie (PartnerOS)",
  });

  const escalation = ctx.conversationId
    ? await prisma.aiEscalation.create({
        data: {
          conversationId: ctx.conversationId,
          rung: "live_call",
          status: dial.status === "failed" ? "failed" : "initiated",
          targetInboxId: routedInbox?.id ?? null,
          partnerCode,
          category,
          priority: "high", // live phone transfers are always time-sensitive
          reason,
          payload: {
            partnerPhone: phone,
            routedToInbox: routedInbox?.role ?? null,
            onlineAdminCount: onlineAdmins.length,
            fallbackUsed: usedFallback,
            twilioCallSid: dial.callSid,
            twilioCallLogId: dial.callLogId,
            twilioStatus: dial.status,
            twilioError: dial.error ?? null,
          },
        },
        select: { id: true, createdAt: true },
      })
    : null;

  await Promise.all(
    onlineAdmins.map((a) =>
      prisma.notification
        .create({
          data: {
            recipientType: "admin",
            recipientId: a.email,
            type: "ai_live_call_transfer",
            title: "📞 Ollie initiated a live call transfer",
            message: `${partnerCode} at ${phone} → ${routedInbox?.displayName ?? "Support"} · ${reason.slice(0, 100)}`,
            link: `/admin/support?callEscalationId=${escalation?.id ?? ""}`,
          },
        })
        .catch(() => {})
    )
  );

  const dialNote =
    dial.status === "initiated"
      ? "Twilio dialing on-call admin first — they'll be bridged to the partner when they pick up."
      : dial.status === "demo"
        ? "Twilio env vars not set — demo-mode, no real dial. CallLog row written for audit. Admin notified via bell so they can call back manually."
        : `Twilio dial failed (${dial.error ?? "unknown"}). Admin was notified — will need to call back manually.`;

  return ok({
    escalationId: escalation?.id.substring(0, 8) ?? null,
    partnerPhone: phone,
    routedTo: routedInbox ? { role: routedInbox.role, displayName: routedInbox.displayName } : null,
    onlineAdminsNotified: onlineAdmins.length,
    fallbackUsed: usedFallback,
    twilioDialStatus: dial.status,
    twilioCallSid: dial.callSid,
    note: `${dialNote} ${onlineAdmins.length} admin(s) also got a bell notification.`,
  });
}

// ─── SCHEDULED CALL TOOLS (Phase 3c.4d) ───────────────────────────────────

async function offerScheduleSlots(args: Record<string, unknown>) {
  const category = String(args.category ?? "other");
  const daysAhead =
    typeof args.daysAhead === "number" ? args.daysAhead : 3;

  if (!(TICKET_CATEGORIES as readonly string[]).includes(category)) {
    return err(`Unknown category: ${category}`);
  }

  const { slots, inbox, reason } = await getOfferedSlots(category, daysAhead);

  if (!inbox) {
    return ok({
      slots: [],
      reason: "no_inbox_configured",
      message:
        "No admin inbox is configured for this category yet. Offer a support ticket instead.",
    });
  }

  if (reason === "inbox_not_accepting_scheduled_calls") {
    return ok({
      slots: [],
      inbox: {
        role: inbox.role,
        displayName: inbox.displayName,
      },
      reason,
      message: `${inbox.displayName} isn't currently accepting scheduled calls. Offer a support ticket or a different path.`,
    });
  }

  return ok({
    slots,
    inbox: {
      role: inbox.role,
      displayName: inbox.displayName,
      timeZone: inbox.timeZone,
      durationMinutes: inbox.callDurationMinutes,
    },
    note:
      "These are placeholder slots (v1). When Google Calendar per-inbox OAuth ships, slots will reflect real admin availability.",
  });
}

async function bookSlot(
  partnerCode: string,
  args: Record<string, unknown>,
  ctx: ExecuteCtx
) {
  const category = String(args.category ?? "other");
  const startUtcRaw = String(args.startUtc ?? "").trim();
  const reason = String(args.reason ?? "").trim();
  const partnerPhone =
    typeof args.partnerPhone === "string" ? args.partnerPhone.trim() : "";

  if (!(TICKET_CATEGORIES as readonly string[]).includes(category)) {
    return err(`Unknown category: ${category}`);
  }
  if (!reason) return err("Reason is required.");
  if (!startUtcRaw) return err("startUtc is required.");
  const start = new Date(startUtcRaw);
  if (Number.isNaN(start.getTime())) {
    return err("startUtc is not a valid ISO date.");
  }
  if (start.getTime() <= Date.now()) {
    return err("startUtc is in the past. Re-offer slots.");
  }

  const routedInbox =
    (await prisma.adminInbox.findFirst({
      where: { categories: { has: category } },
      select: {
        id: true,
        role: true,
        displayName: true,
        callDurationMinutes: true,
        callTitleTemplate: true,
        assignedAdminIds: true,
        acceptScheduledCalls: true,
        googleCalendarRefreshToken: true,
      },
    })) ??
    (await prisma.adminInbox.findUnique({
      where: { role: "support" },
      select: {
        id: true,
        role: true,
        displayName: true,
        callDurationMinutes: true,
        callTitleTemplate: true,
        assignedAdminIds: true,
        acceptScheduledCalls: true,
        googleCalendarRefreshToken: true,
      },
    }));

  if (!routedInbox || !routedInbox.acceptScheduledCalls) {
    return err(
      "Target inbox isn't accepting scheduled calls. Offer a support ticket instead."
    );
  }

  const end = new Date(start.getTime() + routedInbox.callDurationMinutes * 60_000);

  // Partner display name for the notification + future calendar title.
  const partner = await prisma.partner.findUnique({
    where: { partnerCode },
    select: { firstName: true, lastName: true, email: true },
  });
  const partnerName =
    partner
      ? `${partner.firstName ?? ""} ${partner.lastName ?? ""}`.trim() || partnerCode
      : partnerCode;

  // Create a real Google Calendar event on the inbox's primary calendar
  // when the inbox has OAuth connected. Returns null when no token is
  // set — falls back to notification-only path from Phase 3c.4d.
  const eventTitle = (routedInbox.callTitleTemplate || "Fintella: {partnerName} — {reason}")
    .replace("{partnerName}", partnerName)
    .replace("{reason}", reason.slice(0, 100));
  const calendarEvent = await createEventOnInboxCalendar(
    routedInbox.googleCalendarRefreshToken,
    routedInbox.id,
    {
      summary: eventTitle,
      description: [
        `Partner: ${partnerName} (${partnerCode})`,
        partner?.email ? `Partner email: ${partner.email}` : "",
        partnerPhone ? `Partner phone: ${partnerPhone}` : "",
        "",
        `Reason: ${reason}`,
        "",
        "— Booked via Ollie (PartnerOS)",
      ]
        .filter(Boolean)
        .join("\n"),
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      attendeeEmails: partner?.email ? [partner.email] : [],
    }
  ).catch((e) => {
    console.error("[book_slot] calendar event creation failed:", e);
    return null;
  });

  const calendarEventStatus: "created" | "skipped_no_token" | "failed" = calendarEvent
    ? "created"
    : routedInbox.googleCalendarRefreshToken
      ? "failed"
      : "skipped_no_token";

  // Record the booking.
  const escalation = ctx.conversationId
    ? await prisma.aiEscalation.create({
        data: {
          conversationId: ctx.conversationId,
          rung: "scheduled_call",
          status: "succeeded",
          targetInboxId: routedInbox.id,
          partnerCode,
          category,
          priority: "normal",
          reason,
          payload: {
            startUtc: start.toISOString(),
            endUtc: end.toISOString(),
            durationMinutes: routedInbox.callDurationMinutes,
            partnerPhone: partnerPhone || null,
            partnerName,
            partnerEmail: partner?.email ?? null,
            calendarEventStatus,
            calendarEventId: calendarEvent?.id ?? null,
            calendarEventLink: calendarEvent?.htmlLink ?? null,
          },
        },
        select: { id: true, createdAt: true },
      })
    : null;

  // Notify assigned admins (fallback to all support-eligible if empty).
  let recipientEmails: string[] = [];
  if (routedInbox.assignedAdminIds.length > 0) {
    const assigned = await prisma.user.findMany({
      where: { id: { in: routedInbox.assignedAdminIds } },
      select: { email: true },
    });
    recipientEmails = assigned.map((u) => u.email);
  }
  if (recipientEmails.length === 0) {
    const fallback = await prisma.user.findMany({
      where: { role: { in: ["super_admin", "admin", "partner_support"] } },
      select: { email: true },
    });
    recipientEmails = fallback.map((u) => u.email);
  }

  const startLocal = start.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const title = `📅 New scheduled call from Ollie`;
  const message = `${partnerName} booked ${startLocal} (${routedInbox.callDurationMinutes}m) · ${reason.slice(0, 80)}`;

  await Promise.all(
    recipientEmails.map((email) =>
      prisma.notification
        .create({
          data: {
            recipientType: "admin",
            recipientId: email,
            type: "ai_scheduled_call",
            title,
            message,
            link: `/admin/support?escalationId=${escalation?.id ?? ""}`,
          },
        })
        .catch(() => {})
    )
  );

  const calendarNote =
    calendarEventStatus === "created"
      ? "Calendar event created on the inbox's Google Calendar."
      : calendarEventStatus === "skipped_no_token"
        ? "Inbox hasn't connected Google Calendar yet — booked via notification only. Admin will add to their calendar manually."
        : "Calendar event creation failed — admin still notified via bell.";

  return ok({
    escalationId: escalation?.id.substring(0, 8) ?? null,
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
    durationMinutes: routedInbox.callDurationMinutes,
    routedTo: {
      role: routedInbox.role,
      displayName: routedInbox.displayName,
    },
    adminsNotified: recipientEmails.length,
    calendarEventStatus,
    calendarEventId: calendarEvent?.id ?? null,
    calendarEventLink: calendarEvent?.htmlLink ?? null,
    note: `Slot booked — ${recipientEmails.length} admin${recipientEmails.length === 1 ? "" : "s"} notified. ${calendarNote}`,
  });
}

// ─── BUG TRIAGE TOOL (Phase 3d v1 — no screenshots yet) ───────────────────

/**
 * Heuristic classifier — intentionally narrow on `confirmed_bug` so we
 * don't page super admin for ambiguous reports. Tuning knobs are all here
 * in one place for easy iteration.
 */
const CONFIRMED_BUG_SIGNALS = [
  /\b5\d\d\b/i,              // 5xx HTTP error in errorText
  /unexpected error/i,
  /stack trace/i,
  /internal server error/i,
  /application error/i,
  /page is blank/i,
  /white screen/i,
  /crashes?|crashed/i,
  /can't (submit|click|save|load|open)/i,
  /not (working|loading|responding)/i,
  /keeps? failing/i,
];
const USER_ERROR_SIGNALS = [
  /forgot my password/i,
  /can't find/i,
  /where is/i,
  /how do i/i,
  /what('s| is) the/i,
];

async function investigateBug(
  partnerCode: string,
  args: Record<string, unknown>,
  ctx: ExecuteCtx
) {
  const symptom = String(args.symptom ?? "").trim();
  const browser = String(args.browser ?? "").trim();
  const device = String(args.device ?? "").trim();
  const errorText = String(args.errorText ?? "").trim();
  const whenStarted = String(args.whenStarted ?? "").trim();
  const screenshotUrls = Array.isArray(args.screenshotUrls)
    ? (args.screenshotUrls as unknown[])
        .filter((u): u is string => typeof u === "string" && u.startsWith("http"))
        .slice(0, 6) // cap so a runaway upload spree can't explode ticket bodies
    : [];

  if (!symptom) return err("Symptom is required.");

  // Auto-diagnostics — partner account state that often explains a "broken"
  // experience (e.g. trying to submit a client before the agreement is
  // signed looks like "the button is broken" from the partner's side).
  const partner = await prisma.partner.findUnique({
    where: { partnerCode },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      status: true,
      tier: true,
    },
  });
  const agreement = await prisma.partnershipAgreement.findFirst({
    where: { partnerCode },
    orderBy: { updatedAt: "desc" },
    select: { status: true },
  });
  const diagnostics = {
    partnerStatus: partner?.status ?? "unknown",
    partnerTier: partner?.tier ?? "unknown",
    agreementStatus: agreement?.status ?? "not_sent",
    hasUsableAccount:
      partner?.status === "active" &&
      (agreement?.status === "signed" || agreement?.status === "amended"),
  };

  // Classification heuristic — combine symptom + error text.
  const combined = `${symptom}\n${errorText}`;
  let classification: "user_error" | "needs_admin_investigation" | "confirmed_bug" =
    "needs_admin_investigation";
  const hitConfirmed = CONFIRMED_BUG_SIGNALS.some((re) => re.test(combined));
  const hitUserError = USER_ERROR_SIGNALS.some((re) => re.test(combined));
  if (hitConfirmed) classification = "confirmed_bug";
  else if (hitUserError && !diagnostics.hasUsableAccount === false) classification = "user_error";
  else if (hitUserError) classification = "user_error";

  // Compose the ticket body.
  const screenshotLines =
    screenshotUrls.length > 0
      ? [
          "",
          `SCREENSHOTS (${screenshotUrls.length}):`,
          ...screenshotUrls.map((u, i) => `  ${i + 1}. ${u}`),
        ]
      : [];

  const bodyLines = [
    `SYMPTOM: ${symptom}`,
    whenStarted ? `WHEN: ${whenStarted}` : "",
    browser ? `BROWSER: ${browser}` : "",
    device ? `DEVICE: ${device}` : "",
    errorText ? `ERROR TEXT:\n${errorText}` : "",
    ...screenshotLines,
    "",
    "AUTO-DIAGNOSTICS:",
    `  partnerStatus: ${diagnostics.partnerStatus}`,
    `  partnerTier: ${diagnostics.partnerTier}`,
    `  agreementStatus: ${diagnostics.agreementStatus}`,
    `  hasUsableAccount: ${diagnostics.hasUsableAccount}`,
    "",
    `CLASSIFICATION: ${classification.replace(/_/g, " ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const priority: "low" | "normal" | "high" | "urgent" =
    classification === "confirmed_bug" ? "urgent" : "high";

  const subject = `[${classification.replace(/_/g, " ")}] ${symptom.slice(0, 100)}`;

  // Always create a tech_error ticket — even on user_error, because the
  // auto-diagnostics may reveal a pattern we want to fix (e.g. many users
  // hitting the submit-client page before agreement — that's a UX bug
  // even if each individual case is technically user_error).
  const ticketResult = await createSupportTicket(
    partnerCode,
    {
      subject,
      category: "tech_error",
      priority,
      reason: bodyLines,
    },
    ctx
  );

  // On confirmed_bug, fire the emergency call chain.
  let emergencyResult:
    | Awaited<ReturnType<typeof emergencyCallSuperAdmin>>
    | null = null;
  if (classification === "confirmed_bug") {
    emergencyResult = await emergencyCallSuperAdmin({
      reason: symptom.slice(0, 100),
      details: bodyLines,
      partnerCode,
      conversationId: ctx.conversationId,
    });
  }

  return ok({
    classification,
    priority,
    diagnostics,
    screenshotsAttached: screenshotUrls.length,
    screenshotUrls,
    ticket: (ticketResult as any).output ?? null,
    emergency: emergencyResult
      ? {
          contactCount: emergencyResult.contactCount,
          emailStatus: emergencyResult.emailStatus,
          notificationsCreated: emergencyResult.notificationsCreated,
          workspacePosted: emergencyResult.workspacePosted,
          twilioDials: emergencyResult.twilioDials,
        }
      : null,
    note:
      classification === "confirmed_bug"
        ? `Confirmed bug — urgent ticket created AND IT emergency chain fired. ${emergencyResult?.contactCount ?? 0} contact(s) paged.${screenshotUrls.length > 0 ? ` ${screenshotUrls.length} screenshot(s) attached.` : ""}`
        : classification === "user_error"
          ? `Classified as user_error — high-priority ticket created, admins can coach the partner; no emergency paged.${screenshotUrls.length > 0 ? ` ${screenshotUrls.length} screenshot(s) attached.` : ""}`
          : `Ambiguous — high-priority ticket created for admin investigation; no emergency paged.${screenshotUrls.length > 0 ? ` ${screenshotUrls.length} screenshot(s) attached.` : ""}`,
  });
}
