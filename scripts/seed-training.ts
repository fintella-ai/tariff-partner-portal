import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ─── TRAINING MODULES ──────────────────────────────────────────────────────

  const modules = [
    {
      id: "tm-welcome",
      title: "Welcome to TRLN — Getting Started",
      description:
        "A comprehensive introduction to the TRLN partner program, covering how commissions work, what to expect, and the first steps to take after activation.",
      category: "onboarding",
      duration: "12 min",
      sortOrder: 1,
      published: true,
      videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      content: `**Welcome to the TRLN Partner Network**

Thank you for joining the TRLN partner program. As a partner, you play a critical role in connecting U.S. importers with tariff recovery services that can return significant capital to their businesses. This module walks you through the fundamentals of the program so you can hit the ground running.

Your partner portal is your home base. From here you can submit leads, track deal progress, view commission statements, and access all training materials. Every lead you submit enters our pipeline and is worked by our internal team — your job is to make the introduction, and we handle the rest.

**Key Takeaways**
- Your unique partner code is used to attribute every lead you submit
- Commissions are earned at L1, L2, and L3 tiers depending on your network structure
- The partner portal gives you real-time visibility into your pipeline and earnings
- Support is available via email, chat, and weekly partner calls`,
    },
    {
      id: "tm-ieepa",
      title: "Understanding IEEPA Tariff Recovery",
      description:
        "Deep dive into the IEEPA tariff recovery process, how refunds work, and what makes a client qualified for recovery.",
      category: "product",
      duration: "18 min",
      sortOrder: 2,
      published: true,
      videoUrl: "https://www.youtube.com/embed/9bZkp7q19f0",
      content: `**What is IEEPA Tariff Recovery?**

The International Emergency Economic Powers Act (IEEPA) grants the President broad authority to impose tariffs in response to national emergencies. Many U.S. importers have paid substantial duties under IEEPA-authorized tariffs that may be eligible for partial or full recovery. TRLN specializes in identifying these recovery opportunities and filing the necessary claims on behalf of importers.

The recovery process begins with a thorough analysis of the importer's customs entry data. Our team reviews HTS codes, duty rates paid, and applicable exclusions to determine the total recoverable amount. Once qualified, we prepare and submit the formal claim to U.S. Customs and Border Protection (CBP) on the client's behalf.

**Key Takeaways**
- IEEPA tariffs were imposed under executive authority and many are subject to recovery
- Importers who paid duties on affected HTS codes may qualify for refunds
- The average recovery timeline is 6-12 months after filing
- No upfront cost to the client — fees are contingency-based
- Partners earn commissions on every successful recovery`,
    },
    {
      id: "tm-submit-lead",
      title: "How to Submit a Lead",
      description:
        "Step-by-step walkthrough of the lead submission process using the partner portal.",
      category: "onboarding",
      duration: "8 min",
      sortOrder: 3,
      published: true,
      videoUrl: "https://www.youtube.com/embed/LXb3EKWsInQ",
      content: `**Submitting Your First Lead**

Submitting a lead through the TRLN partner portal is straightforward. Navigate to the "Submit Lead" page from the sidebar, fill in the required contact and company information, and click submit. Your partner code is automatically attached to every submission, ensuring proper attribution for commissions.

When filling out the lead form, provide as much detail as possible. The company name, contact name, email, and phone number are required fields. If you know the approximate annual import volume or the HTS codes involved, include those in the notes — it helps our team prioritize and qualify the lead faster.

**Key Takeaways**
- Access the lead form from the "Submit Lead" link in the portal sidebar
- Required fields: company name, contact name, email, and phone
- Optional but helpful: annual import volume, HTS codes, and any context about the relationship
- You will receive email notifications as the lead moves through the pipeline
- Duplicate leads are flagged automatically — no penalty for submitting a lead already in the system`,
    },
    {
      id: "tm-qualified-importers",
      title: "Identifying Qualified Importers",
      description:
        "Learn how to spot importers who are most likely to qualify for IEEPA tariff recovery and maximize your conversion rate.",
      category: "sales",
      duration: "15 min",
      sortOrder: 4,
      published: true,
      videoUrl: "https://www.youtube.com/embed/3JZ_D3ELwOQ",
      content: `**Finding the Right Importers**

Not every importer will qualify for IEEPA tariff recovery, so knowing what to look for is essential. The strongest candidates are U.S.-based companies that import goods subject to IEEPA-authorized tariffs — particularly those importing from China, and those with annual import volumes exceeding $500,000. Industries like manufacturing, electronics, automotive parts, and consumer goods are especially well-represented.

Start by looking at your existing network. CPAs, trade compliance consultants, freight forwarders, and customs brokers often have direct relationships with importers and can make warm introductions. When speaking with a potential lead, ask whether they import goods that have been subject to recent tariff increases — if the answer is yes, there is a strong chance they qualify.

**Key Takeaways**
- Best candidates: U.S. importers with $500K+ in annual imports subject to IEEPA tariffs
- High-value industries: manufacturing, electronics, automotive, consumer goods, industrial equipment
- Ask about recent tariff increases on their imports as a qualifying question
- CPAs, customs brokers, and freight forwarders are excellent referral sources
- Even importers unsure of their tariff exposure should be submitted — our team will qualify them`,
    },
    {
      id: "tm-building-downline",
      title: "Building Your Downline Network",
      description:
        "Strategies for recruiting other partners such as CPAs, trade advisors, and attorneys into your downline for passive L2 and L3 commissions.",
      category: "sales",
      duration: "20 min",
      sortOrder: 5,
      published: true,
      videoUrl: "https://www.youtube.com/embed/2Vv-BfVoq4g",
      content: `**Growing Your Partner Network**

One of the most powerful features of the TRLN partner program is the ability to build a downline network. When you recruit another partner, every lead they submit generates an L2 commission for you. If that partner recruits someone who submits a lead, you earn an L3 commission. This creates a scalable, passive income stream on top of your direct L1 commissions.

The best downline recruits are professionals who already interact with importers in their day-to-day work. CPAs and accountants see import duties on financial statements. Trade compliance consultants and customs brokers handle entry filings directly. Attorneys specializing in international trade or business law advise importers on regulatory matters. Each of these professionals can generate a steady flow of qualified leads.

**Key Takeaways**
- L2 commissions are earned on leads submitted by partners you directly recruit
- L3 commissions are earned on leads submitted by partners your recruits bring in
- Target CPAs, customs brokers, trade consultants, and international trade attorneys
- Provide your recruits with their own partner portal access and training materials
- The more active your downline, the more passive income you generate`,
    },
    {
      id: "tm-using-portal",
      title: "Using the Partner Portal",
      description:
        "Full walkthrough of the partner portal including dashboard, lead tracking, commission statements, and training resources.",
      category: "tools",
      duration: "10 min",
      sortOrder: 6,
      published: true,
      videoUrl: "https://www.youtube.com/embed/M7lc1UVf-VE",
      content: `**Your Partner Portal — A Complete Guide**

The TRLN partner portal is your central hub for managing your partnership. The dashboard gives you an at-a-glance view of your active leads, deal pipeline, and commission earnings. From the sidebar, you can navigate to lead submission, deal tracking, commission statements, training modules, and downloadable resources.

The Deals page shows every lead you have submitted along with its current status in the pipeline. You can filter by status, date range, or search by company name. The Commissions page breaks down your earnings by tier (L1, L2, L3) and shows both pending and paid amounts. Statements are generated monthly and can be downloaded as PDFs for your records.

**Key Takeaways**
- The Dashboard provides a summary of leads, active deals, and commissions at a glance
- Use the Deals page to track every lead from submission through to closed/won
- The Commissions page shows L1, L2, and L3 earnings with pending and paid breakdowns
- Monthly commission statements are available for download
- Training modules and downloadable resources are accessible from the sidebar`,
    },
    {
      id: "tm-section-301",
      title: "Section 301 Duties — What You Need to Know",
      description:
        "Overview of Section 301 tariffs on Chinese imports, how they differ from IEEPA tariffs, and recovery opportunities.",
      category: "product",
      duration: "22 min",
      sortOrder: 7,
      published: true,
      videoUrl: "https://www.youtube.com/embed/kJQP7kiw5Fk",
      content: `**Section 301 Tariffs Explained**

Section 301 of the Trade Act of 1974 authorizes the U.S. Trade Representative to impose tariffs in response to unfair trade practices by foreign governments. Beginning in 2018, the U.S. imposed multiple rounds of Section 301 tariffs on imports from China, affecting thousands of product categories. These tariffs added 7.5% to 25% in additional duties on top of existing rates, significantly increasing costs for U.S. importers.

Unlike IEEPA tariffs, Section 301 duties were imposed through a different legal mechanism and have their own exclusion and recovery processes. The USTR periodically grants product-specific exclusions, and importers who paid duties on excluded products can file for refunds. Additionally, ongoing litigation and policy changes continue to create new recovery opportunities for importers who have overpaid.

**Key Takeaways**
- Section 301 tariffs target Chinese imports and range from 7.5% to 25% in additional duties
- Multiple "lists" of affected products were published (Lists 1 through 4A)
- Product exclusions have been granted and can result in duty refunds
- Recovery requires analysis of HTS codes against published exclusion lists
- Section 301 recovery is handled alongside IEEPA recovery — partners earn commissions on both`,
    },
    {
      id: "tm-commissions",
      title: "Commission Structure Explained",
      description:
        "Detailed breakdown of the L1, L2, and L3 commission tiers, payout schedules, and how earnings are calculated.",
      category: "onboarding",
      duration: "10 min",
      sortOrder: 8,
      published: true,
      videoUrl: "https://www.youtube.com/embed/RgKAFK5djSk",
      content: `**How Commissions Work at TRLN**

The TRLN commission structure is designed to reward both direct lead generation and network building. L1 commissions are earned on leads you submit directly. L2 commissions are earned on leads submitted by partners in your direct downline. L3 commissions are earned on leads submitted by partners recruited by your downline — giving you three tiers of earning potential.

Commission amounts are calculated as a percentage of the recovery fee collected from each successful deal. L1 rates are the highest, reflecting your direct effort in sourcing the lead. L2 and L3 rates are lower but accumulate passively as your network grows. Commissions are paid monthly, with statements available in the portal by the 5th of each month for the prior month's activity.

**Key Takeaways**
- L1: Direct commissions on leads you personally submit
- L2: Commissions on leads from partners you directly recruited
- L3: Commissions on leads from partners recruited by your downline
- All commissions are percentage-based on the contingency fee collected
- Payouts are processed monthly with statements available by the 5th
- There is no cap on the number of partners in your downline or the commissions you can earn`,
    },
  ];

  for (const mod of modules) {
    await prisma.trainingModule.upsert({
      where: { id: mod.id },
      update: {
        title: mod.title,
        description: mod.description,
        category: mod.category,
        content: mod.content,
        videoUrl: mod.videoUrl,
        duration: mod.duration,
        sortOrder: mod.sortOrder,
        published: mod.published,
      },
      create: mod,
    });
    console.log(`Upserted TrainingModule: ${mod.id} — ${mod.title}`);
  }

  // ─── TRAINING RESOURCES ────────────────────────────────────────────────────

  const resources = [
    {
      id: "tr-quickstart",
      title: "IEEPA Tariff Recovery — Partner Quick Start Guide",
      description:
        "Everything you need to get started as a TRLN partner in one downloadable guide. Covers program overview, lead submission, and commission basics.",
      fileType: "pdf",
      fileSize: "2.4 MB",
      fileUrl: "/downloads/quick-start-guide.pdf",
      sortOrder: 1,
      published: true,
    },
    {
      id: "tr-checklist",
      title: "Qualified Importer Checklist",
      description:
        "A printable checklist to help you quickly determine whether a potential lead qualifies for IEEPA or Section 301 tariff recovery.",
      fileType: "checklist",
      fileSize: "340 KB",
      fileUrl: "/downloads/qualified-importer-checklist.pdf",
      sortOrder: 2,
      published: true,
    },
    {
      id: "tr-ratecard",
      title: "Commission Rate Card",
      description:
        "Detailed breakdown of L1, L2, and L3 commission rates, payout thresholds, and bonus tiers.",
      fileType: "pdf",
      fileSize: "180 KB",
      fileUrl: "/downloads/commission-rate-card.pdf",
      sortOrder: 3,
      published: true,
    },
    {
      id: "tr-script",
      title: "Client Conversation Script",
      description:
        "Suggested talking points and scripts for introducing IEEPA tariff recovery to potential clients and handling common objections.",
      fileType: "guide",
      fileSize: "520 KB",
      fileUrl: "/downloads/client-conversation-script.pdf",
      sortOrder: 4,
      published: true,
    },
    {
      id: "tr-section301",
      title: "Section 301 Duties — Reference Sheet",
      description:
        "Quick-reference sheet covering Section 301 tariff lists, affected HTS codes, and current exclusion status.",
      fileType: "pdf",
      fileSize: "890 KB",
      fileUrl: "/downloads/section-301-reference.pdf",
      sortOrder: 5,
      published: true,
    },
  ];

  for (const res of resources) {
    await prisma.trainingResource.upsert({
      where: { id: res.id },
      update: {
        title: res.title,
        description: res.description,
        fileType: res.fileType,
        fileSize: res.fileSize,
        fileUrl: res.fileUrl,
        sortOrder: res.sortOrder,
        published: res.published,
      },
      create: res,
    });
    console.log(`Upserted TrainingResource: ${res.id} — ${res.title}`);
  }

  // ─── FREQUENTLY ASKED QUESTIONS ────────────────────────────────────────────

  const faqs = [
    {
      id: "faq-1",
      question: "How do I submit a lead?",
      answer:
        "Navigate to the Submit Lead page from the sidebar in your partner portal. Fill in the company name, contact name, email, and phone number, then click Submit. Your partner code is automatically attached to the lead.",
      category: "leads",
      sortOrder: 1,
      published: true,
    },
    {
      id: "faq-2",
      question: "When do I get paid?",
      answer:
        "Commissions are paid monthly. Statements are generated by the 5th of each month for the prior month's closed deals. Payouts are processed via ACH or check within 10 business days of the statement date.",
      category: "commissions",
      sortOrder: 2,
      published: true,
    },
    {
      id: "faq-3",
      question: "What is an IEEPA tariff refund?",
      answer:
        "An IEEPA tariff refund is a recovery of duties paid by U.S. importers on goods subject to tariffs imposed under the International Emergency Economic Powers Act. TRLN files claims with U.S. Customs on behalf of qualified importers to recover these overpaid duties.",
      category: "general",
      sortOrder: 3,
      published: true,
    },
    {
      id: "faq-4",
      question: "How do L1, L2, and L3 commissions work?",
      answer:
        "L1 commissions are earned on leads you submit directly. L2 commissions come from leads submitted by partners you recruited into your downline. L3 commissions come from leads submitted by partners your recruits brought in. Each tier has its own commission rate, detailed on the Commission Rate Card.",
      category: "commissions",
      sortOrder: 4,
      published: true,
    },
    {
      id: "faq-5",
      question: "Can I refer other partners?",
      answer:
        "Yes. You can recruit other professionals into your downline network. When they submit leads, you earn L2 commissions. If they recruit additional partners, you earn L3 commissions on those leads as well.",
      category: "general",
      sortOrder: 5,
      published: true,
    },
    {
      id: "faq-6",
      question: "What documents do I need to provide?",
      answer:
        "To activate your partner account, you will need to complete a Partner Agreement and submit a W-9 form for tax reporting purposes. Both documents can be completed electronically through the portal during onboarding.",
      category: "general",
      sortOrder: 6,
      published: true,
    },
    {
      id: "faq-7",
      question: "How do I track my deals?",
      answer:
        "Visit the Deals page in your partner portal to see every lead you have submitted along with its current pipeline status. You can filter by status or date range, and click into any deal for full details.",
      category: "technical",
      sortOrder: 7,
      published: true,
    },
    {
      id: "faq-8",
      question: "What if my client doesn't qualify?",
      answer:
        "There is no penalty for submitting a lead that does not qualify. Our team evaluates every submission and will notify you of the outcome. We encourage you to submit any importer you believe may be eligible.",
      category: "leads",
      sortOrder: 8,
      published: true,
    },
    {
      id: "faq-9",
      question: "How do I contact support?",
      answer:
        "You can reach the TRLN partner support team by emailing support@trln.com, using the live chat in the bottom-right corner of the portal, or joining the weekly partner call held every Thursday at 2 PM ET.",
      category: "technical",
      sortOrder: 9,
      published: true,
    },
    {
      id: "faq-10",
      question: "What is Section 301?",
      answer:
        "Section 301 of the Trade Act of 1974 authorizes the U.S. to impose tariffs in response to unfair foreign trade practices. Since 2018, Section 301 tariffs of 7.5% to 25% have been applied to thousands of Chinese imports. Importers who paid these duties may be eligible for refunds through exclusion filings.",
      category: "general",
      sortOrder: 10,
      published: true,
    },
  ];

  for (const faq of faqs) {
    await prisma.fAQ.upsert({
      where: { id: faq.id },
      update: {
        question: faq.question,
        answer: faq.answer,
        category: faq.category,
        sortOrder: faq.sortOrder,
        published: faq.published,
      },
      create: faq,
    });
    console.log(`Upserted FAQ: ${faq.id} — ${faq.question}`);
  }

  console.log("\nSeed complete: 8 modules, 5 resources, 10 FAQs.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
