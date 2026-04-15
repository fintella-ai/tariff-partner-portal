import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/partner/stripe/status
 *
 * Returns the calling partner's Stripe Connect account status from our DB.
 * Does NOT make a live Stripe API call — use the /return route after onboarding
 * to sync from Stripe.
 *
 * Response: {
 *   connected: boolean,
 *   status: string | null,   // "pending" | "onboarding" | "active" | "restricted" | null
 *   chargesEnabled: boolean,
 *   payoutsEnabled: boolean,
 *   stripeAccountId: string | null,
 *   demo: boolean,
 * }
 */
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partnerCode = (session.user as any).partnerCode as string | undefined;
  if (!partnerCode)
    return NextResponse.json({ error: "Partner session required" }, { status: 403 });

  const demo = !process.env.STRIPE_SECRET_KEY;

  const account = await prisma.stripeAccount.findUnique({
    where: { partnerCode },
  }).catch(() => null);

  return NextResponse.json({
    connected: !!account,
    status: account?.status ?? null,
    chargesEnabled: account?.chargesEnabled ?? false,
    payoutsEnabled: account?.payoutsEnabled ?? false,
    stripeAccountId: account?.stripeAccountId ?? null,
    demo,
  });
}
