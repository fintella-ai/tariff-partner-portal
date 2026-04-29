import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/sendgrid";

const ADMIN_ROLES = ["super_admin", "admin"];

const PORTAL_URL = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://fintella.partners";
const BROKER_PAGE = `${PORTAL_URL}/partners/brokers`;

/**
 * POST /api/admin/leads/send-broker-email
 * Sends the broker recruitment cold email and moves lead to "contacted".
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes((session.user as any).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { leadId } = await req.json();
  if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

  const lead = await prisma.partnerLead.findUnique({ where: { id: leadId } });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (lead.email.includes("@import.placeholder")) {
    return NextResponse.json({ error: "This lead has no email address" }, { status: 400 });
  }

  const firstName = lead.firstName || "there";
  const locationMatch = (lead.notes || "").match(/Location: (.+)/);
  const location = locationMatch?.[1] || "";

  const subject = "Your tariff refund clients";

  const text = `${firstName},

Your importer clients are sitting on IEEPA tariff refunds — $166 billion is available, and 83% of eligible importers haven't filed yet.${location ? ` As a broker filing at ${location}, your book likely has significant exposure.` : ""}

We built a referral program specifically for licensed customs brokers. You refer clients you already serve, our legal team handles the CAPE filing, and you earn a commission on every successful recovery. Your clients stay yours — we work behind the scenes.

Our Arizona-based legal partner is licensed to pay referral fees directly to brokers. No cost to join, no risk.

Worth a 10-minute call this week?

Learn more: ${BROKER_PAGE}

Best,
Fintella Partner Team
fintella.partners

---
You received this because you are listed on the CBP Permitted Customs Brokers directory. Reply STOP to opt out of future messages.`;

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;max-width:600px">
<p>${firstName},</p>

<p>Your importer clients are sitting on IEEPA tariff refunds — <strong>$166 billion</strong> is available, and <strong>83% of eligible importers</strong> haven't filed yet.${location ? ` As a broker filing at ${location}, your book likely has significant exposure.` : ""}</p>

<p>We built a referral program specifically for licensed customs brokers. You refer clients you already serve, our legal team handles the CAPE filing, and you earn a commission on every successful recovery. <strong>Your clients stay yours</strong> — we work behind the scenes.</p>

<p>Our Arizona-based legal partner is licensed to pay referral fees directly to brokers. No cost to join, no risk.</p>

<p><strong>Worth a 10-minute call this week?</strong></p>

<p><a href="${BROKER_PAGE}" style="color:#c4a050;text-decoration:underline">Learn more about the program →</a></p>

<p>Best,<br>Fintella Partner Team<br><a href="${PORTAL_URL}" style="color:#c4a050">fintella.partners</a></p>

<hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0 12px">
<p style="font-size:11px;color:#999">You received this because you are listed on the CBP Permitted Customs Brokers directory. Reply STOP to opt out of future messages.</p>
</div>`;

  const result = await sendEmail({
    to: lead.email,
    toName: `${lead.firstName} ${lead.lastName}`,
    subject,
    html,
    text,
    template: "broker_recruitment_cold",
  });

  if (result.status === "sent" || result.status === "demo") {
    await prisma.partnerLead.update({
      where: { id: leadId },
      data: {
        status: "contacted",
        notes: [
          lead.notes || "",
          `[${new Date().toISOString().split("T")[0]}] Broker recruitment email sent (${result.status})`,
        ].filter(Boolean).join("\n"),
      },
    });
  }

  return NextResponse.json({ status: result.status, messageId: result.messageId });
}
