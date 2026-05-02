import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPortalTier, PORTAL_FEATURE_TIERS } from "@/lib/subscription";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (!role || !["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tier = await getPortalTier();
  return NextResponse.json({ tier, features: PORTAL_FEATURE_TIERS });
}
