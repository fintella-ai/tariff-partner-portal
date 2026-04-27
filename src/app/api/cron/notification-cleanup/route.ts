import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/notification-cleanup
 *
 * Vercel Cron target. Deletes read notifications older than 90 days.
 *
 * Auth — same pattern as /api/cron/reminders:
 *   - If CRON_SECRET is set, require `Authorization: Bearer <secret>`.
 *   - If unset, allow anyone (dev/demo mode).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization") || "";
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const { count } = await prisma.notification.deleteMany({
    where: {
      read: true,
      createdAt: { lt: cutoff },
    },
  });

  return NextResponse.json({ deleted: count });
}
