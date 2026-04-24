import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/heartbeat
 *
 * Bumps User.lastHeartbeatAt for the signed-in admin. Called on a 60-second
 * interval by AdminHeartbeatPinger from the admin layout. Downstream:
 * `isAdminOnline(lastHeartbeatAt)` uses a 2-minute freshness window to
 * decide whether Ollie can offer live-chat / live-phone transfers to that
 * admin. Phase 3c.4a of the PartnerOS AI roadmap (spec §5.3).
 *
 * No-op for partner sessions — heartbeat is admin-only. Returns 204 on
 * success so the client doesn't have to parse a body.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const email = session.user.email;
  const role = (session.user as any).role;
  // Skip silently for partner sessions — no admin row to update.
  if (!email || !role) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    // Update by email since that's the stable admin identity across session
    // refreshes. Only admins exist in the `user` table (partners live in
    // `partner`), so a plain update is safe.
    await prisma.user.updateMany({
      where: { email },
      data: { lastHeartbeatAt: new Date() },
    });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    // Never fail the ping loop noisily — heartbeat failures should not
    // take the admin UI down.
    console.error("[api/admin/heartbeat]", err);
    return new NextResponse(null, { status: 204 });
  }
}
