import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * GET /api/admin/dev/errors
 * Fetches recent errors/issues from Sentry API for the /admin/dev page.
 * Super admin only. Requires SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT.
 * Returns empty list gracefully if Sentry is not configured.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "super_admin")
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const authToken = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;

  // Graceful fallback — no creds = empty list
  if (!authToken || !org || !project) {
    return NextResponse.json({
      issues: [],
      configured: false,
      message: "Sentry not configured. Set SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT in Vercel env vars.",
    });
  }

  try {
    // Sentry API: list unresolved issues from the last 24h. Uses the
    // organization-level issues endpoint with a `project` filter — the
    // older project-scoped endpoint works but is less reliably documented,
    // and the org-level one gives us the modern auth-token scopes Sentry
    // now provisions by default.
    const params = new URLSearchParams({
      query: "is:unresolved age:-24h",
      sort: "freq",
      limit: "20",
      project: project,
    });
    const url = `https://sentry.io/api/0/organizations/${org}/issues/?${params.toString()}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      // Surface the actual Sentry error body so the admin can diagnose
      // (missing scope, wrong slug, expired token, etc.) instead of the
      // opaque "Sentry API returned 401" message. Truncate aggressively —
      // some Sentry 4xx responses include large JSON payloads.
      const bodyText = await res.text().catch(() => "");
      const detail = bodyText.length > 400 ? bodyText.slice(0, 400) + "…" : bodyText;
      return NextResponse.json({
        issues: [],
        configured: true,
        error: `Sentry API returned ${res.status}${detail ? `: ${detail}` : ""}`,
        hint: res.status === 401
          ? "Token is invalid or expired. Generate a new internal integration token in Sentry with `event:read` + `project:read` scopes and update SENTRY_AUTH_TOKEN on Vercel."
          : res.status === 403
            ? "Token is valid but missing scopes. Needs `event:read` + `project:read`."
            : res.status === 404
              ? `Org "${org}" or project "${project}" not found. Check SENTRY_ORG and SENTRY_PROJECT match the slugs in your Sentry URL.`
              : undefined,
      });
    }

    const data = await res.json();
    const issues = Array.isArray(data)
      ? data.map((issue: any) => ({
          id: issue.id,
          title: issue.title || issue.metadata?.title || "Untitled error",
          culprit: issue.culprit || "",
          level: issue.level || "error",
          count: parseInt(issue.count || "0", 10),
          userCount: issue.userCount || 0,
          firstSeen: issue.firstSeen,
          lastSeen: issue.lastSeen,
          permalink: issue.permalink,
          status: issue.status,
        }))
      : [];

    return NextResponse.json({
      issues,
      configured: true,
      total: issues.length,
    });
  } catch (err: any) {
    console.error("[api/admin/dev/errors] error:", err);
    return NextResponse.json({
      issues: [],
      configured: true,
      error: err?.message || "Failed to fetch Sentry errors",
    });
  }
}
