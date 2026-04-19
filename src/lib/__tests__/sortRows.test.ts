import assert from "node:assert/strict";
import { compareRows, type SortDir } from "../sortRows";

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

function sortArr<T>(arr: T[], key: keyof T | string, dir: SortDir, accessors?: Record<string, (r: T) => unknown>): T[] {
  return [...arr].sort((a, b) => compareRows(a, b, key, dir, accessors));
}

console.log("compareRows");

test("sorts numbers ascending", () => {
  const rows = [{ n: 3 }, { n: 1 }, { n: 2 }];
  const out = sortArr(rows, "n", "asc");
  assert.deepEqual(out.map((r) => r.n), [1, 2, 3]);
});

test("sorts numbers descending", () => {
  const rows = [{ n: 3 }, { n: 1 }, { n: 2 }];
  const out = sortArr(rows, "n", "desc");
  assert.deepEqual(out.map((r) => r.n), [3, 2, 1]);
});

test("sorts ISO date strings chronologically", () => {
  const rows = [
    { d: "2026-03-05" },
    { d: "2026-01-10" },
    { d: "2026-02-20" },
  ];
  const out = sortArr(rows, "d", "asc");
  assert.deepEqual(out.map((r) => r.d), ["2026-01-10", "2026-02-20", "2026-03-05"]);
});

test("sorts strings case-insensitively via localeCompare", () => {
  const rows = [{ s: "banana" }, { s: "Apple" }, { s: "cherry" }];
  const out = sortArr(rows, "s", "asc");
  assert.deepEqual(out.map((r) => r.s), ["Apple", "banana", "cherry"]);
});

test("nulls always sort last when asc", () => {
  const rows = [{ n: 3 }, { n: null }, { n: 1 }, { n: null }];
  const out = sortArr(rows, "n", "asc");
  assert.deepEqual(out.map((r) => r.n), [1, 3, null, null]);
});

test("nulls always sort last when desc", () => {
  const rows = [{ n: 3 }, { n: null }, { n: 1 }];
  const out = sortArr(rows, "n", "desc");
  assert.deepEqual(out.map((r) => r.n), [3, 1, null]);
});

test("mixed null + string column does not throw", () => {
  const rows = [{ s: "zebra" }, { s: null }, { s: "apple" }];
  const out = sortArr(rows, "s", "asc");
  assert.deepEqual(out.map((r) => r.s), ["apple", "zebra", null]);
});

test("accessor resolves a derived column", () => {
  type Row = { source: "direct" | "downline"; l1: number; l2: number };
  const rows: Row[] = [
    { source: "direct", l1: 100, l2: 0 },
    { source: "downline", l1: 0, l2: 30 },
    { source: "direct", l1: 50, l2: 0 },
  ];
  const accessors: Record<string, (r: Row) => unknown> = {
    commission: (r) => (r.source === "direct" ? r.l1 : r.l2),
  };
  const out = sortArr(rows, "commission", "asc", accessors);
  assert.deepEqual(out.map((r) => (r.source === "direct" ? r.l1 : r.l2)), [30, 50, 100]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
