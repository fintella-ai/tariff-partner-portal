import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const CBP_LISTING_URL = "https://www.cbp.gov/about/contact/brokers-listing";

/**
 * GET /api/cron/cbp-broker-sync
 *
 * Quarterly cron: fetches the CBP Permitted Customs Brokers Listing page,
 * extracts table data, and imports new brokers that aren't already in the
 * PartnerLead table. Deduplicates by email + filer code.
 *
 * Vercel cron schedule: 1st of Jan/Apr/Jul/Oct at 6 AM UTC.
 * Can also be triggered manually from /admin/internal-leads.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization") || "";
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const html = await fetchCBPPage();
    const rows = parseHTMLTable(html);

    if (rows.length === 0) {
      return NextResponse.json({ synced: 0, message: "No rows extracted from CBP page — format may have changed" });
    }

    const existingEmails = new Set(
      (await prisma.partnerLead.findMany({ select: { email: true } }))
        .map((l) => l.email.toLowerCase())
    );

    const existingFilerCodes = new Set(
      (await prisma.partnerLead.findMany({
        where: { notes: { contains: "Filer Code:" } },
        select: { notes: true },
      }))
        .map((l) => {
          const match = (l.notes || "").match(/Filer Code: (\w+)/);
          return match ? match[1] : "";
        })
        .filter(Boolean)
    );

    let imported = 0;
    let skipped = 0;
    let duplicates = 0;

    for (const row of rows) {
      const phone = (row.phone || "").trim();
      const phoneExt = (row.phoneExt || "").trim();
      const email = (row.email || "").trim().toLowerCase();
      const filerCode = (row.filerCode || "").trim();

      if (!phone && !email) { skipped++; continue; }
      if (email && existingEmails.has(email)) { duplicates++; continue; }
      if (filerCode && existingFilerCodes.has(filerCode)) { duplicates++; continue; }

      const nameParts = (row.name || "").trim().split(/\s+/);
      const firstName = nameParts[0] || "Unknown";
      const lastName = nameParts.slice(1).join(" ") || "Broker";
      const fullPhone = phoneExt ? `${phone} x${phoneExt}` : phone;

      try {
        await prisma.partnerLead.create({
          data: {
            firstName,
            lastName,
            email: email || `no-email-${filerCode}@import.placeholder`,
            phone: fullPhone || null,
            commissionRate: 0.20,
            tier: "l2",
            referredByCode: "PTNS4XDMN",
            notes: [
              "Source: CBP Broker Listing (auto-sync)",
              filerCode ? `Filer Code: ${filerCode}` : null,
              row.city || row.state ? `Location: ${[row.city, row.state].filter(Boolean).join(", ")}` : null,
              `Synced: ${new Date().toISOString().split("T")[0]}`,
            ].filter(Boolean).join("\n"),
          },
        });
        if (email) existingEmails.add(email);
        if (filerCode) existingFilerCodes.add(filerCode);
        imported++;
      } catch {
        duplicates++;
      }
    }

    return NextResponse.json({
      synced: imported,
      skipped,
      duplicates,
      totalRows: rows.length,
      message: `CBP sync complete: ${imported} new brokers imported`,
    });
  } catch (err: any) {
    console.error("[cron/cbp-broker-sync] error:", err);
    return NextResponse.json({ error: err.message || "Sync failed" }, { status: 500 });
  }
}

async function fetchCBPPage(): Promise<string> {
  const res = await fetch(CBP_LISTING_URL, {
    headers: { "User-Agent": "Fintella-Partner-Portal/1.0 (broker-sync)" },
  });
  if (!res.ok) throw new Error(`CBP page returned ${res.status}`);
  return res.text();
}

interface BrokerRow {
  filerCode: string;
  name: string;
  city: string;
  state: string;
  phone: string;
  phoneExt: string;
  email: string;
}

function parseHTMLTable(html: string): BrokerRow[] {
  const rows: BrokerRow[] = [];
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return rows;

  const tbody = tableMatch[1];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  let isHeader = true;

  while ((tr = trRegex.exec(tbody)) !== null) {
    if (isHeader) { isHeader = false; continue; }

    const cells: string[] = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let td;
    while ((td = tdRegex.exec(tr[1])) !== null) {
      cells.push(stripHTML(td[1]).trim());
    }

    if (cells.length >= 5) {
      rows.push({
        filerCode: cells[0] || "",
        name: cells[1] || "",
        city: cells[2] || "",
        state: cells[3] || "",
        phone: cells[4] || "",
        phoneExt: cells[5] || "",
        email: cells[6] || "",
      });
    }
  }

  return rows;
}

function stripHTML(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, " ");
}
