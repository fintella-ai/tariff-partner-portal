import { prisma } from "@/lib/prisma";

export type AuditAction =
  | "sign_in"
  | "sign_out"
  | "deal.create"
  | "deal.update"
  | "deal.delete"
  | "deal.payment_received"
  | "partner.create"
  | "partner.update"
  | "partner.activate"
  | "partner.block"
  | "settings.update"
  | "workflow.create"
  | "workflow.update"
  | "workflow.delete"
  | "payout.batch_create"
  | "payout.batch_process"
  | "admin.impersonate"
  | "import.deals"
  | "export.deals"
  | "ai_permissions.update"
  | "ai_permissions.reset";

interface AuditEntry {
  action: AuditAction | string;
  actorEmail: string;
  actorRole: string;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        actorEmail: entry.actorEmail,
        actorRole: entry.actorRole,
        actorId: entry.actorId || null,
        targetType: entry.targetType || null,
        targetId: entry.targetId || null,
        details: entry.details ? JSON.stringify(entry.details) : null,
        ipAddress: entry.ipAddress || null,
        userAgent: entry.userAgent || null,
      },
    });
  } catch (e) {
    console.error("[audit-log] write failed:", e);
  }
}

export function diffFields(
  before: Record<string, any>,
  after: Record<string, any>,
  fields: string[]
): Record<string, { old: any; new: any }> | null {
  const changes: Record<string, { old: any; new: any }> = {};
  for (const field of fields) {
    const oldVal = before[field];
    const newVal = after[field];
    if (oldVal !== newVal && !(oldVal == null && newVal == null)) {
      changes[field] = { old: oldVal ?? null, new: newVal ?? null };
    }
  }
  return Object.keys(changes).length > 0 ? changes : null;
}
