import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/dev/replay-webhook
 *
 * Super admin only. Replays a failed webhook request by ID.
 * Reads the stored body from WebhookRequestLog and re-submits it
 * to /api/webhook/referral internally (same process, no network hop).
 *
 * Body: { logId: string }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role !== "super_admin")
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const { logId } = await req.json();
  if (!logId) return NextResponse.json({ error: "logId required" }, { status: 400 });

  const log = await prisma.webhookRequestLog.findUnique({
    where: { id: logId },
    select: { id: true, body: true, method: true, path: true, headers: true },
  });

  if (!log) return NextResponse.json({ error: "Log entry not found" }, { status: 404 });
  if (!log.body) return NextResponse.json({ error: "No request body stored for this log entry" }, { status: 400 });

  const originalHeaders: Record<string, string> = {};
  try {
    const parsed = JSON.parse(log.headers || "{}");
    if (parsed["x-fintella-api-key"]) originalHeaders["x-fintella-api-key"] = parsed["x-fintella-api-key"];
    if (parsed["x-webhook-secret"]) originalHeaders["x-webhook-secret"] = parsed["x-webhook-secret"];
    if (parsed["authorization"]) originalHeaders["authorization"] = parsed["authorization"];
  } catch {}

  const baseUrl = req.nextUrl.origin;
  // Hardcoded to webhook/referral only — prevents SSRF via stored log.path
  const targetPath = "/api/webhook/referral";

  try {
    const res = await fetch(`${baseUrl}${targetPath}`, {
      method: log.method || "POST",
      headers: {
        "Content-Type": "application/json",
        ...originalHeaders,
      },
      body: log.body,
    });

    const resBody = await res.text();
    let parsed;
    try { parsed = JSON.parse(resBody); } catch { parsed = resBody; }

    return NextResponse.json({
      success: res.ok,
      status: res.status,
      body: parsed,
      replayedLogId: logId,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Replay failed: " + (e.message || "unknown error") }, { status: 500 });
  }
}
