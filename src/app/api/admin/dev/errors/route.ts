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
    // Sentry API: list unresolved issues from the last 24h, sorted by last-seen
    const url = `https://sentry.io/api/0/projects/${org}/${project}/issues/?query=is:unresolved+age:-24h&sort=freq&limit=20`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({
        issues: [],
        configured: true,
        error: `Sentry API returned ${res.status}`,
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
