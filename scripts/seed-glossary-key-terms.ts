/**
 * Seed glossary with key tariff/customs terms from the partner playbook.
 *
 * Usage: npx tsx scripts/seed-glossary-key-terms.ts
 *
 * Skips terms that already exist (matched by `term` unique constraint).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TERMS = [
  // ── Must Know Terms ──
  {
    term: "IEEPA",
    aliases: ["International Emergency Economic Powers Act"],
    definition:
      "The law the president used to impose tariffs starting in February 2025. The Supreme Court ruled these tariffs illegal in February 2026. Every dollar collected under IEEPA is now owed back to importers.",
    category: "Must Know",
    sortOrder: 1,
  },
  {
    term: "Importer of Record",
    aliases: ["IOR"],
    definition:
      "The company listed on U.S. customs paperwork as the party responsible for the shipment. The IOR is the one who paid the tariff duties and is the one entitled to the refund.",
    category: "Must Know",
    sortOrder: 2,
  },
  {
    term: "Customs Broker",
    aliases: [],
    definition:
      "A licensed professional who files customs entries on behalf of importers. If a business works with a customs broker, they're almost certainly the Importer of Record.",
    category: "Must Know",
    sortOrder: 3,
  },
  {
    term: "Liquidation",
    aliases: [],
    definition:
      "When CBP finalizes an import entry and locks in the duty amount. Once an entry liquidates, a 180-day countdown starts. If the importer doesn't act within that window, the refund right on that entry is gone permanently.",
    category: "Must Know",
    sortOrder: 4,
  },
  {
    term: "ACE Portal",
    aliases: ["Automated Commercial Environment"],
    definition:
      "The government system where all import data lives. Importers need an ACE account to access their entry data and submit refund claims. CBP is still building the refund submission tool inside ACE.",
    category: "Must Know",
    sortOrder: 5,
  },
  {
    term: "CBP",
    aliases: ["U.S. Customs and Border Protection"],
    definition:
      "The government agency that collects tariff duties and processes refunds. They're the ones on the other side of every refund claim.",
    category: "Must Know",
    sortOrder: 6,
  },
  {
    term: "Section 232",
    aliases: [],
    definition:
      "A different trade law used to impose tariffs on steel, aluminum, copper, autos and auto parts, lumber, semiconductors, and trucks. Section 232 tariffs are still in effect and are NOT part of the IEEPA refund. If a prospect only imports these products, they're probably not the right match for this program.",
    category: "Must Know",
    sortOrder: 7,
  },

  // ── Good-to-Know Terms ──
  {
    term: "Entry Summary",
    aliases: ["CF-7501"],
    definition:
      "The official customs form filed for every import shipment. Shows who the IOR is, what was imported, where it came from, and how much duty was paid. The foundational document for any refund claim.",
    category: "Good to Know",
    sortOrder: 10,
  },
  {
    term: "Protest",
    aliases: [],
    definition:
      "A formal administrative challenge filed with CBP after an entry liquidates. Importers have exactly 180 days from liquidation to file. Missing this deadline can permanently close the door on a refund.",
    category: "Good to Know",
    sortOrder: 11,
  },
  {
    term: "Court of International Trade",
    aliases: ["CIT"],
    definition:
      "The federal court that handles all customs and trade disputes. Filing a complaint at the CIT is the legal backstop that preserves an importer's refund rights if the administrative process fails or stalls.",
    category: "Good to Know",
    sortOrder: 12,
  },
  {
    term: "Reliquidation",
    aliases: [],
    definition:
      "When CBP recalculates what was owed on an entry and issues the refund. This is the actual mechanism that puts money back in the importer's hands.",
    category: "Good to Know",
    sortOrder: 13,
  },
  {
    term: "ACH",
    aliases: ["Automated Clearing House"],
    definition:
      "The electronic payment system CBP uses to send refunds. Importers need ACH banking details registered in the ACE portal to receive payment. Without it, even an approved refund has nowhere to go.",
    category: "Good to Know",
    sortOrder: 14,
  },
  {
    term: "USMCA",
    aliases: [],
    definition:
      "The trade agreement between the U.S., Mexico, and Canada. Goods that qualify under USMCA rules of origin were exempt from IEEPA tariffs. If a prospect imports exclusively from Canada or Mexico under USMCA, their IEEPA exposure may be minimal.",
    category: "Good to Know",
    sortOrder: 15,
  },
  {
    term: "Section 301",
    aliases: [],
    definition:
      "Tariffs on Chinese goods that have been in place since 2018. These are separate from IEEPA tariffs and are NOT part of the refund. Prospects sometimes confuse the two. Only the IEEPA portion is refundable.",
    category: "Good to Know",
    sortOrder: 16,
  },
  {
    term: "HTS Code",
    aliases: ["Harmonized Tariff Schedule"],
    definition:
      "The classification code assigned to every imported product. Determines the duty rate. If goods were classified under the wrong HTS code during the tariff period, it can create compliance issues when filing for a refund.",
    category: "Good to Know",
    sortOrder: 17,
  },
];

async function main() {
  let created = 0;
  let skipped = 0;

  for (const t of TERMS) {
    const exists = await prisma.trainingGlossary.findFirst({
      where: { term: t.term },
    });
    if (exists) {
      console.log(`  SKIP: "${t.term}" (already exists)`);
      skipped++;
      continue;
    }
    await prisma.trainingGlossary.create({
      data: {
        term: t.term,
        aliases: t.aliases,
        definition: t.definition,
        category: t.category,
        sortOrder: t.sortOrder,
        published: true,
      },
    });
    console.log(`  ADD:  "${t.term}"`);
    created++;
  }

  console.log(`\nDone — ${created} created, ${skipped} skipped.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
