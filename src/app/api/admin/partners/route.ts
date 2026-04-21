import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/format";

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
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

    // Fetch agreement and W9 status for each partner
    const partnerCodes = partners.map((p: any) => p.partnerCode);

    const [agreements, w9Docs] = await Promise.all([
      prisma.partnershipAgreement.findMany({
        where: { partnerCode: { in: partnerCodes } },
        orderBy: { version: "desc" },
        distinct: ["partnerCode"],
        select: { partnerCode: true, status: true },
      }),
      prisma.document.findMany({
        where: { partnerCode: { in: partnerCodes }, docType: "w9" },
        orderBy: { createdAt: "desc" },
        distinct: ["partnerCode"],
        select: { partnerCode: true, status: true },
      }),
    ]);

    const agreementMap: Record<string, string> = {};
    agreements.forEach((a: any) => { agreementMap[a.partnerCode] = a.status; });

    const w9Map: Record<string, string> = {};
    w9Docs.forEach((d: any) => { w9Map[d.partnerCode] = d.status; });

    const enriched = partners.map((p: any) => ({
      ...p,
      agreementStatus: agreementMap[p.partnerCode] || "none",
      w9Status: w9Map[p.partnerCode] || "needed",
    }));

    return NextResponse.json({ partners: enriched });
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
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

    // Tier + commission rate. Accept optional body fields; fall back to L1 @ 25%
    // (Prisma defaults) if the admin didn't pass them. Custom rates are allowed
    // in (0, 0.50] — same envelope as the L1 invite flow.
    const tier = (typeof body.tier === "string" && ["l1", "l2", "l3"].includes(body.tier))
      ? body.tier
      : "l1";
    let commissionRate: number | undefined = undefined;
    if (body.commissionRate != null) {
      const r = parseFloat(body.commissionRate);
      if (!isFinite(r) || r <= 0 || r > 0.5) {
        return NextResponse.json(
          { error: "Commission rate must be between 1% and 50%." },
          { status: 400 }
        );
      }
      commissionRate = r;
    }

    const partner = await prisma.partner.create({
      data: {
        partnerCode,
        email: body.email,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: normalizePhone(body.phone),
        status: body.status || "active",
        referredByPartnerCode: body.referredByPartnerCode || null,
        l3Enabled: body.l3Enabled || false,
        notes: body.notes || null,
        tier,
        ...(commissionRate !== undefined && { commissionRate }),
      },
    });

    return NextResponse.json({ partner }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create partner" }, { status: 500 });
  }
}
