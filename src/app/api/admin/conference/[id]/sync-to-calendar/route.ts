import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCalendarEvent, updateCalendarEvent, googleCalendarConfigured } from "@/lib/google-calendar";
import { buildJitsiUrl } from "@/lib/jitsi";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/conference/[id]/sync-to-calendar
 *
 * Pushes (or refreshes) the ConferenceSchedule row onto the shared Google
 * Calendar configured via `GOOGLE_CALENDAR_ID`. Creates a new event on
 * first sync, patches the existing event on subsequent syncs. Demo-gated:
 * if service-account env vars aren't set, returns a mock success and
 * stores a `demo-event-*` id so the admin sees progress in dev.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const entry = await prisma.conferenceSchedule.findUnique({ where: { id: params.id } });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!entry.nextCall) return NextResponse.json({ error: "Cannot sync a call without a scheduled date" }, { status: 400 });

  // Default duration: 60 minutes. Admin can widen by editing the event in
  // Google after creation.
  const start = entry.nextCall;
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const joinUrl = entry.jitsiRoom ? buildJitsiUrl(entry.jitsiRoom) : entry.joinUrl || "";

  const input = {
    summary: entry.title,
    description: entry.description || `Fintella Live Weekly${entry.weekNumber ? ` — Week ${entry.weekNumber}` : ""}${entry.hostName ? ` · Host: ${entry.hostName}` : ""}`,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    joinUrl,
  };

  try {
    const result = entry.googleCalendarEventId
      ? await updateCalendarEvent(entry.googleCalendarEventId, input)
      : await createCalendarEvent(input);

    const updated = await prisma.conferenceSchedule.update({
      where: { id: entry.id },
      data: {
        googleCalendarEventId: result.id,
        googleCalendarHtmlLink: result.htmlLink ?? null,
      },
    });

    return NextResponse.json({
      entry: updated,
      demo: result.demo,
      configured: googleCalendarConfigured(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
