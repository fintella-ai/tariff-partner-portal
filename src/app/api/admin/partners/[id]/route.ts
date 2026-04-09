import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/partners/[id]
 * Get a single partner by ID.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const partner = await prisma.partner.findUnique({ where: { id: params.id } });
    if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

    // Get downline count
    const downlineCount = await prisma.partner.count({
      where: { referredByPartnerCode: partner.partnerCode },
    });

    // Get downline partners
    const downline = await prisma.partner.findMany({
      where: { referredByPartnerCode: partner.partnerCode },
      orderBy: { createdAt: "desc" },
    });

    // Get agreement status
    const agreement = await prisma.partnershipAgreement.findFirst({
      where: { partnerCode: partner.partnerCode },
      orderBy: { version: "desc" },
    }).catch(() => null);

    return NextResponse.json({ partner, downlineCount, downline, agreement });
  } catch {
    return NextResponse.json({ error: "Failed to fetch partner" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/partners/[id]
 * Update a partner's info, status, or commission rates.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const data: Record<string, any> = {};

    // Basic info
    if (body.firstName !== undefined) data.firstName = body.firstName;
    if (body.lastName !== undefined) data.lastName = body.lastName;
    if (body.email !== undefined) data.email = body.email;
    if (body.phone !== undefined) data.phone = body.phone || null;
    if (body.status !== undefined) data.status = body.status;
    if (body.referredByPartnerCode !== undefined) data.referredByPartnerCode = body.referredByPartnerCode || null;
    if (body.notes !== undefined) data.notes = body.notes || null;

    // Commission overrides
    if (body.l1Rate !== undefined) data.l1Rate = body.l1Rate != null ? parseFloat(body.l1Rate) : null;
    if (body.l2Rate !== undefined) data.l2Rate = body.l2Rate != null ? parseFloat(body.l2Rate) : null;
    if (body.l3Rate !== undefined) data.l3Rate = body.l3Rate != null ? parseFloat(body.l3Rate) : null;
    if (body.l3Enabled !== undefined) data.l3Enabled = body.l3Enabled;

    // Reset partner code (regenerate)
    if (body.resetPartnerCode) {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let code = "PTN";
      for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
      data.partnerCode = code;
    }

    const partner = await prisma.partner.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({ partner });
  } catch {
    return NextResponse.json({ error: "Failed to update partner" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/partners/[id]
 * Delete a partner.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    await prisma.partner.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete partner" }, { status: 500 });
  }
}
