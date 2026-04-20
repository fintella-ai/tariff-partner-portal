import assert from "node:assert/strict";
import { reconcileNavOrder } from "../reconcileNavOrder";

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n    ${(e as Error).message}`); }
}

console.log("reconcileNavOrder");

const currentIds = ["partners", "deals", "communications", "partnerSupport", "settings"];

test("stale IDs in saved list are dropped", () => {
  const out = reconcileNavOrder(["partners", "workflows", "chat", "deals"], currentIds);
  assert.deepEqual(out, ["partners", "deals", "communications", "partnerSupport", "settings"]);
});

test("missing new IDs are appended to the end", () => {
  const out = reconcileNavOrder(["partners", "deals"], currentIds);
  assert.deepEqual(out, ["partners", "deals", "communications", "partnerSupport", "settings"]);
});

test("empty saved list returns full current order", () => {
  assert.deepEqual(reconcileNavOrder([], currentIds), currentIds);
});

test("perfect saved list returns unchanged", () => {
  assert.deepEqual(reconcileNavOrder(currentIds, currentIds), currentIds);
});

test("order preserved for items that exist in both", () => {
  const out = reconcileNavOrder(["settings", "deals", "partners", "zombie"], currentIds);
  assert.deepEqual(out, ["settings", "deals", "partners", "communications", "partnerSupport"]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
