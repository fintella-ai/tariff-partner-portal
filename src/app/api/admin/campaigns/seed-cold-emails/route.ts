import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = ["super_admin", "admin"];

const BROKER_PAGE_URL =
  "https://fintella.partners/partners/brokers?utm_source=email&utm_medium=outreach&utm_campaign=broker-cold-email&utm_content=PTNS4XDMN";
const BROKER_SIGNUP_URL =
  "https://fintella.partners/partners/brokers?utm_source=email&utm_medium=outreach&utm_campaign=broker-cold-email&utm_content=PTNS4XDMN#signup-form";

const COLD_EMAIL_TEMPLATES = [
  {
    key: "broker_cold_email_1",
    name: "Broker Cold Email 1 — Value Prop",
    category: "Broker Outreach",
    subject: "{firstName}, your import clients qualify for IEEPA refunds",
    preheader:
      "$166B in recoverable duties — 83% of importers haven't filed",
    heading: "Your Clients Are Leaving $50K+ on the Table",
    bodyHtml:
      "<p>Hi {firstName},</p>" +
      "<p>Quick question — are your import clients aware they may be entitled to <strong>IEEPA tariff refunds</strong>?</p>" +
      "<p>Here's the reality:</p>" +
      '<ul style="padding-left:20px;line-height:1.8">' +
      "<li><strong>$166 billion</strong> in recoverable duties is sitting with CBP right now</li>" +
      "<li><strong>83% of eligible importers</strong> haven't filed for their refunds yet</li>" +
      "<li>The <strong>180-day filing deadline</strong> is actively expiring on early 2025 entries</li>" +
      "</ul>" +
      "<p>We built a free calculator that shows you exactly how much each of your clients can recover. No signup, no commitment — just plug in the numbers and see the result.</p>",
    bodyText:
      "Hi {firstName},\n\n" +
      "Quick question — are your import clients aware they may be entitled to IEEPA tariff refunds?\n\n" +
      "Here's the reality:\n" +
      "- $166 billion in recoverable duties is sitting with CBP right now\n" +
      "- 83% of eligible importers haven't filed for their refunds yet\n" +
      "- The 180-day filing deadline is actively expiring on early 2025 entries\n\n" +
      "We built a free calculator that shows you exactly how much each of your clients can recover.\n\n" +
      `Try it: ${BROKER_PAGE_URL}\n\n` +
      "Best,\nFintella Partner Team",
    ctaLabel: "Run a Free Estimate for Any Client",
    ctaUrl: BROKER_PAGE_URL,
    fromEmail: "outreach@fintella.partners",
    fromName: "Fintella",
    replyTo: "outreach@fintella.partners",
    enabled: true,
    isDraft: false,
    description:
      "Cold email 1 of 3 for broker outreach campaign. Value prop — IEEPA refund opportunity.",
    variables: JSON.stringify([
      "firstName",
      "lastName",
      "location",
      "stateDisplay",
      "locationLine",
      "calculatorUrl",
      "portalUrl",
      "applyUrl",
      "ctaUrl",
    ]),
  },
  {
    key: "broker_cold_email_2",
    name: "Broker Cold Email 2 — TMS Widget Demo",
    category: "Broker Outreach",
    subject: "This runs inside CargoWise (5-min setup)",
    preheader: "One widget, one click — $12,500 per client referral",
    heading: "The Tool No One Else Has",
    bodyHtml:
      "<p>Hi {firstName},</p>" +
      "<p>Following up on my last email — I wanted to show you something we built specifically for customs brokers.</p>" +
      '<p>We created a <strong>referral widget that embeds directly in your TMS</strong> (CargoWise, Magaya, or any browser-based system). Setup takes 5 minutes. Here\'s how it works:</p>' +
      '<ol style="padding-left:20px;line-height:1.8">' +
      "<li>Widget sits in your TMS sidebar — always visible while you work</li>" +
      "<li>When you spot a client with IEEPA-eligible entries, <strong>one click submits the referral</strong></li>" +
      "<li>Our legal team handles everything from there — CAPE filing, documentation, client communication</li>" +
      "<li><strong>You earn 25% commission</strong> on every successful recovery</li>" +
      "</ol>" +
      "<p>Let's do the math on a single client:</p>" +
      '<p style="background:rgba(196,160,80,0.1);border:1px solid rgba(196,160,80,0.3);border-radius:6px;padding:12px;font-size:14px">' +
      '<strong>$50,000</strong> in recoverable duties &times; <strong>25% commission</strong> = <strong style="color:#c4a050">$12,500 per client</strong></p>' +
      "<p>No legal work on your end. No disruption to your client relationships. Just refer and earn.</p>",
    bodyText:
      "Hi {firstName},\n\n" +
      "Following up on my last email — we built a referral widget that embeds directly in your TMS (CargoWise, Magaya, or any browser-based system). Setup takes 5 minutes.\n\n" +
      "How it works:\n" +
      "1. Widget sits in your TMS sidebar\n" +
      "2. One click submits the referral\n" +
      "3. Our legal team handles everything\n" +
      "4. You earn 25% commission per recovery\n\n" +
      "The math: $50,000 duties x 25% = $12,500 per client\n\n" +
      "No legal work on your end. Just refer and earn.\n\n" +
      `See how it works: ${BROKER_PAGE_URL}\n\n` +
      "Best,\nFintella Partner Team",
    ctaLabel: "See How It Works",
    ctaUrl: BROKER_PAGE_URL,
    fromEmail: "outreach@fintella.partners",
    fromName: "Fintella",
    replyTo: "outreach@fintella.partners",
    enabled: true,
    isDraft: false,
    description:
      "Cold email 2 of 3 for broker outreach campaign. Widget demo + commission math.",
    variables: JSON.stringify([
      "firstName",
      "lastName",
      "location",
      "stateDisplay",
      "locationLine",
      "calculatorUrl",
      "portalUrl",
      "applyUrl",
      "ctaUrl",
    ]),
  },
  {
    key: "broker_cold_email_3",
    name: "Broker Cold Email 3 — Deadline Urgency",
    category: "Broker Outreach",
    subject:
      "180-day IEEPA deadline — your clients' entries are expiring",
    preheader:
      "Early 2025 entries are hitting the deadline cliff — act now or lose the refund forever",
    heading: "Deadlines Are Expiring",
    bodyHtml:
      "<p>Hi {firstName},</p>" +
      "<p>This is my last note, and it's time-sensitive.</p>" +
      '<p style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:12px;font-size:13px">' +
      "<strong>&#9888;&#65039; The 180-day IEEPA filing deadline</strong> is actively expiring on entries from early 2025. " +
      "Once the window closes, your clients permanently lose their right to recover these duties — <strong>no exceptions</strong>.</p>" +
      "<p>What's at stake:</p>" +
      '<ul style="padding-left:20px;line-height:1.8">' +
      "<li>CBP can assess penalties of <strong>up to $10,000 per violation</strong> for brokers who fail to advise clients of their refund rights</li>" +
      "<li>Every day that passes, more entries fall off the eligibility cliff</li>" +
      "<li>The average importer is leaving <strong>$47,000 to $320,000</strong> on the table</li>" +
      "</ul>" +
      "<p>Our program is <strong>100% contingency-based</strong> — your clients pay nothing unless they recover money. Full legal backing, zero risk.</p>" +
      "<p>It takes 2 minutes to become a partner. Don't let your clients' money expire.</p>",
    bodyText:
      "Hi {firstName},\n\n" +
      "This is my last note, and it's time-sensitive.\n\n" +
      "The 180-day IEEPA filing deadline is actively expiring on entries from early 2025. Once the window closes, your clients permanently lose their right to recover these duties.\n\n" +
      "What's at stake:\n" +
      "- CBP can assess penalties of up to $10,000 per violation for brokers who fail to advise clients\n" +
      "- Every day that passes, more entries fall off the eligibility cliff\n" +
      "- The average importer is leaving $47,000 to $320,000 on the table\n\n" +
      "Our program is 100% contingency-based — zero risk.\n\n" +
      `Become a partner: ${BROKER_SIGNUP_URL}\n\n` +
      "Best,\nFintella Partner Team",
    ctaLabel: "Become a Partner",
    ctaUrl: BROKER_SIGNUP_URL,
    fromEmail: "outreach@fintella.partners",
    fromName: "Fintella",
    replyTo: "outreach@fintella.partners",
    enabled: true,
    isDraft: false,
    description:
      "Cold email 3 of 3 for broker outreach campaign. Urgency play — 180-day deadline + penalties.",
    variables: JSON.stringify([
      "firstName",
      "lastName",
      "location",
      "stateDisplay",
      "locationLine",
      "calculatorUrl",
      "portalUrl",
      "applyUrl",
      "ctaUrl",
    ]),
  },
];

/**
 * POST /api/admin/campaigns/seed-cold-emails
 *
 * Upserts the 3 broker cold email templates into the EmailTemplate table.
 * Called by the admin campaigns page before creating the cold email campaign
 * to ensure the template rows exist. Uses upsert with empty update so it
 * never overwrites admin edits.
 */
export async function POST() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (!role || !ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let created = 0;
  let skipped = 0;

  for (const t of COLD_EMAIL_TEMPLATES) {
    const result = await prisma.emailTemplate.upsert({
      where: { key: t.key },
      update: {}, // never overwrite admin edits
      create: t,
    });
    // If the row was just created (no updatedAt from an update), count it
    if (result.createdAt.getTime() === result.updatedAt.getTime()) {
      created++;
    } else {
      skipped++;
    }
  }

  return NextResponse.json({
    message: `Seeded ${created} cold email templates (${skipped} already existed)`,
    created,
    skipped,
    templates: COLD_EMAIL_TEMPLATES.map((t) => t.key),
  });
}
