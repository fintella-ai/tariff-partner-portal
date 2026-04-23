import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildJitsiSlug } from "@/lib/jitsi";

/**
 * GET /api/admin/conference
 * Returns all conference schedule entries (including inactive).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const entries = await prisma.conferenceSchedule.findMany({
      orderBy: { nextCall: "desc" },
    });

    // Backfill `jitsiRoom` for any row that predates the Jitsi-embed PR
    // (#416). Auto-generating on GET keeps the admin UI usable without
    // requiring a recreate. One update per stale row, guarded so rows
    // that already have a slug are untouched.
    const stale = entries.filter((e) => !e.jitsiRoom);
    if (stale.length > 0) {
      await Promise.all(
        stale.map((e) =>
          prisma.conferenceSchedule
            .update({
              where: { id: e.id },
              data: { jitsiRoom: buildJitsiSlug({ id: e.id, weekNumber: e.weekNumber }) },
            })
            .catch(() => null)
        )
      );
      const refreshed = await prisma.conferenceSchedule.findMany({
        orderBy: { nextCall: "desc" },
      });
      return NextResponse.json({ entries: refreshed });
    }

    return NextResponse.json({ entries });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch conference entries" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/conference
 * Create a new conference schedule entry.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const entry = await prisma.conferenceSchedule.create({
      data: {
        title: body.title,
        description: body.description || null,
        embedUrl: body.embedUrl || null,
        joinUrl: body.joinUrl || null,
        recordingUrl: body.recordingUrl || null,
        schedule: body.schedule || null,
        nextCall: body.nextCall ? new Date(body.nextCall) : null,
        hostName: body.hostName || null,
        duration: body.duration || null,
        weekNumber: body.weekNumber ? parseInt(body.weekNumber, 10) : null,
        notes: body.notes || null,
        isActive: body.isActive ?? true,
      },
    });
    // Auto-attach a Jitsi room slug now that we have the row's id. Admin
    // can override later if they want a specific vanity slug.
    const jitsiRoom = body.jitsiRoom || buildJitsiSlug({ id: entry.id, weekNumber: entry.weekNumber });
    const withRoom = await prisma.conferenceSchedule.update({
      where: { id: entry.id },
      data: { jitsiRoom },
    });
    return NextResponse.json({ entry: withRoom }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create conference entry" },
      { status: 500 }
    );
  }
}
