import { createSign } from "crypto";
import { prisma } from "@/lib/prisma";

const GOOGLE_SHEETS_CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL || "";
const GOOGLE_SHEETS_PRIVATE_KEY = (process.env.GOOGLE_SHEETS_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const GOOGLE_SHEETS_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "";

const SCOPES = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

function isConfigured(): boolean {
  return !!(GOOGLE_SHEETS_CLIENT_EMAIL && GOOGLE_SHEETS_PRIVATE_KEY && GOOGLE_SHEETS_SPREADSHEET_ID);
}

// ── JWT creation ────────────────────────────────────────────────────────

function base64url(data: string | Buffer): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function createJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: GOOGLE_SHEETS_CLIENT_EMAIL,
      scope: SCOPES,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = base64url(signer.sign(GOOGLE_SHEETS_PRIVATE_KEY));
  return `${unsigned}.${signature}`;
}

// ── Access token (cached for ~55 min) ───────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const jwt = createJwt();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${encodeURIComponent(jwt)}`,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  // Refresh 5 minutes before actual expiry
  tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken!;
}

// ── Sheets helpers ──────────────────────────────────────────────────────

const SHEET_RANGE = "Sheet1";
const HEADERS = ["First Name", "Last Name", "Email", "Date Created", "Commission %"];

async function sheetsGet(range: string): Promise<string[][]> {
  const token = await getAccessToken();
  const url = `${SHEETS_BASE}/${GOOGLE_SHEETS_SPREADSHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets GET failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.values || [];
}

async function sheetsAppend(range: string, values: string[][]): Promise<number> {
  const token = await getAccessToken();
  const url = `${SHEETS_BASE}/${GOOGLE_SHEETS_SPREADSHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets append failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.updates?.updatedRows ?? values.length;
}

async function sheetsClear(range: string): Promise<void> {
  const token = await getAccessToken();
  const url = `${SHEETS_BASE}/${GOOGLE_SHEETS_SPREADSHEET_ID}/values/${encodeURIComponent(range)}:clear`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets clear failed (${res.status}): ${text}`);
  }
}

async function ensureHeaders(): Promise<void> {
  const existing = await sheetsGet(`${SHEET_RANGE}!A1:E1`);
  if (existing.length > 0 && existing[0]?.[0] === HEADERS[0]) return;
  // No headers yet — prepend them
  await sheetsAppend(`${SHEET_RANGE}!A1`, [HEADERS]);
}

// ── Public API ──────────────────────────────────────────────────────────

export async function appendPartnerRow(data: {
  firstName: string;
  lastName: string;
  email: string;
  createdAt: Date | string;
  commissionRate: number;
}): Promise<void> {
  if (!isConfigured()) {
    console.log("[GoogleSheets] demo — env vars not set, skipping appendPartnerRow");
    return;
  }

  await ensureHeaders();

  const createdStr =
    data.createdAt instanceof Date
      ? data.createdAt.toISOString().split("T")[0]
      : new Date(data.createdAt).toISOString().split("T")[0];

  const pctStr = `${Math.round(data.commissionRate * 100)}%`;

  await sheetsAppend(`${SHEET_RANGE}!A:E`, [
    [data.firstName, data.lastName, data.email, createdStr, pctStr],
  ]);
}

export async function syncAllPartners(): Promise<number> {
  if (!isConfigured()) {
    console.log("[GoogleSheets] demo — env vars not set, skipping syncAllPartners");
    return 0;
  }

  const partners = await prisma.partner.findMany({
    select: {
      firstName: true,
      lastName: true,
      email: true,
      createdAt: true,
      commissionRate: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Clear existing data and rewrite
  await sheetsClear(`${SHEET_RANGE}`);

  const rows: string[][] = [HEADERS];
  for (const p of partners) {
    rows.push([
      p.firstName,
      p.lastName,
      p.email,
      p.createdAt.toISOString().split("T")[0],
      `${Math.round(p.commissionRate * 100)}%`,
    ]);
  }

  await sheetsAppend(`${SHEET_RANGE}!A1`, rows);

  return partners.length;
}
