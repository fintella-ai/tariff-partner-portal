import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_ROLES = ["super_admin", "admin"];

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes((session.user as any).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const leads = await prisma.partnerLead.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ leads });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes((session.user as any).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { firstName, lastName, email, phone, commissionRate, tier, referredByCode, notes } = body;

  if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "First name, last name, and email are required" }, { status: 400 });
  }

  const rate = typeof commissionRate === "number" ? Math.min(0.30, Math.max(0.10, commissionRate)) : 0.25;
  const validTier = ["l1", "l2", "l3"].includes(tier) ? tier : "l1";

  const lead = await prisma.partnerLead.create({
    data: {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || null,
      commissionRate: rate,
      tier: validTier,
      referredByCode: referredByCode?.trim() || null,
      notes: notes?.trim() || null,
    },
  });

  return NextResponse.json({ lead }, { status: 201 });
}
