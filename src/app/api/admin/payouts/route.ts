import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendCommissionPaidEmail } from "@/lib/sendgrid";
import { createTransfer } from "@/lib/stripe";

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

    // Load Stripe account status for all partners that appear in commissions
    const allPartnerCodes = Array.from(new Set(commissions.map((c) => c.partnerCode)));
    const stripeAccounts = await prisma.stripeAccount.findMany({
      where: { partnerCode: { in: allPartnerCodes } },
      select: { partnerCode: true, status: true, payoutsEnabled: true },
    });
    const stripeMap: Record<string, { status: string; payoutsEnabled: boolean }> = {};
    for (const sa of stripeAccounts) {
      stripeMap[sa.partnerCode] = { status: sa.status, payoutsEnabled: sa.payoutsEnabled };
    }

    // Join dealId → deal row so the UI can render per-row deal context
    // (actual refund, firm fee %, firm fee $) + derive each row's effective
    // commission % as row.amount / firmFeeAmount.
    const allDealIds = Array.from(new Set(commissions.map((c) => c.dealId)));
    const dealRows = allDealIds.length > 0
      ? await prisma.deal.findMany({
          where: { id: { in: allDealIds } },
          select: {
            id: true,
            stage: true,
            estimatedRefundAmount: true,
            actualRefundAmount: true,
            firmFeeRate: true,
            firmFeeAmount: true,
          },
        })
      : [];
    const dealMap: Record<string, typeof dealRows[number]> = {};
    for (const d of dealRows) dealMap[d.id] = d;

    const payouts = commissions.map((c) => {
      const d = dealMap[c.dealId];
      return {
        id: c.id,
        partnerName: partnerMap[c.partnerCode]?.company || partnerMap[c.partnerCode]?.name || c.partnerCode,
        partnerId: partnerMap[c.partnerCode]?.id || null,
        partnerCode: c.partnerCode,
        tier: c.tier.toUpperCase(),
        dealId: c.dealId,
        dealName: c.dealName || c.dealId,
        amount: c.amount,
        // Deal context for the row. Null when the underlying Deal row is
        // missing (shouldn't happen in practice but guarded defensively).
        estimatedRefundAmount: d?.estimatedRefundAmount ?? null,
        actualRefundAmount: d?.actualRefundAmount ?? null,
        firmFeeRate: d?.firmFeeRate ?? null,
        firmFeeAmount: d?.firmFeeAmount ?? null,
        dealStage: d?.stage ?? null,
        status: c.status,
        periodMonth: c.periodMonth || "",
        payoutDate: c.payoutDate?.toISOString() || null,
        batchId: c.batchId,
        stripeTransferId: c.stripeTransferId || null,
        stripeStatus: stripeMap[c.partnerCode]?.status || null,
        stripePayoutsEnabled: stripeMap[c.partnerCode]?.payoutsEnabled || false,
      };
    });

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
          // EP earns a fixed override rate on top of whatever the L1/L2/L3
          // waterfall already pays. No dependency on the L1's actual rate —
          // this is additive, not a "total cap minus L1 rate" subtraction.
          // Example: EP override 2% on a $78K firm fee → EP earns $1,560
          // regardless of whether the L1 partner is on a 20%, 25%, or 28%
          // base rate. Keeps "Apply to All" sensible across mixed L1 rates.
          const epOverrideRate = ep.overrideRate ?? 0;
          const overrideAmount = firmFee * epOverrideRate;
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
            estimatedRefundAmount: deal.estimatedRefundAmount,
            actualRefundAmount: deal.actualRefundAmount ?? null,
            firmFeeRate: deal.firmFeeRate ?? null,
            firmFeeAmount: firmFee,
            dealStage: deal.stage ?? null,
            status: epStatus,
            periodMonth: "",
            payoutDate: null,
            batchId: null,
            stripeTransferId: null,
            stripeStatus: stripeMap[ep.partnerCode]?.status || null,
            stripePayoutsEnabled: stripeMap[ep.partnerCode]?.payoutsEnabled || false,
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
  // Write operations on payouts (create_batch / approve_batch / process_batch
  // / approve_single) move money and flip CommissionLedger status. Restricted
  // to the roles that actually own that flow. partner_support can still see
  // the payouts page via the GET handler above but cannot trigger any write.
  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting"].includes(role))
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
      const partnerCodes = Array.from(new Set(dueCommissions.map((c) => c.partnerCode)));

      const batch = await prisma.payoutBatch.create({
        data: {
          totalAmount,
          partnerCount: partnerCodes.length,
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

      // Snapshot the commissions that are about to flip so we can attempt
      // Stripe Transfers and send emails after the write.
      const toProcess = await prisma.commissionLedger.findMany({
        where: { batchId: body.batchId, status: { not: "paid" } },
        select: { id: true, partnerCode: true, dealName: true, amount: true },
      });

      // ── Stripe Transfers (demo-gated) ────────────────────────────────────
      // For each commission, attempt a Stripe Transfer to the partner's
      // connected account if they have one with payouts enabled.
      // Failures are logged but do NOT block the batch from processing —
      // admin can follow up manually if a transfer fails.
      if (process.env.STRIPE_SECRET_KEY) {
        const batchPartnerCodes = Array.from(new Set(toProcess.map((c) => c.partnerCode)));
        const stripeAccounts = await prisma.stripeAccount.findMany({
          where: {
            partnerCode: { in: batchPartnerCodes },
            payoutsEnabled: true,
            status: "active",
          },
          select: { partnerCode: true, stripeAccountId: true },
        });
        const stripeAccountMap = Object.fromEntries(
          stripeAccounts.map((a) => [a.partnerCode, a.stripeAccountId])
        );

        await Promise.all(
          toProcess.map(async (commission) => {
            const destination = stripeAccountMap[commission.partnerCode];
            if (!destination) return; // no connected account — manual payout

            try {
              const transfer = await createTransfer({
                amountCents: Math.round(commission.amount * 100),
                destination,
                description: `Commission payout — ${commission.dealName || commission.id}`,
                metadata: {
                  commissionId: commission.id,
                  partnerCode: commission.partnerCode,
                  batchId: body.batchId,
                },
              });

              if (transfer?.id) {
                await prisma.commissionLedger.update({
                  where: { id: commission.id },
                  data: { stripeTransferId: transfer.id },
                });
              }
            } catch (err) {
              console.error(
                `[payouts] Stripe transfer failed for commission ${commission.id}:`,
                err
              );
            }
          })
        );
      }

      // Mark all commissions in batch as paid
      await prisma.commissionLedger.updateMany({
        where: { batchId: body.batchId },
        data: { status: "paid", payoutDate: new Date() },
      });

      // Send commission paid emails — awaited to avoid Vercel fire-and-forget truncation
      const byCode: Record<string, typeof toProcess> = {};
      for (const e of toProcess) {
        (byCode[e.partnerCode] ||= []).push(e);
      }
      await Promise.all(
        Object.entries(byCode).map(async ([partnerCode, entries]) => {
          try {
            const partner = await prisma.partner.findFirst({
              where: { partnerCode },
              select: { email: true, firstName: true, lastName: true },
            });
            if (!partner?.email) return;
            await Promise.all(
              entries.map((e) =>
                sendCommissionPaidEmail({
                  partnerEmail: partner.email!,
                  partnerName: `${partner.firstName} ${partner.lastName}`,
                  partnerCode,
                  amount: e.amount,
                  dealName: e.dealName || "(unnamed deal)",
                }).catch((err) =>
                  console.warn("[payouts] commission paid email failed:", err)
                )
              )
            );
          } catch (err) {
            console.warn("[payouts] partner email block failed:", err);
          }
        })
      );

      // Fire workflow trigger for commission.paid (fire-and-forget)
      import("@/lib/workflow-engine").then(({ fireWorkflowTrigger }) =>
        fireWorkflowTrigger("commission.paid", { batch, entries: toProcess })
      ).catch(() => {});

      return NextResponse.json({ batch });
    }

    if (body.action === "approve_single" && body.commissionId) {
      const before = await prisma.commissionLedger.findUnique({
        where: { id: body.commissionId },
        select: { partnerCode: true, dealName: true, amount: true, status: true },
      });
      const commission = await prisma.commissionLedger.update({
        where: { id: body.commissionId },
        data: { status: "paid", payoutDate: new Date() },
      });
      if (before && before.status !== "paid") {
        await (async () => {
          try {
            const partner = await prisma.partner.findFirst({
              where: { partnerCode: before.partnerCode },
              select: { email: true, firstName: true, lastName: true },
            });
            if (partner?.email) {
              await sendCommissionPaidEmail({
                partnerEmail: partner.email,
                partnerName: `${partner.firstName} ${partner.lastName}`,
                partnerCode: before.partnerCode,
                amount: before.amount,
                dealName: before.dealName || "(unnamed deal)",
              }).catch((err) =>
                console.warn("[payouts] single commission paid email failed:", err)
              );
            }
          } catch (err) {
            console.warn("[payouts] single commission paid email failed:", err);
          }
        })();
      }
      return NextResponse.json({ commission });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    console.error("Payouts POST error:", e);
    return NextResponse.json({ error: "Failed to process payout" }, { status: 500 });
  }
}
