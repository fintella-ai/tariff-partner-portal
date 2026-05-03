import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit, diffFields } from "@/lib/audit-log";

/**
 * GET /api/admin/deals/[id]
 * Get a single deal with its notes.
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
    const deal = await prisma.deal.findUnique({ where: { id: params.id } });
    if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

    const dealNotes = await prisma.dealNote.findMany({
      where: { dealId: params.id },
      orderBy: { createdAt: "desc" },
      include: { attachments: true },
    });

    return NextResponse.json({ deal, dealNotes });
  } catch {
    return NextResponse.json({ error: "Failed to fetch deal" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/deals/[id]
 * Update a deal (stage, amounts, notes, etc.)
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

    const strOrNull = (v: any) =>
      v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim();

    if (body.dealName !== undefined) data.dealName = body.dealName;
    if (body.clientFirstName !== undefined) data.clientFirstName = strOrNull(body.clientFirstName);
    if (body.clientLastName !== undefined) data.clientLastName = strOrNull(body.clientLastName);
    if (body.clientName !== undefined) data.clientName = strOrNull(body.clientName);
    if (body.clientEmail !== undefined) data.clientEmail = strOrNull(body.clientEmail);
    if (body.clientPhone !== undefined) data.clientPhone = strOrNull(body.clientPhone);
    if (body.clientTitle !== undefined) data.clientTitle = strOrNull(body.clientTitle);
    if (body.serviceOfInterest !== undefined) data.serviceOfInterest = strOrNull(body.serviceOfInterest);
    if (body.legalEntityName !== undefined) data.legalEntityName = strOrNull(body.legalEntityName);
    if (body.businessCity !== undefined) data.businessCity = strOrNull(body.businessCity);
    if (body.businessState !== undefined) data.businessState = strOrNull(body.businessState);
    if (body.importsGoods !== undefined) data.importsGoods = strOrNull(body.importsGoods);
    if (body.importCountries !== undefined) data.importCountries = strOrNull(body.importCountries);
    if (body.annualImportValue !== undefined) data.annualImportValue = strOrNull(body.annualImportValue);
    if (body.importerOfRecord !== undefined) data.importerOfRecord = strOrNull(body.importerOfRecord);
    if (body.isImporterOfRecord !== undefined) {
      data.isImporterOfRecord = Boolean(body.isImporterOfRecord);
      data.serviceOfInterest = `Tariff Refund Support (${body.isImporterOfRecord ? "Tier 1" : "Tier 2"})`;
    }
    if (body.stage !== undefined) data.stage = body.stage;
    if (body.productType !== undefined) data.productType = body.productType || null;
    if (body.importedProducts !== undefined) data.importedProducts = body.importedProducts || null;
    if (body.estimatedRefundAmount !== undefined) data.estimatedRefundAmount = parseFloat(body.estimatedRefundAmount) || 0;
    if (body.actualRefundAmount !== undefined) {
      const v = body.actualRefundAmount;
      data.actualRefundAmount = v === null || v === "" ? null : (parseFloat(v) || 0);
    }
    if (body.firmFeeRate !== undefined) data.firmFeeRate = body.firmFeeRate != null ? parseFloat(body.firmFeeRate) : null;
    if (body.firmFeeAmount !== undefined) data.firmFeeAmount = parseFloat(body.firmFeeAmount) || 0;
    if (body.l1CommissionAmount !== undefined) data.l1CommissionAmount = parseFloat(body.l1CommissionAmount) || 0;
    if (body.l1CommissionStatus !== undefined) data.l1CommissionStatus = body.l1CommissionStatus;
    if (body.l2CommissionAmount !== undefined) data.l2CommissionAmount = parseFloat(body.l2CommissionAmount) || 0;
    if (body.l2CommissionStatus !== undefined) data.l2CommissionStatus = body.l2CommissionStatus;
    if (body.l3CommissionAmount !== undefined) data.l3CommissionAmount = parseFloat(body.l3CommissionAmount) || 0;
    if (body.l3CommissionStatus !== undefined) data.l3CommissionStatus = body.l3CommissionStatus;
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (body.affiliateNotes !== undefined) data.affiliateNotes = body.affiliateNotes || null;
    if (body.closeDate !== undefined) data.closeDate = body.closeDate ? new Date(body.closeDate) : null;
    if (body.externalDealId !== undefined) data.externalDealId = strOrNull(body.externalDealId);
    if (body.companyEin !== undefined) data.companyEin = strOrNull(body.companyEin);
    if (body.businessStreetAddress !== undefined) data.businessStreetAddress = strOrNull(body.businessStreetAddress);
    if (body.businessStreetAddress2 !== undefined) data.businessStreetAddress2 = strOrNull(body.businessStreetAddress2);
    if (body.businessZip !== undefined) data.businessZip = strOrNull(body.businessZip);
    if (body.closedLostReason !== undefined) data.closedLostReason = strOrNull(body.closedLostReason);

    // EP Level 1 — only super_admin may change this. Reject the whole
    // request if a non-super_admin tries, rather than silently dropping
    // the field, so the caller knows their attempted edit didn't land.
    if (body.epLevel1 !== undefined) {
      if (role !== "super_admin") {
        return NextResponse.json(
          { error: "Only super_admin can edit EP Level 1" },
          { status: 403 }
        );
      }
      data.epLevel1 = strOrNull(body.epLevel1);
    }

    // Partner reassignment — super_admin only. Some deals come in with an
    // invalid partnerCode (partner shared a malformed referral link) and
    // render as "Unknown" everywhere. This lets super_admin swap the
    // partnerCode to the real one so the deal attributes + commission
    // chain work going forward. Verified against the Partner table so the
    // reassignment can only resolve to a real row.
    if (body.partnerCode !== undefined) {
      if (role !== "super_admin") {
        return NextResponse.json(
          { error: "Only super_admin can reassign the submitting partner" },
          { status: 403 }
        );
      }
      const newCode = String(body.partnerCode || "").trim().toUpperCase();
      if (!newCode) {
        return NextResponse.json(
          { error: "partnerCode cannot be blank" },
          { status: 400 }
        );
      }
      const exists = await prisma.partner.findUnique({
        where: { partnerCode: newCode },
        select: { partnerCode: true },
      });
      if (!exists) {
        return NextResponse.json(
          { error: `No partner found with code ${newCode}` },
          { status: 400 }
        );
      }
      data.partnerCode = newCode;
    }

    const before = await prisma.deal.findUnique({ where: { id: params.id } });
    const deal = await prisma.deal.update({
      where: { id: params.id },
      data,
    });

    logAudit({
      action: "deal.update",
      actorEmail: session.user.email || "unknown",
      actorRole: (session.user as any).role || "unknown",
      actorId: session.user.id,
      targetType: "deal",
      targetId: deal.id,
      details: before ? (diffFields(before as any, deal as any, Object.keys(data)) ?? { updated: Object.keys(data) }) : { updated: Object.keys(data) },
      ipAddress: req.headers.get("x-forwarded-for") || undefined,
      userAgent: req.headers.get("user-agent") || undefined,
    }).catch(() => {});

    return NextResponse.json({ deal });
  } catch {
    return NextResponse.json({ error: "Failed to update deal" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/deals/[id]
 *
 * Deletes a Deal row AND cleans up every related row that references the
 * deal via a plain `dealId` string (no FK relation, so Prisma doesn't
 * cascade automatically). This prevents stale "Pending" ledger rows from
 * lingering on /admin/payouts after the underlying deal has been removed.
 *
 * Cleaned up: CommissionLedger rows, DealNote rows, AdminChatThread +
 * its messages (if one exists for this deal).
 *
 * Refuses with 400 if any ledger row is already "paid" — those represent
 * actual disbursed money and shouldn't disappear silently. In that case
 * the admin needs to reverse the payout batch first, then delete.
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
    const paidLedger = await prisma.commissionLedger.findMany({
      where: { dealId: params.id, status: "paid" },
      select: { id: true, tier: true, partnerCode: true },
    });
    if (paidLedger.length > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete — one or more commissions for this deal have already been paid out. " +
            "Reverse the corresponding payout batch first.",
          paidTiers: paidLedger.map((r) => r.tier),
        },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const ledgerDel = await tx.commissionLedger.deleteMany({ where: { dealId: params.id } });
      const notesDel = await tx.dealNote.deleteMany({ where: { dealId: params.id } });

      // AdminChatThread.dealId is @unique + nullable — at most one thread
      // per deal. Its AdminChatMessage children use a FK with onDelete
      // cascade per the schema, so deleting the thread takes its messages.
      const threadDel = await tx.adminChatThread.deleteMany({ where: { dealId: params.id } });

      await tx.deal.delete({ where: { id: params.id } });

      return {
        ledger: ledgerDel.count,
        notes: notesDel.count,
        threads: threadDel.count,
      };
    });

    logAudit({
      action: "deal.delete",
      actorEmail: session.user.email || "unknown",
      actorRole: (session.user as any).role || "unknown",
      actorId: session.user.id,
      targetType: "deal",
      targetId: params.id,
      details: { cleaned: result },
      ipAddress: req.headers.get("x-forwarded-for") || undefined,
      userAgent: req.headers.get("user-agent") || undefined,
    }).catch(() => {});

    return NextResponse.json({ success: true, cleaned: result });
  } catch {
    return NextResponse.json({ error: "Failed to delete deal" }, { status: 500 });
  }
}
