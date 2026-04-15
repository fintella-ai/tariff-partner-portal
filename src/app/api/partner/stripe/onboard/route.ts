import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createExpressAccount,
  createAccountLink,
} from "@/lib/stripe";

const PORTAL_URL =
  process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://fintella.partners";

/**
 * POST /api/partner/stripe/onboard
 *
 * Creates (or re-opens) a Stripe Express onboarding link for the calling partner.
 * If the partner already has a StripeAccount row, we skip account creation and
 * jump straight to generating a new account link so they can resume/redo KYC.
 *
 * Demo-gated: when STRIPE_SECRET_KEY is unset, returns a demo payload so the
 * UI can render the "Connect Stripe" flow without erroring.
 *
 * Response: { url: string, demo?: true }
 */
export async function POST(_req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partnerCode = (session.user as any).partnerCode as string | undefined;
  if (!partnerCode)
    return NextResponse.json({ error: "Partner session required" }, { status: 403 });

  // Demo mode — Stripe not configured
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({
      demo: true,
      url: null,
      message: "Stripe Connect is not yet configured in this environment.",
    });
  }

  try {
    // Fetch partner email for account creation
    const partner = await prisma.partner.findFirst({
      where: { partnerCode },
      select: { email: true },
    });
    if (!partner)
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });

    let stripeAccountId: string;

    const existing = await prisma.stripeAccount.findUnique({
      where: { partnerCode },
    });

    if (existing) {
      stripeAccountId = existing.stripeAccountId;
    } else {
      // Create a new Express account
      const account = await createExpressAccount({ email: partner.email });
      if (!account) throw new Error("Stripe account creation returned null");

      await prisma.stripeAccount.create({
        data: {
          partnerCode,
          stripeAccountId: account.id,
          status: "onboarding",
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted,
          country: account.country || "US",
        },
      });

      stripeAccountId = account.id;
    }

    // Generate an onboarding link
    const link = await createAccountLink({
      accountId: stripeAccountId,
      refreshUrl: `${PORTAL_URL}/api/partner/stripe/return?refresh=1`,
      returnUrl: `${PORTAL_URL}/dashboard/commissions?stripe_return=1`,
    });
    if (!link) throw new Error("Stripe account link returned null");

    return NextResponse.json({ url: link.url });
  } catch (err: any) {
    console.error("[stripe/onboard]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to start Stripe onboarding" },
      { status: 500 }
    );
  }
}
