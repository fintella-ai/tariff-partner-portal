import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { retrieveAccount, createAccountLink } from "@/lib/stripe";

const PORTAL_URL =
  process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://fintella.partners";

/**
 * GET /api/partner/stripe/return
 *
 * Stripe redirects here after onboarding (both on completion and on refresh/expiry).
 * We sync the account's current state from Stripe into our DB, then redirect the
 * partner back to the commissions page.
 *
 * ?refresh=1 => Stripe sent the partner back because the link expired; generate
 *               a new account link and redirect them back to Stripe so they can
 *               finish onboarding.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", PORTAL_URL));
  }

  const partnerCode = (session.user as any).partnerCode as string | undefined;
  if (!partnerCode) {
    return NextResponse.redirect(new URL("/dashboard/commissions", PORTAL_URL));
  }

  const isRefresh = req.nextUrl.searchParams.get("refresh") === "1";

  const record = await prisma.stripeAccount.findUnique({
    where: { partnerCode },
  }).catch(() => null);

  if (!record) {
    return NextResponse.redirect(new URL("/dashboard/commissions", PORTAL_URL));
  }

  if (isRefresh) {
    // Link expired — generate a fresh one and redirect back to Stripe
    try {
      const link = await createAccountLink({
        accountId: record.stripeAccountId,
        refreshUrl: `${PORTAL_URL}/api/partner/stripe/return?refresh=1`,
        returnUrl: `${PORTAL_URL}/dashboard/commissions?stripe_return=1`,
      });
      if (link?.url) return NextResponse.redirect(link.url);
    } catch (err) {
      console.error("[stripe/return] refresh link failed:", err);
    }
    return NextResponse.redirect(new URL("/dashboard/commissions?stripe_error=1", PORTAL_URL));
  }

  // Normal return — sync account status from Stripe
  try {
    const account = await retrieveAccount(record.stripeAccountId);
    if (account) {
      const newStatus = account.payouts_enabled
        ? "active"
        : account.details_submitted
        ? "restricted"
        : "onboarding";

      await prisma.stripeAccount.update({
        where: { partnerCode },
        data: {
          status: newStatus,
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted,
        },
      });
    }
  } catch (err) {
    console.error("[stripe/return] account sync failed:", err);
  }

  return NextResponse.redirect(new URL("/dashboard/commissions?stripe_return=1", PORTAL_URL));
}
