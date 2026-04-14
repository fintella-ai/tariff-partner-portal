import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeDealCommissions } from "@/lib/commission";

/**
 * POST /api/admin/deals/[id]/payment-received
 *
 * Admin confirms Frost Law has paid Fintella for this closed-won deal. This is
 * the critical link in the commission chain — it both stamps the Deal and
 * creates the CommissionLedger entries (status="due") that the payout batch
 * flow picks up.
 *
 * Atomic: stamp Deal + create ledger rows + flip Deal commission status fields
 * + write a system DealNote. All in one Prisma transaction.
 *
 * Idempotent: if the deal is already stamped (paymentReceivedAt set), returns
 * 409 with the existing stamp so admins can't double-trigger.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminEmail = (session.user as any).email || "unknown";
  const adminName = (session.user as any).name || adminEmail;

  try {
    const deal = await prisma.deal.findUnique({ where: { id: params.id } });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    if (deal.stage !== "closedwon") {
      return NextResponse.json(
        { error: `Deal must be in closedwon stage (currently: ${deal.stage})` },
        { status: 400 }
      );
    }

    if (deal.paymentReceivedAt) {
      return NextResponse.json(
        {
          error: "Payment already marked received",
          paymentReceivedAt: deal.paymentReceivedAt.toISOString(),
          paymentReceivedBy: deal.paymentReceivedBy,
        },
        { status: 409 }
      );
    }

    if (!deal.firmFeeAmount || deal.firmFeeAmount <= 0) {
      return NextResponse.json(
        { error: "Deal has no firmFeeAmount set — set it before marking payment received" },
        { status: 400 }
      );
    }

    // Two-phase ledger handling:
    //
    //   1. If CommissionLedger already has entries for this deal (created by
    //      the webhook PATCH when the deal first transitioned to closed_won),
    //      flip any "pending" rows to "due" and stamp the deal. This is the
    //      happy path going forward.
    //
    //   2. Otherwise fall back to CREATING entries with status="due" directly.
    //      This covers deals that closed BEFORE the two-phase path shipped,
    //      and deals that somehow reached closed_won without going through
    //      the webhook (e.g. admin manual stage edit in /admin/deals).
    const existingPending = await prisma.commissionLedger.findMany({
      where: { dealId: deal.id, status: "pending" },
    });

    let result;

    if (existingPending.length > 0) {
      // ── Path 1 — flip existing pending rows to due ──
      result = await prisma.$transaction(async (tx) => {
        const updatedDeal = await tx.deal.update({
          where: { id: params.id },
          data: {
            paymentReceivedAt: new Date(),
            paymentReceivedBy: adminEmail,
            l1CommissionStatus: existingPending.some((e) => e.tier === "l1")
              ? "due"
              : deal.l1CommissionStatus,
            l2CommissionStatus: existingPending.some((e) => e.tier === "l2")
              ? "due"
              : deal.l2CommissionStatus,
          },
        });

        await tx.commissionLedger.updateMany({
          where: { dealId: deal.id, status: "pending" },
          data: { status: "due" },
        });

        const totalCommission = existingPending.reduce(
          (s, e) => s + e.amount,
          0
        );
        const noteBody =
          `Payment received from Frost Law confirmed by ${adminName} (${adminEmail}). ` +
          `${existingPending.length} pending commission ${existingPending.length === 1 ? "entry" : "entries"} ` +
          `flipped to "due" (total $${totalCommission.toFixed(2)}): ` +
          existingPending
            .map(
              (e) =>
                `${e.tier.toUpperCase()} ${e.partnerCode} $${e.amount.toFixed(2)}`
            )
            .join(", ") +
          ".";

        await tx.dealNote.create({
          data: {
            dealId: deal.id,
            content: noteBody,
            authorName: adminName,
            authorEmail: adminEmail,
          },
        });

        return {
          updatedDeal,
          ledgerCount: existingPending.length,
          totalCommission,
          mode: "flipped_pending",
          ledger: existingPending,
        };
      });
    } else {
      // ── Path 2 — fallback: create fresh with status="due" ──
      const computed = await computeDealCommissions(prisma, {
        partnerCode: deal.partnerCode,
        firmFeeAmount: deal.firmFeeAmount,
      });

      if (computed.entries.length === 0) {
        return NextResponse.json(
          {
            error:
              "Unable to compute commissions — check the partner chain (referredByPartnerCode) and firmFeeAmount on the deal.",
          },
          { status: 400 }
        );
      }

      result = await prisma.$transaction(async (tx) => {
        const updatedDeal = await tx.deal.update({
          where: { id: params.id },
          data: {
            paymentReceivedAt: new Date(),
            paymentReceivedBy: adminEmail,
            l1CommissionStatus: computed.entries.some((e) => e.tier === "l1")
              ? "due"
              : deal.l1CommissionStatus,
            l2CommissionStatus: computed.entries.some((e) => e.tier === "l2")
              ? "due"
              : deal.l2CommissionStatus,
          },
        });

        const createdLedger = await Promise.all(
          computed.entries.map((entry) =>
            tx.commissionLedger.create({
              data: {
                partnerCode: entry.partnerCode,
                dealId: deal.id,
                dealName: deal.dealName,
                tier: entry.tier,
                amount: entry.amount,
                status: "due",
                periodMonth: new Date().toISOString().slice(0, 7),
              },
            })
          )
        );

        const noteBody =
          `Payment received from Frost Law confirmed by ${adminName} (${adminEmail}). ` +
          `Firm fee: $${deal.firmFeeAmount.toFixed(2)}. ` +
          `Commissions created directly as "due" (fallback — no pending ledger existed, likely because the deal closed before the webhook two-phase path shipped or was closed via admin stage edit): ` +
          `${computed.entries.length} entries totaling $${computed.totalAmount.toFixed(2)} ` +
          `(${computed.entries
            .map(
              (e) =>
                `${e.tier.toUpperCase()} ${e.partnerCode} $${e.amount.toFixed(2)}`
            )
            .join(", ")}).`;

        await tx.dealNote.create({
          data: {
            dealId: deal.id,
            content: noteBody,
            authorName: adminName,
            authorEmail: adminEmail,
          },
        });

        return {
          updatedDeal,
          ledgerCount: createdLedger.length,
          totalCommission: computed.totalAmount,
          mode: "created_fresh",
          ledger: createdLedger,
        };
      });
    }

    return NextResponse.json({
      success: true,
      deal: result.updatedDeal,
      ledgerCount: result.ledgerCount,
      totalCommission: result.totalCommission,
      mode: result.mode,
      ledger: result.ledger,
    });
  } catch (e) {
    console.error("payment-received error:", e);
    return NextResponse.json({ error: "Failed to mark payment received" }, { status: 500 });
  }
}
