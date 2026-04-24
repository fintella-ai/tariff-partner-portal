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

  const params = req.nextUrl.searchParams;
  const unreadOnly = params.get("unread") === "true";
  const type = params.get("type") || "";
  // Clamp page-size so a malicious/misconfigured caller can't pull the
  // whole table. `all=1` still respects a hard ceiling.
  const limitRaw = parseInt(params.get("limit") || "20", 10);
  const limit = Math.max(1, Math.min(200, isNaN(limitRaw) ? 20 : limitRaw));
  const offsetRaw = parseInt(params.get("offset") || "0", 10);
  const offset = Math.max(0, isNaN(offsetRaw) ? 0 : offsetRaw);
  const fetchAll = params.get("all") === "1";

  try {
    const where: any = { recipientType, recipientId };
    if (unreadOnly) where.read = false;
    if (type) where.type = type;

    // All three queries run in parallel — total + unreadCount + typesList
    // are cheap (COUNT + GROUP BY) and needed by the page header.
    const [notifications, total, unreadCount, typesRows] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: fetchAll ? undefined : offset,
        take: fetchAll ? 500 : limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { recipientType, recipientId, read: false } }),
      prisma.notification.groupBy({
        by: ["type"],
        where: { recipientType, recipientId },
        _count: { type: true },
      }),
    ]);

    const types = typesRows
      .map((r) => ({ type: r.type, count: r._count.type }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ notifications, total, unreadCount, types });
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
