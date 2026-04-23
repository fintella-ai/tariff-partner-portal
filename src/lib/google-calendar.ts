import crypto from "crypto";

/**
 * Minimal Google Calendar client — service-account auth, raw fetch against
 * the REST API. Matches the demo-gate pattern used by SendGrid, Twilio, and
 * SignWell: if the env vars aren't set we return a mock response rather
 * than throw, so builds + dev sessions don't break.
 *
 * Env vars (all three required for real sends):
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL  — e.g. fintella-bot@…iam.gserviceaccount.com
 *   GOOGLE_SERVICE_ACCOUNT_KEY    — PEM private key, newlines as \n
 *   GOOGLE_CALENDAR_ID            — the calendar id to write events on
 *
 * The service account needs "Make changes to events" permission on the
 * target calendar (share the calendar with the service account email in
 * Google Calendar settings).
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";

type AccessTokenCache = { token: string; expiresAt: number };
let cached: AccessTokenCache | null = null;

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function isConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY &&
    process.env.GOOGLE_CALENDAR_ID
  );
}

async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
  // Private keys copy-pasted from Google's JSON credentials often have
  // literal "\n" sequences — normalize back to real newlines.
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "").replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: email,
    scope: "https://www.googleapis.com/auth/calendar.events",
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signature = crypto.createSign("RSA-SHA256").update(signingInput).sign(privateKey);
  const jwt = `${signingInput}.${base64url(signature)}`;

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`google-calendar: token exchange failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

export interface CalendarEventInput {
  summary: string;
  description?: string;
  startIso: string;                  // RFC3339 — e.g. 2026-03-26T18:00:00Z
  endIso: string;                    // RFC3339
  joinUrl?: string;                  // Jitsi / Meet / Zoom URL
  attendeeEmails?: string[];         // optional
}

export interface CalendarEventResult {
  id: string;
  htmlLink?: string;
  demo: boolean;
}

export async function createCalendarEvent(input: CalendarEventInput): Promise<CalendarEventResult> {
  if (!isConfigured()) {
    return { id: `demo-event-${Date.now()}`, htmlLink: undefined, demo: true };
  }
  const token = await getAccessToken();
  const calendarId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID!);

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
  };

  const res = await fetch(`${CAL_BASE}/calendars/${calendarId}/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`google-calendar: create event failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { id: string; htmlLink?: string };
  return { id: data.id, htmlLink: data.htmlLink, demo: false };
}

export async function updateCalendarEvent(
  eventId: string,
  input: CalendarEventInput
): Promise<CalendarEventResult> {
  if (!isConfigured()) {
    return { id: eventId, demo: true };
  }
  const token = await getAccessToken();
  const calendarId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID!);

  const body = {
    summary: input.summary,
    description: input.description
      ? `${input.description}${input.joinUrl ? `\n\nJoin here: ${input.joinUrl}` : ""}`
      : input.joinUrl,
    location: input.joinUrl,
    start: { dateTime: input.startIso, timeZone: "UTC" },
    end: { dateTime: input.endIso, timeZone: "UTC" },
    attendees: (input.attendeeEmails || []).map((email) => ({ email })),
  };

  const res = await fetch(`${CAL_BASE}/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`google-calendar: update event failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { id: string; htmlLink?: string };
  return { id: data.id, htmlLink: data.htmlLink, demo: false };
}

export async function deleteCalendarEvent(eventId: string): Promise<{ deleted: boolean; demo: boolean }> {
  if (!isConfigured()) {
    return { deleted: true, demo: true };
  }
  const token = await getAccessToken();
  const calendarId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID!);

  const res = await fetch(`${CAL_BASE}/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`google-calendar: delete event failed (${res.status}): ${await res.text()}`);
  }
  return { deleted: true, demo: false };
}

export function googleCalendarConfigured(): boolean {
  return isConfigured();
}
