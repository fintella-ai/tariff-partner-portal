import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...\n");

  // ── Partners ──────────────────────────────────────────────────────────
  const partners = [
    { id: "p-john", partnerCode: "PTNJRO001", email: "john@fintellaconsulting.com", firstName: "John", lastName: "Orlando", phone: "(410) 497-5947", status: "active", referredByPartnerCode: null as string | null, notes: "Founding partner." },
    { id: "p-sarah", partnerCode: "PTNSC8K2F", email: "s.chen@cpagroup.com", firstName: "Sarah", lastName: "Chen", phone: "(212) 555-0202", status: "active", referredByPartnerCode: "PTNJRO001" },
    { id: "p-mike", partnerCode: "PTNMT3X7Q", email: "m.torres@advisors.com", firstName: "Mike", lastName: "Torres", phone: "(305) 555-0303", status: "active", referredByPartnerCode: "PTNJRO001" },
    { id: "p-lisa", partnerCode: "PTNLP9W4R", email: "l.park@tradelaw.com", firstName: "Lisa", lastName: "Park", phone: "(415) 555-0404", status: "pending", referredByPartnerCode: "PTNJRO001" },
    { id: "p-david", partnerCode: "PTNDK5M8J", email: "d.kim@imports.co", firstName: "David", lastName: "Kim", phone: "(713) 555-0505", status: "active", referredByPartnerCode: "PTNSC8K2F" },
  ];

  for (const p of partners) {
    await prisma.partner.upsert({
      where: { id: p.id },
      update: {},
      create: { ...p },
    });
  }
  console.log(`✓ ${partners.length} partners seeded`);

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
      create: { ...d, closeDate: (d as any).closeDate || null },
    });
  }
  console.log(`✓ ${deals.length} deals seeded (including test deal)`);

  // ── Portal Settings ───────────────────────────────────────────────────
  await prisma.portalSettings.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global" },
  });
  console.log("✓ Portal settings initialized");

  console.log("\n✅ All seed data complete.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
