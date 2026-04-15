import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyStripeWebhookSignature } from "@/lib/stripe";

/**
 * POST /api/stripe/webhook
 *
 * Receives Stripe Connect account events. Today we handle:
 *   account.updated — sync chargesEnabled / payoutsEnabled / detailsSubmitted
 *
 * Signature verification: enforced when STRIPE_WEBHOOK_SECRET is set; in
 * demo mode (no secret) all requests are accepted.
 *
 * This route is excluded from auth middleware (all /api/* routes are excluded).
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature") || "";

  if (!verifyStripeWebhookSignature(rawBody, sig)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, data } = event;

  if (type === "account.updated") {
    const account = data?.object;
    if (!account?.id) {
      return NextResponse.json({ received: true });
    }

    const existing = await prisma.stripeAccount.findUnique({
      where: { stripeAccountId: account.id },
    }).catch(() => null);

    if (existing) {
      const newStatus = account.payouts_enabled
        ? "active"
        : account.details_submitted
        ? "restricted"
        : "onboarding";

      await prisma.stripeAccount.update({
        where: { stripeAccountId: account.id },
        data: {
          status: newStatus,
          chargesEnabled: !!account.charges_enabled,
          payoutsEnabled: !!account.payouts_enabled,
          detailsSubmitted: !!account.details_submitted,
        },
      }).catch((err) => {
        console.error("[stripe/webhook] update failed:", err);
      });
    }
  }

  return NextResponse.json({ received: true });
}
