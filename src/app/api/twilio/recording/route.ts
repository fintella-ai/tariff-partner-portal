import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * GET /api/twilio/recording?url=<twilio-recording-url>
 * Proxies a Twilio recording through our server so admins can play
 * it without needing Twilio API credentials in the browser.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const recordingUrl = req.nextUrl.searchParams.get("url");
  if (!recordingUrl || !recordingUrl.includes("api.twilio.com")) {
    return NextResponse.json({ error: "Invalid recording URL" }, { status: 400 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return NextResponse.json({ error: "Twilio not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(recordingUrl, {
      headers: {
        Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Twilio returned ${res.status}` }, { status: 502 });
    }

    const contentType = res.headers.get("content-type") || "audio/wav";
    const body = await res.arrayBuffer();

    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err: any) {
    console.error("[recording-proxy] error:", err);
    return NextResponse.json({ error: "Failed to fetch recording" }, { status: 500 });
  }
}
