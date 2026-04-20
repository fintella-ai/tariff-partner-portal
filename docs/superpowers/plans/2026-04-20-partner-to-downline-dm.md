# Partner-to-Downline DM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship partner-to-downline direct messaging restricted to direct parent-child pairs (L1↔L2, L2↔L3; no skip-level). Partners flag abuse → admins with review role dismiss or confirm (→ auto-suspend). SSE live push on shared `admin_chat_events` bus.

**Architecture:** 5 new Prisma models (`PartnerDmThread`, `PartnerDmMessage`, `PartnerDmFlag`, `PartnerDmThrottle`, `PartnerDmReadState`). Two pure helpers (`partnerDmGate.ts` + tests, message-rate helper). 11 new API routes. 4 new pages + 1 component. Privacy gate: admins ONLY see a 20-message window around a flagged message — never browse arbitrary threads. Additive only; does NOT modify `/api/webhook/referral` or any existing chat models.

**Tech Stack:** Next.js 14 App Router, Prisma 5.20, Neon Postgres, React 18, `pg` for SSE LISTEN (already installed), `node:assert` tests via `npx ts-node`.

**Spec:** `docs/superpowers/specs/2026-04-20-partner-to-downline-dm-design.md`

**⚠️ Hard constraints:**

- Do NOT modify `src/app/api/webhook/referral/route.ts`. Partners are testing POST + PATCH.
- Do NOT modify `ChatSession`, `ChatMessage`, `AdminChatThread*`, `AnnouncementChannel*` or any message-related model that already exists. This feature adds 5 brand-new models alongside.
- The relationship gate in Task 2 is load-bearing security. Every message POST and thread create MUST call `canPartnersDm`. A skipped gate check == a cross-tree leak.
- Admins CANNOT browse partner DM threads. Only 20-message windows around flagged messages. Enforce server-side in `GET /api/admin/partner-dm-flags/[id]` — the handler builds the context slice; admin routes have no thread-browse endpoint.

---

### Task 1: Schema — 5 new models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Append the 5 models**

Paste verbatim from spec § Schema:
- `PartnerDmThread`
- `PartnerDmMessage`
- `PartnerDmFlag`
- `PartnerDmThrottle`
- `PartnerDmReadState`

- [ ] **Step 2: `npx prisma generate` + `./node_modules/.bin/next build`**

Expected: compiles. Local `prisma db push` will fail without `DATABASE_URL` — skip; Vercel applies on deploy.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): partner-to-downline DM tables + flag + throttle + read state"
```

---

### Task 2: `partnerDmGate` pure helper + failing tests

**Files:**
- Create: `src/lib/partnerDmGate.ts`
- Create: `src/lib/__tests__/partnerDmGate.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
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
```

- [ ] **Step 2: Run to verify fail**

```bash
npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' src/lib/__tests__/partnerDmGate.test.ts
```

- [ ] **Step 3: Implementation**

```ts
// src/lib/partnerDmGate.ts
export type GateSubject = {
  partnerCode: string;
  tier: string;
  referredByPartnerCode: string | null;
};

/**
 * True iff a and b are in a direct parent-child relationship AND of the
 * permitted tiers for this feature: L1↔direct L2, or L2↔direct L3.
 * No skip-level. No siblings. No same-tier. No self.
 */
export function canPartnersDm(a: GateSubject, b: GateSubject): boolean {
  if (!a || !b) return false;
  if (a.partnerCode === b.partnerCode) return false;

  // L1 ↔ direct L2
  if (a.tier === "l1" && b.tier === "l2" && b.referredByPartnerCode === a.partnerCode) return true;
  if (b.tier === "l1" && a.tier === "l2" && a.referredByPartnerCode === b.partnerCode) return true;

  // L2 ↔ direct L3
  if (a.tier === "l2" && b.tier === "l3" && b.referredByPartnerCode === a.partnerCode) return true;
  if (b.tier === "l2" && a.tier === "l3" && a.referredByPartnerCode === b.partnerCode) return true;

  return false;
}

/**
 * Return [a, b] sorted alphabetically for canonical storage. Returns null
 * if the two codes are identical (self-DM would be invalid).
 */
export function canonicalizePair(a: string, b: string): [string, string] | null {
  if (a === b) return null;
  return a < b ? [a, b] : [b, a];
}
```

- [ ] **Step 4: Run to verify pass**

Expected: `10 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/partnerDmGate.ts src/lib/__tests__/partnerDmGate.test.ts
git commit -m "feat(lib): partnerDmGate — canPartnersDm + canonicalizePair with 10 unit tests"
```

---

### Task 3: Thread list + create endpoints — `/api/partner-dm/threads`

**Files:**
- Create: `src/app/api/partner-dm/threads/route.ts`

- [ ] **Step 1: Write the handler**

```ts
// src/app/api/partner-dm/threads/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canPartnersDm, canonicalizePair } from "@/lib/partnerDmGate";

export async function GET() {
  const session = await auth();
  const partnerCode = (session?.user as any)?.partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const threads = await prisma.partnerDmThread.findMany({
    where: { OR: [{ participantA: partnerCode }, { participantB: partnerCode }] },
    orderBy: { lastMessageAt: "desc" },
    include: {
      readStates: { where: { partnerCode } },
    },
  });

  // Counterparty names for display
  const counterCodes = threads.map((t) => (t.participantA === partnerCode ? t.participantB : t.participantA));
  const partners = counterCodes.length
    ? await prisma.partner.findMany({
        where: { partnerCode: { in: counterCodes } },
        select: { partnerCode: true, firstName: true, lastName: true },
      })
    : [];
  const nameMap: Record<string, string> = {};
  for (const p of partners) nameMap[p.partnerCode] = `${p.firstName} ${p.lastName}`.trim();

  // Unread counts
  const enriched = await Promise.all(threads.map(async (t) => {
    const rs = t.readStates[0];
    const unreadCount = await prisma.partnerDmMessage.count({
      where: {
        threadId: t.id,
        deletedAt: null,
        senderPartnerCode: { not: partnerCode },
        createdAt: rs ? { gt: rs.lastReadAt } : undefined,
      },
    });
    const counterparty = t.participantA === partnerCode ? t.participantB : t.participantA;
    const { readStates: _r, ...rest } = t;
    return {
      ...rest,
      counterpartyCode: counterparty,
      counterpartyName: nameMap[counterparty] ?? counterparty,
      unreadCount,
    };
  }));

  return NextResponse.json({ threads: enriched });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const partnerCode = (session?.user as any)?.partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const counterpartyCode = body?.counterpartyCode;
  if (!counterpartyCode || typeof counterpartyCode !== "string") {
    return NextResponse.json({ error: "counterpartyCode required" }, { status: 400 });
  }

  // Load both partners
  const [me, other] = await Promise.all([
    prisma.partner.findUnique({ where: { partnerCode } }),
    prisma.partner.findUnique({ where: { partnerCode: counterpartyCode } }),
  ]);
  if (!me || !other) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

  if (!canPartnersDm(me, other)) {
    return NextResponse.json({ error: "Partners are not in a direct parent-child relationship" }, { status: 403 });
  }

  const pair = canonicalizePair(me.partnerCode, other.partnerCode);
  if (!pair) return NextResponse.json({ error: "Invalid pair" }, { status: 400 });

  const thread = await prisma.partnerDmThread.upsert({
    where: { participantA_participantB: { participantA: pair[0], participantB: pair[1] } },
    update: {},
    create: { participantA: pair[0], participantB: pair[1] },
  });
  return NextResponse.json({ thread }, { status: 201 });
}
```

- [ ] **Step 2: Build + commit**

```bash
./node_modules/.bin/next build
git add src/app/api/partner-dm/threads/route.ts
git commit -m "feat(api): partner DM thread list + create with gate validation"
```

---

### Task 4: Single-thread GET — `/api/partner-dm/threads/[id]`

**Files:**
- Create: `src/app/api/partner-dm/threads/[id]/route.ts`

- [ ] **Step 1: Write the handler**

```ts
// src/app/api/partner-dm/threads/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const partnerCode = (session?.user as any)?.partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const thread = await prisma.partnerDmThread.findUnique({ where: { id: params.id } });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  if (thread.participantA !== partnerCode && thread.participantB !== partnerCode) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const messages = await prisma.partnerDmMessage.findMany({
    where: { threadId: params.id },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  return NextResponse.json({ thread, messages });
}
```

- [ ] **Step 2: Build + commit**

```bash
./node_modules/.bin/next build
git add src/app/api/partner-dm/threads/\[id\]/route.ts
git commit -m "feat(api): partner DM thread GET with participant-only gate"
```

---

### Task 5: Rate-limit + throttle helper

**Files:**
- Create: `src/lib/partnerDmRateLimit.ts`

- [ ] **Step 1: Implementation**

```ts
// src/lib/partnerDmRateLimit.ts
import { prisma } from "@/lib/prisma";

const BASELINE_PER_HOUR = 60;
const THROTTLED_PER_HOUR = 1;
const WINDOW_MS = 60 * 60 * 1000;

// In-memory sliding window per serverless instance, keyed by senderPartnerCode.
const store = new Map<string, number[]>();

export type RateLimitCheck =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Gate a message POST against the sender's rate + throttle + suspend state.
 * Returns ok=true if the send is allowed and records the timestamp.
 */
export async function checkPartnerDmRateLimit(senderPartnerCode: string): Promise<RateLimitCheck> {
  // Check suspend / throttle state first.
  const throttle = await prisma.partnerDmThrottle.findUnique({
    where: { partnerCode: senderPartnerCode },
  });
  const active = throttle && !throttle.liftedAt ? throttle : null;

  if (active?.state === "suspended") {
    return { ok: false, status: 403, error: "DM privileges suspended pending review" };
  }

  const cap = active?.state === "throttled" ? THROTTLED_PER_HOUR : BASELINE_PER_HOUR;

  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const arr = (store.get(senderPartnerCode) || []).filter((t) => t > windowStart);
  if (arr.length >= cap) {
    return { ok: false, status: 429, error: "Rate limit exceeded" };
  }
  arr.push(now);
  store.set(senderPartnerCode, arr);
  return { ok: true };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/partnerDmRateLimit.ts
git commit -m "feat(lib): partnerDm rate-limit helper (baseline/throttled/suspended)"
```

---

### Task 6: Message POST — `/api/partner-dm/threads/[id]/messages`

**Files:**
- Create: `src/app/api/partner-dm/threads/[id]/messages/route.ts`

- [ ] **Step 1: Write the handler**

```ts
// src/app/api/partner-dm/threads/[id]/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canPartnersDm } from "@/lib/partnerDmGate";
import { checkPartnerDmRateLimit } from "@/lib/partnerDmRateLimit";
import { publishPortalChatEvent } from "@/lib/portalChatEvents";

const MAX_CONTENT = 10_000;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const partnerCode = (session?.user as any)?.partnerCode;
  const partnerName = session?.user?.name || partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const content = body?.content;
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }
  if (content.length > MAX_CONTENT) return NextResponse.json({ error: "content too long" }, { status: 400 });

  const thread = await prisma.partnerDmThread.findUnique({ where: { id: params.id } });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  if (thread.participantA !== partnerCode && thread.participantB !== partnerCode) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Re-validate relationship at send time (tier might have changed).
  const [me, other] = await Promise.all([
    prisma.partner.findUnique({ where: { partnerCode } }),
    prisma.partner.findUnique({ where: { partnerCode: partnerCode === thread.participantA ? thread.participantB : thread.participantA } }),
  ]);
  if (!me || !other || !canPartnersDm(me, other)) {
    return NextResponse.json({ error: "Direct parent-child relationship no longer valid" }, { status: 403 });
  }

  const rate = await checkPartnerDmRateLimit(partnerCode);
  if (!rate.ok) return NextResponse.json({ error: rate.error }, { status: rate.status });

  const msg = await prisma.$transaction(async (tx) => {
    const m = await tx.partnerDmMessage.create({
      data: {
        threadId: params.id,
        senderPartnerCode: partnerCode,
        content: content.trim(),
      },
    });
    await tx.partnerDmThread.update({
      where: { id: params.id },
      data: { lastMessageAt: new Date() },
    });
    return m;
  });

  const recipient = partnerCode === thread.participantA ? thread.participantB : thread.participantA;
  await prisma.notification.create({
    data: {
      recipientType: "partner",
      recipientId: recipient,
      type: "partner_dm_message",
      title: `${partnerName} sent a message`,
      message: content.slice(0, 100),
      link: `/dashboard/messages/${params.id}`,
    },
  }).catch(() => {});

  await publishPortalChatEvent({ event: "partner_dm.message.created" as any, threadId: params.id, messageId: msg.id } as any);

  return NextResponse.json({ message: msg }, { status: 201 });
}
```

- [ ] **Step 2: Build + commit**

```bash
./node_modules/.bin/next build
git add src/app/api/partner-dm/threads/\[id\]/messages/route.ts
git commit -m "feat(api): partner DM message POST — gate + rate limit + SSE + notification"
```

---

### Task 7: Read-state + edit + delete

**Files:**
- Create: `src/app/api/partner-dm/threads/[id]/read/route.ts`
- Create: `src/app/api/partner-dm/messages/[id]/route.ts`

- [ ] **Step 1: Read POST**

```ts
// src/app/api/partner-dm/threads/[id]/read/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const partnerCode = (session?.user as any)?.partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const thread = await prisma.partnerDmThread.findUnique({ where: { id: params.id } });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  if (thread.participantA !== partnerCode && thread.participantB !== partnerCode) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.partnerDmReadState.upsert({
    where: { threadId_partnerCode: { threadId: params.id, partnerCode } },
    update: { lastReadAt: new Date() },
    create: { threadId: params.id, partnerCode },
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Edit + soft-delete (PATCH + DELETE)**

```ts
// src/app/api/partner-dm/messages/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishPortalChatEvent } from "@/lib/portalChatEvents";

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

async function gate(params: { id: string }, session: any) {
  const partnerCode = (session?.user as any)?.partnerCode;
  if (!partnerCode) return { err: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const msg = await prisma.partnerDmMessage.findUnique({ where: { id: params.id } });
  if (!msg) return { err: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (msg.senderPartnerCode !== partnerCode) return { err: NextResponse.json({ error: "Only sender can edit or delete" }, { status: 403 }) };
  if (Date.now() - new Date(msg.createdAt).getTime() > EDIT_WINDOW_MS) {
    return { err: NextResponse.json({ error: "Edit window expired" }, { status: 403 }) };
  }
  return { msg };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const g = await gate(params, session); if (g.err) return g.err;
  const body = await req.json().catch(() => null);
  if (!body?.content || typeof body.content !== "string") return NextResponse.json({ error: "content required" }, { status: 400 });
  const updated = await prisma.partnerDmMessage.update({
    where: { id: params.id },
    data: { content: body.content, editedAt: new Date() },
  });
  await publishPortalChatEvent({ event: "partner_dm.message.updated" as any, threadId: updated.threadId, messageId: updated.id } as any);
  return NextResponse.json({ message: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const g = await gate(params, session); if (g.err) return g.err;
  const updated = await prisma.partnerDmMessage.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  });
  await publishPortalChatEvent({ event: "partner_dm.message.deleted" as any, threadId: updated.threadId, messageId: updated.id } as any);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Build + commit**

```bash
./node_modules/.bin/next build
git add src/app/api/partner-dm/threads/\[id\]/read/route.ts src/app/api/partner-dm/messages/\[id\]/route.ts
git commit -m "feat(api): partner DM read-state + sender edit/soft-delete (24h window)"
```

---

### Task 8: Extend `PortalChatEvent` union with partner_dm event names

**Files:**
- Modify: `src/lib/portalChatEvents.ts`

- [ ] **Step 1: Add new event literals**

Find the `PortalChatEvent` union type. Add four new members:

```ts
  | { event: "partner_dm.message.created"; threadId: string; messageId: string }
  | { event: "partner_dm.message.updated"; threadId: string; messageId: string }
  | { event: "partner_dm.message.deleted"; threadId: string; messageId: string }
  | { event: "partner_dm.flag.created"; flagId: string; messageId: string }
```

- [ ] **Step 2: Remove the `as any` casts in tasks 6/7 (safer typing)**

In `src/app/api/partner-dm/threads/[id]/messages/route.ts` and `src/app/api/partner-dm/messages/[id]/route.ts`, remove the `as any` around the `publishPortalChatEvent({...})` calls now that the union accepts them.

- [ ] **Step 3: Build + commit**

```bash
./node_modules/.bin/next build
git add src/lib/portalChatEvents.ts src/app/api/partner-dm/threads/\[id\]/messages/route.ts src/app/api/partner-dm/messages/\[id\]/route.ts
git commit -m "feat(events): add partner_dm.* event names to PortalChatEvent union"
```

---

### Task 9: Flag POST — `/api/partner-dm/messages/[id]/flag`

**Files:**
- Create: `src/app/api/partner-dm/messages/[id]/flag/route.ts`

- [ ] **Step 1: Handler**

```ts
// src/app/api/partner-dm/messages/[id]/flag/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishPortalChatEvent } from "@/lib/portalChatEvents";

const FLAG_DAILY_LIMIT = 10;
const FLAG_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const flaggerPartnerCode = (session?.user as any)?.partnerCode;
  if (!flaggerPartnerCode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const msg = await prisma.partnerDmMessage.findUnique({
    where: { id: params.id },
    include: { thread: true },
  });
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (msg.deletedAt) return NextResponse.json({ error: "Message deleted" }, { status: 404 });

  // Must be participant, must not be own message.
  const isParticipant =
    msg.thread.participantA === flaggerPartnerCode || msg.thread.participantB === flaggerPartnerCode;
  if (!isParticipant) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (msg.senderPartnerCode === flaggerPartnerCode) {
    return NextResponse.json({ error: "Cannot flag your own message" }, { status: 400 });
  }

  // Daily-flag cap per flagger
  const recent = await prisma.partnerDmFlag.count({
    where: { flaggerPartnerCode, createdAt: { gt: new Date(Date.now() - FLAG_WINDOW_MS) } },
  });
  if (recent >= FLAG_DAILY_LIMIT) return NextResponse.json({ error: "Flag limit reached for today" }, { status: 429 });

  // Duplicate check
  const dup = await prisma.partnerDmFlag.findFirst({
    where: { messageId: params.id, flaggerPartnerCode, reviewedAt: null },
  });
  if (dup) return NextResponse.json({ error: "Message already flagged by you" }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const reason = typeof body?.reason === "string" ? body.reason.slice(0, 1000) : null;

  const flag = await prisma.partnerDmFlag.create({
    data: { messageId: params.id, flaggerPartnerCode, reason },
  });

  // Throttle the sender (if not already throttled or suspended)
  const existing = await prisma.partnerDmThrottle.findUnique({ where: { partnerCode: msg.senderPartnerCode } });
  if (!existing || existing.liftedAt) {
    await prisma.partnerDmThrottle.upsert({
      where: { partnerCode: msg.senderPartnerCode },
      update: { state: "throttled", reasonFlagId: flag.id, startedAt: new Date(), liftedAt: null },
      create: { partnerCode: msg.senderPartnerCode, state: "throttled", reasonFlagId: flag.id },
    });
  }

  // Notify admins with review role
  const reviewers = await prisma.user.findMany({
    where: { role: { in: ["super_admin", "admin", "partner_support"] } },
    select: { email: true },
  });
  if (reviewers.length > 0) {
    await prisma.notification.createMany({
      data: reviewers.map((r) => ({
        recipientType: "admin",
        recipientId: r.email,
        type: "partner_dm_flag",
        title: "Partner DM flagged for review",
        message: (reason ?? msg.content).slice(0, 100),
        link: `/admin/partner-dm-flags/${flag.id}`,
      })),
    }).catch(() => {});
  }

  await publishPortalChatEvent({ event: "partner_dm.flag.created", flagId: flag.id, messageId: msg.id });

  return NextResponse.json({ flag }, { status: 201 });
}
```

- [ ] **Step 2: Build + commit**

```bash
./node_modules/.bin/next build
git add src/app/api/partner-dm/messages/\[id\]/flag/route.ts
git commit -m "feat(api): partner DM flag POST — throttle sender + notify reviewers"
```

---

### Task 10: Admin flag inbox + detail + review + manual lift

**Files:**
- Create: `src/app/api/admin/partner-dm-flags/route.ts`
- Create: `src/app/api/admin/partner-dm-flags/[id]/route.ts`
- Create: `src/app/api/admin/partner-dm-flags/[id]/review/route.ts`
- Create: `src/app/api/admin/partner-dm-flags/suspensions/[partnerCode]/lift/route.ts`

Reviewer roles: `super_admin`, `admin`, `partner_support`. Accounting is 403. Manual suspension-lift: super_admin only.

- [ ] **Step 1: Inbox list**

```ts
// src/app/api/admin/partner-dm-flags/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const REVIEWER_ROLES = new Set(["super_admin", "admin", "partner_support"]);

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!role || !REVIEWER_ROLES.has(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const status = new URL(req.url).searchParams.get("status") || "pending"; // "pending" | "reviewed" | "all"
  const where =
    status === "pending" ? { reviewedAt: null } :
    status === "reviewed" ? { reviewedAt: { not: null } } :
    {};

  const flags = await prisma.partnerDmFlag.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { message: true },
  });
  return NextResponse.json({ flags });
}
```

- [ ] **Step 2: Flag detail (includes 20-message context slice — the ONLY way an admin sees non-flagged messages)**

```ts
// src/app/api/admin/partner-dm-flags/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const REVIEWER_ROLES = new Set(["super_admin", "admin", "partner_support"]);

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!role || !REVIEWER_ROLES.has(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const flag = await prisma.partnerDmFlag.findUnique({
    where: { id: params.id },
    include: { message: { include: { thread: true } } },
  });
  if (!flag) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // 20 messages of context from the flagged message's thread (10 before + 10 after incl. flagged)
  const thread = flag.message.thread;
  const before = await prisma.partnerDmMessage.findMany({
    where: { threadId: thread.id, createdAt: { lt: flag.message.createdAt } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const after = await prisma.partnerDmMessage.findMany({
    where: { threadId: thread.id, createdAt: { gt: flag.message.createdAt } },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  const context = [...before.reverse(), flag.message, ...after];

  return NextResponse.json({ flag, thread, context });
}
```

- [ ] **Step 3: Review POST (dismiss → lift; confirm → suspend)**

```ts
// src/app/api/admin/partner-dm-flags/[id]/review/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const REVIEWER_ROLES = new Set(["super_admin", "admin", "partner_support"]);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const reviewerEmail = session?.user?.email;
  const reviewerName = session?.user?.name || reviewerEmail || "Admin";
  if (!role || !reviewerEmail || !REVIEWER_ROLES.has(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const verdict = body?.verdict;
  if (verdict !== "dismissed" && verdict !== "confirmed") return NextResponse.json({ error: "verdict must be 'dismissed' or 'confirmed'" }, { status: 400 });

  const flag = await prisma.partnerDmFlag.findUnique({ where: { id: params.id }, include: { message: true } });
  if (!flag) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (flag.reviewedAt) return NextResponse.json({ error: "Flag already reviewed" }, { status: 409 });

  await prisma.partnerDmFlag.update({
    where: { id: params.id },
    data: { verdict, reviewedAt: new Date(), reviewedByAdminEmail: reviewerEmail },
  });

  const senderCode = flag.message.senderPartnerCode;
  if (verdict === "dismissed") {
    // Lift throttle IF it was set by this flag
    await prisma.partnerDmThrottle.updateMany({
      where: { partnerCode: senderCode, reasonFlagId: flag.id, liftedAt: null },
      data: { liftedAt: new Date() },
    });
    // Notify flagger + sender
    await prisma.notification.createMany({
      data: [
        {
          recipientType: "partner", recipientId: flag.flaggerPartnerCode,
          type: "partner_dm_flag_outcome",
          title: "Flag dismissed",
          message: `${reviewerName} reviewed your flag; no violation was found.`,
          link: `/dashboard/messages`,
        },
        {
          recipientType: "partner", recipientId: senderCode,
          type: "partner_dm_flag_outcome",
          title: "Messaging restored",
          message: `A flag on your message was reviewed and dismissed. Normal messaging is restored.`,
          link: `/dashboard/messages`,
        },
      ],
    }).catch(() => {});
  } else {
    // Promote to suspend (upsert — overrides any existing throttle)
    await prisma.partnerDmThrottle.upsert({
      where: { partnerCode: senderCode },
      update: { state: "suspended", reasonFlagId: flag.id, startedAt: new Date(), liftedAt: null },
      create: { partnerCode: senderCode, state: "suspended", reasonFlagId: flag.id },
    });
    await prisma.notification.create({
      data: {
        recipientType: "partner", recipientId: senderCode,
        type: "partner_dm_flag_outcome",
        title: "DM privileges suspended",
        message: "A flag on your message was confirmed. Contact support to appeal.",
        link: "/dashboard/support",
      },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Manual lift suspension (super_admin only)**

```ts
// src/app/api/admin/partner-dm-flags/suspensions/[partnerCode]/lift/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_req: NextRequest, { params }: { params: { partnerCode: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role !== "super_admin") return NextResponse.json({ error: "Forbidden (super_admin only)" }, { status: 403 });

  await prisma.partnerDmThrottle.updateMany({
    where: { partnerCode: params.partnerCode, liftedAt: null },
    data: { liftedAt: new Date() },
  });
  await prisma.notification.create({
    data: {
      recipientType: "partner", recipientId: params.partnerCode,
      type: "partner_dm_flag_outcome",
      title: "DM privileges restored",
      message: "Your DM suspension has been lifted by a super admin.",
      link: "/dashboard/messages",
    },
  }).catch(() => {});
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Build + commit**

```bash
./node_modules/.bin/next build
git add src/app/api/admin/partner-dm-flags/route.ts src/app/api/admin/partner-dm-flags/\[id\]/route.ts src/app/api/admin/partner-dm-flags/\[id\]/review/route.ts src/app/api/admin/partner-dm-flags/suspensions/\[partnerCode\]/lift/route.ts
git commit -m "feat(api): admin flag inbox + detail (20-msg context) + review + super_admin lift"
```

---

### Task 11: SSE streams — partner + admin flag inbox

**Files:**
- Create: `src/app/api/partner-dm/stream/route.ts`
- Create: `src/app/api/admin/partner-dm-flags/stream/route.ts`

Both mirror the existing pattern from announcement channels (`pg` LISTEN on `admin_chat_events`), filtering by `threadId` or by `event.startsWith("partner_dm.flag.")` respectively. Full code omitted from this doc — follow the exact pattern in `src/app/api/admin/channels/stream/route.ts` (landed in #299).

- [ ] **Step 1: Copy the pattern from announcement-channels stream, swap:**
  - Partner stream: gate on `partnerCode` + verify they're a participant of `threadId`; filter events where `parsed.threadId === threadId && parsed.event?.startsWith?.("partner_dm.message.")`.
  - Admin stream: gate on `REVIEWER_ROLES`; filter events where `parsed.event?.startsWith?.("partner_dm.flag.")`.

- [ ] **Step 2: Build + commit**

```bash
./node_modules/.bin/next build
git add src/app/api/partner-dm/stream/route.ts src/app/api/admin/partner-dm-flags/stream/route.ts
git commit -m "feat(api): SSE streams for partner DM messages + admin flag inbox"
```

---

### Task 12: `FlagButton` component + partner UI

**Files:**
- Create: `src/components/ui/FlagButton.tsx`
- Create: `src/app/(partner)/dashboard/messages/page.tsx`
- Create: `src/app/(partner)/dashboard/messages/[threadId]/page.tsx`

- [ ] **Step 1: `FlagButton` — hover-revealed button, opens a small prompt for reason.**

```tsx
// src/components/ui/FlagButton.tsx
"use client";
import { useState } from "react";

export default function FlagButton({ messageId, onFlagged }: { messageId: string; onFlagged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="font-body text-[10px] text-red-400/60 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        🚩 Flag
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setOpen(false)}>
          <div className="bg-[var(--app-bg-secondary)] border border-[var(--app-border)] rounded-xl p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="font-body font-semibold text-sm mb-2">Flag this message</div>
            <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-3">An admin will review. The sender will be restricted to 1 message / hour until the review completes.</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional)"
              rows={3}
              className="w-full bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-3 py-2 font-body text-[12px] mb-3"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setOpen(false)} className="font-body text-[12px] px-4 py-2 rounded-lg border border-[var(--app-border)]">Cancel</button>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await fetch(`/api/partner-dm/messages/${messageId}/flag`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ reason: reason || undefined }),
                    });
                    if (r.ok) { onFlagged?.(); setOpen(false); }
                    else { const d = await r.json(); alert(d.error || "Flag failed"); }
                  } finally { setBusy(false); }
                }}
                className="font-body text-[12px] px-4 py-2 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30"
              >
                {busy ? "..." : "Flag"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: `/dashboard/messages/page.tsx` — thread list.** Follow the existing `/admin/chat/page.tsx` polling + selection pattern, scoped to partner session. Left rail = threads, click navigates to `/dashboard/messages/[threadId]`.

- [ ] **Step 3: `/dashboard/messages/[threadId]/page.tsx` — conversation view.** Message stream + compose + SSE connect + `FlagButton` on hover over each incoming message (not own messages).

- [ ] **Step 4: Build + commit**

```bash
./node_modules/.bin/next build
git add src/components/ui/FlagButton.tsx src/app/\(partner\)/dashboard/messages/page.tsx src/app/\(partner\)/dashboard/messages/\[threadId\]/page.tsx
git commit -m "feat(ui): /dashboard/messages partner DM UI + FlagButton component"
```

---

### Task 13: Admin flag-inbox UI

**Files:**
- Create: `src/app/(admin)/admin/partner-dm-flags/page.tsx`
- Create: `src/app/(admin)/admin/partner-dm-flags/[id]/page.tsx`

- [ ] **Step 1: List page with filter pills (Pending / Reviewed / All), fetches `/api/admin/partner-dm-flags?status=…`.**

- [ ] **Step 2: Detail page with flagged-message highlight + 20-message context + Dismiss/Confirm buttons. Each button POSTs to `/api/admin/partner-dm-flags/[id]/review` with the corresponding verdict.**

- [ ] **Step 3: Build + commit**

```bash
./node_modules/.bin/next build
git add src/app/\(admin\)/admin/partner-dm-flags/page.tsx src/app/\(admin\)/admin/partner-dm-flags/\[id\]/page.tsx
git commit -m "feat(ui): /admin/partner-dm-flags inbox + flag detail with Dismiss/Confirm"
```

---

### Task 14: Sidebar nav + Downline "Message" button + NotificationBell icons

**Files:**
- Modify: `src/app/(partner)/dashboard/layout.tsx`
- Modify: `src/app/(admin)/admin/layout.tsx`
- Modify: `src/lib/permissions.ts`
- Modify: `src/components/ui/NotificationBell.tsx`
- Modify: `src/app/(partner)/dashboard/downline/page.tsx`

- [ ] **Step 1: Partner sidebar — add "Messages" entry pointing to `/dashboard/messages`, icon 💬.**

- [ ] **Step 2: Admin sidebar — add "DM Flags" entry pointing to `/admin/partner-dm-flags`, icon 🚩. Add `"partnerDmFlags"` to `ROLE_VISIBLE_NAV` for super_admin, admin, partner_support (NOT accounting).**

- [ ] **Step 3: NotificationBell — add to `TYPE_ICONS`:**

```tsx
  partner_dm_message: "💬",
  partner_dm_flag: "🚩",
  partner_dm_flag_outcome: "✅",
```

- [ ] **Step 4: `/dashboard/downline/page.tsx` — add a small "Message" button next to each eligible counterparty.**
  - For an L1 logged-in partner viewing their downline list: "Message" button on every L2 direct child (NOT L3 grandchildren).
  - For an L2 partner: "Message" button on every L3 direct child + on their own L1 parent (if shown anywhere on that page — check layout; if not shown, skip the L1 button).
  - Button click → `POST /api/partner-dm/threads { counterpartyCode }` → redirect to the returned thread's URL `/dashboard/messages/[id]`.
  - Strictly additive to the existing render; do NOT change any existing line.

- [ ] **Step 5: Build + commit**

```bash
./node_modules/.bin/next build
git add src/app/\(partner\)/dashboard/layout.tsx src/app/\(admin\)/admin/layout.tsx src/lib/permissions.ts src/components/ui/NotificationBell.tsx src/app/\(partner\)/dashboard/downline/page.tsx
git commit -m "feat(nav+ui): Messages + DM Flags sidebar entries + Downline Message buttons + notification icons"
```

---

### Task 15: Final sweep

**Files:** none

- [ ] **Step 1: Webhook untouched check**

```bash
git log --oneline main.. -- src/app/api/webhook/referral/route.ts
```

Expected: empty.

- [ ] **Step 2: Run unit tests**

```bash
npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' src/lib/__tests__/partnerDmGate.test.ts
```

Expected: `10 passed, 0 failed`.

- [ ] **Step 3: Final build**

```bash
./node_modules/.bin/next build
```

---

### Task 16: PR

- [ ] **Step 1: Push + open PR**

```bash
git push -u origin HEAD
gh pr create --title "feat: partner-to-downline DM with flag→throttle→review flow" --body "$(cat <<'EOF'
## Summary

Partner-to-downline direct messaging, strictly parent-child (L1↔L2, L2↔L3). Partners can flag any received message; flag throttles the sender to 1 msg/hr and notifies reviewers (super_admin + admin + partner_support). Reviewer dismisses (lift throttle) or confirms (promote to suspend). Super_admin can manually lift a suspension.

Implements \`docs/superpowers/specs/2026-04-20-partner-to-downline-dm-design.md\`.

## What lands

- 5 new Prisma models
- Relationship gate helper + 10 unit tests (all 4 allowed patterns + 6 disallowed patterns)
- 11 new API routes (partner CRUD + read + edit/delete + flag + SSE + admin inbox + review + lift + admin SSE)
- Rate-limit helper (60/hr baseline → 1/hr throttled → 0 suspended)
- Partner UI: \`/dashboard/messages\` + \`FlagButton\` component
- Admin UI: \`/admin/partner-dm-flags\` list + detail pages
- Sidebar entries + \`/dashboard/downline\` "Message" buttons + 3 new notification icons
- SSE live push via shared \`admin_chat_events\` bus (4 new event literals added to PortalChatEvent union)

## Strictly NOT touched
- \`/api/webhook/referral\`
- Any existing chat model (ChatSession, AdminChatThread*, AnnouncementChannel*)

## Test plan

- [ ] Unit tests: partnerDmGate 10/10 pass
- [ ] L1 → their direct L2 → works
- [ ] L1 → L3 (skip-level) → 403
- [ ] Two siblings under same L1 → 403
- [ ] Flag triggers throttle + notifies all three reviewer roles (not accounting)
- [ ] Throttled sender capped at 1 msg/hr across all their threads
- [ ] Dismiss lifts throttle; Confirm promotes to suspend
- [ ] Admin DOES NOT browse non-flagged threads (detail page only shows flagged-msg + 20 context)
- [ ] CI green

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Stop — do not merge. Report PR URL to user.**

---

## Out of scope (from the spec, do not build)

- Group chats (>2)
- Attachments, images, files
- Threaded replies, reactions, emoji
- Message search
- Visible read receipts to the other party
- Typing indicators
