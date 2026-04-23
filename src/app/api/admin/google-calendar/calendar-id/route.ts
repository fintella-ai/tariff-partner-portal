import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/google-calendar/calendar-id
 *
 * Sets PortalSettings.googleCalendarCalendarId — which calendar on the
 * connected account future event syncs land on. Super admins only.
 * Body: { calendarId: string }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "super_admin") {
    return NextResponse.json(
      { error: "Only super admins can change the target calendar" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const calendarId = typeof body.calendarId === "string" && body.calendarId.trim()
    ? body.calendarId.trim()
    : "primary";

  await prisma.portalSettings.update({
    where: { id: "global" },
    data: { googleCalendarCalendarId: calendarId },
  });
  return NextResponse.json({ calendarId });
}
