const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

console.log("[seed] DATABASE_URL:", process.env.DATABASE_URL ? "(set)" : "(not set)");

// FINTELLA_LIVE_MODE gates the non-idempotent parts of the seed pipeline.
// When set to "true", we SKIP seeding test partners + test deals so the
// build doesn't re-create them on every deploy post-launch. Admin user,
// portal settings, email templates, conference entries, workflow defaults,
// and the admin-team-chat global thread still seed idempotently — those
// are bootstrap config, not test data.
const LIVE_MODE = process.env.FINTELLA_LIVE_MODE === "true";
if (LIVE_MODE) {
  console.log("[seed] FINTELLA_LIVE_MODE=true — skipping test-data seed (partners, deals)");
} else {
  console.log("[seed] FINTELLA_LIVE_MODE not set — seeding full test data (pre-launch mode)");
}

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...\n");

  // ── Admin User ────────────────────────────────────────────────────────
  // Hardened per Phase 15b-fu operational-security work (2026-04-13):
  //
  // We DO NOT auto-create a default-password super_admin in production.
  // The hardcoded default `admin123` is in a public GitHub repo — any
  // attacker reading the source knows the creds. The guards below make
  // the seed safe to run on every Vercel build (which it does) without
  // ever silently reintroducing weak credentials.
  //
  // Rules:
  //   1. If ANY super_admin already exists in the DB, SKIP admin seeding
  //      entirely. This protects the real admin record from being shadowed
  //      by a second default-password account (which is the exact bug
  //      that surfaced during the TRLN → Fintella rebrand).
  //   2. In production (NODE_ENV === "production"), require BOTH
  //      SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD env vars. If unset and
  //      no super_admin exists, log a big warning and skip rather than
  //      create a weak default. First-deploy bootstrap should be done
  //      with explicit env vars.
  //   3. In dev/test (NODE_ENV !== "production"), fall back to the
  //      historical defaults (admin@fintella.partners / admin123) for
  //      developer convenience on localhost / preview.

  const existingSuperAdmin = await prisma.user.findFirst({
    where: { role: "super_admin" },
  });

  if (existingSuperAdmin) {
    console.log(
      "✓ Admin seeding SKIPPED — super_admin already exists: " +
        existingSuperAdmin.email
    );
  } else {
    const isProd = process.env.NODE_ENV === "production";
    const envEmail = process.env.SEED_ADMIN_EMAIL;
    const envPassword = process.env.SEED_ADMIN_PASSWORD;

    if (isProd && (!envEmail || !envPassword)) {
      console.warn(
        "⚠ No super_admin exists and SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD\n" +
          "  env vars are not set. SKIPPING admin seed to avoid creating a\n" +
          "  default-password account in production. Bootstrap the first\n" +
          "  admin by setting both env vars in Vercel and re-deploying, OR\n" +
          "  run `npx tsx scripts/seed-admin.ts` locally against the prod\n" +
          "  DATABASE_URL with the env vars set."
      );
    } else {
      const adminEmail = envEmail || "admin@fintella.partners";
      const adminPassword = envPassword || "admin123";
      await prisma.user.create({
        data: {
          email: adminEmail,
          passwordHash: bcrypt.hashSync(adminPassword, 10),
          name: "Admin User",
          role: "super_admin",
        },
      });
      console.log("✓ Admin user created (" + adminEmail + ")");
      if (!envPassword && !isProd) {
        console.log(
          "  ⓘ Using default dev password. Set SEED_ADMIN_PASSWORD env var to override."
        );
      }
    }
  }

  // ── Partners (test data — skipped in live mode) ───────────────────────
  if (LIVE_MODE) {
    console.log("✓ Partner seed SKIPPED (FINTELLA_LIVE_MODE=true)");
  } else {
    const partners = [
      { id: "p-john", partnerCode: "PTNJRO001", email: "john@fintellaconsulting.com", firstName: "John", lastName: "Orlando", phone: "(410) 497-5947", status: "active", referredByPartnerCode: null, notes: "Founding partner." },
      { id: "p-sarah", partnerCode: "PTNSC8K2F", email: "s.chen@cpagroup.com", firstName: "Sarah", lastName: "Chen", phone: "(212) 555-0202", status: "active", referredByPartnerCode: "PTNJRO001" },
      { id: "p-mike", partnerCode: "PTNMT3X7Q", email: "m.torres@advisors.com", firstName: "Mike", lastName: "Torres", phone: "(305) 555-0303", status: "active", referredByPartnerCode: "PTNJRO001" },
      { id: "p-lisa", partnerCode: "PTNLP9W4R", email: "l.park@tradelaw.com", firstName: "Lisa", lastName: "Park", phone: "(415) 555-0404", status: "pending", referredByPartnerCode: "PTNJRO001" },
      { id: "p-david", partnerCode: "PTNDK5M8J", email: "d.kim@imports.co", firstName: "David", lastName: "Kim", phone: "(713) 555-0505", status: "active", referredByPartnerCode: "PTNSC8K2F" },
    ];

    for (const p of partners) {
      await prisma.partner.upsert({ where: { id: p.id }, update: {}, create: p });
    }
    console.log("✓ " + partners.length + " partners seeded");
  }

  // ── Deals (test data — skipped in live mode) ──────────────────────────
  if (LIVE_MODE) {
    console.log("✓ Deal seed SKIPPED (FINTELLA_LIVE_MODE=true)");
  } else {
  const deals = [
    {
      id: "deal-1", dealName: "Acme Electronics Import LLC", partnerCode: "PTNJRO001",
      clientFirstName: "Robert", clientLastName: "Chang", clientName: "Acme Electronics",
      clientEmail: "robert.chang@acme-electronics.com", clientPhone: "(310) 555-1234",
      clientTitle: "VP of Supply Chain", serviceOfInterest: "Tariff Refund Support",
      legalEntityName: "Acme Electronics Import LLC", businessCity: "Los Angeles", businessState: "California",
      importsGoods: "Yes - we import goods into the U.S.", importCountries: "China",
      annualImportValue: "$3,000,001 – $10,000,000 per year", importerOfRecord: "We are the Importer of Record (we use a customs broker)",
      affiliateNotes: "High-volume importer of consumer electronics. Very interested in Section 301 recovery.",
      stage: "engaged", productType: "ieepa", importedProducts: "Consumer electronics",
      estimatedRefundAmount: 180000, firmFeeRate: 0.20, firmFeeAmount: 36000,
      l1CommissionAmount: 7200, l1CommissionStatus: "pending",
    },
    {
      id: "deal-2", dealName: "Pacific Textile Group", partnerCode: "PTNJRO001",
      clientFirstName: "Maria", clientLastName: "Santos", clientName: "Pacific Textile Group",
      clientEmail: "maria@pacifictextile.com", clientPhone: "(415) 555-5678",
      clientTitle: "Owner", serviceOfInterest: "Tariff Refund Support",
      legalEntityName: "Pacific Textile Group Inc.", businessCity: "San Francisco", businessState: "California",
      importsGoods: "Yes - we import goods into the U.S.", importCountries: "Asia-Pacific (Vietnam, Taiwan, India, etc.)",
      annualImportValue: "$1,500,000 – $3,000,000 per year", importerOfRecord: "We are the Importer of Record (we use a customs broker)",
      affiliateNotes: "Imports textiles from Vietnam and India. Already has customs documentation ready.",
      stage: "closedwon", productType: "ieepa", importedProducts: "Textiles & apparel",
      estimatedRefundAmount: 60000, firmFeeRate: 0.20, firmFeeAmount: 12000,
      l1CommissionAmount: 2400, l1CommissionStatus: "paid",
      closeDate: new Date("2026-02-28"),
    },
    {
      id: "deal-test", dealName: "General Electric Corp. — Test Deal", partnerCode: "PTNJRO001",
      clientFirstName: "Jack", clientLastName: "Welch", clientName: "General Electric Corp.",
      clientEmail: "jack.w@generalelectric.com", clientPhone: "(555) 839-6019",
      clientTitle: "Chief Executive Officer (CEO)", serviceOfInterest: "Tariff Refund Support",
      legalEntityName: "General Electric Corp.", businessCity: "Boston", businessState: "Massachusetts",
      importsGoods: "Yes - we import goods into the U.S.", importCountries: "Multiple Countries",
      annualImportValue: "$10,000,000+ per year", importerOfRecord: "We are the Importer of Record (we use a customs broker)",
      affiliateNotes: "Major importer — CEO reached out directly through the partner referral link. High priority.",
      stage: "new_lead", productType: "ieepa", importedProducts: "Industrial equipment, turbines, electronics",
      estimatedRefundAmount: 500000, firmFeeRate: null, firmFeeAmount: 0,
      l1CommissionAmount: 0, l1CommissionStatus: "pending",
    },
    {
      id: "deal-4", dealName: "Global Auto Parts Inc.", partnerCode: "PTNSC8K2F",
      clientFirstName: "Tom", clientLastName: "Bradley", clientName: "Global Auto Parts",
      clientEmail: "tom@globalautoparts.com", clientPhone: "(248) 555-3456",
      clientTitle: "Director of Purchasing", serviceOfInterest: "Tariff Refund Support",
      legalEntityName: "Global Auto Parts Inc.", businessCity: "Detroit", businessState: "Michigan",
      importsGoods: "Yes - we import goods into the U.S.", importCountries: "Mexico",
      annualImportValue: "$1,500,000 – $3,000,000 per year", importerOfRecord: "We are the Importer of Record (we use a customs broker)",
      affiliateNotes: "Auto parts from Mexico. Referred by Sarah Chen — strong lead.",
      stage: "qualified", productType: "ieepa", importedProducts: "Auto parts",
      estimatedRefundAmount: 45000, firmFeeRate: 0.20, firmFeeAmount: 9000,
      l1CommissionAmount: 1800, l1CommissionStatus: "pending", l2CommissionAmount: 450, l2CommissionStatus: "pending",
    },
    {
      id: "deal-5", dealName: "Summit Furniture Co.", partnerCode: "PTNMT3X7Q",
      clientFirstName: "Linda", clientLastName: "Park", clientName: "Summit Furniture",
      clientEmail: "linda@summitfurniture.com", clientPhone: "(704) 555-7890",
      clientTitle: "CEO", serviceOfInterest: "Tariff Refund Support",
      legalEntityName: "Summit Furniture Co. LLC", businessCity: "Charlotte", businessState: "North Carolina",
      importsGoods: "Yes - we import goods into the U.S.", importCountries: "China",
      annualImportValue: "$3,000,001 – $10,000,000 per year", importerOfRecord: "We are the Importer of Record (we use a customs broker)",
      affiliateNotes: "Large furniture importer from China. CEO is decision-maker.",
      stage: "engaged", productType: "ieepa", importedProducts: "Furniture imports",
      estimatedRefundAmount: 128000, firmFeeRate: 0.20, firmFeeAmount: 25600,
      l1CommissionAmount: 5120, l1CommissionStatus: "pending", l2CommissionAmount: 1280, l2CommissionStatus: "pending",
    },
  ];

  for (const d of deals) {
    await prisma.deal.upsert({
      where: { id: d.id },
      update: {},
      create: Object.assign({}, d, { closeDate: d.closeDate || null }),
    });
  }
  console.log("✓ " + deals.length + " deals seeded (including test deal)");
  }

  // ── Conference Schedule (Live Weekly) ─────────────────────────────────
  // 1 active upcoming call + 7 past recordings. Mirrors scripts/seed-conference.ts
  // (kept inline here so every Vercel build seeds Live Weekly data — the .ts
  // standalone seed remains for ad-hoc dev runs).
  //
  // LIVE_MODE gate — without this, every Vercel redeploy upserts the hardcoded
  // `cs-week-*` IDs back into the DB, so an admin's delete on production gets
  // silently reverted on the next push. With FINTELLA_LIVE_MODE=true set on
  // prod, we skip the re-upsert entirely. Admin still needs to delete demo
  // rows once manually; from then on they stay deleted.
  if (LIVE_MODE) {
    console.log("✓ Conference seed SKIPPED (FINTELLA_LIVE_MODE=true)");
  } else {
  const conferenceUpcoming = {
    id: "cs-week-13",
    title: "Weekly Partner Training & Q&A",
    description: "Product updates, training topics, success stories, and live Q&A.",
    joinUrl: "https://zoom.us/j/1234567890",
    schedule: "Every Thursday at 2:00 PM ET — 45-60 minutes",
    nextCall: new Date("2026-03-26T18:00:00.000Z"),
    hostName: "Fintella Leadership Team",
    weekNumber: 13,
    isActive: true,
  };

  const conferencePast = [
    { id: "cs-week-12", title: "Section 301 Update & New Partner Tools", hostName: "Sarah Mitchell", weekNumber: 12, nextCall: new Date("2026-03-19T18:00:00.000Z"), duration: "52 min", embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ", notes: "**Key Topics:**\n- Section 301 tariff updates effective April 1\n- New partner portal features walkthrough\n- Partner spotlight: How Mike S. closed 5 deals in one week\n\n**Action Items:**\n- Review updated Section 301 reference sheet in Resources\n- Try the new bulk lead submission feature\n- Submit Q1 performance reports by March 31" },
    { id: "cs-week-11", title: "Commission Deep Dive & Top Partner Q&A", hostName: "John Orlando", weekNumber: 11, nextCall: new Date("2026-03-12T18:00:00.000Z"), duration: "47 min", embedUrl: "https://www.youtube.com/embed/9bZkp7q19f0", notes: "**Key Topics:**\n- How L1, L2, and L3 commissions are calculated\n- Payout timeline walkthrough (filing → IRS → payment)\n- Q&A with top 3 partners on their lead generation strategies\n\n**Action Items:**\n- Review your commission dashboard for Q1 estimates\n- Set up direct deposit if you haven't already" },
    { id: "cs-week-10", title: "IEEPA Changes & Client Outreach Strategies", hostName: "Sarah Mitchell", weekNumber: 10, nextCall: new Date("2026-03-05T19:00:00.000Z"), duration: "58 min", embedUrl: "https://www.youtube.com/embed/LXb3EKWsInQ", notes: "**Key Topics:**\n- New IEEPA executive order implications for tariff recovery\n- Expanded eligibility criteria for importers\n- Effective cold outreach scripts for CPAs and trade advisors\n\n**Action Items:**\n- Download the updated Client Conversation Script\n- Identify 5 potential leads using the new eligibility criteria" },
    { id: "cs-week-9", title: "Onboarding Best Practices for New Partners", hostName: "Fintella Leadership Team", weekNumber: 9, nextCall: new Date("2026-02-26T19:00:00.000Z"), duration: "41 min", recordingUrl: "https://zoom.us/rec/share/example-week-9", notes: "**Key Topics:**\n- First 7 days as a Fintella partner — what to do\n- Portal walkthrough for new partners\n- Common mistakes to avoid when submitting leads\n\n**Action Items:**\n- Complete all Onboarding training modules\n- Submit your W-9 and partnership agreement" },
    { id: "cs-week-8", title: "Tax Season Strategies & Pipeline Management", hostName: "John Orlando", weekNumber: 8, nextCall: new Date("2026-02-19T19:00:00.000Z"), duration: "44 min", embedUrl: "https://www.youtube.com/embed/kJQP7kiw5Fk", notes: "**Key Topics:**\n- Leveraging tax season for client outreach\n- Managing your deal pipeline effectively\n- How to re-engage cold leads" },
    { id: "cs-week-7", title: "Building Your Downline — Advanced Recruiting", hostName: "Sarah Mitchell", weekNumber: 7, nextCall: new Date("2026-02-12T19:00:00.000Z"), duration: "55 min", embedUrl: "https://www.youtube.com/embed/RgKAFK5djSk", notes: "**Key Topics:**\n- L2 and L3 commission opportunities through recruiting\n- Where to find CPAs and trade advisors\n- Partner referral link best practices" },
    { id: "cs-week-6", title: "Product Knowledge Deep Dive — IEEPA & Section 301", hostName: "Fintella Leadership Team", weekNumber: 6, nextCall: new Date("2026-02-05T19:00:00.000Z"), duration: "49 min", recordingUrl: "https://zoom.us/rec/share/example-week-6", notes: "**Key Topics:**\n- Differences between IEEPA and Section 301 tariffs\n- Client qualification criteria for each program\n- Estimated refund calculations walkthrough" },
  ];

  await prisma.conferenceSchedule.upsert({
    where: { id: conferenceUpcoming.id },
    update: {},
    create: conferenceUpcoming,
  });
  for (const c of conferencePast) {
    await prisma.conferenceSchedule.upsert({
      where: { id: c.id },
      update: {},
      create: Object.assign({}, c, {
        description: "Week " + c.weekNumber + " partner call recording.",
        isActive: false,
      }),
    });
  }
  console.log("✓ " + (1 + conferencePast.length) + " conference entries seeded (1 active + " + conferencePast.length + " past)");
  }

  // ── Email Templates (Communications Hub) ───────────────────────────────
  // Seeds 7 templates: 4 wired (welcome, agreement_ready, agreement_signed,
  // signup_notification — match the helper names in src/lib/sendgrid.ts and
  // drive real partner emails) + 3 drafts (deal_status_update,
  // commission_payment_notification, monthly_newsletter — placeholders for
  // future automation, marked isDraft=true so the UI shows the badge).
  // Upsert with `update: {}` so re-running the seed never overwrites
  // admin edits — only fills in missing rows on a fresh DB.
  const emailTemplates = [
    {
      key: "welcome",
      name: "Welcome New Partner",
      category: "Onboarding",
      subject: "Welcome to Fintella",
      preheader: "Welcome to Fintella. Your partner code is {partnerCode}.",
      heading: "Welcome to Fintella, {firstName}",
      bodyHtml:
        "<p>Your partner account is now created. Your partner code is " +
        "<strong style=\"font-family:'Courier New',monospace;background:#f5f5f5;padding:2px 6px;border-radius:3px;color:#c4a050;\">{partnerCode}</strong>.</p>" +
        "<p>Next step: your partnership agreement is on its way. Once it's signed " +
        "you'll be able to start submitting clients and tracking commissions " +
        "from your dashboard.</p>" +
        "<p>If you have any questions, just reply to this email.</p>",
      bodyText:
        "Your partner account is now created. Your partner code is {partnerCode}.\n\n" +
        "Next step: your partnership agreement is on its way. Once it's signed you'll be able to start submitting clients and tracking commissions from your dashboard.\n\n" +
        "If you have any questions, just reply to this email.",
      ctaLabel: "Open your dashboard",
      ctaUrl: "{portalUrl}/login",
      enabled: true,
      isDraft: false,
      description:
        "Fired immediately after a partner completes signup, before the agreement is signed. Always sent (transactional / onboarding).",
      variables: JSON.stringify([
        "firstName",
        "lastName",
        "partnerCode",
        "portalUrl",
      ]),
    },
    {
      key: "agreement_ready",
      name: "Partnership Agreement — Ready to Sign",
      category: "Onboarding",
      subject: "Fintella partnership agreement — ready to sign",
      preheader: "Your Fintella partnership agreement is ready for signature.",
      heading: "Your partnership agreement is ready to sign",
      bodyHtml:
        "<p>Hi {firstName},</p>" +
        "<p>Your Fintella partnership agreement is ready for your signature. " +
        "Click the button below to review and sign — it should take under two minutes.</p>" +
        "<p>Once it's signed, your account activates immediately and you can " +
        "start submitting clients.</p>",
      bodyText:
        "Hi {firstName},\n\n" +
        "Your Fintella partnership agreement is ready for your signature. Use the link below to review and sign — it should take under two minutes.\n\n" +
        "Once it's signed, your account activates immediately and you can start submitting clients.",
      ctaLabel: "Review & sign agreement",
      ctaUrl: "{signingUrl}",
      enabled: true,
      isDraft: false,
      description:
        "Fired by /api/admin/agreement/[partnerCode] when an admin sends a SignWell agreement to a partner. The {signingUrl} variable is the embedded SignWell link returned by the API.",
      variables: JSON.stringify([
        "firstName",
        "lastName",
        "partnerCode",
        "signingUrl",
        "portalUrl",
      ]),
    },
    {
      key: "agreement_signed",
      name: "Welcome Aboard — Agreement Signed",
      category: "Onboarding",
      subject: "Fintella: your partner account is active",
      preheader: "Your partnership agreement has been signed. Welcome aboard.",
      heading: "Your partner account is now active",
      bodyHtml:
        "<p>Hi {firstName},</p>" +
        "<p>Your Fintella partnership agreement has been signed and your account " +
        "is now <strong>active</strong>. You can submit clients, generate referral " +
        "links, and track commissions from your dashboard.</p>" +
        "<p>Welcome aboard.</p>",
      bodyText:
        "Hi {firstName},\n\n" +
        "Your Fintella partnership agreement has been signed and your account is now ACTIVE. You can submit clients, generate referral links, and track commissions from your dashboard.\n\n" +
        "Welcome aboard.",
      ctaLabel: "Go to dashboard",
      ctaUrl: "{portalUrl}/dashboard",
      enabled: true,
      isDraft: false,
      description:
        "Fired by the SignWell webhook on document_completed (after a partner signs their partnership agreement). Confirms activation and points them at the dashboard.",
      variables: JSON.stringify([
        "firstName",
        "lastName",
        "partnerCode",
        "portalUrl",
      ]),
    },
    {
      key: "signup_notification",
      name: "New Partner in Your Downline",
      category: "Recruitment",
      subject: "New downline partner: {recruitName}",
      preheader: "{recruitName} joined your downline at {commissionRatePct}.",
      heading: "A new partner just joined your downline",
      bodyHtml:
        "<p>Hi {inviterName},</p>" +
        "<p><strong>{recruitName}</strong> has signed up as your " +
        "{recruitTierUpper} partner at {commissionRatePct} commission.</p>" +
        "<p>Next step: upload their countersigned partnership agreement from your " +
        "Downline page so we can activate their account.</p>",
      bodyText:
        "Hi {inviterName},\n\n" +
        "{recruitName} has signed up as your {recruitTierUpper} partner at {commissionRatePct} commission.\n\n" +
        "Next step: upload their countersigned partnership agreement from your Downline page so we can activate their account.",
      ctaLabel: "Open downline",
      ctaUrl: "{portalUrl}/dashboard/downline",
      enabled: true,
      isDraft: false,
      description:
        "Fired to the L1 inviter when a recruit completes signup via their invite link. Reminds them to upload the signed partnership agreement from the Downline page.",
      variables: JSON.stringify([
        "inviterName",
        "inviterCode",
        "recruitName",
        "recruitTier",
        "recruitTierUpper",
        "commissionRate",
        "commissionRatePct",
        "portalUrl",
      ]),
    },
    // ─── Drafts (not yet wired) ────────────────────────────────────────────
    {
      key: "deal_status_update",
      name: "Deal Status Update",
      category: "Deal Updates",
      subject: "Update on your referred client",
      preheader: "Status update on a deal you submitted.",
      heading: "Update on your referred client",
      bodyHtml:
        "<p>Hi {firstName},</p>" +
        "<p>We wanted to provide you with an update on the status of your referred " +
        "client <strong>{dealName}</strong>. The deal has moved to the " +
        "<strong>{newStage}</strong> stage.</p>" +
        "<p>You can view the latest details in your dashboard.</p>",
      bodyText:
        "Hi {firstName},\n\n" +
        "We wanted to provide you with an update on the status of your referred client {dealName}. The deal has moved to the {newStage} stage.\n\n" +
        "You can view the latest details in your dashboard.",
      ctaLabel: "View deal",
      ctaUrl: "{portalUrl}/dashboard/deals",
      enabled: true,
      isDraft: false,
      description:
        "Fires from /api/webhook/referral PATCH when a deal's internal stage changes. Notifies the submitting partner with the new stage label.",
      variables: JSON.stringify([
        "firstName",
        "lastName",
        "partnerCode",
        "dealName",
        "newStage",
        "portalUrl",
      ]),
    },
    {
      key: "commission_payment_notification",
      name: "Commission Payment Processed",
      category: "Commissions",
      subject: "Your commission has been processed",
      preheader: "Commission of {amount} has been processed.",
      heading: "Your commission payment is on its way",
      bodyHtml:
        "<p>Hi {firstName},</p>" +
        "<p>Great news — your commission payment of <strong>{amount}</strong> " +
        "for deal <strong>{dealName}</strong> has been processed and should arrive " +
        "in your account within 2-3 business days.</p>" +
        "<p>You can see the full payment history in your commissions dashboard.</p>",
      bodyText:
        "Hi {firstName},\n\n" +
        "Great news — your commission payment of {amount} for deal {dealName} has been processed and should arrive in your account within 2-3 business days.\n\n" +
        "You can see the full payment history in your commissions dashboard.",
      ctaLabel: "View commissions",
      ctaUrl: "{portalUrl}/dashboard/commissions",
      enabled: true,
      isDraft: false,
      description:
        "Fires from /api/admin/payouts process_batch + approve_single actions whenever a CommissionLedger entry flips to status=paid. One email per commission row.",
      variables: JSON.stringify([
        "firstName",
        "lastName",
        "partnerCode",
        "amount",
        "dealName",
        "portalUrl",
      ]),
    },
    {
      key: "monthly_newsletter",
      name: "Monthly Partner Newsletter",
      category: "Company Updates",
      subject: "Fintella Monthly Update — {month}",
      preheader: "Your {month} update from Fintella.",
      heading: "Fintella Monthly Update — {month}",
      bodyHtml:
        "<p>Hi {firstName},</p>" +
        "<p>Here's your monthly update from Fintella. This month we have some " +
        "exciting news including new features, upcoming events, and program updates.</p>" +
        "<p><em>(Newsletter content goes here. Edit this template in the " +
        "Communications Hub to customize the body before each monthly send.)</em></p>",
      bodyText:
        "Hi {firstName},\n\n" +
        "Here's your monthly update from Fintella. This month we have some exciting news including new features, upcoming events, and program updates.\n\n" +
        "(Newsletter content goes here. Edit this template in the Communications Hub to customize the body before each monthly send.)",
      ctaLabel: "Open dashboard",
      ctaUrl: "{portalUrl}/dashboard",
      enabled: true,
      isDraft: false,
      description:
        "Fires from a Vercel cron on the 1st of each month at 14:00 UTC (/api/cron/monthly-newsletter). Iterates every active partner and sends one email each. Edit the body here; the schedule lives in vercel.json.",
      variables: JSON.stringify([
        "firstName",
        "lastName",
        "month",
        "year",
        "portalUrl",
      ]),
    },
    {
      key: "agreement_reminder",
      name: "Partnership Agreement — Reminder",
      category: "Onboarding",
      subject: "Reminder: your Fintella partnership agreement is waiting",
      preheader: "Finish signing your partnership agreement to activate your partner account.",
      heading: "Your partnership agreement is still waiting",
      bodyHtml:
        "<p>Hi {firstName},</p>" +
        "<p>It's been {daysSinceSent} days since we sent your Fintella partnership agreement and we haven't seen it come back signed yet. " +
        "The link is still active — it takes about two minutes.</p>" +
        "<p>Once signed, your partner account activates immediately and you can submit clients + track commissions.</p>",
      bodyText:
        "Hi {firstName},\n\n" +
        "It's been {daysSinceSent} days since we sent your Fintella partnership agreement and we haven't seen it come back signed yet. The link is still active — it takes about two minutes.\n\n" +
        "Sign here: {agreement.signingUrl}\n\n" +
        "Once signed, your partner account activates immediately and you can submit clients + track commissions.",
      ctaLabel: "Review & sign agreement",
      ctaUrl: "{agreement.signingUrl}",
      enabled: true,
      isDraft: false,
      description:
        "Default template for the partner.agreement_reminder workflow trigger. Fires from /api/cron/reminders once per `cadenceDays` for each partner whose agreement is sent but not signed. Admin can edit the body from /admin/communications Templates.",
      variables: JSON.stringify([
        "partner.firstName",
        "partner.lastName",
        "partner.partnerCode",
        "partner.email",
        "agreement.signingUrl",
        "agreement.sentDate",
        "daysSinceSent",
        "portalUrl",
      ]),
    },
    {
      key: "invite_reminder",
      name: "Recruitment Invite — Reminder",
      category: "Recruitment",
      subject: "Reminder: your Fintella partner invite is still open",
      preheader: "Finish signing up to start earning commissions as a Fintella partner.",
      heading: "Your Fintella partner invite is still open",
      bodyHtml:
        "<p>Hi {invite.invitedName},</p>" +
        "<p>It's been {daysSinceInvited} days since we sent your invite to join Fintella as a {invite.targetTier} partner and we haven't seen you sign up yet. " +
        "The link is still good.</p>" +
        "<p>It takes a few minutes to finish signing up — once you're in you can start referring clients.</p>",
      bodyText:
        "Hi {invite.invitedName},\n\n" +
        "It's been {daysSinceInvited} days since we sent your invite to join Fintella as a {invite.targetTier} partner and we haven't seen you sign up yet. The link is still good:\n\n" +
        "{invite.signupUrl}\n\n" +
        "It takes a few minutes to finish signing up — once you're in you can start referring clients.",
      ctaLabel: "Finish signing up",
      ctaUrl: "{invite.signupUrl}",
      enabled: true,
      isDraft: false,
      description:
        "Default template for the partner.invite_reminder workflow trigger. Fires from /api/cron/reminders once per `cadenceDays` for each admin-generated L1 invite that hasn't been used yet. Admin can edit the body from /admin/communications Templates.",
      variables: JSON.stringify([
        "invite.invitedName",
        "invite.invitedEmail",
        "invite.targetTier",
        "invite.signupUrl",
        "invite.token",
        "daysSinceInvited",
        "portalUrl",
      ]),
    },
    {
      key: "live_weekly_reminder",
      name: "Live Weekly — Reminder",
      category: "Live Weekly",
      subject: "Reminder: {conference.title} in {hoursBeforeCall}h",
      preheader: "Join us for this week's Fintella Live Weekly call.",
      heading: "Your Live Weekly call starts soon",
      bodyHtml:
        "<p>Hi {partner.firstName},</p>" +
        "<p>Just a reminder that <strong>{conference.title}</strong> starts in about " +
        "{hoursBeforeCall} hour(s) — {conference.nextCallLocal}.</p>" +
        "<p>You can join right from your Fintella partner portal or from the link below.</p>",
      bodyText:
        "Hi {partner.firstName},\n\n" +
        "Just a reminder that {conference.title} starts in about {hoursBeforeCall} hour(s) — {conference.nextCallLocal}.\n\n" +
        "Join here: {conference.joinUrl}",
      ctaLabel: "Join the call",
      ctaUrl: "{conference.joinUrl}",
      enabled: true,
      isDraft: false,
      description:
        "Default template for the conference.call_reminder workflow trigger. Fires from /api/cron/conference-reminders for each active Live Weekly call N hours before it starts (configurable per workflow).",
      variables: JSON.stringify([
        "partner.firstName",
        "partner.lastName",
        "conference.title",
        "conference.hostName",
        "conference.nextCall",
        "conference.nextCallLocal",
        "conference.joinUrl",
        "hoursBeforeCall",
        "portalUrl",
      ]),
    },
    {
      key: "password_reset",
      name: "Password Reset Link",
      category: "Account Security",
      subject: "Reset your Fintella password",
      preheader: "Reset your Fintella password — link expires in 1 hour.",
      heading: "Reset your password",
      bodyHtml:
        "<p>Hi {firstName},</p>" +
        "<p>We received a request to reset the password for your {roleLabel} account at {firmShort}.</p>" +
        "<p>Click the button below to choose a new password. This link expires in <strong>1 hour</strong> and can only be used once.</p>" +
        "<p style=\"color:#6b7280;font-size:13px;\">If you didn't request this, you can safely ignore this email — your password won't change.</p>",
      bodyText:
        "Hi {firstName},\n\n" +
        "We received a request to reset the password for your {roleLabel} account at {firmShort}.\n\n" +
        "Open this link to choose a new password (expires in 1 hour, single-use):\n{resetUrl}\n\n" +
        "If you didn't request this, you can safely ignore this email — your password won't change.",
      ctaLabel: "Reset password",
      ctaUrl: "{resetUrl}",
      enabled: true,
      isDraft: false,
      description:
        "Fires from /api/auth/forgot-password whenever a partner or admin submits their email on the Forgot Password page. Token is a single-use 32-byte hex with a 1-hour TTL. If this template is disabled or missing, sendPasswordResetEmail falls back to a hardcoded body so recovery never silently breaks.",
      variables: JSON.stringify([
        "firstName",
        "fullName",
        "resetUrl",
        "role",
        "roleLabel",
        "firmShort",
        "firmName",
        "portalUrl",
      ]),
    },
    {
      key: "partner_added_to_channel",
      name: "Partner Added to Channel",
      category: "Communications",
      subject: "You've been added to the \"{channelName}\" channel",
      preheader: "You've been added to the \"{channelName}\" announcement channel on {firmShort}.",
      heading: "You've been added to the \"{channelName}\" channel",
      bodyHtml:
        "<p>Hi {firstName},</p>" +
        "<p>An admin just added you to the <strong>{channelName}</strong> announcement channel on {firmShort}.</p>" +
        "<p>Announcements posted there will now show up in your Announcements tab. You can reply to start a private thread with the admin team on any post.</p>" +
        "<p style=\"font-size:12px;color:#888;\">Where to go: open the portal → sidebar → <strong>Communications → Announcements</strong>, or tap the button below.</p>",
      bodyText:
        "Hi {firstName},\n\n" +
        "An admin just added you to the \"{channelName}\" announcement channel on {firmShort}.\n\n" +
        "Announcements posted there will now show up in your Announcements tab. You can reply to start a private thread with the admin team on any post.\n\n" +
        "Open the channel: {channelUrl}\n\n" +
        "Where to go: portal sidebar → Communications → Announcements.",
      ctaLabel: "Open Channel",
      ctaUrl: "{channelUrl}",
      enabled: true,
      isDraft: false,
      description:
        "Fires from /api/admin/channels/[id]/members POST whenever an admin newly adds a partner to an AnnouncementChannel. Also powers the partner.added_to_channel workflow trigger. Falls back to hardcoded copy in sendgrid.ts if the row is missing/disabled so the send never silently breaks.",
      variables: JSON.stringify([
        "firstName",
        "lastName",
        "partnerCode",
        "channelId",
        "channelName",
        "channelUrl",
        "addedByEmail",
        "firmShort",
        "firmName",
        "portalUrl",
      ]),
    },
  ];

  for (const t of emailTemplates) {
    await prisma.emailTemplate.upsert({
      where: { key: t.key },
      update: {}, // never overwrite admin edits
      create: t,
    });
  }
  console.log("✓ " + emailTemplates.length + " email templates seeded (all wired)");

  // Backfill: existing production rows that were seeded as drafts before
  // the wiring PR need their isDraft flag flipped off. Upsert update:{} is
  // a no-op for existing rows, so do it explicitly for the three keys.
  const nowWiredKeys = ["deal_status_update", "commission_payment_notification", "monthly_newsletter"];
  await prisma.emailTemplate.updateMany({
    where: { key: { in: nowWiredKeys }, isDraft: true },
    data: { isDraft: false },
  });

  // ── SMS Templates (Phase 17c) ─────────────────────────────────────────
  // Mirrors the four hardcoded SMS send helpers in src/lib/twilio.ts.
  // All seed rows start `enabled: false` — Twilio A2P 10DLC approval is
  // pending, so flipping these on would be premature. Admin enables each
  // template from the Communications Hub → SMS → Templates tab after
  // A2P lands.
  const smsTemplates = [
    {
      key: "welcome",
      name: "Welcome",
      category: "Onboarding",
      body: "Fintella: Welcome {firstName}! Your partner code is {partnerCode}. Watch your email for the partnership agreement. Reply STOP to opt out.",
      enabled: false,
      isDraft: false,
      description: "Fired on partner signup, alongside the welcome email. Skipped if no mobile or smsOptIn=false.",
      variables: JSON.stringify(["firstName", "partnerCode"]),
    },
    {
      key: "agreement_ready",
      name: "Agreement Ready to Sign",
      category: "Onboarding",
      body: "Fintella: Hi {firstName}, your partnership agreement is ready to sign. Check your email or log in at fintella.partners. Reply STOP to opt out.",
      enabled: false,
      isDraft: false,
      description: "Fired right after the SignWell document is sent.",
      variables: JSON.stringify(["firstName"]),
    },
    {
      key: "agreement_signed",
      name: "Agreement Signed — Account Active",
      category: "Onboarding",
      body: "Fintella: {firstName}, your agreement is signed and your partner account is now active. Log in at fintella.partners to start submitting clients.",
      enabled: false,
      isDraft: false,
      description: "Fired from the SignWell webhook on document_completed. Confirms activation.",
      variables: JSON.stringify(["firstName"]),
    },
    {
      key: "signup_notification",
      name: "Downline Recruit Signed Up",
      category: "Recruitment",
      body: "Fintella: Hi {firstName}, {recruitName} just joined your downline as {recruitTier} at {ratePct}%. Upload their signed agreement at fintella.partners/dashboard/downline.",
      enabled: false,
      isDraft: false,
      description: "L1 inviter notification — fires when a recruit they invited completes signup.",
      variables: JSON.stringify(["firstName", "recruitName", "recruitTier", "ratePct"]),
    },
    {
      key: "agreement_reminder",
      name: "Agreement Reminder",
      category: "Onboarding",
      body: "Fintella: Hi {partner.firstName}, your partnership agreement is still unsigned ({daysSinceSent}d). Finish here: {agreement.signingUrl} — Reply STOP to opt out.",
      enabled: false,
      isDraft: false,
      description: "Default SMS for the partner.agreement_reminder workflow. Fires from /api/cron/reminders per cadenceDays.",
      variables: JSON.stringify(["partner.firstName", "agreement.signingUrl", "daysSinceSent"]),
    },
    {
      key: "invite_reminder",
      name: "Invite Reminder",
      category: "Recruitment",
      body: "Fintella: Hi {invite.invitedName}, your partner invite is still open. Sign up: {invite.signupUrl} — Reply STOP to opt out.",
      enabled: false,
      isDraft: false,
      description: "Default SMS for the partner.invite_reminder workflow. Fires from /api/cron/reminders per cadenceDays.",
      variables: JSON.stringify(["invite.invitedName", "invite.signupUrl", "daysSinceInvited"]),
    },
    {
      key: "live_weekly_reminder",
      name: "Live Weekly Reminder",
      category: "Live Weekly",
      body: "Fintella: {partner.firstName}, {conference.title} starts in ~{hoursBeforeCall}h ({conference.nextCallLocal}). Join: {conference.joinUrl} — Reply STOP to opt out.",
      enabled: false,
      isDraft: false,
      description: "Default SMS for the conference.call_reminder workflow. Fires from /api/cron/conference-reminders at the configured lead time before each active Live Weekly call.",
      variables: JSON.stringify(["partner.firstName", "conference.title", "conference.nextCallLocal", "conference.joinUrl", "hoursBeforeCall"]),
    },
    {
      key: "opt_in_request",
      name: "Opt-In Request (Bulk)",
      category: "Opt-In",
      body: "Fintella: Hi {firstName}, opt in to partner SMS for deal + commission updates? Reply YES to opt in, STOP to decline. Msg&data rates may apply.",
      enabled: false,
      isDraft: false,
      description: "Sent manually via the bulk opt-in request button on the SMS → Inbox tab. Replying YES flips Partner.smsOptIn = true.",
      variables: JSON.stringify(["firstName"]),
    },
  ];

  for (const t of smsTemplates) {
    await prisma.smsTemplate.upsert({
      where: { key: t.key },
      update: {}, // never overwrite admin edits — flip enabled from the UI
      create: t,
    });
  }
  console.log("✓ " + smsTemplates.length + " SMS templates seeded (all disabled pending A2P)");

  // ── Portal Settings ───────────────────────────────────────────────────
  await prisma.portalSettings.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global" },
  });
  console.log("✓ Portal settings initialized");

  // ── Admin Team Chat: ensure singleton global thread ───────────────────
  const existingGlobalThread = await prisma.adminChatThread.findFirst({
    where: { type: "global" },
  });
  if (existingGlobalThread) {
    console.log("✓ Admin team-chat global thread already exists: " + existingGlobalThread.id);
  } else {
    const t = await prisma.adminChatThread.create({ data: { type: "global" } });
    console.log("✓ Admin team-chat global thread created: " + t.id);
  }

  console.log("\n✅ All seed data complete.");
}

main()
  .catch(function(e) { console.error("Seed error:", e); process.exit(1); })
  .finally(function() { prisma.$disconnect(); });
