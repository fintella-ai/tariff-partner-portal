import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/recover/resource
 * Public — gated resource download. Captures lead info before allowing PDF download.
 * Creates/updates a PartnerLead for internal tracking.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, company, resourceId, resourceTitle, partnerCode } = body;

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
            `[${new Date().toISOString()}] Downloaded: ${resourceTitle || resourceId}`,
          ].filter(Boolean).join("\n"),
        },
      });
    } else {
      await prisma.partnerLead.create({
        data: {
          firstName,
          lastName,
          email: email.trim().toLowerCase(),
          commissionRate: 0.25,
          tier: "l1",
          referredByCode: partnerCode || null,
          notes: [
            "Source: /recover resource download",
            company ? `Company: ${company}` : null,
            `Downloaded: ${resourceTitle || resourceId}`,
            partnerCode ? `Referred by: ${partnerCode}` : "Direct (no partner referral)",
          ].filter(Boolean).join("\n"),
        },
      });

      if (partnerCode) {
        const partner = await prisma.partner.findUnique({
          where: { partnerCode },
          select: { partnerCode: true, status: true },
        });
        if (partner && partner.status === "active") {
          await prisma.partnerProspect.create({
            data: {
              partnerCode,
              companyName: company?.trim() || `${firstName} ${lastName}`.trim(),
              contactName: name.trim(),
              contactEmail: email.trim().toLowerCase(),
              stage: "new",
              score: 10,
              source: "resource_download",
              notes: `Downloaded: ${resourceTitle || resourceId}`,
            },
          }).catch(() => {});
        }
      }
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error("[api/recover/resource] error:", err);
    return NextResponse.json({ error: "Failed to submit. Please try again." }, { status: 500 });
  }
}
