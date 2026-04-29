import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_ROLES = ["super_admin", "admin"];

const PHONE_REGEX = /(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\d{10,11})/;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i;

/**
 * POST /api/admin/leads/cleanup-columns
 * Fixes misaligned CBP import data and resets validation tags.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes((session.user as any).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const leads = await prisma.partnerLead.findMany({
    where: { notes: { contains: "CBP Broker Listing" } },
    select: { id: true, phone: true, email: true, notes: true },
  });

  let fixed = 0;
  const details: string[] = [];

  for (const lead of leads) {
    const notes = lead.notes || "";
    const locationMatch = notes.match(/Location: (.+)/);
    const location = locationMatch?.[1] || "";
    let currentPhone = (lead.phone || "").trim();
    let currentEmail = lead.email || "";
    let newLocation = location;
    let changed = false;

    // 1. Extract email from phone field (e.g. "100 xbclarke@williamsclarke.com" or "218 xjmolina@wjbyrnes.com")
    const emailInPhone = currentPhone.match(EMAIL_REGEX);
    if (emailInPhone) {
      if (currentEmail.includes("@import.placeholder")) {
        currentEmail = emailInPhone[0].toLowerCase();
      }
      currentPhone = currentPhone.replace(emailInPhone[0], "").trim();
      changed = true;
    }

    // 2. Extract phone from location field (e.g. "MI, 415-600-6500" or "CA, 3108346458")
    const phoneInLocation = location.match(PHONE_REGEX);
    if (phoneInLocation) {
      const extractedPhone = phoneInLocation[1];
      const digits = extractedPhone.replace(/[^0-9]/g, "");
      if (digits.length >= 10) {
        // Current phone might be just an extension (1-4 digits)
        const ext = currentPhone && /^\d{1,4}$/.test(currentPhone) ? currentPhone : null;
        currentPhone = ext ? `${extractedPhone} x${ext}` : extractedPhone;
        newLocation = location.replace(phoneInLocation[0], "").replace(/,\s*$/, "").replace(/^\s*,\s*/, "").trim();
        changed = true;
      }
    }

    // 3. If phone is still just a short extension (1-4 digits) with no real phone found, null it
    if (currentPhone && /^\d{1,4}$/.test(currentPhone)) {
      currentPhone = "";
      changed = true;
    }

    if (!changed) continue;

    // Rebuild notes: update location, strip old validation tags so they get re-validated
    let newNotes = notes;
    if (newLocation !== location) {
      if (newLocation) {
        newNotes = newNotes.replace(`Location: ${location}`, `Location: ${newLocation}`);
      } else {
        newNotes = newNotes.replace(`Location: ${location}`, "").replace(/\n\n+/g, "\n");
      }
    }
    // Strip old validation tags so leads get re-checked with correct data
    newNotes = newNotes.split("\n").filter((l) =>
      !l.startsWith("Phone Type:") && !l.startsWith("Email Verdict:")
    ).join("\n").trim();

    const updates: any = { notes: newNotes };
    if (currentPhone !== (lead.phone || "").trim()) updates.phone = currentPhone || null;
    if (currentEmail !== lead.email) updates.email = currentEmail;

    await prisma.partnerLead.update({ where: { id: lead.id }, data: updates });
    fixed++;
  }

  return NextResponse.json({ fixed, total: leads.length, message: `Fixed ${fixed} leads. Run Phone Types + Validate Emails to re-check.` });
}
