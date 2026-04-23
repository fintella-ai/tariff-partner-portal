import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { RP_ID, ORIGIN, CHALLENGE_TTL_MS, purgeExpiredChallenges } from "@/lib/passkey";

/**
 * POST /api/auth/passkey/login/verify
 *
 * Phase 2 of passkey login. Verifies the authenticator assertion sent by
 * @simplewebauthn/browser's startAuthentication(). On success we don't
 * establish the NextAuth session ourselves — we mint a one-shot handoff
 * token that the login page immediately trades via the "passkey-login"
 * Credentials provider in src/lib/auth.ts. That keeps all session
 * minting in one place and reuses the JWT callbacks we already wrote.
 *
 * Handoff token reuses the existing ImpersonationToken table (same
 * shape: unique 32-byte hex, single-use, short TTL) so we don't add
 * another table just for this. "Impersonation" is a misnomer here —
 * the partner is signing in as themselves — but the mechanics are
 * identical.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const assertion = body?.response;
  if (!assertion) return NextResponse.json({ error: "Missing response" }, { status: 400 });

  const expectedChallenge = assertion.response?.clientDataJSON
    ? (() => {
        try {
          const decoded = JSON.parse(Buffer.from(assertion.response.clientDataJSON, "base64").toString());
          return typeof decoded.challenge === "string" ? decoded.challenge : null;
        } catch {
          return null;
        }
      })()
    : null;

  if (!expectedChallenge) return NextResponse.json({ error: "Malformed clientDataJSON" }, { status: 400 });

  const challengeRow = await prisma.passkeyChallenge.findUnique({ where: { challenge: expectedChallenge } });
  if (!challengeRow || challengeRow.purpose !== "login") {
    return NextResponse.json({ error: "Challenge expired or invalid — retry" }, { status: 400 });
  }
  if (challengeRow.expiresAt < new Date()) {
    return NextResponse.json({ error: "Challenge expired — retry" }, { status: 400 });
  }

  // Look up the credential the authenticator signed with.
  const credentialId: string = assertion.id;
  const credential = await prisma.passkey.findUnique({ where: { credentialId } });
  if (!credential) {
    return NextResponse.json({ error: "Unknown credential — has this passkey been registered?" }, { status: 400 });
  }

  const partner = await prisma.partner.findUnique({ where: { partnerCode: credential.partnerCode } });
  if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });
  if (partner.status === "blocked") return NextResponse.json({ error: "Account blocked" }, { status: 403 });

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      authenticator: {
        credentialID: new Uint8Array(Buffer.from(credential.credentialId, "base64url")),
        credentialPublicKey: new Uint8Array(credential.publicKey),
        counter: Number(credential.counter),
        transports: safeTransports(credential.transports),
      },
      requireUserVerification: false,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Verification failed" }, { status: 400 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  // Advance the signature counter (anti-clone) + mark lastUsedAt.
  await prisma.passkey.update({
    where: { credentialId },
    data: {
      counter: BigInt(verification.authenticationInfo.newCounter),
      lastUsedAt: new Date(),
    },
  });

  // Mint a single-use handoff token (60s TTL) the client trades for a
  // NextAuth session via the existing passkey-login provider.
  const handoff = randomBytes(32).toString("hex");
  await prisma.impersonationToken.create({
    data: {
      token: handoff,
      partnerCode: partner.partnerCode,
      email: partner.email,
      name: `${partner.firstName} ${partner.lastName}`.trim(),
      expiresAt: new Date(Date.now() + 60 * 1000),
    },
  });

  // Burn the challenge + sweep stale rows.
  await prisma.passkeyChallenge.delete({ where: { id: challengeRow.id } }).catch(() => {});
  await purgeExpiredChallenges();

  return NextResponse.json({ success: true, handoffToken: handoff });
}

function safeTransports(raw: string): ("ble" | "hybrid" | "internal" | "nfc" | "usb")[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    const allowed = new Set(["ble", "hybrid", "internal", "nfc", "usb"]);
    return parsed.filter((t: unknown): t is "ble" | "hybrid" | "internal" | "nfc" | "usb" =>
      typeof t === "string" && allowed.has(t),
    );
  } catch {
    return [];
  }
}
