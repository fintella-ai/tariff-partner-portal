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
    {
      key: "l1_invite",
      name: "L1 Partner Invitation",
      category: "Onboarding",
      subject: "You're invited to join {firmShort} as a Partner",
      preheader: "You've been invited to join {firmShort} as a Partner — earn 25% per deal.",
      heading: "You've been invited to join {firmShort}",
      bodyHtml:
        "<p>Hi {firstName},</p>" +
        "<p>You've been invited to become a Partner with {firmName}. As a partner, you'll earn 25% of the firm fee on every client referral you send us.</p>" +
        "<p>Click the button below to create your account. The process takes about two minutes — you'll fill out a short form and sign your partnership agreement digitally.</p>" +
        "<p style=\"font-size:12px;color:#888;\">This invitation link expires in 7 days.</p>",
      bodyText:
        "Hi {firstName},\n\n" +
        "You've been invited to become a Partner with {firmName}. As a partner, you'll earn 25% of the firm fee on every client referral you send us.\n\n" +
        "Use the link below to create your account and sign your partnership agreement (takes about two minutes):\n{signupUrl}\n\n" +
        "This invitation link expires in 7 days.",
      ctaLabel: "Accept Invitation",
      ctaUrl: "{signupUrl}",
      enabled: true,
      isDraft: false,
      description:
        "Fires from /api/admin/invites POST (and the resend / bulk-resend routes) whenever an admin creates an L1 partner invitation. Falls back to hardcoded copy in sendgrid.ts if the row is missing/disabled so invites never silently break.",
      variables: JSON.stringify([
        "firstName",
        "signupUrl",
        "portalUrl",
        "firmShort",
        "firmName",
      ]),
    },
    {
      key: "onboarding_nudge",
      name: "Onboarding — Stall Nudge",
      category: "Onboarding",
      subject: "Still want to start earning with {firmShort}?",
      preheader: "Finish your Getting-Started checklist — it takes a few minutes.",
      heading: "Pick up where you left off",
      bodyHtml:
        "<p>Hi {partner.firstName},</p>" +
        "<p>It's been {daysSinceSignup} days since you joined {firmShort} and we noticed your Getting-Started checklist is " +
        "{checklist.completedCount} of {checklist.totalCount} complete. You're closer than you think.</p>" +
        "<p>The next step: <strong>{nextStep.title}</strong>. {nextStep.description}</p>" +
        "<p>Jump back into your portal and knock it out — we'll walk through the rest on the next Live Weekly.</p>",
      bodyText:
        "Hi {partner.firstName},\n\n" +
        "It's been {daysSinceSignup} days since you joined {firmShort} and we noticed your Getting-Started checklist is {checklist.completedCount} of {checklist.totalCount} complete.\n\n" +
        "Next step: {nextStep.title}\n{nextStep.description}\n\n" +
        "Jump back in: {portalUrl}/dashboard/getting-started\n\n" +
        "We'll walk through the rest on the next Live Weekly.",
      ctaLabel: "Finish Getting Started",
      ctaUrl: "{portalUrl}/dashboard/getting-started",
      enabled: true,
      isDraft: false,
      description:
        "Default template for the partner.onboarding_stalled workflow trigger. Fires from /api/cron/reminders once per `cadenceDays` for each active partner whose Getting-Started checklist is < 100% and who signed up at least `cadenceDays` ago. Throttled per-partner via Partner.onboardingState.lastNudgeSentAt. Admin can edit the body from /admin/communications Templates.",
      variables: JSON.stringify([
        "partner.firstName",
        "partner.lastName",
        "partner.partnerCode",
        "partner.email",
        "checklist.completedCount",
        "checklist.totalCount",
        "checklist.progressPercent",
        "nextStep.id",
        "nextStep.title",
        "nextStep.description",
        "nextStep.ctaUrl",
        "daysSinceSignup",
        "portalUrl",
        "firmShort",
        "firmName",
      ]),
    },
    {
      key: "broker_recruitment_cold",
      name: "Broker Recruitment — Cold Email",
      category: "Broker Recruitment",
      subject: "Your tariff refund clients",
      preheader: "Your importer clients are sitting on IEEPA tariff refunds",
      heading: "IEEPA Tariff Refund Partner Opportunity",
      bodyHtml:
        "<p>{lead.firstName},</p>" +
        "<p>Your importer clients are sitting on IEEPA tariff refunds — <strong>$166 billion</strong> is available, and <strong>83% of eligible importers</strong> haven't filed yet.{locationLine}</p>" +
        "<p>We built a referral program specifically for licensed customs brokers. You refer clients you already serve, our legal team handles the CAPE filing, and you earn a commission on every successful recovery. <strong>Your clients stay yours</strong> — we work behind the scenes.</p>" +
        "<p>Our Arizona-based legal partner is licensed to pay referral fees directly to brokers. No cost to join, no risk.</p>" +
        "<p><strong>Worth a 10-minute call this week?</strong></p>",
      bodyText:
        "{lead.firstName},\n\n" +
        "Your importer clients are sitting on IEEPA tariff refunds — $166 billion is available, and 83% of eligible importers haven't filed yet.{locationLine}\n\n" +
        "We built a referral program specifically for licensed customs brokers. You refer clients you already serve, our legal team handles the CAPE filing, and you earn a commission on every successful recovery. Your clients stay yours — we work behind the scenes.\n\n" +
        "Our Arizona-based legal partner is licensed to pay referral fees directly to brokers. No cost to join, no risk.\n\n" +
        "Worth a 10-minute call this week?\n\n" +
        "Learn more: {brokerPageUrl}",
      ctaLabel: "Learn More About the Program",
      ctaUrl: "{brokerPageUrl}",
      enabled: true,
      isDraft: false,
      description:
        "Cold email sent to imported customs brokers from the CBP listing. Sent via /api/admin/leads/send-broker-email. Admin can edit from Automations > Email Templates. Variables: lead.firstName, lead.location, locationLine, brokerPageUrl, portalUrl.",
      variables: JSON.stringify([
        "lead.firstName",
        "lead.lastName",
        "lead.location",
        "locationLine",
        "brokerPageUrl",
        "portalUrl",
        "firmShort",
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
      key: "deal_status_update",
      name: "Deal Status Update",
      category: "Deals",
      body: "Fintella: {firstName}, your referral \"{dealName}\" has moved to {newStage}. View details at fintella.partners/dashboard/reporting. Reply STOP to opt out.",
      enabled: false,
      isDraft: false,
      description: "Fires when a deal stage changes. Notifies the submitting partner via SMS alongside the email update.",
      variables: JSON.stringify(["firstName", "dealName", "newStage", "previousStage"]),
    },
    {
      key: "commission_paid",
      name: "Commission Paid",
      category: "Commissions",
      body: "Fintella: {firstName}, your commission has been processed and is on its way. Check your portal for details: fintella.partners/dashboard/commissions. Reply STOP to opt out.",
      enabled: false,
      isDraft: false,
      description: "Fires when a commission payment batch is processed. Notifies the paid partner.",
      variables: JSON.stringify(["firstName", "partnerCode"]),
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

  // ── Cleanup: legacy shadow email workflows (2026-04-24) ────────────────
  // ── Workflow-driven email sends ──────────────────────────────────────
  // These replace the hardcoded sendXxxEmail() calls. Each workflow fires
  // from an existing trigger point and sends via the email.send action
  // using the matching EmailTemplate. Idempotent upsert by ID.
  const WORKFLOWS = [
    {
      id: "wf-welcome-email",
      name: "Welcome Email",
      description: "Send welcome email + SMS when a new partner signs up",
      trigger: "partner.created",
      enabled: true,
      actions: [
        { type: "email.send", config: { templateKey: "welcome", recipientType: "partner" } },
        { type: "sms.send", config: { templateKey: "welcome", recipientType: "partner" } },
      ],
    },
    {
      id: "wf-signup-notification",
      name: "Signup Notification to Inviter",
      description: "Notify the upline partner when their recruit signs up",
      trigger: "partner.created",
      enabled: true,
      actions: [
        { type: "email.send", config: { templateKey: "signup_notification", recipientType: "inviter" } },
        { type: "sms.send", config: { templateKey: "signup_notification", recipientType: "inviter" } },
      ],
    },
    {
      id: "wf-agreement-ready",
      name: "Agreement Ready Email",
      description: "Send agreement signing link when admin dispatches SignWell",
      trigger: "partner.agreement_sent",
      enabled: true,
      actions: [
        { type: "email.send", config: { templateKey: "agreement_ready", recipientType: "partner" } },
        { type: "sms.send", config: { templateKey: "agreement_ready", recipientType: "partner" } },
      ],
    },
    {
      id: "wf-agreement-signed",
      name: "Agreement Signed Confirmation",
      description: "Welcome-aboard email when partner signs agreement and is activated",
      trigger: "partner.activated",
      enabled: true,
      actions: [
        { type: "email.send", config: { templateKey: "agreement_signed", recipientType: "partner" } },
        { type: "notification.create", config: { type: "partner_activated", recipientType: "partner" } },
      ],
    },
    {
      id: "wf-deal-status-update",
      name: "Deal Status Update (Email + SMS)",
      description: "Notify submitting partner via email and SMS when their deal stage changes",
      trigger: "deal.stage_changed",
      enabled: true,
      actions: [
        { type: "email.send", config: { templateKey: "deal_status_update", recipientType: "deal_partner" } },
        { type: "sms.send", config: { templateKey: "deal_status_update", recipientType: "deal_partner" } },
      ],
    },
    {
      id: "wf-commission-paid",
      name: "Commission Payment Notification (Email + SMS)",
      description: "Notify partner via email and SMS when commission is paid via payout batch",
      trigger: "commission.paid",
      enabled: true,
      actions: [
        { type: "email.send", config: { templateKey: "commission_payment_notification", recipientType: "partner" } },
        { type: "sms.send", config: { templateKey: "commission_paid", recipientType: "partner" } },
      ],
    },
    {
      id: "wf-channel-invite",
      name: "Channel Invite Email",
      description: "Notify partner when added to an announcement channel",
      trigger: "partner.added_to_channel",
      enabled: true,
      actions: [
        { type: "email.send", config: { templateKey: "partner_added_to_channel", recipientType: "partner" } },
      ],
    },
    {
      id: "wf-monthly-newsletter",
      name: "Monthly Newsletter",
      description: "Monthly partner newsletter sent on 1st of each month via cron",
      trigger: "newsletter.monthly",
      enabled: true,
      actions: [
        { type: "email.send", config: { templateKey: "monthly_newsletter", recipientType: "all_active_partners" } },
      ],
    },
  ];
  for (var wf of WORKFLOWS) {
    await prisma.workflow.upsert({
      where: { id: wf.id },
      update: {},
      create: {
        id: wf.id,
        name: wf.name,
        description: wf.description,
        trigger: wf.trigger,
        enabled: wf.enabled,
        actions: wf.actions,
        conditions: [],
        triggerConfig: {},
      },
    });
  }
  console.log("✓ Workflows seeded: " + WORKFLOWS.length + " (all enabled)");

  // ── Training Modules ─────────────────────────────────────────────────
  // Core onboarding + product training. Idempotent upsert by ID so admin
  // edits to content/title/etc. are NOT overwritten (update: {}).
  const TRAINING_MODULES = [
    {
      id: "mod-welcome-portal",
      title: "Welcome to Your Partner Portal",
      description: "A guided tour of your dashboard — where everything lives and how to navigate the portal like a pro.",
      category: "onboarding",
      duration: "5 min",
      sortOrder: 1,
      content: "## Welcome to Fintella\n\nThis module walks you through your partner portal so you know exactly where to go for everything.\n\n### Your Dashboard Home\n\nWhen you log in, you land on your **Home** page. Here you'll find:\n- **Getting Started Checklist** — your onboarding progress tracker\n- **Welcome Video** — a quick visual tour of the portal\n- **Announcements** — updates from Fintella leadership\n- **Upcoming Events** — conferences, webinars, and deadlines\n\n### Sidebar Navigation\n\nYour sidebar is your command center. Here's what each section does:\n\n- **Home** — Your dashboard overview with announcements and quick links\n- **Submit Client** — Where you submit new client referrals\n- **Reporting** — Track all your deals, commissions, downline activity, and documents\n- **Referral Links** — Copy your client referral link and create downline invite links\n- **Conference** — Join the Live Weekly call and watch past recordings\n- **Partner Training** — Training modules, resources, FAQs, and glossary (you're here now)\n- **Settings** — Your profile, address, payout info, communication preferences, and login security\n- **Support** — Contact the Fintella team with questions\n\n### Key Things to Know\n\n1. **Your Partner Code** — Every partner gets a unique code (like PTN7K9Q2X). This code tracks all your referrals and activity.\n2. **Agreement Required** — Most portal features are locked until you sign your partnership agreement. This is step one.\n3. **Real-Time Tracking** — Every referral, deal update, and commission change shows up in your portal in real time.\n4. **Mobile-Friendly** — The portal works on your phone. You can submit referrals, check deals, and join calls from anywhere.\n\n### Next Steps\n\nOnce you've explored the portal, move on to the next module to learn about the tariff recovery product you'll be referring clients for.",
    },
    {
      id: "mod-tariff-recovery",
      title: "Understanding IEEPA Tariff Recovery",
      description: "The IEEPA tariff landscape, how recovery works, the $300K minimum threshold, and what you need to know to size opportunities confidently.",
      category: "product",
      duration: "15 min",
      sortOrder: 2,
      content: "## What Is IEEPA Tariff Recovery?\n\nBusinesses that import goods into the United States pay tariffs (duties) on those imports. Under the **International Emergency Economic Powers Act (IEEPA)**, the government imposed emergency tariffs on imports from dozens of countries starting in early 2025. Following a Supreme Court ruling in February 2026, these IEEPA tariffs were terminated — and the duties collected during that window are now eligible for refund.\n\n**Tariff recovery** is the process of filing claims with U.S. Customs and Border Protection (CBP) to recover those overpaid duties on behalf of qualifying importers.\n\n### The Numbers\n\n- **Collection window:** February 4, 2025 through February 24, 2026 (~12 months)\n- **Total collected:** Approximately **$166 billion** in IEEPA duties\n- **Importers affected:** Over **330,000 businesses**\n- **Minimum screening threshold:** **$300,000** in IEEPA tariff recovery exposure\n\n### IEEPA Tariffs Came in Waves\n\nA prospect could have been hit by one, some, or all of these depending on where they source goods:\n\n**Fentanyl Tariffs (Feb 2025)**\nThe first IEEPA tariffs targeted China (10%, later 20%), Canada (25%, later 35% on non-USMCA goods), and Mexico (25% on non-USMCA goods). These were the earliest duties collected and represent the longest exposure window.\n\n**Liberation Day Reciprocal Tariffs (Apr 2025)**\nA baseline 10% tariff on imports from nearly every country, with 57+ countries facing higher country-specific rates ranging from 11% to 50%. These tariffs generated the largest refund exposure for most importers.\n\n**China Escalation (Apr 2025)**\nChina's IEEPA rate escalated rapidly: 34% reciprocal added April 2, then 84% on April 8, then 125% on April 10, bringing the total IEEPA rate on Chinese goods to as high as 145%. A truce in June brought it back to 20%. Importers active during the spike paid dramatically higher rates on those entries.\n\n**Country-Specific Tariffs**\nSeparate IEEPA actions hit Brazil (40%), India (25%), Venezuela (25%), and Russia with their own rates on top of the reciprocal tariff.\n\n**De Minimis Elimination (May/Aug 2025)**\nThe $800 duty-free exemption for small shipments was eliminated under IEEPA authority, first for China/Hong Kong (May 2025), then globally (August 2025). Duties collected under this change are also potentially refundable.\n\n### How Does the Recovery Process Work?\n\n1. **You refer the client** — Submit their business information through the partner portal\n2. **Qualification review** — The recovery team reviews the client's import history and tariff exposure\n3. **Engagement** — If qualified, the client signs a retainer agreement with the recovery provider\n4. **Filing** — The recovery team files claims with U.S. Customs and Border Protection (CBP)\n5. **Recovery** — When approved, the client receives their refund. The recovery provider takes a professional fee, and your commission is calculated from that fee.\n\n### Two Types of Claims\n\n**Tier 1: Direct Refund Claims (Importer of Record)**\nThe business is listed as the Importer of Record on customs filings (Box 26, CBP Form 7501). They paid IEEPA duties directly. They are first in line for CBP refunds.\n\n**Tier 2: Secondary Claims (Carrier-Imported Goods)**\nGoods brought in by FedEx, UPS, or DHL, where the carrier was the Importer of Record. The business absorbed tariff costs but isn't on file. Different recovery path. Legal framework still emerging.\n\n### What You DON'T Need to Know\n\nYou don't need to memorize tariff rates or legal procedures. Your job is to identify businesses that import and connect them with Fintella. The recovery team handles all the legal, procedural, and filing work. Your job is just to identify the prospect and make the introduction.\n\n### Common Client Questions\n\n**\"Is this legitimate?\"** — Yes. Tariff recovery is a well-established legal process. Claims are filed directly with U.S. Customs and Border Protection following the Supreme Court ruling.\n\n**\"What does it cost?\"** — The initial review is free. The recovery provider works on a contingency basis — they only get paid if the client receives a refund.\n\n**\"How long does it take?\"** — Typical timeline is 6–18 months from filing to recovery, depending on the complexity of the claim and CBP processing times.\n\n**\"What do I need to provide?\"** — Basic business information, import records (entry summaries), and authorization to review their customs history. Most prospects won't have exact numbers — that's fine. The recovery team pulls the customs data.",
    },
    {
      id: "mod-submit-lead",
      title: "How to Submit a Client Referral",
      description: "Step-by-step walkthrough of submitting your first lead — from opening the form to tracking the deal in your reporting dashboard.",
      category: "onboarding",
      duration: "6 min",
      sortOrder: 3,
      content: "## Submitting a Client Referral\n\nSubmitting a referral is the single most important action you take as a Fintella partner. Here's exactly how to do it.\n\n### Two Critical Rules Before You Submit\n\n**1. Qualify leads on a call BEFORE submitting.** Cold leads tie up the legal team and slow down real deals. Use the discovery questions from the Qualifying Prospects module to screen your prospect first. Make sure they import, estimate their volume, and confirm interest before you submit.\n\n**2. Always submit AND book the consultation call together.** When you submit through the referral form, you'll be prompted to book a call with the legal team. Coordinate the time with your prospect and book it in the same session. A submission without a booked call sits in limbo and the deal doesn't move forward. Always submit and book together. And every submission needs your name in the notes so the system can credit it properly.\n\n### Before You Submit\n\nMake sure you have:\n- The client's **business name**\n- A **contact person** (name and email or phone)\n- A rough idea of their **annual import value** (even an estimate helps)\n- Confirmation that the prospect has been **pre-qualified** on a call\n- Any **notes** about their business (what they import, their industry, how you know them)\n\n### Step-by-Step\n\n1. **Pre-qualify your prospect** using the discovery questions (Qualifying Prospects module)\n2. **Log in** to your partner portal at fintella.partners\n3. Click **Submit Client** in the sidebar navigation\n4. Fill out the referral form with the client's information\n5. **Include your name** in the notes field so the referral is properly credited\n6. Add any helpful context — the more detail you provide, the better the recovery team can prepare\n7. **Book the consultation call** when prompted — coordinate the time with your prospect so they're expecting it\n8. Click **Submit**\n\n### What Happens After You Submit\n\nYour referral enters the pipeline as a **New Lead**. Here's how a deal moves through the stages:\n\n| Stage | What It Means |\n|---|---|\n| **Lead Submitted** | Your referral has been received and is in the queue for review |\n| **Meeting Booked** | The recovery team has a consultation scheduled with the client |\n| **Meeting Missed** | The client didn't show up for their scheduled meeting (the team will reschedule) |\n| **Qualified** | The client has been reviewed and confirmed as eligible for recovery |\n| **Client Engaged** | The client has signed a retainer agreement and the recovery process has begun |\n| **Disqualified** | The client was reviewed but doesn't qualify (you'll see the reason in your deal notes) |\n\n### Tracking Your Deals\n\nGo to **Reporting** in your sidebar to see all your submitted deals. You can:\n- Filter by stage (New Lead, Qualified, etc.)\n- See commission amounts as they're calculated\n- View deal details by clicking on any row\n- Track deals from your downline partners in the Downline tab\n\n### Tips for Better Referrals\n\n- **Pre-qualify, then submit.** This is the single biggest thing you can do to close more deals faster.\n- **Book the call immediately.** Don't let submissions sit without a scheduled consultation.\n- **Add context in the notes.** A note like \"They import electronics from China, ~$2M/year, owner is ready to talk\" helps the recovery team prioritize and prepare.\n- **Follow up with your client.** After you submit, confirm the call is on their calendar. A warm handoff converts better than a cold outreach.\n- **There's no limit.** Submit as many qualified referrals as you want. Every deal that closes earns you a commission.",
    },
    {
      id: "mod-commissions",
      title: "How Commissions Work",
      description: "Understand your commission rate, how the waterfall calculates your earnings, and when you get paid.",
      category: "onboarding",
      duration: "8 min",
      sortOrder: 4,
      content: "## Understanding Your Commissions\n\nYour commission is the percentage of the professional fee you earn on each successful recovery. This module explains exactly how it works.\n\n### Your Commission Rate\n\nYour commission rate was set when you were invited and is locked into your partnership agreement. Rates range from 10% to 25% of the professional fee, depending on your tier and the terms of your invitation.\n\nYou can see your rate on your partnership agreement and in your portal dashboard.\n\n### How the Waterfall Works\n\nWhen a deal closes and the recovery provider collects a professional fee, your commission is calculated automatically:\n\n**If you referred the client directly (L1 deal):**\n- You earn your full commission rate on the professional fee\n- Example: 20% rate × $50,000 fee = $10,000 commission\n\n**If your downline partner referred the client (L2 deal):**\n- Your downline partner earns their rate\n- You earn the difference between your rate and theirs (your \"override\")\n- Example: You're at 20%, your L2 is at 15% → You earn 5% override, they earn 15%\n\n**If your downline's downline referred the client (L3 deal):**\n- Same principle, applied across three tiers\n- The total commission across all tiers always equals the top-of-chain L1 rate\n\n### Commission Lifecycle\n\nEvery commission goes through three stages:\n\n| Status | What It Means |\n|---|---|\n| **Pending** | The deal is closed, but the professional fee hasn't been collected yet |\n| **Due** | The fee has been collected and your commission is ready for payout |\n| **Paid** | Your commission has been sent to your payout method |\n\n### When You Get Paid\n\nCommissions move to \"Due\" when the recovery provider's fee is collected. Fintella processes payouts in batches — you'll receive your payment via the payout method you set up in Settings.\n\n### Where to Track\n\n- **Reporting → Overview** — See all your deals and their commission status\n- **Reporting → Commissions** — Detailed ledger of every commission entry\n- **Home Dashboard** — Summary of total earned, total pending, and recent activity\n\n### Important Notes\n\n- Your commission rate is **snapshotted at deal creation**. If your rate changes later, it doesn't affect deals already in the pipeline.\n- Commissions are calculated **automatically**. You never need to manually calculate or request a payout.\n- If a deal is disqualified or lost, the commission status changes to \"Lost\" and no payment is made.\n- Keep your payout information current — we can't pay you if your banking details are outdated.",
    },
    {
      id: "mod-downline",
      title: "Building Your Downline Network",
      description: "How to recruit partners under you, set their commission rates, and earn override commissions on every deal they close.",
      category: "sales",
      duration: "10 min",
      sortOrder: 5,
      content: "## Building Your Downline\n\nRecruiting downline partners is how you multiply your earnings without doing more work yourself. Every deal your recruits close earns you an automatic override commission.\n\n### How It Works\n\n1. You create an **invite link** with a commission rate below yours\n2. Your recruit signs up through the link and is automatically placed in your partner tree\n3. They sign their own partnership agreement\n4. When they submit referrals and those deals close, you earn your override\n\n### Creating Invite Links\n\n1. Go to **Referral Links** in your sidebar\n2. Scroll to the downline section\n3. Choose a commission rate for your recruit (must be lower than your rate)\n4. Click **Create Invite Link**\n5. Copy and share the link with your recruit\n\n### Understanding Override Commissions\n\nYour override = your rate minus your recruit's rate.\n\n**Example:**\n- Your rate: 20%\n- You set your recruit's rate at 15%\n- Your override: 5% on every deal they close\n- On a $50,000 professional fee: they earn $7,500, you earn $2,500\n\nThis works across multiple tiers. If your recruit also recruits (L3), the math applies the same way down the chain.\n\n### Who to Recruit\n\nThe best downline partners are people with strong networks in industries that import goods:\n\n- **Accountants and CPAs** — They already know which of their clients import\n- **Freight brokers and customs brokers** — They handle imports daily\n- **Trade consultants** — They advise importers on compliance and cost reduction\n- **Business attorneys** — They serve businesses that may import\n- **Industry association leaders** — They have broad networks of member businesses\n- **Insurance brokers** — They insure importers' cargo and know the industry\n\n### Managing Your Downline\n\nOnce you have downline partners, you can track everything from the **Reporting → Downline** tab:\n\n- See each partner's status (active, pending)\n- View their deal submissions and stage progress\n- Track your override commissions on their deals\n- Send them direct messages through the portal\n\n### Tips for Growing Your Team\n\n- **Start with your inner circle.** Who do you know that has a network of importers?\n- **Share your own results.** When you close a deal, tell potential recruits. Results speak louder than pitches.\n- **Help your recruits succeed.** The faster they complete Getting Started and submit their first referral, the sooner you both earn.\n- **Set rates strategically.** A lower rate for your recruit means a higher override for you, but a competitive rate attracts better partners.",
    },
    {
      id: "mod-reporting",
      title: "Navigating Your Reporting Dashboard",
      description: "How to use the Reporting tab to track deals, monitor commissions, view documents, and understand your earnings at a glance.",
      category: "tools",
      duration: "7 min",
      sortOrder: 6,
      content: "## Your Reporting Dashboard\n\nThe Reporting section is your central hub for tracking every deal, commission, and downline activity. Here's how to get the most out of it.\n\n### Reporting Tabs\n\n#### Overview\nYour combined view of all deals — both your direct referrals and deals from your downline partners. Use the filters to narrow by:\n- **Source** — Direct (your referrals) or Downline (your recruits' referrals)\n- **Stage** — New Lead, Qualified, Client Engaged, etc.\n- **Commission Status** — Pending, Due, Paid\n\nClick any deal row to expand and see full details including notes, commission amounts, and timeline.\n\n#### Deals\nTwo sub-tabs:\n- **My Deals** — Only your direct referral submissions\n- **Downline Deals** — Deals submitted by partners in your tree\n\nEach deal shows the current stage, estimated refund amount, your commission percentage, and the commission status.\n\n#### Downline\nYour partner tree. See:\n- All partners you've recruited (and their recruits)\n- Each partner's status, rate, and join date\n- A tree view showing the full hierarchy\n- Filter to see specific tiers or statuses\n\n#### Commissions\nYour full commission ledger. Every line item shows:\n- Which deal the commission is from\n- Which partner submitted it (for downline deals)\n- The tier (L1, L2, L3)\n- The dollar amount\n- The current status (Pending → Due → Paid)\n\nUse this tab to reconcile payouts and track your lifetime earnings.\n\n#### Documents\nYour partnership agreements and any uploaded documents. Check here to:\n- Verify your current agreement status\n- View agreement versions\n- Access any documents shared by the admin team\n\n### Reading the Numbers\n\n**Total Earned** — The sum of all commissions with status \"Paid\" or \"Due\"\n**Total Pending** — Commissions on closed deals where the professional fee hasn't been collected yet\n**Pipeline** — Estimated commissions from deals still in progress (not yet closed)\n\n### Tips\n\n- **Check Reporting weekly.** Deal stages update in real time as the recovery team processes your referrals.\n- **Use the search bar** to find specific deals by client name or deal name.\n- **Sort by any column** to organize your view — click the column header to sort ascending or descending.\n- **Export your data** if you need it for your own records or tax preparation.",
    },
    {
      id: "mod-qualified-importers",
      title: "Qualifying Prospects — Discovery Questions",
      description: "The $300K screening threshold, how to estimate without customs data, and the exact questions to ask before referring a prospect.",
      category: "sales",
      duration: "12 min",
      sortOrder: 7,
      content: "## Qualifying the Opportunity\n\nAsk the right questions. Determine fit fast. Pass along leads worth a conversation.\n\n### Minimum Screening Threshold\n\n**$300,000 in IEEPA tariff recovery exposure.**\n\nClose to the line? Still worth a conversation.\n\n### How to Estimate Without Customs Data\n\nMost prospects won't know how much they paid in IEEPA duties. That's fine. You can estimate from one number they will know: how much they spend each year buying or bringing in goods from other countries.\n\n**Most countries:** **$3M+** in annual imports. The floor IEEPA rate was 10%, so $3M in imports equals roughly $300K+ in refundable duties.\n\n**Importing from China:** **$1.5M+** in annual imports. China faced IEEPA rates ranging from 20% to as high as 145% depending on the entry period. Even smaller import volumes from China may clear the $300K threshold.\n\n**Under $1.5M in total annual imports from any country?** They likely fall below the minimum. You don't need to dig further.\n\n### Two Types of Contacts to Target\n\nYou're looking for someone who can say yes to engaging the recovery provider and has authority to act on behalf of the business.\n\n**Decision Makers — Who can authorize engagement:**\n- CEO / President / Owner / Founder\n- CFO / VP Finance / Controller\n- COO / VP Operations\n- General Counsel / VP Legal\n- VP Supply Chain / Procurement\n\n**Trade & Compliance Contacts — Who knows the exposure and has the docs:**\n- Director of Trade Compliance\n- Customs Compliance Manager\n- Import / Export Manager\n- Head of Global Trade Compliance\n- Logistics / Shipping Manager\n\n*Pro tip: For smaller businesses, the owner is often both decision maker and signer. For larger companies, start with a trade compliance contact, then get a corporate officer to authorize.*\n\n### Tier 1 Discovery Questions (Importer of Record)\n\nUse these questions to screen prospects who import directly:\n\n**1. Do you import goods into the United States?**\nIf yes, continue. If no, they may still be a fit as a Tier 2 secondary claim — skip to the Tier 2 questions below.\n\n**2. Are you the Importer of Record on your customs paperwork?**\nIf they're not sure, ask: *\"Do you work with a customs broker to bring your goods into the country?\"*\n- Uses a customs broker → Almost certainly the Importer of Record. Continue.\n- No broker; goods arrive via FedEx/UPS/DHL → Likely a Tier 2 secondary claim instead.\n- Still unsure → That's okay. Pass the lead through and the recovery team will sort it out.\n\n**3. What is your approximate annual import volume in dollars?**\n- **$3M+ per year (most countries)** → Very likely a good fit. Strong lead.\n- **$1.5M+ per year (primarily from China)** → Likely a good fit. China faced IEEPA rates as high as 145% during peak periods.\n- **Under $1.5M** → Probably not the right match for this program.\n\n**4. Do you have a sense of how much you've paid in IEEPA tariff duties since February 2025?**\nMost won't know. That's completely normal.\n- They know the number → Great. If it's $300K+, strong lead.\n- They don't know → Say: *\"That's totally fine. Once you're connected with the recovery team, they'll pull your import data and come back with the exact numbers.\"*\n\n### Tier 2 Discovery Questions (Carrier-Imported Goods)\n\nFor businesses where another company (FedEx, UPS, DHL) acted as the legal importer:\n\n**1. Did another company act as the legal importer into the U.S. on behalf of your company?**\nYou're looking for businesses where someone else handled the customs process on their behalf. This is common with e-commerce sellers, small manufacturers sourcing parts, and businesses ordering directly from overseas suppliers.\n\n**2. Were you charged tariff or duty surcharges by your carrier or supplier since February 2025?**\nThese charges sometimes show up as a separate line item on a shipping invoice or supplier bill. Other times they're buried in a price increase the supplier passed along.\n\n**3. Do you have invoices or billing records showing tariff-related charges passed through to you?**\nDocumentation matters for secondary claims. Invoices, carrier billing statements, or supplier correspondence showing tariff pass-throughs will strengthen the case.\n\n**4. Do you estimate that tariff-related costs exceeded $300,000 since February 2025?**\n- $300K+ → Pass the lead.\n- Not sure but they import at high volume → Still worth an introduction.\n- Clearly under $300K → Likely below the minimum.\n\n### Best Fit Industries\n\nIEEPA tariffs hit nearly every import category. Focus your network search on businesses in these spaces:\n\n- **Consumer Goods & Retail** — Apparel, footwear, toys, housewares, furniture, sporting goods\n- **Electronics & Tech Hardware** — Computers, telecom, audio/video, LED/lighting\n- **Industrial & B2B Manufacturing** — Chemicals, plastics, industrial machinery, packaging\n- **Automotive Parts & Components** — Aftermarket parts, OEM components, tires, distributors\n- **Wholesale & Distribution** — General merchandise, private label, e-commerce sellers\n- **Health, Medical & Pharma** — Medical devices, lab equipment, PPE, pharma ingredients\n- **Food, Beverage & Agriculture** — Specialty foods, beverages, spirits, produce\n- **Building & Construction** — Hardware, fixtures, plumbing, flooring, building materials\n\n**Highest-impact source countries:** China/Hong Kong, Vietnam, India, Taiwan, South Korea, Japan, EU, Mexico, Canada, Thailand, Indonesia, Brazil. China exposure hit 145% at peak.\n\n### The Non-Negotiables\n\n1. **Qualify before you submit.** Cold leads waste attorney time and slow down your real deals.\n2. **Put your name in the affiliate notes.** Every submission. No exceptions. This is how you get paid.\n3. **Submit and book the call together.** Unbooked submissions don't move.\n4. **You are not giving legal advice.** You're identifying opportunities and making introductions. The attorneys handle everything from there.\n5. **Contingency-based for the client.** No upfront cost. Nothing to pay unless the refund is recovered. Use this.",
    },
    {
      id: "mod-starting-conversation",
      title: "Starting the Conversation",
      description: "What importers are feeling right now, how to open the door naturally, and what to say when they push back.",
      category: "sales",
      duration: "12 min",
      sortOrder: 8,
      content: "## Starting the Conversation\n\nWhat importers are feeling right now, how to open the door, and what to say when they push back.\n\n### What Importers Are Dealing With\n\nBefore you pick up the phone, understand what's going on in your prospect's world. These are real frustrations that business owners are sitting with right now.\n\n**\"I know I'm owed money, but I have no idea how to get it.\"**\nThe Supreme Court ruled these tariffs illegal. According to estimates, over 330,000 businesses are owed refunds. But the process to actually recover that money is complicated, technical, and full of deadlines. Most importers are stuck at square one.\n\n**\"The government's refund system isn't ready.\"**\nCBP is building a portal to process refunds, but it isn't finished. And there's an enormous amount of work needed long before the system is ready: pulling ACE data, reconciling entries, isolating IEEPA duties, computing interest, and building an audit-ready file. Importers who prepare a compliant submission now get to the front of the line when the portal opens.\n\n**\"I'm worried about deadlines I don't even know about.\"**\nImport entries go through a process called liquidation on a rolling basis, and once certain deadlines pass, the right to recover money on those entries can be lost permanently. Most importers aren't tracking this, and the government isn't sending reminders.\n\n**\"I changed some things during the tariffs and I'm not sure if that's a problem.\"**\nMany importers shifted sourcing, reclassified goods, or adjusted declared values to reduce their tariff exposure during the tariff period. Some of those moves create risk when filing for a refund. That's why a compliance review before anything is submitted is so important.\n\n**\"It feels too complicated to deal with right now.\"**\nThe refund process involves customs data, tariff classification, interest calculations, audit preparation, and potentially federal court filings. It's not a form you fill out. It's a legal and regulatory process with traps at every stage.\n\n**\"I'm using multiple customs brokers and my data is a mess.\"**\nCompanies that have used different brokers across ports have entry data scattered across multiple systems, formats, and classification approaches. Reconciling that into one clean refund submission is a real operational challenge.\n\n### How to Open the Conversation\n\nYou don't need a script. You need a natural way to bring it up. Here are three approaches that work depending on your relationship with the prospect.\n\n**If you know them:**\n> *\"Have you looked into getting your IEEPA tariff money back? The Supreme Court ruled those tariffs illegal and I'm working with a recovery team that's filing refunds for importers. Wanted to make sure you knew about it.\"*\n\n**If it's a warm introduction:**\n> *\"I've been connecting importers with a team that specializes in recovering IEEPA tariff refunds. If your company imports goods into the U.S., you may be owed a significant refund. Would you be open to a quick conversation?\"*\n\n**If it's a cold outreach:**\n> *\"The Supreme Court struck down the IEEPA tariffs in February and the government is sitting on $166 billion in refunds owed to importers. I'm working with a team that handles the entire recovery process. Is this on your radar?\"*\n\n### Objections You'll Hear (and What to Say)\n\nThese come up in almost every conversation. You don't need to overcome them — you're not providing legal advice. You're sharing what you've learned and keeping the door open. Whenever you can't answer a question, the best move is to encourage a phone call with the recovery team.\n\n**\"My customs broker is handling it.\"**\nA customs broker can pull your data and file entries, but that's only one piece of this. The refund process involves compliance reviews, interest calculations, deadline monitoring, audit preparation, and potentially filing in federal court. If they say their broker is already handling it, it's worth asking what specifically the broker is doing. Often \"handling it\" means they've pulled a report or flagged the entries, but the legal strategy, court filings, and audit preparation aren't being managed.\n\n**\"I already have a lawyer looking at this.\"**\nThat's great. It might be worth asking whether they're working with a trade attorney specifically, or a general business attorney. This process requires customs brokerage expertise and experience at the Court of International Trade, which is a pretty specialized area. It never hurts to get a second perspective, especially when there's no cost for the initial conversation.\n\n**\"I don't think we paid enough to make it worth it.\"**\nA lot of importers underestimate their exposure. If a business imports $1 million or more per year, they're very likely above the minimum threshold. It costs nothing to find out. The recovery team can pull the data and give them an exact number.\n\n**\"I'll deal with it later.\"**\nThat's the one that concerns me most. Entries are liquidating on a rolling basis and there are hard deadlines involved. I'd hate for you to miss a window you didn't know about. Even a quick conversation now could save a lot of headaches later.\n\n**\"I'm worried about getting audited.\"**\nThat concern actually makes the case for working with a qualified firm. The government will be reviewing every refund submission for compliance. If a business made any changes during the tariff period, it's important to have that reviewed before anything is filed. That's exactly what the compliance review covers.\n\n**\"Isn't CBP just going to send refunds automatically?\"**\nThat's what a lot of people expected, but that's not how it's working. Importers need to create their ACE account, aggregate their entry data, compute refund calculations, put together an audit-ready file, monitor deadlines, update their payment method, and more. There's nothing automatic about it.",
    },
    {
      id: "mod-after-referral",
      title: "What Happens After You Refer a Client",
      description: "The full client journey from your introduction through data collection, compliance review, filing, and refund recovery.",
      category: "product",
      duration: "10 min",
      sortOrder: 9,
      content: "## What Happens After You Refer\n\nHere's what the client journey looks like once you've made the introduction. You don't need to manage any of this, but knowing the process helps you set expectations with your prospects.\n\n### The 5-Step Client Journey\n\n**1. Initial Consultation**\nThe legal team speaks with the prospect to evaluate their situation and determine if they're a good fit for the program. This call is free and typically takes 15–30 minutes.\n\n**2. Engagement Agreement Signed**\nIf the prospect moves forward, they sign an engagement agreement with the recovery team. Your referral fee is triggered once the client's matter is settled. There is no upfront cost to the client.\n\n**3. Data Collection and Analysis**\nThe legal team pulls the client's ACE data, reconciles entries across customs brokers, isolates IEEPA duties, and computes the refund amount. This is the heavy lift — and it's entirely handled by the recovery team.\n\n**4. Compliance Review and Filing**\nA full compliance review is conducted before anything is submitted to CBP. This step is critical. The review checks for:\n- **Entry Data Red Flags** — reviewing the underlying entry data for issues that could trigger a CBP audit or jeopardize the claim\n- **Classification and Valuation Consistency** — checking for inconsistencies in HTS codes, declared values, or country of origin reporting across entries\n- **Documentation Gaps** — confirming the client's records are sufficient to support the filing and won't stall or derail the process\n- **Filing Confidence** — the recovery team does not submit claims it hasn't reviewed. If something raises a serious concern, it's addressed before anything goes to CBP.\n\nProtests, court filings, and deadline management are handled by the legal team.\n\n**5. Refund Recovery**\nOnce CBP processes the claim, the refund (plus interest) is issued to the client. The recovery team monitors the process through completion.\n\n### The Team Behind Every Engagement\n\nWhen you refer a client, they get a full team staffed with the right expertise to maximize recovery and minimize risk:\n- **Trade Attorneys** — specialized in customs law and Court of International Trade proceedings\n- **Licensed Customs Brokers** — experts in entry data, tariff classification, and CBP systems\n- **Tax Attorneys** — handle tax implications of refunds and compliance intersections\n- **Project Managers** — coordinate data collection, timelines, and client communication\n\n### End-to-End Service (12 Steps)\n\nThe recovery team handles every stage of the process:\n1. ACE Portal & ACH Registration\n2. Cross-Broker Entry Reconciliation\n3. Tariff Stacking & Isolation Analysis\n4. Refund Computation & Interest Calculation\n5. Audit File & Documentation Package\n6. Compliance & Risk Assessment\n7. Liquidation Event Monitoring\n8. Protest & Deadline Management\n9. ACE Declaration & Refund Submission\n10. CIT Complaint Filing & Litigation\n11. Remedy Phase Representation\n12. Defense Against Refund Offsets\n\n### Two Things That Set This Program Apart\n\n**Remedy Phase Representation**\nMost firms just file and wait. The Fintella recovery network includes attorneys who represent clients in the remanded court proceedings, advocating for streamlined refund processes, nationwide injunctions, and stipulated judgments that accelerate recovery.\n\n**Defense Against Refund Offsets**\nThe government may attempt to reduce or eliminate IEEPA refunds by \"offsetting\" them against new tariff liabilities under Section 122 or Section 301. The recovery team actively defends clients against these offset attempts to protect the full refund amount.\n\n### What This Means for You\n\nYou make the introduction. Everything after that is handled. Your job is done once the prospect is connected — you just watch the deal progress in your portal and collect your commission when the recovery closes.",
    },
    {
      id: "mod-key-terms",
      title: "Key Terms Every Partner Should Know",
      description: "A glossary of must-know and good-to-know trade terms — IEEPA, IOR, liquidation, ACE, Section 232, HTS codes, and more.",
      category: "product",
      duration: "8 min",
      sortOrder: 10,
      content: "## Key Terms You Should Know\n\nYou don't need to be an expert. But knowing these terms helps you hold a confident conversation and understand what your prospect is talking about.\n\n### Must-Know Terms\n\n**IEEPA (International Emergency Economic Powers Act)**\nThe law the president used to impose tariffs starting in February 2025. The Supreme Court ruled these tariffs illegal in February 2026. Every dollar collected under IEEPA is now owed back to importers.\n\n**Importer of Record (IOR)**\nThe company listed on U.S. customs paperwork as the party responsible for the shipment. The IOR is the one who paid the tariff duties and is the one entitled to the refund.\n\n**Customs Broker**\nA licensed professional who files customs entries on behalf of importers. If a business works with a customs broker, they're almost certainly the Importer of Record.\n\n**Liquidation**\nWhen CBP finalizes an import entry and locks in the duty amount. Once an entry liquidates, a 180-day countdown starts. If the importer doesn't act within that window, the refund right on that entry is gone permanently.\n\n**ACE Portal (Automated Commercial Environment)**\nThe government system where all import data lives. Importers need an ACE account to access their entry data and submit refund claims. CBP is still building the refund submission tool inside ACE.\n\n**CBP (U.S. Customs and Border Protection)**\nThe government agency that collects tariff duties and processes refunds. They're the ones on the other side of every refund claim.\n\n**Section 232**\nA different trade law used to impose tariffs on steel, aluminum, copper, autos and auto parts, lumber, semiconductors, and trucks. Section 232 tariffs are still in effect and are NOT part of the IEEPA refund. If a prospect only imports these products, they're probably not the right match for this program.\n\n### Good-to-Know Terms\n\n**Entry Summary (CF-7501)**\nThe official customs form filed for every import shipment. Shows who the IOR is, what was imported, where it came from, and how much duty was paid. The foundational document for any refund claim.\n\n**Protest**\nA formal administrative challenge filed with CBP after an entry liquidates. Importers have exactly 180 days from liquidation to file. Missing this deadline can permanently close the door on a refund.\n\n**Court of International Trade (CIT)**\nThe federal court that handles all customs and trade disputes. Filing a complaint at the CIT is the legal backstop that preserves an importer's refund rights if the administrative process fails or stalls.\n\n**Reliquidation**\nWhen CBP recalculates what was owed on an entry and issues the refund. This is the actual mechanism that puts money back in the importer's hands.\n\n**ACH (Automated Clearing House)**\nThe electronic payment system CBP uses to send refunds. Importers need ACH banking details registered in the ACE portal to receive payment. Without it, even an approved refund has nowhere to go.\n\n**USMCA**\nThe trade agreement between the U.S., Mexico, and Canada. Goods that qualify under USMCA rules of origin were exempt from IEEPA tariffs. If a prospect imports exclusively from Canada or Mexico under USMCA, their IEEPA exposure may be minimal.\n\n**Section 301**\nTariffs on Chinese goods that have been in place since 2018. These are separate from IEEPA tariffs and are NOT part of the refund. Prospects sometimes confuse the two. Only the IEEPA portion is refundable.\n\n**HTS Code (Harmonized Tariff Schedule)**\nThe classification code assigned to every imported product. Determines the duty rate. If goods were classified under the wrong HTS code during the tariff period, it can create compliance issues when filing for a refund.\n\n**CAPE (Consolidated Administration and Processing of Entries)**\nCBP's new electronic tool inside the ACE Portal for submitting IEEPA tariff refund claims. Phase 1 launched April 20, 2026. Filers upload a CSV file listing entry numbers; CBP validates, removes IEEPA Chapter 99 tariff codes, recalculates duties, and issues a refund including interest. Key limitations: Phase 1 only covers unliquidated entries and entries liquidated within the past 80 days (~82% of IEEPA duties, ~$127 billion). Max 9,999 entries per declaration. One shot per entry — no amendments. CAPE does NOT pause the 180-day protest deadline; entries approaching that deadline must be protested separately. Finally liquidated entries excluded from Phase 1 must be pursued through CIT litigation.\n\n### Why These Terms Matter\n\nYou don't need to explain any of these to a prospect. But when a prospect mentions \"my customs broker\" or \"liquidation\" or \"Section 232 tariffs,\" you'll know what they're talking about and whether they're a good fit for this program.",
    },
    {
      id: "mod-urgency",
      title: "Using Urgency in Client Conversations",
      description: "The three real layers of urgency — rolling deadlines, CIT litigation cutoff, and processing backlog — with language that holds up under scrutiny.",
      category: "sales",
      duration: "6 min",
      sortOrder: 11,
      content: "## Using Urgency in Client Conversations\n\nReal urgency exists in the IEEPA tariff refund recovery process, but it has to be framed accurately. Overstated urgency falls apart the first time a prospect or their accountant pushes back. Here are the three real layers of urgency you can use, strongest to softest, along with language that holds up under scrutiny.\n\n### Layer 1: Per-Entry Rolling Deadlines (Strongest)\n\nEvery individual import entry has its own clock. CBP typically liquidates (finalizes) an entry about a year after the goods arrive. Once liquidated, a 180-day protest window opens under 19 U.S.C. § 1514. Miss that window and the refund right on that specific entry is gone permanently.\n\nEvery week that passes, entries from roughly 13–14 months ago are hitting their protest deadlines. Money is falling off the back of the truck every single day.\n\n**What to say:**\n> *\"Import entries are liquidating on a rolling basis right now. Each one has its own deadline, and once it passes, the refund right on that entry is gone. The recovery team monitors all of this, but they need to get started before the earliest entries expire.\"*\n\n### Layer 2: CIT Litigation Outside Deadline (~February 2027)\n\nThe overall Court of International Trade outside deadline runs out roughly two years from when the first IEEPA duties were paid. First duties hit February 4, 2025, so the absolute outside deadline for filing at CIT is approximately February 3, 2027. After that date, the litigation path closes entirely.\n\n**What to say:**\n> *\"There's also a hard outside deadline for filing at the Court of International Trade — roughly February 2027. That's the legal backstop. If a protest is denied or the administrative process stalls, the court filing is what preserves the right to recover. Missing it means losing the option entirely.\"*\n\n### Layer 3: The Processing Backlog (Operational)\n\nCBP is processing refunds through a system still being built out. CAPE Phase 1 rolled out in April 2026. Firms and clients that get into the queue early will be processed faster. Those who wait until mid-to-late 2026 will sit behind a massive backlog and see refunds delayed significantly.\n\nThe more importers who self-serve or use low-quality filers, the tighter CBP audit scrutiny gets for everyone. Early, clean filings get through smoother.\n\n**What to say:**\n> *\"CBP is processing refunds first-come, first-served right now. The earlier the filing goes in, the sooner the refund comes back. Waiting means sitting behind everyone else — and the backlog is only going to grow.\"*\n\n### What NOT to Do with Urgency\n\n- **Don't fabricate deadlines.** The urgency is real — you don't need to embellish.\n- **Don't say \"you'll lose everything.\"** Some entries may have already passed their window, but many haven't. Be accurate.\n- **Don't pressure.** Share the information, let them decide. The initial conversation costs nothing.\n- **Don't pretend to be a legal expert.** If they ask for specifics about liquidation dates or filing deadlines, say: *\"The recovery team can pull your exact entry data and tell you exactly where you stand. That's what the initial consultation is for.\"*",
    },
    {
      id: "mod-weekly-calls",
      title: "Getting the Most from Live Weekly Calls",
      description: "What happens on the weekly call, how to join, and why consistent attendance is the fastest path to success.",
      category: "onboarding",
      duration: "4 min",
      sortOrder: 12,
      content: "## Live Weekly Calls\n\nThe Live Weekly call is the heartbeat of the Fintella partner community. Here's how to make it work for you.\n\n### What Happens on the Call\n\nEach session typically covers:\n- **Product updates** — New features, process changes, industry news\n- **Partner spotlights** — Hear from top-performing partners about what's working\n- **Training segments** — Deep dives into referral strategies, objection handling, or product knowledge\n- **Live Q&A** — Get your questions answered directly by Fintella leadership\n- **Announcements** — Upcoming events, promotions, bonuses, or policy changes\n\n### How to Join\n\n1. Go to **Conference** in your sidebar\n2. Check the date and time of the next scheduled call\n3. When it's time, click the **Join** button to connect\n4. You can also add the call to your calendar directly from the Conference page\n\n### Calls are recorded\n\nIf you can't make it live, past call recordings are available on the Conference page. You can watch them anytime at your own pace.\n\n### Why Attendance Matters\n\n- Partners who attend weekly calls consistently **close more deals**. It's that simple.\n- You hear what strategies are working right now — not last month, right now.\n- You build relationships with other partners and leadership.\n- You stay ahead of product and process changes that affect your referrals.\n\n### Tips\n\n- **Set a recurring calendar reminder.** Treat the weekly call like a standing meeting.\n- **Come with questions.** The Q&A is your chance to get personalized help.\n- **Take notes.** Even one new insight per call compounds over time.\n- **Share what's working for you.** The community gets stronger when partners help each other.",
    },
  ];
  for (const mod of TRAINING_MODULES) {
    await prisma.trainingModule.upsert({
      where: { id: mod.id },
      update: {},
      create: mod,
    });
  }
  console.log("✓ Training modules seeded: " + TRAINING_MODULES.length + " modules");

  // ── Training Resources → Module Assignment Fix ─────────────────────
  // Resources uploaded via admin UI defaulted to a single module. This
  // maps each resource to its correct module by matching on title
  // keywords. Only updates moduleId + category; never overwrites
  // admin-edited titles or descriptions. Runs idempotently on every
  // build — safe if resources don't exist yet.
  const RESOURCE_MODULE_MAP = [
    { titleMatch: "Urgency Sales Guide",             moduleId: "mod-urgency",              category: "sales" },
    { titleMatch: "Biggest Tariff Refund",            moduleId: "mod-tariff-recovery",      category: "product" },
    { titleMatch: "Referral Partner Quick Reference",  moduleId: "mod-welcome-portal",       category: "onboarding" },
    { titleMatch: "Qualifying Question",              moduleId: "mod-qualified-importers",   category: "sales" },
    { titleMatch: "Opportunity Overview",             moduleId: "mod-tariff-recovery",      category: "product" },
    { titleMatch: "Best Fit Industries",              moduleId: "mod-qualified-importers",   category: "sales" },
    { titleMatch: "Targeting the Right Audience",     moduleId: "mod-qualified-importers",   category: "sales" },
    { titleMatch: "Qualifying the Opportunity",       moduleId: "mod-qualified-importers",   category: "sales" },
    { titleMatch: "Starting the Conversation",        moduleId: "mod-starting-conversation", category: "sales" },
    { titleMatch: "Value Add in the Client",          moduleId: "mod-after-referral",        category: "product" },
    { titleMatch: "Client Process",                   moduleId: "mod-after-referral",        category: "product" },
    { titleMatch: "Key Terms You Should Know",        moduleId: "mod-key-terms",             category: "product" },
  ];
  var resourceFixCount = 0;
  for (const mapping of RESOURCE_MODULE_MAP) {
    try {
      var matched = await prisma.trainingResource.findMany({
        where: { title: { contains: mapping.titleMatch } },
        select: { id: true, title: true },
      });
      for (var mr of matched) {
        await prisma.trainingResource.update({
          where: { id: mr.id },
          data: { moduleId: mapping.moduleId, category: mapping.category },
        });
        resourceFixCount++;
      }
    } catch (e) {
      // Module might not exist yet; skip silently
    }
  }
  if (resourceFixCount > 0) {
    console.log("✓ Training resources re-mapped to correct modules: " + resourceFixCount + " updated");
  }

  // ── Portal Settings ───────────────────────────────────────────────────
  await prisma.portalSettings.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global" },
  });
  console.log("✓ Portal settings initialized");

  // ── Admin Inboxes (PartnerOS AI Phase 3c — spec §7.2 / §7.6) ────────
  // Four role-scoped inboxes used for Ollie's escalation routing. Seeded
  // on every build; `update: {}` keeps this idempotent so admins can edit
  // assignedAdminIds / workHours / calendar-connect state in the UI
  // without the seed resetting their work.
  const ADMIN_INBOXES = [
    {
      role: "support",
      emailAddress: "support@fintella.partners",
      displayName: "Partner Support",
      categories: ["deal_tracking", "portal_question", "tech_error", "other"],
    },
    {
      role: "legal",
      emailAddress: "legal@fintella.partners",
      displayName: "Legal",
      categories: ["agreement_question", "legal_question"],
    },
    {
      role: "admin",
      emailAddress: "admin@fintella.partners",
      displayName: "Admin / Enterprise",
      categories: ["enterprise_inquiry", "ceo_escalation"],
    },
    {
      role: "accounting",
      emailAddress: "accounting@fintella.partners",
      displayName: "Accounting",
      categories: ["commission_question", "payment_question"],
    },
  ];
  for (const inbox of ADMIN_INBOXES) {
    await prisma.adminInbox.upsert({
      where: { role: inbox.role },
      update: {},
      create: {
        role: inbox.role,
        emailAddress: inbox.emailAddress,
        displayName: inbox.displayName,
        categories: inbox.categories,
      },
    });
  }
  console.log("✓ Admin inboxes seeded: " + ADMIN_INBOXES.map(function(i) { return i.role; }).join(", "));

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

  // ── Glossary: Key Tariff/Customs Terms ─────────────────────────────
  var GLOSSARY_TERMS = [
    { term: "IEEPA", aliases: ["International Emergency Economic Powers Act"], definition: "The law the president used to impose tariffs starting in February 2025. The Supreme Court ruled these tariffs illegal in February 2026. Every dollar collected under IEEPA is now owed back to importers.", category: "Must Know", sortOrder: 1 },
    { term: "Importer of Record", aliases: ["IOR"], definition: "The company listed on U.S. customs paperwork as the party responsible for the shipment. The IOR is the one who paid the tariff duties and is the one entitled to the refund.", category: "Must Know", sortOrder: 2 },
    { term: "Customs Broker", aliases: [], definition: "A licensed professional who files customs entries on behalf of importers. If a business works with a customs broker, they're almost certainly the Importer of Record.", category: "Must Know", sortOrder: 3 },
    { term: "Liquidation", aliases: [], definition: "When CBP finalizes an import entry and locks in the duty amount. Once an entry liquidates, a 180-day countdown starts. If the importer doesn't act within that window, the refund right on that entry is gone permanently.", category: "Must Know", sortOrder: 4 },
    { term: "ACE Portal", aliases: ["Automated Commercial Environment"], definition: "The government system where all import data lives. Importers need an ACE account to access their entry data and submit refund claims. CBP is still building the refund submission tool inside ACE.", category: "Must Know", sortOrder: 5 },
    { term: "CBP", aliases: ["U.S. Customs and Border Protection"], definition: "The government agency that collects tariff duties and processes refunds. They're the ones on the other side of every refund claim.", category: "Must Know", sortOrder: 6 },
    { term: "Section 232", aliases: [], definition: "A different trade law used to impose tariffs on steel, aluminum, copper, autos and auto parts, lumber, semiconductors, and trucks. Section 232 tariffs are still in effect and are NOT part of the IEEPA refund. If a prospect only imports these products, they're probably not the right match for this program.", category: "Must Know", sortOrder: 7 },
    { term: "Entry Summary", aliases: ["CF-7501"], definition: "The official customs form filed for every import shipment. Shows who the IOR is, what was imported, where it came from, and how much duty was paid. The foundational document for any refund claim.", category: "Good to Know", sortOrder: 10 },
    { term: "Protest", aliases: [], definition: "A formal administrative challenge filed with CBP after an entry liquidates. Importers have exactly 180 days from liquidation to file. Missing this deadline can permanently close the door on a refund.", category: "Good to Know", sortOrder: 11 },
    { term: "Court of International Trade", aliases: ["CIT"], definition: "The federal court that handles all customs and trade disputes. Filing a complaint at the CIT is the legal backstop that preserves an importer's refund rights if the administrative process fails or stalls.", category: "Good to Know", sortOrder: 12 },
    { term: "Reliquidation", aliases: [], definition: "When CBP recalculates what was owed on an entry and issues the refund. This is the actual mechanism that puts money back in the importer's hands.", category: "Good to Know", sortOrder: 13 },
    { term: "ACH", aliases: ["Automated Clearing House"], definition: "The electronic payment system CBP uses to send refunds. Importers need ACH banking details registered in the ACE portal to receive payment. Without it, even an approved refund has nowhere to go.", category: "Good to Know", sortOrder: 14 },
    { term: "USMCA", aliases: [], definition: "The trade agreement between the U.S., Mexico, and Canada. Goods that qualify under USMCA rules of origin were exempt from IEEPA tariffs. If a prospect imports exclusively from Canada or Mexico under USMCA, their IEEPA exposure may be minimal.", category: "Good to Know", sortOrder: 15 },
    { term: "Section 301", aliases: [], definition: "Tariffs on Chinese goods that have been in place since 2018. These are separate from IEEPA tariffs and are NOT part of the refund. Prospects sometimes confuse the two. Only the IEEPA portion is refundable.", category: "Good to Know", sortOrder: 16 },
    { term: "HTS Code", aliases: ["Harmonized Tariff Schedule"], definition: "The classification code assigned to every imported product. Determines the duty rate. If goods were classified under the wrong HTS code during the tariff period, it can create compliance issues when filing for a refund.", category: "Good to Know", sortOrder: 17 },
  ];
  var glossaryCreated = 0;
  for (var gi = 0; gi < GLOSSARY_TERMS.length; gi++) {
    var gt = GLOSSARY_TERMS[gi];
    var existingTerm = await prisma.trainingGlossary.findFirst({ where: { term: gt.term } });
    if (!existingTerm) {
      await prisma.trainingGlossary.create({ data: { term: gt.term, aliases: gt.aliases, definition: gt.definition, category: gt.category, sortOrder: gt.sortOrder, published: true } });
      glossaryCreated++;
    }
  }
  console.log("✓ Glossary terms: " + glossaryCreated + " created, " + (GLOSSARY_TERMS.length - glossaryCreated) + " already existed");

  // ── Ensure all partners have payoutDownlineEnabled=true ────────────
  var payoutFixed = await prisma.partner.updateMany({
    where: { payoutDownlineEnabled: false },
    data: { payoutDownlineEnabled: true },
  });
  if (payoutFixed.count > 0) {
    console.log("✓ Enabled payoutDownlineEnabled for " + payoutFixed.count + " partner(s)");
  } else {
    console.log("✓ All partners already have payoutDownlineEnabled=true");
  }

  console.log("\n✅ All seed data complete.");
}

main()
  .catch(function(e) { console.error("Seed error:", e); process.exit(1); })
  .finally(function() { prisma.$disconnect(); });
