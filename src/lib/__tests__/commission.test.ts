// src/lib/__tests__/commission.test.ts
import assert from "node:assert/strict";
import { calcWaterfallCommissions, buildLedgerEntries, type PartnerChainNode } from "../commission";

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n    ${(e as Error).message}`); }
}

const FEE = 10000; // $10,000 firm fee — convenient for integer math at these rates

const l1 = (code = "L1A", rate = 0.25): PartnerChainNode => ({ partnerCode: code, tier: "l1", commissionRate: rate });
const l2 = (code = "L2A", rate = 0.20): PartnerChainNode => ({ partnerCode: code, tier: "l2", commissionRate: rate });
const l3 = (code = "L3A", rate = 0.10): PartnerChainNode => ({ partnerCode: code, tier: "l3", commissionRate: rate });

console.log("buildLedgerEntries — Enabled mode (waterfall passes through)");

test("L1 direct deal, Enabled → 1 row (L1 full rate)", () => {
  const chain = [l1()];
  const wf = calcWaterfallCommissions(FEE, chain);
  const entries = buildLedgerEntries(wf, chain, { payoutDownlineEnabled: true });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].tier, "l1");
  assert.equal(entries[0].partnerCode, "L1A");
  assert.equal(entries[0].amount, 2500);
});

test("L2 deal, Enabled → 2 rows (L2 + L1 override)", () => {
  const chain = [l2(), l1()];
  const wf = calcWaterfallCommissions(FEE, chain);
  const entries = buildLedgerEntries(wf, chain, { payoutDownlineEnabled: true });
  assert.equal(entries.length, 2);
  const byTier = Object.fromEntries(entries.map(e => [e.tier, e]));
  assert.equal(byTier.l2.amount, 2000);
  assert.equal(byTier.l1.amount, 500);
});

test("L3 deal, Enabled → 3 rows (L3 + L2 override + L1 override)", () => {
  const chain = [l3(), l2(), l1()];
  const wf = calcWaterfallCommissions(FEE, chain);
  const entries = buildLedgerEntries(wf, chain, { payoutDownlineEnabled: true });
  assert.equal(entries.length, 3);
  const byTier = Object.fromEntries(entries.map(e => [e.tier, e]));
  assert.equal(byTier.l3.amount, 1000);
  assert.equal(byTier.l2.amount, 1000);
  assert.equal(byTier.l1.amount, 500);
});

console.log("buildLedgerEntries — Disabled mode (collapse to single L1 row)");

test("L1 direct deal, Disabled → 1 row (L1 full rate, unchanged)", () => {
  const chain = [l1()];
  const wf = calcWaterfallCommissions(FEE, chain);
  const entries = buildLedgerEntries(wf, chain, { payoutDownlineEnabled: false });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].tier, "l1");
  assert.equal(entries[0].amount, 2500);
});

test("L2 deal, Disabled → 1 row (L1 at full L1 rate, not the override)", () => {
  const chain = [l2(), l1()];
  const wf = calcWaterfallCommissions(FEE, chain);
  const entries = buildLedgerEntries(wf, chain, { payoutDownlineEnabled: false });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].tier, "l1");
  assert.equal(entries[0].partnerCode, "L1A");
  assert.equal(entries[0].amount, 2500);
});

test("L3 deal, Disabled → 1 row (L1 at full L1 rate)", () => {
  const chain = [l3(), l2(), l1()];
  const wf = calcWaterfallCommissions(FEE, chain);
  const entries = buildLedgerEntries(wf, chain, { payoutDownlineEnabled: false });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].tier, "l1");
  assert.equal(entries[0].amount, 2500);
});

test("L2 deal, Disabled, L1 rate 15% (not max) → 1 row at 1500", () => {
  const chain = [l2("L2A", 0.10), l1("L1A", 0.15)];
  const wf = calcWaterfallCommissions(FEE, chain);
  const entries = buildLedgerEntries(wf, chain, { payoutDownlineEnabled: false });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].amount, 1500);
});

test("L2 deal, zero firm fee → 0 rows either way", () => {
  const chain = [l2(), l1()];
  const zeroWf = calcWaterfallCommissions(0, chain);
  assert.equal(buildLedgerEntries(zeroWf, chain, { payoutDownlineEnabled: true }).length, 0);
  assert.equal(buildLedgerEntries(zeroWf, chain, { payoutDownlineEnabled: false }).length, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
