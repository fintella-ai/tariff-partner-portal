import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/recover
 * Public endpoint — client-facing refund calculator form submission.
 * Creates a ClientSubmission for internal leads tracking + KPIs.
 * Does NOT create a Deal — the Deal is created by Frost Law's webhook.
 * ClientSubmission syncs to the Deal by email match when the webhook fires.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      companyName, contactName, email, phone, importProducts,
      estimatedDuties, estimatedRefund, partnerCode, entryPeriod,
      htsCategory, title, city, state, importsGoods, importCountries,
      annualImportValue, importerOfRecord, businessEntityType,
      affiliateNotes, ein,
      utmSource, utmMedium, utmCampaign, utmTerm, utmAdGroup,
    } = body;

    if (!companyName?.trim() || !contactName?.trim() || !email?.trim()) {
      return NextResponse.json({ error: "Company name, contact name, and email are required" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }

    const names = contactName.trim().split(/\s+/);
    const firstName = names[0] || contactName.trim();
    const lastName = names.slice(1).join(" ") || "";

    // Check if a deal already exists for this email (link if so)
    const existingDeal = await prisma.deal.findFirst({
      where: { clientEmail: email.trim().toLowerCase() },
      select: { id: true, stage: true },
      orderBy: { createdAt: "desc" },
    });

    const submission = await prisma.clientSubmission.create({
      data: {
        firstName,
        lastName,
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        title: title?.trim() || null,
        companyName: companyName.trim(),
        city: city?.trim() || null,
        state: state?.trim() || null,
        ein: ein?.trim() || null,
        businessEntityType: businessEntityType || null,
        importsGoods: importsGoods || null,
        importCountries: importCountries || null,
        annualImportValue: annualImportValue || null,
        importerOfRecord: importerOfRecord || null,
        affiliateNotes: affiliateNotes || null,
        importCategory: importProducts || htsCategory || null,
        estimatedDuties: estimatedDuties ? Number(estimatedDuties) : null,
        estimatedRefund: estimatedRefund ? Number(estimatedRefund) : null,
        entryPeriod: entryPeriod || null,
        partnerCode: partnerCode || null,
        utmSource: utmSource || null,
        utmMedium: utmMedium || null,
        utmCampaign: utmCampaign || null,
        utmTerm: utmTerm || null,
        utmAdGroup: utmAdGroup || null,
        dealId: existingDeal?.id || null,
        dealStage: existingDeal?.stage || null,
      },
    });

    return NextResponse.json({ success: true, id: submission.id }, { status: 201 });
  } catch (err) {
    console.error("[api/recover] error:", err);
    return NextResponse.json({ error: "Failed to submit. Please try again." }, { status: 500 });
  }
}
