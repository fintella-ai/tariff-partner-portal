import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLANS, getPartnerPlan, createSubscription, cancelSubscription } from "@/lib/subscription";
import { createCustomerVault, chargeCustomerVault, addRecurringPlan, isNmiConfigured } from "@/lib/nmi-gateway";
import type { PlanId } from "@/lib/subscription";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerCode = (session.user as { partnerCode?: string }).partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  const plan = await getPartnerPlan(partnerCode);
  const sub = await prisma.subscription.findUnique({ where: { partnerCode } });

  return NextResponse.json({
    currentPlan: plan,
    subscription: sub ? {
      plan: sub.plan,
      status: sub.status,
      cardLast4: sub.cardLast4,
      cardBrand: sub.cardBrand,
      currentPeriodEnd: sub.currentPeriodEnd,
      canceledAt: sub.canceledAt,
    } : null,
    plans: PLANS,
    gatewayConfigured: isNmiConfigured(),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { partnerCode?: string; name?: string; email?: string };
  if (!user.partnerCode) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  const body = await req.json();
  const { action, plan, paymentToken } = body as { action: string; plan?: PlanId; paymentToken?: string };

  if (action === "upgrade" && plan) {
    if (plan !== "pro") {
      return NextResponse.json({ error: "Only Pro plan available for self-serve upgrade" }, { status: 400 });
    }

    const partner = await prisma.partner.findUnique({
      where: { partnerCode: user.partnerCode },
      select: { firstName: true, lastName: true, email: true },
    });
    if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

    let gatewayData: { gatewayId?: string; gatewayCustomerId?: string; cardLast4?: string; cardBrand?: string } = {};

    if (paymentToken) {
      const vaultResult = await createCustomerVault(
        paymentToken,
        partner.email,
        partner.firstName,
        partner.lastName,
      );

      if (vaultResult.response !== "1") {
        await prisma.paymentLog.create({
          data: {
            partnerCode: user.partnerCode,
            amount: PLANS.pro.priceMonthly,
            status: "failed",
            gatewayResponse: vaultResult.responsetext,
            description: "Pro upgrade — vault creation failed",
          },
        });
        return NextResponse.json({ error: vaultResult.responsetext }, { status: 400 });
      }

      const chargeResult = await chargeCustomerVault(
        vaultResult.customer_vault_id!,
        PLANS.pro.priceMonthly,
        `pro_${user.partnerCode}_${Date.now()}`,
      );

      if (chargeResult.response !== "1") {
        await prisma.paymentLog.create({
          data: {
            partnerCode: user.partnerCode,
            amount: PLANS.pro.priceMonthly,
            status: "failed",
            gatewayTxnId: chargeResult.transactionid,
            gatewayResponse: chargeResult.responsetext,
            description: "Pro upgrade — initial charge failed",
          },
        });
        return NextResponse.json({ error: chargeResult.responsetext }, { status: 400 });
      }

      const recurringResult = await addRecurringPlan(
        vaultResult.customer_vault_id!,
        PLANS.pro.priceMonthly,
        "pro",
      );

      gatewayData = {
        gatewayCustomerId: vaultResult.customer_vault_id,
        gatewayId: recurringResult.transactionid || chargeResult.transactionid,
        cardLast4: paymentToken.slice(-4),
      };

      await prisma.paymentLog.create({
        data: {
          partnerCode: user.partnerCode,
          amount: PLANS.pro.priceMonthly,
          status: "success",
          gatewayTxnId: chargeResult.transactionid,
          description: "Pro upgrade — initial charge",
        },
      });
    }

    const sub = await createSubscription(user.partnerCode, "pro", gatewayData);
    return NextResponse.json({
      subscription: { plan: sub.plan, status: sub.status, cardLast4: sub.cardLast4, currentPeriodEnd: sub.currentPeriodEnd },
      plan: PLANS.pro,
    });
  }

  if (action === "cancel") {
    const sub = await cancelSubscription(user.partnerCode, body.reason);
    return NextResponse.json({
      subscription: { plan: sub.plan, status: sub.status, canceledAt: sub.canceledAt },
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
