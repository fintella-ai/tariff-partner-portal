import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/presence
 *
 * Returns all admin-role users with their online/offline status based on
 * heartbeat freshness (2-minute window). Used by the AdminPresenceBar
 * component so admins can see who else is online.
 *
 * Accessible to any authenticated admin role.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);

  const admins = await prisma.user.findMany({
    where: {
      role: { in: ["super_admin", "admin", "accounting", "partner_support"] },
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      lastHeartbeatAt: true,
      availableForLiveChat: true,
      availableForLiveCall: true,
    },
  });

  const result = admins.map((a) => ({
    id: a.id,
    name: a.name || a.email,
    role: a.role,
    online: !!a.lastHeartbeatAt && a.lastHeartbeatAt >= twoMinAgo,
    availableForChat: a.availableForLiveChat,
    availableForCall: a.availableForLiveCall,
  }));

  return NextResponse.json({ admins: result });
}
