import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/**
 * GET /api/cron/calendar-health
 *
 * Hourly check: for each AdminInbox with a Google Calendar refresh token,
 * attempt a token refresh. If it fails (revoked, expired, scope changed),
 * fire a notification to all super_admin + admin users so someone
 * re-connects before scheduling breaks silently.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization") || "";
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) {
    return NextResponse.json({ ok: true, note: "Google OAuth not configured", checked: 0 });
  }

  const inboxes = await prisma.adminInbox.findMany({
    where: { googleCalendarRefreshToken: { not: null } },
    select: { id: true, role: true, displayName: true, googleCalendarRefreshToken: true },
  });

  if (inboxes.length === 0) {
    return NextResponse.json({ ok: true, note: "No inboxes have calendars connected", checked: 0 });
  }

  const result = { checked: inboxes.length, healthy: 0, disconnected: [] as string[] };

  for (const inbox of inboxes) {
    try {
      const res = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: inbox.googleCalendarRefreshToken!,
          grant_type: "refresh_token",
        }),
      });

      if (res.ok) {
        result.healthy++;
      } else {
        result.disconnected.push(inbox.displayName);

        const existing = await prisma.notification.findFirst({
          where: {
            recipientType: "admin",
            type: "system",
            title: { contains: inbox.displayName },
            message: { contains: "calendar disconnected" },
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        });
        if (existing) continue;

        const admins = await prisma.user.findMany({
          where: { role: { in: ["super_admin", "admin"] } },
          select: { email: true },
        });

        for (const admin of admins) {
          await prisma.notification.create({
            data: {
              recipientType: "admin",
              recipientId: admin.email,
              type: "system",
              title: `⚠️ ${inbox.displayName} calendar disconnected`,
              message: `The Google Calendar for the ${inbox.displayName} inbox has been disconnected or the token was revoked. Scheduling and booking will not work until re-connected. Go to Settings → Integrations to re-connect.`,
              link: "/admin/settings",
            },
          }).catch(() => {});
        }
      }
    } catch {
      result.disconnected.push(inbox.displayName);
    }
  }

  return NextResponse.json({ ok: true, ...result, finishedAt: new Date().toISOString() });
}
