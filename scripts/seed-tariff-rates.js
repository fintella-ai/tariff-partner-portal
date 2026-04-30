/**
 * Seed script for IEEPA tariff rates + IRS interest rates.
 *
 * Reads prisma/seed-data/ieepa-tariff-rates.json and upserts into:
 *   - IeepaRate   (composite unique: countryCode + rateType + effectiveDate)
 *   - InterestRate (unique: quarter)
 *
 * Can run standalone:  node scripts/seed-tariff-rates.js
 * Or imported:         const seedTariffRates = require("./seed-tariff-rates");
 *                      await seedTariffRates();
 */

const { PrismaClient } = require("@prisma/client");
const path = require("path");
const fs = require("fs");

// ── Rate-type mapping ──────────────────────────────────────────────────
// The JSON file may contain rateType values that don't directly match
// the Prisma IeepaRateType enum (fentanyl | reciprocal | section122).
// Map known alternates here; unmapped values are skipped with a warning.
const RATE_TYPE_MAP = {
  fentanyl: "fentanyl",
  reciprocal: "reciprocal",
  section122: "section122",
  trafficking: "fentanyl", // alternate name
};

// ── Fallback IRS interest rates ────────────────────────────────────────
// Used only when the JSON file does not contain an irsInterestRates block.
const FALLBACK_INTEREST_RATES = [
  { quarter: "Q1 2025", startDate: "2025-01-01", endDate: "2025-03-31", nonCorporateRate: 0.07, corporateRate: 0.06 },
  { quarter: "Q2 2025", startDate: "2025-04-01", endDate: "2025-06-30", nonCorporateRate: 0.07, corporateRate: 0.06 },
  { quarter: "Q3 2025", startDate: "2025-07-01", endDate: "2025-09-30", nonCorporateRate: 0.07, corporateRate: 0.06 },
  { quarter: "Q4 2025", startDate: "2025-10-01", endDate: "2025-12-31", nonCorporateRate: 0.07, corporateRate: 0.06 },
  { quarter: "Q1 2026", startDate: "2026-01-01", endDate: "2026-03-31", nonCorporateRate: 0.07, corporateRate: 0.06 },
  { quarter: "Q2 2026", startDate: "2026-04-01", endDate: "2026-06-30", nonCorporateRate: 0.06, corporateRate: 0.05 },
];

async function seedTariffRates() {
  const prisma = new PrismaClient();

  try {
    console.log("\n── Tariff Rate Seed ─────────────────────────────────────");

    // ── Load JSON ────────────────────────────────────────────────────────
    const jsonPath = path.resolve(__dirname, "..", "prisma", "seed-data", "ieepa-tariff-rates.json");
    if (!fs.existsSync(jsonPath)) {
      console.warn("[tariff-seed] JSON file not found at " + jsonPath + " — skipping");
      return;
    }

    const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    const rates = data.rates || [];

    // ── Seed IeepaRate rows ──────────────────────────────────────────────
    var created = 0;
    var updated = 0;
    var skipped = 0;

    for (var i = 0; i < rates.length; i++) {
      var r = rates[i];
      try {
        var mappedType = RATE_TYPE_MAP[r.rateType];
        if (!mappedType) {
          // rateType doesn't map to a valid enum value — skip
          console.log("  ⏭  Skipping " + r.id + " — unmapped rateType \"" + r.rateType + "\"");
          skipped++;
          continue;
        }

        var upsertData = {
          executiveOrder: r.executiveOrder || "",
          name: r.name || "",
          rateType: mappedType,
          countryCode: r.countryCode,
          countryName: r.countryName || r.countryCode,
          rate: r.rate,
          effectiveDate: new Date(r.effectiveDate),
          endDate: r.endDate ? new Date(r.endDate) : null,
          htsChapter99: r.htsChapter99 || null,
          notes: r.notes || null,
          isSeeded: true,
        };

        var result = await prisma.ieepaRate.upsert({
          where: {
            countryCode_rateType_effectiveDate: {
              countryCode: r.countryCode,
              rateType: mappedType,
              effectiveDate: new Date(r.effectiveDate),
            },
          },
          create: upsertData,
          update: upsertData,
        });

        // Check if this was a create vs update by looking at createdAt vs now
        // (upsert doesn't tell us directly, so we count all as upserted)
        created++;
      } catch (err) {
        console.error("  ✗ Error seeding rate " + (r.id || i) + ": " + err.message);
        skipped++;
      }
    }

    console.log("✓ IeepaRate: " + created + " upserted, " + skipped + " skipped (of " + rates.length + " total)");

    // ── Seed InterestRate rows ───────────────────────────────────────────
    var interestQuarters;

    if (data.irsInterestRates && data.irsInterestRates.quarters && data.irsInterestRates.quarters.length > 0) {
      // Use JSON data — map overpaymentRate → nonCorporateRate, overpaymentRateCorporate → corporateRate
      interestQuarters = data.irsInterestRates.quarters.map(function (q) {
        return {
          quarter: q.quarter,
          startDate: q.startDate,
          endDate: q.endDate,
          nonCorporateRate: q.overpaymentRate,
          corporateRate: q.overpaymentRateCorporate,
        };
      });
      console.log("  Using " + interestQuarters.length + " interest rate quarters from JSON");
    } else {
      interestQuarters = FALLBACK_INTEREST_RATES;
      console.log("  Using " + interestQuarters.length + " fallback interest rate quarters");
    }

    var irCreated = 0;
    var irSkipped = 0;

    for (var j = 0; j < interestQuarters.length; j++) {
      var q = interestQuarters[j];
      try {
        await prisma.interestRate.upsert({
          where: { quarter: q.quarter },
          create: {
            quarter: q.quarter,
            startDate: new Date(q.startDate),
            endDate: new Date(q.endDate),
            nonCorporateRate: q.nonCorporateRate,
            corporateRate: q.corporateRate,
          },
          update: {
            startDate: new Date(q.startDate),
            endDate: new Date(q.endDate),
            nonCorporateRate: q.nonCorporateRate,
            corporateRate: q.corporateRate,
          },
        });
        irCreated++;
      } catch (err) {
        console.error("  ✗ Error seeding interest rate " + q.quarter + ": " + err.message);
        irSkipped++;
      }
    }

    console.log("✓ InterestRate: " + irCreated + " upserted, " + irSkipped + " skipped");
    console.log("── Tariff Rate Seed complete ─────────────────────────────\n");
  } finally {
    await prisma.$disconnect();
  }
}

// ── Standalone execution ─────────────────────────────────────────────────
if (require.main === module) {
  seedTariffRates()
    .then(function () { process.exit(0); })
    .catch(function (e) { console.error("Tariff seed failed:", e); process.exit(1); });
}

module.exports = seedTariffRates;
