import { prisma } from "@/lib/prisma";
import { sendEmail, emailShell } from "@/lib/sendgrid";

const PORTAL_URL = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://fintella.partners";
const CALCULATOR_URL = `${PORTAL_URL}/calculator`;
const BROKER_PAGE_URL = "https://fintella.partners/partners/brokers?utm_source=email&utm_medium=outreach&utm_campaign=broker-cold-email&utm_content=PTNS4XDMN";
const BROKER_SIGNUP_URL = "https://fintella.partners/partners/brokers?utm_source=email&utm_medium=outreach&utm_campaign=broker-cold-email&utm_content=PTNS4XDMN#signup-form";

const BATCH_LIMIT = 25;

interface StepTemplate {
  subject: string;
  heading: string;
  bodyHtml: string;
  bodyText: string;
  ctaLabel: string;
  ctaUrl: string;
  preheader?: string;
}

function getTimezoneForState(state: string): string {
  const ET = "America/New_York";
  const CT = "America/Chicago";
  const MT = "America/Denver";
  const PT = "America/Los_Angeles";
  const AK = "America/Anchorage";
  const HI = "Pacific/Honolulu";

  const map: Record<string, string> = {
    CT: ET, IL: CT, IN: ET, ME: ET, MA: ET, MI: ET, MN: CT, MS: CT, MO: CT,
    MT: MT, NE: CT, NV: PT, NH: ET, NJ: ET, NM: MT, NY: ET, NC: ET, ND: CT,
    OH: ET, OK: CT, OR: PT, PA: ET, RI: ET, SC: ET, SD: CT, TN: CT, TX: CT,
    UT: MT, VT: ET, VA: ET, WA: PT, WV: ET, WI: CT, WY: MT, DC: ET,
    AL: CT, AK: AK, AZ: MT, AR: CT, CA: PT, CO: MT, DE: ET, FL: ET, GA: ET,
    HI: HI, ID: MT, IA: CT, KS: CT, KY: ET, LA: CT, MD: ET,
  };
  return map[state?.toUpperCase()] || ET;
}

function getNextTueThu9am(tz: string, afterDate: Date): Date {
  const now = new Date(afterDate);
  for (let i = 1; i <= 60; i++) {
    const candidate = new Date(now.getTime() + i * 86_400_000);
    const dayStr = candidate.toLocaleDateString("en-US", { weekday: "short", timeZone: tz });
    if (dayStr === "Tue" || dayStr === "Thu") {
      const dateStr = candidate.toLocaleDateString("en-US", { timeZone: tz });
      const target = new Date(`${dateStr} 09:00:00`);
      const offset = candidate.getTime() - new Date(candidate.toLocaleString("en-US", { timeZone: tz })).getTime();
      return new Date(target.getTime() + offset);
    }
  }
  return new Date(now.getTime() + 3 * 86_400_000);
}

function buildUtmUrl(base: string, campaign: string, leadId: string, step: number): string {
  const u = new URL(base);
  u.searchParams.set("utm_source", "email");
  u.searchParams.set("utm_medium", "drip");
  u.searchParams.set("utm_campaign", campaign);
  u.searchParams.set("utm_content", `step${step}_${leadId.slice(0, 8)}`);
  return u.toString();
}

const DRIP_TEMPLATES: Record<string, (vars: Record<string, string>) => StepTemplate> = {
  broker_drip_1_intro: (v) => ({
    subject: `${v.firstName}, your clients have unclaimed IEEPA refunds`,
    preheader: "$166B in tariff refunds — 83% haven't filed yet",
    heading: "Your Clients Are Leaving Money on the Table",
    bodyHtml: `<p>Hi ${v.firstName},</p>
<p>As a licensed customs broker${v.locationLine}, you already know the IEEPA tariffs that hit your importers last year. What you might not know: <strong>$166 billion in refunds is available</strong> through CBP's CAPE program, and <strong>83% of eligible importers haven't filed yet.</strong></p>
<p>We built a <strong>free IEEPA refund calculator</strong> — plug in your clients' entry data and see their estimated recovery in seconds. No signup required.</p>
<p><strong>Try it now:</strong></p>`,
    bodyText: `Hi ${v.firstName},\n\nAs a licensed customs broker${v.locationLine}, you already know the IEEPA tariffs that hit your importers last year. What you might not know: $166 billion in refunds is available through CBP's CAPE program, and 83% of eligible importers haven't filed yet.\n\nWe built a free IEEPA refund calculator — plug in your clients' entry data and see their estimated recovery in seconds. No signup required.\n\nTry it: ${v.calculatorUrl}\n\nBest,\nFintella Partner Team`,
    ctaLabel: "Calculate Your Clients' Refunds →",
    ctaUrl: v.calculatorUrl,
  }),

  broker_drip_2_value: (v) => ({
    subject: `How brokers are earning $5K–$50K/mo in IEEPA referral commissions`,
    preheader: "Real numbers from our broker partners",
    heading: "The Math on IEEPA Referral Commissions",
    bodyHtml: `<p>Hi ${v.firstName},</p>
<p>Quick follow-up — I wanted to share what we're seeing from customs brokers who've joined our referral program:</p>
<ul style="padding-left:20px;line-height:1.8">
<li><strong>Average importer recovery:</strong> $47,000–$320,000 per client</li>
<li><strong>Broker commission:</strong> 10–25% of the legal fee on each successful recovery</li>
<li><strong>Typical broker with 20 importers:</strong> $5,000–$50,000/month in passive income</li>
<li><strong>Your role:</strong> Refer clients you already serve. That's it.</li>
</ul>
<p>The program is <strong>free to join</strong> and <strong>no-risk</strong> — we handle all CAPE filing, documentation prep, and legal coordination. Your clients stay yours.</p>
<p>Use our free calculator to see what your book is worth:</p>`,
    bodyText: `Hi ${v.firstName},\n\nQuick follow-up — here's what brokers in our program are seeing:\n\n• Average importer recovery: $47K–$320K per client\n• Broker commission: 10–25% of legal fee per recovery\n• Typical broker with 20 importers: $5K–$50K/month passive income\n• Your role: Refer clients you already serve. That's it.\n\nFree to join, no risk. We handle all CAPE filing and legal coordination.\n\nCalculate your book's value: ${v.calculatorUrl}\n\nBest,\nFintella Partner Team`,
    ctaLabel: "See What Your Book Is Worth →",
    ctaUrl: v.calculatorUrl,
  }),

  broker_drip_3_urgency: (v) => ({
    subject: `${v.firstName}, the 80-day CAPE window is closing for your clients`,
    preheader: "Entries are expiring — once the window closes, refunds are gone",
    heading: "The Clock Is Ticking on Your Clients' Refunds",
    bodyHtml: `<p>Hi ${v.firstName},</p>
<p>This is my last note — I want to make sure you're aware of a time-sensitive issue affecting your importers:</p>
<p style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:12px;font-size:13px"><strong>⚠️ CBP's 80-day protest window</strong> is actively expiring on liquidated entries. Once it closes, your clients permanently lose their right to file for IEEPA refunds — no exceptions.</p>
<p>We've helped brokers identify <strong>hundreds of thousands of dollars</strong> in recoverable duties that were days away from expiring.</p>
<p>Our free calculator checks every entry against the deadline and flags urgent ones. <strong>Takes 30 seconds:</strong></p>`,
    bodyText: `Hi ${v.firstName},\n\nLast note — there's a time-sensitive issue:\n\nCBP's 80-day protest window is actively expiring on liquidated entries. Once it closes, your clients permanently lose their IEEPA refund rights.\n\nWe've helped brokers identify hundreds of thousands in recoverable duties that were days from expiring.\n\nOur free calculator flags urgent entries. Takes 30 seconds: ${v.calculatorUrl}\n\nBest,\nFintella Partner Team`,
    ctaLabel: "Check Deadlines Now →",
    ctaUrl: v.calculatorUrl,
  }),

  broker_drip_4_social_proof: (v) => ({
    subject: `${v.firstName}, brokers in ${v.stateDisplay} are already recovering refunds`,
    preheader: "See what other brokers are doing with IEEPA refunds",
    heading: "Brokers Like You Are Already Recovering Refunds",
    bodyHtml: `<p>Hi ${v.firstName},</p>
<p>Just wanted to share — we've had strong adoption from customs brokers${v.locationLine ? ` in ${v.stateDisplay}` : ""} who are using our platform to unlock IEEPA refunds for their clients.</p>
<p>Here's what the program looks like in practice:</p>
<ol style="padding-left:20px;line-height:1.8">
<li><strong>You run the free calculator</strong> on your clients' entry data (30 seconds)</li>
<li><strong>You share the PDF summary</strong> with your importer showing their estimated recovery</li>
<li><strong>They say yes</strong> — we handle everything from there</li>
<li><strong>You earn commission</strong> on every successful recovery</li>
</ol>
<p>No cost to join. No risk. No disruption to your client relationships.</p>
<p>Want to see the numbers for your book? Start with the calculator:</p>`,
    bodyText: `Hi ${v.firstName},\n\nBrokers${v.locationLine ? ` in ${v.stateDisplay}` : ""} are already using our platform to recover IEEPA refunds.\n\nHow it works:\n1. Run the free calculator on your clients' entries (30 seconds)\n2. Share the PDF summary with your importer\n3. They say yes — we handle everything\n4. You earn commission on every recovery\n\nNo cost. No risk. No disruption.\n\nCalculator: ${v.calculatorUrl}\n\nBest,\nFintella Partner Team`,
    ctaLabel: "Try the Free Calculator →",
    ctaUrl: v.calculatorUrl,
  }),

  broker_drip_5_last_chance: (v) => ({
    subject: `Last chance: Free IEEPA refund analysis for your clients`,
    preheader: "I won't email again — but wanted to offer one more thing",
    heading: "One Last Thing Before I Go",
    bodyHtml: `<p>Hi ${v.firstName},</p>
<p>I know you're busy, so I'll keep this short — this is my last email.</p>
<p>If you'd like a <strong>free, no-obligation analysis</strong> of your importer book, I'm happy to run the numbers personally and send you a report showing exactly how much your clients can recover.</p>
<p>Just reply to this email with "interested" and I'll take it from there.</p>
<p>Or, if you'd rather explore on your own, the calculator is always available:</p>`,
    bodyText: `Hi ${v.firstName},\n\nLast email from me — if you'd like a free analysis of your importer book, just reply "interested" and I'll run the numbers personally.\n\nOr try the calculator yourself: ${v.calculatorUrl}\n\nBest,\nFintella Partner Team`,
    ctaLabel: "Explore the Calculator →",
    ctaUrl: v.calculatorUrl,
  }),

  // ── Broker Cold Email Outreach (3-step campaign) ──────────────────────
  // Targets 14,454 customs broker contacts. Links to broker landing page
  // with UTM tracking. Commission rate: 25%.
  broker_cold_email_1: (v) => ({
    subject: `${v.firstName}, your import clients qualify for IEEPA refunds`,
    preheader: "$166B in recoverable duties — 83% of importers haven't filed",
    heading: "Your Clients Are Leaving $50K+ on the Table",
    bodyHtml: `<p>Hi ${v.firstName},</p>
<p>Quick question — are your import clients aware they may be entitled to <strong>IEEPA tariff refunds</strong>?</p>
<p>Here's the reality:</p>
<ul style="padding-left:20px;line-height:1.8">
<li><strong>$166 billion</strong> in recoverable duties is sitting with CBP right now</li>
<li><strong>83% of eligible importers</strong> haven't filed for their refunds yet</li>
<li>The <strong>180-day filing deadline</strong> is actively expiring on early 2025 entries</li>
</ul>
<p>We built a free calculator that shows you exactly how much each of your clients can recover. No signup, no commitment — just plug in the numbers and see the result.</p>`,
    bodyText: `Hi ${v.firstName},\n\nQuick question — are your import clients aware they may be entitled to IEEPA tariff refunds?\n\nHere's the reality:\n- $166 billion in recoverable duties is sitting with CBP right now\n- 83% of eligible importers haven't filed for their refunds yet\n- The 180-day filing deadline is actively expiring on early 2025 entries\n\nWe built a free calculator that shows you exactly how much each of your clients can recover.\n\nTry it: ${v.brokerPageUrl}\n\nBest,\nFintella Partner Team`,
    ctaLabel: "Run a Free Estimate for Any Client",
    ctaUrl: v.brokerPageUrl,
  }),

  broker_cold_email_2: (v) => ({
    subject: `This runs inside CargoWise (5-min setup)`,
    preheader: "One widget, one click — $12,500 per client referral",
    heading: "The Tool No One Else Has",
    bodyHtml: `<p>Hi ${v.firstName},</p>
<p>Following up on my last email — I wanted to show you something we built specifically for customs brokers.</p>
<p>We created a <strong>referral widget that embeds directly in your TMS</strong> (CargoWise, Magaya, or any browser-based system). Setup takes 5 minutes. Here's how it works:</p>
<ol style="padding-left:20px;line-height:1.8">
<li>Widget sits in your TMS sidebar — always visible while you work</li>
<li>When you spot a client with IEEPA-eligible entries, <strong>one click submits the referral</strong></li>
<li>Our legal team handles everything from there — CAPE filing, documentation, client communication</li>
<li><strong>You earn 25% commission</strong> on every successful recovery</li>
</ol>
<p>Let's do the math on a single client:</p>
<p style="background:rgba(196,160,80,0.1);border:1px solid rgba(196,160,80,0.3);border-radius:6px;padding:12px;font-size:14px">
<strong>$50,000</strong> in recoverable duties &times; <strong>25% commission</strong> = <strong style="color:#c4a050">$12,500 per client</strong></p>
<p>No legal work on your end. No disruption to your client relationships. Just refer and earn.</p>`,
    bodyText: `Hi ${v.firstName},\n\nFollowing up on my last email — we built a referral widget that embeds directly in your TMS (CargoWise, Magaya, or any browser-based system). Setup takes 5 minutes.\n\nHow it works:\n1. Widget sits in your TMS sidebar\n2. One click submits the referral\n3. Our legal team handles everything\n4. You earn 25% commission per recovery\n\nThe math: $50,000 duties x 25% = $12,500 per client\n\nNo legal work on your end. Just refer and earn.\n\nSee how it works: ${v.brokerPageUrl}\n\nBest,\nFintella Partner Team`,
    ctaLabel: "See How It Works",
    ctaUrl: v.brokerPageUrl,
  }),

  broker_cold_email_3: (v) => ({
    subject: `180-day IEEPA deadline — your clients' entries are expiring`,
    preheader: "Early 2025 entries are hitting the deadline cliff — act now or lose the refund forever",
    heading: "Deadlines Are Expiring",
    bodyHtml: `<p>Hi ${v.firstName},</p>
<p>This is my last note, and it's time-sensitive.</p>
<p style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:12px;font-size:13px">
<strong>&#9888;&#65039; The 180-day IEEPA filing deadline</strong> is actively expiring on entries from early 2025. Once the window closes, your clients permanently lose their right to recover these duties — <strong>no exceptions</strong>.</p>
<p>What's at stake:</p>
<ul style="padding-left:20px;line-height:1.8">
<li>CBP can assess penalties of <strong>up to $10,000 per violation</strong> for brokers who fail to advise clients of their refund rights</li>
<li>Every day that passes, more entries fall off the eligibility cliff</li>
<li>The average importer is leaving <strong>$47,000 to $320,000</strong> on the table</li>
</ul>
<p>Our program is <strong>100% contingency-based</strong> — your clients pay nothing unless they recover money. Full legal backing, zero risk.</p>
<p>It takes 2 minutes to become a partner. Don't let your clients' money expire.</p>`,
    bodyText: `Hi ${v.firstName},\n\nThis is my last note, and it's time-sensitive.\n\nThe 180-day IEEPA filing deadline is actively expiring on entries from early 2025. Once the window closes, your clients permanently lose their right to recover these duties.\n\nWhat's at stake:\n- CBP can assess penalties of up to $10,000 per violation for brokers who fail to advise clients\n- Every day that passes, more entries fall off the eligibility cliff\n- The average importer is leaving $47,000 to $320,000 on the table\n\nOur program is 100% contingency-based — zero risk.\n\nBecome a partner: ${v.brokerSignupUrl}\n\nBest,\nFintella Partner Team`,
    ctaLabel: "Become a Partner",
    ctaUrl: v.brokerSignupUrl,
  }),
};

function buildVars(lead: { firstName: string; lastName: string; notes: string | null; state: string | null }, campaignSlug: string, stepNum: number, leadId: string): Record<string, string> {
  const locationMatch = (lead.notes || "").match(/Location: (.+)/);
  const location = locationMatch?.[1] || "";
  const stateDisplay = lead.state || location.split(",").pop()?.trim() || "";
  const locationLine = location ? ` filing at ${location}` : "";
  const calcUrl = buildUtmUrl(CALCULATOR_URL, campaignSlug, leadId, stepNum);

  return {
    firstName: lead.firstName || "there",
    lastName: lead.lastName || "",
    location,
    stateDisplay,
    locationLine,
    calculatorUrl: calcUrl,
    portalUrl: PORTAL_URL,
    applyUrl: `${PORTAL_URL}/apply?utm_source=email&utm_campaign=${campaignSlug}`,
    brokerPageUrl: BROKER_PAGE_URL,
    brokerSignupUrl: BROKER_SIGNUP_URL,
    ctaUrl: BROKER_PAGE_URL,
  };
}

export async function processCampaignDrips(): Promise<{ sent: number; skipped: number; errors: number }> {
  const now = new Date();

  const dueEnrollments = await prisma.campaignEnrollment.findMany({
    where: {
      status: "active",
      nextSendAt: { lte: now },
    },
    take: BATCH_LIMIT,
    orderBy: { nextSendAt: "asc" },
  });

  if (dueEnrollments.length === 0) return { sent: 0, skipped: 0, errors: 0 };

  let sent = 0, skipped = 0, errors = 0;

  for (const enrollment of dueEnrollments) {
    try {
      const campaign = await prisma.campaign.findUnique({
        where: { id: enrollment.campaignId },
        include: { steps: { orderBy: { stepNumber: "asc" } } },
      });

      if (!campaign || campaign.status !== "active") {
        skipped++;
        continue;
      }

      const nextStepNum = enrollment.currentStep + 1;
      const step = campaign.steps.find((s) => s.stepNumber === nextStepNum);

      if (!step) {
        await prisma.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: { status: "completed", completedAt: now, nextSendAt: null },
        });
        skipped++;
        continue;
      }

      const lead = await prisma.partnerLead.findUnique({ where: { id: enrollment.leadId } });
      if (!lead || lead.unsubscribedAt || lead.status === "signed_up" || lead.status === "skipped") {
        const newStatus = lead?.unsubscribedAt ? "unsubscribed" : lead?.status === "signed_up" ? "converted" : "paused";
        await prisma.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: { status: newStatus, nextSendAt: null },
        });
        if (newStatus === "unsubscribed") {
          await prisma.campaign.update({ where: { id: campaign.id }, data: { unsubCount: { increment: 1 } } });
        } else if (newStatus === "converted") {
          await prisma.campaign.update({ where: { id: campaign.id }, data: { convertCount: { increment: 1 } } });
        }
        skipped++;
        continue;
      }

      if (lead.email.includes("@import.placeholder")) {
        skipped++;
        continue;
      }

      if (step.skipIfOpened && enrollment.openedAny) {
        await advanceToNextStep(enrollment, campaign, step, lead, now);
        skipped++;
        continue;
      }
      if (step.skipIfClicked && enrollment.clickedAny) {
        await advanceToNextStep(enrollment, campaign, step, lead, now);
        skipped++;
        continue;
      }

      const campaignSlug = campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const vars = buildVars(lead, campaignSlug, step.stepNumber, lead.id);

      let tplData: StepTemplate;

      const dbTpl = await prisma.emailTemplate.findUnique({ where: { key: step.templateKey } });
      if (dbTpl?.enabled) {
        const interp = (s: string) => s.replace(/\{([^}]+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
        tplData = {
          subject: step.subject || interp(dbTpl.subject),
          heading: interp(dbTpl.heading),
          bodyHtml: interp(dbTpl.bodyHtml),
          bodyText: interp(dbTpl.bodyText),
          ctaLabel: dbTpl.ctaLabel ? interp(dbTpl.ctaLabel) : "",
          ctaUrl: dbTpl.ctaUrl ? interp(dbTpl.ctaUrl) : "",
          preheader: dbTpl.preheader ? interp(dbTpl.preheader) : undefined,
        };
      } else {
        const builder = DRIP_TEMPLATES[step.templateKey];
        if (!builder) {
          errors++;
          continue;
        }
        tplData = builder(vars);
      }

      const unsubUrl = `${PORTAL_URL}/unsubscribe?email=${encodeURIComponent(lead.email)}&cid=${campaign.id}`;

      const { html, text } = emailShell({
        heading: tplData.heading,
        bodyHtml: tplData.bodyHtml + `<p style="margin-top:24px;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:12px">You're receiving this because you're listed on the CBP Permitted Customs Brokers directory. <a href="${unsubUrl}" style="color:#999;text-decoration:underline">Unsubscribe</a></p>`,
        bodyText: tplData.bodyText + `\n\n---\nUnsubscribe: ${unsubUrl}`,
        ctaLabel: tplData.ctaLabel,
        ctaUrl: tplData.ctaUrl,
        preheader: tplData.preheader,
      });

      const result = await sendEmail({
        to: lead.email,
        toName: `${lead.firstName} ${lead.lastName}`,
        subject: tplData.subject,
        html,
        text,
        template: step.templateKey,
        replyTo: "outreach@fintella.partners",
      });

      if (result.status === "sent" || result.status === "demo") {
        await prisma.$transaction([
          prisma.campaignEnrollment.update({
            where: { id: enrollment.id },
            data: {
              currentStep: step.stepNumber,
              lastSentAt: now,
              nextSendAt: getNextStepSendTime(campaign, step, lead, now),
            },
          }),
          prisma.campaignStep.update({
            where: { id: step.id },
            data: { sentCount: { increment: 1 } },
          }),
          prisma.campaign.update({
            where: { id: campaign.id },
            data: { sentCount: { increment: 1 } },
          }),
          prisma.partnerLead.update({
            where: { id: lead.id },
            data: {
              emailsSent: { increment: 1 },
              status: lead.status === "prospect" ? "contacted" : lead.status,
              notes: [
                lead.notes || "",
                `[${now.toISOString().slice(0, 10)}] Campaign "${campaign.name}" step ${step.stepNumber} sent (${result.status})`,
              ].filter(Boolean).join("\n"),
            },
          }),
        ]);
        sent++;
      } else {
        errors++;
      }
    } catch {
      errors++;
    }
  }

  return { sent, skipped, errors };
}

async function advanceToNextStep(
  enrollment: { id: string },
  campaign: { id: string; steps: { stepNumber: number; delayDays: number }[] },
  currentStep: { stepNumber: number },
  lead: { state: string | null; notes: string | null },
  now: Date,
) {
  const nextStep = campaign.steps.find((s) => s.stepNumber === currentStep.stepNumber + 1);
  if (!nextStep) {
    await prisma.campaignEnrollment.update({
      where: { id: enrollment.id },
      data: { status: "completed", completedAt: now, currentStep: currentStep.stepNumber, nextSendAt: null },
    });
  } else {
    const tz = getTimezoneForState(lead.state || "NY");
    const nextSend = new Date(now.getTime() + nextStep.delayDays * 86_400_000);
    const scheduled = getNextTueThu9am(tz, nextSend);
    await prisma.campaignEnrollment.update({
      where: { id: enrollment.id },
      data: { currentStep: currentStep.stepNumber, nextSendAt: scheduled },
    });
  }
}

function getNextStepSendTime(
  campaign: { steps: { stepNumber: number; delayDays: number }[] },
  currentStep: { stepNumber: number },
  lead: { state: string | null; notes: string | null },
  now: Date,
): Date | null {
  const nextStep = campaign.steps.find((s) => s.stepNumber === currentStep.stepNumber + 1);
  if (!nextStep) return null;

  const tz = getTimezoneForState(lead.state || "NY");
  const afterDate = new Date(now.getTime() + nextStep.delayDays * 86_400_000);
  return getNextTueThu9am(tz, afterDate);
}

export async function enrollLeadsInCampaign(campaignId: string, leadIds?: string[]): Promise<{ enrolled: number; skipped: number }> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { steps: { orderBy: { stepNumber: "asc" } } },
  });

  if (!campaign || campaign.steps.length === 0) {
    return { enrolled: 0, skipped: 0 };
  }

  let leads;
  if (leadIds?.length) {
    leads = await prisma.partnerLead.findMany({
      where: { id: { in: leadIds }, unsubscribedAt: null },
      select: { id: true, state: true, notes: true, email: true },
    });
  } else {
    const statusFilter = campaign.audience === "prospects_only"
      ? { status: "prospect" }
      : campaign.audience === "contacted"
      ? { status: "contacted" }
      : {};

    leads = await prisma.partnerLead.findMany({
      where: {
        ...statusFilter,
        unsubscribedAt: null,
        email: { not: { contains: "@import.placeholder" } },
      },
      select: { id: true, state: true, notes: true, email: true },
    });
  }

  const existingEnrollments = await prisma.campaignEnrollment.findMany({
    where: { campaignId },
    select: { leadId: true },
  });
  const enrolled = new Set(existingEnrollments.map((e) => e.leadId));

  const newLeads = leads.filter((l) => !enrolled.has(l.id));

  if (newLeads.length === 0) return { enrolled: 0, skipped: leads.length };

  const firstStep = campaign.steps[0];
  const now = new Date();

  const enrollments = newLeads.map((lead) => {
    const tz = getTimezoneForState(lead.state || "NY");
    const sendAt = firstStep.delayDays === 0
      ? getNextTueThu9am(tz, now)
      : getNextTueThu9am(tz, new Date(now.getTime() + firstStep.delayDays * 86_400_000));

    return {
      campaignId,
      leadId: lead.id,
      nextSendAt: sendAt,
    };
  });

  await prisma.campaignEnrollment.createMany({
    data: enrollments,
    skipDuplicates: true,
  });

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      totalLeads: { increment: newLeads.length },
      status: campaign.status === "draft" ? "active" : campaign.status,
      startedAt: campaign.startedAt || now,
    },
  });

  return { enrolled: newLeads.length, skipped: leads.length - newLeads.length };
}

export async function recordCampaignEngagement(
  email: string,
  event: "open" | "click",
  templateKey?: string,
) {
  const lead = await prisma.partnerLead.findFirst({ where: { email } });
  if (!lead) return;

  const updateData: Record<string, unknown> = {};
  if (event === "open") {
    updateData.lastOpenedAt = new Date();
    updateData.emailsOpened = { increment: 1 };
  } else {
    updateData.lastClickedAt = new Date();
    updateData.emailsClicked = { increment: 1 };
  }
  await prisma.partnerLead.update({ where: { id: lead.id }, data: updateData });

  const enrollments = await prisma.campaignEnrollment.findMany({
    where: { leadId: lead.id, status: "active" },
  });

  for (const enrollment of enrollments) {
    const engagementUpdate: Record<string, unknown> = {};
    if (event === "open") engagementUpdate.openedAny = true;
    if (event === "click") engagementUpdate.clickedAny = true;
    await prisma.campaignEnrollment.update({
      where: { id: enrollment.id },
      data: engagementUpdate,
    });

    if (event === "open") {
      await prisma.campaign.update({ where: { id: enrollment.campaignId }, data: { openCount: { increment: 1 } } });
    } else {
      await prisma.campaign.update({ where: { id: enrollment.campaignId }, data: { clickCount: { increment: 1 } } });
    }

    if (templateKey) {
      const step = await prisma.campaignStep.findFirst({
        where: { campaignId: enrollment.campaignId, templateKey },
      });
      if (step) {
        if (event === "open") {
          await prisma.campaignStep.update({ where: { id: step.id }, data: { openCount: { increment: 1 } } });
        } else {
          await prisma.campaignStep.update({ where: { id: step.id }, data: { clickCount: { increment: 1 } } });
        }
      }
    }
  }
}
