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
 * Loads template from EmailTemplate table (key: broker_recruitment_cold),
 * falls back to hardcoded if template not found or disabled.
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
  const locationLine = location ? ` As a broker filing at ${location}, your book likely has significant exposure.` : "";

  const vars: Record<string, string> = {
    "lead.firstName": firstName,
    "lead.lastName": lead.lastName || "",
    "lead.location": location,
    locationLine,
    brokerPageUrl: BROKER_PAGE,
    portalUrl: PORTAL_URL,
    firmShort: "Fintella",
  };

  let subject: string;
  let html: string;
  let text: string;
  let fromEmail: string | undefined;
  let fromName: string | undefined;

  const tpl = await loadBrokerTemplate();

  if (tpl) {
    subject = interpolate(tpl.subject, vars);
    html = buildWrappedHtml(interpolate(tpl.heading, vars), interpolate(tpl.bodyHtml, vars), tpl.ctaLabel ? interpolate(tpl.ctaLabel, vars) : null, tpl.ctaUrl ? interpolate(tpl.ctaUrl, vars) : null);
    text = interpolate(tpl.bodyText, vars) + "\n\n---\nYou received this because you are listed on the CBP Permitted Customs Brokers directory. Reply STOP to opt out.";
    fromEmail = tpl.fromEmail || undefined;
    fromName = tpl.fromName || undefined;
  } else {
    subject = "Your tariff refund clients";
    text = `${firstName},\n\nYour importer clients are sitting on IEEPA tariff refunds — $166 billion is available, and 83% of eligible importers haven't filed yet.${locationLine}\n\nWe built a referral program specifically for licensed customs brokers. You refer clients you already serve, our legal team handles the CAPE filing, and you earn a commission on every successful recovery. Your clients stay yours — we work behind the scenes.\n\nOur Arizona-based legal partner is licensed to pay referral fees directly to brokers. No cost to join, no risk.\n\nWorth a 10-minute call this week?\n\nLearn more: ${BROKER_PAGE}\n\nBest,\nFintella Partner Team\nfintella.partners\n\n---\nYou received this because you are listed on the CBP Permitted Customs Brokers directory. Reply STOP to opt out.`;
    html = buildWrappedHtml(
      "IEEPA Tariff Refund Partner Opportunity",
      `<p>${firstName},</p><p>Your importer clients are sitting on IEEPA tariff refunds — <strong>$166 billion</strong> is available, and <strong>83% of eligible importers</strong> haven't filed yet.${locationLine}</p><p>We built a referral program specifically for licensed customs brokers. You refer clients you already serve, our legal team handles the CAPE filing, and you earn a commission on every successful recovery. <strong>Your clients stay yours</strong> — we work behind the scenes.</p><p>Our Arizona-based legal partner is licensed to pay referral fees directly to brokers. No cost to join, no risk.</p><p><strong>Worth a 10-minute call this week?</strong></p>`,
      "Learn More About the Program",
      BROKER_PAGE,
    );
  }

  const result = await sendEmail({
    to: lead.email,
    toName: `${lead.firstName} ${lead.lastName}`,
    subject,
    html,
    text,
    template: "broker_recruitment_cold",
    fromEmail,
    fromName,
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

async function loadBrokerTemplate() {
  try {
    const tpl = await prisma.emailTemplate.findUnique({ where: { key: "broker_recruitment_cold" } });
    if (!tpl || !tpl.enabled) return null;
    return {
      subject: tpl.subject,
      heading: tpl.heading,
      bodyHtml: tpl.bodyHtml,
      bodyText: tpl.bodyText,
      ctaLabel: tpl.ctaLabel,
      ctaUrl: tpl.ctaUrl,
      fromEmail: tpl.fromEmail,
      fromName: tpl.fromName,
    };
  } catch {
    return null;
  }
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([^}]+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

function buildWrappedHtml(heading: string, body: string, ctaLabel: string | null, ctaUrl: string | null): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;max-width:600px">
${body}
${ctaLabel && ctaUrl ? `<p><a href="${ctaUrl}" style="color:#c4a050;text-decoration:underline">${ctaLabel} →</a></p>` : ""}
<p>Best,<br>Fintella Partner Team<br><a href="${PORTAL_URL}" style="color:#c4a050">fintella.partners</a></p>
<hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0 12px">
<p style="font-size:11px;color:#999">You received this because you are listed on the CBP Permitted Customs Brokers directory. Reply STOP to opt out.</p>
</div>`;
}
