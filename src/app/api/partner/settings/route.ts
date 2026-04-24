import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/format";

/**
 * GET /api/partner/settings
 * Returns the current partner's personal info + profile (address).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode) {
    return NextResponse.json({ error: "Not a partner" }, { status: 403 });
  }

  try {
    const [partner, profile] = await Promise.all([
      prisma.partner.findUnique({ where: { partnerCode } }),
      prisma.partnerProfile.findUnique({ where: { partnerCode } }),
    ]);

    if (!partner) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }

    return NextResponse.json({
      firstName: partner.firstName,
      lastName: partner.lastName,
      companyName: partner.companyName || "",
      tin: partner.tin || "",
      email: partner.email,
      phone: partner.phone || "",
      mobilePhone: partner.mobilePhone || "",
      // Communications opt-ins (Phase 15a / 15b)
      emailOptIn: !!partner.emailOptIn,
      smsOptIn: !!partner.smsOptIn,
      // PartnerOS AI Phase 1 — persona choice (null = prompt on first AI visit)
      preferredGeneralist: partner.preferredGeneralist || null,
      street: profile?.street || "",
      street2: profile?.street2 || "",
      city: profile?.city || "",
      state: profile?.state || "",
      zip: profile?.zip || "",
      // Payout / Banking
      payoutMethod: profile?.payoutMethod || "",
      bankName: profile?.bankName || "",
      accountType: profile?.accountType || "",
      routingNumber: profile?.routingNumber || "",
      accountNumber: profile?.accountNumber || "",
      beneficiaryName: profile?.beneficiaryName || "",
      bankStreet: profile?.bankStreet || "",
      bankStreet2: profile?.bankStreet2 || "",
      bankCity: profile?.bankCity || "",
      bankState: profile?.bankState || "",
      bankZip: profile?.bankZip || "",
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/partner/settings
 * Updates the partner's personal info + profile.
 * If firstName, lastName, or companyName changed, invalidates the current agreement.
 */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode) {
    return NextResponse.json({ error: "Not a partner" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      firstName, lastName, companyName, tin,
      email, phone, mobilePhone,
      emailOptIn, smsOptIn,
      street, street2, city, state, zip,
      payoutMethod, bankName, accountType, routingNumber,
      accountNumber, beneficiaryName,
      bankStreet, bankStreet2, bankCity, bankState, bankZip,
      preferredGeneralist,
    } = body;

    // Fetch current partner to detect name/company changes
    const currentPartner = await prisma.partner.findUnique({
      where: { partnerCode },
    });

    if (!currentPartner) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }

    const nameChanged =
      (firstName !== undefined && firstName !== currentPartner.firstName) ||
      (lastName !== undefined && lastName !== currentPartner.lastName) ||
      (companyName !== undefined && (companyName || "") !== (currentPartner.companyName || ""));

    // Phase 15a/15b — refresh optInDate when an opt-in flips ON. We don't
    // touch optInDate on opt-out (the historical consent date is still
    // useful for audit). The TCPA gate inside src/lib/twilio.ts reads
    // smsOptIn directly off the Partner row, so flipping this here is
    // sufficient to suppress future sends without any other plumbing.
    const flippedOnOptIn =
      (emailOptIn === true && !currentPartner.emailOptIn) ||
      (smsOptIn === true && !currentPartner.smsOptIn);

    // Update Partner record
    await prisma.partner.update({
      where: { partnerCode },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(companyName !== undefined && { companyName: companyName || null }),
        ...(tin !== undefined && { tin: tin || null }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone: normalizePhone(phone) }),
        ...(mobilePhone !== undefined && { mobilePhone: normalizePhone(mobilePhone) }),
        ...(typeof emailOptIn === "boolean" && { emailOptIn }),
        ...(typeof smsOptIn === "boolean" && { smsOptIn }),
        ...(flippedOnOptIn && { optInDate: new Date() }),
        // Strict allowlist — only "finn" or "stella" may ever be persisted
        ...(typeof preferredGeneralist === "string" &&
        (preferredGeneralist === "finn" || preferredGeneralist === "stella")
          ? { preferredGeneralist }
          : {}),
      },
    });

    // Upsert PartnerProfile for address fields
    await prisma.partnerProfile.upsert({
      where: { partnerCode },
      create: {
        partnerCode,
        street: street || null,
        street2: street2 || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        payoutMethod: payoutMethod || null,
        bankName: bankName || null,
        accountType: accountType || null,
        routingNumber: routingNumber || null,
        accountNumber: accountNumber || null,
        beneficiaryName: beneficiaryName || null,
        bankStreet: bankStreet || null,
        bankStreet2: bankStreet2 || null,
        bankCity: bankCity || null,
        bankState: bankState || null,
        bankZip: bankZip || null,
      },
      update: {
        ...(street !== undefined && { street: street || null }),
        ...(street2 !== undefined && { street2: street2 || null }),
        ...(city !== undefined && { city: city || null }),
        ...(state !== undefined && { state: state || null }),
        ...(zip !== undefined && { zip: zip || null }),
        ...(payoutMethod !== undefined && { payoutMethod: payoutMethod || null }),
        ...(bankName !== undefined && { bankName: bankName || null }),
        ...(accountType !== undefined && { accountType: accountType || null }),
        ...(routingNumber !== undefined && { routingNumber: routingNumber || null }),
        ...(accountNumber !== undefined && { accountNumber: accountNumber || null }),
        ...(beneficiaryName !== undefined && { beneficiaryName: beneficiaryName || null }),
        ...(bankStreet !== undefined && { bankStreet: bankStreet || null }),
        ...(bankStreet2 !== undefined && { bankStreet2: bankStreet2 || null }),
        ...(bankCity !== undefined && { bankCity: bankCity || null }),
        ...(bankState !== undefined && { bankState: bankState || null }),
        ...(bankZip !== undefined && { bankZip: bankZip || null }),
      },
    });

    // If name or company changed, invalidate current signed agreement
    let agreementReset = false;
    if (nameChanged) {
      const currentAgreement = await prisma.partnershipAgreement.findFirst({
        where: { partnerCode, status: "signed" },
        orderBy: { version: "desc" },
      });

      if (currentAgreement) {
        await prisma.partnershipAgreement.update({
          where: { id: currentAgreement.id },
          data: { status: "amended" },
        });
        agreementReset = true;
      }
    }

    return NextResponse.json({
      success: true,
      agreementReset,
      message: agreementReset
        ? "Settings saved. Your name or company changed, so a new partnership agreement is required."
        : "Settings saved successfully.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update settings" },
      { status: 500 }
    );
  }
}
