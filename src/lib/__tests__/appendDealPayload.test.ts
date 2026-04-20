import assert from "node:assert/strict";
import { appendDealPayload, parseDealPayloadLog } from "../appendDealPayload";

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n    ${(e as Error).message}`); }
}

console.log("appendDealPayload");

test("null existing → single-entry array", () => {
  const out = appendDealPayload(null, { method: "POST", body: '{"a":1}', ts: "2026-04-20T00:00:00.000Z" });
  const parsed = JSON.parse(out);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].method, "POST");
  assert.equal(parsed[0].body, '{"a":1}');
  assert.equal(parsed[0].ts, "2026-04-20T00:00:00.000Z");
});

test("legacy single-body string wraps + appends", () => {
  const legacy = '{"old":"body"}';
  const out = appendDealPayload(legacy, { method: "PATCH", body: '{"new":1}', ts: "2026-04-20T01:00:00.000Z" });
  const parsed = JSON.parse(out);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].ts, "1970-01-01T00:00:00.000Z"); // legacy sentinel
  assert.equal(parsed[0].body, legacy);
  assert.equal(parsed[1].method, "PATCH");
  assert.equal(parsed[1].body, '{"new":1}');
});

test("existing array appends to end", () => {
  const a = appendDealPayload(null, { method: "POST", body: "1", ts: "2026-04-20T00:00:00.000Z" });
  const b = appendDealPayload(a, { method: "PATCH", body: "2", ts: "2026-04-20T01:00:00.000Z" });
  const c = appendDealPayload(b, { method: "PATCH", body: "3", ts: "2026-04-20T02:00:00.000Z" });
  const parsed = JSON.parse(c);
  assert.equal(parsed.length, 3);
  assert.deepEqual(parsed.map((e: any) => e.body), ["1", "2", "3"]);
});

test("exceeds MAX_ENTRIES → drops oldest", () => {
  let store: string | null = null;
  for (let i = 0; i < 25; i++) {
    store = appendDealPayload(store, { method: "PATCH", body: `msg${i}`, ts: `2026-04-20T00:00:${String(i).padStart(2,"0")}.000Z` });
  }
  const parsed = JSON.parse(store!);
  assert.equal(parsed.length, 20);  // capped
  // Oldest 5 dropped — first remaining entry is msg5
  assert.equal(parsed[0].body, "msg5");
  assert.equal(parsed[19].body, "msg24");
});

test("per-body truncation at 10KB", () => {
  const huge = "x".repeat(15_000);
  const out = appendDealPayload(null, { method: "POST", body: huge });
  const parsed = JSON.parse(out);
  assert.equal(parsed[0].body.length, 10_000);
});

test("unparseable existing string treated as legacy body", () => {
  const broken = "not json at all";
  const out = appendDealPayload(broken, { method: "PATCH", body: '{"ok":true}' });
  const parsed = JSON.parse(out);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].body, broken);
});

test("parseDealPayloadLog on null returns empty array", () => {
  assert.deepEqual(parseDealPayloadLog(null), []);
});

test("parseDealPayloadLog on stored array returns entries", () => {
  const stored = appendDealPayload(null, { method: "POST", body: '{"x":1}', ts: "2026-04-20T00:00:00.000Z" });
  const evts = parseDealPayloadLog(stored);
  assert.equal(evts.length, 1);
  assert.equal(evts[0].method, "POST");
});

test("total-byte cap drops oldest until fit (large bodies)", () => {
  const bigBody = "a".repeat(9_000);
  let store: string | null = null;
  for (let i = 0; i < 10; i++) {
    store = appendDealPayload(store, { method: "PATCH", body: `${i}:${bigBody}`, ts: `2026-04-20T00:00:${String(i).padStart(2,"0")}.000Z` });
  }
  assert.ok(store!.length <= 50_000);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
