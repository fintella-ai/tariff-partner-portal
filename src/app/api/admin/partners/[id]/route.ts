import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashSync } from "bcryptjs";

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

    // Parallel queries for related data
    const [downlineCount, downline, agreement, profile, documents, adminNotes, codeHistory] = await Promise.all([
      prisma.partner.count({
        where: { referredByPartnerCode: partner.partnerCode },
      }),
      prisma.partner.findMany({
        where: { referredByPartnerCode: partner.partnerCode },
        orderBy: { createdAt: "desc" },
      }),
      prisma.partnershipAgreement.findFirst({
        where: { partnerCode: partner.partnerCode },
        orderBy: { version: "desc" },
      }).catch(() => null),
      prisma.partnerProfile.findUnique({
        where: { partnerCode: partner.partnerCode },
      }).catch(() => null),
      prisma.document.findMany({
        where: { partnerCode: partner.partnerCode },
        orderBy: { createdAt: "desc" },
      }).catch(() => []),
      prisma.adminNote.findMany({
        where: { partnerCode: partner.partnerCode },
        orderBy: { createdAt: "desc" },
      }).catch(() => []),
      prisma.partnerCodeHistory.findMany({
        where: { partnerId: partner.id },
        orderBy: { createdAt: "desc" },
      }).catch(() => []),
    ]);

    // L3 downline (partners recruited by L2 partners)
    const downlineCodes = downline.map((p: any) => p.partnerCode);
    const l3Partners = downlineCodes.length > 0
      ? await prisma.partner.findMany({
          where: { referredByPartnerCode: { in: downlineCodes } },
          orderBy: { createdAt: "desc" },
        })
      : [];

    return NextResponse.json({ partner, downlineCount, downline, agreement, profile, documents, l3Partners, adminNotes, codeHistory });
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
    if (body.companyName !== undefined) data.companyName = body.companyName || null;
    if (body.tin !== undefined) data.tin = body.tin || null;
    if (body.mobilePhone !== undefined) data.mobilePhone = body.mobilePhone || null;
    if (body.status !== undefined) data.status = body.status;
    if (body.referredByPartnerCode !== undefined) data.referredByPartnerCode = body.referredByPartnerCode || null;
    if (body.notes !== undefined) data.notes = body.notes || null;

    // Commission overrides
    if (body.l1Rate !== undefined) data.l1Rate = body.l1Rate != null ? parseFloat(body.l1Rate) : null;
    if (body.l2Rate !== undefined) data.l2Rate = body.l2Rate != null ? parseFloat(body.l2Rate) : null;
    if (body.l3Rate !== undefined) data.l3Rate = body.l3Rate != null ? parseFloat(body.l3Rate) : null;
    if (body.l3Enabled !== undefined) data.l3Enabled = body.l3Enabled;

    // Generate new partner code (preserves old code in history)
    if (body.resetPartnerCode) {
      // Only super_admin can do this (enforced on frontend, double-check here)
      if (role !== "super_admin") {
        return NextResponse.json({ error: "Only super admins can generate new partner codes" }, { status: 403 });
      }

      const currentPartner = await prisma.partner.findUnique({ where: { id: params.id } });
      if (!currentPartner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let code = "PTN";
      for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];

      // Save old code to history before changing
      await prisma.partnerCodeHistory.create({
        data: {
          partnerId: currentPartner.id,
          oldCode: currentPartner.partnerCode,
          newCode: code,
          changedBy: session.user.email || "admin",
        },
      });

      data.partnerCode = code;
    }

    // Set/reset partner password
    if (body.newPassword) {
      if (body.newPassword.length < 6) {
        return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
      }
      data.passwordHash = hashSync(body.newPassword, 10);
    }

    const partner = await prisma.partner.update({
      where: { id: params.id },
      data,
    });

    // Update PartnerProfile (address) if any address fields provided
    const profileFields: Record<string, any> = {};
    if (body.street !== undefined) profileFields.street = body.street || null;
    if (body.street2 !== undefined) profileFields.street2 = body.street2 || null;
    if (body.city !== undefined) profileFields.city = body.city || null;
    if (body.state !== undefined) profileFields.state = body.state || null;
    if (body.zip !== undefined) profileFields.zip = body.zip || null;

    if (Object.keys(profileFields).length > 0) {
      await prisma.partnerProfile.upsert({
        where: { partnerCode: partner.partnerCode },
        create: { partnerCode: partner.partnerCode, ...profileFields },
        update: profileFields,
      });
    }

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
