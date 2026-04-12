import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * POST /api/admin/dev/webhook-test
 *
 * Super admin only. Proxies a test call to the public referral webhook
 * (/api/webhook/referral) with the REFERRAL_WEBHOOK_SECRET injected
 * server-side, so admins can test the webhook end-to-end without ever
 * handling the shared secret client-side.
 *
 * Body: { method: "POST" | "PATCH" | "GET", payload?: any }
 * Returns: { status, body, url, headersSent }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "super_admin")
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  try {
    const { method = "POST", payload } = await req.json();

    if (!["POST", "PATCH", "GET"].includes(method)) {
      return NextResponse.json(
        { error: "Invalid method. Use POST, PATCH, or GET." },
        { status: 400 }
      );
    }

    const origin = req.nextUrl.origin;
    const webhookUrl = `${origin}/api/webhook/referral`;
    const secret = process.env.REFERRAL_WEBHOOK_SECRET;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (secret) {
      headers["x-webhook-secret"] = secret;
    }

    const init: RequestInit = {
      method,
      headers,
      cache: "no-store",
    };
    if (method !== "GET" && payload !== undefined) {
      init.body = JSON.stringify(payload);
    }

    const res = await fetch(webhookUrl, init);

    // Parse the response body — try JSON first, fall back to text
    let body: any;
    const contentType = res.headers.get("content-type") || "";
    try {
      if (contentType.includes("application/json")) {
        body = await res.json();
      } else {
        body = await res.text();
      }
    } catch {
      body = "(unable to parse response body)";
    }

    return NextResponse.json({
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      url: webhookUrl,
      method,
      body,
      secretInjected: !!secret,
    });
  } catch (err: any) {
    console.error("[webhook-test] error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to proxy webhook test request" },
      { status: 500 }
    );
  }
}
