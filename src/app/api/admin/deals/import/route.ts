import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/deals/import
 *
 * Super admin only. Bulk-creates deals from an array of mapped rows.
 * Each row is a Record<string, string> where keys are Deal model field names.
 *
 * Body: { rows: Array<Record<string, string>> }
 *
 * Returns: { created: number, errors: Array<{ row: number, error: string }> }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role !== "super_admin")
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const { rows } = await req.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "rows array is required" }, { status: 400 });
  }

  if (rows.length > 500) {
    return NextResponse.json({ error: "Maximum 500 rows per import" }, { status: 400 });
  }

  const results: { created: number; errors: Array<{ row: number; error: string }> } = {
    created: 0,
    errors: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const dealName = row.dealName || row.legalEntityName || row.clientName ||
        (row.clientFirstName && row.clientLastName ? `${row.clientFirstName} ${row.clientLastName}` : null) ||
        `Import Row ${i + 1}`;

      const partnerCode = row.partnerCode || "UNATTRIBUTED";

      const parseNum = (v: string | undefined | null): number => {
        if (!v) return 0;
        const n = parseFloat(String(v).replace(/[,$]/g, ""));
        return isNaN(n) ? 0 : n;
      };

      const parseRate = (v: string | undefined | null): number | null => {
        if (!v) return null;
        let n = parseFloat(String(v).replace(/[%,$]/g, ""));
        if (isNaN(n)) return null;
        if (n > 1) n = n / 100;
        return n;
      };

      await prisma.deal.create({
        data: {
          dealName,
          partnerCode,
          stage: row.stage || "lead_submitted",
          clientFirstName: row.clientFirstName || null,
          clientLastName: row.clientLastName || null,
          clientName: row.clientName || (row.clientFirstName && row.clientLastName ? `${row.clientFirstName} ${row.clientLastName}` : null),
          clientEmail: row.clientEmail || null,
          clientPhone: row.clientPhone || null,
          clientTitle: row.clientTitle || null,
          serviceOfInterest: row.serviceOfInterest || null,
          legalEntityName: row.legalEntityName || null,
          companyEin: row.companyEin || null,
          businessStreetAddress: row.businessStreetAddress || null,
          businessStreetAddress2: row.businessStreetAddress2 || null,
          businessCity: row.businessCity || null,
          businessState: row.businessState || null,
          businessZip: row.businessZip || null,
          importsGoods: row.importsGoods || null,
          importCountries: row.importCountries || null,
          annualImportValue: row.annualImportValue || null,
          importerOfRecord: row.importerOfRecord || null,
          affiliateNotes: row.affiliateNotes || null,
          epLevel1: row.epLevel1 || null,
          externalDealId: row.externalDealId || row.hs_object_id || null,
          consultBookedDate: row.consultBookedDate || null,
          consultBookedTime: row.consultBookedTime || null,
          estimatedRefundAmount: parseNum(row.estimatedRefundAmount),
          actualRefundAmount: row.actualRefundAmount ? parseNum(row.actualRefundAmount) : null,
          firmFeeRate: parseRate(row.firmFeeRate),
          firmFeeAmount: parseNum(row.firmFeeAmount),
          l1CommissionRate: parseRate(row.l1CommissionRate),
          l1CommissionAmount: parseNum(row.l1CommissionAmount),
          l1CommissionStatus: row.l1CommissionStatus || "pending",
          notes: row.notes || `Imported by ${(session.user as any).email || "admin"}`,
        },
      });
      results.created++;
    } catch (e: any) {
      results.errors.push({ row: i + 1, error: e.message || "Unknown error" });
    }
  }

  return NextResponse.json(results);
}
