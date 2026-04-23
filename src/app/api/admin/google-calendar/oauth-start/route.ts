import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildAuthorizationUrl } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/google-calendar/oauth-start
 *
 * Kicks off the Google OAuth 2.0 consent flow. Only super_admin can
 * initiate — tokens end up stored on PortalSettings (singleton) so any
 * admin action on /admin/conference uses this connection.
 *
 * Redirects the browser straight to Google's authorization URL; the
 * callback at /api/admin/google-calendar/oauth-callback handles the
 * post-consent code exchange.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "super_admin") {
    return NextResponse.json(
      { error: "Only super admins can connect Google Calendar" },
      { status: 403 }
    );
  }

  if (!process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Google OAuth client credentials not configured. Set GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET on Vercel." },
      { status: 500 }
    );
  }

  // No real CSRF state required — we bind the state to the admin's
  // email for sanity checking on callback. NextAuth's session cookie is
  // already in play, so a rogue callback without a valid admin session
  // is rejected there anyway.
  const state = encodeURIComponent(session.user.email || "unknown");
  return NextResponse.redirect(buildAuthorizationUrl(state));
}
