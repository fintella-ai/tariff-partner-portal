# Payout Downline Partners — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-L1-partner `payoutDownlineEnabled` toggle that switches Fintella between two commission-payout models: Enabled (Fintella pays L2/L3 directly, auto-dispatches SignWell at signup) and Disabled, default (Fintella pays L1 the full L1 rate for every deal in their subtree; L1 pays their own downline).

**Architecture:** Additive DB migration (two new Boolean columns, both default false). Checkbox at invite + add-directly admin surfaces, role-gated to super_admin/admin/partner_support. Commission engine in `src/lib/commission.ts` gains a pure helper that collapses the waterfall to a single L1-full-rate row when the top-of-chain L1 is Disabled. Signup flow auto-sends Fintella SignWell to L2/L3 when the top-of-chain L1 is Enabled, using the existing rate-matched templates. Admin profile surfaces the state read-only. Partner Reporting surface adds an Enabled badge, a Disabled "Downline Accounting" subsection, and a "paid by upline" empty-state note for L2/L3 under Disabled L1s.

**Tech Stack:** Next.js 14 (App Router) · React 18 · TypeScript · Prisma 5.20 · Neon Postgres · NextAuth.js · SignWell REST API.

**Spec:** `docs/superpowers/specs/2026-04-22-payout-downline-partners-design.md`

---

## Pre-flight

- [ ] **Read the spec first.** Open `docs/superpowers/specs/2026-04-22-payout-downline-partners-design.md` end-to-end. Every decision below traces back to a section in the spec.
- [ ] **Checkout a feature branch off main.**

```bash
cd ~/tariff-partner-portal-phase12
git checkout main && git pull --ff-only
git checkout -b claude/payout-downline-impl
```

- [ ] **Confirm dev server starts and build is green on main before touching anything.**

```bash
./node_modules/.bin/next build 2>&1 | tail -15
```

Expected: `✓ Compiled successfully` and `Generating static pages (152/152)`. If not, stop and investigate — don't start work on a broken baseline.

---

## Task 1: Schema + migration

**Why:** Add the `payoutDownlineEnabled` column to `Partner` and `Invite`. Additive, default `false`, no backfill. Spec §3.

**Files:**
- Modify: `prisma/schema.prisma` (around the existing `Partner` model definition + the `Invite` model)

- [ ] **Step 1.1: Add the column to `Partner`**

Open `prisma/schema.prisma`, find the `model Partner { … }` block. Near the `l3Enabled` line, add:

```prisma
payoutDownlineEnabled Boolean @default(false)
```

- [ ] **Step 1.2: Add the column to `Invite`**

Find the `model Invite { … }` block. Add:

```prisma
payoutDownlineEnabled Boolean @default(false)
```

- [ ] **Step 1.3: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected output includes `✔ Generated Prisma Client (…)`.

- [ ] **Step 1.4: Push schema to the Neon dev branch**

```bash
npx prisma db push --accept-data-loss
```

Expected output includes `Your database is now in sync with your Prisma schema.` The `--accept-data-loss` flag is required by the build script but this change is purely additive — no data loss will actually happen. CLAUDE.md confirms this is safe for strictly-additive changes.

- [ ] **Step 1.5: Verify existing rows picked up the default**

```bash
npx prisma studio
```

Navigate to `Partner` table, confirm the new `payoutDownlineEnabled` column is present on all 4 existing rows and set to `false`. Close Studio (Ctrl+C in terminal).

- [ ] **Step 1.6: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): add payoutDownlineEnabled to Partner + Invite"
```

---

## Task 2: Extend `POST /api/admin/invites` to accept the flag

**Why:** Captures the admin's choice when sending an invite. Persist on `Invite` row. Role-gate: reject `true` from `accounting`. Spec §4.

**Files:**
- Modify: `src/app/api/admin/invites/route.ts`

- [ ] **Step 2.1: Read the current invite route to understand the shape**

Open `src/app/api/admin/invites/route.ts`. Locate the `POST` handler. Identify: how it reads the body, how it writes to `Invite`, what fields are currently accepted. Note the role check pattern (there should be one — this is a gated admin route).

- [ ] **Step 2.2: Parse `payoutDownlineEnabled` from the body**

In the POST handler, after the existing body parse, add:

```ts
const payoutDownlineEnabled = body.payoutDownlineEnabled === true;
```

Coerce non-true values to `false` defensively — don't trust the client to send a boolean.

- [ ] **Step 2.3: Role-gate the true case**

Immediately after parsing, add:

```ts
// Spec §4: accounting can send invites but cannot commit Fintella
// to new downline payout obligations. Reject the true flag from that role.
const role = (session.user as any).role;
if (payoutDownlineEnabled && role === "accounting") {
  return NextResponse.json(
    { error: "accounting role cannot enable Payout Downline Partners on invites" },
    { status: 403 }
  );
}
```

Place this BEFORE any Prisma writes.

- [ ] **Step 2.4: Persist on the Invite row**

Find the `prisma.invite.create({ data: { … } })` call (or equivalent). Add `payoutDownlineEnabled` to the `data` object:

```ts
const invite = await prisma.invite.create({
  data: {
    // …existing fields…
    payoutDownlineEnabled,
  },
});
```

- [ ] **Step 2.5: Manual verification via curl**

Start the dev server in a separate terminal:

```bash
npm run dev
```

From another terminal, log into the admin UI as `admin@fintella.partners` in a browser and copy the session cookie. Use it to hit the invite route directly:

```bash
curl -X POST http://localhost:3000/api/admin/invites \
  -H "Cookie: <paste session cookie here>" \
  -H "Content-Type: application/json" \
  -d '{"email":"test-invite-1@example.com","commissionRate":0.25,"payoutDownlineEnabled":true}'
```

Expected: 200 with an invite object. Open Prisma Studio → `Invite` table → confirm the new row has `payoutDownlineEnabled: true`.

- [ ] **Step 2.6: Manual verification of the 403 path**

Temporarily switch the session role to `accounting` (either log in as an accounting user, or fake the role on a scratch user). Hit the same endpoint with `payoutDownlineEnabled: true`. Expected: 403 with the error message.

Revert any test data from Prisma Studio.

- [ ] **Step 2.7: Commit**

```bash
git add src/app/api/admin/invites/route.ts
git commit -m "feat(invites): accept payoutDownlineEnabled, role-gate accounting"
```

---

## Task 3: Extend `POST /api/admin/partners` (Add Directly) to accept the flag

**Why:** Add-directly flow also needs to write the flag, with the same role gate AND a silent coerce for non-L1 tiers. Spec §3, §4.

**Files:**
- Modify: `src/app/api/admin/partners/route.ts`

- [ ] **Step 3.1: Read current route**

Open `src/app/api/admin/partners/route.ts`. Locate the `POST` handler (around lines 83-143 per the explore). Understand: body shape, tier handling, how Partner is created.

- [ ] **Step 3.2: Parse and coerce the flag**

In the POST handler, after existing body parsing, add:

```ts
// Spec §3: non-L1 partners never carry this flag. Silently coerce
// to false if admin somehow sends true for an L2/L3.
const rawFlag = body.payoutDownlineEnabled === true;
const tierLower = String(body.tier || "").toLowerCase();
const payoutDownlineEnabled = rawFlag && tierLower === "l1";
```

- [ ] **Step 3.3: Role-gate the true case**

After the coerce, add:

```ts
const role = (session.user as any).role;
if (payoutDownlineEnabled && role === "accounting") {
  return NextResponse.json(
    { error: "accounting role cannot enable Payout Downline Partners" },
    { status: 403 }
  );
}
```

- [ ] **Step 3.4: Persist on the Partner row**

Find the `prisma.partner.create(…)` call. Add to its `data`:

```ts
payoutDownlineEnabled,
```

- [ ] **Step 3.5: Manual verification**

With the dev server running, use curl or the Add Directly UI once Task 5 lands:

```bash
curl -X POST http://localhost:3000/api/admin/partners \
  -H "Cookie: <session cookie>" \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Test","lastName":"L1Enabled","email":"test-l1-enabled@example.com","tier":"L1","commissionRate":0.25,"payoutDownlineEnabled":true}'
```

Confirm in Prisma Studio: partner exists with `payoutDownlineEnabled: true`. Then try with `"tier":"L2"` and same flag value `true` — confirm partner is created with `payoutDownlineEnabled: false` (silent coerce).

Revert test partners from Prisma Studio.

- [ ] **Step 3.6: Commit**

```bash
git add src/app/api/admin/partners/route.ts
git commit -m "feat(partners): accept payoutDownlineEnabled on add-directly, coerce non-L1"
```

---

## Task 4: Signup flow — carry Invite flag onto Partner row

**Why:** When an invited L1 completes signup, the Partner row inherits the admin's intended state. Spec §3.

**Files:**
- Modify: `src/app/api/signup/route.ts`

- [ ] **Step 4.1: Locate the Partner create**

Open `src/app/api/signup/route.ts`. Find the block that reads the `Invite` row (around lines 99-118 per the explore) and creates the `Partner`. Identify where `tier: invite.targetTier` is set.

- [ ] **Step 4.2: Pass the flag through**

In the `prisma.partner.create({ data: { … } })` call, add:

```ts
// Spec §3: invite carries the admin's intent forward to the Partner row.
// Only meaningful for L1s but we always copy; the add-directly route
// separately coerces for non-L1s.
payoutDownlineEnabled: invite.payoutDownlineEnabled,
```

- [ ] **Step 4.3: Build + typecheck**

```bash
./node_modules/.bin/next build 2>&1 | tail -15
```

Expected: compiled successfully. If TypeScript complains about `invite.payoutDownlineEnabled` not existing, re-run `npx prisma generate` (Task 1 regenerates types but a previous lingering build cache may not see them).

- [ ] **Step 4.4: Commit**

```bash
git add src/app/api/signup/route.ts
git commit -m "feat(signup): propagate Invite.payoutDownlineEnabled to Partner row"
```

---

## Task 5: Commission engine — extract pure helper `buildLedgerEntries`

**Why:** Make the "collapse to single L1 row in Disabled mode" branch a pure, testable function. Spec §6.

**Files:**
- Modify: `src/lib/commission.ts`
- Create: `src/lib/__tests__/commission.test.ts`

- [ ] **Step 5.1: Write the failing test file**

Create `src/lib/__tests__/commission.test.ts` with the inline test-runner pattern (mirrors `partnerDmGate.test.ts`):

```ts
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
```

- [ ] **Step 5.2: Run the test and confirm it fails**

```bash
npx ts-node --compiler-options '{"module":"commonjs"}' src/lib/__tests__/commission.test.ts
```

Expected: fails at the import because `buildLedgerEntries` isn't exported yet. Error: `Module '"../commission"' has no exported member 'buildLedgerEntries'`.

- [ ] **Step 5.3: Implement `buildLedgerEntries`**

Open `src/lib/commission.ts`. At the end of the file (after `computeDealCommissions`), add:

```ts
// ─── Ledger Entry Builder ────────────────────────────────────────────────
// Pure function that decides which ledger rows to write for a deal, based
// on the waterfall result + chain + the top-of-chain L1's payout-downline
// setting. Keeps the Enabled/Disabled branch out of computeDealCommissions
// so we can unit-test it in isolation. Spec §6.

export interface BuildLedgerOptions {
  payoutDownlineEnabled: boolean;
}

export function buildLedgerEntries(
  waterfall: WaterfallResult,
  chain: PartnerChainNode[],
  options: BuildLedgerOptions
): ComputedLedgerEntry[] {
  const l1Node = chain.find((n) => n.tier === "l1");
  const l2Node = chain.find((n) => n.tier === "l2");
  const l3Node = chain.find((n) => n.tier === "l3");
  const submitter = chain[0];

  // Zero firm fee → no entries regardless of mode.
  if ((waterfall.l1Amount + waterfall.l2Amount + waterfall.l3Amount) === 0) {
    return [];
  }

  // Disabled mode: when an L2 or L3 deal runs under a Disabled L1, collapse
  // to a single L1 row at the FULL L1 rate. The waterfall amounts always
  // sum to L1's full assigned rate × firm fee (see calcWaterfallCommissions
  // at lines 56-88 — totalRate is always set to the L1's own rate), so
  // summing them gives us exactly the amount Fintella owes the L1.
  // L1-direct deals already emit a single L1 row at full rate in both
  // modes, so we pass them through unchanged.
  const isDownlineDeal = submitter && submitter.tier !== "l1";
  if (!options.payoutDownlineEnabled && isDownlineDeal && l1Node) {
    const sum = waterfall.l1Amount + waterfall.l2Amount + waterfall.l3Amount;
    return [{ partnerCode: l1Node.partnerCode, tier: "l1", amount: sum }];
  }

  // Enabled mode OR L1-direct deal: emit per-tier entries as before.
  const entries: ComputedLedgerEntry[] = [];
  if (l1Node && waterfall.l1Amount > 0) {
    entries.push({ partnerCode: l1Node.partnerCode, tier: "l1", amount: waterfall.l1Amount });
  }
  if (l2Node && waterfall.l2Amount > 0) {
    entries.push({ partnerCode: l2Node.partnerCode, tier: "l2", amount: waterfall.l2Amount });
  }
  if (l3Node && waterfall.l3Amount > 0) {
    entries.push({ partnerCode: l3Node.partnerCode, tier: "l3", amount: waterfall.l3Amount });
  }
  return entries;
}
```

- [ ] **Step 5.4: Run the tests and confirm they pass**

```bash
npx ts-node --compiler-options '{"module":"commonjs"}' src/lib/__tests__/commission.test.ts
```

Expected: `8 passed, 0 failed`.

- [ ] **Step 5.5: Commit**

```bash
git add src/lib/commission.ts src/lib/__tests__/commission.test.ts
git commit -m "feat(commission): add buildLedgerEntries pure helper with Disabled-mode collapse"
```

---

## Task 6: Wire `buildLedgerEntries` into `computeDealCommissions`

**Why:** Route live deal-closing through the new helper. Fetch the top-of-chain L1's flag as part of the chain walk. Spec §6.

**Files:**
- Modify: `src/lib/commission.ts`

- [ ] **Step 6.1: Extend the chain walk to capture the L1's flag**

Open `src/lib/commission.ts`. Find `computeDealCommissions` (around line 187). Inside the function, after the chain is built but before `calcWaterfallCommissions` is called, fetch the L1's `payoutDownlineEnabled`.

The existing chain-walk already loads the L1 via `db.partner.findUnique`. We need to include the new field in the `select`. Update each `findUnique` that targets the L1 — for L2 deals at line 232-234, and for L3 deals at lines 219-221 — to explicitly select `payoutDownlineEnabled`. (Or just drop the `select` clause entirely and let Prisma return the full row — either is fine. The full-row approach is simpler.)

Replace the existing `const l1 = await db.partner.findUnique({ where: { partnerCode: … } })` calls to drop their `select` if present, so `l1.payoutDownlineEnabled` is available.

For the L1-direct case (`submitter.tier === "l1"`), the flag is already on `submitter` — that was loaded on line 195-197 without a `select`, so `submitter.payoutDownlineEnabled` is already available.

- [ ] **Step 6.2: Resolve the effective `payoutDownlineEnabled`**

After the chain is built, determine the top-of-chain L1's flag:

```ts
// Determine the top-of-chain L1's payout-downline setting. For L1-direct
// deals, that's the submitter. For L2/L3 deals, it's the L1 we walked up
// to. Default to false (Disabled — safer) if we couldn't resolve the L1.
let payoutDownlineEnabled = false;
if (submitter.tier === "l1") {
  payoutDownlineEnabled = submitter.payoutDownlineEnabled ?? false;
} else {
  const l1Partner = submitter.tier === "l2"
    ? await db.partner.findUnique({ where: { partnerCode: submitter.referredByPartnerCode ?? "" } })
    : null;
  if (l1Partner?.tier === "l1") {
    payoutDownlineEnabled = l1Partner.payoutDownlineEnabled ?? false;
  } else if (submitter.tier === "l3" && submitter.referredByPartnerCode) {
    const l2Partner = await db.partner.findUnique({ where: { partnerCode: submitter.referredByPartnerCode } });
    if (l2Partner?.referredByPartnerCode) {
      const l1ForL3 = await db.partner.findUnique({ where: { partnerCode: l2Partner.referredByPartnerCode } });
      payoutDownlineEnabled = l1ForL3?.payoutDownlineEnabled ?? false;
    }
  }
}
```

**However** — that duplicates the chain-walk we already did. Better: reuse the chain we just built. Here's the clean version, placed AFTER the existing chain-building block but BEFORE the `const waterfall = calcWaterfallCommissions(...)` line:

```ts
// Spec §6: resolve the top-of-chain L1's payoutDownlineEnabled from the
// already-walked chain. Default to false if chain is incomplete.
let payoutDownlineEnabled = false;
if (submitter.tier === "l1") {
  payoutDownlineEnabled = (submitter as any).payoutDownlineEnabled ?? false;
} else {
  // Re-fetch the L1 with the full row to get the flag, since chain
  // only holds partnerCode/tier/commissionRate. Cheap: one extra query.
  const l1Node = chain.find((n) => n.tier === "l1");
  if (l1Node) {
    const l1Partner = await db.partner.findUnique({
      where: { partnerCode: l1Node.partnerCode },
      select: { payoutDownlineEnabled: true },
    });
    payoutDownlineEnabled = l1Partner?.payoutDownlineEnabled ?? false;
  }
}
```

Simpler approach — just one extra query keyed by the `l1Node.partnerCode` we already resolved. Use this version.

- [ ] **Step 6.3: Replace the inline entry-building with `buildLedgerEntries`**

Find the existing block (lines 246-258) that manually pushes entries:

```ts
const entries: ComputedLedgerEntry[] = [];
const l1Node = chain.find((n) => n.tier === "l1");
const l2Node = chain.find((n) => n.tier === "l2");
const l3Node = chain.find((n) => n.tier === "l3");
if (l1Node && waterfall.l1Amount > 0) { … }
if (l2Node && waterfall.l2Amount > 0) { … }
if (l3Node && waterfall.l3Amount > 0) { … }
```

Replace it with:

```ts
const entries = buildLedgerEntries(waterfall, chain, { payoutDownlineEnabled });
```

Keep the `const totalAmount = entries.reduce(…)` line below — it still works.

- [ ] **Step 6.4: Build and typecheck**

```bash
./node_modules/.bin/next build 2>&1 | tail -15
```

Expected: compiled successfully.

- [ ] **Step 6.5: Re-run the unit tests to make sure we didn't break them**

```bash
npx ts-node --compiler-options '{"module":"commonjs"}' src/lib/__tests__/commission.test.ts
```

Expected: `8 passed, 0 failed`. (These test `buildLedgerEntries` directly — they're independent of `computeDealCommissions` — but running them again as a sanity check costs nothing.)

- [ ] **Step 6.6: Commit**

```bash
git add src/lib/commission.ts
git commit -m "feat(commission): route computeDealCommissions through buildLedgerEntries"
```

---

## Task 7: Signup flow — auto-dispatch SignWell for Enabled L2/L3

**Why:** When an L2 or L3 signs up under an Enabled L1, Fintella sends them the rate-matched SignWell agreement at signup instead of waiting for L1 to upload a PDF. Spec §5.

**Files:**
- Modify: `src/app/api/signup/route.ts`

- [ ] **Step 7.1: Read the current signup route + the existing admin agreement send path**

Open `src/app/api/signup/route.ts` — study lines 99-118 (Partner creation) and lines 134-136 (the explicit "L2/L3 do NOT receive SignWell agreements" comment). That comment is about to become conditional.

Then open `src/app/api/admin/agreement/[partnerCode]/route.ts` — study how it calls `resolveAgreementTemplateId`, constructs the template context via `buildPartnerTemplateFields`, and calls `sendForSigning` (around lines 143-195 per the grep). The L2/L3 signup auto-send will reuse the same three calls.

- [ ] **Step 7.2: Resolve the top-of-chain L1 in the signup flow**

In `src/app/api/signup/route.ts`, AFTER the Partner row is created (so we know its tier and referrer), BEFORE returning the success response, add a helper block:

```ts
// Spec §5: auto-dispatch Fintella SignWell for L2/L3 under an Enabled L1.
// Walk to the top-of-chain L1 and check the flag. No-op for L1 partners
// (they already have their own SignWell flow), and no-op when the L1 is
// Disabled (current behavior — L1 uploads a signed PDF later).
async function resolveTopL1ForNewPartner(
  newPartner: { tier: string; referredByPartnerCode: string | null }
): Promise<{ partnerCode: string; payoutDownlineEnabled: boolean } | null> {
  if (newPartner.tier === "l1" || !newPartner.referredByPartnerCode) return null;

  if (newPartner.tier === "l2") {
    const l1 = await prisma.partner.findUnique({
      where: { partnerCode: newPartner.referredByPartnerCode },
      select: { partnerCode: true, tier: true, payoutDownlineEnabled: true },
    });
    if (l1?.tier === "l1") return l1;
    return null;
  }

  if (newPartner.tier === "l3") {
    const l2 = await prisma.partner.findUnique({
      where: { partnerCode: newPartner.referredByPartnerCode },
      select: { referredByPartnerCode: true },
    });
    if (!l2?.referredByPartnerCode) return null;
    const l1 = await prisma.partner.findUnique({
      where: { partnerCode: l2.referredByPartnerCode },
      select: { partnerCode: true, tier: true, payoutDownlineEnabled: true },
    });
    if (l1?.tier === "l1") return l1;
    return null;
  }

  return null;
}
```

Define this helper at the top of the file (after imports, before the POST handler) OR inline inside the POST handler — both work. The file-top location is cleaner.

- [ ] **Step 7.3: Call the helper + branch on the flag**

Inside the POST handler, right after the Partner row is created (`const partner = await prisma.partner.create(…)`), add:

```ts
// Spec §5: if the new partner is an L2 or L3 under an Enabled L1,
// auto-dispatch Fintella SignWell now. If the L1 is Disabled, stay
// with the legacy behavior (no auto-send; L1 uploads a PDF later).
if (partner.tier !== "l1") {
  const topL1 = await resolveTopL1ForNewPartner(partner);
  if (topL1?.payoutDownlineEnabled) {
    try {
      await sendFintellaAgreementForPartner(partner);
    } catch (err) {
      // Don't fail the signup if SignWell hiccups. The Partner row exists;
      // an admin can retry the send from the existing admin agreement
      // surface. Log for observability.
      console.error("[signup] Enabled-mode SignWell auto-dispatch failed", { partnerCode: partner.partnerCode, err });
    }
  }
}
```

- [ ] **Step 7.4: Implement `sendFintellaAgreementForPartner`**

At the top of `src/app/api/signup/route.ts` (or extract to a new helper file — your call), add:

```ts
import { sendForSigning, resolveAgreementTemplateId, buildPartnerTemplateFields } from "@/lib/signwell";

async function sendFintellaAgreementForPartner(partner: {
  partnerCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  commissionRate: number;
  tier: string;
}): Promise<void> {
  const settings = await prisma.portalSettings.findFirst();
  if (!settings) throw new Error("PortalSettings missing");

  const { templateId, templateRate } = resolveAgreementTemplateId(
    partner.commissionRate,
    settings
  );

  const fields = buildPartnerTemplateFields({
    firstName: partner.firstName,
    lastName: partner.lastName,
    email: partner.email,
    phone: partner.phone ?? "",
    commissionRate: templateRate,
    partnerCode: partner.partnerCode,
  });

  const { documentId, cosignerSigningUrl } = await sendForSigning({
    templateId,
    partnerEmail: partner.email,
    partnerName: `${partner.firstName} ${partner.lastName}`.trim(),
    fintellaSignerEmail: settings.fintellaSignerEmail ?? "",
    fintellaSignerName: settings.fintellaSignerName ?? "",
    fields,
  });

  await prisma.partnershipAgreement.create({
    data: {
      partnerCode: partner.partnerCode,
      signWellDocumentId: documentId,
      status: "sent",
      templateId,
      commissionRate: templateRate,
      cosignerSigningUrl: cosignerSigningUrl ?? null,
    },
  });
}
```

**Important:** this must match the exact field shape used by the existing admin agreement send at `src/app/api/admin/agreement/[partnerCode]/route.ts:143-195`. If your code compiles but the SignWell API rejects the request with a 422, open that admin route and compare the `sendForSigning` call arguments — the wiring must be identical, especially around `fintellaSignerEmail` / `fintellaSignerName` (required per the `feedback_signwell_cosigner_required` memory — missing fields cause 422s).

- [ ] **Step 7.5: Build + typecheck**

```bash
./node_modules/.bin/next build 2>&1 | tail -15
```

Expected: compiled successfully. Fix any TypeScript mismatches against the actual `sendForSigning` / `buildPartnerTemplateFields` / `resolveAgreementTemplateId` signatures — those are in `src/lib/signwell.ts:112-214`.

- [ ] **Step 7.6: Commit**

```bash
git add src/app/api/signup/route.ts
git commit -m "feat(signup): auto-send Fintella SignWell for L2/L3 under Enabled L1"
```

---

## Task 8: Invite Partner modal — add checkbox

**Why:** Admin UI entry point for the toggle. Role-gated client-side. Spec §4.

**Files:**
- Modify: `src/app/(admin)/admin/partners/page.tsx`

- [ ] **Step 8.1: Find the Invite Partner modal state + JSX**

Open `src/app/(admin)/admin/partners/page.tsx`. Locate the Invite Partner modal (around lines 391-486 per the explore). Identify:
- The local state hooks for the form (`inviteEmail`, `inviteRate`, etc.)
- The JSX block rendering the form fields
- The submit handler that POSTs to `/api/admin/invites`

- [ ] **Step 8.2: Add local state for the checkbox**

Near the other invite form state hooks:

```tsx
const [invitePayoutDownlineEnabled, setInvitePayoutDownlineEnabled] = useState(false);
```

- [ ] **Step 8.3: Compute the role gate**

Near the top of the component:

```tsx
const { data: session } = useSession();
const myRole = (session?.user as any)?.role;
const canSetPayoutDownline = myRole && ["super_admin", "admin", "partner_support"].includes(myRole);
```

(If `useSession` is already imported and/or `myRole` already exists, reuse the existing hook — don't duplicate.)

- [ ] **Step 8.4: Render the checkbox in the Invite modal JSX**

Inside the Invite modal, after the commission-rate helper text, insert:

```tsx
{canSetPayoutDownline && (
  <div className="mt-3 flex items-start gap-2">
    <input
      type="checkbox"
      id="invitePayoutDownline"
      checked={invitePayoutDownlineEnabled}
      onChange={(e) => setInvitePayoutDownlineEnabled(e.target.checked)}
      className="mt-1 h-4 w-4 rounded border-[var(--app-border)] bg-[var(--app-input-bg)] accent-brand-gold cursor-pointer"
    />
    <label htmlFor="invitePayoutDownline" className="font-body text-[12px] text-[var(--app-text-secondary)] cursor-pointer">
      <span className="font-semibold">Enable Payout Downline Partners</span>
      <span className="block text-[11px] text-[var(--app-text-muted)] mt-0.5">
        If enabled, Fintella sends SignWell agreements directly to this L1's L2 and L3 downline at signup and pays them commissions directly. If disabled (default), this L1 is paid the full commission rate for all downline deals and is responsible for paying their downline themselves.
      </span>
    </label>
  </div>
)}
```

Match the styling of nearby form elements — if the surrounding inputs use different classes, align to those. The exact Tailwind classes matter less than consistency with the existing form.

- [ ] **Step 8.5: Pass the flag through the submit handler**

Find the submit handler for the Invite modal — likely an async function that does `fetch("/api/admin/invites", { method: "POST", body: JSON.stringify({ … }) })`. Add `payoutDownlineEnabled: invitePayoutDownlineEnabled` to the body:

```ts
body: JSON.stringify({
  email: inviteEmail,
  commissionRate: inviteRate,
  firstName: inviteFirstName,
  lastName: inviteLastName,
  payoutDownlineEnabled: invitePayoutDownlineEnabled,  // ← add this
}),
```

- [ ] **Step 8.6: Reset the checkbox on modal close / success**

Where the other invite form fields get reset (on success or cancel), add:

```ts
setInvitePayoutDownlineEnabled(false);
```

- [ ] **Step 8.7: Manual check in the browser**

```bash
npm run dev
```

Open `http://localhost:3000/admin/partners` as `admin@fintella.partners`. Click **+ INVITE PARTNER**. Confirm the checkbox is visible, unchecked by default, the label wraps properly. Toggle it, submit a test invite, then in Prisma Studio confirm the new `Invite` row has `payoutDownlineEnabled: true`.

Log in as an `accounting` user (or temporarily set a scratch user's role to `accounting` in DB), reload, open the same modal — confirm the checkbox is NOT rendered.

- [ ] **Step 8.8: Commit**

```bash
git add "src/app/(admin)/admin/partners/page.tsx"
git commit -m "feat(admin/invite): add Payout Downline Partners checkbox"
```

---

## Task 9: Add Directly form — add checkbox

**Why:** Same pattern as Task 8 but for the Add Directly flow, with an extra visibility rule: hidden unless Tier = L1. Spec §4.

**Files:**
- Modify: `src/app/(admin)/admin/partners/page.tsx`

- [ ] **Step 9.1: Find the Add Directly form JSX and state**

In the same file, locate the Add Directly form (around lines 488-550 per the explore). Identify the tier select, commission rate select, and the submit handler that POSTs to `/api/admin/partners`.

- [ ] **Step 9.2: Add state**

Near other Add Directly state hooks:

```tsx
const [addPayoutDownlineEnabled, setAddPayoutDownlineEnabled] = useState(false);
```

- [ ] **Step 9.3: Render the checkbox, gated on role AND tier === "L1"**

After the Tier select and Commission rate select in the Add Directly form JSX:

```tsx
{canSetPayoutDownline && addTier === "L1" && (
  <div className="mt-3 flex items-start gap-2">
    <input
      type="checkbox"
      id="addPayoutDownline"
      checked={addPayoutDownlineEnabled}
      onChange={(e) => setAddPayoutDownlineEnabled(e.target.checked)}
      className="mt-1 h-4 w-4 rounded border-[var(--app-border)] bg-[var(--app-input-bg)] accent-brand-gold cursor-pointer"
    />
    <label htmlFor="addPayoutDownline" className="font-body text-[12px] text-[var(--app-text-secondary)] cursor-pointer">
      <span className="font-semibold">Enable Payout Downline Partners</span>
      <span className="block text-[11px] text-[var(--app-text-muted)] mt-0.5">
        If enabled, Fintella sends SignWell agreements directly to this L1's L2 and L3 downline at signup and pays them commissions directly. If disabled (default), this L1 is paid the full commission rate for all downline deals and is responsible for paying their downline themselves.
      </span>
    </label>
  </div>
)}
```

(`addTier` should already exist as the state variable backing the Tier dropdown — reuse whatever it's actually called in your code.)

- [ ] **Step 9.4: Auto-uncheck when tier switches away from L1**

In the tier-select onChange handler, add:

```ts
if (newTier !== "L1") setAddPayoutDownlineEnabled(false);
```

Prevents accidentally submitting a hidden-but-true value if the admin flipped from L1 → L2 after checking the box.

- [ ] **Step 9.5: Pass through submit**

In the Add Directly submit handler, add to the POST body:

```ts
payoutDownlineEnabled: addPayoutDownlineEnabled,
```

- [ ] **Step 9.6: Reset on close / success**

Where the form fields get reset:

```ts
setAddPayoutDownlineEnabled(false);
```

- [ ] **Step 9.7: Manual browser check**

Reload `/admin/partners`. Click **+ ADD DIRECTLY**. With Tier = L1, confirm the checkbox renders. Switch tier to L2, confirm it disappears. Back to L1, confirm it returns. Submit a new L1 partner with the box checked → Prisma Studio confirms `payoutDownlineEnabled: true` on the new Partner row.

- [ ] **Step 9.8: Commit**

```bash
git add "src/app/(admin)/admin/partners/page.tsx"
git commit -m "feat(admin/add-directly): add Payout Downline Partners checkbox (L1 only)"
```

---

## Task 10: Admin partner profile — Commission tab state row

**Why:** Show the flag value read-only on the L1's profile. Spec §7.

**Files:**
- Modify: `src/app/(admin)/admin/partners/[id]/page.tsx`
- Modify: `src/app/api/admin/partners/[id]/route.ts` (ensure the flag is in the GET response)

- [ ] **Step 10.1: Add `payoutDownlineEnabled` to the GET response**

Open `src/app/api/admin/partners/[id]/route.ts`. Find the `findUnique` for the partner. If it uses a `select` clause, add `payoutDownlineEnabled: true`. If it returns the full row, skip this step.

- [ ] **Step 10.2: Read the flag in the profile page component**

Open `src/app/(admin)/admin/partners/[id]/page.tsx`. The partner object is fetched into local state. Confirm the existing state type has `payoutDownlineEnabled` — if TypeScript complains, add it to whatever the local Partner type is.

- [ ] **Step 10.3: Render the state row on the Commission tab**

Find the Commission tab block (around line 1043-1059 per the explore). Near the top of that tab's content, add a read-only state row, only for L1 partners:

```tsx
{partner.tier === "l1" && (
  <div className="mb-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg-secondary)] px-4 py-3">
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="font-body text-[12px] font-semibold text-[var(--app-text)]">
          Payout Downline Partners
        </div>
        <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5 max-w-[520px]">
          {partner.payoutDownlineEnabled
            ? "Fintella sends SignWell agreements to this L1's L2/L3 downline at signup and pays them commissions directly."
            : "This L1 receives the full rate for all downline deals and is responsible for paying their own downline."}
        </div>
      </div>
      <span
        className={
          partner.payoutDownlineEnabled
            ? "shrink-0 rounded-full bg-brand-gold/15 text-brand-gold px-3 py-1 font-body text-[11px] font-semibold"
            : "shrink-0 rounded-full border border-[var(--app-border)] text-[var(--app-text-muted)] px-3 py-1 font-body text-[11px]"
        }
      >
        {partner.payoutDownlineEnabled ? "Enabled ✓" : "Disabled"}
      </span>
    </div>
  </div>
)}
```

Read-only — no button, no toggle. Lock-at-invite per spec §2 / Q1.

- [ ] **Step 10.4: Manual browser check**

Reload an L1 partner's profile page. Navigate to Commission tab → confirm the state row renders with the right text and badge. Then open an L2 or L3 partner profile → confirm the state row is NOT rendered (the flag is meaningless for non-L1s).

- [ ] **Step 10.5: Commit**

```bash
git add src/app/api/admin/partners/\[id\]/route.ts "src/app/(admin)/admin/partners/[id]/page.tsx"
git commit -m "feat(admin/partner-profile): show Payout Downline state on L1 Commission tab"
```

---

## Task 11: Partner Reporting — Enabled badge (L1 only)

**Why:** L1s whose flag is true see a small badge on their Reporting Commissions tab. Spec §8.1 Enabled case.

**Files:**
- Modify: `src/app/api/commissions/route.ts` (return the flag in the response)
- Modify: `src/app/(partner)/dashboard/reporting/page.tsx` (render the badge)

- [ ] **Step 11.1: Return `payoutDownlineEnabled` from the commissions API**

Open `src/app/api/commissions/route.ts`. Find the handler that returns the logged-in partner's data. Add `payoutDownlineEnabled` to whatever the `select` (or the returned shape) is. If the partner lookup is plain `findUnique`, confirm the result type includes the new column (should be automatic after `prisma generate`).

Also add a derived field for the L2/L3 "paid by upline" note (prep for Task 13): resolve the top-of-chain L1's flag. Example structure to return:

```ts
const response = {
  // …existing fields…
  partner: {
    // …existing partner fields…
    payoutDownlineEnabled: partner.payoutDownlineEnabled,
  },
  topL1PayoutDownlineEnabled: topL1?.payoutDownlineEnabled ?? null,
};
```

Compute `topL1` by walking up from the logged-in partner. Reuse the pattern from `resolveTopL1ForNewPartner` in Task 7 — extract to a shared helper at `src/lib/partnerChain.ts` if you want to avoid duplication.

- [ ] **Step 11.2: Read the flag in the Reporting page**

Open `src/app/(partner)/dashboard/reporting/page.tsx`. Find the state shape holding the response from `/api/commissions`. Add the two new fields to the local type if TypeScript complains.

- [ ] **Step 11.3: Render the Enabled badge**

Find the Commissions tab content (around the existing tier-breakdown block). At the top of the Commissions tab content, for L1 partners with the flag on, render:

```tsx
{partner.tier === "l1" && partner.payoutDownlineEnabled && (
  <div className="mb-4 rounded-lg border border-brand-gold/30 bg-brand-gold/5 px-4 py-3">
    <div className="flex items-start gap-2">
      <span className="text-brand-gold text-[14px] leading-none mt-0.5">★</span>
      <div>
        <div className="font-body text-[12px] font-semibold text-[var(--app-text)]">
          Payout Downline Partners: Enabled
        </div>
        <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5">
          Fintella is paying your L2/L3 downline directly. You receive the override portion for downline deals.
        </div>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 11.4: Manual check**

Log into the partner portal as an L1 whose flag is true (use one of the test partners created in Task 9 — use the Star Admin impersonate flow to log in as them). Navigate to Reporting → Commissions. Badge should render. Log in as a Disabled L1 → badge should NOT render.

- [ ] **Step 11.5: Commit**

```bash
git add src/app/api/commissions/route.ts "src/app/(partner)/dashboard/reporting/page.tsx"
git commit -m "feat(partner/reporting): show Enabled badge on L1 Commissions tab"
```

---

## Task 12: Partner Reporting — Disabled "Downline Accounting" subsection

**Why:** Disabled L1s with downline deals see a computed breakdown of what they owe each downline partner per deal. Spec §8.1 Disabled case.

**Files:**
- Modify: `src/app/api/commissions/route.ts` (return downline-deal data)
- Modify: `src/app/(partner)/dashboard/reporting/page.tsx` (render the subsection)

- [ ] **Step 12.1: Return downline deals in the commissions response**

For an L1 with any L2/L3 downline, fetch their deals where `partnerCode` is any L2/L3 in their subtree. Include `dealName`, `firmFeeAmount`, `l1CommissionAmount`, `l2CommissionAmount`, `l3CommissionAmount`, and the submitter's partner name.

In `src/app/api/commissions/route.ts`, when the logged-in partner is an L1:

```ts
let downlineDeals: Array<{
  dealId: string;
  dealName: string;
  firmFeeAmount: number;
  submitterPartnerCode: string;
  submitterPartnerName: string;
  submitterTier: string;
  submitterRate: number;
  l1CommissionAmount: number;
  l2CommissionAmount: number;
  l3CommissionAmount: number;
}> = [];

if (partner.tier === "l1") {
  const downlinePartners = await prisma.partner.findMany({
    where: {
      OR: [
        { referredByPartnerCode: partner.partnerCode }, // direct L2s
        // Plus L3s recursively — fetch them via a second query based on
        // the L2 codes just fetched, to keep this simple.
      ],
    },
    select: { partnerCode: true, tier: true, commissionRate: true, firstName: true, lastName: true, referredByPartnerCode: true },
  });
  const l2Codes = downlinePartners.filter(p => p.tier === "l2").map(p => p.partnerCode);
  const l3Partners = l2Codes.length > 0
    ? await prisma.partner.findMany({
        where: { referredByPartnerCode: { in: l2Codes } },
        select: { partnerCode: true, tier: true, commissionRate: true, firstName: true, lastName: true, referredByPartnerCode: true },
      })
    : [];
  const allDownlinePartners = [...downlinePartners, ...l3Partners];
  const allDownlineCodes = allDownlinePartners.map(p => p.partnerCode);

  if (allDownlineCodes.length > 0) {
    const deals = await prisma.deal.findMany({
      where: {
        partnerCode: { in: allDownlineCodes },
        stage: "closedwon",
      },
      select: {
        id: true, dealName: true, firmFeeAmount: true, partnerCode: true,
        l1CommissionAmount: true, l2CommissionAmount: true, l3CommissionAmount: true,
      },
    });
    const byCode = Object.fromEntries(allDownlinePartners.map(p => [p.partnerCode, p]));
    downlineDeals = deals.map(d => {
      const submitter = byCode[d.partnerCode];
      return {
        dealId: d.id,
        dealName: d.dealName,
        firmFeeAmount: d.firmFeeAmount,
        submitterPartnerCode: d.partnerCode,
        submitterPartnerName: submitter ? `${submitter.firstName} ${submitter.lastName}`.trim() : d.partnerCode,
        submitterTier: submitter?.tier ?? "unknown",
        submitterRate: submitter?.commissionRate ?? 0,
        l1CommissionAmount: d.l1CommissionAmount ?? 0,
        l2CommissionAmount: d.l2CommissionAmount ?? 0,
        l3CommissionAmount: d.l3CommissionAmount ?? 0,
      };
    });
  }
}

// ... return in response body ...
response.downlineDeals = downlineDeals;
```

- [ ] **Step 12.2: Render the subsection on the partner Reporting Commissions tab**

In `src/app/(partner)/dashboard/reporting/page.tsx`, on the Commissions tab content, below the existing ledger rows:

```tsx
{partner.tier === "l1" && !partner.payoutDownlineEnabled && downlineDeals.length > 0 && (
  <div className="mt-6 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg-secondary)] p-5">
    <div className="mb-3">
      <div className="font-body text-[14px] font-semibold text-[var(--app-text)]">
        Downline Accounting
      </div>
      <div className="font-body text-[12px] text-[var(--app-text-muted)] mt-0.5">
        What you owe your downline based on your private sub-partner agreements. Fintella pays you the full rate for every deal in your subtree — these amounts are what you&rsquo;re expected to pay out yourself.
      </div>
    </div>

    <div className="space-y-2">
      {downlineDeals.map((d) => {
        const l1Received = d.l1CommissionAmount + d.l2CommissionAmount + d.l3CommissionAmount;
        const owedToDownline = d.l2CommissionAmount + d.l3CommissionAmount;
        const kept = l1Received - owedToDownline;
        return (
          <div key={d.dealId} className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2.5">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="font-body text-[12px] font-medium text-[var(--app-text)] truncate">{d.dealName}</div>
              <div className="font-body text-[11px] text-[var(--app-text-muted)] shrink-0">
                ${d.firmFeeAmount.toLocaleString()} firm fee
              </div>
            </div>
            <div className="font-body text-[11px] text-[var(--app-text-secondary)] grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
              <div>You received from Fintella</div>
              <div className="text-right font-mono">${l1Received.toLocaleString()}</div>
              <div>
                You owe {d.submitterPartnerName} ({d.submitterTier.toUpperCase()} @ {(d.submitterRate * 100).toFixed(0)}%)
              </div>
              <div className="text-right font-mono">${owedToDownline.toLocaleString()}</div>
              <div className="text-[var(--app-text-muted)]">You keep</div>
              <div className="text-right font-mono text-[var(--app-text-muted)]">${kept.toLocaleString()}</div>
            </div>
          </div>
        );
      })}
    </div>

    <div className="mt-4 pt-3 border-t border-[var(--app-border)]">
      {(() => {
        const totalReceived = downlineDeals.reduce((s, d) => s + d.l1CommissionAmount + d.l2CommissionAmount + d.l3CommissionAmount, 0);
        const totalOwed = downlineDeals.reduce((s, d) => s + d.l2CommissionAmount + d.l3CommissionAmount, 0);
        const totalKept = totalReceived - totalOwed;
        return (
          <div className="font-body text-[12px] grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
            <div className="font-semibold">Total received from Fintella</div>
            <div className="text-right font-mono font-semibold">${totalReceived.toLocaleString()}</div>
            <div className="font-semibold">Total owed to downline</div>
            <div className="text-right font-mono font-semibold">${totalOwed.toLocaleString()}</div>
            <div className="font-semibold">Total kept</div>
            <div className="text-right font-mono font-semibold">${totalKept.toLocaleString()}</div>
          </div>
        );
      })()}
    </div>
  </div>
)}
```

- [ ] **Step 12.3: Manual check**

Hardest task to fake without real downline deal data. Plan: use Prisma Studio to seed a test scenario:
1. A Disabled L1 partner (`payoutDownlineEnabled: false`).
2. An L2 partner under them with a rate like 0.20.
3. A Deal row with `partnerCode` = that L2's code, `stage: "closedwon"`, `firmFeeAmount: 10000`, and the per-tier commission amounts populated: `l1CommissionAmount: 500, l2CommissionAmount: 2000, l3CommissionAmount: 0`.
4. Log into the partner portal as the L1. Reporting → Commissions → the Downline Accounting subsection renders with exactly the numbers you seeded.

Revert the test data after checking.

- [ ] **Step 12.4: Commit**

```bash
git add src/app/api/commissions/route.ts "src/app/(partner)/dashboard/reporting/page.tsx"
git commit -m "feat(partner/reporting): Downline Accounting subsection for Disabled L1s"
```

---

## Task 13: Partner Reporting — L2/L3 "paid by upline" empty-state note

**Why:** L2/L3 under a Disabled L1 have no ledger rows of their own. Show an explicit note so they don't think the portal is broken. Spec §8.2.

**Files:**
- Modify: `src/app/(partner)/dashboard/reporting/page.tsx`

- [ ] **Step 13.1: Add the gated empty-state**

The response already has `topL1PayoutDownlineEnabled` from Task 11 step 11.1. In the Commissions tab, at the point where the ledger rows would render (inside the block that currently shows "no commissions yet" or similar empty state), add:

```tsx
{partner.tier !== "l1" && topL1PayoutDownlineEnabled === false && ledgerRows.length === 0 && (
  <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg-secondary)] px-4 py-3 my-3">
    <div className="font-body text-[12px] text-[var(--app-text-secondary)]">
      Your commissions are paid by your upline partner. Contact them for details.
    </div>
    <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-1">
      Fintella is not responsible for paying you directly under your upline&rsquo;s current configuration.
    </div>
  </div>
)}
```

- [ ] **Step 13.2: Manual check**

Use the test data from Task 12 — log in as the L2 under the Disabled L1. Reporting → Commissions → the note renders. Change the L1's `payoutDownlineEnabled` to `true` in Prisma Studio, reload — the note disappears (L2 would start seeing ledger rows per the Enabled-mode engine if any existed).

- [ ] **Step 13.3: Commit**

```bash
git add "src/app/(partner)/dashboard/reporting/page.tsx"
git commit -m "feat(partner/reporting): paid-by-upline note for L2/L3 under Disabled L1"
```

---

## Task 14: End-to-end smoke test on Vercel preview

**Why:** Verify the whole feature works against a real Postgres branch, real SignWell sandbox (if configured), and real session state. Spec §10.

- [ ] **Step 14.1: Push the branch and let Vercel deploy a preview**

```bash
git push -u origin claude/payout-downline-impl
```

Open the GitHub repo, find the pushed branch, and watch for the Vercel preview URL in the PR check or branch page. Wait for "Deployment has completed".

- [ ] **Step 14.2: Disabled-mode end-to-end flow**

On the preview URL:

1. Log in as `admin@fintella.partners`.
2. **+ INVITE PARTNER** with the Payout Downline checkbox UN-checked. Email: `disabled-l1-test@example.com`. Rate: 25%. Submit.
3. Intercept the invite email (or look at the Invite row in the DB / admin UI) to get the signup link. Open it in a private browser window.
4. Complete the signup form. Confirm the L1 receives a Fintella SignWell agreement (check email or SignWell dashboard).
5. Complete the L1 signing. Partner flips to `active` via webhook.
6. Back as the L1 partner, use their "invite L2" flow to recruit `disabled-l2-test@example.com` at rate 20%. Complete L2 signup.
7. Confirm **no SignWell agreement auto-sent to the L2**. L2 stays `pending`.
8. As admin, manually upload a signed agreement PDF for the L2 (existing L1-uploads-PDF flow). L2 flips to `active`.
9. Submit a deal under the L2 → drive to `closed_won` via an admin stage change. In Prisma Studio, confirm **exactly one `CommissionLedger` row** was created for that deal — `tier = "l1"`, amount = 25% of the firm fee.
10. As the L1 partner, open `/dashboard/reporting` → Commissions tab. Confirm the "Downline Accounting" subsection renders with the correct per-deal breakdown.
11. As the L2 partner, open `/dashboard/reporting` → Commissions tab. Confirm the "paid by your upline" note renders.

- [ ] **Step 14.3: Enabled-mode end-to-end flow**

1. As admin, **+ INVITE PARTNER** with the Payout Downline checkbox CHECKED. Email: `enabled-l1-test@example.com`. Rate: 25%. Submit.
2. L1 signs up + signs SignWell. Flips to `active`.
3. L1 recruits `enabled-l2-test@example.com` at rate 20%.
4. As the L2, complete signup. Confirm **Fintella SignWell agreement is auto-sent** immediately.
5. L2 signs it. Webhook flips them to `active` without any manual admin action.
6. Submit a deal under the L2 → `closed_won`. Confirm **two `CommissionLedger` rows** were created: L1 override ($500 on a $10K firm fee) + L2 ($2,000).
7. As the L1, `/dashboard/reporting` → Commissions → confirm the "★ Enabled" badge renders. No Downline Accounting subsection.

- [ ] **Step 14.4: Role-gate verification**

1. Log in as an `accounting`-role user (create one in Prisma Studio if needed).
2. Open **+ INVITE PARTNER** → confirm the Payout Downline checkbox is NOT visible.
3. From a terminal, hit the API directly:

```bash
curl -X POST https://<preview-url>/api/admin/invites \
  -H "Cookie: <accounting session cookie>" \
  -H "Content-Type: application/json" \
  -d '{"email":"gate-test@example.com","commissionRate":0.25,"payoutDownlineEnabled":true}'
```

Expected: 403 with the expected error message.

- [ ] **Step 14.5: Admin profile visual**

1. As `admin@fintella.partners`, open each of the test L1 partners' profiles on the preview.
2. Disabled L1 → Commission tab shows `Payout Downline Partners: Disabled`.
3. Enabled L1 → Commission tab shows `Payout Downline Partners: Enabled ✓`.
4. Open the L2 partner's profile → Commission tab does NOT render the state row at all.

- [ ] **Step 14.6: Clean up**

Use Prisma Studio on the preview DB to remove the test rows (partners, invites, agreements, deals, ledger rows) so preview data doesn't pollute later QA runs.

- [ ] **Step 14.7: Open the PR when all of the above pass**

```bash
gh pr create --title "feat: Payout Downline Partners toggle (per-L1)" --body "$(cat <<'EOF'
## Summary
Implements the design spec at \`docs/superpowers/specs/2026-04-22-payout-downline-partners-design.md\`. Per-L1-partner lock-at-invite toggle that switches Fintella between two commission-payout models (Fintella-pays-downline vs L1-pays-downline).

## Verification
End-to-end smoke test completed on Vercel preview — see plan task 14 for the full sequence. Both Disabled and Enabled flows work including commission-ledger branching and SignWell auto-dispatch for Enabled L2/L3. Accounting role gate verified 403s.

## ⚠️ Production behavior note
This PR flips commission behavior for every existing L1 (all 4 are grandfathered to Disabled). Closed-won L2/L3 deals AFTER this deploys write one ledger row instead of the previous 2-3. Deals already closed with ledger rows written are untouched.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Post-flight

- [ ] **Confirm all CI checks pass on the open PR.** Analyze (actions), Analyze (javascript-typescript), CodeQL, Vercel, Vercel Preview Comments.
- [ ] **Pause for John's explicit "yes, merge"** per the `feedback_confirm_before_merge` rule. Do NOT auto-merge even if CI is green.
- [ ] **Update `.claude/session-state.md`** after merge via a separate branch + PR (direct push to main is sandbox-blocked per prior session experience — see `feedback_vercel_deploy` / `feedback_confirm_before_merge`).
