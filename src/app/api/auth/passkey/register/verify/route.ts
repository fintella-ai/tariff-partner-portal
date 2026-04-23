import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RP_ID, ORIGIN, purgeExpiredChallenges } from "@/lib/passkey";

/**
 * POST /api/auth/passkey/register/verify
 *
 * Phase 2 of passkey enrollment. Caller must still be the authenticated
 * partner. Body is the RegistrationResponseJSON produced by
 * @simplewebauthn/browser's startRegistration(). We cross-check the
 * challenge we issued in /options against what the authenticator signed,
 * then store the credential so it can be used on subsequent logins.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const attestation = body?.response;
  const name: string | null = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : null;
  if (!attestation) return NextResponse.json({ error: "Missing response" }, { status: 400 });

  // Look up the challenge we saved in /options. The challenge field is the
  // base64url-encoded value returned by generateRegistrationOptions.
  const expectedChallenge = attestation.response?.clientDataJSON
    ? (() => {
        try {
          const decoded = JSON.parse(Buffer.from(attestation.response.clientDataJSON, "base64").toString());
          return typeof decoded.challenge === "string" ? decoded.challenge : null;
        } catch {
          return null;
        }
      })()
    : null;

  if (!expectedChallenge) return NextResponse.json({ error: "Malformed clientDataJSON" }, { status: 400 });

  const challengeRow = await prisma.passkeyChallenge.findUnique({ where: { challenge: expectedChallenge } });
  if (!challengeRow || challengeRow.purpose !== "register" || challengeRow.partnerCode !== partnerCode) {
    return NextResponse.json({ error: "Challenge expired or invalid — retry" }, { status: 400 });
  }
  if (challengeRow.expiresAt < new Date()) {
    return NextResponse.json({ error: "Challenge expired — retry" }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: attestation,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: false,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Verification failed" }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  const {
    credentialID,
    credentialPublicKey,
    counter,
    credentialDeviceType,
    credentialBackedUp,
  } = verification.registrationInfo;

  // Transports come off the attestation response (what the client told us
  // about the authenticator), not off registrationInfo.
  const rawTransports: string[] = Array.isArray(attestation.response?.transports)
    ? attestation.response.transports
    : [];

  await prisma.passkey.create({
    data: {
      partnerCode,
      credentialId: Buffer.from(credentialID).toString("base64url"),
      publicKey: Buffer.from(credentialPublicKey),
      counter: BigInt(counter),
      transports: JSON.stringify(rawTransports),
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      name,
    },
  });

  // Burn the challenge + sweep any other stale rows.
  await prisma.passkeyChallenge.delete({ where: { id: challengeRow.id } }).catch(() => {});
  await purgeExpiredChallenges();

  return NextResponse.json({ success: true });
}
