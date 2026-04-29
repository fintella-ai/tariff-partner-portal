import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_ROLES = ["super_admin", "admin"];

/**
 * POST /api/admin/leads/lookup-phones
 * Bulk phone type lookup using Twilio Lookup API.
 * Updates lead notes with "Phone Type: mobile|landline|voip".
 * Demo-gated: returns mock results if TWILIO_ACCOUNT_SID is unset.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes((session.user as any).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const SID = process.env.TWILIO_ACCOUNT_SID;
  const TOKEN = process.env.TWILIO_AUTH_TOKEN;

  const leads = await prisma.partnerLead.findMany({
    where: {
      phone: { not: null },
      NOT: { notes: { contains: "Phone Type:" } },
    },
    select: { id: true, phone: true, notes: true },
    take: 100,
  });

  if (leads.length === 0) {
    return NextResponse.json({ looked_up: 0, message: "All leads with phones already have type data" });
  }

  if (!SID || !TOKEN) {
    let updated = 0;
    for (const lead of leads) {
      await prisma.partnerLead.update({
        where: { id: lead.id },
        data: {
          notes: [lead.notes || "", "Phone Type: unknown (Twilio not configured)"].filter(Boolean).join("\n"),
        },
      });
      updated++;
    }
    return NextResponse.json({ looked_up: updated, demo: true, message: "Twilio not configured — marked as unknown. Set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN to enable carrier lookup." });
  }

  let looked_up = 0;
  let errors = 0;
  const auth64 = Buffer.from(`${SID}:${TOKEN}`).toString("base64");

  for (const lead of leads) {
    const phone = (lead.phone || "").replace(/[^+\d]/g, "");
    if (!phone || phone.length < 10) continue;

    const formatted = phone.startsWith("+") ? phone : `+1${phone.replace(/^1/, "")}`;

    try {
      const res = await fetch(
        `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(formatted)}?Fields=line_type_intelligence`,
        { headers: { Authorization: `Basic ${auth64}` } }
      );

      if (!res.ok) { errors++; continue; }

      const data = await res.json();
      const lineType = data.line_type_intelligence?.type || "unknown";

      await prisma.partnerLead.update({
        where: { id: lead.id },
        data: {
          notes: [lead.notes || "", `Phone Type: ${lineType}`].filter(Boolean).join("\n"),
        },
      });
      looked_up++;
    } catch {
      errors++;
    }
  }

  return NextResponse.json({ looked_up, errors, remaining: leads.length - looked_up - errors });
}
