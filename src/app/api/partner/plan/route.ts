import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPartnerPlan } from "@/lib/subscription";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerCode = (session.user as { partnerCode?: string }).partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  const plan = await getPartnerPlan(partnerCode);

  return NextResponse.json({
    plan: plan.id,
    name: plan.name,
    limits: plan.limits,
  });
}
