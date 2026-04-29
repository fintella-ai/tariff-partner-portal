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
    select: { id: true, firstName: true, lastName: true, phone: true, email: true, notes: true },
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
    let newFirstName = lead.firstName;
    let newLastName = lead.lastName;

    // 0. Fix firstName/lastName vs filer code alignment
    const filerInNotes = notes.match(/Filer Code: (\w+)/);
    if (filerInNotes) {
      const filerCode = filerInNotes[1];
      const NOT_FILER_CODES = new Set(["the", "and", "for", "inc", "llc", "ltd", "usa", "intl", "int"]);
      const isValidFilerCode = /^[A-Za-z0-9]{2,4}$/.test(filerCode) && !NOT_FILER_CODES.has(filerCode.toLowerCase());

      if (isValidFilerCode) {
        // Case A: firstName IS the filer code (exact match) — name is missing
        if (lead.firstName.toUpperCase() === filerCode.toUpperCase()) {
          newFirstName = filerCode;
          newLastName = "Broker";
          changed = true;
        }
        // Case B: firstName is longer than 4 chars — it's a real name, not a filer code
        // The filer code in notes is correct, firstName/lastName are the broker name
        // Nothing to fix for the name fields — they're correct
        // But if lastName looks like a city (all caps, single word), it may be misaligned
        else if (lead.firstName.length > 4 && lead.lastName && /^[A-Z\s]+$/.test(lead.lastName) && !lead.lastName.includes(" ")) {
          // lastName is probably a city from CBP offset, not a last name
          // Move firstName to be the full broker name
          newFirstName = lead.firstName;
          newLastName = "Broker";
          changed = true;
        }
      } else {
        // Filer code in notes is invalid (> 4 chars, or a common word like "the")
        // It's probably part of the broker name that got stored wrong
        if (lead.firstName.length <= 4 && /^[A-Za-z0-9]+$/.test(lead.firstName)) {
          // firstName looks like it could be a real filer code
          // Prepend the invalid "filer code" to the broker name
          newFirstName = `${filerCode} ${lead.firstName}`.trim();
          newLastName = "Broker";
          changed = true;
        } else {
          // Both are name-like — combine them
          newFirstName = `${filerCode} ${lead.firstName}`.trim();
          newLastName = lead.lastName === "Broker" ? "Broker" : "Broker";
          changed = true;
        }
      }
    }

    // 0b. Extract broker name from location + fix city/state order
    // Pattern: location="HI, COREY YAMA", lastName="HONOLULU"
    // Should be: name=COREY YAMA, location=HONOLULU, HI
    const US_STATES = new Set(["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC","PR","VI","GU"]);
    const locParts = newLocation.match(/^([A-Z]{2}),\s*(.+)$/);
    if (locParts && US_STATES.has(locParts[1])) {
      const stateCode = locParts[1];
      const afterState = locParts[2].trim();
      if (afterState && !/^\d/.test(afterState) && !PHONE_REGEX.test(afterState) && !EMAIL_REGEX.test(afterState)) {
        // afterState is a broker name, and lead.lastName might be the city
        const cityCandidate = lead.lastName && lead.lastName !== "Broker" && /^[A-Z\s]+$/.test(lead.lastName) ? lead.lastName : null;
        newFirstName = afterState;
        newLastName = "Broker";
        newLocation = cityCandidate ? `${cityCandidate}, ${stateCode}` : stateCode;
        changed = true;
      }
    }

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
    if (newFirstName !== lead.firstName) updates.firstName = newFirstName;
    if (newLastName !== lead.lastName) updates.lastName = newLastName;

    await prisma.partnerLead.update({ where: { id: lead.id }, data: updates });
    fixed++;
  }

  return NextResponse.json({ fixed, total: leads.length, message: `Fixed ${fixed} leads. Run Phone Types + Validate Emails to re-check.` });
}
