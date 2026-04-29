import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_ROLES = ["super_admin", "admin"];

/**
 * POST /api/admin/leads/import
 * Bulk import leads from CSV data. Each row must have at least a phone or email.
 * Accepts `leadType` to tag source (e.g. "customs_broker", "referral_partner").
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes((session.user as any).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { rows, leadType } = body as { rows: any[]; leadType: string };

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No rows to import" }, { status: 400 });
  }

  if (rows.length > 5000) {
    return NextResponse.json({ error: "Maximum 5,000 rows per import" }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;
  let duplicates = 0;
  const errors: string[] = [];

  const existingEmails = new Set(
    (await prisma.partnerLead.findMany({ select: { email: true } }))
      .map((l) => l.email.toLowerCase())
  );

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const phone = (row.phone || row["Work Phone Number"] || "").trim();
    const phoneExt = (row.phoneExtension || row["Work Phone Extension"] || "").trim();
    const email = (row.email || row["Email Address"] || "").trim().toLowerCase();
    const brokerName = (row.name || row["Permitted Broker Name"] || "").trim();
    const filerCode = (row.filerCode || row["Filer Code"] || "").trim();
    const city = (row.city || row["City"] || "").trim();
    const state = (row.state || row["State"] || "").trim();

    if (!phone && !email) {
      skipped++;
      continue;
    }

    if (email && existingEmails.has(email)) {
      duplicates++;
      continue;
    }

    const nameParts = brokerName.split(/\s+/);
    const firstName = nameParts[0] || "Unknown";
    const lastName = nameParts.slice(1).join(" ") || (leadType === "customs_broker" ? "Broker" : "Lead");

    const fullPhone = phoneExt ? `${phone} x${phoneExt}` : phone;

    const noteLines = [
      `Source: CSV import (${leadType === "customs_broker" ? "CBP Broker Listing" : "Manual"})`,
      filerCode ? `Filer Code: ${filerCode}` : null,
      city || state ? `Location: ${[city, state].filter(Boolean).join(", ")}` : null,
      `Imported: ${new Date().toISOString().split("T")[0]}`,
    ].filter(Boolean).join("\n");

    try {
      await prisma.partnerLead.create({
        data: {
          firstName,
          lastName,
          email: email || `no-email-${filerCode || i}@import.placeholder`,
          phone: fullPhone || null,
          commissionRate: 0.20,
          tier: "l2",
          referredByCode: "PTNS4XDMN",
          notes: noteLines,
        },
      });
      if (email) existingEmails.add(email);
      imported++;
    } catch (err: any) {
      if (err.code === "P2002") {
        duplicates++;
      } else {
        errors.push(`Row ${i + 1}: ${err.message?.slice(0, 100)}`);
      }
    }
  }

  return NextResponse.json({
    imported,
    skipped,
    duplicates,
    errors: errors.slice(0, 10),
    total: rows.length,
  });
}
