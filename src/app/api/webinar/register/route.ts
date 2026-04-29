import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/webinar/register
 * Public — captures webinar registration as a PartnerLead.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, company, phone } = body;

    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }

    const names = name.trim().split(/\s+/);
    const firstName = names[0] || name.trim();
    const lastName = names.slice(1).join(" ") || "";

    const existing = await prisma.partnerLead.findFirst({
      where: { email: email.trim().toLowerCase() },
    });

    if (existing) {
      await prisma.partnerLead.update({
        where: { id: existing.id },
        data: {
          notes: [
            existing.notes || "",
            `[${new Date().toISOString().split("T")[0]}] Registered for webinar`,
            company ? `Company: ${company.trim()}` : null,
          ].filter(Boolean).join("\n"),
        },
      });
      return NextResponse.json({ success: true });
    }

    await prisma.partnerLead.create({
      data: {
        firstName,
        lastName,
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        commissionRate: 0.20,
        tier: "l2",
        referredByCode: "PTNS4XDMN",
        notes: [
          "Source: Webinar registration (/webinar)",
          company ? `Company: ${company.trim()}` : null,
          `Registered: ${new Date().toISOString().split("T")[0]}`,
        ].filter(Boolean).join("\n"),
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error("[api/webinar/register] error:", err);
    return NextResponse.json({ error: "Failed to register. Please try again." }, { status: 500 });
  }
}
