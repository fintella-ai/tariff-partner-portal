import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  POST as referralPOST,
  PATCH as referralPATCH,
  GET as referralGET,
} from "@/app/api/webhook/referral/route";

/**
 * POST /api/admin/dev/webhook-test
 *
 * Super admin only. Invokes the public referral webhook
 * (/api/webhook/referral) in-process with the REFERRAL_WEBHOOK_SECRET
 * injected server-side, so admins can test the webhook end-to-end
 * without ever handling the shared secret client-side.
 *
 * We call the target handler functions directly (not via fetch) so the
 * destination is a compile-time constant — no user-controllable URL,
 * no SSRF surface. The `url` field in the response is cosmetic only,
 * for display in the admin UI.
 *
 * Body: { method: "POST" | "PATCH" | "GET", payload?: any }
 * Returns: { status, body, url, method, secretInjected, ok }
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

    const secret = process.env.REFERRAL_WEBHOOK_SECRET;

    // Build a synthetic NextRequest pointing at the referral webhook.
    // The origin is taken from the incoming request (for display only);
    // the actual handler never sees it — we're invoking the function
    // directly below.
    const headers = new Headers({ "Content-Type": "application/json" });
    if (secret) {
      headers.set("x-webhook-secret", secret);
    }

    // Synthetic URL — hardcoded path, no user input in the destination.
    const syntheticUrl = new URL("/api/webhook/referral", req.nextUrl.origin);

    const requestBody: BodyInit | undefined =
      method !== "GET" && payload !== undefined ? JSON.stringify(payload) : undefined;

    const proxiedRequest = new NextRequest(syntheticUrl, {
      method,
      headers,
      body: requestBody,
    });

    // Dispatch to the referral webhook handler in-process. Because this
    // is a direct function call to a compile-time-known handler, there
    // is no network fetch and no way to redirect the call elsewhere.
    let res: Response;
    if (method === "POST") {
      res = await referralPOST(proxiedRequest);
    } else if (method === "PATCH") {
      res = await referralPATCH(proxiedRequest);
    } else {
      res = await referralGET();
    }

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
      url: "/api/webhook/referral",
      method,
      body,
      secretInjected: !!secret,
    });
  } catch (err: any) {
    console.error("[webhook-test] error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to dispatch webhook test request" },
      { status: 500 }
    );
  }
}
