# Admin Internal Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the real-time admin-only chat at `/admin/team-chat` with global room + per-deal threads, `@mention` autocomplete + notifications, deal-chip tagging, `DealNote` mirror for deal-scoped messages, per-user read state, soft-delete, 24h edit window, SSE transport with polling fallback.

**Architecture:** Four new Prisma models (`AdminChatThread`, `AdminChatMessage`, `AdminChatMention`, `AdminChatReadState`) + one new `DealNote.sourceChatMessageId` column. Two pure helpers (`renderAdminChatContent`, `parseMentions`) with unit tests. New API routes under `/api/admin/team-chat/*` (list/get/post/patch/delete/read/admins/stream). New `<MentionInput>` component. New page `/admin/team-chat` with three-pane desktop layout. SSE event bus via Postgres `LISTEN`/`NOTIFY`. Sidebar nav entry with unread badge. Eager per-deal thread creation inside the existing `/api/webhook/referral` POST transaction — strictly additive, no existing behavior changes.

**Tech Stack:** Next.js 14 App Router, Prisma 5.20, Neon Postgres, React 18, `node:assert` tests via `npx ts-node`.

**Spec:** `docs/superpowers/specs/2026-04-19-admin-internal-chat-design.md`

**⚠️ Hard constraints:**

- Do NOT change existing POST/PATCH success behavior on `src/app/api/webhook/referral/route.ts`. The new `getOrCreateDealThread(prisma, dealId)` call must run INSIDE the existing Prisma transaction that wraps `Deal.create`, and must be a pure additive append — no changes to auth, HMAC, field extraction, response shape, or error handling. If the call fails, the deal-create transaction rolls back only as it already does today; there is no new error path.
- Do NOT change existing `ChatSession` / `ChatMessage` models — those stay reserved for the partner-support chat at `/admin/chat`.
- All new API routes session-gated to `isAnyAdmin(role)` via `@/lib/permissions`.

---

### Task 1: Schema — add 4 new models + 1 new DealNote column

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Append the new models to schema.prisma**

Add to `prisma/schema.prisma`, after the existing `ChatMessage` model:

```prisma
// ─── ADMIN TEAM CHAT (internal, admin-only collaboration) ───────────────────

model AdminChatThread {
  id            String   @id @default(cuid())
  type          String   // "global" | "deal"
  dealId        String?  @unique
  lastMessageAt DateTime @default(now())
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  messages   AdminChatMessage[]
  readStates AdminChatReadState[]

  @@index([type])
  @@index([lastMessageAt])
}

model AdminChatMessage {
  id              String    @id @default(cuid())
  threadId        String
  senderEmail     String
  senderName      String
  content         String
  parentMessageId String?
  editedAt        DateTime?
  deletedAt       DateTime?
  createdAt       DateTime  @default(now())

  thread   AdminChatThread    @relation(fields: [threadId], references: [id], onDelete: Cascade)
  mentions AdminChatMention[]

  @@index([threadId, createdAt])
  @@index([parentMessageId])
}

model AdminChatMention {
  id                  String    @id @default(cuid())
  messageId           String
  mentionedAdminEmail String
  notifiedAt          DateTime?
  acknowledgedAt      DateTime?
  createdAt           DateTime  @default(now())

  message AdminChatMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@index([mentionedAdminEmail])
  @@index([messageId])
}

model AdminChatReadState {
  id                String   @id @default(cuid())
  threadId          String
  adminEmail        String
  lastReadMessageId String?
  lastReadAt        DateTime @default(now())

  thread AdminChatThread @relation(fields: [threadId], references: [id], onDelete: Cascade)

  @@unique([threadId, adminEmail])
  @@index([adminEmail])
}
```

- [ ] **Step 2: Add `sourceChatMessageId` column to the existing `DealNote` model**

Find `model DealNote` in `prisma/schema.prisma` (around line 313). Add inside the block, before the closing `}`:

```prisma
  sourceChatMessageId String?  // when DealNote was mirrored from an AdminChatMessage

  @@index([sourceChatMessageId])
```

- [ ] **Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client ... in XXms`.

- [ ] **Step 4: Build to verify TS compiles**

```bash
./node_modules/.bin/next build
```

Expected: `✓ Compiled successfully`. New Prisma types are available on `prisma.adminChatThread` etc.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): admin team chat tables + DealNote.sourceChatMessageId"
```

---

### Task 2: Pure helpers — `parseMentions` with failing tests

**Files:**
- Create: `src/lib/parseMentions.ts`
- Create: `src/lib/__tests__/parseMentions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' src/lib/__tests__/parseMentions.test.ts
```

Expected: module-not-found error for `../parseMentions`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/parseMentions.ts
const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;
const DEAL_RE = /\[deal:([a-z0-9]+)\]/gi;

export function parseMentions(content: string): string[] {
  const emails = new Set<string>();
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(content)) !== null) emails.add(m[2]);
  return Array.from(emails);
}

export function parseDealRefs(content: string): string[] {
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  DEAL_RE.lastIndex = 0;
  while ((m = DEAL_RE.exec(content)) !== null) ids.add(m[1]);
  return Array.from(ids);
}

/**
 * Replace dangling mention/deal tokens with plain text when the
 * email or deal ID is not in the valid list. Valid tokens are
 * preserved as-is.
 */
export function stripInvalidTokens(
  content: string,
  validEmails: string[],
  validDealIds: string[]
): string {
  const emailSet = new Set(validEmails);
  const dealSet = new Set(validDealIds);

  let out = content.replace(MENTION_RE, (whole, name, email) => {
    return emailSet.has(email) ? whole : name;
  });
  out = out.replace(DEAL_RE, (whole, id) => {
    return dealSet.has(id) ? whole : id;
  });
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' src/lib/__tests__/parseMentions.test.ts
```

Expected: `6 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/parseMentions.ts src/lib/__tests__/parseMentions.test.ts
git commit -m "feat(lib): parseMentions + parseDealRefs + stripInvalidTokens helpers"
```

---

### Task 3: Pure helpers — `renderAdminChatContent` with failing tests

**Files:**
- Create: `src/lib/renderAdminChatContent.ts`
- Create: `src/lib/__tests__/renderAdminChatContent.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/renderAdminChatContent.test.ts
import assert from "node:assert/strict";
import { renderAdminChatContent } from "../renderAdminChatContent";

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n    ${(e as Error).message}`); }
}

console.log("renderAdminChatContent");

test("plain text → single text segment", () => {
  const out = renderAdminChatContent("just a plain message", { deals: {} });
  assert.deepEqual(out, [{ type: "text", value: "just a plain message" }]);
});

test("mention → mention segment with email + name", () => {
  const out = renderAdminChatContent(
    "hey @[John Orlando](john@x.com) look",
    { deals: {} }
  );
  assert.deepEqual(out, [
    { type: "text", value: "hey " },
    { type: "mention", email: "john@x.com", name: "John Orlando" },
    { type: "text", value: " look" },
  ]);
});

test("deal chip → deal segment with resolved name", () => {
  const out = renderAdminChatContent(
    "see [deal:abc123] today",
    { deals: { abc123: "Acme Corp" } }
  );
  assert.deepEqual(out, [
    { type: "text", value: "see " },
    { type: "deal", dealId: "abc123", dealName: "Acme Corp" },
    { type: "text", value: " today" },
  ]);
});

test("unresolved deal chip falls back to plain id text", () => {
  const out = renderAdminChatContent(
    "see [deal:missing] gone",
    { deals: {} }
  );
  assert.deepEqual(out, [
    { type: "text", value: "see " },
    { type: "deal", dealId: "missing", dealName: null },
    { type: "text", value: " gone" },
  ]);
});

test("mixed mention + deal chip", () => {
  const out = renderAdminChatContent(
    "@[Jane](j@x.com) about [deal:d1]?",
    { deals: { d1: "Wid Co" } }
  );
  assert.deepEqual(out, [
    { type: "mention", email: "j@x.com", name: "Jane" },
    { type: "text", value: " about " },
    { type: "deal", dealId: "d1", dealName: "Wid Co" },
    { type: "text", value: "?" },
  ]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' src/lib/__tests__/renderAdminChatContent.test.ts
```

Expected: module-not-found error.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/renderAdminChatContent.ts
export type ChatSegment =
  | { type: "text"; value: string }
  | { type: "mention"; email: string; name: string }
  | { type: "deal"; dealId: string; dealName: string | null };

export type RenderCtx = { deals: Record<string, string> };

const COMBINED_RE = /@\[([^\]]+)\]\(([^)]+)\)|\[deal:([a-z0-9]+)\]/gi;

export function renderAdminChatContent(content: string, ctx: RenderCtx): ChatSegment[] {
  if (!content) return [{ type: "text", value: "" }];

  const segments: ChatSegment[] = [];
  let cursor = 0;

  COMBINED_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COMBINED_RE.exec(content)) !== null) {
    if (m.index > cursor) {
      segments.push({ type: "text", value: content.slice(cursor, m.index) });
    }
    if (m[1] !== undefined && m[2] !== undefined) {
      segments.push({ type: "mention", email: m[2], name: m[1] });
    } else if (m[3] !== undefined) {
      const dealId = m[3];
      segments.push({ type: "deal", dealId, dealName: ctx.deals[dealId] ?? null });
    }
    cursor = m.index + m[0].length;
  }
  if (cursor < content.length) {
    segments.push({ type: "text", value: content.slice(cursor) });
  }
  if (segments.length === 0) segments.push({ type: "text", value: content });
  return segments;
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' src/lib/__tests__/renderAdminChatContent.test.ts
```

Expected: `5 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/renderAdminChatContent.ts src/lib/__tests__/renderAdminChatContent.test.ts
git commit -m "feat(lib): renderAdminChatContent segment renderer + tests"
```

---

### Task 4: Global-thread ensure script + wire into build pipeline

**Files:**
- Create: `scripts/ensure-global-admin-chat-thread.ts`
- Modify: `scripts/seed-all.js`

- [ ] **Step 1: Write the ensure script**

```ts
// scripts/ensure-global-admin-chat-thread.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.adminChatThread.findFirst({
    where: { type: "global" },
  });
  if (existing) {
    console.log(`[ensure-global-admin-chat-thread] already exists: ${existing.id}`);
    return;
  }
  const t = await prisma.adminChatThread.create({
    data: { type: "global" },
  });
  console.log(`[ensure-global-admin-chat-thread] created: ${t.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Add to the build seed pipeline**

Open `scripts/seed-all.js`. At the END of the file (after any existing seed steps), add an `exec` call that runs the ensure script. Match the existing pattern used by other seed steps in that file — use the same `child_process.execSync` style or whatever pattern the file already uses. The exact line to add (adapt casing to the file's existing style):

```js
execSync('npx ts-node --compiler-options \\'{"module":"commonjs"}\\' scripts/ensure-global-admin-chat-thread.ts', { stdio: 'inherit' });
```

- [ ] **Step 3: Verify the script runs locally (if `DATABASE_URL` is available)**

If a local `.env` with `DATABASE_URL` exists, run:

```bash
npx ts-node --compiler-options '{"module":"commonjs"}' scripts/ensure-global-admin-chat-thread.ts
```

Expected: `created` (first run) or `already exists` (subsequent runs). If no local DB, the script will run on the next Vercel build and you verify by checking `/admin/team-chat` loads with a global thread row.

- [ ] **Step 4: Build to verify**

```bash
./node_modules/.bin/next build
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add scripts/ensure-global-admin-chat-thread.ts scripts/seed-all.js
git commit -m "feat(seed): ensure global admin-chat thread exists on every build"
```

---

### Task 5: Thread lookup API — `GET /api/admin/team-chat/threads`

**Files:**
- Create: `src/app/api/admin/team-chat/threads/route.ts`

- [ ] **Step 1: Write the handler**

```ts
// src/app/api/admin/team-chat/threads/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const adminEmail = session?.user?.email;
  if (!adminEmail || !isAnyAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const threads = await prisma.adminChatThread.findMany({
    where: {
      OR: [
        { type: "global" },
        { type: "deal", lastMessageAt: { gte: thirtyDaysAgo } },
      ],
    },
    orderBy: [{ type: "asc" }, { lastMessageAt: "desc" }],
    include: {
      readStates: { where: { adminEmail } },
      _count: { select: { messages: { where: { deletedAt: null } } } },
    },
  });

  // Enrich with deal names for deal-type threads
  const dealIds = threads.filter((t) => t.type === "deal" && t.dealId).map((t) => t.dealId!);
  const deals = dealIds.length
    ? await prisma.deal.findMany({ where: { id: { in: dealIds } }, select: { id: true, dealName: true } })
    : [];
  const dealMap: Record<string, string> = {};
  for (const d of deals) dealMap[d.id] = d.dealName;

  // Compute unread count per thread
  const enriched = await Promise.all(threads.map(async (t) => {
    const rs = t.readStates[0];
    const unreadCount = await prisma.adminChatMessage.count({
      where: {
        threadId: t.id,
        deletedAt: null,
        senderEmail: { not: adminEmail },
        createdAt: rs ? { gt: rs.lastReadAt } : undefined,
      },
    });
    const { readStates: _r, _count, ...rest } = t;
    return {
      ...rest,
      dealName: t.dealId ? dealMap[t.dealId] ?? null : null,
      messageCount: _count.messages,
      unreadCount,
    };
  }));

  return NextResponse.json({ threads: enriched });
}
```

- [ ] **Step 2: Build**

```bash
./node_modules/.bin/next build
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/team-chat/threads/route.ts
git commit -m "feat(api): GET /api/admin/team-chat/threads with unread counts"
```

---

### Task 6: Single-thread GET — `GET /api/admin/team-chat/threads/[id]`

**Files:**
- Create: `src/app/api/admin/team-chat/threads/[id]/route.ts`

- [ ] **Step 1: Write the handler**

```ts
// src/app/api/admin/team-chat/threads/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";
import { parseDealRefs } from "@/lib/parseMentions";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!isAnyAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
  const before = url.searchParams.get("before");

  const thread = await prisma.adminChatThread.findUnique({ where: { id: params.id } });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  const messages = await prisma.adminChatMessage.findMany({
    where: { threadId: params.id, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { mentions: true },
  });

  // Collect all deal refs from message contents and resolve names in one round-trip
  const dealRefs = new Set<string>();
  for (const m of messages) for (const id of parseDealRefs(m.content)) dealRefs.add(id);
  const deals = dealRefs.size
    ? await prisma.deal.findMany({
        where: { id: { in: Array.from(dealRefs) } },
        select: { id: true, dealName: true },
      })
    : [];
  const dealMap: Record<string, string> = {};
  for (const d of deals) dealMap[d.id] = d.dealName;

  // Include deal name for the thread itself if type=deal
  let threadDealName: string | null = null;
  if (thread.type === "deal" && thread.dealId) {
    const d = await prisma.deal.findUnique({ where: { id: thread.dealId }, select: { dealName: true } });
    threadDealName = d?.dealName ?? null;
  }

  return NextResponse.json({
    thread: { ...thread, dealName: threadDealName },
    messages: messages.reverse(), // return oldest-first for UI append
    deals: dealMap,
  });
}
```

- [ ] **Step 2: Build**

```bash
./node_modules/.bin/next build
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/team-chat/threads/\[id\]/route.ts
git commit -m "feat(api): GET /api/admin/team-chat/threads/[id] with deal resolution"
```

---

### Task 7: Admins-for-autocomplete API — `GET /api/admin/team-chat/admins`

**Files:**
- Create: `src/app/api/admin/team-chat/admins/route.ts`

- [ ] **Step 1: Write the handler**

```ts
// src/app/api/admin/team-chat/admins/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!isAnyAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admins = await prisma.user.findMany({
    select: { email: true, name: true, role: true },
    orderBy: { email: "asc" },
  });
  return NextResponse.json({ admins });
}
```

- [ ] **Step 2: Build**

```bash
./node_modules/.bin/next build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/team-chat/admins/route.ts
git commit -m "feat(api): GET /api/admin/team-chat/admins for mention autocomplete"
```

---

### Task 8: Message-post API — `POST /api/admin/team-chat/threads/[id]/messages`

This is the most complex handler: validates tokens, writes message + mentions + DealNote mirror + Notification rows, and fires `pg_notify`.

**Files:**
- Create: `src/app/api/admin/team-chat/threads/[id]/messages/route.ts`
- Create: `src/lib/adminChatEvents.ts`

- [ ] **Step 1: Write the `adminChatEvents` helper**

```ts
// src/lib/adminChatEvents.ts
import { prisma } from "@/lib/prisma";

export type AdminChatEvent =
  | { event: "message.created"; threadId: string; messageId: string }
  | { event: "message.updated"; threadId: string; messageId: string }
  | { event: "message.deleted"; threadId: string; messageId: string };

/** Fire a Postgres NOTIFY so SSE subscribers see the event. Best-effort. */
export async function publishAdminChatEvent(event: AdminChatEvent): Promise<void> {
  try {
    const payload = JSON.stringify(event);
    await prisma.$executeRawUnsafe(`SELECT pg_notify('admin_chat_events', $1)`, payload);
  } catch (e) {
    console.warn("[adminChatEvents] pg_notify failed:", (e as Error).message);
  }
}
```

- [ ] **Step 2: Write the message-post handler**

```ts
// src/app/api/admin/team-chat/threads/[id]/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";
import { parseMentions, parseDealRefs, stripInvalidTokens } from "@/lib/parseMentions";
import { publishAdminChatEvent } from "@/lib/adminChatEvents";

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_CONTENT_LEN = 10_000;
const rateStore = new Map<string, number[]>();

function hitRateLimit(email: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const arr = (rateStore.get(email) || []).filter((t) => t > windowStart);
  if (arr.length >= RATE_LIMIT_MAX) return true;
  arr.push(now);
  rateStore.set(email, arr);
  return false;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const senderEmail = session?.user?.email;
  const senderName = session?.user?.name || senderEmail || "Admin";
  if (!senderEmail || !isAnyAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (hitRateLimit(senderEmail)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const rawContent = body?.content;
  if (!rawContent || typeof rawContent !== "string" || rawContent.trim().length === 0) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }
  if (rawContent.length > MAX_CONTENT_LEN) {
    return NextResponse.json({ error: "content too long" }, { status: 400 });
  }

  const thread = await prisma.adminChatThread.findUnique({ where: { id: params.id } });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  // Validate tokens
  const mentionedEmails = parseMentions(rawContent);
  const dealRefs = parseDealRefs(rawContent);
  const [validAdmins, validDeals] = await Promise.all([
    mentionedEmails.length
      ? prisma.user.findMany({ where: { email: { in: mentionedEmails } }, select: { email: true, name: true } })
      : Promise.resolve([]),
    dealRefs.length
      ? prisma.deal.findMany({ where: { id: { in: dealRefs } }, select: { id: true } })
      : Promise.resolve([]),
  ]);
  const validAdminEmails = validAdmins.map((a) => a.email);
  const validDealIds = validDeals.map((d) => d.id);
  const cleanContent = stripInvalidTokens(rawContent, validAdminEmails, validDealIds);

  // Write in a single transaction: message, mentions, DealNote mirrors, thread bump
  const msg = await prisma.$transaction(async (tx) => {
    const m = await tx.adminChatMessage.create({
      data: { threadId: params.id, senderEmail, senderName, content: cleanContent },
    });

    if (validAdminEmails.length) {
      await tx.adminChatMention.createMany({
        data: validAdminEmails.map((email) => ({
          messageId: m.id,
          mentionedAdminEmail: email,
        })),
      });
    }

    // Deal-note mirror: (a) if thread is deal-scoped, (b) for every referenced deal id
    const mirrorDealIds = new Set<string>();
    if (thread.type === "deal" && thread.dealId) mirrorDealIds.add(thread.dealId);
    for (const id of validDealIds) mirrorDealIds.add(id);
    if (mirrorDealIds.size > 0) {
      await tx.dealNote.createMany({
        data: Array.from(mirrorDealIds).map((dealId) => ({
          dealId,
          content: cleanContent,
          authorName: senderName,
          authorEmail: senderEmail,
          sourceChatMessageId: m.id,
        })),
      });
    }

    await tx.adminChatThread.update({
      where: { id: params.id },
      data: { lastMessageAt: new Date() },
    });

    return m;
  });

  // Fire notifications + SSE event (outside the transaction — best-effort)
  for (const email of validAdminEmails) {
    if (email === senderEmail) continue; // don't notify yourself
    await prisma.notification.create({
      data: {
        recipientType: "admin",
        recipientId: email,
        type: "admin_mention",
        title: `${senderName} mentioned you`,
        message: cleanContent.slice(0, 100),
        link: `/admin/team-chat?threadId=${params.id}#msg-${msg.id}`,
      },
    }).catch(() => {});
    await prisma.adminChatMention.updateMany({
      where: { messageId: msg.id, mentionedAdminEmail: email },
      data: { notifiedAt: new Date() },
    }).catch(() => {});
  }
  await publishAdminChatEvent({ event: "message.created", threadId: params.id, messageId: msg.id });

  return NextResponse.json({ message: msg }, { status: 201 });
}
```

- [ ] **Step 3: Build**

```bash
./node_modules/.bin/next build
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/adminChatEvents.ts src/app/api/admin/team-chat/threads/\[id\]/messages/route.ts
git commit -m "feat(api): POST admin-chat message with mentions + DealNote mirror + SSE event"
```

---

### Task 9: Edit + soft-delete API — `PATCH` + `DELETE /api/admin/team-chat/messages/[id]`

**Files:**
- Create: `src/app/api/admin/team-chat/messages/[id]/route.ts`

- [ ] **Step 1: Write both handlers**

```ts
// src/app/api/admin/team-chat/messages/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";
import { publishAdminChatEvent } from "@/lib/adminChatEvents";

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

async function loadAndGate(
  params: { id: string },
  session: any,
  isSuperAdminOverride = false
) {
  const role = (session?.user as any)?.role;
  const email = session?.user?.email;
  if (!email || !isAnyAdmin(role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const msg = await prisma.adminChatMessage.findUnique({ where: { id: params.id } });
  if (!msg) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };

  const isSuper = role === "super_admin";
  const isSender = msg.senderEmail === email;
  const withinWindow = Date.now() - new Date(msg.createdAt).getTime() < EDIT_WINDOW_MS;
  const canAct = isSuper || (isSender && withinWindow) || isSuperAdminOverride;
  if (!canAct) {
    return { error: NextResponse.json({ error: "Edit window expired or not sender" }, { status: 403 }) };
  }
  return { msg };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const g = await loadAndGate(params, session);
  if (g.error) return g.error;
  const body = await req.json().catch(() => null);
  const content = body?.content;
  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }
  const updated = await prisma.adminChatMessage.update({
    where: { id: params.id },
    data: { content, editedAt: new Date() },
  });
  // Mirror edit into any DealNote rows that were spawned from this message
  await prisma.dealNote.updateMany({
    where: { sourceChatMessageId: params.id },
    data: { content },
  });
  await publishAdminChatEvent({ event: "message.updated", threadId: updated.threadId, messageId: updated.id });
  return NextResponse.json({ message: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const g = await loadAndGate(params, session);
  if (g.error) return g.error;
  const updated = await prisma.adminChatMessage.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  });
  // Hard-delete the mirrored DealNote(s) so the deal page doesn't surface deleted chatter
  await prisma.dealNote.deleteMany({ where: { sourceChatMessageId: params.id } });
  await publishAdminChatEvent({ event: "message.deleted", threadId: updated.threadId, messageId: updated.id });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Build**

```bash
./node_modules/.bin/next build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/team-chat/messages/\[id\]/route.ts
git commit -m "feat(api): PATCH + DELETE admin-chat messages with 24h sender edit window"
```

---

### Task 10: Read-state API — `POST /api/admin/team-chat/threads/[id]/read`

**Files:**
- Create: `src/app/api/admin/team-chat/threads/[id]/read/route.ts`

- [ ] **Step 1: Write the handler**

```ts
// src/app/api/admin/team-chat/threads/[id]/read/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const adminEmail = session?.user?.email;
  if (!adminEmail || !isAnyAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const latest = await prisma.adminChatMessage.findFirst({
    where: { threadId: params.id },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  await prisma.adminChatReadState.upsert({
    where: { threadId_adminEmail: { threadId: params.id, adminEmail } },
    update: { lastReadMessageId: latest?.id ?? null, lastReadAt: new Date() },
    create: { threadId: params.id, adminEmail, lastReadMessageId: latest?.id ?? null, lastReadAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Build + commit**

```bash
./node_modules/.bin/next build
git add src/app/api/admin/team-chat/threads/\[id\]/read/route.ts
git commit -m "feat(api): POST admin-chat thread read-state upsert"
```

---

### Task 11: SSE transport — `GET /api/admin/team-chat/stream`

**Files:**
- Create: `src/app/api/admin/team-chat/stream/route.ts`

- [ ] **Step 1: Write the handler**

```ts
// src/app/api/admin/team-chat/stream/route.ts
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { isAnyAdmin } from "@/lib/permissions";
import { Client } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!isAnyAdmin(role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const threadId = new URL(req.url).searchParams.get("threadId");
  if (!threadId) return new Response("threadId required", { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const client = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
      try {
        await client.connect();
        await client.query("LISTEN admin_chat_events");
      } catch (e) {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: "LISTEN failed" })}\n\n`));
        controller.close();
        return;
      }

      const onNotify = (msg: any) => {
        try {
          const parsed = JSON.parse(msg.payload);
          if (parsed.threadId === threadId) {
            controller.enqueue(encoder.encode(`event: ${parsed.event}\ndata: ${msg.payload}\n\n`));
          }
        } catch {}
      };
      client.on("notification", onNotify);

      // Heartbeat every 20s to keep the connection alive
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 20_000);

      // Cleanup when the client disconnects
      req.signal.addEventListener("abort", async () => {
        clearInterval(heartbeat);
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

- [ ] **Step 2: Verify `pg` is a dependency**

```bash
node -e "require('pg')"
```

Expected: no error. If it errors, `pg` is not installed — run `npm install pg @types/pg --save` and commit the package manifest changes.

- [ ] **Step 3: Build**

```bash
./node_modules/.bin/next build
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/team-chat/stream/route.ts
# If pg was newly installed:
# git add package.json package-lock.json
git commit -m "feat(api): SSE stream for admin-chat via Postgres LISTEN/NOTIFY"
```

---

### Task 12: MentionInput React component

**Files:**
- Create: `src/components/ui/MentionInput.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/ui/MentionInput.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Admin = { email: string; name: string | null; role?: string };
type Deal = { id: string; dealName: string };

export type MentionInputProps = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
};

export default function MentionInput({ value, onChange, onSubmit, placeholder = "Type a message... @name to mention, #deal to tag", disabled }: MentionInputProps) {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [popover, setPopover] = useState<{ type: "admin" | "deal"; query: string; pos: number } | null>(null);
  const [popIndex, setPopIndex] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Fetch admin list once; 5-minute client cache handled by HTTP cache headers upstream
  useEffect(() => {
    fetch("/api/admin/team-chat/admins")
      .then((r) => r.json())
      .then((d) => setAdmins(d.admins || []))
      .catch(() => {});
  }, []);

  // Fetch deals on demand when the # popover opens (lazy)
  const loadDeals = useCallback(async () => {
    if (deals.length > 0) return;
    try {
      const r = await fetch("/api/admin/deals");
      if (r.ok) {
        const d = await r.json();
        setDeals((d.deals || []).map((x: any) => ({ id: x.id, dealName: x.dealName })));
      }
    } catch {}
  }, [deals.length]);

  // Detect trigger tokens in content
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    const cursor = el.selectionStart;
    const before = value.slice(0, cursor);
    const atMatch = /(?:^|\s)@([A-Za-z]*)$/.exec(before);
    const hashMatch = /(?:^|\s)#([A-Za-z0-9]*)$/.exec(before);
    if (atMatch) {
      setPopover({ type: "admin", query: atMatch[1].toLowerCase(), pos: cursor - atMatch[1].length - 1 });
      setPopIndex(0);
    } else if (hashMatch) {
      setPopover({ type: "deal", query: hashMatch[1].toLowerCase(), pos: cursor - hashMatch[1].length - 1 });
      setPopIndex(0);
      loadDeals();
    } else {
      setPopover(null);
    }
  }, [value, loadDeals]);

  const filteredAdmins = admins
    .filter((a) => (a.name || a.email).toLowerCase().includes(popover?.query ?? ""))
    .slice(0, 6);
  const filteredDeals = deals
    .filter((d) => d.dealName.toLowerCase().includes(popover?.query ?? ""))
    .slice(0, 6);
  const list = popover?.type === "admin" ? filteredAdmins : popover?.type === "deal" ? filteredDeals : [];

  const insertToken = (token: string) => {
    if (!popover) return;
    const before = value.slice(0, popover.pos);
    const after = value.slice(taRef.current?.selectionStart ?? popover.pos);
    const next = before + token + after;
    onChange(next);
    setPopover(null);
    setTimeout(() => {
      const newPos = (before + token).length;
      taRef.current?.focus();
      taRef.current?.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (popover && list.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setPopIndex((i) => (i + 1) % list.length); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setPopIndex((i) => (i - 1 + list.length) % list.length); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        const pick = list[popIndex] as any;
        if (popover.type === "admin") insertToken(`@[${pick.name || pick.email}](${pick.email})`);
        else insertToken(`[deal:${pick.id}]`);
        return;
      }
      if (e.key === "Escape") { setPopover(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={2}
        className="w-full bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-xl px-4 py-3 text-[var(--app-text)] font-body text-[13px] outline-none focus:border-brand-gold/30 transition-colors placeholder:text-[var(--app-text-muted)] resize-none"
      />
      {popover && list.length > 0 && (
        <div className="absolute bottom-full mb-2 left-0 w-full max-w-[320px] bg-[var(--app-bg-secondary)] border border-[var(--app-border)] rounded-xl shadow-xl shadow-black/30 overflow-hidden z-10">
          {list.map((item: any, i: number) => (
            <button
              key={popover.type === "admin" ? item.email : item.id}
              onClick={() => popover.type === "admin" ? insertToken(`@[${item.name || item.email}](${item.email})`) : insertToken(`[deal:${item.id}]`)}
              className={`w-full text-left px-3 py-2 font-body text-[12px] transition-colors ${i === popIndex ? "bg-brand-gold/15 text-brand-gold" : "text-[var(--app-text)] hover:bg-[var(--app-card-bg)]"}`}
            >
              {popover.type === "admin" ? (item.name || item.email) : item.dealName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
./node_modules/.bin/next build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/MentionInput.tsx
git commit -m "feat(ui): MentionInput with @-admin + #-deal autocomplete"
```

---

### Task 13: Main page `/admin/team-chat`

**Files:**
- Create: `src/app/(admin)/admin/team-chat/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// src/app/(admin)/admin/team-chat/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import MentionInput from "@/components/ui/MentionInput";
import { renderAdminChatContent, type ChatSegment } from "@/lib/renderAdminChatContent";

type Thread = {
  id: string;
  type: string;
  dealId: string | null;
  dealName: string | null;
  lastMessageAt: string;
  unreadCount: number;
  messageCount: number;
};

type Mention = { id: string; messageId: string; mentionedAdminEmail: string };
type Message = {
  id: string;
  threadId: string;
  senderEmail: string;
  senderName: string;
  content: string;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  mentions: Mention[];
};

export default function TeamChatPage() {
  const params = useSearchParams();
  const initialThreadId = params?.get("threadId") || null;

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreadId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [dealMap, setDealMap] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  // Load thread list
  const loadThreads = useCallback(async () => {
    const r = await fetch("/api/admin/team-chat/threads");
    if (r.ok) {
      const d = await r.json();
      setThreads(d.threads || []);
      if (!activeThreadId && d.threads?.length) {
        const globalThread = d.threads.find((t: Thread) => t.type === "global");
        setActiveThreadId(globalThread?.id || d.threads[0].id);
      }
    }
  }, [activeThreadId]);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  // Load messages for active thread + connect SSE
  useEffect(() => {
    if (!activeThreadId) return;
    let cancelled = false;

    (async () => {
      const r = await fetch(`/api/admin/team-chat/threads/${activeThreadId}`);
      if (r.ok && !cancelled) {
        const d = await r.json();
        setMessages(d.messages || []);
        setDealMap(d.deals || {});
      }
      await fetch(`/api/admin/team-chat/threads/${activeThreadId}/read`, { method: "POST" });
      loadThreads();
    })();

    const es = new EventSource(`/api/admin/team-chat/stream?threadId=${activeThreadId}`);
    esRef.current = es;
    es.addEventListener("message.created", async (e: MessageEvent) => {
      const r = await fetch(`/api/admin/team-chat/threads/${activeThreadId}`);
      if (r.ok) {
        const d = await r.json();
        setMessages(d.messages || []);
        setDealMap(d.deals || {});
      }
      await fetch(`/api/admin/team-chat/threads/${activeThreadId}/read`, { method: "POST" });
    });
    es.addEventListener("message.updated", async () => {
      const r = await fetch(`/api/admin/team-chat/threads/${activeThreadId}`);
      if (r.ok) { const d = await r.json(); setMessages(d.messages || []); setDealMap(d.deals || {}); }
    });
    es.addEventListener("message.deleted", async () => {
      const r = await fetch(`/api/admin/team-chat/threads/${activeThreadId}`);
      if (r.ok) { const d = await r.json(); setMessages(d.messages || []); setDealMap(d.deals || {}); }
    });

    return () => { cancelled = true; es.close(); esRef.current = null; };
  }, [activeThreadId, loadThreads]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async () => {
    if (!draft.trim() || !activeThreadId) return;
    setSending(true);
    try {
      const r = await fetch(`/api/admin/team-chat/threads/${activeThreadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft.trim() }),
      });
      if (r.ok) setDraft("");
    } finally {
      setSending(false);
    }
  };

  const activeThread = useMemo(() => threads.find((t) => t.id === activeThreadId), [threads, activeThreadId]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h2 className="font-display text-[22px] font-bold mb-1">Team Chat</h2>
          <p className="font-body text-[13px] text-[var(--app-text-muted)]">
            Internal admin collaboration. Use @name to mention a teammate, #deal to tag a deal.
          </p>
        </div>
      </div>

      <div className="flex gap-4" style={{ height: "calc(100vh - 220px)", minHeight: 400 }}>
        {/* Rail */}
        <div className={`${activeThreadId ? "hidden md:flex" : "flex"} w-full md:w-[280px] shrink-0 card flex-col overflow-hidden`}>
          <div className="flex-1 overflow-y-auto">
            {threads.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveThreadId(t.id)}
                className={`w-full text-left px-4 py-3 border-b border-[var(--app-border)] transition-colors ${activeThreadId === t.id ? "bg-brand-gold/10" : "hover:bg-[var(--app-card-bg)]"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-body text-sm font-medium text-[var(--app-text)] truncate">
                    {t.type === "global" ? "🌐 Global Room" : t.dealName || "(deleted deal)"}
                  </div>
                  {t.unreadCount > 0 && (
                    <span className="bg-brand-gold text-brand-dark text-[9px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shrink-0">
                      {t.unreadCount}
                    </span>
                  )}
                </div>
                <div className="font-body text-[10px] text-[var(--app-text-faint)]">{t.messageCount} messages</div>
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className={`${activeThreadId ? "flex" : "hidden md:flex"} flex-1 card flex-col overflow-hidden`}>
          <div className="px-5 py-3 border-b border-[var(--app-border)]">
            <div className="font-body text-sm font-semibold text-[var(--app-text)]">
              {activeThread?.type === "global" ? "🌐 Global Room" : activeThread?.dealName || "Thread"}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
            {messages.map((msg) => (
              <div key={msg.id} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-brand-gold/20 flex items-center justify-center shrink-0 font-body text-[11px] font-semibold text-brand-gold">
                  {(msg.senderName || msg.senderEmail).slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-body text-[12px] font-semibold text-[var(--app-text)]">{msg.senderName}</span>
                    <span className="font-body text-[10px] text-[var(--app-text-faint)]">{new Date(msg.createdAt).toLocaleString()}</span>
                    {msg.editedAt && <span className="font-body text-[10px] text-[var(--app-text-faint)] italic">(edited)</span>}
                  </div>
                  <div className="font-body text-[13px] text-[var(--app-text)] leading-relaxed whitespace-pre-wrap mt-0.5">
                    {msg.deletedAt
                      ? <span className="italic text-[var(--app-text-muted)]">[message deleted]</span>
                      : renderAdminChatContent(msg.content, { deals: dealMap }).map((seg, i) =>
                          seg.type === "mention" ? (
                            <span key={i} className="bg-brand-gold/15 text-brand-gold rounded px-1">@{seg.name}</span>
                          ) : seg.type === "deal" ? (
                            <a key={i} href={`/admin/deals#${seg.dealId}`} className="bg-purple-500/15 text-purple-400 rounded px-1 hover:underline">
                              {seg.dealName || seg.dealId}
                            </a>
                          ) : (
                            <span key={i}>{seg.value}</span>
                          )
                        )
                    }
                  </div>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="p-4 border-t border-[var(--app-border)]">
            <MentionInput
              value={draft}
              onChange={setDraft}
              onSubmit={handleSend}
              disabled={sending}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
./node_modules/.bin/next build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(admin\)/admin/team-chat/page.tsx
git commit -m "feat(ui): /admin/team-chat page with SSE + MentionInput"
```

---

### Task 14: Sidebar nav entry + notification icon

**Files:**
- Modify: `src/app/(admin)/admin/layout.tsx`
- Modify: `src/components/ui/NotificationBell.tsx`

- [ ] **Step 1: Add "Team Chat" to the admin nav map**

In `src/app/(admin)/admin/layout.tsx`, find `ADMIN_NAV_ITEMS_MAP` (around line 26). Add after the existing `chat` entry:

```tsx
  teamChat:     { id: "teamChat", href: "/admin/team-chat", icon: "💬", label: "Team Chat" },
```

And add `"teamChat"` to `ADMIN_NAV_IDS_DEFAULT` between `"chat"` and the end of the array.

Also add `"teamChat"` to each role's `ROLE_VISIBLE_NAV` array in `src/lib/permissions.ts` (all four admin roles).

- [ ] **Step 2: Add `admin_mention` to NotificationBell TYPE_ICONS**

In `src/components/ui/NotificationBell.tsx`, find `TYPE_ICONS` (around line 16). Add:

```tsx
  admin_mention: "👋",
```

- [ ] **Step 3: Build**

```bash
./node_modules/.bin/next build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(admin\)/admin/layout.tsx src/components/ui/NotificationBell.tsx src/lib/permissions.ts
git commit -m "feat(admin): sidebar Team Chat entry + admin_mention notification icon"
```

---

### Task 15: Wire `getOrCreateDealThread` into the referral POST (additive)

**Files:**
- Create: `src/lib/adminChatThread.ts`
- Modify: `src/app/api/webhook/referral/route.ts` (additive — inside existing transaction)

- [ ] **Step 1: Write the helper**

```ts
// src/lib/adminChatThread.ts
import type { PrismaClient } from "@prisma/client";

type Tx = Pick<PrismaClient, "adminChatThread">;

export async function getOrCreateDealThread(db: Tx, dealId: string) {
  const existing = await db.adminChatThread.findUnique({ where: { dealId } });
  if (existing) return existing;
  return db.adminChatThread.create({ data: { type: "deal", dealId } });
}
```

- [ ] **Step 2: Call it inside the deal-create transaction on the webhook**

Open `src/app/api/webhook/referral/route.ts`. Find the `prisma.deal.create` block around line 553. The current code calls `prisma.deal.create` directly (not inside an explicit transaction). Wrap it in `prisma.$transaction` and add the thread create, in one go:

**BEFORE (existing, do not otherwise change):**

```ts
    const deal = await prisma.deal.create({
      data: {
        // ... existing fields ...
      },
    });
```

**AFTER (additive — only change is the `$transaction` wrapper + extra line):**

```ts
    const deal = await prisma.$transaction(async (tx) => {
      const d = await tx.deal.create({
        data: {
          // ... existing fields unchanged ...
        },
      });
      // Additive: create the admin-chat deal thread eagerly.
      const { getOrCreateDealThread } = await import("@/lib/adminChatThread");
      await getOrCreateDealThread(tx, d.id);
      return d;
    });
```

Do not touch anything else in the file. Auth, HMAC, field extraction, response shape, error handling all stay bit-for-bit identical.

- [ ] **Step 3: Build**

```bash
./node_modules/.bin/next build
```

Expected: `✓ Compiled successfully`. The webhook handler still resolves the same shape to callers.

- [ ] **Step 4: Grep-verify no other existing behavior changed**

```bash
git diff src/app/api/webhook/referral/route.ts
```

Expected: the only modifications are the `prisma.deal.create(` → `prisma.$transaction(async (tx) => { const d = await tx.deal.create(` wrapper + the dynamic import + `getOrCreateDealThread(tx, d.id)` line + the `return d` + the closing `})`. No other lines should differ.

- [ ] **Step 5: Commit**

```bash
git add src/lib/adminChatThread.ts src/app/api/webhook/referral/route.ts
git commit -m "feat(webhook): eager admin-chat deal thread creation (strictly additive)"
```

---

### Task 16: Final sanity sweep + PR

**Files:** none

- [ ] **Step 1: Run all unit tests**

```bash
npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' src/lib/__tests__/parseMentions.test.ts
npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' src/lib/__tests__/renderAdminChatContent.test.ts
```

Expected: `6 passed, 0 failed` and `5 passed, 0 failed` respectively.

- [ ] **Step 2: Final full build**

```bash
./node_modules/.bin/next build
```

Expected: `✓ Compiled successfully` with no regressions.

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(admin): admin-internal Team Chat with @mentions, deal threads, SSE" --body "$(cat <<'EOF'
## Summary

Real-time admin-only chat at \`/admin/team-chat\`. Global room + auto-created per-deal threads. \`@mention\` autocomplete fires Notifications. Deal-thread messages mirror into \`DealNote\` so the deal expansion surfaces admin chatter. SSE live push via Postgres LISTEN/NOTIFY with polling fallback.

Implements spec \`docs/superpowers/specs/2026-04-19-admin-internal-chat-design.md\`.

## What lands

- 4 new Prisma models + \`DealNote.sourceChatMessageId\` column
- 2 pure helpers + unit tests (parseMentions, renderAdminChatContent)
- 7 new API routes under \`/api/admin/team-chat/*\` (list/get/post/patch/delete/read/admins/stream)
- \`<MentionInput>\` component + \`/admin/team-chat\` page + sidebar entry + notification icon
- Eager deal-thread creation inside existing \`/api/webhook/referral\` POST transaction (strictly additive)
- Seed script ensures the singleton global thread exists on every Vercel build

## Test plan

- [ ] Unit: \`npx ts-node src/lib/__tests__/parseMentions.test.ts\` → 6 pass
- [ ] Unit: \`npx ts-node src/lib/__tests__/renderAdminChatContent.test.ts\` → 5 pass
- [ ] As super_admin, post \`hey @[John](john@x.com) on [deal:<id>]\` in Global Room → mention notification fires, deal expansion shows the mirrored DealNote
- [ ] Open same thread in two browsers as different admins → sub-second SSE delivery of new messages
- [ ] Edit own message within 24h → content updates, \`(edited)\` shows, mirrored DealNote updates
- [ ] Delete own message → \`[message deleted]\` placeholder, mirrored DealNote gone
- [ ] Partner-side webhook POST to \`/api/webhook/referral\` still creates deals with identical response shape (no regression)
- [ ] CI green (CodeQL + Vercel)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Report the PR URL + stop**

Do NOT merge. Main is branch-protected; the user explicitly authorizes every squash-merge.

---

## Out of scope (from the spec, do not build)

- Threaded replies within a message (schema-ready, no UI)
- Emoji reactions, file attachments, message pinning
- Search across threads (only in-thread scroll in v1)
- Admin-to-admin 1:1 DMs (separate spec)
- Slash commands
