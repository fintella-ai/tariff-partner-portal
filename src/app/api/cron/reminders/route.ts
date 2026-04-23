import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fireWorkflowTrigger } from "@/lib/workflow-engine";

// Force dynamic rendering — the route queries Prisma at request time, so
// static pre-rendering at build would hit `DATABASE_URL not found` in
// environments that build without that var set.
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/reminders
 *
 * Vercel Cron target. Fires once daily (configured in vercel.json).
 * Scans for two reminder-eligible row sets and fires the matching
 * workflow trigger for each row whose cadence is up:
 *
 *   • partner.agreement_reminder — PartnershipAgreement rows that have
 *     been sent but NOT signed, where the last reminder (or, if never,
 *     the original sentDate) is at least `cadenceDays` old.
 *
 *   • partner.invite_reminder — RecruitmentInvite rows that are still
 *     `active` and have never been `usedByPartnerCode`, where the last
 *     reminder (or, if never, the original createdAt) is at least
 *     `cadenceDays` old. Filtered to admin L1 invites (inviterCode =
 *     null) because those are the only invites that carry an
 *     `invitedEmail` for the reminder email to land on.
 *
 * Cadence:
 *   - Pulled per trigger from the enabled workflows' triggerConfig.cadenceDays.
 *   - If multiple workflows target the same trigger, the MINIMUM cadence
 *     wins (so a 1-day workflow will pull a 14-day workflow along with
 *     it — the admin should split trigger configs if that isn't desired).
 *   - Default 7 when triggerConfig.cadenceDays is not set.
 *
 * Auth — matches the monthly-newsletter cron:
 *   - If CRON_SECRET is set, require `Authorization: Bearer <secret>`.
 *   - If unset, allow anyone (dev/demo mode).
 */

const DEFAULT_CADENCE_DAYS = 7;

function cutoffFor(cadenceDays: number): Date {
  return new Date(Date.now() - cadenceDays * 24 * 60 * 60 * 1000);
}

function minCadence(
  workflows: Array<{ triggerConfig: unknown }>
): number {
  let min = Number.POSITIVE_INFINITY;
  for (const wf of workflows) {
    const cfg = wf.triggerConfig as Record<string, unknown> | null;
    const raw = cfg?.cadenceDays;
    const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    const parsed = Number.isFinite(n) && n > 0 ? n : DEFAULT_CADENCE_DAYS;
    if (parsed < min) min = parsed;
  }
  return Number.isFinite(min) ? min : DEFAULT_CADENCE_DAYS;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization") || "";
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const startedAt = new Date();
  const portalUrl = (process.env.NEXT_PUBLIC_PORTAL_URL || "https://fintella.partners").trim().replace(/\/$/, "");
  const result = {
    startedAt: startedAt.toISOString(),
    agreementReminders: { workflows: 0, cadenceDays: 0, fired: 0, skipped: 0 },
    inviteReminders: { workflows: 0, cadenceDays: 0, fired: 0, skipped: 0 },
  };

  // ─── Agreement reminders ───────────────────────────────────────────
  const agreementWfs = await prisma.workflow.findMany({
    where: { trigger: "partner.agreement_reminder", enabled: true },
  });
  result.agreementReminders.workflows = agreementWfs.length;
  if (agreementWfs.length > 0) {
    const cadenceDays = minCadence(agreementWfs);
    const cutoff = cutoffFor(cadenceDays);
    result.agreementReminders.cadenceDays = cadenceDays;

    const agreements = await prisma.partnershipAgreement.findMany({
      where: {
        status: "pending",
        signedDate: null,
        sentDate: { not: null, lte: cutoff },
        OR: [
          { lastReminderSentAt: null },
          { lastReminderSentAt: { lte: cutoff } },
        ],
      },
    });

    if (agreements.length > 0) {
      const partnerCodes = Array.from(new Set(agreements.map((a) => a.partnerCode)));
      const partners = await prisma.partner.findMany({
        where: { partnerCode: { in: partnerCodes } },
      });
      const partnerMap: Record<string, typeof partners[number]> = {};
      for (const p of partners) partnerMap[p.partnerCode] = p;

      for (const a of agreements) {
        const partner = partnerMap[a.partnerCode];
        if (!partner) {
          result.agreementReminders.skipped += 1;
          continue;
        }
        await fireWorkflowTrigger("partner.agreement_reminder", {
          partner: {
            partnerCode: partner.partnerCode,
            firstName: partner.firstName,
            lastName: partner.lastName,
            email: partner.email,
            mobilePhone: partner.mobilePhone ?? "",
          },
          agreement: {
            id: a.id,
            signingUrl: a.embeddedSigningUrl ?? "",
            sentDate: a.sentDate?.toISOString() ?? "",
            templateRate: a.templateRate ?? null,
          },
          daysSinceSent: a.sentDate ? daysBetween(a.sentDate, startedAt) : null,
          portalUrl,
        });
        await prisma.partnershipAgreement.update({
          where: { id: a.id },
          data: { lastReminderSentAt: startedAt },
        });
        result.agreementReminders.fired += 1;
      }
    }
  }

  // ─── Invite reminders ──────────────────────────────────────────────
  const inviteWfs = await prisma.workflow.findMany({
    where: { trigger: "partner.invite_reminder", enabled: true },
  });
  result.inviteReminders.workflows = inviteWfs.length;
  if (inviteWfs.length > 0) {
    const cadenceDays = minCadence(inviteWfs);
    const cutoff = cutoffFor(cadenceDays);
    result.inviteReminders.cadenceDays = cadenceDays;

    const invites = await prisma.recruitmentInvite.findMany({
      where: {
        status: "active",
        usedByPartnerCode: null,
        // L1 admin invites carry an email. Partner-generated L2/L3 invites
        // don't (the upline shares the link however they want), so there's
        // no address for a reminder to land on. Skip those.
        inviterCode: null,
        invitedEmail: { not: null },
        createdAt: { lte: cutoff },
        OR: [
          { lastReminderSentAt: null },
          { lastReminderSentAt: { lte: cutoff } },
        ],
      },
    });

    for (const inv of invites) {
      await fireWorkflowTrigger("partner.invite_reminder", {
        invite: {
          token: inv.token,
          signupUrl: `${portalUrl}/signup?token=${inv.token}`,
          invitedEmail: inv.invitedEmail ?? "",
          invitedName: inv.invitedName ?? "",
          targetTier: inv.targetTier,
          commissionRate: inv.commissionRate,
        },
        daysSinceInvited: daysBetween(inv.createdAt, startedAt),
        portalUrl,
      });
      await prisma.recruitmentInvite.update({
        where: { id: inv.id },
        data: { lastReminderSentAt: startedAt },
      });
      result.inviteReminders.fired += 1;
    }
  }

  return NextResponse.json({ ok: true, ...result, finishedAt: new Date().toISOString() });
}
