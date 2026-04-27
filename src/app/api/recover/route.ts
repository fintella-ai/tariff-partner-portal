import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/recover
 * Public endpoint — client-facing refund calculator form submission.
 * Creates a PartnerLead (admin lead list) for internal tracking.
 * If partnerCode is provided (via ?ref= or utm_content), also creates
 * a PartnerProspect in that partner's CRM pipeline.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { companyName, contactName, email, phone, importProducts, estimatedDuties, estimatedRefund, partnerCode } = body;

    if (!companyName?.trim() || !contactName?.trim() || !email?.trim()) {
      return NextResponse.json({ error: "Company name, contact name, and email are required" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }

    const names = contactName.trim().split(/\s+/);
    const firstName = names[0] || contactName.trim();
    const lastName = names.slice(1).join(" ") || "";

    // Create admin lead for internal tracking
    await prisma.partnerLead.create({
      data: {
        firstName,
        lastName,
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        commissionRate: 0.25,
        tier: "l1",
        referredByCode: partnerCode || null,
        notes: [
          `Source: /recover landing page`,
          importProducts ? `Imports: ${importProducts}` : null,
          estimatedDuties ? `Est. duties: $${Number(estimatedDuties).toLocaleString()}` : null,
          estimatedRefund ? `Est. refund: $${Number(estimatedRefund).toLocaleString()}` : null,
          partnerCode ? `Referred by: ${partnerCode}` : "Direct (no partner referral)",
        ].filter(Boolean).join("\n"),
      },
    });

    // If a partner referred this lead, also add to their personal CRM pipeline
    if (partnerCode) {
      const partner = await prisma.partner.findUnique({
        where: { partnerCode },
        select: { partnerCode: true, status: true },
      });

      if (partner && partner.status === "active") {
        await prisma.partnerProspect.create({
          data: {
            partnerCode,
            companyName: companyName.trim(),
            contactName: contactName.trim(),
            contactEmail: email.trim().toLowerCase(),
            contactPhone: phone?.trim() || null,
            productTypes: importProducts?.trim() || null,
            annualDuties: estimatedDuties ? `$${Number(estimatedDuties).toLocaleString()}` : null,
            stage: "new",
            score: estimatedDuties && estimatedDuties >= 250000 ? 60 : estimatedDuties >= 50000 ? 40 : 20,
            source: "website",
            notes: `Submitted via /recover calculator. Est. refund: $${Number(estimatedRefund || 0).toLocaleString()}`,
          },
        }).catch(() => {});
      }
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error("[api/recover] error:", err);
    return NextResponse.json({ error: "Failed to submit. Please try again." }, { status: 500 });
  }
}
