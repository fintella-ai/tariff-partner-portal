import crypto from "crypto";
import { hash, compare } from "bcryptjs";

const JWT_SECRET = process.env.WIDGET_JWT_SECRET || process.env.NEXTAUTH_SECRET || "dev-widget-secret";
const JWT_EXPIRY_SECONDS = 4 * 60 * 60; // 4 hours

interface WidgetJwtPayload {
  sub: string; // partnerId
  sid: string; // widgetSessionId
  iat: number;
  exp: number;
}

export function generateApiKey(): string {
  return `fwk_${crypto.randomBytes(32).toString("hex")}`;
}

export function getApiKeyHint(apiKey: string): string {
  return `...${apiKey.slice(-8)}`;
}

export async function hashApiKey(apiKey: string): Promise<string> {
  return hash(apiKey, 10);
}

export async function compareApiKey(apiKey: string, hashed: string): Promise<boolean> {
  return compare(apiKey, hashed);
}

export function signWidgetJwt(partnerId: string, sessionId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload: WidgetJwtPayload = {
    sub: partnerId,
    sid: sessionId,
    iat: now,
    exp: now + JWT_EXPIRY_SECONDS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payloadB64}`)
    .digest("base64url");
  return `${header}.${payloadB64}.${signature}`;
}

export function verifyWidgetJwt(token: string): WidgetJwtPayload | null {
  try {
    const [headerB64, payloadB64, signature] = token.split(".");
    if (!headerB64 || !payloadB64 || !signature) return null;
    const expected = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");
    if (signature !== expected) return null;
    const payload: WidgetJwtPayload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString()
    );
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getCorsHeaders(origin: string | null, allowedOrigin: string | null): Record<string, string> {
  const effectiveOrigin = allowedOrigin && origin === allowedOrigin ? allowedOrigin : "*";
  return {
    "Access-Control-Allow-Origin": effectiveOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}
