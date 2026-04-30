import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhook/nmi
 *
 * NMI Silent Post / Webhook endpoint for recurring billing notifications.
 *
 * NMI Setup:
 *   1. In NMI merchant portal → Settings → Webhooks / Silent Post URL
 *   2. Set URL: https://fintella.partners/api/webhook/nmi
 *   3. Enable events: recurring.success, recurring.failure, refund
 *
 * NMI sends application/x-www-form-urlencoded with transaction details.
 * We match via customer_vault_id → Subscription.gatewayCustomerId.
 */
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.NMI_WEBHOOK_SECRET;
  if (webhookSecret) {
    const url = new URL(req.url);
    const token = url.searchParams.get("secret");
    if (token !== webhookSecret) {
      return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
    }
  }

  const form = await req.formData();

  const action = String(form.get("action") || form.get("action_type") || "");
  const responseCode = String(form.get("response") || "");
  const responseText = String(form.get("responsetext") || "");
  const transactionId = String(form.get("transactionid") || form.get("transaction_id") || "");
  const customerVaultId = String(form.get("customer_vault_id") || "");
  const amount = String(form.get("amount") || "0");
  const amountCents = Math.round(parseFloat(amount) * 100) || 0;

  if (!customerVaultId) {
    return NextResponse.json({ received: true, skipped: "no customer_vault_id" });
  }

  const sub = await prisma.subscription.findFirst({
    where: { gatewayCustomerId: customerVaultId },
  });

  if (!sub) {
    return NextResponse.json({ received: true, skipped: "no matching subscription" });
  }

  const isSuccess = responseCode === "1";

  await prisma.paymentLog.create({
    data: {
      partnerCode: sub.partnerCode,
      subscriptionId: sub.id,
      amount: amountCents,
      status: isSuccess ? "success" : "failed",
      gatewayTxnId: transactionId || null,
      gatewayResponse: responseText,
      description: `Recurring ${action || "charge"} — ${isSuccess ? "success" : "failed"}`,
    },
  });

  if (isSuccess) {
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: periodEnd,
      },
    });
  } else {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: "past_due" },
    });
  }

  return NextResponse.json({ received: true, processed: true });
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    description: "NMI payment webhook. Configure Silent Post URL in NMI merchant portal.",
  });
}
