import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateCachedAccessToken } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/google-calendar/disconnect
 *
 * Clears the stored refresh token + connected email. Super admins only.
 *
 * Doesn't actually revoke Google's side — the admin can revoke at
 * https://myaccount.google.com/permissions if they want to fully
 * withdraw. This just makes Fintella stop using the token.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "super_admin") {
    return NextResponse.json(
      { error: "Only super admins can disconnect Google Calendar" },
      { status: 403 }
    );
  }

  await prisma.portalSettings.update({
    where: { id: "global" },
    data: {
      googleCalendarRefreshToken: "",
      googleCalendarConnectedEmail: "",
      googleCalendarConnectedAt: null,
    },
  });
  invalidateCachedAccessToken();
  return NextResponse.json({ disconnected: true });
}
