// src/lib/__tests__/partnerDmGate.test.ts
import assert from "node:assert/strict";
import { canPartnersDm, canonicalizePair } from "../partnerDmGate";

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n    ${(e as Error).message}`); }
}

const mkPartner = (code: string, tier: string, ref: string | null) => ({
  partnerCode: code, tier, referredByPartnerCode: ref,
});

console.log("canPartnersDm");

test("L1 ↔ their direct L2 allowed", () => {
  const l1 = mkPartner("L1A", "l1", null);
  const l2 = mkPartner("L2A", "l2", "L1A");
  assert.equal(canPartnersDm(l1, l2), true);
  assert.equal(canPartnersDm(l2, l1), true);
});

test("L2 ↔ their direct L3 allowed", () => {
  const l2 = mkPartner("L2A", "l2", "L1A");
  const l3 = mkPartner("L3A", "l3", "L2A");
  assert.equal(canPartnersDm(l2, l3), true);
  assert.equal(canPartnersDm(l3, l2), true);
});

test("L1 ↔ L3 (skip-level) blocked", () => {
  const l1 = mkPartner("L1A", "l1", null);
  const l3 = mkPartner("L3A", "l3", "L2A");
  assert.equal(canPartnersDm(l1, l3), false);
});

test("two L2 siblings under same L1 blocked", () => {
  const l2a = mkPartner("L2A", "l2", "L1A");
  const l2b = mkPartner("L2B", "l2", "L1A");
  assert.equal(canPartnersDm(l2a, l2b), false);
});

test("non-direct L1↔L2 (different parent) blocked", () => {
  const l1a = mkPartner("L1A", "l1", null);
  const l2otherfamily = mkPartner("L2Z", "l2", "L1B");
  assert.equal(canPartnersDm(l1a, l2otherfamily), false);
});

test("self-DM blocked", () => {
  const p = mkPartner("L2A", "l2", "L1A");
  assert.equal(canPartnersDm(p, p), false);
});

test("two L1s blocked", () => {
  const a = mkPartner("L1A", "l1", null);
  const b = mkPartner("L1B", "l1", null);
  assert.equal(canPartnersDm(a, b), false);
});

test("two L3s blocked", () => {
  const a = mkPartner("L3A", "l3", "L2A");
  const b = mkPartner("L3B", "l3", "L2A");
  assert.equal(canPartnersDm(a, b), false);
});

console.log("\ncanonicalizePair");

test("sorts alphabetically", () => {
  assert.deepEqual(canonicalizePair("ZZZ", "AAA"), ["AAA", "ZZZ"]);
  assert.deepEqual(canonicalizePair("AAA", "ZZZ"), ["AAA", "ZZZ"]);
});

test("identical codes return null (self-dm rejected)", () => {
  assert.equal(canonicalizePair("SAME", "SAME"), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
