import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Orphaned CommissionLedger cleanup.
 *
 * A "ledger row" is orphaned when its `dealId` points at a Deal row that
 * no longer exists (e.g. deal was deleted after closed_won). These rows
 * inflate Commissions Pending, Top Partners rankings, and partner-side
 * commission views until we prune them.
 *
 * GET  — preview. Returns the orphaned row count + a short sample of
 *        the first 50 rows so the super_admin can sanity-check before
 *        committing to a delete.
 *
 * POST — actually deletes. Requires `{ confirm: true }` in the body
 *        AND a super_admin session. Writes `this writes to the real DB`
 *        per CLAUDE.md; matches prod-safety guidance there.
 *
 * Super admin only. Not exposed through the dev-only permissions layer
 * because deletion of commission records is destructive enough to want
 * the tightest gate.
 */

async function findOrphans() {
  const [allDeals, allLedger] = await Promise.all([
    prisma.deal.findMany({ select: { id: true } }),
    prisma.commissionLedger.findMany({
      select: { id: true, dealId: true, partnerCode: true, tier: true, amount: true, status: true, createdAt: true },
    }),
  ]);
  const dealIds = new Set(allDeals.map((d) => d.id));
  return allLedger.filter((row) => !row.dealId || !dealIds.has(row.dealId));
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const orphans = await findOrphans();
  const totalAmount = orphans.reduce((s, o) => s + o.amount, 0);
  return NextResponse.json({
    count: orphans.length,
    totalAmount,
    sample: orphans.slice(0, 50).map((o) => ({
      id: o.id,
      dealId: o.dealId,
      partnerCode: o.partnerCode,
      tier: o.tier,
      amount: o.amount,
      status: o.status,
      createdAt: o.createdAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (body.confirm !== true) {
    return NextResponse.json(
      { error: "Pass `{ confirm: true }` to actually delete — this writes to the real DB." },
      { status: 400 }
    );
  }

  const orphans = await findOrphans();
  if (orphans.length === 0) {
    return NextResponse.json({ deleted: 0, totalAmount: 0 });
  }

  const ids = orphans.map((o) => o.id);
  const totalAmount = orphans.reduce((s, o) => s + o.amount, 0);
  const result = await prisma.commissionLedger.deleteMany({
    where: { id: { in: ids } },
  });

  return NextResponse.json({
    deleted: result.count,
    totalAmount,
    by: session.user.email || "unknown",
    at: new Date().toISOString(),
  });
}
