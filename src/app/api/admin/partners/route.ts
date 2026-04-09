import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function generatePartnerCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "PTN";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/**
 * GET /api/admin/partners
 * List all partners with optional search.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const search = req.nextUrl.searchParams.get("search") || "";

    let partners;
    if (search) {
      partners = await prisma.partner.findMany({
        where: {
          OR: [
            { firstName: { contains: search } },
            { lastName: { contains: search } },
            { email: { contains: search } },
            { partnerCode: { contains: search.toUpperCase() } },
          ],
        },
        orderBy: { createdAt: "desc" },
      });
    } else {
      partners = await prisma.partner.findMany({ orderBy: { createdAt: "desc" } });
    }

    return NextResponse.json({ partners });
  } catch {
    return NextResponse.json({ error: "Failed to fetch partners" }, { status: 500 });
  }
}

/**
 * POST /api/admin/partners
 * Create a new partner.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();

    const partnerCode = body.partnerCode?.trim().toUpperCase() || generatePartnerCode();

    // Check for duplicate code or email
    const existing = await prisma.partner.findFirst({
      where: { OR: [{ partnerCode }, { email: body.email }] },
    });
    if (existing) {
      return NextResponse.json(
        { error: existing.partnerCode === partnerCode ? "Partner code already exists" : "Email already registered" },
        { status: 400 }
      );
    }

    const partner = await prisma.partner.create({
      data: {
        partnerCode,
        email: body.email,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone || null,
        status: body.status || "active",
        referredByPartnerCode: body.referredByPartnerCode || null,
        l1Rate: body.l1Rate != null ? parseFloat(body.l1Rate) : null,
        l2Rate: body.l2Rate != null ? parseFloat(body.l2Rate) : null,
        l3Rate: body.l3Rate != null ? parseFloat(body.l3Rate) : null,
        l3Enabled: body.l3Enabled || false,
        notes: body.notes || null,
      },
    });

    return NextResponse.json({ partner }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create partner" }, { status: 500 });
  }
}
