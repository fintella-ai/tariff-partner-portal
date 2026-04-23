import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { RP_ID, CHALLENGE_TTL_MS, purgeExpiredChallenges } from "@/lib/passkey";

/**
 * POST /api/auth/passkey/login/options
 *
 * Phase 1 of passkey login. No auth required — this IS the login flow.
 * We don't know which partner is attempting to sign in yet, so
 * allowCredentials is left empty. The browser presents every passkey
 * registered to this RP ID and the user picks one; the signed
 * credentialId in the response tells us who they are.
 *
 * Challenge is stored with partnerCode=null; verify picks it up by
 * challenge string.
 */
export async function POST(req: NextRequest) {
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "preferred",
    // allowCredentials empty → browser shows a discoverable-credentials
    // picker (account-less login). Requires residentKey at registration
    // time, which we set to "preferred" in /register/options.
  });

  await purgeExpiredChallenges();
  await prisma.passkeyChallenge.create({
    data: {
      challenge: options.challenge,
      purpose: "login",
      partnerCode: null,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  });

  return NextResponse.json(options);
}
