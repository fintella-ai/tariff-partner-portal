import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const deals = [
    {
      id: "deal-1", dealName: "Acme Electronics Import LLC", partnerCode: "PTNJRO001",
      clientFirstName: "Robert", clientLastName: "Chang", clientName: "Acme Electronics",
      clientEmail: "robert.chang@acme-electronics.com", clientPhone: "(310) 555-1234",
      clientTitle: "VP of Supply Chain", serviceOfInterest: "Tariff Refund Support",
      legalEntityName: "Acme Electronics Import LLC", businessCity: "Los Angeles", businessState: "California",
      importsGoods: "Yes - we import goods into the U.S.", importCountries: "China",
      annualImportValue: "$5M - $10M", importerOfRecord: "We are the importer of record",
      affiliateNotes: "High-volume importer of consumer electronics. Very interested in Section 301 recovery.",
      stage: "engaged", productType: "ieepa", importedProducts: "Consumer electronics",
      estimatedRefundAmount: 180000, firmFeeRate: 0.20, firmFeeAmount: 36000,
      l1CommissionAmount: 7200, l1CommissionStatus: "pending", l2CommissionAmount: 0, l2CommissionStatus: "pending",
    },
    {
      id: "deal-2", dealName: "Pacific Textile Group", partnerCode: "PTNJRO001",
      clientFirstName: "Maria", clientLastName: "Santos", clientName: "Pacific Textile Group",
      clientEmail: "maria@pacifictextile.com", clientPhone: "(415) 555-5678",
      clientTitle: "Owner", serviceOfInterest: "Tariff Refund Support",
      legalEntityName: "Pacific Textile Group Inc.", businessCity: "San Francisco", businessState: "California",
      importsGoods: "Yes - we import goods into the U.S.", importCountries: "Asia-Pacific (Vietnam, Taiwan, India, etc.)",
      annualImportValue: "$1M - $5M", importerOfRecord: "We are the importer of record",
      affiliateNotes: "Imports textiles from Vietnam and India. Already has customs documentation ready.",
      stage: "closedwon", productType: "ieepa", importedProducts: "Textiles & apparel",
      estimatedRefundAmount: 60000, firmFeeRate: 0.20, firmFeeAmount: 12000,
      l1CommissionAmount: 2400, l1CommissionStatus: "paid", l2CommissionAmount: 0, l2CommissionStatus: "pending",
      closeDate: new Date("2026-02-28"),
    },
    {
      id: "deal-3", dealName: "Metro Steel Distributors", partnerCode: "PTNJRO001",
      clientFirstName: "James", clientLastName: "Walker", clientName: "Metro Steel Distributors",
      clientEmail: "j.walker@metrosteel.com", clientPhone: "(713) 555-9012",
      clientTitle: "Chief Financial Officer (CFO)", serviceOfInterest: "Tariff Refund Support",
      legalEntityName: "Metro Steel Distributors Corp.", businessCity: "Houston", businessState: "Texas",
      importsGoods: "Yes - we import goods into the U.S.", importCountries: "Canada",
      annualImportValue: "$10M+", importerOfRecord: "A customs broker is the importer of record",
      affiliateNotes: "Large steel distributor. CFO wants to understand timeline before committing.",
      stage: "consultation_booked", productType: "ieepa", importedProducts: "Steel & aluminum",
      estimatedRefundAmount: 95000, firmFeeRate: 0.25, firmFeeAmount: 23750,
      l1CommissionAmount: 4750, l1CommissionStatus: "pending", l2CommissionAmount: 0, l2CommissionStatus: "pending",
    },
    {
      id: "deal-4", dealName: "Global Auto Parts Inc.", partnerCode: "PTNSC8K2F",
      clientFirstName: "Tom", clientLastName: "Bradley", clientName: "Global Auto Parts",
      clientEmail: "tom@globalautoparts.com", clientPhone: "(248) 555-3456",
      clientTitle: "Director of Purchasing", serviceOfInterest: "Tariff Refund Support",
      legalEntityName: "Global Auto Parts Inc.", businessCity: "Detroit", businessState: "Michigan",
      importsGoods: "Yes - we import goods into the U.S.", importCountries: "Mexico",
      annualImportValue: "$1M - $5M", importerOfRecord: "We are the importer of record",
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
      annualImportValue: "$5M - $10M", importerOfRecord: "We are the importer of record",
      affiliateNotes: "Large furniture importer from China. CEO is decision-maker. Mike Torres referral.",
      stage: "engaged", productType: "ieepa", importedProducts: "Furniture imports",
      estimatedRefundAmount: 128000, firmFeeRate: 0.20, firmFeeAmount: 25600,
      l1CommissionAmount: 5120, l1CommissionStatus: "pending", l2CommissionAmount: 1280, l2CommissionStatus: "pending",
    },
    {
      id: "deal-6", dealName: "Coastal Imports LLC", partnerCode: "PTNDK5M8J",
      clientFirstName: "Kevin", clientLastName: "Nguyen", clientName: "Coastal Imports",
      clientEmail: "kevin@coastalimports.com", clientPhone: "(206) 555-2345",
      clientTitle: "Managing Partner", serviceOfInterest: "Tariff Refund Support",
      legalEntityName: "Coastal Imports LLC", businessCity: "Seattle", businessState: "Washington",
      importsGoods: "No - goods are imported on our behalf", importCountries: "Multiple Countries",
      annualImportValue: "$500K - $1M", importerOfRecord: "A customs broker is the importer of record",
      affiliateNotes: "Marine equipment importer. Goods imported through broker. Needs Section 301 review.",
      stage: "contacted", productType: "section301", importedProducts: "Marine equipment",
      estimatedRefundAmount: 72000, firmFeeRate: 0.18, firmFeeAmount: 12960,
      l1CommissionAmount: 2592, l1CommissionStatus: "pending", l2CommissionAmount: 648, l2CommissionStatus: "pending",
    },
    {
      id: "deal-7", dealName: "Brightstar Technologies", partnerCode: "PTNRW2N6T",
      clientFirstName: "Susan", clientLastName: "Lee", clientName: "Brightstar Tech",
      clientEmail: "susan.lee@brightstar.tech", clientPhone: "(408) 555-6789",
      clientTitle: "Chief Operating Officer (COO)", serviceOfInterest: "Tariff Refund Support",
      legalEntityName: "Brightstar Technologies Inc.", businessCity: "San Jose", businessState: "California",
      importsGoods: "Yes - we import goods into the U.S.", importCountries: "Asia-Pacific (Vietnam, Taiwan, India, etc.)",
      annualImportValue: "$10M+", importerOfRecord: "We are the importer of record",
      affiliateNotes: "Semiconductor equipment importer. Very high value — COO engaged and ready to proceed.",
      stage: "closedwon", productType: "ieepa", importedProducts: "Semiconductor equipment",
      estimatedRefundAmount: 240000, firmFeeRate: 0.22, firmFeeAmount: 52800,
      l1CommissionAmount: 13200, l1CommissionStatus: "paid", l2CommissionAmount: 2640, l2CommissionStatus: "pending",
      closeDate: new Date("2026-03-15"),
    },
  ];

  for (const d of deals) {
    const result = await prisma.deal.upsert({
      where: { id: d.id },
      update: {},
      create: { ...d, closeDate: d.closeDate || null },
    });
    console.log(`Upserted: ${result.id} — ${result.dealName}`);
  }

  console.log(`\nSeed complete: ${deals.length} deals with full form data.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
