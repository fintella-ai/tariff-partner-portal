// src/lib/__tests__/linkifyDeals.test.ts
import assert from "node:assert/strict";
import { linkifyDealMentions } from "../linkifyDeals";

type Deal = {
  id: string;
  dealName: string | null;
  legalEntityName: string | null;
  clientLastName: string | null;
};

const deal = (overrides: Partial<Deal> & { id: string }): Deal => ({
  dealName: null,
  legalEntityName: null,
  clientLastName: null,
  ...overrides,
});

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${(e as Error).message}`);
  }
}

console.log("linkifyDealMentions");

test("no deals → single text segment equal to input", () => {
  const out = linkifyDealMentions("hello world", []);
  assert.deepEqual(out, [{ type: "text", value: "hello world" }]);
});

test("no match → single text segment", () => {
  const deals = [deal({ id: "d1", dealName: "Acme Corp" })];
  const out = linkifyDealMentions("just saying hello", deals);
  assert.deepEqual(out, [{ type: "text", value: "just saying hello" }]);
});

test("single match by dealName produces link segment", () => {
  const deals = [deal({ id: "d1", dealName: "Acme Corp" })];
  const out = linkifyDealMentions("can you help with Acme Corp?", deals);
  assert.deepEqual(out, [
    { type: "text", value: "can you help with " },
    { type: "link", href: "/admin/deals/d1", value: "Acme Corp" },
    { type: "text", value: "?" },
  ]);
});

test("single match by legalEntityName", () => {
  const deals = [deal({ id: "d2", legalEntityName: "Northwind Industries" })];
  const out = linkifyDealMentions("Northwind Industries is stalled", deals);
  assert.deepEqual(out, [
    { type: "link", href: "/admin/deals/d2", value: "Northwind Industries" },
    { type: "text", value: " is stalled" },
  ]);
});

test("single match by clientLastName (>=4 chars)", () => {
  const deals = [deal({ id: "d3", clientLastName: "Johnson" })];
  const out = linkifyDealMentions("re: Johnson's refund", deals);
  assert.deepEqual(out, [
    { type: "text", value: "re: " },
    { type: "link", href: "/admin/deals/d3", value: "Johnson" },
    { type: "text", value: "'s refund" },
  ]);
});

test("ambiguous: two deals share clientLastName → left as text", () => {
  const deals = [
    deal({ id: "d4", clientLastName: "Johnson" }),
    deal({ id: "d5", clientLastName: "Johnson" }),
  ];
  const out = linkifyDealMentions("the Johnson deal", deals);
  assert.deepEqual(out, [{ type: "text", value: "the Johnson deal" }]);
});

test("sub-4-character fields are ignored", () => {
  const deals = [deal({ id: "d6", clientLastName: "Ng" })];
  const out = linkifyDealMentions("Ng called", deals);
  assert.deepEqual(out, [{ type: "text", value: "Ng called" }]);
});

test("regex metacharacters in dealName do not crash", () => {
  const deals = [deal({ id: "d7", dealName: "Acme (US) Corp." })];
  const out = linkifyDealMentions("update on Acme (US) Corp. please", deals);
  assert.deepEqual(out, [
    { type: "text", value: "update on " },
    { type: "link", href: "/admin/deals/d7", value: "Acme (US) Corp." },
    { type: "text", value: " please" },
  ]);
});

test("longest match wins per position (overlapping candidates)", () => {
  const deals = [
    deal({ id: "d8", dealName: "Acme" }),
    deal({ id: "d9", dealName: "Acme Corp" }),
  ];
  const out = linkifyDealMentions("Acme Corp is the client", deals);
  assert.deepEqual(out, [
    { type: "link", href: "/admin/deals/d9", value: "Acme Corp" },
    { type: "text", value: " is the client" },
  ]);
});

test("multi-line content preserves line breaks", () => {
  const deals = [deal({ id: "d10", dealName: "Globex" })];
  const out = linkifyDealMentions("line one\nGlobex deal\nline three", deals);
  assert.deepEqual(out, [
    { type: "text", value: "line one\n" },
    { type: "link", href: "/admin/deals/d10", value: "Globex" },
    { type: "text", value: " deal\nline three" },
  ]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
