import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Admin Inbox management API (PartnerOS AI Phase 3c.3a — spec §7).
 *
 * Four AdminInbox rows (support / legal / admin / accounting) were seeded
 * by scripts/seed-all.js in Phase 3c.1 (PR #544). This endpoint lets an
 * admin assign which User accounts each inbox notifies, toggle
 * scheduled-call acceptance, and edit the work-hours JSON blob.
 *
 * Read-only fields exposed per spec:
 *   role, emailAddress, displayName, categories (seeded, immutable here)
 *
 * Writable fields:
 *   assignedAdminIds[], acceptScheduledCalls, workHours, timeZone,
 *   callDurationMinutes, callTitleTemplate
 *
 * Google Calendar refresh token is NOT writable here — that lives on the
 * OAuth callback in Phase 3c.4+.
 *
 * Gate: super_admin + admin per CLAUDE.md admin role matrix (most admin
 * GETs are all-admin-roles; this mutation gate matches the Portal
 * Settings policy since inbox config affects portal-wide routing).
 */

export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const inboxes = await prisma.adminInbox.findMany({
      orderBy: { role: "asc" },
      select: {
        id: true,
        role: true,
        emailAddress: true,
        displayName: true,
        categories: true,
        assignedAdminIds: true,
        acceptScheduledCalls: true,
        workHours: true,
        timeZone: true,
        callDurationMinutes: true,
        callTitleTemplate: true,
        googleCalendarConnectedAt: true,
        updatedAt: true,
      },
    });

    // Resolve assignedAdminIds → User records so the UI can render a
    // labeled chip list without an extra round-trip.
    const allAdminIds = Array.from(
      new Set(inboxes.flatMap((i) => i.assignedAdminIds))
    );
    const admins = allAdminIds.length
      ? await prisma.user.findMany({
          where: { id: { in: allAdminIds } },
          select: { id: true, email: true, name: true, role: true },
        })
      : [];
    const adminById = new Map(admins.map((a) => [a.id, a]));

    const withResolvedAdmins = inboxes.map((i) => ({
      ...i,
      assignedAdmins: i.assignedAdminIds
        .map((id) => adminById.get(id))
        .filter(Boolean),
    }));

    return NextResponse.json({ inboxes: withResolvedAdmins });
  } catch (err) {
    console.error("[api/admin/inboxes] GET failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch inboxes" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role))
    return NextResponse.json(
      { error: "Only super_admin / admin can edit inbox configuration" },
      { status: 403 }
    );

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof body?.id === "string" ? body.id : "";
  if (!id)
    return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Allow-list writable fields. Everything else is ignored.
  const data: Record<string, unknown> = {};
  if (Array.isArray(body.assignedAdminIds)) {
    // Validate every ID is a string + corresponds to a real User. We don't
    // want Ollie's notification fan-out referencing a deleted user.
    const ids = body.assignedAdminIds.filter(
      (x: unknown) => typeof x === "string" && x.length > 0
    );
    if (ids.length > 0) {
      const found = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      const foundSet = new Set(found.map((u) => u.id));
      const missing = ids.filter((x: string) => !foundSet.has(x));
      if (missing.length > 0) {
        return NextResponse.json(
          { error: `Unknown admin user id(s): ${missing.join(", ")}` },
          { status: 400 }
        );
      }
    }
    data.assignedAdminIds = ids;
  }
  if (typeof body.acceptScheduledCalls === "boolean") {
    data.acceptScheduledCalls = body.acceptScheduledCalls;
  }
  if (typeof body.timeZone === "string") {
    data.timeZone = body.timeZone.slice(0, 64);
  }
  if (typeof body.callDurationMinutes === "number") {
    data.callDurationMinutes = Math.max(
      5,
      Math.min(120, Math.floor(body.callDurationMinutes))
    );
  }
  if (typeof body.callTitleTemplate === "string") {
    data.callTitleTemplate = body.callTitleTemplate.slice(0, 200);
  }
  if (
    body.workHours !== undefined &&
    (body.workHours === null || typeof body.workHours === "object")
  ) {
    data.workHours = body.workHours;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "No writable fields supplied" },
      { status: 400 }
    );
  }

  try {
    const updated = await prisma.adminInbox.update({
      where: { id },
      data,
      select: {
        id: true,
        role: true,
        assignedAdminIds: true,
        acceptScheduledCalls: true,
        timeZone: true,
        callDurationMinutes: true,
        callTitleTemplate: true,
        workHours: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ inbox: updated });
  } catch (err: any) {
    console.error("[api/admin/inboxes] PUT failed:", err?.message || err);
    return NextResponse.json(
      { error: "Failed to update inbox" },
      { status: 500 }
    );
  }
}
