import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/payouts
 * Returns commission ledger entries grouped by status, plus payout batches.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const statusFilter = req.nextUrl.searchParams.get("status");

    const where: any = {};
    if (statusFilter && statusFilter !== "all") where.status = statusFilter;

    const commissions = await prisma.commissionLedger.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    // Get partner names
    const partners = await prisma.partner.findMany({
      select: { partnerCode: true, firstName: true, lastName: true, companyName: true },
    });
    const partnerMap: Record<string, { name: string; company: string | null }> = {};
    for (const p of partners) {
      partnerMap[p.partnerCode] = {
        name: `${p.firstName} ${p.lastName}`,
        company: p.companyName,
      };
    }

    const payouts = commissions.map((c) => ({
      id: c.id,
      partnerName: partnerMap[c.partnerCode]?.company || partnerMap[c.partnerCode]?.name || c.partnerCode,
      partnerCode: c.partnerCode,
      tier: c.tier.toUpperCase(),
      dealName: c.dealName || c.dealId,
      amount: c.amount,
      status: c.status,
      periodMonth: c.periodMonth || "",
      payoutDate: c.payoutDate?.toISOString() || null,
      batchId: c.batchId,
    }));

    // Summary stats
    const allComm = await prisma.commissionLedger.findMany();
    const totalDue = allComm.filter((c) => c.status === "due").reduce((s, c) => s + c.amount, 0);
    const totalPending = allComm.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0);
    const totalPaid = allComm.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0);
    const partnersToPay = new Set(allComm.filter((c) => c.status === "due").map((c) => c.partnerCode)).size;

    // Payout batches
    const batches = await prisma.payoutBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({
      payouts,
      stats: { totalDue, totalPending, totalPaid, partnersToPay },
      batches,
    });
  } catch (e) {
    console.error("Payouts API error:", e);
    return NextResponse.json({ error: "Failed to fetch payouts" }, { status: 500 });
  }
}

/**
 * POST /api/admin/payouts
 * Create a payout batch from all "due" commissions, or approve/process an existing batch.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();

    if (body.action === "create_batch") {
      // Gather all "due" commissions
      const dueCommissions = await prisma.commissionLedger.findMany({
        where: { status: "due" },
      });

      if (dueCommissions.length === 0) {
        return NextResponse.json({ error: "No due commissions to batch" }, { status: 400 });
      }

      const totalAmount = dueCommissions.reduce((s, c) => s + c.amount, 0);
      const partnerCodes = new Set(dueCommissions.map((c) => c.partnerCode));

      const batch = await prisma.payoutBatch.create({
        data: {
          totalAmount,
          partnerCount: partnerCodes.size,
          status: "draft",
          notes: body.notes || null,
        },
      });

      // Link commissions to batch
      await prisma.commissionLedger.updateMany({
        where: { id: { in: dueCommissions.map((c) => c.id) } },
        data: { batchId: batch.id },
      });

      return NextResponse.json({ batch });
    }

    if (body.action === "approve_batch" && body.batchId) {
      const batch = await prisma.payoutBatch.update({
        where: { id: body.batchId },
        data: { status: "approved" },
      });
      return NextResponse.json({ batch });
    }

    if (body.action === "process_batch" && body.batchId) {
      const batch = await prisma.payoutBatch.update({
        where: { id: body.batchId },
        data: { status: "processed", processedDate: new Date() },
      });

      // Mark all commissions in batch as paid
      await prisma.commissionLedger.updateMany({
        where: { batchId: body.batchId },
        data: { status: "paid", payoutDate: new Date() },
      });

      return NextResponse.json({ batch });
    }

    if (body.action === "approve_single" && body.commissionId) {
      const commission = await prisma.commissionLedger.update({
        where: { id: body.commissionId },
        data: { status: "paid", payoutDate: new Date() },
      });
      return NextResponse.json({ commission });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    console.error("Payouts POST error:", e);
    return NextResponse.json({ error: "Failed to process payout" }, { status: 500 });
  }
}
