import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listMessages, sendMessage, getUnreadCounts, GMAIL_ALIASES, diagnoseGmailAccess } from "@/lib/gmail";

const ALLOWED_ROLES = ["super_admin", "admin", "partner_support"];

/**
 * GET /api/admin/gmail
 * List Gmail messages with optional alias filter and pagination.
 * Query params: alias, q, maxResults, pageToken, unreadOnly, countOnly
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ALLOWED_ROLES.includes((session.user as any).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const alias = req.nextUrl.searchParams.get("alias") || "all";
  const q = req.nextUrl.searchParams.get("q") || "";
  const maxResults = parseInt(req.nextUrl.searchParams.get("maxResults") || "30", 10);
  const pageToken = req.nextUrl.searchParams.get("pageToken") || undefined;
  const unreadOnly = req.nextUrl.searchParams.get("unreadOnly") === "true";
  const countOnly = req.nextUrl.searchParams.get("countOnly") === "true";

  try {
    // Diagnostic: ?diagnose=true returns token info + Gmail API status
    const diagnose = req.nextUrl.searchParams.get("diagnose") === "true";
    if (diagnose) {
      const info = await diagnoseGmailAccess();
      return NextResponse.json(info);
    }

    if (countOnly) {
      const counts = await getUnreadCounts();
      return NextResponse.json({ counts });
    }

    const result = await listMessages({ alias, query: q, maxResults, pageToken, unreadOnly });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Gmail error", messages: [] }, { status: err.message?.includes("not connected") ? 400 : 502 });
  }
}

/**
 * POST /api/admin/gmail
 * Send or reply to an email via Gmail.
 * Body: { to, from?, subject, body, inReplyTo?, threadId? }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ALLOWED_ROLES.includes((session.user as any).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const { to, from, subject, body: messageBody, inReplyTo, threadId } = body;

    if (!to || !subject || !messageBody) {
      return NextResponse.json({ error: "to, subject, and body are required" }, { status: 400 });
    }

    // Validate from address is a known alias
    if (from) {
      const validEmails = GMAIL_ALIASES.filter((a) => a.email).map((a) => a.email);
      if (!validEmails.includes(from)) {
        return NextResponse.json({ error: `Invalid from address: ${from}` }, { status: 400 });
      }
    }

    const result = await sendMessage({ to, from, subject, body: messageBody, inReplyTo, threadId });
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Send failed" }, { status: 502 });
  }
}
