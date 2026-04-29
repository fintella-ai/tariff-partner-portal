import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTimezoneForState, nextTueThu9AM } from "@/lib/us-timezones";

const ADMIN_ROLES = ["super_admin", "admin"];

/**
 * POST /api/admin/leads/schedule-broker-emails
 * Schedules broker recruitment emails for optimal send times
 * (Tue/Thu 9 AM in the broker's local timezone based on their state).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes((session.user as any).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { leadIds } = await req.json();
  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return NextResponse.json({ error: "leadIds required" }, { status: 400 });
  }

  const leads = await prisma.partnerLead.findMany({
    where: { id: { in: leadIds }, status: "prospect", scheduledSendAt: null, emailSentAt: null },
  });

  let scheduled = 0;
  const sendTimes: Record<string, number> = {};

  for (const lead of leads) {
    const stateMatch = (lead.notes || "").match(/Location:.*,\s*(\w{2})/);
    const state = stateMatch?.[1] || "NY";
    const tz = getTimezoneForState(state);
    const sendAt = nextTueThu9AM(tz);

    await prisma.partnerLead.update({
      where: { id: lead.id },
      data: { scheduledSendAt: sendAt },
    });

    const dayKey = sendAt.toISOString().split("T")[0];
    sendTimes[dayKey] = (sendTimes[dayKey] || 0) + 1;
    scheduled++;
  }

  return NextResponse.json({
    scheduled,
    skipped: leadIds.length - scheduled,
    sendTimes,
  });
}
