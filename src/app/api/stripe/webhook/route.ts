import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyStripeWebhookSignature } from "@/lib/stripe";

/**
 * POST /api/stripe/webhook
 *
 * Receives Stripe Connect account and transfer events. Handled:
 *   account.updated                  — sync chargesEnabled / payoutsEnabled / detailsSubmitted
 *   account.application.deauthorized — partner disconnects; mark account deauthorized
 *   transfer.failed                  — re-open commission to "due" so admin can retry
 *   transfer.reversed                — same as transfer.failed
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

  // ── account.updated ───────────────────────────────────────────────────────
  if (type === "account.updated") {
    const account = data?.object;
    if (account?.id) {
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
          console.error("[stripe/webhook] account.updated — update failed:", err);
        });
      }
    }
  }

  // ── account.application.deauthorized ─────────────────────────────────────
  // Partner explicitly disconnects their Stripe account from our platform.
  // Mark the row deauthorized so the UI can prompt them to reconnect.
  if (type === "account.application.deauthorized") {
    const account = data?.object;
    if (account?.id) {
      await prisma.stripeAccount.updateMany({
        where: { stripeAccountId: account.id },
        data: {
          status: "deauthorized",
          chargesEnabled: false,
          payoutsEnabled: false,
        },
      }).catch((err) => {
        console.error("[stripe/webhook] deauthorized — update failed:", err);
      });
      console.warn("[stripe/webhook] account.application.deauthorized", { accountId: account.id });
    }
  }

  // ── transfer.failed / transfer.reversed ───────────────────────────────────
  // A payout transfer bounced or was reversed. Find the commission by
  // stripeTransferId and flip it back to "due" so admin can retry.
  if (type === "transfer.failed" || type === "transfer.reversed") {
    const transfer = data?.object;
    if (transfer?.id) {
      const commission = await prisma.commissionLedger.findFirst({
        where: { stripeTransferId: transfer.id },
      }).catch(() => null);

      if (commission) {
        await prisma.commissionLedger.update({
          where: { id: commission.id },
          data: {
            status: "due",
            stripeTransferId: null,
            payoutDate: null,
          },
        }).catch((err) => {
          console.error("[stripe/webhook] transfer reopen failed:", err);
        });
        console.warn(`[stripe/webhook] ${type}: commission ${commission.id} re-opened to "due"`, {
          transferId: transfer.id,
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}
