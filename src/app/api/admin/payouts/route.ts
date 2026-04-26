import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendCommissionPaidEmail } from "@/lib/sendgrid";
import { createTransfer } from "@/lib/stripe";
import { resolveCommissionStatus } from "@/lib/commission";
import { logAudit } from "@/lib/audit-log";

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

    const rawCommissions = await prisma.commissionLedger.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    // Filter out ledger rows whose underlying Deal has been deleted. The
    // DELETE /api/admin/deals/[id] handler cascades to CommissionLedger
    // going forward, but this defensive filter catches any legacy orphans
    // that predate the cascade + any edge case where a deal was deleted
    // outside the API (e.g. direct DB edit). Orphaned rows with status
    // "paid" are kept (they represent real disbursed money and should
    // still surface for audit even if the deal row is gone).
    const ledgerDealIds = Array.from(new Set(rawCommissions.map((c) => c.dealId)));
    const existingDeals = ledgerDealIds.length > 0
      ? await prisma.deal.findMany({
          where: { id: { in: ledgerDealIds } },
          select: { id: true },
        })
      : [];
    const liveDealIdSet = new Set(existingDeals.map((d) => d.id));
    const commissions = rawCommissions.filter((c) => liveDealIdSet.has(c.dealId) || c.status === "paid");

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
    // Apply the same orphan filter to the summary stats so totals match
    // the visible table rows. Paid rows remain included even when orphaned
    // (audit trail for actual disbursed money).
    const allRawComm = await prisma.commissionLedger.findMany();
    const allStatsDealIds = Array.from(new Set(allRawComm.map((c) => c.dealId)));
    const allExistingStatsDeals = allStatsDealIds.length > 0
      ? await prisma.deal.findMany({ where: { id: { in: allStatsDealIds } }, select: { id: true } })
      : [];
    const allLiveSet = new Set(allExistingStatsDeals.map((d) => d.id));
    const allComm = allRawComm.filter((c) => allLiveSet.has(c.dealId) || c.status === "paid");
    let totalDue = allComm.filter((c) => c.status === "due").reduce((s, c) => s + c.amount, 0);
    // "pending_payment" is the post-2026-04 lifecycle label for closed-won
    // rows waiting on firm payment. Legacy "pending" rows pre-migration
    // map to the same bucket so summary stats don't regress while the
    // DB is partially migrated.
    let totalPendingPayment = allComm
      .filter((c) => c.status === "pending_payment" || c.status === "pending")
      .reduce((s, c) => s + c.amount, 0);
    let totalProjected = allComm
      .filter((c) => c.status === "projected")
      .reduce((s, c) => s + c.amount, 0);
    let totalLost = allComm
      .filter((c) => c.status === "lost")
      .reduce((s, c) => s + c.amount, 0);
    let totalPaid = allComm.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0);
    const partnersToPaySet = new Set(allComm.filter((c) => c.status === "due").map((c) => c.partnerCode));

    // ─── Enterprise override payouts ─────────────────────────────────
    // Calculate enterprise overrides from active enterprise partners and add to payouts list
    const enterprises = await prisma.enterprisePartner.findMany({
      where: { status: "active" },
      include: { overrides: { where: { status: "active" } } },
    });

    if (enterprises.length > 0) {
      const allDeals = await prisma.deal.findMany();

      // Any EP payouts already persisted as CommissionLedger rows (tier="ep")
      // — skip synthesizing duplicates for the same (ep partner, deal) pair.
      // These exist once an admin has included an EP payout in a batch
      // (see create_batch below).
      const persistedEpRows = await prisma.commissionLedger.findMany({
        where: { tier: "ep" },
        select: { dealId: true, partnerCode: true, status: true },
      });
      const persistedEpKeys = new Set(
        persistedEpRows.map((r) => `${r.partnerCode}|${r.dealId}`),
      );

      for (const ep of enterprises) {
        // Get applicable deals
        const l1Codes = ep.overrides.map((o) => o.l1PartnerCode);
        const epDeals = ep.applyToAll
          ? allDeals.filter((d) => d.partnerCode !== ep.partnerCode)
          : allDeals.filter((d) => l1Codes.includes(d.partnerCode));

        for (const deal of epDeals) {
          // Skip deals that already have a persisted EP CommissionLedger
          // row for this enterprise partner — they'll render via the
          // regular ledger mapping above at line 90.
          if (persistedEpKeys.has(`${ep.partnerCode}|${deal.id}`)) continue;

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

          // EP status follows the canonical commission lifecycle defined
          // in resolveCommissionStatus():
          //   closed_won + paymentReceivedAt set → "due"
          //   closed_won + no payment             → "pending_payment"
          //   client_engaged / in_process         → "projected"
          //   closed_lost                         → "lost"
          //   pre-engagement stages               → null (skipped)
          const epStatus = resolveCommissionStatus(deal.stage, deal.paymentReceivedAt ?? null);
          if (!epStatus) continue;

          // Stats feed BEFORE the status filter so the stat cards
          // reflect the full EP payout universe, not just the tab
          // currently visible on screen.
          if (epStatus === "due") {
            totalDue += overrideAmount;
            partnersToPaySet.add(ep.partnerCode);
          } else if (epStatus === "pending_payment") {
            totalPendingPayment += overrideAmount;
          } else if (epStatus === "projected") {
            totalProjected += overrideAmount;
          } else if (epStatus === "lost") {
            totalLost += overrideAmount;
          }

          // Check status filter (affects only what renders in the table)
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

    // Payout batches
    const batches = await prisma.payoutBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({
      payouts,
      // Stats were accumulated across BOTH the CommissionLedger rows
      // (above) and every EP synthetic payout (in the EP loop), so the
      // cards reflect ALL money due/pending/paid regardless of which
      // tab the admin is currently viewing.
      // Stats now surface the full lifecycle. `totalPending` kept as an
      // alias of totalPendingPayment for any legacy UI still reading it.
      stats: {
        totalDue,
        totalPendingPayment,
        totalPending: totalPendingPayment, // legacy alias
        totalProjected,
        totalLost,
        totalPaid,
        partnersToPay: partnersToPaySet.size,
      },
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
      // ── Enterprise payout materialization ─────────────────────────────
      // EP payouts are synthetic in the GET (computed from active EPs +
      // deals), but they need to live as real CommissionLedger rows the
      // moment an admin bundles them into a batch. We upsert one
      // tier="ep" row per due EP-on-deal pair before gathering the
      // due list. The @@unique([dealId, partnerCode, tier]) constraint
      // guards against duplicates if this handler is called twice.
      const activeEPs = await prisma.enterprisePartner.findMany({
        where: { status: "active" },
        include: { overrides: { where: { status: "active" } } },
      });
      if (activeEPs.length > 0) {
        const allDeals = await prisma.deal.findMany({
          where: { stage: "closedwon", paymentReceivedAt: { not: null } },
        });
        for (const ep of activeEPs) {
          const l1Codes = ep.overrides.map((o) => o.l1PartnerCode);
          const epDeals = ep.applyToAll
            ? allDeals.filter((d) => d.partnerCode !== ep.partnerCode)
            : allDeals.filter((d) => l1Codes.includes(d.partnerCode));
          for (const deal of epDeals) {
            const firmFee = deal.firmFeeAmount || deal.estimatedRefundAmount * (deal.firmFeeRate || 0.20);
            const overrideAmount = firmFee * (ep.overrideRate ?? 0);
            if (overrideAmount <= 0) continue;
            // Upsert is idempotent via the unique(dealId,partnerCode,tier)
            // constraint — safe to run on repeat calls.
            await prisma.commissionLedger.upsert({
              where: {
                dealId_partnerCode_tier: {
                  dealId: deal.id,
                  partnerCode: ep.partnerCode,
                  tier: "ep",
                },
              },
              create: {
                partnerCode: ep.partnerCode,
                dealId: deal.id,
                dealName: deal.dealName,
                tier: "ep",
                amount: overrideAmount,
                status: "due",
              },
              // If a row already exists (e.g. a previous batch already
              // processed it), leave its status alone — only top up the
              // amount in case the deal's firm fee was later edited.
              update: { amount: overrideAmount },
            });
          }
        }
      }

      // Gather all "due" commissions (includes EP rows we just materialized)
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

      logAudit({
        action: "payout.batch_create",
        actorEmail: session.user.email || "unknown",
        actorRole: (session.user as any).role || "unknown",
        actorId: session.user.id,
        targetType: "payout_batch",
        targetId: batch.id,
        details: { totalAmount, partnerCount: partnerCodes.length, commissionCount: dueCommissions.length },
        ipAddress: req.headers.get("x-forwarded-for") || undefined,
        userAgent: req.headers.get("user-agent") || undefined,
      }).catch(() => {});

      return NextResponse.json({ batch });
    }

    if (body.action === "approve_batch" && body.batchId) {
      const batch = await prisma.payoutBatch.update({
        where: { id: body.batchId },
        data: { status: "approved" },
      });
      logAudit({
        action: "payout.batch_process",
        actorEmail: session.user.email || "unknown",
        actorRole: (session.user as any).role || "unknown",
        actorId: session.user.id,
        targetType: "payout_batch",
        targetId: batch.id,
        details: { subAction: "approve_batch", batchId: batch.id },
        ipAddress: req.headers.get("x-forwarded-for") || undefined,
        userAgent: req.headers.get("user-agent") || undefined,
      }).catch(() => {});
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

      logAudit({
        action: "payout.batch_process",
        actorEmail: session.user.email || "unknown",
        actorRole: (session.user as any).role || "unknown",
        actorId: session.user.id,
        targetType: "payout_batch",
        targetId: batch.id,
        details: { subAction: "process_batch", batchId: batch.id, commissionCount: toProcess.length, totalAmount: toProcess.reduce((s, c) => s + c.amount, 0) },
        ipAddress: req.headers.get("x-forwarded-for") || undefined,
        userAgent: req.headers.get("user-agent") || undefined,
      }).catch(() => {});

      return NextResponse.json({ batch });
    }

    if (body.action === "approve_single" && body.commissionId) {
      // Synthetic EP row ids look like "ep-{enterprisePartnerId}-{dealId}"
      // — they aren't backed by a CommissionLedger row yet, so we have
      // to materialize one before we can flip it to paid.
      let commissionId: string = String(body.commissionId);
      if (commissionId.startsWith("ep-")) {
        const rest = commissionId.slice(3);
        // Deal ids are cuids (25 chars). EP ids are also cuids. The
        // synthetic key is ep-{epId}-{dealId}; split on the last
        // dash-boundary that precedes a cuid-shaped token. Simpler:
        // we know the dealId is the trailing cuid segment, so split at
        // the last dash.
        const lastDash = rest.lastIndexOf("-");
        if (lastDash < 0) {
          return NextResponse.json({ error: "Malformed EP payout id" }, { status: 400 });
        }
        const epId = rest.slice(0, lastDash);
        const dealId = rest.slice(lastDash + 1);
        const ep = await prisma.enterprisePartner.findUnique({ where: { id: epId } });
        const deal = await prisma.deal.findUnique({ where: { id: dealId } });
        if (!ep || !deal) {
          return NextResponse.json({ error: "Enterprise or deal not found" }, { status: 404 });
        }
        const firmFee = deal.firmFeeAmount || deal.estimatedRefundAmount * (deal.firmFeeRate || 0.20);
        const overrideAmount = firmFee * (ep.overrideRate ?? 0);
        const row = await prisma.commissionLedger.upsert({
          where: {
            dealId_partnerCode_tier: {
              dealId: deal.id,
              partnerCode: ep.partnerCode,
              tier: "ep",
            },
          },
          create: {
            partnerCode: ep.partnerCode,
            dealId: deal.id,
            dealName: deal.dealName,
            tier: "ep",
            amount: overrideAmount,
            status: "due",
          },
          update: { amount: overrideAmount },
        });
        commissionId = row.id;
      }

      const before = await prisma.commissionLedger.findUnique({
        where: { id: commissionId },
        select: { partnerCode: true, dealName: true, amount: true, status: true },
      });
      const commission = await prisma.commissionLedger.update({
        where: { id: commissionId },
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
