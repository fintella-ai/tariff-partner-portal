/**
 * Stripe Connect — raw fetch client (no SDK, consistent with SendGrid/Twilio pattern).
 * Demo-gated: every function is a no-op when STRIPE_SECRET_KEY is unset.
 *
 * API version pinned to 2024-06-20.
 */

const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_VERSION = "2024-06-20";

function enabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

function headers(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded",
    "Stripe-Version": STRIPE_VERSION,
  };
}

async function stripePost<T = any>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: headers(),
    body: new URLSearchParams(params).toString(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `Stripe ${path} failed (${res.status})`);
  return json as T;
}

async function stripeGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${STRIPE_API}${path}`, { headers: headers() });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `Stripe GET ${path} failed (${res.status})`);
  return json as T;
}

// ─── Account creation ────────────────────────────────────────────────────────

export interface StripeAccountObject {
  id: string;
  object: "account";
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  country: string;
}

/**
 * Create a Stripe Express connected account for a partner.
 * Returns null (demo mode) when STRIPE_SECRET_KEY is unset.
 */
export async function createExpressAccount(params: {
  email: string;
  country?: string;
}): Promise<StripeAccountObject | null> {
  if (!enabled()) return null;
  return stripePost<StripeAccountObject>("/accounts", {
    type: "express",
    country: params.country || "US",
    email: params.email,
    "capabilities[transfers][requested]": "true",
  });
}

/**
 * Retrieve the current state of a connected account.
 * Returns null (demo mode) when STRIPE_SECRET_KEY is unset.
 */
export async function retrieveAccount(accountId: string): Promise<StripeAccountObject | null> {
  if (!enabled()) return null;
  return stripeGet<StripeAccountObject>(`/accounts/${accountId}`);
}

// ─── Account links ───────────────────────────────────────────────────────────

export interface StripeAccountLink {
  url: string;
  expires_at: number;
}

/**
 * Create a Stripe account link for onboarding or re-onboarding.
 * Returns null (demo mode) when STRIPE_SECRET_KEY is unset.
 */
export async function createAccountLink(params: {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}): Promise<StripeAccountLink | null> {
  if (!enabled()) return null;
  return stripePost<StripeAccountLink>("/account_links", {
    account: params.accountId,
    refresh_url: params.refreshUrl,
    return_url: params.returnUrl,
    type: "account_onboarding",
  });
}

// ─── Transfers ───────────────────────────────────────────────────────────────

export interface StripeTransfer {
  id: string;
  object: "transfer";
  amount: number;
  currency: string;
  destination: string;
}

/**
 * Send funds to a connected account.
 * amountCents is in cents (USD: multiply dollars x 100).
 * Returns null (demo mode) when STRIPE_SECRET_KEY is unset.
 */
export async function createTransfer(params: {
  amountCents: number;
  destination: string; // Stripe account ID (acct_xxx)
  description?: string;
  metadata?: Record<string, string>;
}): Promise<StripeTransfer | null> {
  if (!enabled()) return null;
  const p: Record<string, string> = {
    amount: String(params.amountCents),
    currency: "usd",
    destination: params.destination,
  };
  if (params.description) p.description = params.description;
  if (params.metadata) {
    for (const [k, v] of Object.entries(params.metadata)) {
      p[`metadata[${k}]`] = v;
    }
  }
  return stripePost<StripeTransfer>("/transfers", p);
}

// ─── Webhook signature verification ─────────────────────────────────────────

import crypto from "crypto";

/**
 * Verify a Stripe webhook signature. Returns true when valid or when
 * STRIPE_WEBHOOK_SECRET is unset (demo mode — accept all).
 */
export function verifyStripeWebhookSignature(
  rawBody: string,
  sigHeader: string
): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return true; // demo mode — no enforcement

  const parts = Object.fromEntries(
    sigHeader.split(",").map((p) => p.split("=") as [string, string])
  );
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;

  const payload = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(signature, "hex")
  );
}
