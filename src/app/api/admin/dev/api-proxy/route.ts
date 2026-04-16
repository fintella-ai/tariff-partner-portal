import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * POST /api/admin/dev/api-proxy
 *
 * Super admin only. Proxies an arbitrary HTTP request to a given URL,
 * forwarding caller-supplied headers and body, then returns the response.
 * Used by the Custom API Sender panel in the developer page to let admins
 * send test requests to external endpoints (e.g. Frost Law staging, our
 * own webhook) without CORS restrictions.
 *
 * Body: {
 *   url: string           — target URL (http:// or https://)
 *   method: string        — GET, POST, PATCH, PUT, DELETE
 *   headers: Record<string,string>  — forwarded verbatim
 *   body?: unknown        — serialised as JSON if present and method !== GET
 * }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role !== "super_admin")
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  let url: string;
  let method: string;
  let headers: Record<string, string>;
  let body: unknown;

  try {
    ({ url, method = "POST", headers = {}, body } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL — must be an absolute URL (e.g. https://example.com/path)" }, { status: 400 });
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return NextResponse.json({ error: "Only http:// and https:// URLs are supported" }, { status: 400 });
  }

  const allowedMethods = ["GET", "POST", "PATCH", "PUT", "DELETE"];
  const upperMethod = String(method).toUpperCase();
  if (!allowedMethods.includes(upperMethod)) {
    return NextResponse.json({ error: `Unsupported method "${method}". Allowed: ${allowedMethods.join(", ")}` }, { status: 400 });
  }

  // Block private/loopback ranges to prevent SSRF pivoting to internal services.
  // Even though this is super_admin only, defence-in-depth means we don't allow
  // the admin panel to reach 169.254.x (cloud metadata), 127.x (loopback), or
  // RFC-1918 private ranges.
  const hostname = parsedUrl.hostname.toLowerCase();
  const PRIVATE_PATTERNS = [
    /^localhost$/,
    /^127\./,
    /^0\.0\.0\.0$/,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,    // link-local / cloud metadata (AWS IMDS, GCP, Azure)
    /^::1$/,          // IPv6 loopback
    /^fc00:/,         // IPv6 ULA
    /^fe80:/,         // IPv6 link-local
  ];
  if (PRIVATE_PATTERNS.some((p) => p.test(hostname))) {
    return NextResponse.json(
      { error: "Requests to localhost and private IP ranges are not permitted" },
      { status: 400 }
    );
  }

  const start = Date.now();

  try {
    const reqHeaders = new Headers();
    // Merge caller headers. Content-Type defaults to JSON.
    if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type") && upperMethod !== "GET") {
      reqHeaders.set("Content-Type", "application/json");
    }
    for (const [k, v] of Object.entries(headers)) {
      if (k && v !== undefined) reqHeaders.set(k, String(v));
    }

    const fetchInit: RequestInit = {
      method: upperMethod,
      headers: reqHeaders,
    };
    if (upperMethod !== "GET" && body !== undefined) {
      fetchInit.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const res = await fetch(parsedUrl.toString(), fetchInit);
    const durationMs = Date.now() - start;

    const contentType = res.headers.get("content-type") || "";
    let responseBody: unknown;
    let rawText = "";
    try {
      rawText = await res.text();
      responseBody = contentType.includes("json") ? JSON.parse(rawText) : rawText;
    } catch {
      responseBody = rawText;
    }

    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { responseHeaders[k] = v; });

    return NextResponse.json({
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      headers: responseHeaders,
      body: responseBody,
      durationMs,
      url: parsedUrl.toString(),
      method: upperMethod,
    });
  } catch (err: any) {
    return NextResponse.json({
      status: 0,
      statusText: "Network error",
      ok: false,
      headers: {},
      body: { error: err?.message || "Request failed" },
      durationMs: Date.now() - start,
      url: parsedUrl.toString(),
      method: upperMethod,
    });
  }
}
