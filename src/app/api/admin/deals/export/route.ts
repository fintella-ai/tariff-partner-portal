import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * RFC 4180 CSV field escaping: wrap in double-quotes if the value contains
 * a comma, double-quote, or newline. Interior double-quotes are doubled.
 */
function csvField(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * GET /api/admin/deals/export
 * Exports filtered deals as a downloadable CSV file.
 * Super admin only.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const where: any = {};

    const stage = req.nextUrl.searchParams.get("stage");
    if (stage && stage !== "all") where.stage = stage;

    const partner = req.nextUrl.searchParams.get("partner");
    if (partner) where.partnerCode = partner;

    const search = req.nextUrl.searchParams.get("search");
    if (search) {
      where.OR = [
        { id: { contains: search } },
        { dealName: { contains: search } },
        { clientName: { contains: search } },
        { clientEmail: { contains: search } },
        { partnerCode: { contains: search.toUpperCase() } },
      ];
    }

    const deals = await prisma.deal.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    // Build partner lookup for name resolution
    const partners = await prisma.partner.findMany({
      select: {
        partnerCode: true,
        firstName: true,
        lastName: true,
        commissionRate: true,
      },
    });
    const partnerMap: Record<string, { name: string; commissionRate: number }> = {};
    for (const p of partners) {
      partnerMap[p.partnerCode] = {
        name: `${p.firstName} ${p.lastName}`,
        commissionRate: p.commissionRate,
      };
    }

    // CSV header
    const headers = [
      "Deal Name",
      "Client First Name",
      "Client Last Name",
      "Client Email",
      "Client Phone",
      "Company",
      "Partner Code",
      "Partner Name",
      "Stage",
      "Estimated Refund",
      "Actual Refund",
      "Firm Fee Rate",
      "Firm Fee Amount",
      "L1 Commission Rate",
      "L1 Commission Amount",
      "L1 Commission Status",
      "Created Date",
    ];

    const rows = deals.map((d) => {
      const partnerName = partnerMap[d.partnerCode]?.name || d.partnerCode;
      const effectiveRate =
        d.l1CommissionRate ?? partnerMap[d.partnerCode]?.commissionRate ?? null;
      const feeRatePct =
        d.firmFeeRate != null ? `${Math.round(d.firmFeeRate * 10000) / 100}%` : "";
      const commRatePct =
        effectiveRate != null ? `${Math.round(effectiveRate * 10000) / 100}%` : "";
      const createdDate = d.createdAt
        ? new Date(d.createdAt).toISOString().split("T")[0]
        : "";

      return [
        csvField(d.dealName),
        csvField(d.clientFirstName),
        csvField(d.clientLastName),
        csvField(d.clientEmail),
        csvField(d.clientPhone),
        csvField(d.legalEntityName),
        csvField(d.partnerCode),
        csvField(partnerName),
        csvField(d.stage),
        csvField(d.estimatedRefundAmount),
        csvField(d.actualRefundAmount),
        csvField(feeRatePct),
        csvField(d.firmFeeAmount),
        csvField(commRatePct),
        csvField(d.l1CommissionAmount),
        csvField(d.l1CommissionStatus),
        csvField(createdDate),
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\r\n");
    const today = new Date().toISOString().split("T")[0];

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="deals-export-${today}.csv"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to export deals" }, { status: 500 });
  }
}
