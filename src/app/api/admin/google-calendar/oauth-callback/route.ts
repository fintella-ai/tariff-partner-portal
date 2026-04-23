import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { exchangeCodeForTokens, invalidateCachedAccessToken } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/google-calendar/oauth-callback?code=...
 *
 * Google redirects the browser here after the admin consents. We
 * exchange the authorization code for a refresh token + access token,
 * persist the refresh token + connected email on PortalSettings, then
 * send the admin back to /admin/settings with a success query param.
 *
 * Errors (user-cancelled, missing code, exchange failure) redirect
 * back with `?google_calendar=error&reason=...` so the settings page
 * can surface a friendly message.
 */
export async function GET(req: NextRequest) {
  const base = (process.env.NEXT_PUBLIC_PORTAL_URL || new URL(req.url).origin).trim();
  const settingsUrl = `${base.replace(/\/$/, "")}/admin/settings`;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(`${settingsUrl}?google_calendar=error&reason=unauthorized`);
  }
  const role = (session.user as any).role;
  if (role !== "super_admin") {
    return NextResponse.redirect(`${settingsUrl}?google_calendar=error&reason=forbidden`);
  }

  const code = req.nextUrl.searchParams.get("code");
  const err = req.nextUrl.searchParams.get("error");
  if (err) {
    return NextResponse.redirect(`${settingsUrl}?google_calendar=error&reason=${encodeURIComponent(err)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${settingsUrl}?google_calendar=error&reason=no_code`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await prisma.portalSettings.upsert({
      where: { id: "global" },
      update: {
        googleCalendarRefreshToken: tokens.refreshToken,
        googleCalendarConnectedEmail: tokens.email || "",
        googleCalendarConnectedAt: new Date(),
      },
      create: {
        id: "global",
        googleCalendarRefreshToken: tokens.refreshToken,
        googleCalendarConnectedEmail: tokens.email || "",
        googleCalendarConnectedAt: new Date(),
      },
    });
    // Next API call will mint a fresh access token from the new refresh
    // token — clear any leftover cache in case a previous disconnected
    // session left something behind.
    invalidateCachedAccessToken();
    return NextResponse.redirect(`${settingsUrl}?google_calendar=connected`);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[google-calendar oauth-callback]", message);
    return NextResponse.redirect(
      `${settingsUrl}?google_calendar=error&reason=${encodeURIComponent(message)}`
    );
  }
}
