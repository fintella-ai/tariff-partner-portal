import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/sendgrid";
import { payoutProcessedEmail } from "@/lib/email-templates/payoutProcessedEmail";

/**
 * GET /api/admin/payouts
 * Returns commission ledger entries grouped by status, plus payout batches.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role))
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
      select: { id: true, partnerCode: true, firstName: true, lastName: true, companyName: true },
    });
    const partnerMap: Record<string, { id: string; name: string; company: string | null }> = {};
    for (const p of partners) {
      partnerMap[p.partnerCode] = {
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
        company: p.companyName,
      };
    }

    const payouts = commissions.map((c) => ({
      id: c.id,
      partnerName: partnerMap[c.partnerCode]?.company || partnerMap[c.partnerCode]?.name || c.partnerCode,
      partnerId: partnerMap[c.partnerCode]?.id || null,
      partnerCode: c.partnerCode,
      tier: c.tier.toUpperCase(),
      dealId: c.dealId,
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

    // ─── Enterprise override payouts ─────────────────────────────────
    // Calculate enterprise overrides from active enterprise partners and add to payouts list
    const enterprises = await prisma.enterprisePartner.findMany({
      where: { status: "active" },
      include: { overrides: { where: { status: "active" } } },
    });

    if (enterprises.length > 0) {
      const allDeals = await prisma.deal.findMany();

      for (const ep of enterprises) {
        // Get applicable deals
        const l1Codes = ep.overrides.map((o) => o.l1PartnerCode);
        const epDeals = ep.applyToAll
          ? allDeals.filter((d) => d.partnerCode !== ep.partnerCode)
          : allDeals.filter((d) => l1Codes.includes(d.partnerCode));

        for (const deal of epDeals) {
          const firmFee = deal.firmFeeAmount || deal.estimatedRefundAmount * (deal.firmFeeRate || 0.20);
          const overrideAmount = firmFee * ep.overrideRate;
          if (overrideAmount <= 0) continue;

          // Determine status based on deal stage
          const epStatus = deal.stage === "closedwon" ? "due"
            : deal.stage === "closedlost" ? "paid" // closed lost = no payout (skip)
            : "pending";
          if (deal.stage === "closedlost") continue;

          // Check status filter
          if (statusFilter && statusFilter !== "all" && epStatus !== statusFilter) continue;

          payouts.push({
            id: `ep-${ep.id}-${deal.id}`,
            partnerName: partnerMap[ep.partnerCode]?.company || partnerMap[ep.partnerCode]?.name || ep.partnerCode,
            partnerId: partnerMap[ep.partnerCode]?.id || null,
            partnerCode: ep.partnerCode,
            tier: "EP",
            dealId: deal.id,
            dealName: deal.dealName,
            amount: overrideAmount,
            status: epStatus,
            periodMonth: "",
            payoutDate: null,
            batchId: null,
          });
        }
      }
    }

    // Recalculate stats including EP payouts
    const allPayoutAmounts = payouts;
    const epDue = allPayoutAmounts.filter((p) => p.status === "due").reduce((s, p) => s + p.amount, 0);
    const epPending = allPayoutAmounts.filter((p) => p.status === "pending").reduce((s, p) => s + p.amount, 0);
    const epPaid = allPayoutAmounts.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
    const allPartnersToPay = new Set(allPayoutAmounts.filter((p) => p.status === "due").map((p) => p.partnerCode)).size;

    // Payout batches
    const batches = await prisma.payoutBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({
      payouts,
      stats: { totalDue: epDue, totalPending: epPending, totalPaid: epPaid, partnersToPay: allPartnersToPay },
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
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role))
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

      // Snapshot the commissions BEFORE we flip them to paid — we need
      // the per-partner aggregation for the email send below, and a
      // findMany-then-updateMany pair lets us avoid a join.
      const batchCommissions = await prisma.commissionLedger.findMany({
        where: { batchId: body.batchId },
        select: {
          partnerCode: true,
          amount: true,
          periodMonth: true,
        },
      });

      // Mark all commissions in batch as paid
      await prisma.commissionLedger.updateMany({
        where: { batchId: body.batchId },
        data: { status: "paid", payoutDate: new Date() },
      });

      // Aggregate by partnerCode → ONE email per partner with their total,
      // not one email per individual commission row. A batch processing
      // 50 commissions across 12 partners sends 12 emails, not 50.
      const byPartner = new Map<
        string,
        { total: number; count: number; periods: Set<string> }
      >();
      for (const c of batchCommissions) {
        const acc = byPartner.get(c.partnerCode) || {
          total: 0,
          count: 0,
          periods: new Set<string>(),
        };
        acc.total += c.amount;
        acc.count += 1;
        if (c.periodMonth) acc.periods.add(c.periodMonth);
        byPartner.set(c.partnerCode, acc);
      }

      // Look up partner details for every recipient in one query.
      const partners = await prisma.partner.findMany({
        where: { partnerCode: { in: Array.from(byPartner.keys()) } },
        select: { partnerCode: true, firstName: true, email: true },
      });

      // Fire-and-forget every send. We do NOT await Promise.all on these —
      // the admin clicking "Process Batch" should get an immediate 200 back.
      // Each sendEmail() catches its own errors and writes an EmailLog row,
      // so failures are visible in the comm log without blocking the request.
      for (const p of partners) {
        if (!p.email) continue;
        const agg = byPartner.get(p.partnerCode);
        if (!agg) continue;

        // Build a human "March 2026" period label if all commissions in
        // this partner's slice came from the same period.
        let periodLabel: string | null = null;
        if (agg.periods.size === 1) {
          const ym = Array.from(agg.periods)[0]; // "2026-03"
          const [y, m] = ym.split("-");
          if (y && m) {
            const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
            if (!isNaN(d.getTime())) {
              periodLabel = d.toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
              });
            }
          }
        }

        const { subject, html, text } = payoutProcessedEmail({
          firstName: p.firstName || "there",
          totalAmount: agg.total,
          commissionCount: agg.count,
          batchId: batch.id,
          periodLabel,
        });
        sendEmail({
          to: p.email,
          subject,
          html,
          text,
          type: "payout_processed",
          partnerCode: p.partnerCode,
        }).catch((e) =>
          console.error(`[payouts process_batch] payout email failed for ${p.partnerCode}:`, e)
        );
      }

      return NextResponse.json({
        batch,
        emailsQueued: partners.filter((p) => p.email).length,
      });
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
