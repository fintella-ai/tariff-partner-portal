import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listCalendars } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/google-calendar/status
 *
 * Returns { connected, connectedEmail, connectedAt, calendarId, calendars }
 * so /admin/settings can render the Google Calendar card state. Any
 * admin role can read.
 *
 * `calendars` is a best-effort list of the writable calendars on the
 * connected account — used to populate the "Which calendar?" dropdown.
 * Falls back to an empty array if the API call fails; the admin can
 * still hand-enter a calendar id.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await prisma.portalSettings.findUnique({ where: { id: "global" } });
  const connected = !!settings?.googleCalendarRefreshToken;

  let calendars: Array<{ id: string; summary: string; primary?: boolean }> = [];
  if (connected) {
    try {
      calendars = await listCalendars();
    } catch {
      // network flake / token revoked — leave empty and let the UI fall
      // back to the hand-entered calendar id.
    }
  }

  return NextResponse.json({
    connected,
    connectedEmail: settings?.googleCalendarConnectedEmail || null,
    connectedAt: settings?.googleCalendarConnectedAt || null,
    calendarId: settings?.googleCalendarCalendarId || "primary",
    calendars,
    oauthClientConfigured: !!(
      process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET
    ),
  });
}
