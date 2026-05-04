import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/format";

const BROKER_RATE = 0.25;
const REFERRAL_RATE = 0.10;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const phoneRaw = String(body.phone ?? "").trim();
    const companyName = String(body.companyName ?? "").trim() || null;
    const isBroker = body.isBroker === true;
    const clientCount = String(body.clientCount ?? "").trim() || null;
    const splitVariant = String(body.splitVariant ?? "").trim() || null;
    const additionalNotes = String(body.additionalNotes ?? "").trim() || null;

    // ── Validation ──────────────────────────────────────────────────────
    if (!firstName || !lastName || !email) {
      return NextResponse.json(
        { error: "First name, last name, and email are required" },
        { status: 400 },
      );
    }
    if (!email.includes("@") || email.length > 254 || email.length < 5) {
      return NextResponse.json(
        { error: "Please enter a valid email" },
        { status: 400 },
      );
    }
    if (!phoneRaw) {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 },
      );
    }

    const phone = normalizePhone(phoneRaw);

    // ── Duplicate guards ────────────────────────────────────────────────
    const existing = await prisma.partnerApplication.findFirst({
      where: { email, status: { not: "rejected" } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      return NextResponse.json({
        success: true,
        applicationId: existing.id,
        alreadyApplied: true,
      });
    }

    const existingPartner = await prisma.partner.findFirst({
      where: { email },
    });
    if (existingPartner) {
      return NextResponse.json({
        success: true,
        applicationId: null,
        alreadyPartner: true,
      });
    }

    // ── IP-based rate limiting ──────────────────────────────────────────
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null;
    const userAgent = req.headers.get("user-agent") ?? null;

    if (ip) {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      const count = await prisma.partnerApplication.count({
        where: { ipAddress: ip, createdAt: { gte: tenMinAgo } },
      });
      if (count >= 5) {
        return NextResponse.json(
          { error: "Too many applications — try again later" },
          { status: 429 },
        );
      }
    }

    const commissionRate = isBroker ? BROKER_RATE : REFERRAL_RATE;

    const audienceContext = isBroker
      ? `Licensed customs broker with ${clientCount || "unknown"} import clients. ${BROKER_RATE * 100}% commission.`
      : `Referral partner. ${clientCount || "unknown"} clients. ${REFERRAL_RATE * 100}% commission.`;

    // ── Create application ──────────────────────────────────────────────
    const application = await prisma.partnerApplication.create({
      data: {
        firstName,
        lastName,
        email,
        phone,
        companyName,
        partnerType: isBroker ? "broker" : "referral",
        clientCount,
        splitVariant,
        additionalNotes,
        audienceContext,
        referralSource: "broker_landing",
        utmSource: String(body.utmSource ?? "").trim() || null,
        utmMedium: String(body.utmMedium ?? "").trim() || null,
        utmCampaign: String(body.utmCampaign ?? "").trim() || null,
        utmContent: "PTNS4XDMN",
        ipAddress: ip,
        userAgent: userAgent?.slice(0, 500) ?? null,
      },
    });

    // ── Auto-approve: create invite + update application ────────────────
    try {
      const { default: crypto } = await import("crypto");
      const token = crypto.randomBytes(16).toString("hex");

      const invite = await prisma.recruitmentInvite.create({
        data: {
          inviterCode: "PTNS4XDMN",
          targetTier: "l2",
          commissionRate,
          token,
          invitedEmail: email,
          invitedName: `${firstName} ${lastName}`,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      await prisma.partnerApplication.update({
        where: { id: application.id },
        data: {
          status: "approved",
          approvedAt: new Date(),
          inviteId: invite.id,
        },
      });

      // Fire-and-forget invite email
      import("@/lib/sendgrid")
        .then(({ sendDownlineInviteEmail }) =>
          sendDownlineInviteEmail({
            toEmail: email,
            toName: `${firstName} ${lastName}`,
            senderName: "Fintella",
            senderPartnerCode: "PTNS4XDMN",
            commissionRate,
            targetTier: "l2",
            signupUrl: `https://fintella.partners/getstarted?token=${token}`,
          }),
        )
        .catch(() => {});

      // Push to Google Sheets
      import("@/lib/google-sheets").then(({ appendPartnerRow }) =>
        appendPartnerRow({
          firstName, lastName, email,
          createdAt: new Date().toISOString().split("T")[0],
          commissionRate: `${Math.round(commissionRate * 100)}%`,
        })
      ).catch(() => {});

      // Admin notification — new broker/referral partner signed up
      const partnerLabel = isBroker ? "customs broker" : "referral partner";
      const rateLabel = `${Math.round(commissionRate * 100)}%`;
      prisma.notification.create({
        data: {
          recipientType: "admin",
          recipientId: "all",
          type: "deal_update",
          title: `New ${isBroker ? "Broker" : "Referral"} Partner Signup`,
          message: `${firstName} ${lastName} (${email}) signed up as a ${partnerLabel} at ${rateLabel} commission via the broker landing page.${clientCount ? ` ${clientCount} import clients.` : ""}`,
          link: "/admin/partners",
        },
      }).catch(() => {});

      // Notify John (PTNS4XDMN) as the upline
      prisma.notification.create({
        data: {
          recipientType: "partner",
          recipientId: "PTNS4XDMN",
          type: "deal_update",
          title: `New ${isBroker ? "Broker" : "Referral"} Partner Joined`,
          message: `${firstName} ${lastName} signed up as your L2 ${partnerLabel} at ${rateLabel}. Invite sent automatically.`,
          link: "/dashboard/downline",
        },
      }).catch(() => {});
    } catch (err) {
      console.error("[broker-signup] auto-invite failed:", err);
    }

    return NextResponse.json(
      { success: true, applicationId: application.id },
      { status: 201 },
    );
  } catch (err) {
    console.error("[broker-signup] error:", err);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }
}
