// src/lib/partnerDmRateLimit.ts
import { prisma } from "@/lib/prisma";

const BASELINE_PER_HOUR = 60;
const THROTTLED_PER_HOUR = 1;
const WINDOW_MS = 60 * 60 * 1000;

// In-memory sliding window per serverless instance, keyed by senderPartnerCode.
const store = new Map<string, number[]>();

export type RateLimitCheck =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Gate a message POST against the sender's rate + throttle + suspend state.
 * Returns ok=true if the send is allowed and records the timestamp.
 */
export async function checkPartnerDmRateLimit(senderPartnerCode: string): Promise<RateLimitCheck> {
  // Check suspend / throttle state first.
  const throttle = await prisma.partnerDmThrottle.findUnique({
    where: { partnerCode: senderPartnerCode },
  });
  const active = throttle && !throttle.liftedAt ? throttle : null;

  if (active?.state === "suspended") {
    return { ok: false, status: 403, error: "DM privileges suspended pending review" };
  }

  const cap = active?.state === "throttled" ? THROTTLED_PER_HOUR : BASELINE_PER_HOUR;

  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const arr = (store.get(senderPartnerCode) || []).filter((t) => t > windowStart);
  if (arr.length >= cap) {
    return { ok: false, status: 429, error: "Rate limit exceeded" };
  }
  arr.push(now);
  store.set(senderPartnerCode, arr);
  return { ok: true };
}
