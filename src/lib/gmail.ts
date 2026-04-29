import { prisma } from "@/lib/prisma";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export const GMAIL_ALIASES = [
  { key: "all",        label: "All Mail",    email: "" },
  { key: "admin",      label: "Admin",       email: "admin@fintella.partners" },
  { key: "support",    label: "Support",     email: "support@fintella.partners" },
  { key: "outreach",   label: "Outreach",    email: "outreach@fintella.partners" },
  { key: "noreply",    label: "No-Reply",    email: "noreply@fintella.partners" },
  { key: "john",       label: "John",        email: "john@fintella.partners" },
  { key: "partners",   label: "Partners",    email: "partners@fintella.partners" },
] as const;

export type GmailAlias = (typeof GMAIL_ALIASES)[number]["key"];

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  fromEmail: string;
  to: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
  hasAttachments: boolean;
  labels: string[];
}

export interface GmailMessageFull extends GmailMessage {
  body: string;
  htmlBody: string | null;
  cc: string;
  replyTo: string;
  messageId: string;
}

async function getAccessToken(): Promise<string> {
  const settings = await prisma.portalSettings.findUnique({ where: { id: "global" } });
  const refreshToken = settings?.googleCalendarRefreshToken;
  if (!refreshToken) throw new Error("Google not connected");

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";

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

  if (!res.ok) throw new Error("Token refresh failed — reconnect Google in Settings");
  const { access_token } = await res.json();
  return access_token;
}

/**
 * Diagnose Gmail API access: check token scopes + test a simple Gmail call.
 */
export async function diagnoseGmailAccess(): Promise<Record<string, any>> {
  const result: Record<string, any> = {};
  try {
    const settings = await prisma.portalSettings.findUnique({ where: { id: "global" } });
    result.hasRefreshToken = !!settings?.googleCalendarRefreshToken;
    result.connectedEmail = settings?.googleCalendarConnectedEmail || null;
    result.connectedAt = settings?.googleCalendarConnectedAt || null;

    if (!settings?.googleCalendarRefreshToken) {
      result.error = "No refresh token stored";
      return result;
    }

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";

    // Step 1: Refresh token → get access token + check scope
    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: settings.googleCalendarRefreshToken,
        grant_type: "refresh_token",
      }),
    });

    const tokenData = await tokenRes.json();
    result.tokenRefreshOk = tokenRes.ok;
    result.grantedScopes = tokenData.scope || "(not returned)";
    result.tokenType = tokenData.token_type || "";

    if (!tokenRes.ok) {
      result.tokenError = tokenData;
      return result;
    }

    // Step 2: tokeninfo — shows exactly which scopes are on this token
    const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${tokenData.access_token}`);
    const infoData = await infoRes.json();
    result.tokenInfoScopes = infoData.scope || "(none)";
    result.tokenInfoEmail = infoData.email || "";

    // Step 3: test Gmail API call
    const gmailRes = await fetch(`${GMAIL_API}/messages?maxResults=1`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    result.gmailStatus = gmailRes.status;
    if (!gmailRes.ok) {
      result.gmailError = await gmailRes.text().catch(() => "");
    } else {
      result.gmailOk = true;
    }
  } catch (err: any) {
    result.error = err.message;
  }
  return result;
}

function extractHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function extractEmail(headerValue: string): string {
  const match = headerValue.match(/<([^>]+)>/);
  return (match?.[1] || headerValue).trim().toLowerCase();
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function extractBody(payload: any): { text: string; html: string | null } {
  if (!payload) return { text: "", html: null };

  // Single-part message
  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    const isHtml = (payload.mimeType || "").includes("html");
    return isHtml ? { text: "", html: decoded } : { text: decoded, html: null };
  }

  // Multipart — walk parts recursively
  let text = "";
  let html: string | null = null;
  const parts = payload.parts || [];
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data && !text) {
      text = decodeBase64Url(part.body.data);
    } else if (part.mimeType === "text/html" && part.body?.data && !html) {
      html = decodeBase64Url(part.body.data);
    } else if (part.parts) {
      const nested = extractBody(part);
      if (!text && nested.text) text = nested.text;
      if (!html && nested.html) html = nested.html;
    }
  }
  return { text, html };
}

function hasAttachments(payload: any): boolean {
  if (!payload?.parts) return false;
  return payload.parts.some((p: any) =>
    (p.filename && p.filename.length > 0) || hasAttachments(p)
  );
}

function parseMessage(msg: any): GmailMessage {
  const headers = msg.payload?.headers || [];
  const from = extractHeader(headers, "From");
  return {
    id: msg.id,
    threadId: msg.threadId,
    from,
    fromEmail: extractEmail(from),
    to: extractHeader(headers, "To"),
    subject: extractHeader(headers, "Subject"),
    snippet: msg.snippet || "",
    date: extractHeader(headers, "Date"),
    unread: (msg.labelIds || []).includes("UNREAD"),
    hasAttachments: hasAttachments(msg.payload),
    labels: msg.labelIds || [],
  };
}

function parseFullMessage(msg: any): GmailMessageFull {
  const base = parseMessage(msg);
  const headers = msg.payload?.headers || [];
  const { text, html } = extractBody(msg.payload);
  return {
    ...base,
    body: text || (html ? html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : ""),
    htmlBody: html,
    cc: extractHeader(headers, "Cc"),
    replyTo: extractHeader(headers, "Reply-To"),
    messageId: extractHeader(headers, "Message-ID"),
  };
}

export async function listMessages(opts: {
  alias?: string;
  query?: string;
  maxResults?: number;
  pageToken?: string;
  unreadOnly?: boolean;
}): Promise<{ messages: GmailMessage[]; nextPageToken?: string; resultSizeEstimate: number }> {
  const token = await getAccessToken();

  const parts: string[] = ["in:inbox"];
  if (opts.unreadOnly) parts.push("is:unread");

  const aliasEntry = GMAIL_ALIASES.find((a) => a.key === opts.alias);
  if (aliasEntry && aliasEntry.email) {
    parts.push(`to:${aliasEntry.email}`);
  }
  if (opts.query) parts.push(opts.query);

  const q = encodeURIComponent(parts.join(" "));
  const maxResults = opts.maxResults || 50;
  let url = `${GMAIL_API}/messages?q=${q}&maxResults=${maxResults}`;
  if (opts.pageToken) url += `&pageToken=${opts.pageToken}`;

  const listRes = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!listRes.ok) {
    const errBody = await listRes.text().catch(() => "");
    console.error(`[gmail] list error ${listRes.status}:`, errBody);
    if (listRes.status === 403) {
      // Parse Google's error for a specific reason
      try {
        const parsed = JSON.parse(errBody);
        const reason = parsed?.error?.errors?.[0]?.reason || "";
        const msg = parsed?.error?.message || "";
        if (reason === "domainPolicy") {
          throw new Error(`Gmail blocked by domain policy: ${msg}. Check Google Workspace admin → Security → API controls.`);
        }
        if (reason === "insufficientPermissions" || msg.includes("Insufficient Permission")) {
          throw new Error(`Gmail scope not granted. Reconnect Google in Settings → Integrations. (${msg})`);
        }
        throw new Error(`Gmail 403: ${msg || reason || errBody.slice(0, 200)}`);
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("Gmail")) throw e;
        throw new Error(`Gmail scope not granted. Reconnect Google in Settings → Integrations. Raw: ${errBody.slice(0, 200)}`);
      }
    }
    throw new Error(`Gmail API error (${listRes.status}): ${errBody.slice(0, 200)}`);
  }

  const listData = await listRes.json();
  const messageIds: Array<{ id: string }> = listData.messages || [];

  if (messageIds.length === 0) {
    return { messages: [], resultSizeEstimate: listData.resultSizeEstimate || 0 };
  }

  // Fetch metadata for each message (batch of up to 50)
  const messages: GmailMessage[] = [];
  const batch = messageIds.slice(0, maxResults);

  const fetches = batch.map(async ({ id }) => {
    const res = await fetch(
      `${GMAIL_API}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    return res.json();
  });

  const results = await Promise.all(fetches);
  for (const msg of results) {
    if (msg) messages.push(parseMessage(msg));
  }

  return {
    messages,
    nextPageToken: listData.nextPageToken,
    resultSizeEstimate: listData.resultSizeEstimate || 0,
  };
}

export async function getMessage(id: string): Promise<GmailMessageFull> {
  const token = await getAccessToken();
  const res = await fetch(`${GMAIL_API}/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail get error: ${res.status}`);
  return parseFullMessage(await res.json());
}

export async function getThread(threadId: string): Promise<GmailMessageFull[]> {
  const token = await getAccessToken();
  const res = await fetch(`${GMAIL_API}/threads/${threadId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail thread error: ${res.status}`);
  const data = await res.json();
  return (data.messages || []).map(parseFullMessage);
}

export async function sendMessage(opts: {
  to: string;
  from?: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  threadId?: string;
}): Promise<{ id: string; threadId: string }> {
  const token = await getAccessToken();

  const fromAddr = opts.from || "admin@fintella.partners";
  const lines = [
    `From: ${fromAddr}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    `Content-Type: text/plain; charset=UTF-8`,
  ];
  if (opts.inReplyTo) {
    lines.push(`In-Reply-To: ${opts.inReplyTo}`);
    lines.push(`References: ${opts.inReplyTo}`);
  }
  lines.push("", opts.body);

  const raw = Buffer.from(lines.join("\r\n")).toString("base64url");

  const sendBody: any = { raw };
  if (opts.threadId) sendBody.threadId = opts.threadId;

  const res = await fetch(`${GMAIL_API}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sendBody),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail send error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return { id: data.id, threadId: data.threadId };
}

export async function getUnreadCounts(): Promise<Record<string, number>> {
  const token = await getAccessToken();
  const counts: Record<string, number> = {};

  for (const alias of GMAIL_ALIASES) {
    if (!alias.email) continue;
    const q = encodeURIComponent(`in:inbox is:unread to:${alias.email}`);
    const res = await fetch(`${GMAIL_API}/messages?q=${q}&maxResults=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      counts[alias.key] = data.resultSizeEstimate || 0;
    }
  }

  return counts;
}
