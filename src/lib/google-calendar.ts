import { prisma } from "@/lib/prisma";

/**
 * Google Calendar client — OAuth 2.0 user flow (was service account +
 * JWT before PR #XYZ, but John's Google Workspace blocks service account
 * key creation via the `iam.disableServiceAccountKeyCreation` org policy
 * so we pivoted).
 *
 * Credentials stored on PortalSettings (singleton):
 *   googleCalendarRefreshToken    — long-lived, obtained once via OAuth
 *   googleCalendarConnectedEmail  — display-only, shown in admin settings
 *   googleCalendarCalendarId      — "primary" or explicit calendar id
 *
 * OAuth client config comes from env:
 *   GOOGLE_OAUTH_CLIENT_ID
 *   GOOGLE_OAUTH_CLIENT_SECRET
 *   NEXT_PUBLIC_PORTAL_URL        — used to build the redirect URI
 *
 * The refresh token never expires unless explicitly revoked or the user
 * revokes app access in their Google account. We exchange it for a
 * short-lived access token on each API call and cache the access token
 * in process memory until ~30s before it expires.
 *
 * Demo-gate pattern matches SendGrid / Twilio / SignWell: if the portal
 * isn't connected (no refresh token stored) the helper functions return
 * a `demo: true` mock response instead of throwing, so callers in
 * dev/demo environments don't break.
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";

type AccessTokenCache = { token: string; expiresAt: number };
let cached: AccessTokenCache | null = null;

export function oauthRedirectUri(originOverride?: string): string {
  // Prefer the actual request origin (passed in from the route handler)
  // over NEXT_PUBLIC_PORTAL_URL so we never risk a polluted env var
  // value sneaking whitespace / newlines into the URL we hand to
  // Google. Falls back to the env var, then localhost for dev.
  const raw =
    originOverride?.trim() ||
    (process.env.NEXT_PUBLIC_PORTAL_URL || "http://localhost:3000").trim();
  const base = raw.replace(/\/$/, "");
  return `${base}/api/admin/google-calendar/oauth-callback`;
}

export function buildAuthorizationUrl(state: string, originOverride?: string): string {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: oauthRedirectUri(originOverride),
    response_type: "code",
    // `offline` gets us a refresh_token; `consent` forces Google to
    // re-issue one even when the user has already granted the app
    // previously (otherwise a re-connect skips the refresh_token).
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/apps.licensing email",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string, originOverride?: string): Promise<{
  refreshToken: string;
  accessToken: string;
  expiresIn: number;
  email?: string;
}> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) throw new Error("Google OAuth client credentials are not configured");

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      // Google verifies that the redirect_uri in the token exchange
      // matches the one used in the initial authorization request, so
      // we need to pass the same origin here that oauth-start used.
      redirect_uri: oauthRedirectUri(originOverride),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`google-calendar: code exchange failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    id_token?: string;
  };

  if (!data.refresh_token) {
    // This usually means the user already granted access previously and
    // Google is skipping the refresh_token. Forcing prompt=consent in
    // buildAuthorizationUrl should prevent it; if we still hit it, ask
    // the admin to revoke app access at
    // https://myaccount.google.com/permissions and retry.
    throw new Error(
      "Google did not return a refresh token. Revoke Fintella's access at https://myaccount.google.com/permissions and try connecting again."
    );
  }

  // Pull the authenticated user's email out of the id_token for display.
  let email: string | undefined;
  if (data.id_token) {
    try {
      const payload = data.id_token.split(".")[1];
      const decoded = JSON.parse(Buffer.from(payload, "base64").toString());
      email = decoded.email;
    } catch {
      // non-fatal
    }
  }

  return {
    refreshToken: data.refresh_token,
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    email,
  };
}

async function getAccessToken(): Promise<string | null> {
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;

  const settings = await prisma.portalSettings.findUnique({ where: { id: "global" } });
  const refreshToken = settings?.googleCalendarRefreshToken || "";
  if (!refreshToken) return null;

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) return null;

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`google-calendar: refresh token exchange failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

export interface CalendarEventInput {
  summary: string;
  description?: string;
  startIso: string;
  endIso: string;
  joinUrl?: string;
  attendeeEmails?: string[];
}

export interface CalendarEventResult {
  id: string;
  htmlLink?: string;
  meetLink?: string;
  demo: boolean;
}

async function getCalendarId(): Promise<string> {
  const settings = await prisma.portalSettings.findUnique({ where: { id: "global" } });
  return settings?.googleCalendarCalendarId || "primary";
}

export async function createCalendarEvent(input: CalendarEventInput): Promise<CalendarEventResult> {
  const token = await getAccessToken();
  if (!token) return { id: `demo-event-${Date.now()}`, htmlLink: undefined, demo: true };

  const calendarId = encodeURIComponent(await getCalendarId());
  const body = {
    summary: input.summary,
    description: input.description
      ? `${input.description}${input.joinUrl ? `\n\nJoin here: ${input.joinUrl}` : ""}`
      : input.joinUrl,
    location: input.joinUrl,
    start: { dateTime: input.startIso, timeZone: "UTC" },
    end: { dateTime: input.endIso, timeZone: "UTC" },
    attendees: (input.attendeeEmails || []).map((email) => ({ email })),
    reminders: { useDefault: true },
    conferenceData: {
      createRequest: {
        requestId: `fintella-global-${Date.now()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };

  const res = await fetch(`${CAL_BASE}/calendars/${calendarId}/events?conferenceDataVersion=1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`google-calendar: create event failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as {
    id: string;
    htmlLink?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: Array<{ uri?: string; entryPointType?: string }> };
  };
  const meetLink = data.hangoutLink
    || data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri
    || undefined;
  return { id: data.id, htmlLink: data.htmlLink, meetLink, demo: false };
}

export async function updateCalendarEvent(
  eventId: string,
  input: CalendarEventInput
): Promise<CalendarEventResult> {
  const token = await getAccessToken();
  if (!token) return { id: eventId, demo: true };

  const calendarId = encodeURIComponent(await getCalendarId());
  const body = {
    summary: input.summary,
    description: input.description
      ? `${input.description}${input.joinUrl ? `\n\nJoin here: ${input.joinUrl}` : ""}`
      : input.joinUrl,
    location: input.joinUrl,
    start: { dateTime: input.startIso, timeZone: "UTC" },
    end: { dateTime: input.endIso, timeZone: "UTC" },
    attendees: (input.attendeeEmails || []).map((email) => ({ email })),
    conferenceData: {
      createRequest: {
        requestId: `fintella-global-${Date.now()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };

  const res = await fetch(`${CAL_BASE}/calendars/${calendarId}/events/${encodeURIComponent(eventId)}?conferenceDataVersion=1`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`google-calendar: update event failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as {
    id: string;
    htmlLink?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: Array<{ uri?: string; entryPointType?: string }> };
  };
  const meetLink = data.hangoutLink
    || data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri
    || undefined;
  return { id: data.id, htmlLink: data.htmlLink, meetLink, demo: false };
}

export async function deleteCalendarEvent(eventId: string): Promise<{ deleted: boolean; demo: boolean }> {
  const token = await getAccessToken();
  if (!token) return { deleted: true, demo: true };

  const calendarId = encodeURIComponent(await getCalendarId());
  const res = await fetch(`${CAL_BASE}/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`google-calendar: delete event failed (${res.status}): ${await res.text()}`);
  }
  return { deleted: true, demo: false };
}

export async function listCalendars(): Promise<Array<{ id: string; summary: string; primary?: boolean }>> {
  const token = await getAccessToken();
  if (!token) return [];

  const res = await fetch(`${CAL_BASE}/users/me/calendarList?minAccessRole=writer&maxResults=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`google-calendar: list calendars failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { items: Array<{ id: string; summary: string; primary?: boolean }> };
  return data.items.map((c) => ({ id: c.id, summary: c.summary, primary: c.primary }));
}

export async function googleCalendarConfigured(): Promise<boolean> {
  const settings = await prisma.portalSettings.findUnique({ where: { id: "global" } });
  return !!(
    settings?.googleCalendarRefreshToken &&
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET
  );
}

// ─── PER-INBOX HELPERS (PartnerOS Phase 2b) ──────────────────────────────
// The legacy token cache above is keyed on the global singleton. Per-inbox
// tokens get their own cache map keyed by inbox id so one admin clicking
// "Connect Calendar" on the Support inbox doesn't force a re-auth on the
// Accounting inbox.

const inboxTokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAccessTokenForInbox(
  refreshToken: string,
  inboxId: string
): Promise<string | null> {
  const cachedEntry = inboxTokenCache.get(inboxId);
  if (cachedEntry && cachedEntry.expiresAt > Date.now() + 30_000)
    return cachedEntry.token;

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) return null;

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    console.error(
      `[google-calendar inbox=${inboxId}] refresh failed ${res.status}: ${await res.text().catch(() => "")}`
    );
    return null;
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  inboxTokenCache.set(inboxId, {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
  return data.access_token;
}

export function invalidateCachedInboxToken(inboxId: string): void {
  inboxTokenCache.delete(inboxId);
}

/**
 * Query free-busy on the inbox's primary calendar between two ISO
 * timestamps. Returns an array of busy intervals the caller can subtract
 * from their candidate slots.
 *
 * When the inbox has no refresh token, returns `null` so the caller can
 * fall back to a fixed slot grid (as Phase 3c.4d did before real OAuth).
 */
export async function freeBusyForInbox(
  refreshToken: string | null,
  inboxId: string,
  timeMinIso: string,
  timeMaxIso: string
): Promise<Array<{ startIso: string; endIso: string }> | null> {
  if (!refreshToken) return null;
  const token = await getAccessTokenForInbox(refreshToken, inboxId);
  if (!token) return null;

  const res = await fetch(`${CAL_BASE}/freeBusy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
      items: [{ id: "primary" }],
    }),
  });
  if (!res.ok) {
    console.error(
      `[google-calendar inbox=${inboxId}] freeBusy failed ${res.status}: ${await res.text().catch(() => "")}`
    );
    return null;
  }
  const data = (await res.json()) as {
    calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
  };
  const busy = data.calendars?.primary?.busy ?? [];
  return busy.map((b) => ({ startIso: b.start, endIso: b.end }));
}

/**
 * Create a calendar event on the inbox's primary calendar. Used by Ollie's
 * `book_slot` tool after a partner picks a slot. Returns `null` if the
 * inbox has no token (caller should fall back to the notification-only
 * path from Phase 3c.4d).
 */
export async function createEventOnInboxCalendar(
  refreshToken: string | null,
  inboxId: string,
  input: CalendarEventInput
): Promise<CalendarEventResult | null> {
  if (!refreshToken) return null;
  const token = await getAccessTokenForInbox(refreshToken, inboxId);
  if (!token) return null;

  const body: Record<string, unknown> = {
    summary: input.summary,
    description: input.description
      ? `${input.description}${input.joinUrl ? `\n\nJoin here: ${input.joinUrl}` : ""}`
      : input.joinUrl,
    location: input.joinUrl,
    start: { dateTime: input.startIso, timeZone: "UTC" },
    end: { dateTime: input.endIso, timeZone: "UTC" },
    attendees: (input.attendeeEmails || []).map((email) => ({ email })),
    reminders: { useDefault: true },
    conferenceData: {
      createRequest: {
        requestId: `fintella-${inboxId}-${Date.now()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };

  const res = await fetch(`${CAL_BASE}/calendars/primary/events?conferenceDataVersion=1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(
      `[google-calendar inbox=${inboxId}] createEvent failed ${res.status}: ${await res.text().catch(() => "")}`
    );
    return null;
  }
  const data = (await res.json()) as {
    id: string;
    htmlLink?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: Array<{ uri?: string; entryPointType?: string }> };
  };
  const meetLink = data.hangoutLink
    || data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri
    || undefined;
  return { id: data.id, htmlLink: data.htmlLink, meetLink, demo: false };
}

export function invalidateCachedAccessToken(): void {
  cached = null;
}
