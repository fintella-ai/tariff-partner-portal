# Outbound Network Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the core plumbing for Fintella-hosted outbound referral submission — adapter interface, a demo-gated FrostLawAdapter, four new nullable `Deal` columns, a `POST /api/outbound/referral` endpoint, and a super_admin-only test route. Zero changes to `/api/webhook/referral` (inbound). Zero changes to `/dashboard/submit-client` (iframe).

**Architecture:** Pluggable adapter pattern. Each partner network implements `OutboundAdapter`. A registry maps slug → adapter. The new endpoint resolves the adapter, builds an `IntakePayload`, calls `submit()`, transactionally creates the Deal with the adapter's `externalDealId` + status, and writes a `WebhookRequestLog` audit row. All adapter failures are non-fatal — the local Deal is still created with `outboundStatus: "error"` or `"demo"`.

**Tech Stack:** Next.js 14 App Router, Prisma 5.20, TypeScript. Node `assert` unit tests via `npx ts-node` (matches existing seed-script pattern — no new test framework).

**Spec:** `docs/superpowers/specs/2026-04-18-outbound-network-adapter-design.md`

**⚠️ Hard constraint:** Do NOT modify `src/app/api/webhook/referral/route.ts`. Partners are actively testing POST + PATCH on that endpoint right now. Any edit to that file blocks their work. If a task seems to require an edit there, stop and flag it — it does not.

---

### Task 1: Add Deal schema fields + regenerate Prisma client

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add four nullable columns to the `Deal` model**

Find the `Deal` model in `prisma/schema.prisma`. Immediately after the existing `externalStage` line (around line 449), add:

```prisma
  externalDealId       String?   @unique     // network-assigned ID for outbound-submitted deals
  externalDealUrl      String?               // optional deep link into the network's system
  outboundNetworkSlug  String?               // which adapter submitted this deal ("frostlaw", ...)
  outboundStatus       String?               // last adapter result: "submitted", "demo", "error"
```

Do NOT touch any other model or field.

- [ ] **Step 2: Regenerate the Prisma client**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client ... in XXms`.

- [ ] **Step 3: Push the schema to the dev database**

```bash
npx prisma db push --accept-data-loss
```

Expected: `Your database is now in sync with your Prisma schema.`. Because all four new columns are nullable and unindexed (except the sparse unique on `externalDealId`), the change is additive — existing inbound-created Deals retain NULL for all four. No existing row is rewritten.

- [ ] **Step 4: Verify the build still compiles**

```bash
./node_modules/.bin/next build
```

Expected: `✓ Compiled successfully` and ≥97 pages prerendered.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): add externalDealId / outbound tracking columns to Deal"
```

---

### Task 2: Create the adapter types

**Files:**
- Create: `src/lib/outbound-networks/types.ts`

- [ ] **Step 1: Write the types module**

```ts
// src/lib/outbound-networks/types.ts
export type IntakePayload = {
  partnerCode: string;
  clientFirstName: string;
  clientLastName: string;
  clientEmail: string;
  clientPhone?: string;
  legalEntityName?: string;
  businessCity?: string;
  businessState?: string;
  serviceOfInterest?: string;
  estimatedRefundAmount?: number;
  notes?: string;
  extras?: Record<string, string | number | boolean>;
};

export type AdapterStatus = "submitted" | "demo" | "error";

export type AdapterResult = {
  status: AdapterStatus;
  externalDealId: string | null;
  externalDealUrl: string | null;
  rawResponse: unknown;
  errorMessage?: string;
};

export interface OutboundAdapter {
  readonly slug: string;
  readonly displayName: string;
  submit(payload: IntakePayload): Promise<AdapterResult>;
}
```

- [ ] **Step 2: Verify TypeScript picks up the module**

```bash
./node_modules/.bin/next build
```

Expected: `✓ Compiled successfully`. (No file imports this yet, but build validates the file itself.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/outbound-networks/types.ts
git commit -m "feat(outbound): add adapter interface types"
```

---

### Task 3: Implement the FrostLawAdapter with failing tests

**Files:**
- Create: `src/lib/outbound-networks/frostlaw.ts`
- Create: `src/lib/__tests__/outbound-networks.test.ts`

- [ ] **Step 1: Write the failing test file**

```ts
// src/lib/__tests__/outbound-networks.test.ts
import assert from "node:assert/strict";
import type { IntakePayload } from "../outbound-networks/types";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => Promise<void> | void) {
  Promise.resolve()
    .then(() => fn())
    .then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.log(`  ✗ ${name}\n    ${(e as Error).message}`); });
}

async function run() {
  const { FrostLawAdapter, mapPayloadToFrostLaw } = await import("../outbound-networks/frostlaw");

  console.log("FrostLawAdapter");

  test("slug and displayName are set", () => {
    assert.equal(FrostLawAdapter.slug, "frostlaw");
    assert.equal(FrostLawAdapter.displayName, "Frost Law");
  });

  test("demo-gated when env vars unset", async () => {
    // Ensure env vars absent for this assertion
    delete process.env.FROST_LAW_OUTBOUND_URL;
    delete process.env.FROST_LAW_OUTBOUND_API_KEY;
    const payload: IntakePayload = {
      partnerCode: "PTNDEMO01",
      clientFirstName: "Demo",
      clientLastName: "Client",
      clientEmail: "demo@example.com",
    };
    const r = await FrostLawAdapter.submit(payload);
    assert.equal(r.status, "demo");
    assert.equal(r.externalDealId, null);
    assert.equal(r.externalDealUrl, null);
  });

  test("mapPayloadToFrostLaw passes through standard fields", () => {
    const payload: IntakePayload = {
      partnerCode: "PTNDEMO01",
      clientFirstName: "Demo",
      clientLastName: "Client",
      clientEmail: "demo@example.com",
      clientPhone: "+16025551234",
      legalEntityName: "Acme LLC",
      estimatedRefundAmount: 50000,
    };
    const body = mapPayloadToFrostLaw(payload);
    assert.equal(body.partnerCode, "PTNDEMO01");
    assert.equal(body.clientEmail, "demo@example.com");
    assert.equal(body.legalEntityName, "Acme LLC");
    assert.equal(body.estimatedRefundAmount, 50000);
    assert.equal(body.source, "fintella-outbound");
  });

  test("mapPayloadToFrostLaw merges extras", () => {
    const body = mapPayloadToFrostLaw({
      partnerCode: "PTNDEMO01",
      clientFirstName: "Demo",
      clientLastName: "Client",
      clientEmail: "demo@example.com",
      extras: { customField: "xyz", priority: 1 },
    });
    assert.equal((body as any).customField, "xyz");
    assert.equal((body as any).priority, 1);
  });

  // Give async tests time to resolve, then print summary
  await new Promise((r) => setTimeout(r, 50));
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' src/lib/__tests__/outbound-networks.test.ts
```

Expected: module-not-found error for `../outbound-networks/frostlaw`, non-zero exit.

- [ ] **Step 3: Write the FrostLawAdapter**

```ts
// src/lib/outbound-networks/frostlaw.ts
import type { IntakePayload, AdapterResult, OutboundAdapter } from "./types";

export function mapPayloadToFrostLaw(p: IntakePayload) {
  return {
    partnerCode: p.partnerCode,
    clientFirstName: p.clientFirstName,
    clientLastName: p.clientLastName,
    clientEmail: p.clientEmail,
    clientPhone: p.clientPhone,
    legalEntityName: p.legalEntityName,
    businessCity: p.businessCity,
    businessState: p.businessState,
    serviceOfInterest: p.serviceOfInterest,
    estimatedRefundAmount: p.estimatedRefundAmount,
    notes: p.notes,
    source: "fintella-outbound" as const,
    ...(p.extras || {}),
  };
}

export const FrostLawAdapter: OutboundAdapter = {
  slug: "frostlaw",
  displayName: "Frost Law",
  async submit(payload: IntakePayload): Promise<AdapterResult> {
    const url = process.env.FROST_LAW_OUTBOUND_URL;
    const key = process.env.FROST_LAW_OUTBOUND_API_KEY;
    if (!url || !key) {
      return {
        status: "demo",
        externalDealId: null,
        externalDealUrl: null,
        rawResponse: { note: "FROST_LAW_OUTBOUND_URL / _API_KEY not set" },
      };
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": key,
          "User-Agent": "Fintella-Partner-Portal/1.0",
        },
        body: JSON.stringify(mapPayloadToFrostLaw(payload)),
      });
      const raw = await res.json().catch(() => null);
      if (!res.ok) {
        return {
          status: "error",
          externalDealId: null,
          externalDealUrl: null,
          rawResponse: raw,
          errorMessage: `Frost Law returned ${res.status}`,
        };
      }
      return {
        status: "submitted",
        externalDealId: raw && typeof raw.dealId === "string" ? raw.dealId : null,
        externalDealUrl: raw && typeof raw.dealUrl === "string" ? raw.dealUrl : null,
        rawResponse: raw,
      };
    } catch (e) {
      return {
        status: "error",
        externalDealId: null,
        externalDealUrl: null,
        rawResponse: null,
        errorMessage: (e as Error).message,
      };
    }
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' src/lib/__tests__/outbound-networks.test.ts
```

Expected: `4 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/outbound-networks/frostlaw.ts src/lib/__tests__/outbound-networks.test.ts
git commit -m "feat(outbound): add demo-gated FrostLawAdapter with unit tests"
```

---

### Task 4: Create the registry

**Files:**
- Create: `src/lib/outbound-networks/registry.ts`

- [ ] **Step 1: Write the registry module**

```ts
// src/lib/outbound-networks/registry.ts
import type { OutboundAdapter } from "./types";
import { FrostLawAdapter } from "./frostlaw";

const ADAPTERS: Record<string, OutboundAdapter> = {
  [FrostLawAdapter.slug]: FrostLawAdapter,
};

export function getAdapter(slug: string): OutboundAdapter | null {
  return ADAPTERS[slug] || null;
}

export function listAdapters(): { slug: string; displayName: string }[] {
  return Object.values(ADAPTERS).map((a) => ({ slug: a.slug, displayName: a.displayName }));
}
```

- [ ] **Step 2: Add registry tests to the existing test file**

Append to `src/lib/__tests__/outbound-networks.test.ts`, inside the `run()` async function, immediately before the `await new Promise(...)` line:

```ts
  const { getAdapter, listAdapters } = await import("../outbound-networks/registry");

  console.log("\nregistry");

  test("getAdapter resolves known slug", () => {
    const a = getAdapter("frostlaw");
    assert.equal(a?.slug, "frostlaw");
  });

  test("getAdapter returns null for unknown slug", () => {
    assert.equal(getAdapter("bogus"), null);
  });

  test("listAdapters returns all registered adapters", () => {
    const list = listAdapters();
    assert.ok(list.some((a) => a.slug === "frostlaw"));
  });
```

- [ ] **Step 3: Run the test**

```bash
npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' src/lib/__tests__/outbound-networks.test.ts
```

Expected: `7 passed, 0 failed`, exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/outbound-networks/registry.ts src/lib/__tests__/outbound-networks.test.ts
git commit -m "feat(outbound): add adapter registry with lookup helpers"
```

---

### Task 5: Create the POST `/api/outbound/referral` endpoint

**Files:**
- Create: `src/app/api/outbound/referral/route.ts`

- [ ] **Step 1: Write the route handler**

```ts
// src/app/api/outbound/referral/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAdapter } from "@/lib/outbound-networks/registry";
import type { IntakePayload } from "@/lib/outbound-networks/types";

/**
 * POST /api/outbound/referral
 *
 * Creates a local Deal and forwards the intake payload to the
 * configured outbound network via its adapter. Session-gated: a
 * logged-in partner submits for themselves; a super_admin may pass
 * `asPartnerCode` to submit on behalf of a partner.
 *
 * Strictly additive — does NOT touch /api/webhook/referral (inbound).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  const sessionPartnerCode = (session.user as any).partnerCode as string | undefined;
  const isSuperAdmin = role === "super_admin";

  try {
    const body = await req.json();
    const { networkSlug, client, asPartnerCode } = body || {};

    if (!networkSlug || typeof networkSlug !== "string") {
      return NextResponse.json({ error: "networkSlug required" }, { status: 400 });
    }
    const adapter = getAdapter(networkSlug);
    if (!adapter) return NextResponse.json({ error: "Unknown network" }, { status: 404 });

    if (!client || typeof client !== "object") {
      return NextResponse.json({ error: "client payload required" }, { status: 400 });
    }
    const { firstName, lastName, email, phone, legalEntityName, businessCity, businessState, serviceOfInterest, estimatedRefundAmount, notes, extras } = client;
    if (!firstName || !lastName || !email) {
      return NextResponse.json({ error: "client.firstName, client.lastName, client.email required" }, { status: 400 });
    }

    // Resolve partnerCode: partner session uses their own; super_admin may override.
    const partnerCode = (isSuperAdmin && typeof asPartnerCode === "string" && asPartnerCode)
      ? asPartnerCode
      : sessionPartnerCode;
    if (!partnerCode) {
      return NextResponse.json({ error: "partnerCode not resolvable from session" }, { status: 400 });
    }

    const payload: IntakePayload = {
      partnerCode,
      clientFirstName: firstName,
      clientLastName: lastName,
      clientEmail: email,
      clientPhone: phone,
      legalEntityName,
      businessCity,
      businessState,
      serviceOfInterest,
      estimatedRefundAmount: typeof estimatedRefundAmount === "number" ? estimatedRefundAmount : undefined,
      notes,
      extras,
    };

    const result = await adapter.submit(payload);

    const clientFullName = `${firstName} ${lastName}`.trim();
    const deal = await prisma.deal.create({
      data: {
        dealName: legalEntityName || clientFullName || "Outbound Referral",
        partnerCode,
        clientFirstName: firstName,
        clientLastName: lastName,
        clientName: clientFullName,
        clientEmail: email,
        clientPhone: phone,
        legalEntityName,
        businessCity,
        businessState,
        serviceOfInterest,
        estimatedRefundAmount: typeof estimatedRefundAmount === "number" ? estimatedRefundAmount : 0,
        stage: "new_lead",
        externalDealId: result.externalDealId,
        externalDealUrl: result.externalDealUrl,
        outboundNetworkSlug: networkSlug,
        outboundStatus: result.status,
      },
    });

    // Audit row — reuse existing WebhookRequestLog table if it exists; otherwise skip silently.
    try {
      await (prisma as any).webhookRequestLog?.create({
        data: {
          endpoint: "POST /api/outbound/referral",
          direction: "outbound",
          statusCode: result.status === "error" ? 502 : 200,
          requestBody: JSON.stringify({ networkSlug, partnerCode, clientEmail: email }),
          responseBody: JSON.stringify(result).slice(0, 10_000),
        },
      });
    } catch {
      // Audit is best-effort.
    }

    return NextResponse.json({
      dealId: deal.id,
      externalDealId: result.externalDealId,
      status: result.status,
      errorMessage: result.errorMessage,
    }, { status: 201 });
  } catch (e) {
    console.error("Outbound referral error:", e);
    return NextResponse.json({ error: "Failed to submit outbound referral" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Build to verify TypeScript compiles**

```bash
./node_modules/.bin/next build
```

Expected: `✓ Compiled successfully`. If TypeScript complains about `webhookRequestLog` not existing on the Prisma client, the `(prisma as any)` cast handles it — the audit row is best-effort; absence is non-fatal.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/outbound/referral/route.ts
git commit -m "feat(outbound): add POST /api/outbound/referral endpoint"
```

---

### Task 6: Create the super-admin test route

**Files:**
- Create: `src/app/api/admin/dev/outbound-test/route.ts`

- [ ] **Step 1: Write the dev-only test route**

```ts
// src/app/api/admin/dev/outbound-test/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAdapter, listAdapters } from "@/lib/outbound-networks/registry";
import type { IntakePayload } from "@/lib/outbound-networks/types";

/**
 * GET  /api/admin/dev/outbound-test  — lists registered adapters
 * POST /api/admin/dev/outbound-test  — invokes the adapter directly
 *   (DOES NOT create a local Deal; use /api/outbound/referral for that)
 *
 * Super-admin only. Lives under /api/admin/dev/* which is already
 * gated elsewhere in the middleware to super_admin role.
 */
export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ adapters: listAdapters() });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const { networkSlug, partnerCode, client } = body || {};
    if (!networkSlug || !partnerCode || !client?.firstName || !client?.lastName || !client?.email) {
      return NextResponse.json({ error: "networkSlug, partnerCode, and client.firstName/lastName/email required" }, { status: 400 });
    }
    const adapter = getAdapter(networkSlug);
    if (!adapter) return NextResponse.json({ error: "Unknown network" }, { status: 404 });

    const payload: IntakePayload = {
      partnerCode,
      clientFirstName: client.firstName,
      clientLastName: client.lastName,
      clientEmail: client.email,
      clientPhone: client.phone,
      legalEntityName: client.legalEntityName,
      businessCity: client.businessCity,
      businessState: client.businessState,
      serviceOfInterest: client.serviceOfInterest,
      estimatedRefundAmount: typeof client.estimatedRefundAmount === "number" ? client.estimatedRefundAmount : undefined,
      notes: client.notes,
      extras: client.extras,
    };

    const result = await adapter.submit(payload);
    return NextResponse.json(result);
  } catch (e) {
    console.error("Outbound test error:", e);
    return NextResponse.json({ error: "Test invocation failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Build to verify**

```bash
./node_modules/.bin/next build
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/dev/outbound-test/route.ts
git commit -m "feat(dev): add super-admin outbound adapter test route"
```

---

### Task 7: Document the new env vars

**Files:**
- Modify: `.env.example` (create if missing)

- [ ] **Step 1: Check whether `.env.example` exists**

```bash
ls -la .env.example 2>/dev/null || echo "missing"
```

- [ ] **Step 2: Add the two new variables**

If the file exists, append at the bottom; otherwise create it with just these lines:

```
# Fintella → Frost Law OUTBOUND referral submission (sub-spec 1 of 4 in the
# multi-network adapter feature). Separate from the existing inbound
# FROST_LAW_API_KEY / REFERRAL_WEBHOOK_SECRET so inbound and outbound
# credentials can rotate independently. Unset = adapter runs in demo mode.
FROST_LAW_OUTBOUND_URL=
FROST_LAW_OUTBOUND_API_KEY=
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs(env): document outbound Frost Law env vars"
```

---

### Task 8: Final sanity check — confirm inbound webhook is untouched

**Files:** none (verification only)

- [ ] **Step 1: Diff-check the inbound handler**

```bash
git log --all --oneline -- src/app/api/webhook/referral/route.ts
```

Expected: only historical commits from previous PRs. No commit on this branch should appear.

- [ ] **Step 2: Run the build one more time**

```bash
./node_modules/.bin/next build
```

Expected: `✓ Compiled successfully`, ≥97 pages.

- [ ] **Step 3: Run all outbound tests one more time**

```bash
npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' src/lib/__tests__/outbound-networks.test.ts
```

Expected: `7 passed, 0 failed`.

---

### Task 9: Open PR

**Files:** none

- [ ] **Step 1: Push the branch**

```bash
git push -u origin HEAD
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "feat(outbound): network adapter plumbing (sub-spec 1 of 4)" --body "$(cat <<'EOF'
## Summary

- First increment of Fintella-hosted outbound referral submission — the adapter plumbing
- Strictly additive: NO changes to \`/api/webhook/referral\` or \`/dashboard/submit-client\`
- Implements the design at \`docs/superpowers/specs/2026-04-18-outbound-network-adapter-design.md\`

## What lands in this PR

- \`Deal.externalDealId\` / \`externalDealUrl\` / \`outboundNetworkSlug\` / \`outboundStatus\` (all nullable)
- \`src/lib/outbound-networks/{types,registry,frostlaw}.ts\` — adapter interface + registry + demo-gated FrostLawAdapter
- \`src/lib/__tests__/outbound-networks.test.ts\` — 7 Node assertion tests
- \`POST /api/outbound/referral\` — session-gated outbound submission endpoint
- \`/api/admin/dev/outbound-test\` — super_admin-only test route
- \`.env.example\` — new \`FROST_LAW_OUTBOUND_URL\` + \`FROST_LAW_OUTBOUND_API_KEY\`

## What's deferred to follow-on sub-specs

- **#2:** Fintella-hosted public intake form UI
- **#3:** Inbound status-update webhook keyed by \`externalDealId\`
- **#4:** Admin UI for per-network config

## Test plan

- [ ] \`npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' src/lib/__tests__/outbound-networks.test.ts\` → 7 passed
- [ ] As super_admin: GET \`/api/admin/dev/outbound-test\` returns \`[{slug:"frostlaw",...}]\`
- [ ] As super_admin: POST to \`/api/admin/dev/outbound-test\` with \`networkSlug:"frostlaw"\` + a minimal client body → returns \`{status:"demo", externalDealId:null, ...}\` when env vars unset
- [ ] As a partner: POST to \`/api/outbound/referral\` → creates a Deal with \`outboundNetworkSlug:"frostlaw"\`, \`outboundStatus:"demo"\` visible in /admin/deals
- [ ] Inbound webhook unchanged: \`POST /api/webhook/referral\` still creates deals as before (regression check by partner testing)
- [ ] CI green (CodeQL + Vercel)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Stop and report the PR URL**

Do NOT merge. Per the repo's saved rule, the user must explicitly authorize the merge.

---

## Out of scope (from the spec, do not build)

- Fintella-hosted public intake form UI — sub-spec 2
- Inbound status-update webhook keyed by externalDealId — sub-spec 3
- Admin UI for per-network config — sub-spec 4
- Removing or replacing the Frost Law iframe at `/dashboard/submit-client`
- Any change to `/api/webhook/referral`
