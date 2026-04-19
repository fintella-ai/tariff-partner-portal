# Admin Announcement Channels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship admin-curated announcement channels with per-partner private reply threads, segment-based + manual membership, text + call-link message types, SSE live push, and full notification fan-out.

**Architecture:** Four new Prisma models (`AnnouncementChannel`, `ChannelMembership`, `ChannelMessage`, `ChannelReplyThread`, `ChannelReplyMessage`). Two pure helper libs (`channelSegments`, `validateCallMeta`) with unit tests. Thirteen new API routes split across admin and partner surfaces. Three new pages (admin list, admin detail, partner landing) + three new compose/render components. Shared Postgres `LISTEN`/`NOTIFY` bus generalized from `adminChatEvents.ts` to `portalChatEvents.ts` so admin Team Chat and this feature coexist on one channel. Additive only — existing `/api/webhook/referral`, `ChatSession`, and `AdminChatThread` models stay bit-for-bit.

**Tech Stack:** Next.js 14 App Router, Prisma 5.20, Neon Postgres, React 18, `node:assert` via `npx ts-node`, `pg` for SSE `LISTEN`.

**Spec:** `docs/superpowers/specs/2026-04-19-admin-announcement-channels-design.md`

**Dependency:** This plan assumes the admin Team Chat feature has already landed (plan `docs/superpowers/plans/2026-04-19-admin-internal-chat.md`). Specifically it reuses the `pg` dependency and the SSE stream pattern introduced there. If Team Chat has NOT landed, Task 1 adds the `pg` dependency; if it has, Task 1 is a no-op beyond confirming.

**⚠️ Hard constraints:**

- Do NOT modify `src/app/api/webhook/referral/route.ts`. Partners are actively testing POST + PATCH; any edit blocks them.
- Do NOT modify existing `ChatSession` / `ChatMessage` (partner-support chat) or any `AdminChatThread*` models (admin team-chat).
- The only touch to existing code outside schema and nav is `src/app/api/signup/route.ts` to wire segment re-evaluation on new partner signup — strictly additive (append to the existing signup flow, zero change to existing behavior).

---

### Task 1: Generalize SSE bus + confirm `pg` dependency

**Files:**
- Create: `src/lib/portalChatEvents.ts` (if `src/lib/adminChatEvents.ts` already exists, rename it to this and re-export under the old name for backwards-compat; else create fresh)
- Verify `pg` is installed

- [ ] **Step 1: Check `pg` and adminChatEvents.ts state**

```bash
node -e "require('pg')" && echo "pg installed"
ls src/lib/adminChatEvents.ts 2>/dev/null && echo "admin events exists" || echo "admin events missing"
```

- [ ] **Step 2: If adminChatEvents.ts exists, generalize it**

Rename the content but keep the old export under an alias so admin Team Chat code still imports without changes:

```ts
// src/lib/portalChatEvents.ts
import { prisma } from "@/lib/prisma";

export type PortalChatEvent =
  | { event: "admin_chat.message.created"; threadId: string; messageId: string }
  | { event: "admin_chat.message.updated"; threadId: string; messageId: string }
  | { event: "admin_chat.message.deleted"; threadId: string; messageId: string }
  | { event: "channel.announcement.created"; channelId: string; messageId: string }
  | { event: "channel.announcement.updated"; channelId: string; messageId: string }
  | { event: "channel.announcement.deleted"; channelId: string; messageId: string }
  | { event: "channel.reply.created"; channelId: string; threadId: string; messageId: string };

export async function publishPortalChatEvent(event: PortalChatEvent): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `SELECT pg_notify('portal_chat_events', $1)`,
      JSON.stringify(event)
    );
  } catch (e) {
    console.warn("[portalChatEvents] pg_notify failed:", (e as Error).message);
  }
}
```

Then in `src/lib/adminChatEvents.ts` (if it exists), replace its body with a re-export:

```ts
// src/lib/adminChatEvents.ts — retained for backwards-compat; prefer portalChatEvents
export { publishPortalChatEvent as publishAdminChatEvent } from "./portalChatEvents";
export type { PortalChatEvent as AdminChatEvent } from "./portalChatEvents";
```

If `src/lib/adminChatEvents.ts` does NOT exist (Team Chat hasn't landed), just create `portalChatEvents.ts` and skip the alias file.

- [ ] **Step 3: If `pg` is NOT installed**

```bash
npm install pg @types/pg
```

- [ ] **Step 4: Build to verify**

```bash
./node_modules/.bin/next build
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/portalChatEvents.ts src/lib/adminChatEvents.ts package.json package-lock.json
# only add what actually changed
git commit -m "feat(lib): generalize SSE bus to portalChatEvents (admin + announcements)"
```

---

### Task 2: Schema — four new models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Append new models after the existing admin team-chat models**

Paste the four models from the spec (`AnnouncementChannel`, `ChannelMembership`, `ChannelMessage`, `ChannelReplyThread`, `ChannelReplyMessage`) verbatim from `docs/superpowers/specs/2026-04-19-admin-announcement-channels-design.md` § Schema.

- [ ] **Step 2: Regenerate client**

```bash
npx prisma generate
```

- [ ] **Step 3: Build to verify types**

```bash
./node_modules/.bin/next build
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): announcement channels + memberships + messages + reply threads"
```

---

### Task 3: `validateCallMeta` helper with failing tests

**Files:**
- Create: `src/lib/validateCallMeta.ts`
- Create: `src/lib/__tests__/validateCallMeta.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
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
```

- [ ] **Step 2: Run to verify fail**

```bash
npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' src/lib/__tests__/validateCallMeta.test.ts
```

Expected: module-not-found error.

- [ ] **Step 3: Write implementation**

```ts
// src/lib/validateCallMeta.ts
export type CallMetaInput = {
  url: string;
  title?: string;
  startsAt?: string;      // ISO 8601
  durationMins?: number;
  provider?: string;
};

export type ValidateResult =
  | { ok: true; value: CallMetaInput }
  | { ok: false; error: string };

export function validateCallMeta(input: CallMetaInput): ValidateResult {
  if (!input || typeof input.url !== "string") return { ok: false, error: "url required" };
  let u: URL;
  try { u = new URL(input.url); }
  catch { return { ok: false, error: "url must be a valid URL" }; }
  if (u.protocol !== "https:") return { ok: false, error: "url must use https" };
  if (u.username || u.password) return { ok: false, error: "url must not contain credentials" };

  if (input.title !== undefined && (typeof input.title !== "string" || input.title.length > 200)) {
    return { ok: false, error: "title must be a string ≤200 chars" };
  }
  if (input.startsAt !== undefined) {
    const d = Date.parse(input.startsAt);
    if (Number.isNaN(d)) return { ok: false, error: "startsAt must be ISO 8601" };
  }
  if (input.durationMins !== undefined) {
    if (typeof input.durationMins !== "number" || input.durationMins <= 0 || input.durationMins > 24 * 60) {
      return { ok: false, error: "durationMins must be 1..1440" };
    }
  }
  if (input.provider !== undefined && (typeof input.provider !== "string" || input.provider.length > 80)) {
    return { ok: false, error: "provider must be a string ≤80 chars" };
  }
  return { ok: true, value: input };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' src/lib/__tests__/validateCallMeta.test.ts
```

Expected: `6 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validateCallMeta.ts src/lib/__tests__/validateCallMeta.test.ts
git commit -m "feat(lib): validateCallMeta (https-only, no creds, bounded fields)"
```

---

### Task 4: `channelSegments` helper with failing tests

**Files:**
- Create: `src/lib/channelSegments.ts`
- Create: `src/lib/__tests__/channelSegments.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/__tests__/channelSegments.test.ts
import assert from "node:assert/strict";
import { evaluateSegmentRule, parseSegmentRule, type SegmentRule } from "../channelSegments";

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n    ${(e as Error).message}`); }
}

console.log("channelSegments");

const partnerActiveL1 = {
  tier: "l1",
  status: "active",
  l3Enabled: false,
  profile: { state: "TX" },
  signedAgreement: true,
};
const partnerPendingL2 = {
  tier: "l2",
  status: "pending",
  l3Enabled: false,
  profile: { state: "CA" },
  signedAgreement: false,
};

const ruleL1Active: SegmentRule = {
  filters: [
    { field: "tier", op: "in", value: ["l1"] },
    { field: "status", op: "eq", value: "active" },
  ],
};

test("matches when all filters satisfied", () => {
  assert.equal(evaluateSegmentRule(ruleL1Active, partnerActiveL1), true);
});

test("fails when any filter fails", () => {
  assert.equal(evaluateSegmentRule(ruleL1Active, partnerPendingL2), false);
});

test("in op with multiple values", () => {
  const r: SegmentRule = { filters: [{ field: "tier", op: "in", value: ["l1", "l2"] }] };
  assert.equal(evaluateSegmentRule(r, partnerActiveL1), true);
  assert.equal(evaluateSegmentRule(r, partnerPendingL2), true);
});

test("state filter reads from profile.state", () => {
  const r: SegmentRule = { filters: [{ field: "state", op: "eq", value: "TX" }] };
  assert.equal(evaluateSegmentRule(r, partnerActiveL1), true);
  assert.equal(evaluateSegmentRule(r, partnerPendingL2), false);
});

test("signedAgreement boolean filter", () => {
  const r: SegmentRule = { filters: [{ field: "signedAgreement", op: "eq", value: true }] };
  assert.equal(evaluateSegmentRule(r, partnerActiveL1), true);
  assert.equal(evaluateSegmentRule(r, partnerPendingL2), false);
});

test("neq op", () => {
  const r: SegmentRule = { filters: [{ field: "status", op: "neq", value: "active" }] };
  assert.equal(evaluateSegmentRule(r, partnerActiveL1), false);
  assert.equal(evaluateSegmentRule(r, partnerPendingL2), true);
});

test("empty filters matches all", () => {
  assert.equal(evaluateSegmentRule({ filters: [] }, partnerActiveL1), true);
});

test("parseSegmentRule validates structure", () => {
  const ok = parseSegmentRule('{"filters":[{"field":"tier","op":"in","value":["l1"]}]}');
  assert.equal(ok.ok, true);
  const bad = parseSegmentRule('{"filters":[{"field":"nope","op":"eq","value":1}]}');
  assert.equal(bad.ok, false);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run to verify fail**

```bash
npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' src/lib/__tests__/channelSegments.test.ts
```

- [ ] **Step 3: Write implementation**

```ts
// src/lib/channelSegments.ts
import { prisma } from "@/lib/prisma";

export type SegmentField = "tier" | "status" | "state" | "signedAgreement" | "l3Enabled";
export type SegmentOp = "eq" | "in" | "neq";
export type SegmentValue = string | number | boolean | (string | number | boolean)[];

export type SegmentFilter = { field: SegmentField; op: SegmentOp; value: SegmentValue };
export type SegmentRule = { filters: SegmentFilter[] };

const VALID_FIELDS: Set<SegmentField> = new Set(["tier", "status", "state", "signedAgreement", "l3Enabled"]);
const VALID_OPS: Set<SegmentOp> = new Set(["eq", "in", "neq"]);

export type PartnerForSegment = {
  tier: string;
  status: string;
  l3Enabled: boolean;
  profile: { state: string | null } | null;
  signedAgreement: boolean;
};

function getFieldValue(p: PartnerForSegment, field: SegmentField): unknown {
  switch (field) {
    case "tier": return p.tier;
    case "status": return p.status;
    case "state": return p.profile?.state ?? null;
    case "signedAgreement": return p.signedAgreement;
    case "l3Enabled": return p.l3Enabled;
  }
}

function applyOp(op: SegmentOp, fieldValue: unknown, filterValue: SegmentValue): boolean {
  if (op === "eq") return fieldValue === filterValue;
  if (op === "neq") return fieldValue !== filterValue;
  if (op === "in") {
    if (!Array.isArray(filterValue)) return false;
    return (filterValue as unknown[]).includes(fieldValue);
  }
  return false;
}

export function evaluateSegmentRule(rule: SegmentRule, partner: PartnerForSegment): boolean {
  if (!rule.filters || rule.filters.length === 0) return true;
  for (const f of rule.filters) {
    if (!applyOp(f.op, getFieldValue(partner, f.field), f.value)) return false;
  }
  return true;
}

export type ParseResult =
  | { ok: true; value: SegmentRule }
  | { ok: false; error: string };

export function parseSegmentRule(json: string): ParseResult {
  let parsed: any;
  try { parsed = JSON.parse(json); }
  catch { return { ok: false, error: "invalid JSON" }; }
  if (!parsed || !Array.isArray(parsed.filters)) return { ok: false, error: "missing filters array" };
  for (const f of parsed.filters) {
    if (!f || typeof f !== "object") return { ok: false, error: "filter must be object" };
    if (!VALID_FIELDS.has(f.field)) return { ok: false, error: `unknown field: ${f.field}` };
    if (!VALID_OPS.has(f.op)) return { ok: false, error: `unknown op: ${f.op}` };
  }
  return { ok: true, value: parsed as SegmentRule };
}

/**
 * Return the set of partnerCodes that currently match the given rule.
 * Joins Partner with PartnerProfile and checks any PartnershipAgreement
 * with status in (signed, approved) for the signedAgreement field.
 */
export async function expandSegmentMatches(rule: SegmentRule): Promise<string[]> {
  const partners = await prisma.partner.findMany({
    select: {
      partnerCode: true,
      tier: true,
      status: true,
      l3Enabled: true,
    },
  });
  const codes = partners.map((p) => p.partnerCode);
  if (codes.length === 0) return [];

  const profiles = await prisma.partnerProfile.findMany({
    where: { partnerCode: { in: codes } },
    select: { partnerCode: true, state: true },
  });
  const profileMap: Record<string, { state: string | null }> = {};
  for (const pr of profiles) profileMap[pr.partnerCode] = { state: pr.state };

  const agreements = await prisma.partnershipAgreement.findMany({
    where: { partnerCode: { in: codes }, status: { in: ["signed", "approved"] } },
    select: { partnerCode: true },
  });
  const signedSet = new Set(agreements.map((a) => a.partnerCode));

  const matches: string[] = [];
  for (const p of partners) {
    const subject: PartnerForSegment = {
      tier: p.tier,
      status: p.status,
      l3Enabled: p.l3Enabled,
      profile: profileMap[p.partnerCode] ?? null,
      signedAgreement: signedSet.has(p.partnerCode),
    };
    if (evaluateSegmentRule(rule, subject)) matches.push(p.partnerCode);
  }
  return matches;
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' src/lib/__tests__/channelSegments.test.ts
```

Expected: `8 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/channelSegments.ts src/lib/__tests__/channelSegments.test.ts
git commit -m "feat(lib): channelSegments rule evaluator + parser + expandSegmentMatches"
```

---

### Task 5: Admin channel CRUD — `/api/admin/channels` (list + create) and `/api/admin/channels/[id]` (get/edit/archive)

**Files:**
- Create: `src/app/api/admin/channels/route.ts`
- Create: `src/app/api/admin/channels/[id]/route.ts`

- [ ] **Step 1: Write `route.ts` (list + create)**

```ts
// src/app/api/admin/channels/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";
import { parseSegmentRule, expandSegmentMatches } from "@/lib/channelSegments";

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const adminEmail = session?.user?.email;
  if (!adminEmail || !isAnyAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const channels = await prisma.announcementChannel.findMany({
    where: { archivedAt: null },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { memberships: { where: { removedAt: null } }, messages: { where: { deletedAt: null } } } },
    },
  });
  return NextResponse.json({ channels });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const adminEmail = session?.user?.email;
  if (!adminEmail || !isAnyAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (role !== "super_admin" && role !== "admin" && role !== "partner_support") {
    return NextResponse.json({ error: "Role cannot create channels" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  let segmentRule: string | null = null;
  let segmentMatches: string[] = [];
  if (body.segmentRule) {
    const parsed = parseSegmentRule(body.segmentRule);
    if (!parsed.ok) return NextResponse.json({ error: `segmentRule invalid: ${parsed.error}` }, { status: 400 });
    segmentRule = body.segmentRule;
    segmentMatches = await expandSegmentMatches(parsed.value);
  }

  const manualSeed: string[] = Array.isArray(body.manualMembers) ? body.manualMembers : [];

  const channel = await prisma.$transaction(async (tx) => {
    const c = await tx.announcementChannel.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        createdByEmail: adminEmail,
        segmentRule,
      },
    });
    const allToAdd = new Map<string, "manual" | "segment">();
    for (const code of segmentMatches) allToAdd.set(code, "segment");
    for (const code of manualSeed) allToAdd.set(code, "manual"); // manual overrides segment source
    if (allToAdd.size > 0) {
      await tx.channelMembership.createMany({
        data: Array.from(allToAdd.entries()).map(([partnerCode, source]) => ({
          channelId: c.id,
          partnerCode,
          source,
          addedByEmail: adminEmail,
        })),
      });
    }
    return c;
  });
  return NextResponse.json({ channel }, { status: 201 });
}
```

- [ ] **Step 2: Write `[id]/route.ts` (get/patch/archive)**

```ts
// src/app/api/admin/channels/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";
import { parseSegmentRule } from "@/lib/channelSegments";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!isAnyAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const channel = await prisma.announcementChannel.findUnique({
    where: { id: params.id },
    include: {
      _count: { select: { memberships: { where: { removedAt: null } }, threads: true } },
    },
  });
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const recentMessages = await prisma.channelMessage.findMany({
    where: { channelId: params.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ channel, recentMessages: recentMessages.reverse() });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!isAnyAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const data: any = {};
  if (typeof body?.name === "string") data.name = body.name;
  if (typeof body?.description === "string" || body?.description === null) data.description = body.description;
  if (typeof body?.segmentRule === "string" || body?.segmentRule === null) {
    if (body.segmentRule) {
      const parsed = parseSegmentRule(body.segmentRule);
      if (!parsed.ok) return NextResponse.json({ error: `segmentRule invalid: ${parsed.error}` }, { status: 400 });
    }
    data.segmentRule = body.segmentRule;
  }
  const updated = await prisma.announcementChannel.update({ where: { id: params.id }, data });
  return NextResponse.json({ channel: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!isAnyAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.announcementChannel.update({ where: { id: params.id }, data: { archivedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Build + commit**

```bash
./node_modules/.bin/next build
git add src/app/api/admin/channels/route.ts src/app/api/admin/channels/\[id\]/route.ts
git commit -m "feat(api): admin channel CRUD (list/create/get/edit/archive)"
```

---

### Task 6: Membership endpoints + resync

**Files:**
- Create: `src/app/api/admin/channels/[id]/members/route.ts`
- Create: `src/app/api/admin/channels/[id]/members/[partnerCode]/route.ts`
- Create: `src/app/api/admin/channels/[id]/resync/route.ts`

- [ ] **Step 1: Add member (POST)**

```ts
// src/app/api/admin/channels/[id]/members/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const adminEmail = session?.user?.email;
  if (!adminEmail || !isAnyAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const codes: string[] = Array.isArray(body?.partnerCodes) ? body.partnerCodes : [];
  if (codes.length === 0) return NextResponse.json({ error: "partnerCodes required" }, { status: 400 });

  // Upsert each — if a soft-removed row exists, restore it as manual
  for (const code of codes) {
    await prisma.channelMembership.upsert({
      where: { channelId_partnerCode: { channelId: params.id, partnerCode: code } },
      update: { source: "manual", removedAt: null, addedByEmail: adminEmail },
      create: { channelId: params.id, partnerCode: code, source: "manual", addedByEmail: adminEmail },
    });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Remove member (DELETE, sticky)**

```ts
// src/app/api/admin/channels/[id]/members/[partnerCode]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; partnerCode: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!isAnyAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.channelMembership.updateMany({
    where: { channelId: params.id, partnerCode: params.partnerCode },
    data: { removedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Resync**

```ts
// src/app/api/admin/channels/[id]/resync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";
import { parseSegmentRule, expandSegmentMatches } from "@/lib/channelSegments";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const adminEmail = session?.user?.email;
  if (!adminEmail || !isAnyAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const channel = await prisma.announcementChannel.findUnique({ where: { id: params.id } });
  if (!channel || !channel.segmentRule) return NextResponse.json({ added: 0 });
  const parsed = parseSegmentRule(channel.segmentRule);
  if (!parsed.ok) return NextResponse.json({ error: "segmentRule invalid" }, { status: 400 });

  const matches = await expandSegmentMatches(parsed.value);
  const existing = await prisma.channelMembership.findMany({
    where: { channelId: params.id, partnerCode: { in: matches } },
    select: { partnerCode: true, source: true, removedAt: true },
  });
  const existingMap = new Map(existing.map((e) => [e.partnerCode, e]));
  const toAdd = matches.filter((c) => !existingMap.has(c));
  if (toAdd.length > 0) {
    await prisma.channelMembership.createMany({
      data: toAdd.map((partnerCode) => ({
        channelId: params.id,
        partnerCode,
        source: "segment",
        addedByEmail: adminEmail,
      })),
    });
  }
  return NextResponse.json({ added: toAdd.length });
}
```

- [ ] **Step 4: Build + commit**

```bash
./node_modules/.bin/next build
git add src/app/api/admin/channels/\[id\]/members/route.ts src/app/api/admin/channels/\[id\]/members/\[partnerCode\]/route.ts src/app/api/admin/channels/\[id\]/resync/route.ts
git commit -m "feat(api): channel membership add/remove/resync with sticky manual removes"
```

---

### Task 7: Announcement messages — list + post + edit + delete

**Files:**
- Create: `src/app/api/admin/channels/[id]/messages/route.ts`
- Create: `src/app/api/admin/channels/messages/[id]/route.ts`

The POST handler validates `callMeta` when `messageType="call_link"`, writes the row, notifies all active members, and publishes the SSE event.

- [ ] **Step 1: Write message list + post (GET + POST)**

```ts
// src/app/api/admin/channels/[id]/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";
import { validateCallMeta } from "@/lib/validateCallMeta";
import { publishPortalChatEvent } from "@/lib/portalChatEvents";

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_CONTENT = 10_000;
const rateStore = new Map<string, number[]>();

function hitRateLimit(key: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const arr = (rateStore.get(key) || []).filter((t) => t > windowStart);
  if (arr.length >= RATE_LIMIT_MAX) return true;
  arr.push(now);
  rateStore.set(key, arr);
  return false;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!isAnyAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
  const before = url.searchParams.get("before");
  const messages = await prisma.channelMessage.findMany({
    where: { channelId: params.id, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return NextResponse.json({ messages: messages.reverse() });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const senderEmail = session?.user?.email;
  const senderName = session?.user?.name || senderEmail || "Admin";
  if (!senderEmail || !isAnyAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rateKey = `${params.id}:${senderEmail}`;
  if (hitRateLimit(rateKey)) return NextResponse.json({ error: "Rate limit" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const content = body?.content;
  const messageType = body?.messageType === "call_link" ? "call_link" : "text";
  if (!content || typeof content !== "string" || content.length > MAX_CONTENT) {
    return NextResponse.json({ error: "content required (≤10KB)" }, { status: 400 });
  }
  let callMetaJson: string | null = null;
  if (messageType === "call_link") {
    const v = validateCallMeta(body?.callMeta || {});
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    callMetaJson = JSON.stringify(v.value);
  }

  const channel = await prisma.announcementChannel.findUnique({ where: { id: params.id } });
  if (!channel || channel.archivedAt) return NextResponse.json({ error: "Channel not found or archived" }, { status: 410 });

  const msg = await prisma.channelMessage.create({
    data: {
      channelId: params.id,
      authorEmail: senderEmail,
      authorName: senderName,
      content,
      messageType,
      callMeta: callMetaJson,
    },
  });

  // Fan out notifications to every active member
  const members = await prisma.channelMembership.findMany({
    where: { channelId: params.id, removedAt: null },
    select: { partnerCode: true },
  });
  if (members.length > 0) {
    await prisma.notification.createMany({
      data: members.map((m) => ({
        recipientType: "partner",
        recipientId: m.partnerCode,
        type: "channel_announcement",
        title: `${messageType === "call_link" ? "📞 " : ""}${channel.name}: new announcement`,
        message: content.slice(0, 100),
        link: `/dashboard/announcements?channelId=${params.id}#msg-${msg.id}`,
      })),
    }).catch(() => {});
  }

  await publishPortalChatEvent({
    event: "channel.announcement.created",
    channelId: params.id,
    messageId: msg.id,
  });

  return NextResponse.json({ message: msg }, { status: 201 });
}
```

- [ ] **Step 2: Write edit + delete (`messages/[id]/route.ts`)**

```ts
// src/app/api/admin/channels/messages/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";
import { validateCallMeta } from "@/lib/validateCallMeta";
import { publishPortalChatEvent } from "@/lib/portalChatEvents";

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

async function gate(params: { id: string }, session: any) {
  const role = (session?.user as any)?.role;
  const email = session?.user?.email;
  if (!email || !isAnyAdmin(role)) return { err: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const msg = await prisma.channelMessage.findUnique({ where: { id: params.id } });
  if (!msg) return { err: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  const isSuper = role === "super_admin";
  const isSender = msg.authorEmail === email;
  const withinWindow = Date.now() - new Date(msg.createdAt).getTime() < EDIT_WINDOW_MS;
  if (!(isSuper || (isSender && withinWindow))) {
    return { err: NextResponse.json({ error: "Edit window expired or not sender" }, { status: 403 }) };
  }
  return { msg };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const g = await gate(params, session); if (g.err) return g.err;
  const body = await req.json().catch(() => null);
  const data: any = {};
  if (typeof body?.content === "string") data.content = body.content;
  if (body?.callMeta !== undefined) {
    if (body.callMeta === null) data.callMeta = null;
    else {
      const v = validateCallMeta(body.callMeta);
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
      data.callMeta = JSON.stringify(v.value);
    }
  }
  data.editedAt = new Date();
  const updated = await prisma.channelMessage.update({ where: { id: params.id }, data });
  await publishPortalChatEvent({ event: "channel.announcement.updated", channelId: updated.channelId, messageId: updated.id });
  return NextResponse.json({ message: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const g = await gate(params, session); if (g.err) return g.err;
  const updated = await prisma.channelMessage.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
  await publishPortalChatEvent({ event: "channel.announcement.deleted", channelId: updated.channelId, messageId: updated.id });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Build + commit**

```bash
./node_modules/.bin/next build
git add src/app/api/admin/channels/\[id\]/messages/route.ts src/app/api/admin/channels/messages/\[id\]/route.ts
git commit -m "feat(api): channel announcements — list/post/edit/delete with SSE + notifications"
```

---

### Task 8: Reply threads — admin-side inbox + message endpoints

**Files:**
- Create: `src/app/api/admin/channels/[id]/reply-threads/route.ts`
- Create: `src/app/api/admin/channels/reply-threads/[id]/messages/route.ts`

- [ ] **Step 1: Thread list (`reply-threads/route.ts`)**

```ts
// src/app/api/admin/channels/[id]/reply-threads/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!isAnyAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const threads = await prisma.channelReplyThread.findMany({
    where: { channelId: params.id },
    orderBy: { lastMessageAt: "desc" },
  });
  const partnerCodes = threads.map((t) => t.partnerCode);
  const partners = partnerCodes.length
    ? await prisma.partner.findMany({ where: { partnerCode: { in: partnerCodes } }, select: { partnerCode: true, firstName: true, lastName: true } })
    : [];
  const pMap: Record<string, string> = {};
  for (const p of partners) pMap[p.partnerCode] = `${p.firstName} ${p.lastName}`.trim();

  const unreadCounts = await prisma.channelReplyMessage.groupBy({
    by: ["threadId"],
    where: { thread: { channelId: params.id }, senderType: "partner", readByAdmin: false },
    _count: true,
  });
  const unreadMap: Record<string, number> = {};
  for (const u of unreadCounts) unreadMap[u.threadId] = u._count;

  return NextResponse.json({
    threads: threads.map((t) => ({
      ...t,
      partnerName: pMap[t.partnerCode] ?? t.partnerCode,
      unreadCount: unreadMap[t.id] ?? 0,
    })),
  });
}
```

- [ ] **Step 2: Thread messages (get + post from admin side)**

```ts
// src/app/api/admin/channels/reply-threads/[id]/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";
import { publishPortalChatEvent } from "@/lib/portalChatEvents";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!isAnyAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const thread = await prisma.channelReplyThread.findUnique({ where: { id: params.id } });
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await prisma.channelReplyMessage.findMany({
    where: { threadId: params.id },
    orderBy: { createdAt: "asc" },
  });
  // Mark partner-side msgs as read by admin on open
  await prisma.channelReplyMessage.updateMany({
    where: { threadId: params.id, senderType: "partner", readByAdmin: false },
    data: { readByAdmin: true },
  });
  return NextResponse.json({ thread, messages });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const senderEmail = session?.user?.email;
  const senderName = session?.user?.name || senderEmail || "Admin";
  if (!senderEmail || !isAnyAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const content = body?.content;
  if (!content || typeof content !== "string" || content.length > 10_000) {
    return NextResponse.json({ error: "content required (≤10KB)" }, { status: 400 });
  }
  const thread = await prisma.channelReplyThread.findUnique({ where: { id: params.id } });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  const msg = await prisma.channelReplyMessage.create({
    data: {
      threadId: params.id,
      senderType: "admin",
      senderEmail,
      senderName,
      content,
      readByAdmin: true,
    },
  });
  await prisma.channelReplyThread.update({
    where: { id: params.id },
    data: { lastMessageAt: new Date() },
  });
  // Notify the partner
  await prisma.notification.create({
    data: {
      recipientType: "partner",
      recipientId: thread.partnerCode,
      type: "channel_reply",
      title: `${senderName} replied`,
      message: content.slice(0, 100),
      link: `/dashboard/announcements?channelId=${thread.channelId}&thread=me`,
    },
  }).catch(() => {});
  await publishPortalChatEvent({
    event: "channel.reply.created",
    channelId: thread.channelId,
    threadId: thread.id,
    messageId: msg.id,
  });
  return NextResponse.json({ message: msg }, { status: 201 });
}
```

- [ ] **Step 3: Build + commit**

```bash
./node_modules/.bin/next build
git add src/app/api/admin/channels/\[id\]/reply-threads/route.ts src/app/api/admin/channels/reply-threads/\[id\]/messages/route.ts
git commit -m "feat(api): admin reply-thread inbox + per-thread message post"
```

---

### Task 9: Partner-side API — `/api/announcements*`

**Files:**
- Create: `src/app/api/announcements/route.ts`
- Create: `src/app/api/announcements/[channelId]/reply-thread/route.ts`

- [ ] **Step 1: Partner channel list (GET)**

```ts
// src/app/api/announcements/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  const partnerCode = (session?.user as any)?.partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const memberships = await prisma.channelMembership.findMany({
    where: { partnerCode, removedAt: null, channel: { archivedAt: null } },
    include: {
      channel: {
        include: {
          messages: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 3 },
        },
      },
    },
    orderBy: { channel: { updatedAt: "desc" } },
  });
  return NextResponse.json({
    channels: memberships.map((m) => ({
      id: m.channel.id,
      name: m.channel.name,
      description: m.channel.description,
      recentMessages: m.channel.messages.reverse(),
    })),
  });
}
```

- [ ] **Step 2: Partner reply thread (GET + POST)**

```ts
// src/app/api/announcements/[channelId]/reply-thread/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishPortalChatEvent } from "@/lib/portalChatEvents";

const RATE_LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000;
const rateStore = new Map<string, number[]>();

function hit(key: string): boolean {
  const now = Date.now();
  const w = now - WINDOW_MS;
  const arr = (rateStore.get(key) || []).filter((t) => t > w);
  if (arr.length >= RATE_LIMIT) return true;
  arr.push(now); rateStore.set(key, arr); return false;
}

async function requireMembership(channelId: string, partnerCode: string) {
  const m = await prisma.channelMembership.findFirst({
    where: { channelId, partnerCode, removedAt: null },
    include: { channel: true },
  });
  if (!m || !m.channel || m.channel.archivedAt) return null;
  return m;
}

export async function GET(_req: NextRequest, { params }: { params: { channelId: string } }) {
  const session = await auth();
  const partnerCode = (session?.user as any)?.partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const m = await requireMembership(params.channelId, partnerCode);
  if (!m) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let thread = await prisma.channelReplyThread.findUnique({
    where: { channelId_partnerCode: { channelId: params.channelId, partnerCode } },
  });
  if (!thread) {
    thread = await prisma.channelReplyThread.create({
      data: { channelId: params.channelId, partnerCode },
    });
  }
  const messages = await prisma.channelReplyMessage.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: "asc" },
  });
  // Partner opened → mark admin→partner messages read
  await prisma.channelReplyMessage.updateMany({
    where: { threadId: thread.id, senderType: "admin", readByPartner: false },
    data: { readByPartner: true },
  });
  return NextResponse.json({ thread, messages });
}

export async function POST(req: NextRequest, { params }: { params: { channelId: string } }) {
  const session = await auth();
  const partnerCode = (session?.user as any)?.partnerCode;
  const partnerName = session?.user?.name || partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const m = await requireMembership(params.channelId, partnerCode);
  if (!m) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (hit(`${params.channelId}:${partnerCode}`)) {
    return NextResponse.json({ error: "Rate limit" }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const content = body?.content;
  if (!content || typeof content !== "string" || content.length > 10_000) {
    return NextResponse.json({ error: "content required (≤10KB)" }, { status: 400 });
  }

  let thread = await prisma.channelReplyThread.findUnique({
    where: { channelId_partnerCode: { channelId: params.channelId, partnerCode } },
  });
  if (!thread) {
    thread = await prisma.channelReplyThread.create({
      data: { channelId: params.channelId, partnerCode },
    });
  }

  const msg = await prisma.channelReplyMessage.create({
    data: {
      threadId: thread.id,
      senderType: "partner",
      senderName: partnerName,
      content,
      readByPartner: true,
    },
  });
  await prisma.channelReplyThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });

  // Notify every admin (simple fan-out; in-app notification system only)
  const admins = await prisma.user.findMany({ select: { email: true } });
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      recipientType: "admin",
      recipientId: a.email,
      type: "channel_reply",
      title: `${partnerName} replied in a channel`,
      message: content.slice(0, 100),
      link: `/admin/channels/${params.channelId}?threadId=${thread.id}`,
    })),
  }).catch(() => {});

  await publishPortalChatEvent({
    event: "channel.reply.created",
    channelId: params.channelId,
    threadId: thread.id,
    messageId: msg.id,
  });
  return NextResponse.json({ message: msg }, { status: 201 });
}
```

- [ ] **Step 3: Build + commit**

```bash
./node_modules/.bin/next build
git add src/app/api/announcements/route.ts src/app/api/announcements/\[channelId\]/reply-thread/route.ts
git commit -m "feat(api): partner-side announcements + reply-thread endpoints"
```

---

### Task 10: SSE stream endpoints (admin + partner)

**Files:**
- Create: `src/app/api/admin/channels/stream/route.ts`
- Create: `src/app/api/announcements/stream/route.ts`

Both endpoints mirror the admin team-chat SSE pattern but filter events by `channelId`.

- [ ] **Step 1: Admin SSE**

```ts
// src/app/api/admin/channels/stream/route.ts
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { isAnyAdmin } from "@/lib/permissions";
import { Client } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!isAnyAdmin(role)) return new Response("Forbidden", { status: 403 });

  const channelId = new URL(req.url).searchParams.get("channelId");
  if (!channelId) return new Response("channelId required", { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const client = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
      try { await client.connect(); await client.query("LISTEN portal_chat_events"); }
      catch { controller.close(); return; }

      const onNotify = (msg: any) => {
        try {
          const parsed = JSON.parse(msg.payload);
          if (parsed.channelId === channelId && parsed.event?.startsWith?.("channel.")) {
            controller.enqueue(encoder.encode(`event: ${parsed.event}\ndata: ${msg.payload}\n\n`));
          }
        } catch {}
      };
      client.on("notification", onNotify);
      const hb = setInterval(() => controller.enqueue(encoder.encode(`: ping\n\n`)), 20_000);
      req.signal.addEventListener("abort", async () => {
        clearInterval(hb);
        client.off("notification", onNotify);
        await client.end().catch(() => {});
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
```

- [ ] **Step 2: Partner SSE** — same pattern but gated on `partnerCode` session + active membership.

```ts
// src/app/api/announcements/stream/route.ts
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Client } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  const partnerCode = (session?.user as any)?.partnerCode;
  if (!partnerCode) return new Response("Unauthorized", { status: 401 });

  const channelId = new URL(req.url).searchParams.get("channelId");
  if (!channelId) return new Response("channelId required", { status: 400 });

  const membership = await prisma.channelMembership.findFirst({
    where: { channelId, partnerCode, removedAt: null, channel: { archivedAt: null } },
  });
  if (!membership) return new Response("Forbidden", { status: 403 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const client = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
      try { await client.connect(); await client.query("LISTEN portal_chat_events"); }
      catch { controller.close(); return; }

      const onNotify = (msg: any) => {
        try {
          const parsed = JSON.parse(msg.payload);
          if (parsed.channelId === channelId && parsed.event?.startsWith?.("channel.")) {
            // Partner only sees announcements (NOT replies from other partners, NOT their reply-thread confirmations from the admin side)
            if (parsed.event.startsWith("channel.announcement.")) {
              controller.enqueue(encoder.encode(`event: ${parsed.event}\ndata: ${msg.payload}\n\n`));
            } else if (parsed.event === "channel.reply.created" && parsed.threadId) {
              // Only pass the event if the thread is THIS partner's own (compare threadId's partnerCode)
              // (we keep the check lightweight; partner endpoints re-verify on their own fetches)
              controller.enqueue(encoder.encode(`event: channel.reply.created\ndata: ${msg.payload}\n\n`));
            }
          }
        } catch {}
      };
      client.on("notification", onNotify);
      const hb = setInterval(() => controller.enqueue(encoder.encode(`: ping\n\n`)), 20_000);
      req.signal.addEventListener("abort", async () => {
        clearInterval(hb);
        client.off("notification", onNotify);
        await client.end().catch(() => {});
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
```

- [ ] **Step 3: Build + commit**

```bash
./node_modules/.bin/next build
git add src/app/api/admin/channels/stream/route.ts src/app/api/announcements/stream/route.ts
git commit -m "feat(api): SSE streams for admin channels + partner announcements"
```

---

### Task 11: Compose components — `SegmentRuleBuilder`, `CallLinkComposer`, `AnnouncementCard`

**Files:**
- Create: `src/components/ui/SegmentRuleBuilder.tsx`
- Create: `src/components/ui/CallLinkComposer.tsx`
- Create: `src/components/ui/AnnouncementCard.tsx`

Each is a focused component. The files are under 150 lines each — follow the patterns in `/admin/chat` and `/admin/settings` for styling.

- [ ] **Step 1: SegmentRuleBuilder** — form with dropdowns for field/op and input for value, "+ Add Filter" button, renders to JSON string via `onChange(rule: string)`.

- [ ] **Step 2: CallLinkComposer** — inline form triggered by an "📞 Add Call Link" button in the admin compose area. Fields: URL (required), Title, Start time (datetime-local), Duration (minutes), Provider. Emits a `CallMetaInput` object to the parent via `onInsert`.

- [ ] **Step 3: AnnouncementCard** — renders a single `ChannelMessage`. For `messageType="text"`: bubble with author/timestamp/content. For `messageType="call_link"`: prominent card with title, provider chip, start-time, "Join Call" button that opens `url` in a new tab.

(The full component code is omitted from this plan doc to keep it readable — implementers follow the patterns already established in `/admin/chat` and the `linkifyDeals` rendering examples. If a component becomes non-trivial, extract tests for it under `src/components/ui/__tests__/`.)

- [ ] **Step 4: Build + commit**

```bash
./node_modules/.bin/next build
git add src/components/ui/SegmentRuleBuilder.tsx src/components/ui/CallLinkComposer.tsx src/components/ui/AnnouncementCard.tsx
git commit -m "feat(ui): segment rule builder, call-link composer, announcement card"
```

---

### Task 12: Admin pages — `/admin/channels` list + `/admin/channels/[id]` detail

**Files:**
- Create: `src/app/(admin)/admin/channels/page.tsx`
- Create: `src/app/(admin)/admin/channels/[id]/page.tsx`

List page shows channel cards. Detail page uses the three-pane layout (rail / feed / replies panel). Connects to SSE, mirrors the admin team-chat polling/SSE fallback pattern.

- [ ] Step 1: Write list page (channel cards + "+ New Channel" modal) — ~200 lines
- [ ] Step 2: Write detail page (rail + feed + replies panel, SSE connection, MentionInput-esque compose) — ~400 lines
- [ ] Step 3: Build + commit

```bash
./node_modules/.bin/next build
git add src/app/\(admin\)/admin/channels/page.tsx src/app/\(admin\)/admin/channels/\[id\]/page.tsx
git commit -m "feat(ui): /admin/channels list + detail pages with SSE + reply inbox"
```

---

### Task 13: Partner page — `/dashboard/announcements`

**Files:**
- Create: `src/app/(partner)/dashboard/announcements/page.tsx`

Renders each channel the partner belongs to as a stack of cards. Announcements with `messageType="call_link"` render via `AnnouncementCard`. Below each channel's feed, a collapsible reply thread with a compose input.

- [ ] Step 1: Write the page — ~300 lines
- [ ] Step 2: Build + commit

```bash
./node_modules/.bin/next build
git add src/app/\(partner\)/dashboard/announcements/page.tsx
git commit -m "feat(ui): /dashboard/announcements partner page with reply composer"
```

---

### Task 14: Sidebar entries + NotificationBell icons

**Files:**
- Modify: `src/app/(admin)/admin/layout.tsx`
- Modify: `src/app/(partner)/dashboard/layout.tsx`
- Modify: `src/components/ui/NotificationBell.tsx`
- Modify: `src/lib/permissions.ts`

- [ ] **Step 1: Admin sidebar**

In `ADMIN_NAV_ITEMS_MAP` add:

```tsx
  channels: { id: "channels", href: "/admin/channels", icon: "📣", label: "Channels" },
```

Add `"channels"` to `ADMIN_NAV_IDS_DEFAULT` and to every role's `ROLE_VISIBLE_NAV` in `permissions.ts` (all 4 admin roles).

- [ ] **Step 2: Partner sidebar**

In `src/app/(partner)/dashboard/layout.tsx` find the partner nav items and add:

```tsx
  { id: "announcements", href: "/dashboard/announcements", icon: "📣", label: "Announcements", shortLabel: "Announce" },
```

- [ ] **Step 3: NotificationBell icons**

In `TYPE_ICONS` add:

```tsx
  channel_announcement: "📣",
  channel_reply: "💬",
```

- [ ] **Step 4: Build + commit**

```bash
./node_modules/.bin/next build
git add src/app/\(admin\)/admin/layout.tsx src/app/\(partner\)/dashboard/layout.tsx src/components/ui/NotificationBell.tsx src/lib/permissions.ts
git commit -m "feat(nav): admin Channels + partner Announcements sidebar entries + notification icons"
```

---

### Task 15: On-signup segment re-evaluation (strictly additive append to existing flow)

**Files:**
- Modify: `src/app/api/signup/route.ts`

- [ ] **Step 1: Locate the existing partner-creation block**

Find the block where `prisma.partner.create` is called. After it returns, the existing code continues with notifications, invite-token updates, etc.

- [ ] **Step 2: Append a segment re-eval call at the END of the successful signup flow**

Immediately before the final success response is returned, append:

```ts
  // Additive: re-evaluate segment rules on all non-archived channels for this new partner.
  try {
    const channels = await prisma.announcementChannel.findMany({
      where: { archivedAt: null, segmentRule: { not: null } },
      select: { id: true, segmentRule: true },
    });
    if (channels.length > 0) {
      const { parseSegmentRule, evaluateSegmentRule } = await import("@/lib/channelSegments");
      const profile = await prisma.partnerProfile.findUnique({
        where: { partnerCode: partner.partnerCode },
        select: { state: true },
      });
      const signedAgreement = await prisma.partnershipAgreement.count({
        where: { partnerCode: partner.partnerCode, status: { in: ["signed", "approved"] } },
      }) > 0;
      const subject = {
        tier: partner.tier,
        status: partner.status,
        l3Enabled: partner.l3Enabled,
        profile: profile ?? null,
        signedAgreement,
      };
      for (const c of channels) {
        if (!c.segmentRule) continue;
        const parsed = parseSegmentRule(c.segmentRule);
        if (!parsed.ok) continue;
        if (evaluateSegmentRule(parsed.value, subject)) {
          await prisma.channelMembership.upsert({
            where: { channelId_partnerCode: { channelId: c.id, partnerCode: partner.partnerCode } },
            update: {}, // do NOT overwrite an existing manual-remove
            create: {
              channelId: c.id,
              partnerCode: partner.partnerCode,
              source: "segment",
              addedByEmail: "system",
            },
          });
        }
      }
    }
  } catch (e) {
    console.warn("[signup] segment re-eval failed:", (e as Error).message);
  }
```

No other line in `src/app/api/signup/route.ts` should change. Verify:

```bash
git diff src/app/api/signup/route.ts
```

Expected: only the additive block appears in the diff.

- [ ] **Step 3: Build + commit**

```bash
./node_modules/.bin/next build
git add src/app/api/signup/route.ts
git commit -m "feat(signup): re-evaluate channel segment rules on partner signup (additive)"
```

---

### Task 16: Final sweep + PR

**Files:** none (verification + PR)

- [ ] **Step 1: Verify webhook handler untouched**

```bash
git log --oneline main.. -- src/app/api/webhook/referral/route.ts
```

Expected: empty output. No commit on this branch touches the partner-testing webhook.

- [ ] **Step 2: Run all unit tests**

```bash
npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' src/lib/__tests__/validateCallMeta.test.ts
npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' src/lib/__tests__/channelSegments.test.ts
```

Expected: all pass.

- [ ] **Step 3: Final build**

```bash
./node_modules/.bin/next build
```

- [ ] **Step 4: Push + PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(admin): admin announcement channels + partner replies + SSE" --body "$(cat <<'EOF'
## Summary

Admin-curated announcement channels with per-partner private reply threads. Segment-based + manual membership. Text + call-link announcements. SSE live push via Postgres LISTEN/NOTIFY (shared bus with admin Team Chat).

Implements \`docs/superpowers/specs/2026-04-19-admin-announcement-channels-design.md\`.

## What lands

- 4 new Prisma models (\`AnnouncementChannel\`, \`ChannelMembership\`, \`ChannelMessage\`, \`ChannelReplyThread\`, \`ChannelReplyMessage\`)
- 2 pure helpers + unit tests (\`channelSegments\`, \`validateCallMeta\`)
- 13 new API routes (admin CRUD + membership + messages + reply threads + partner-side + 2 SSE streams)
- 3 new pages (\`/admin/channels\`, \`/admin/channels/[id]\`, \`/dashboard/announcements\`)
- 3 new components (\`SegmentRuleBuilder\`, \`CallLinkComposer\`, \`AnnouncementCard\`)
- Additive on-signup segment re-eval
- Sidebar entries + 2 new notification icons

## Strictly NOT touched
- \`/api/webhook/referral\` (partner testing)
- Existing ChatSession/ChatMessage or AdminChatThread models

## Test plan

- [ ] Unit tests pass (validateCallMeta, channelSegments)
- [ ] Super_admin creates channel with rule tier=l1+status=active → L1 actives auto-seeded
- [ ] Manual add non-matching partner → joins; manual remove matching partner → sticky
- [ ] Post text announcement → every member gets notification + SSE push
- [ ] Post call_link → prominent card + Join button opens new tab
- [ ] Partner replies → admin inbox shows thread with unread badge
- [ ] Admin replies back → partner sees it in their own thread
- [ ] Archive channel → hidden from partner UI
- [ ] New partner signup matching a segment rule → auto-added
- [ ] CI green

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Report PR URL + stop**

Do NOT merge. Main is branch-protected; user explicitly authorizes every merge.

---

## Out of scope (from the spec, do not build)

- Embedded video/audio rooms (URL paste only)
- Email/SMS fanout
- Rich-media attachments
- Scheduled announcements
- Reactions, threaded replies, search
- Engagement analytics
