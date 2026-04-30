import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enrollLeadsInCampaign } from "@/lib/campaign-engine";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = ["super_admin", "admin"];

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (!role || !ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const leadIds = body.leadIds as string[] | undefined;

  const result = await enrollLeadsInCampaign(params.id, leadIds);

  return NextResponse.json(result);
}
