import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/partners/interest
 * Public — broker/partner recruitment form from /partners page.
 * Creates a PartnerLead tagged as a broker recruitment prospect.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, company, phone, professionalType, estimatedClients, message } = body;

    if (!name?.trim() || !email?.trim() || !company?.trim()) {
      return NextResponse.json({ error: "Name, email, and company are required" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }

    const existing = await prisma.partnerLead.findFirst({
      where: { email: email.trim().toLowerCase() },
    });

    if (existing) {
      await prisma.partnerLead.update({
        where: { id: existing.id },
        data: {
          status: "needs_review",
          notes: [
            existing.notes || "",
            `\n[${new Date().toISOString()}] Applied via /partners — NEEDS REVIEW`,
            company ? `Company: ${company.trim()}` : null,
            professionalType ? `Type: ${professionalType}` : null,
            estimatedClients ? `Est. clients: ${estimatedClients}` : null,
            message ? `Message: ${message}` : null,
          ].filter(Boolean).join("\n"),
        },
      });
      return NextResponse.json({ success: true }, { status: 200 });
    }

    const names = name.trim().split(/\s+/);
    const firstName = names[0] || name.trim();
    const lastName = names.slice(1).join(" ") || "";

    await prisma.partnerLead.create({
      data: {
        firstName,
        lastName,
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        commissionRate: 0.20,
        tier: "l1",
        status: "needs_review",
        notes: [
          "Source: /partners broker recruitment page",
          `Company: ${company.trim()}`,
          professionalType ? `Type: ${professionalType}` : null,
          estimatedClients ? `Est. importer clients: ${estimatedClients}` : null,
          message ? `Message: ${message}` : null,
        ].filter(Boolean).join("\n"),
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error("[api/partners/interest] error:", err);
    return NextResponse.json({ error: "Failed to submit. Please try again." }, { status: 500 });
  }
}
