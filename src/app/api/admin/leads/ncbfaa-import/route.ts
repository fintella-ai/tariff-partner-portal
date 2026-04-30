import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import dns from "dns";

const ADMIN_ROLES = ["super_admin", "admin"];

const NCBFAA_SEARCH_URL =
  "https://members.ncbfaa.org/4dcgi/directory/Member/results.html?Action=NCBFAA&NCBFAA_Activity=Member";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/admin/leads/ncbfaa-import
 *
 * Two modes:
 *   1. `{ mode: "scrape" }` — fetches the public NCBFAA membership directory,
 *      parses company name / contact / city / state, then scrapes detail pages
 *      in batches to get phone numbers. Creates PartnerLead rows.
 *   2. `{ mode: "csv", rows: [...] }` — accepts pre-parsed CSV/JSON rows with
 *      columns: companyName, contactName, email, phone, city, state.
 *      Use this when you have a richer data export (e.g. from NCBFAA member login).
 *
 * All imported leads: source="ncbfaa", tier="l2", commissionRate=0.20,
 * referredByCode="PTNS4XDMN".
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes((session.user as any).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const mode = body.mode || "scrape";

  if (mode === "csv") {
    return handleCSVImport(body.rows || []);
  }

  return handleScrapeImport();
}

// ─── Mode 1: Scrape the NCBFAA public directory ────────────────────────────

async function handleScrapeImport() {
  try {
    // Step 1: Fetch the full listing page (empty search = all members)
    const listingHtml = await fetchNCBFAAListing();

    // Step 2: Parse listing rows (company, contact, city, state, detailUrl)
    const listingRows = parseListingTable(listingHtml);

    if (listingRows.length === 0) {
      return NextResponse.json({
        imported: 0,
        skipped: 0,
        duplicates: 0,
        message: "No members found — NCBFAA page format may have changed",
      });
    }

    // Step 3: Deduplicate by company name (listing has multi-location entries)
    const uniqueCompanies = deduplicateByCompany(listingRows);

    // Step 4: Fetch detail pages in batches to get phone numbers
    const DETAIL_BATCH_SIZE = 10;
    const enrichedRows: EnrichedRow[] = [];
    for (let i = 0; i < uniqueCompanies.length; i += DETAIL_BATCH_SIZE) {
      const batch = uniqueCompanies.slice(i, i + DETAIL_BATCH_SIZE);
      const details = await Promise.allSettled(
        batch.map((row) => fetchDetailPage(row.detailUrl))
      );
      for (let j = 0; j < batch.length; j++) {
        const detail = details[j];
        const base = batch[j];
        if (detail.status === "fulfilled" && detail.value) {
          enrichedRows.push({ ...base, ...detail.value });
        } else {
          enrichedRows.push({ ...base, phone: null, website: null, address: null, email: null });
        }
      }
    }

    // Step 5: Import into PartnerLead
    return importRows(enrichedRows);
  } catch (err: any) {
    console.error("[ncbfaa-import] scrape error:", err);
    return NextResponse.json(
      { error: err.message || "NCBFAA scrape failed" },
      { status: 500 }
    );
  }
}

async function fetchNCBFAAListing(): Promise<string> {
  const res = await fetch(NCBFAA_SEARCH_URL, {
    method: "POST",
    headers: {
      "User-Agent": "Fintella-Partner-Portal/1.0 (ncbfaa-import)",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      DirectoryType: "CompanyMembers",
      Web_SelMethod: "Random",
      "Company Name": "",
      "Main City": "",
      "Main State": "All States",
      sort: "1",
      submitButtonName: "Search",
    }).toString(),
  });
  if (!res.ok) throw new Error(`NCBFAA listing returned ${res.status}`);
  return res.text();
}

interface ListingRow {
  companyName: string;
  contactName: string;
  city: string;
  state: string;
  detailUrl: string;
}

function parseListingTable(html: string): ListingRow[] {
  const rows: ListingRow[] = [];

  // Each member row has a detail link and 4 table cells
  const rowRegex =
    /<tr>\s*<td[^>]*><a\s+href="([^"]+)"[^>]*>([^<]+)<\/a><\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<\/tr>/gi;

  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    rows.push({
      detailUrl: decodeHTMLEntities(match[1]),
      companyName: decodeHTMLEntities(match[2]).trim(),
      contactName: decodeHTMLEntities(match[3]).trim(),
      city: decodeHTMLEntities(match[4]).trim(),
      state: decodeHTMLEntities(match[5]).trim(),
    });
  }

  return rows;
}

function deduplicateByCompany(rows: ListingRow[]): ListingRow[] {
  const seen = new Map<string, ListingRow>();
  for (const row of rows) {
    const key = row.companyName.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, row);
    }
  }
  return Array.from(seen.values());
}

interface DetailInfo {
  phone: string | null;
  website: string | null;
  address: string | null;
  email: string | null;
}

async function fetchDetailPage(url: string): Promise<DetailInfo | null> {
  try {
    // Ensure absolute URL
    const fullUrl = url.startsWith("http") ? url : `https://members.ncbfaa.org${url}`;
    const res = await fetch(fullUrl, {
      headers: { "User-Agent": "Fintella-Partner-Portal/1.0 (ncbfaa-import)" },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Extract phone
    const phoneMatch = html.match(/<b>Phone:<\/b>\s*<\/td>\s*<td>([^<]+)<\/td>/i);
    const phone = phoneMatch ? phoneMatch[1].trim() : null;

    // Extract website
    const webMatch = html.match(/<b>Web:<\/b>\s*<\/td>\s*<td><a[^>]+href="([^"]+)"[^>]*>/i);
    const website = webMatch ? webMatch[1].trim() : null;

    // Extract email (if visible — usually behind login but we try)
    const emailMatch = html.match(/<b>Email:<\/b>\s*<\/td>\s*<td><a[^>]+href="mailto:([^"]+)"[^>]*>/i);
    const email = emailMatch ? emailMatch[1].trim().toLowerCase() : null;

    // Extract address lines
    const addrMatch = html.match(
      /<b>Company Address:<\/b>\s*<\/td>\s*<td>([\s\S]*?)<\/td>/i
    );
    const address = addrMatch
      ? addrMatch[1]
          .replace(/<br\s*\/?>/gi, ", ")
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim()
      : null;

    return { phone, website, address, email };
  } catch {
    return null;
  }
}

// ─── Mode 2: CSV Import ────────────────────────────────────────────────────

interface CSVRow {
  companyName?: string;
  Company?: string;
  "Company Name"?: string;
  contactName?: string;
  Contact?: string;
  "Primary Contact"?: string;
  "Contact Name"?: string;
  email?: string;
  Email?: string;
  "Email Address"?: string;
  phone?: string;
  Phone?: string;
  "Phone Number"?: string;
  city?: string;
  City?: string;
  state?: string;
  State?: string;
  website?: string;
  Website?: string;
  Web?: string;
}

async function handleCSVImport(rows: CSVRow[]) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No rows to import" }, { status: 400 });
  }
  if (rows.length > 5000) {
    return NextResponse.json({ error: "Maximum 5,000 rows per import" }, { status: 400 });
  }

  const enriched: EnrichedRow[] = rows.map((r) => ({
    companyName:
      r.companyName || r.Company || r["Company Name"] || "",
    contactName:
      r.contactName || r.Contact || r["Primary Contact"] || r["Contact Name"] || "",
    city: r.city || r.City || "",
    state: r.state || r.State || "",
    detailUrl: "",
    phone: r.phone || r.Phone || r["Phone Number"] || null,
    website: r.website || r.Website || r.Web || null,
    address: null,
    email: (r.email || r.Email || r["Email Address"] || "").trim().toLowerCase() || null,
  }));

  return importRows(enriched);
}

// ─── Shared import logic ───────────────────────────────────────────────────

interface EnrichedRow extends ListingRow {
  phone: string | null;
  website: string | null;
  address: string | null;
  email: string | null;
}

async function importRows(rows: EnrichedRow[]) {
  // Load existing emails + company names for dedup
  const existingEmails = new Set(
    (await prisma.partnerLead.findMany({ select: { email: true } }))
      .map((l) => l.email.toLowerCase())
  );

  const existingCompanies = new Set(
    (
      await prisma.partnerLead.findMany({
        where: { notes: { contains: "NCBFAA" } },
        select: { notes: true },
      })
    )
      .map((l) => {
        const m = (l.notes || "").match(/Company: (.+)/);
        return m ? m[1].toLowerCase() : "";
      })
      .filter(Boolean)
  );

  let imported = 0;
  let skipped = 0;
  let duplicates = 0;
  let emailVerified = 0;
  let emailFailed = 0;

  for (const row of rows) {
    const companyName = (row.companyName || "").trim();
    if (!companyName) {
      skipped++;
      continue;
    }

    // Dedup by company name
    if (existingCompanies.has(companyName.toLowerCase())) {
      duplicates++;
      continue;
    }

    // Parse contact name
    const nameParts = (row.contactName || "").trim().split(/\s+/);
    const firstName = nameParts[0] || companyName.split(/\s+/)[0] || "Unknown";
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "NCBFAA Member";

    // Handle email
    let email = (row.email || "").trim().toLowerCase();
    let emailNote = "";

    if (email && email.includes("@import.placeholder")) {
      email = "";
    }

    if (email && EMAIL_RE.test(email)) {
      // Verify MX record exists
      const mxOk = await checkMX(email);
      if (mxOk) {
        emailVerified++;
        emailNote = "MX Verified: Yes";
      } else {
        emailFailed++;
        emailNote = "MX Verified: No (skipped — no MX record)";
        // Skip leads with invalid email domains
        email = "";
      }
    }

    // Dedup by email
    if (email && existingEmails.has(email)) {
      duplicates++;
      continue;
    }

    // Build phone string
    const phone = normalizePhone(row.phone);

    // Must have at least a phone or company name to be useful
    if (!phone && !email) {
      // Still import with placeholder email since we have the company name
    }

    const noteLines = [
      "Source: NCBFAA Membership Directory",
      `Company: ${companyName}`,
      row.city || row.state
        ? `Location: ${[row.city, row.state].filter(Boolean).join(", ")}`
        : null,
      row.website ? `Website: ${row.website}` : null,
      row.address ? `Address: ${row.address}` : null,
      emailNote || null,
      `Imported: ${new Date().toISOString().split("T")[0]}`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await prisma.partnerLead.create({
        data: {
          firstName,
          lastName,
          email: email || `ncbfaa-${slugify(companyName)}@import.placeholder`,
          phone: phone || null,
          commissionRate: 0.2,
          tier: "l2",
          referredByCode: "PTNS4XDMN",
          source: "ncbfaa",
          state: row.state || null,
          notes: noteLines,
        },
      });
      if (email) existingEmails.add(email);
      existingCompanies.add(companyName.toLowerCase());
      imported++;
    } catch (err: any) {
      if (err.code === "P2002") {
        duplicates++;
      } else {
        console.error(`[ncbfaa-import] row error for "${companyName}":`, err.message);
        skipped++;
      }
    }
  }

  return NextResponse.json({
    imported,
    skipped,
    duplicates,
    emailVerified,
    emailFailed,
    totalRows: rows.length,
    message: `NCBFAA import complete: ${imported} new leads imported`,
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function checkMX(email: string): Promise<boolean> {
  return new Promise((resolve) => {
    const domain = email.split("@")[1];
    if (!domain) {
      resolve(false);
      return;
    }
    dns.resolveMx(domain, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  if (!cleaned) return null;
  // Remove non-digit except + and x
  const digits = cleaned.replace(/[^0-9]/g, "");
  if (digits.length < 7) return null;
  // Format as E.164 if US
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return cleaned;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#61;/g, "=")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}
