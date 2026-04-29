import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_ROLES = ["super_admin", "admin"];
const OUTREACH_EMAIL = "outreach@fintella.partners";

/**
 * GET /api/admin/leads/outreach-replies
 * Fetches replies to outreach@fintella.partners from Gmail API,
 * matches sender to PartnerLead by email, returns reply data.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes((session.user as any).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const settings = await prisma.portalSettings.findUnique({ where: { id: "global" } });
  const refreshToken = settings?.googleCalendarRefreshToken;
  if (!refreshToken) {
    return NextResponse.json({ error: "Google not connected. Reconnect in Settings → Integrations.", replies: {} });
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";

  try {
    // Refresh access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!tokenRes.ok) {
      return NextResponse.json({ error: "Token refresh failed. Reconnect Google in Settings.", replies: {} });
    }
    const { access_token } = (await tokenRes.json()) as { access_token: string };

    // Search Gmail for emails TO outreach@fintella.partners (replies from brokers)
    const query = encodeURIComponent(`to:${OUTREACH_EMAIL} -from:${OUTREACH_EMAIL} newer_than:30d`);
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=200`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    if (listRes.status === 403) {
      return NextResponse.json({ error: "Gmail scope not granted. Reconnect Google in Settings → Integrations to add Gmail permission.", replies: {} });
    }
    if (!listRes.ok) {
      return NextResponse.json({ error: "Gmail API error", replies: {} });
    }

    const listData = await listRes.json();
    const messageIds: string[] = (listData.messages || []).map((m: any) => m.id);

    if (messageIds.length === 0) {
      return NextResponse.json({ replies: {} });
    }

    // Fetch message headers in batch (up to 50 to stay fast)
    const replies: Record<string, { from: string; subject: string; snippet: string; date: string }> = {};
    const batch = messageIds.slice(0, 50);

    for (const msgId of batch) {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${access_token}` } }
      );
      if (!msgRes.ok) continue;
      const msg = await msgRes.json();

      const headers = msg.payload?.headers || [];
      const from = headers.find((h: any) => h.name === "From")?.value || "";
      const subject = headers.find((h: any) => h.name === "Subject")?.value || "";
      const date = headers.find((h: any) => h.name === "Date")?.value || "";
      const snippet = msg.snippet || "";

      // Extract email from "Name <email>" format
      const emailMatch = from.match(/<([^>]+)>/) || [null, from];
      const senderEmail = (emailMatch[1] || from).trim().toLowerCase();

      if (senderEmail && !replies[senderEmail]) {
        replies[senderEmail] = { from, subject, snippet, date };
      }
    }

    return NextResponse.json({ replies, total: messageIds.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch replies", replies: {} });
  }
}
