import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RP_ID, RP_NAME, CHALLENGE_TTL_MS, purgeExpiredChallenges } from "@/lib/passkey";

/**
 * POST /api/auth/passkey/register/options
 *
 * Phase 1 of passkey enrollment. The caller is a partner who is ALREADY
 * authenticated via password or Google — passkeys are an additive second
 * factor / alternate login, not a new signup path. Returns the options
 * payload @simplewebauthn/browser needs to drive navigator.credentials
 * .create() on the client.
 *
 * We exclude the partner's existing credentials so the authenticator
 * refuses to enroll a dupe on the same device. The challenge is
 * persisted in the PasskeyChallenge table keyed by partnerCode so the
 * verify endpoint can cross-check it in step 2.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  const partner = await prisma.partner.findUnique({ where: { partnerCode } });
  if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

  const existing = await prisma.passkey.findMany({
    where: { partnerCode },
    select: { credentialId: true, transports: true },
  });

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: partner.id,
    userName: partner.email,
    userDisplayName: `${partner.firstName} ${partner.lastName}`.trim() || partner.email,
    attestationType: "none", // we trust the authenticator's own assertion
    excludeCredentials: existing.map((c) => ({
      id: new Uint8Array(Buffer.from(c.credentialId, "base64url")),
      type: "public-key" as const,
      transports: safeTransports(c.transports),
    })),
    authenticatorSelection: {
      residentKey: "preferred",     // enable passkey discovery on the login page
      userVerification: "preferred", // don't force biometric if the device has none
    },
  });

  await purgeExpiredChallenges();
  await prisma.passkeyChallenge.create({
    data: {
      challenge: options.challenge,
      purpose: "register",
      partnerCode,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  });

  return NextResponse.json(options);
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
