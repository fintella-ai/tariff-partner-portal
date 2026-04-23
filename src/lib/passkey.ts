/**
 * WebAuthn / Passkey server-side helpers.
 *
 * Central configuration for the Relying Party (Fintella Partner Portal)
 * and a tiny purge utility that every verify endpoint calls to sweep
 * expired challenges. No cron needed — the purge is opportunistic on
 * every verify, which keeps the table tiny and the queries fast.
 *
 * `rpID` MUST match the site's eTLD+1 (no scheme, no port). Passkey
 * registrations are scoped to that ID, so changing it later invalidates
 * every existing credential. We derive it from NEXT_PUBLIC_PORTAL_URL
 * when set so previews on *.vercel.app also work during QA — falling
 * back to "fintella.partners" in production where the env var is unset.
 */

import { prisma } from "./prisma";

const PORTAL_URL =
  (process.env.NEXT_PUBLIC_PORTAL_URL || "https://fintella.partners").replace(/\/$/, "");

export const RP_NAME = "Fintella Partner Portal";
export const RP_ID = new URL(PORTAL_URL).hostname;
export const ORIGIN = PORTAL_URL;

export const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 min — plenty for a human to approve

/**
 * Delete any PasskeyChallenge rows whose expiresAt is in the past.
 * Safe to call on every verify — one cheap DELETE against an indexed column.
 */
export async function purgeExpiredChallenges(): Promise<void> {
  await prisma.passkeyChallenge.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}
