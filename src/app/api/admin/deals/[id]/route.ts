import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  if (role !== "admin" && role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const data: Record<string, any> = {};

    if (body.dealName !== undefined) data.dealName = body.dealName;
    if (body.clientName !== undefined) data.clientName = body.clientName || null;
    if (body.clientEmail !== undefined) data.clientEmail = body.clientEmail || null;
    if (body.clientPhone !== undefined) data.clientPhone = body.clientPhone || null;
    if (body.stage !== undefined) data.stage = body.stage;
    if (body.productType !== undefined) data.productType = body.productType || null;
    if (body.importedProducts !== undefined) data.importedProducts = body.importedProducts || null;
    if (body.estimatedRefundAmount !== undefined) data.estimatedRefundAmount = parseFloat(body.estimatedRefundAmount) || 0;
    if (body.firmFeeRate !== undefined) data.firmFeeRate = body.firmFeeRate != null ? parseFloat(body.firmFeeRate) : null;
    if (body.firmFeeAmount !== undefined) data.firmFeeAmount = parseFloat(body.firmFeeAmount) || 0;
    if (body.l1CommissionAmount !== undefined) data.l1CommissionAmount = parseFloat(body.l1CommissionAmount) || 0;
    if (body.l1CommissionStatus !== undefined) data.l1CommissionStatus = body.l1CommissionStatus;
    if (body.l2CommissionAmount !== undefined) data.l2CommissionAmount = parseFloat(body.l2CommissionAmount) || 0;
    if (body.l2CommissionStatus !== undefined) data.l2CommissionStatus = body.l2CommissionStatus;
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (body.closeDate !== undefined) data.closeDate = body.closeDate ? new Date(body.closeDate) : null;

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
  if (role !== "admin" && role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    await prisma.deal.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete deal" }, { status: 500 });
  }
}
