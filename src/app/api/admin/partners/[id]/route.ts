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
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    // Accept either a Prisma cuid id or a partnerCode — notifications and
    // deep links have historically used both. The code path makes the
    // route forgiving so old "link by code" notifications still open.
    const needle = params.id;
    const partner = await prisma.partner.findFirst({
      where: { OR: [{ id: needle }, { partnerCode: needle.toUpperCase() }] },
    });
    if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

    // Parallel queries for related data
    const [downlineCount, downline, agreement, profile, documents, adminNotes, codeHistory, supportTickets, notifications, enterprisePartner, emailLogs, smsLogs, callLogs, inboundEmails] = await Promise.all([
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
        include: { attachments: true },
      }).catch(() => []),
      prisma.partnerCodeHistory.findMany({
        where: { partnerId: partner.id },
        orderBy: { createdAt: "desc" },
      }).catch(() => []),
      prisma.supportTicket.findMany({
        where: { partnerCode: partner.partnerCode },
        include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
        orderBy: { updatedAt: "desc" },
      }).catch(() => []),
      prisma.notification.findMany({
        where: { recipientId: partner.partnerCode },
        orderBy: { createdAt: "desc" },
        take: 50,
      }).catch(() => []),
      prisma.enterprisePartner.findUnique({
        where: { partnerCode: partner.partnerCode },
        include: { overrides: { where: { status: "active" } } },
      }).catch(() => null),
      prisma.emailLog.findMany({
        where: { partnerCode: partner.partnerCode },
        orderBy: { createdAt: "desc" },
        take: 50,
      }).catch(() => []),
      prisma.smsLog.findMany({
        where: { partnerCode: partner.partnerCode },
        orderBy: { createdAt: "desc" },
        take: 50,
      }).catch(() => []),
      prisma.callLog.findMany({
        where: { partnerCode: partner.partnerCode },
        orderBy: { createdAt: "desc" },
        take: 50,
      }).catch(() => []),
      // Inbound emails received via SendGrid Inbound Parse. Matched by
      // partnerCode (resolved at webhook time) OR by the partner's primary
      // email address — covers the case where a partner emails us from a
      // secondary address we hadn't seen before but their main email is
      // in the From header.
      prisma.inboundEmail.findMany({
        where: {
          OR: [
            { partnerCode: partner.partnerCode },
            { fromEmail: partner.email.toLowerCase() },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 50,
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

    // Auto-reconcile: if there's an approved agreement document but the
    // PartnershipAgreement record is still under_review, fix it now.
    // Skip agreements sent via SignWell (have a signwellDocumentId) —
    // those should only transition via the document_completed webhook.
    let reconciledAgreement = agreement;
    if (agreement && !agreement.signwellDocumentId && (agreement.status === "under_review" || agreement.status === "pending")) {
      const hasApprovedDoc = (documents as any[]).some(
        (d: any) => d.docType === "agreement" && d.status === "approved"
      );
      if (hasApprovedDoc) {
        reconciledAgreement = await prisma.partnershipAgreement.update({
          where: { id: agreement.id },
          data: { status: "approved", signedDate: agreement.signedDate || new Date() },
        });
      }
    }

    return NextResponse.json({ partner, downlineCount, downline, agreement: reconciledAgreement, profile, documents, l3Partners, adminNotes, codeHistory, supportTickets, notifications, enterprisePartner, emailLogs, smsLogs, callLogs, inboundEmails });
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
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const data: Record<string, any> = {};

    // Basic info
    if (body.firstName !== undefined) data.firstName = body.firstName;
    if (body.lastName !== undefined) data.lastName = body.lastName;
    if (body.email !== undefined) data.email = body.email;
    if (body.phone !== undefined) data.phone = body.phone || null;
    if (body.companyName !== undefined) data.companyName = body.companyName || null;
    if (body.title !== undefined) data.title = body.title || null;
    if (body.tin !== undefined) data.tin = body.tin || null;
    if (body.mobilePhone !== undefined) data.mobilePhone = body.mobilePhone || null;
    if (body.status !== undefined) data.status = body.status;
    if (body.referredByPartnerCode !== undefined) data.referredByPartnerCode = body.referredByPartnerCode || null;
    if (body.notes !== undefined) data.notes = body.notes || null;

    if (body.l3Enabled !== undefined) data.l3Enabled = body.l3Enabled;

    // Tier + commission-rate changes retroactively affect a partner's
    // downline recruitment rights + commission math, so gate both to
    // super_admin. These were silently dropped from the allow-list
    // historically, which meant admins editing a partner row could
    // flip the dropdown without the DB ever taking the update — Adam
    // Ghabour (PTNVFJXPV) is the canary here: frontend shows "L2 at
    // 20%" because creation set it that way and nothing post-creation
    // could correct it.
    if (body.tier !== undefined) {
      if (role !== "super_admin") {
        return NextResponse.json({ error: "Only super admins can change a partner's tier" }, { status: 403 });
      }
      const t = String(body.tier).toLowerCase();
      if (!["l1", "l2", "l3"].includes(t)) {
        return NextResponse.json({ error: "tier must be l1, l2, or l3" }, { status: 400 });
      }
      data.tier = t;
    }
    if (body.commissionRate !== undefined) {
      if (role !== "super_admin") {
        return NextResponse.json({ error: "Only super admins can change a partner's commission rate" }, { status: 403 });
      }
      const r = parseFloat(String(body.commissionRate));
      if (!isFinite(r) || r <= 0 || r > 0.3) {
        return NextResponse.json({ error: "commissionRate must be between 0 (exclusive) and 0.30" }, { status: 400 });
      }
      data.commissionRate = r;
    }

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
    if (body.payoutMethod !== undefined) profileFields.payoutMethod = body.payoutMethod || null;
    if (body.bankName !== undefined) profileFields.bankName = body.bankName || null;
    if (body.accountType !== undefined) profileFields.accountType = body.accountType || null;
    if (body.routingNumber !== undefined) profileFields.routingNumber = body.routingNumber || null;
    if (body.accountNumber !== undefined) profileFields.accountNumber = body.accountNumber || null;
    if (body.beneficiaryName !== undefined) profileFields.beneficiaryName = body.beneficiaryName || null;
    if (body.bankStreet !== undefined) profileFields.bankStreet = body.bankStreet || null;
    if (body.bankStreet2 !== undefined) profileFields.bankStreet2 = body.bankStreet2 || null;
    if (body.bankCity !== undefined) profileFields.bankCity = body.bankCity || null;
    if (body.bankState !== undefined) profileFields.bankState = body.bankState || null;
    if (body.bankZip !== undefined) profileFields.bankZip = body.bankZip || null;

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
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    await prisma.partner.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete partner" }, { status: 500 });
  }
}
