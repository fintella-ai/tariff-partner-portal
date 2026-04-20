// src/lib/__tests__/validateCallMeta.test.ts
import assert from "node:assert/strict";
import { validateCallMeta, type CallMetaInput } from "../validateCallMeta";

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n    ${(e as Error).message}`); }
}

console.log("validateCallMeta");

test("accepts minimal https url", () => {
  const r = validateCallMeta({ url: "https://zoom.us/j/12345" });
  assert.equal(r.ok, true);
});

test("rejects http url", () => {
  const r = validateCallMeta({ url: "http://zoom.us/j/12345" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /https/i);
});

test("rejects url with credentials", () => {
  const r = validateCallMeta({ url: "https://user:pass@zoom.us/j/12345" });
  assert.equal(r.ok, false);
});

test("rejects unparseable url", () => {
  const r = validateCallMeta({ url: "not a url" });
  assert.equal(r.ok, false);
});

test("accepts full metadata", () => {
  const r = validateCallMeta({
    url: "https://meet.google.com/abc-defg-hij",
    title: "Weekly sync",
    startsAt: "2026-04-22T18:00:00Z",
    durationMins: 30,
    provider: "Google Meet",
  });
  assert.equal(r.ok, true);
});

test("rejects invalid durationMins (negative)", () => {
  const r = validateCallMeta({
    url: "https://zoom.us/j/1",
    durationMins: -5,
  });
  assert.equal(r.ok, false);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
