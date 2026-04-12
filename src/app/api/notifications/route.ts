import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/notifications
 * Returns notifications for the current user (partner or admin).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  const partnerCode = (session.user as any).partnerCode;

  const recipientType = role === "partner" ? "partner" : "admin";
  const recipientId = role === "partner" ? partnerCode : session.user.email || "";

  const unreadOnly = req.nextUrl.searchParams.get("unread") === "true";

  try {
    const where: any = { recipientType, recipientId };
    if (unreadOnly) where.read = false;

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const unreadCount = await prisma.notification.count({
      where: { recipientType, recipientId, read: false },
    });

    return NextResponse.json({ notifications, unreadCount });
  } catch (e) {
    console.error("Notifications API error:", e);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

/**
 * PATCH /api/notifications
 * Mark notifications as read.
 */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  const partnerCode = (session.user as any).partnerCode;
  const recipientType = role === "partner" ? "partner" : "admin";
  const recipientId = role === "partner" ? partnerCode : session.user.email || "";

  try {
    const body = await req.json();

    if (body.markAllRead) {
      await prisma.notification.updateMany({
        where: { recipientType, recipientId, read: false },
        data: { read: true },
      });
      return NextResponse.json({ success: true });
    }

    if (body.id) {
      await prisma.notification.update({
        where: { id: body.id },
        data: { read: true },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (e) {
    console.error("Notifications PATCH error:", e);
    return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 });
  }
}
