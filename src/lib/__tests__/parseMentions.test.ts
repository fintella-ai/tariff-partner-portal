// src/lib/__tests__/parseMentions.test.ts
import assert from "node:assert/strict";
import { parseMentions, parseDealRefs, stripInvalidTokens } from "../parseMentions";

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n    ${(e as Error).message}`); }
}

console.log("parseMentions");

test("extracts single mention email", () => {
  const out = parseMentions("hey @[John Orlando](john@fintellaconsulting.com) take a look");
  assert.deepEqual(out, ["john@fintellaconsulting.com"]);
});

test("dedupes repeated mentions of same admin", () => {
  const out = parseMentions("@[John](j@x.com) ping @[John](j@x.com) again");
  assert.deepEqual(out, ["j@x.com"]);
});

test("returns [] when no mentions", () => {
  assert.deepEqual(parseMentions("just a plain message"), []);
});

test("parseDealRefs extracts deal IDs", () => {
  const out = parseDealRefs("see [deal:abc123] and [deal:def456]");
  assert.deepEqual(out, ["abc123", "def456"]);
});

test("stripInvalidTokens removes dangling mention for unknown email", () => {
  const out = stripInvalidTokens(
    "hey @[Bob](bob@x.com) and @[Alice](alice@x.com)",
    ["alice@x.com"],
    []
  );
  assert.equal(out, "hey Bob and @[Alice](alice@x.com)");
});

test("stripInvalidTokens removes dangling deal chip for unknown deal", () => {
  const out = stripInvalidTokens(
    "see [deal:good] and [deal:bad]",
    [],
    ["good"]
  );
  assert.equal(out, "see [deal:good] and bad");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
