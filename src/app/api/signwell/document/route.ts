import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * GET /api/signwell/document?url=<signwell-pdf-url>
 * Proxies a SignWell document PDF through our server so admins/partners
 * can view/download without needing SignWell API credentials.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pdfUrl = req.nextUrl.searchParams.get("url");
  if (!pdfUrl || !pdfUrl.includes("signwell.com")) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const apiKey = process.env.SIGNWELL_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "SignWell not configured" }, { status: 500 });

  try {
    const res = await fetch(pdfUrl, {
      headers: { "X-Api-Key": apiKey },
    });

    if (!res.ok) return NextResponse.json({ error: `SignWell returned ${res.status}` }, { status: 502 });

    const contentType = res.headers.get("content-type") || "application/pdf";
    const body = await res.arrayBuffer();

    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch document" }, { status: 500 });
  }
}
