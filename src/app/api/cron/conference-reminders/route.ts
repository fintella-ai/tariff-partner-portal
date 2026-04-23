import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fireWorkflowTrigger } from "@/lib/workflow-engine";
import { buildJitsiUrl } from "@/lib/jitsi";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/conference-reminders
 *
 * Vercel cron target. Runs hourly. For each enabled workflow on the
 * `conference.call_reminder` trigger, finds every active
 * ConferenceSchedule row whose nextCall is within `hoursBeforeCall`
 * hours from now (and still in the future), and fires the trigger once
 * per active partner. Dedup'd per conference-row via
 * ConferenceSchedule.firedReminderWorkflows so an hourly cron doesn't
 * re-send the reminder every tick.
 *
 * Auth: same pattern as the other crons. If CRON_SECRET is set, require
 * Authorization: Bearer <secret>.
 */

const DEFAULT_HOURS_BEFORE = 24;

function callsWithinWindow(
  nowMs: number,
  nextCall: Date,
  hoursBeforeCall: number
): boolean {
  const callTime = nextCall.getTime();
  const windowStart = callTime - hoursBeforeCall * 60 * 60 * 1000;
  // "now is past the lead-in point AND the call itself hasn't happened"
  return nowMs >= windowStart && nowMs < callTime;
}

function formatCallTimeEastern(d: Date): string {
  try {
    return d.toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return d.toISOString();
  }
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
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL || "https://fintella.partners";
  const result = { workflows: 0, conferencesChecked: 0, fired: 0, partners: 0 };

  const workflows = await prisma.workflow.findMany({
    where: { trigger: "conference.call_reminder", enabled: true },
  });
  result.workflows = workflows.length;
  if (workflows.length === 0) {
    return NextResponse.json({ ok: true, ...result, finishedAt: new Date().toISOString(), note: "No active workflows" });
  }

  // Pre-load active partners (we email/SMS each). Active status mirrors
  // the existing filter used elsewhere — only partners who've completed
  // signup + agreement get reminders.
  const partners = await prisma.partner.findMany({
    where: { status: "active" },
    select: { partnerCode: true, firstName: true, lastName: true, email: true, mobilePhone: true },
  });
  if (partners.length === 0) {
    return NextResponse.json({ ok: true, ...result, finishedAt: new Date().toISOString(), note: "No active partners" });
  }

  const conferences = await prisma.conferenceSchedule.findMany({
    where: {
      isActive: true,
      nextCall: { gt: startedAt },
    },
  });
  result.conferencesChecked = conferences.length;

  for (const wf of workflows) {
    const cfg = wf.triggerConfig as Record<string, unknown> | null;
    const rawHours = cfg?.hoursBeforeCall;
    const hoursBeforeCall =
      typeof rawHours === "number" ? rawHours : typeof rawHours === "string" ? Number(rawHours) : NaN;
    const leadHours = Number.isFinite(hoursBeforeCall) && hoursBeforeCall > 0 ? hoursBeforeCall : DEFAULT_HOURS_BEFORE;

    for (const conf of conferences) {
      if (!conf.nextCall) continue;
      if (!callsWithinWindow(startedAt.getTime(), conf.nextCall, leadHours)) continue;

      // Dedup — have we already fired THIS workflow for THIS row?
      const fired = Array.isArray(conf.firedReminderWorkflows) ? (conf.firedReminderWorkflows as string[]) : [];
      if (fired.includes(wf.id)) continue;

      const joinUrl = conf.jitsiRoom ? buildJitsiUrl(conf.jitsiRoom) : conf.joinUrl || "";
      const conferencePayload = {
        id: conf.id,
        title: conf.title,
        hostName: conf.hostName ?? "",
        nextCall: conf.nextCall.toISOString(),
        nextCallLocal: formatCallTimeEastern(conf.nextCall),
        joinUrl,
        weekNumber: conf.weekNumber ?? null,
      };

      for (const p of partners) {
        await fireWorkflowTrigger("conference.call_reminder", {
          conference: conferencePayload,
          partner: {
            partnerCode: p.partnerCode,
            firstName: p.firstName,
            lastName: p.lastName,
            email: p.email,
            mobilePhone: p.mobilePhone ?? "",
          },
          hoursBeforeCall: leadHours,
          portalUrl,
        });
        result.partners += 1;
      }
      await prisma.conferenceSchedule.update({
        where: { id: conf.id },
        data: { firedReminderWorkflows: [...fired, wf.id] },
      });
      result.fired += 1;
    }
  }

  return NextResponse.json({ ok: true, ...result, finishedAt: new Date().toISOString() });
}
