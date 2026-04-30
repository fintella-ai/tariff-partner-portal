import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STAGE_MAP: Record<string, string> = {
  pending: "lead_submitted",
  approved: "qualified",
  denied: "disqualified",
  closed: "closedwon",
  "closed won": "closedwon",
  "closed lost": "disqualified",
  won: "closedwon",
  lost: "disqualified",
  new: "lead_submitted",
  "in progress": "in_process",
  "in review": "in_process",
  submitted: "lead_submitted",
  "submitted to firm": "lead_submitted",
  "lead submitted": "lead_submitted",
  "meeting booked": "meeting_booked",
  "meeting missed": "meeting_missed",
  "client engaged": "client_engaged",
  qualified: "qualified",
  disqualified: "disqualified",
};

function normalizeStage(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  const key = raw.toLowerCase().trim().replace(/[_\-]+/g, " ");
  return STAGE_MAP[key] || raw.toLowerCase().replace(/\s+/g, "_");
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function parseDate(raw: string): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const parsed = new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]));
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function isTestRow(row: Record<string, string>): boolean {
  const name = (row.clientName || row.clientFirstName || row.dealName || "").toLowerCase();
  return /^test\b|^testing\b|\btest$/i.test(name) || name === "null null";
}

/**
 * POST /api/admin/deals/import
 *
 * Super admin only. Bulk-creates deals from an array of mapped rows.
 *
 * Body: {
 *   rows: Array<Record<string, string>>,
 *   defaultPartnerCode?: string,
 *   defaultStage?: string,
 * }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role !== "super_admin")
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const { rows, defaultPartnerCode, defaultStage } = await req.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "rows array is required" }, { status: 400 });
  }

  if (rows.length > 500) {
    return NextResponse.json({ error: "Maximum 500 rows per import" }, { status: 400 });
  }

  const results = { created: 0, skipped: 0, errors: [] as Array<{ row: number; error: string }> };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (isTestRow(row)) {
        results.skipped++;
        continue;
      }

      let firstName = row.clientFirstName || "";
      let lastName = row.clientLastName || "";
      if (!firstName && !lastName && row.clientName) {
        const split = splitName(row.clientName);
        firstName = split.first;
        lastName = split.last;
      }

      const clientName = row.clientName || (firstName && lastName ? `${firstName} ${lastName}` : firstName || null);
      const dealName = row.dealName || row.legalEntityName || clientName || `Import Row ${i + 1}`;
      const partnerCode = row.partnerCode || defaultPartnerCode || "UNATTRIBUTED";
      const stage = normalizeStage(row.stage, defaultStage || "lead_submitted");

      const parseNum = (v: string | undefined | null): number => {
        if (!v) return 0;
        const n = parseFloat(String(v).replace(/[$,\s]/g, ""));
        return isNaN(n) ? 0 : n;
      };

      const parseRate = (v: string | undefined | null): number | null => {
        if (!v) return null;
        let n = parseFloat(String(v).replace(/[%,$\s]/g, ""));
        if (isNaN(n)) return null;
        if (n > 1) n = n / 100;
        return n;
      };

      const createdAt = parseDate(row.rawCreateDate) || undefined;

      // Check for duplicate externalDealId
      if (row.externalDealId) {
        const existing = await prisma.deal.findUnique({
          where: { externalDealId: row.externalDealId },
          select: { id: true },
        });
        if (existing) {
          results.skipped++;
          continue;
        }
      }

      await prisma.deal.create({
        data: {
          dealName,
          partnerCode,
          stage,
          clientFirstName: firstName || null,
          clientLastName: lastName || null,
          clientName: clientName || null,
          clientEmail: row.clientEmail || null,
          clientPhone: row.clientPhone || null,
          clientTitle: row.clientTitle || null,
          serviceOfInterest: row.serviceOfInterest || "Tariff Refund Support",
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
          externalDealId: row.externalDealId || null,
          consultBookedDate: row.consultBookedDate || null,
          consultBookedTime: row.consultBookedTime || null,
          productType: row.productType || "ieepa",
          importedProducts: row.importedProducts || null,
          closedLostReason: row.closedLostReason || (stage === "disqualified" ? (row.stage || null) : null),
          estimatedRefundAmount: parseNum(row.estimatedRefundAmount),
          actualRefundAmount: row.actualRefundAmount ? parseNum(row.actualRefundAmount) : null,
          firmFeeRate: parseRate(row.firmFeeRate),
          firmFeeAmount: parseNum(row.firmFeeAmount),
          l1CommissionRate: parseRate(row.l1CommissionRate),
          l1CommissionAmount: parseNum(row.l1CommissionAmount),
          l1CommissionStatus: row.l1CommissionStatus || "pending",
          notes: row.notes || null,
          ...(createdAt ? { createdAt } : {}),
        },
      });
      results.created++;
    } catch (e: any) {
      results.errors.push({ row: i + 1, error: e.message || "Unknown error" });
    }
  }

  return NextResponse.json(results);
}
