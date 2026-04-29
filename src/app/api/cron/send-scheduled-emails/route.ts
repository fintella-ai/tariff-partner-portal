import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/sendgrid";

export const dynamic = "force-dynamic";

const PORTAL_URL = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://fintella.partners";
const BROKER_PAGE = `${PORTAL_URL}/partners/brokers`;
const BATCH_LIMIT = 25;

/**
 * GET /api/cron/send-scheduled-emails
 * Runs every 15 minutes. Sends broker recruitment emails that are due.
 * Processes up to 25 per run to stay within Vercel function limits.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization") || "";
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();

  const due = await prisma.partnerLead.findMany({
    where: {
      scheduledSendAt: { lte: now },
      emailSentAt: null,
      status: "prospect",
    },
    orderBy: { scheduledSendAt: "asc" },
    take: BATCH_LIMIT,
  });

  if (due.length === 0) {
    return NextResponse.json({ sent: 0, message: "No scheduled emails due" });
  }

  let tpl: any = null;
  try {
    tpl = await prisma.emailTemplate.findUnique({ where: { key: "broker_recruitment_cold" } });
    if (tpl && !tpl.enabled) tpl = null;
  } catch {}

  let sent = 0;
  let failed = 0;

  for (const lead of due) {
    if (lead.email.includes("@import.placeholder")) {
      await prisma.partnerLead.update({
        where: { id: lead.id },
        data: { scheduledSendAt: null },
      });
      continue;
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

    if (tpl) {
      subject = interp(tpl.subject, vars);
      html = buildHtml(interp(tpl.heading, vars), interp(tpl.bodyHtml, vars), tpl.ctaLabel ? interp(tpl.ctaLabel, vars) : null, tpl.ctaUrl ? interp(tpl.ctaUrl, vars) : null);
      text = interp(tpl.bodyText, vars) + "\n\n---\nYou received this because you are listed on the CBP Permitted Customs Brokers directory. Reply STOP to opt out.";
    } else {
      subject = "Your tariff refund clients";
      text = `${firstName},\n\nYour importer clients are sitting on IEEPA tariff refunds — $166 billion is available, and 83% of eligible importers haven't filed yet.${locationLine}\n\nWe built a referral program specifically for licensed customs brokers. You refer clients you already serve, our legal team handles the CAPE filing, and you earn a commission on every successful recovery. Your clients stay yours — we work behind the scenes.\n\nOur Arizona-based legal partner is licensed to pay referral fees directly to brokers. No cost to join, no risk.\n\nWorth a 10-minute call this week?\n\nLearn more: ${BROKER_PAGE}\n\nBest,\nFintella Partner Team\n\n---\nReply STOP to opt out.`;
      html = buildHtml(
        "IEEPA Tariff Refund Partner Opportunity",
        `<p>${firstName},</p><p>Your importer clients are sitting on IEEPA tariff refunds — <strong>$166 billion</strong> is available, and <strong>83% of eligible importers</strong> haven't filed yet.${locationLine}</p><p>We built a referral program specifically for licensed customs brokers. You refer clients you already serve, our legal team handles the CAPE filing, and you earn a commission on every successful recovery. <strong>Your clients stay yours</strong> — we work behind the scenes.</p><p>Our Arizona-based legal partner is licensed to pay referral fees directly to brokers. No cost to join, no risk.</p><p><strong>Worth a 10-minute call this week?</strong></p>`,
        "Learn More About the Program",
        BROKER_PAGE,
      );
    }

    try {
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
          where: { id: lead.id },
          data: {
            status: "contacted",
            emailSentAt: new Date(),
            notes: [
              lead.notes || "",
              `[${new Date().toISOString().split("T")[0]}] Broker recruitment email sent (${result.status}, scheduled)`,
            ].filter(Boolean).join("\n"),
          },
        });
        sent++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ sent, failed, total: due.length });
}

function interp(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([^}]+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

function buildHtml(heading: string, body: string, ctaLabel: string | null, ctaUrl: string | null): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;max-width:600px">
${body}
${ctaLabel && ctaUrl ? `<p><a href="${ctaUrl}" style="color:#c4a050;text-decoration:underline">${ctaLabel} →</a></p>` : ""}
<p>Best,<br>Fintella Partner Team<br><a href="${PORTAL_URL}" style="color:#c4a050">fintella.partners</a></p>
<hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0 12px">
<p style="font-size:11px;color:#999">You received this because you are listed on the CBP Permitted Customs Brokers directory. Reply STOP to opt out.</p>
</div>`;
}
