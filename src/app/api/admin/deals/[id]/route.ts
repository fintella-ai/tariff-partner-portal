import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (body.closeDate !== undefined) data.closeDate = body.closeDate ? new Date(body.closeDate) : null;

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

    const deal = await prisma.deal.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({ deal });
  } catch {
    return NextResponse.json({ error: "Failed to update deal" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/deals/[id]
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
    await prisma.deal.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete deal" }, { status: 500 });
  }
}
