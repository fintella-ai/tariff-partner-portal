import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/dev/cleanup-demo-conference
 *
 * Deletes ConferenceSchedule rows whose id matches the `cs-week-*` seed
 * pattern. These were seeded before FINTELLA_LIVE_MODE was flipped on
 * (2026-04-20); the seed script now skips re-upsert but existing rows
 * persist until something nukes them. Partners still see them in
 * /dashboard/conference under "Past Recordings".
 *
 * Super admin only. Returns { deleted } count. Idempotent — safe to
 * re-run; subsequent calls return { deleted: 0 }.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as any).role;
  if (role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await prisma.conferenceSchedule.deleteMany({
    where: { id: { startsWith: "cs-week-" } },
  });

  return NextResponse.json({ deleted: result.count });
}
