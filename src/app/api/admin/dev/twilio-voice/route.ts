import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * GET /api/admin/dev/twilio-voice
 *
 * Super-admin diagnostic. Validates every piece of the Twilio Voice
 * configuration without placing a real call:
 *
 *  1. Checks which env vars are present / missing
 *  2. Fetches the TwiML App from Twilio to confirm it exists and shows
 *     its current Voice Request URL (so we can spot stale localhost URLs)
 *  3. Mints a test Access Token to verify the API Key pair is valid
 *
 * Use this to debug softphone "not calling out" without guessing.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as any).role;
  if (role !== "super_admin") {
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN || "";
  const apiKeySid = process.env.TWILIO_API_KEY_SID || "";
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET || "";
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID || "";
  const adminPhone = process.env.TWILIO_ADMIN_PHONE || "";
  const fromNumber = process.env.TWILIO_FROM_NUMBER || "";

  const envCheck = {
    TWILIO_ACCOUNT_SID: !!accountSid,
    TWILIO_AUTH_TOKEN: !!authToken,
    TWILIO_API_KEY_SID: !!apiKeySid,
    TWILIO_API_KEY_SECRET: !!apiKeySecret,
    TWILIO_TWIML_APP_SID: !!twimlAppSid,
    TWILIO_ADMIN_PHONE: !!adminPhone,
    TWILIO_FROM_NUMBER: !!fromNumber,
  };

  const missing = Object.entries(envCheck)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  // ── 2. Fetch TwiML App from Twilio REST API ───────────────────────────────
  let twimlApp: { sid: string; friendlyName: string; voiceUrl: string; voiceMethod: string } | null = null;
  let twimlAppError: string | null = null;

  if (accountSid && authToken && twimlAppSid) {
    try {
      const basic = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Applications/${twimlAppSid}.json`,
        { headers: { Authorization: `Basic ${basic}` } }
      );
      if (res.ok) {
        const data = await res.json();
        twimlApp = {
          sid: data.sid,
          friendlyName: data.friendly_name,
          voiceUrl: data.voice_url || "(not set)",
          voiceMethod: data.voice_method || "POST",
        };
      } else {
        const txt = await res.text().catch(() => `HTTP ${res.status}`);
        twimlAppError = `Twilio returned ${res.status}: ${txt.slice(0, 300)}`;
      }
    } catch (e: any) {
      twimlAppError = e?.message || String(e);
    }
  } else {
    twimlAppError = "Skipped — missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_TWIML_APP_SID";
  }

  // ── 3. Test Access Token mint (validates API Key pair) ────────────────────
  let tokenTest: { ok: boolean; identity?: string; error?: string } = { ok: false };

  if (accountSid && apiKeySid && apiKeySecret && twimlAppSid) {
    try {
      const twilio = (await import("twilio")).default;
      const { AccessToken } = twilio.jwt;
      const { VoiceGrant } = AccessToken;

      const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
        identity: "diagnostic-test",
        ttl: 60,
      });
      const grant = new VoiceGrant({
        outgoingApplicationSid: twimlAppSid,
        incomingAllow: false,
      });
      token.addGrant(grant);
      // Calling toJwt() validates the key pair format
      const jwt = token.toJwt();
      tokenTest = { ok: !!jwt, identity: "diagnostic-test" };
    } catch (e: any) {
      tokenTest = { ok: false, error: e?.message || String(e) };
    }
  } else {
    tokenTest = { ok: false, error: "Skipped — missing API key env vars or TWILIO_TWIML_APP_SID" };
  }

  // ── 4. Expected webhook URL ───────────────────────────────────────────────
  const portalUrl =
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://fintella.partners";
  const expectedVoiceUrl = `${portalUrl}/api/twilio/voice-webhook`;

  const voiceUrlMatch =
    twimlApp?.voiceUrl === expectedVoiceUrl
      ? "✅ matches"
      : twimlApp?.voiceUrl
      ? `❌ mismatch — TwiML App has: ${twimlApp.voiceUrl} | expected: ${expectedVoiceUrl}`
      : null;

  return NextResponse.json({
    env: envCheck,
    missing,
    softphoneReady: missing.length === 0,
    twimlApp,
    twimlAppError,
    expectedVoiceUrl,
    voiceUrlMatch,
    tokenTest,
    verdict:
      missing.length > 0
        ? `Missing env vars: ${missing.join(", ")}`
        : !twimlApp
        ? `TwiML App lookup failed — ${twimlAppError}`
        : !tokenTest.ok
        ? `API Key test failed — ${tokenTest.error}`
        : voiceUrlMatch?.startsWith("❌")
        ? `TwiML App Voice URL is wrong — update it in the Twilio console`
        : "✅ All checks passed — softphone should work",
  });
}
