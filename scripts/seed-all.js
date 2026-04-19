const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

console.log("[seed] DATABASE_URL:", process.env.DATABASE_URL ? "(set)" : "(not set)");

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

  // ── Partners ──────────────────────────────────────────────────────────
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

  // ── Deals ─────────────────────────────────────────────────────────────
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

  // ── Conference Schedule (Live Weekly) ─────────────────────────────────
  // 1 active upcoming call + 7 past recordings. Mirrors scripts/seed-conference.ts
  // (kept inline here so every Vercel build seeds Live Weekly data — the .ts
  // standalone seed remains for ad-hoc dev runs).
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
  ];

  for (const t of emailTemplates) {
    await prisma.emailTemplate.upsert({
      where: { key: t.key },
      update: {}, // never overwrite admin edits
      create: t,
    });
  }
  console.log("✓ " + emailTemplates.length + " email templates seeded (all 7 wired)");

  // Backfill: existing production rows that were seeded as drafts before
  // the wiring PR need their isDraft flag flipped off. Upsert update:{} is
  // a no-op for existing rows, so do it explicitly for the three keys.
  const nowWiredKeys = ["deal_status_update", "commission_payment_notification", "monthly_newsletter"];
  await prisma.emailTemplate.updateMany({
    where: { key: { in: nowWiredKeys }, isDraft: true },
    data: { isDraft: false },
  });

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
