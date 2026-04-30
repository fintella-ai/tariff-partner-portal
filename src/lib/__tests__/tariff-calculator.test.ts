// src/lib/__tests__/tariff-calculator.test.ts
//
// Calculator accuracy test suite — verifies IEEPA rates, interest math,
// eligibility logic, entry validation, and routing against known values.
//
// Run: npx tsx src/lib/__tests__/tariff-calculator.test.ts

import assert from "node:assert/strict";
import {
  lookupCombinedRate,
  calculateIeepaDuty,
  calculateInterest,
  checkEligibility,
  validateEntryNumber,
  aggregateDossier,
  getRoutingBucket,
  type RateRecord,
  type QuarterlyRate,
} from "../tariff-calculator";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: unknown) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${(err as Error).message}`);
  }
}

function approxEqual(a: number, b: number, tolerance = 0.01) {
  assert.ok(Math.abs(a - b) < tolerance, `${a} ≈ ${b} (tolerance ${tolerance})`);
}

const makeRate = (type: string, rate: number, name: string, country = "CN"): RateRecord => ({
  id: "r1",
  rateType: type,
  rate: rate as unknown as import("@prisma/client/runtime/library").Decimal,
  name,
  executiveOrder: "EO-test",
  countryCode: country,
  effectiveDate: new Date("2025-04-09"),
  endDate: null,
});

const allQuarters: QuarterlyRate[] = [
  { startDate: new Date("2025-01-01"), endDate: new Date("2025-03-31"), rate: 0.08 },
  { startDate: new Date("2025-04-01"), endDate: new Date("2025-06-30"), rate: 0.08 },
  { startDate: new Date("2025-07-01"), endDate: new Date("2025-09-30"), rate: 0.08 },
  { startDate: new Date("2025-10-01"), endDate: new Date("2025-12-31"), rate: 0.08 },
  { startDate: new Date("2026-01-01"), endDate: new Date("2026-03-31"), rate: 0.07 },
];

// ── 1. Rate Lookup ──────────────────────────────────────────────────────────

console.log("\n▸ lookupCombinedRate");

test("sums fentanyl + reciprocal for China (20% + 125% = 145%)", () => {
  const rates = [
    makeRate("fentanyl", 0.20, "Fentanyl 20%"),
    makeRate("reciprocal", 1.25, "Reciprocal 125%"),
  ];
  const result = lookupCombinedRate(rates);
  approxEqual(result.combinedRate, 1.45);
  approxEqual(result.breakdown.fentanyl!, 0.20);
  approxEqual(result.breakdown.reciprocal!, 1.25);
});

test("single fentanyl rate = 20%", () => {
  const result = lookupCombinedRate([makeRate("fentanyl", 0.20, "Fentanyl 20%")]);
  approxEqual(result.combinedRate, 0.20);
  assert.equal(result.breakdown.reciprocal, undefined);
});

test("empty rates = 0", () => {
  const result = lookupCombinedRate([]);
  assert.equal(result.combinedRate, 0);
});

// ── 2. Duty Calculation ─────────────────────────────────────────────────────

console.log("\n▸ calculateIeepaDuty");

test("China $100K @ 145% = $145,000", () => {
  assert.equal(calculateIeepaDuty(100_000, 1.45), 145_000);
});

test("China $500K @ 30% (pre-April 9) = $150,000", () => {
  assert.equal(calculateIeepaDuty(500_000, 0.30), 150_000);
});

test("Vietnam $250K @ 46% = $115,000", () => {
  assert.equal(calculateIeepaDuty(250_000, 0.46), 115_000);
});

test("Taiwan $500K @ 32% = $160,000", () => {
  assert.equal(calculateIeepaDuty(500_000, 0.32), 160_000);
});

test("rounds to nearest cent: $33,333.33 @ 14.5%", () => {
  assert.equal(calculateIeepaDuty(33_333.33, 0.145), 4_833.33);
});

test("$0 value = $0 duty", () => {
  assert.equal(calculateIeepaDuty(0, 1.45), 0);
});

test("0% rate = $0 duty", () => {
  assert.equal(calculateIeepaDuty(100_000, 0), 0);
});

// ── 3. Interest Calculation ─────────────────────────────────────────────────

console.log("\n▸ calculateInterest");

test("positive interest for valid duty + date range", () => {
  const interest = calculateInterest(14_500, new Date("2025-06-15"), new Date("2026-02-24"), allQuarters);
  assert.ok(interest > 0, "interest should be positive");
  assert.ok(interest < 14_500, "interest should be less than principal");
});

test("interest = 0 when duty = 0", () => {
  assert.equal(calculateInterest(0, new Date("2025-06-01"), new Date("2026-02-24"), allQuarters), 0);
});

test("interest = 0 when deposit after end date", () => {
  assert.equal(calculateInterest(1000, new Date("2026-03-01"), new Date("2026-02-24"), allQuarters), 0);
});

test("interest = 0 with empty quarterly rates", () => {
  assert.equal(calculateInterest(1000, new Date("2025-06-01"), new Date("2026-02-24"), []), 0);
});

test("longer span → more interest", () => {
  const short = calculateInterest(10_000, new Date("2025-06-01"), new Date("2025-09-01"), allQuarters);
  const long = calculateInterest(10_000, new Date("2025-06-01"), new Date("2026-02-24"), allQuarters);
  assert.ok(long > short, `long (${long}) should exceed short (${short})`);
});

test("10x duty → ~10x interest", () => {
  const low = calculateInterest(10_000, new Date("2025-06-01"), new Date("2026-02-24"), allQuarters);
  const high = calculateInterest(100_000, new Date("2025-06-01"), new Date("2026-02-24"), allQuarters);
  const ratio = high / low;
  assert.ok(ratio > 9.5 && ratio < 10.5, `ratio ${ratio} should be ~10`);
});

test("single quarter: compound daily at 8%", () => {
  const interest = calculateInterest(10_000, new Date("2025-04-01"), new Date("2025-06-30"), [allQuarters[1]]);
  const dailyRate = 0.08 / 365;
  const days = 90;
  const expected = (Math.pow(1 + dailyRate, days) - 1) * 10_000;
  approxEqual(interest, expected, 1);
});

// ── 4. Eligibility ──────────────────────────────────────────────────────────

console.log("\n▸ checkEligibility");

test("unliquidated entry in IEEPA period → eligible", () => {
  const result = checkEligibility({ entryDate: new Date("2025-06-15"), entryType: "01" });
  assert.equal(result.status, "eligible");
});

test("before IEEPA start → excluded_date", () => {
  const result = checkEligibility({ entryDate: new Date("2025-01-15"), entryType: "01" });
  assert.equal(result.status, "excluded_date");
});

test("after IEEPA end → excluded_date", () => {
  const result = checkEligibility({ entryDate: new Date("2026-03-01"), entryType: "01" });
  assert.equal(result.status, "excluded_date");
});

test("entry type 08 → excluded_type", () => {
  assert.equal(checkEligibility({ entryDate: new Date("2025-06-15"), entryType: "08" }).status, "excluded_type");
});

test("entry type 09 → excluded_type", () => {
  assert.equal(checkEligibility({ entryDate: new Date("2025-06-15"), entryType: "09" }).status, "excluded_type");
});

test("entry type 23 → excluded_type", () => {
  assert.equal(checkEligibility({ entryDate: new Date("2025-06-15"), entryType: "23" }).status, "excluded_type");
});

test("unliquidated AD/CVD → excluded_adcvd", () => {
  assert.equal(checkEligibility({ entryDate: new Date("2025-06-15"), entryType: "01", isAdCvd: true }).status, "excluded_adcvd");
});

test("liquidated AD/CVD within protest window → eligible", () => {
  const liq = new Date();
  liq.setDate(liq.getDate() - 10);
  const result = checkEligibility({ entryDate: new Date("2025-06-15"), entryType: "01", isAdCvd: true, liquidationDate: liq });
  assert.equal(result.status, "eligible");
  assert.ok(result.deadlineDays! > 0);
});

test("past protest window (>80 days) → excluded_expired", () => {
  const liq = new Date();
  liq.setDate(liq.getDate() - 100);
  assert.equal(checkEligibility({ entryDate: new Date("2025-06-15"), entryType: "01", liquidationDate: liq }).status, "excluded_expired");
});

test("urgent when ≤14 days remaining", () => {
  const liq = new Date();
  liq.setDate(liq.getDate() - 70);
  const result = checkEligibility({ entryDate: new Date("2025-06-15"), entryType: "01", liquidationDate: liq });
  assert.equal(result.isUrgent, true);
});

// ── 5. Entry Number Validation ──────────────────────────────────────────────

console.log("\n▸ validateEntryNumber");

test("validates correct mod-10 check digit", () => {
  const base = "ABC1234567";
  const weights = [1, 3, 1, 3, 1, 3, 1, 3, 1, 3];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = base[i].toUpperCase();
    const val = ch >= "A" && ch <= "Z" ? ch.charCodeAt(0) - 64 + 1 : parseInt(ch, 10);
    sum += val * weights[i];
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  assert.equal(validateEntryNumber(base + checkDigit), true);
});

test("rejects wrong check digit", () => {
  assert.equal(validateEntryNumber("ABC12345679"), false);
});

test("rejects wrong length", () => {
  assert.equal(validateEntryNumber("ABC123"), false);
});

// ── 6. Routing ──────────────────────────────────────────────────────────────

console.log("\n▸ getRoutingBucket");

test("eligible → self_file", () => assert.equal(getRoutingBucket("eligible"), "self_file"));
test("excluded_date → not_applicable", () => assert.equal(getRoutingBucket("excluded_date"), "not_applicable"));
test("excluded_adcvd → legal_required", () => assert.equal(getRoutingBucket("excluded_adcvd"), "legal_required"));
test("excluded_expired → legal_required", () => assert.equal(getRoutingBucket("excluded_expired"), "legal_required"));

// ── 7. Aggregation ──────────────────────────────────────────────────────────

console.log("\n▸ aggregateDossier");

test("sums eligible entries correctly", () => {
  const s = aggregateDossier([
    { enteredValue: 100_000, estimatedRefund: 14_500, estimatedInterest: 800, eligibility: { status: "eligible", reason: "ok" } },
    { enteredValue: 200_000, estimatedRefund: 29_000, estimatedInterest: 1_600, eligibility: { status: "eligible", reason: "ok" } },
  ]);
  assert.equal(s.entryCount, 2);
  assert.equal(s.eligibleCount, 2);
  assert.equal(s.totalEstRefund, 43_500);
});

test("separates excluded from eligible", () => {
  const s = aggregateDossier([
    { enteredValue: 100_000, estimatedRefund: 14_500, estimatedInterest: 800, eligibility: { status: "eligible", reason: "ok" } },
    { enteredValue: 50_000, estimatedRefund: 0, estimatedInterest: 0, eligibility: { status: "excluded_date", reason: "too old" } },
  ]);
  assert.equal(s.eligibleCount, 1);
  assert.equal(s.excludedCount, 1);
});

// ── 8. Full Pipeline ────────────────────────────────────────────────────────

console.log("\n▸ Full pipeline (rate → duty → interest → eligibility → routing)");

test("China $100K end-to-end: 145% → $145K duty → positive interest → eligible → self_file", () => {
  const { combinedRate } = lookupCombinedRate([
    makeRate("fentanyl", 0.20, "Fentanyl 20%"),
    makeRate("reciprocal", 1.25, "Reciprocal 125%"),
  ]);
  approxEqual(combinedRate, 1.45);

  const duty = calculateIeepaDuty(100_000, combinedRate);
  assert.equal(duty, 145_000);

  const interest = calculateInterest(duty, new Date("2025-06-15"), new Date("2026-02-24"), allQuarters);
  assert.ok(interest > 0);

  const totalRefund = duty + interest;
  assert.ok(totalRefund > 145_000 && totalRefund < 160_000);

  const elig = checkEligibility({ entryDate: new Date("2025-06-15"), entryType: "01" });
  assert.equal(elig.status, "eligible");
  assert.equal(getRoutingBucket(elig.status), "self_file");
});

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

if (failed > 0) process.exit(1);
