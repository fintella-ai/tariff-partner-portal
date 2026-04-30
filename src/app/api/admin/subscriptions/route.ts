import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createSubscription } from "@/lib/subscription";
import type { PlanId } from "@/lib/subscription";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = ["super_admin", "admin"];

export async function GET(_req: NextRequest) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (!role || !ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const subscriptions = await prisma.subscription.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      partner: { select: { firstName: true, lastName: true, email: true, companyName: true, partnerType: true } },
    },
  });

  const stats = {
    total: subscriptions.length,
    free: subscriptions.filter((s) => s.plan === "free").length,
    pro: subscriptions.filter((s) => s.plan === "pro" && s.status === "active").length,
    enterprise: subscriptions.filter((s) => s.plan === "enterprise" && s.status === "active").length,
    mrr: subscriptions
      .filter((s) => s.status === "active")
      .reduce((sum, s) => sum + s.priceMonthly, 0),
  };

  return NextResponse.json({ subscriptions, stats });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (!role || !ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { partnerCode, plan } = body as { partnerCode: string; plan: PlanId };

  if (!partnerCode || !plan) {
    return NextResponse.json({ error: "partnerCode and plan required" }, { status: 400 });
  }

  const sub = await createSubscription(partnerCode, plan);
  return NextResponse.json({ subscription: sub });
}
