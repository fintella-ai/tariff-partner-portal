/**
 * Fintella Workflow Engine
 *
 * fireWorkflowTrigger(key, payload) — call from any internal event point.
 * Finds all enabled Workflow rows matching `key`, evaluates conditions,
 * executes actions, and writes a WorkflowLog row. Always fire-and-forget
 * (never throws — callers chain .catch() or ignore).
 *
 * Also used by WebhookSource incoming receiver to execute source actions.
 */

import { prisma } from "@/lib/prisma";

// ─── Trigger keys ────────────────────────────────────────────────────────────
export const TRIGGER_KEYS = [
  "deal.created",
  "deal.stage_changed",
  "deal.closed_won",
  "deal.closed_lost",
  "partner.created",
  "partner.activated",
  "commission.created",
  "commission.paid",
] as const;

export type TriggerKey = (typeof TRIGGER_KEYS)[number];

export const TRIGGER_LABELS: Record<TriggerKey, string> = {
  "deal.created":       "Deal Created",
  "deal.stage_changed": "Deal Stage Changed",
  "deal.closed_won":    "Deal Closed Won",
  "deal.closed_lost":   "Deal Closed Lost",
  "partner.created":    "Partner Created",
  "partner.activated":  "Partner Activated",
  "commission.created": "Commission Created",
  "commission.paid":    "Commission Paid",
};

// ─── Action types ─────────────────────────────────────────────────────────────
export const ACTION_TYPES = [
  "webhook.post",
  "notification.create",
  "deal.note",
  "email.send",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

export const ACTION_LABELS: Record<ActionType, string> = {
  "webhook.post":         "POST to Webhook URL",
  "notification.create":  "Create Notification",
  "deal.note":            "Add Deal Note",
  "email.send":           "Send Email",
};

// ─── Descriptions (surfaced as tooltips in the admin Automations editor) ──────

export const TRIGGER_DESCRIPTIONS: Record<TriggerKey, string> = {
  "deal.created":       "Fires when a new deal is created — typically from Frost Law's POST to /api/webhook/referral.",
  "deal.stage_changed": "Fires whenever a deal's internal stage moves (e.g. new_lead → consultation_booked).",
  "deal.closed_won":    "Fires the moment a deal's stage flips to closedwon.",
  "deal.closed_lost":   "Fires the moment a deal's stage flips to closedlost.",
  "partner.created":    "Fires when a new partner account is created (reserved — call site not yet wired).",
  "partner.activated":  "Fires when a partner's partnership agreement is countersigned and the account flips to active.",
  "commission.created": "Fires when a CommissionLedger row is first written (reserved — call site not yet wired).",
  "commission.paid":    "Fires when a commission row is marked paid during payout batch processing.",
};

export const ACTION_DESCRIPTIONS: Record<ActionType, string> = {
  "webhook.post":        "POSTs a JSON payload of the trigger event to an external URL you specify.",
  "notification.create": "Creates an in-portal bell notification for an admin or a partner.",
  "deal.note":           "Appends a note to the deal referenced by the trigger payload.",
  "email.send":          "Sends a SendGrid email using one of the Email Templates, with variables interpolated.",
};

// ─── Variable reference (per-trigger available merge fields) ──────────────────
// These are the payload keys exposed to conditions + action configs when a
// workflow fires. Shape is derived from `fireWorkflowTrigger` call sites; keep
// in sync when new trigger call sites add fields to the payload.
//
// Tokens are shown in the admin UI as click-to-copy chips. The engine uses
// dot-notation for condition `field` paths (e.g. `deal.stage`) and `{path}` /
// `{{path}}` for string interpolation in action message + email bodies.

export interface TriggerVariable {
  token: string;       // exactly what gets inserted into an action field
  description: string; // one-liner the admin sees in the chip tooltip
  example?: string;    // sample rendered value
}

export const TRIGGER_VARIABLES: Record<TriggerKey, TriggerVariable[]> = {
  "deal.created": [
    { token: "{deal.dealName}",              description: "Deal name",                              example: "ACME Corp — Tariff Refund" },
    { token: "{deal.partnerCode}",           description: "Submitting partner's code",              example: "PTNJD8K3F" },
    { token: "{deal.clientName}",            description: "Client display name",                    example: "Jane Doe" },
    { token: "{deal.clientEmail}",           description: "Client email",                           example: "jane@acme.com" },
    { token: "{deal.stage}",                 description: "Internal stage",                         example: "new_lead" },
    { token: "{deal.estimatedRefundAmount}", description: "Estimated refund (number)",              example: "250000" },
    { token: "{deal.epLevel1}",              description: "Enterprise Partner's internal L1 code (from utm_medium)", example: "EA-ACME-042" },
  ],
  "deal.stage_changed": [
    { token: "{deal.dealName}",    description: "Deal name",                  example: "ACME Corp — Tariff Refund" },
    { token: "{deal.stage}",       description: "New internal stage (same as newStage)", example: "consultation_booked" },
    { token: "{previousStage}",    description: "Internal stage before the change",      example: "new_lead" },
    { token: "{newStage}",         description: "Internal stage after the change",       example: "consultation_booked" },
    { token: "{deal.partnerCode}", description: "Submitting partner's code",             example: "PTNJD8K3F" },
    { token: "{deal.clientName}",  description: "Client display name",                   example: "Jane Doe" },
  ],
  "deal.closed_won": [
    { token: "{deal.dealName}",              description: "Deal name",                 example: "ACME Corp — Tariff Refund" },
    { token: "{deal.partnerCode}",           description: "Submitting partner's code", example: "PTNJD8K3F" },
    { token: "{deal.firmFeeAmount}",         description: "Firm fee (number)",         example: "50000" },
    { token: "{deal.actualRefundAmount}",    description: "Actual refund received",    example: "250000" },
    { token: "{deal.l1CommissionAmount}",    description: "L1 commission (number)",    example: "12500" },
  ],
  "deal.closed_lost": [
    { token: "{deal.dealName}",         description: "Deal name",                 example: "ACME Corp — Tariff Refund" },
    { token: "{deal.partnerCode}",      description: "Submitting partner's code", example: "PTNJD8K3F" },
    { token: "{deal.closedLostReason}", description: "Reason the deal was lost",  example: "disqualified" },
  ],
  "partner.created": [
    { token: "{partner.partnerCode}", description: "Partner's code",      example: "PTNJD8K3F" },
    { token: "{partner.firstName}",   description: "First name",          example: "Jane" },
    { token: "{partner.lastName}",    description: "Last name",           example: "Doe" },
    { token: "{partner.email}",       description: "Email address",       example: "jane@firm.com" },
    { token: "{partner.tier}",        description: "Tier (l1 / l2 / l3)", example: "l1" },
  ],
  "partner.activated": [
    { token: "{partner.partnerCode}",    description: "Partner's code",     example: "PTNJD8K3F" },
    { token: "{partner.firstName}",      description: "First name",         example: "Jane" },
    { token: "{partner.lastName}",       description: "Last name",          example: "Doe" },
    { token: "{partner.email}",          description: "Email address",      example: "jane@firm.com" },
    { token: "{partner.commissionRate}", description: "Commission rate (decimal, e.g. 0.25 = 25%)", example: "0.25" },
  ],
  "commission.created": [
    { token: "{commission.partnerCode}", description: "Recipient partner code",       example: "PTNJD8K3F" },
    { token: "{commission.tier}",        description: "Tier (l1 / l2 / l3)",          example: "l1" },
    { token: "{commission.amount}",      description: "Commission amount (number)",   example: "12500" },
    { token: "{commission.dealName}",    description: "Source deal name",             example: "ACME Corp — Tariff Refund" },
  ],
  "commission.paid": [
    { token: "{batch.id}",         description: "Payout batch id",                    example: "cln12ab34" },
    { token: "{batch.createdAt}",  description: "Batch creation timestamp",           example: "2026-04-21T14:05:00Z" },
    { token: "{entries}",          description: "Array of paid entries (advanced — use in webhook.post JSON, not plain-text)", example: "[…]" },
  ],
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkflowCondition {
  field: string; // dot-notation path into payload, e.g. "deal.stage"
  op: "eq" | "neq" | "gt" | "lt" | "contains" | "exists";
  value?: unknown;
}

export interface WorkflowAction {
  type: ActionType;
  config: Record<string, unknown>;
}

// ─── Condition evaluation ─────────────────────────────────────────────────────

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, key) => {
    if (cur != null && typeof cur === "object") {
      return (cur as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function evaluateCondition(condition: WorkflowCondition, payload: Record<string, unknown>): boolean {
  const actual = getNestedValue(payload, condition.field);
  switch (condition.op) {
    case "eq":       return String(actual) === String(condition.value);
    case "neq":      return String(actual) !== String(condition.value);
    case "gt":       return Number(actual) > Number(condition.value);
    case "lt":       return Number(actual) < Number(condition.value);
    case "contains": return String(actual).toLowerCase().includes(String(condition.value).toLowerCase());
    case "exists":   return actual !== undefined && actual !== null && actual !== "";
    default:         return false;
  }
}

// ─── Action execution ─────────────────────────────────────────────────────────

interface ActionResult {
  type: ActionType;
  status: "success" | "failed" | "skipped";
  durationMs: number;
  error?: string;
}

async function executeAction(
  action: WorkflowAction,
  payload: Record<string, unknown>
): Promise<ActionResult> {
  const start = Date.now();
  const { type, config } = action;

  try {
    switch (type) {
      case "webhook.post": {
        const url = String(config.url || "");
        if (!url) throw new Error("webhook.post: url is required");

        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (config.headers && typeof config.headers === "object") {
          for (const [k, v] of Object.entries(config.headers as Record<string, string>)) {
            if (k) headers[k] = String(v);
          }
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        try {
          await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
        break;
      }

      case "notification.create": {
        const title = String(config.title || "Workflow Notification");
        const message = String(config.message || "");
        const recipientType = String(config.recipientType || "admin");

        // Resolve recipient — for partner events, use deal_partner or partner.partnerCode
        let recipientId = String(config.recipientId || "");
        if (!recipientId || recipientId === "deal_partner") {
          const deal = payload.deal as Record<string, unknown> | undefined;
          const partner = payload.partner as Record<string, unknown> | undefined;
          recipientId = String(deal?.partnerCode || partner?.partnerCode || "");
        }
        if (!recipientId) break; // skip if no recipient can be resolved

        await prisma.notification.create({
          data: {
            recipientType,
            recipientId,
            type: "workflow",
            title: interpolate(title, payload),
            message: interpolate(message, payload),
          },
        });
        break;
      }

      case "deal.note": {
        const deal = payload.deal as Record<string, unknown> | undefined;
        const dealId = String(deal?.id || config.dealId || "");
        if (!dealId) break;
        const content = interpolate(String(config.content || "Workflow note"), payload);
        await prisma.dealNote.create({
          data: {
            dealId,
            content,
            authorName: "Workflow Automation",
            authorEmail: "automation@fintella.partners",
          },
        });
        break;
      }

      case "email.send": {
        const templateKey = String(config.template || "");
        if (!templateKey) throw new Error("email.send: template key is required");

        // Look up the EmailTemplate from the DB
        const tpl = await prisma.emailTemplate.findUnique({ where: { key: templateKey } });
        if (!tpl || !tpl.enabled) throw new Error(`email.send: template "${templateKey}" not found or disabled`);

        const vars = flattenForTemplate(payload);
        const subject = renderVars(tpl.subject, vars);
        const bodyText = renderVars(tpl.bodyText, vars);
        const bodyHtml = renderVars(tpl.bodyHtml, vars);

        const toEmail = String(config.recipientEmail || "");
        if (!toEmail) throw new Error("email.send: recipientEmail is required");

        const { sendEmail } = await import("@/lib/sendgrid");
        await sendEmail({
          to: toEmail,
          subject,
          html: bodyHtml,
          text: bodyText,
          template: templateKey,
          fromEmail: tpl.fromEmail || undefined,
          fromName: tpl.fromName || undefined,
          replyTo: tpl.replyTo || undefined,
        });
        break;
      }

      default:
        return { type, status: "skipped", durationMs: Date.now() - start };
    }

    return { type, status: "success", durationMs: Date.now() - start };
  } catch (err: unknown) {
    return {
      type,
      status: "failed",
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Interpolation helpers ────────────────────────────────────────────────────

function interpolate(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{([^}]+)\}/g, (_, path) => {
    const val = getNestedValue(payload, path.trim());
    return val != null ? String(val) : "";
  });
}

function renderVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => vars[key.trim()] ?? "")
    .replace(/\{([^}]+)\}/g, (_, key) => vars[key.trim()] ?? "");
}

function flattenForTemplate(payload: Record<string, unknown>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload)) {
    const key = prefix ? `${prefix}_${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flattenForTemplate(v as Record<string, unknown>, key));
    } else {
      out[key] = v != null ? String(v) : "";
    }
  }
  return out;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Fire a workflow trigger. Call from any internal event point.
 * Always fire-and-forget — this function never rejects.
 *
 * @example
 * fireWorkflowTrigger("deal.created", { deal }).catch(() => {});
 */
export async function fireWorkflowTrigger(
  key: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const workflows = await prisma.workflow.findMany({
      where: { trigger: key, enabled: true },
    });

    for (const wf of workflows) {
      const triggerStart = Date.now();
      const actionsRun: ActionResult[] = [];
      let overallStatus: "success" | "failed" | "skipped" = "success";
      let overallError: string | undefined;

      try {
        // Evaluate triggerConfig — e.g. { stage: "closedwon" } for deal.stage_changed
        if (wf.triggerConfig && typeof wf.triggerConfig === "object") {
          for (const [field, expected] of Object.entries(wf.triggerConfig as Record<string, unknown>)) {
            const actual = getNestedValue(payload, field);
            if (String(actual) !== String(expected)) {
              overallStatus = "skipped";
              break;
            }
          }
        }

        if (overallStatus === "skipped") {
          // Don't log skipped workflows — too noisy
          continue;
        }

        // Evaluate conditions
        if (Array.isArray(wf.conditions)) {
          for (const cond of wf.conditions as unknown as WorkflowCondition[]) {
            if (!evaluateCondition(cond, payload)) {
              overallStatus = "skipped";
              break;
            }
          }
        }

        if (overallStatus === "skipped") {
          continue;
        }

        // Execute actions
        if (Array.isArray(wf.actions)) {
          for (const action of wf.actions as unknown as WorkflowAction[]) {
            const result = await executeAction(action, payload);
            actionsRun.push(result);
            if (result.status === "failed") {
              overallStatus = "failed";
              overallError = result.error;
            }
          }
        }
      } catch (err: unknown) {
        overallStatus = "failed";
        overallError = err instanceof Error ? err.message : String(err);
      }

      // Write log — trim payload to avoid storing huge objects
      const payloadSnapshot = JSON.parse(
        JSON.stringify(payload, (_k, v) =>
          typeof v === "string" && v.length > 500 ? v.slice(0, 500) + "…" : v
        )
      );

      prisma.workflowLog.create({
        data: {
          workflowId: wf.id,
          triggerKey: key,
          triggerData: payloadSnapshot,
          status: overallStatus,
          actionsRun: actionsRun.length ? (actionsRun as unknown as import("@prisma/client").Prisma.InputJsonValue) : undefined,
          error: overallError,
          durationMs: Date.now() - triggerStart,
        },
      }).catch((e) => console.error("[workflow-engine] log write failed:", e));
    }
  } catch (err) {
    console.error("[workflow-engine] fireWorkflowTrigger failed:", err);
  }
}

/**
 * Execute a WebhookSource's actions when it receives an incoming request.
 * Returns { actionsRun, overallStatus } for logging.
 */
export async function executeSourceActions(
  actions: WorkflowAction[],
  payload: Record<string, unknown>
): Promise<{ actionsRun: ActionResult[]; status: "success" | "failed" }> {
  const actionsRun: ActionResult[] = [];
  let status: "success" | "failed" = "success";
  for (const action of actions) {
    const result = await executeAction(action, payload);
    actionsRun.push(result);
    if (result.status === "failed") status = "failed";
  }
  return { actionsRun, status };
}
