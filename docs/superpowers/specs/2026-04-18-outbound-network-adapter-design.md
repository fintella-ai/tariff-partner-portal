# Outbound Network Adapter — Core Plumbing (Sub-spec 1 of 4)

**Date:** 2026-04-18
**Status:** Draft (pending user review)
**Scope:** Additive — does NOT modify `/api/webhook/referral` inbound handler, does NOT modify `/dashboard/submit-client` iframe flow, does NOT modify any existing Frost Law integration contract.

## Context

Today Frost Law hosts the client intake form; partners share a UTM-tagged link; Frost Law POSTs referrals **inbound** to `/api/webhook/referral`. That loop stays intact forever.

The bigger goal is **versatility**: Fintella should be able to host its own intake form and POST **outbound** to *any* partner network — Frost Law first, others later (accounting firms, ERC specialists, other tariff specialists, etc.). Each network becomes a pluggable destination. Fintella captures the partner/enterprise-partner chain at form-submit time, sends the payload to the right network's API, and stores the network's returned external deal ID for future correlation.

This sub-spec covers **only the core plumbing**:

- A pluggable **adapter interface** so adding a new network is a single-file change
- A **FrostLawAdapter** implementation (demo-gated per the repo pattern — if the outbound env vars are unset, the call is a no-op that still writes a local Deal + audit row)
- A **schema field** to store the network's external deal ID on the Deal row
- A **single POST endpoint** that accepts a client-intake payload + partnerCode + target network slug, calls the adapter, writes the Deal locally, returns a summary
- A **super-admin-only test route** so the plumbing can be exercised before the public UI ships

Follow-on specs (NOT this one):

- **Sub-spec 2:** Fintella-hosted public intake form at `/intake/[partnerCode]` (the UI)
- **Sub-spec 3:** Inbound status-update webhook keyed by external deal ID (network → Fintella updates)
- **Sub-spec 4:** Admin UI for per-network configuration (URLs, keys, field mappings)

Each sub-spec ships independently.

## Architecture

### Adapter interface

```ts
// src/lib/outbound-networks/types.ts
export type IntakePayload = {
  partnerCode: string;         // Fintella's submitting partner (drives waterfall)
  clientFirstName: string;
  clientLastName: string;
  clientEmail: string;
  clientPhone?: string;
  legalEntityName?: string;
  businessCity?: string;
  businessState?: string;
  serviceOfInterest?: string;  // "IEEPA Tariff Refund", etc.
  estimatedRefundAmount?: number;
  notes?: string;
  // Extensible open map for network-specific fields without schema churn
  extras?: Record<string, string | number | boolean>;
};

export type AdapterResult = {
  status: "submitted" | "demo" | "error";
  externalDealId: string | null;   // network-assigned ID, null on demo/error
  externalDealUrl: string | null;  // optional deep link into the network's system
  rawResponse: unknown;             // whatever the network returned, kept for audit
  errorMessage?: string;
};

export interface OutboundAdapter {
  readonly slug: string;            // "frostlaw", "network-xyz", ...
  readonly displayName: string;
  submit(payload: IntakePayload): Promise<AdapterResult>;
}
```

### Registry

```ts
// src/lib/outbound-networks/registry.ts
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

Adding a new network later = add one file to `src/lib/outbound-networks/<name>.ts` + one line in `registry.ts`. No endpoint changes.

### FrostLawAdapter (demo-gated)

```ts
// src/lib/outbound-networks/frostlaw.ts
export const FrostLawAdapter: OutboundAdapter = {
  slug: "frostlaw",
  displayName: "Frost Law",
  async submit(payload): Promise<AdapterResult> {
    const url = process.env.FROST_LAW_OUTBOUND_URL;
    const key = process.env.FROST_LAW_OUTBOUND_API_KEY;
    if (!url || !key) {
      // Demo gate: matches the existing repo pattern (SendGrid, Twilio, SignWell)
      return {
        status: "demo",
        externalDealId: null,
        externalDealUrl: null,
        rawResponse: { note: "FROST_LAW_OUTBOUND_URL / _API_KEY not set" },
      };
    }
    try {
      const body = mapPayloadToFrostLaw(payload);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": key,
          "User-Agent": "Fintella-Partner-Portal/1.0",
        },
        body: JSON.stringify(body),
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
        externalDealId: (raw && typeof raw.dealId === "string") ? raw.dealId : null,
        externalDealUrl: (raw && typeof raw.dealUrl === "string") ? raw.dealUrl : null,
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

function mapPayloadToFrostLaw(p: IntakePayload) {
  // Field names aligned with the existing inbound webhook body shape so
  // Frost Law can reuse their handler logic on the receiving side.
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
    source: "fintella-outbound",
    ...(p.extras || {}),
  };
}
```

**Exact endpoint URL + request/response contract** will come from Frost Law when they enable the inbound side on their end. Until then the adapter returns `status: "demo"` and a local Deal is still created — same demo-gate pattern as SignWell/SendGrid/Twilio.

### Schema change

`prisma/schema.prisma` — `Deal` model adds:

```prisma
  externalDealId       String?   @unique      // network-assigned ID for outbound-submitted deals
  externalDealUrl      String?                // optional deep link into the network's system
  outboundNetworkSlug  String?                // which adapter submitted this deal ("frostlaw", ...)
  outboundStatus       String?                // last adapter result: "submitted", "demo", "error"
```

All four fields nullable. Existing inbound-created deals leave them null.

Migration: `npx prisma db push --accept-data-loss` per the repo's pre-launch safety posture.

### New endpoint: `POST /api/outbound/referral`

**Auth:** `auth()` session gate. Accepts either a logged-in partner (writes Deal under their `partnerCode`) or a super_admin with an explicit `asPartnerCode` in the body (so admins can submit on behalf of a partner — useful for manual intake and for the super-admin test route).

**Request body:**

```ts
{
  networkSlug: string;       // e.g. "frostlaw"
  client: { firstName, lastName, email, phone?, ... };  // IntakePayload minus partnerCode
  asPartnerCode?: string;    // super_admin only; ignored for partner sessions
}
```

**Flow:**

1. Resolve partnerCode from session (or `asPartnerCode` for super_admin).
2. Look up adapter via `getAdapter(networkSlug)`. 404 if unknown.
3. Build `IntakePayload` and call `adapter.submit(...)`.
4. Transactionally: create the Deal locally with `partnerCode`, populate `externalDealId` / `externalDealUrl` / `outboundNetworkSlug` / `outboundStatus` from the adapter result. Same stage machine (`stage: "new_lead"`) as the inbound webhook — downstream commission computation is unchanged.
5. Return `{ dealId, externalDealId, status }`.

**Error handling:** adapter errors don't block Deal creation — we write the Deal with `outboundStatus: "error"` and the adapter's error message in a `WebhookRequestLog`-style audit row (reuse the existing `WebhookRequestLog` table — it already logs inbound; add a row for outbound too).

### Super-admin test route

`POST /api/admin/dev/outbound-test` — super_admin-only, behind the existing `/api/admin/dev/*` gate. Accepts a `networkSlug` and a minimal client body, calls `/api/outbound/referral` internally (or invokes the library directly), returns the full result. Lets the user exercise plumbing end-to-end before the public UI ships.

### What stays untouched

- `src/app/api/webhook/referral/route.ts` — inbound, unchanged
- `src/app/(partner)/dashboard/submit-client/page.tsx` — unchanged
- `src/lib/commission.ts` — unchanged
- Existing Frost Law env vars (`FROST_LAW_API_KEY`, `REFERRAL_WEBHOOK_SECRET`, `WEBHOOK_SECRET`) — unchanged; the outbound side uses a **new** pair (`FROST_LAW_OUTBOUND_URL`, `FROST_LAW_OUTBOUND_API_KEY`) so inbound and outbound credentials can rotate independently

## Files touched (full list for this sub-spec)

**New:**
- `src/lib/outbound-networks/types.ts` — `IntakePayload`, `AdapterResult`, `OutboundAdapter`
- `src/lib/outbound-networks/registry.ts` — `getAdapter`, `listAdapters`
- `src/lib/outbound-networks/frostlaw.ts` — `FrostLawAdapter`
- `src/lib/__tests__/outbound-networks.test.ts` — unit tests for demo gate + payload mapping (runs via `npx ts-node`, matching the repo's existing test pattern)
- `src/app/api/outbound/referral/route.ts` — the new POST endpoint
- `src/app/api/admin/dev/outbound-test/route.ts` — super-admin test route

**Modified:**
- `prisma/schema.prisma` — four new nullable columns on `Deal`
- `.env.example` — document `FROST_LAW_OUTBOUND_URL` and `FROST_LAW_OUTBOUND_API_KEY` (additive)

**Explicitly NOT touched:**
- `src/app/api/webhook/referral/route.ts`
- `src/app/(partner)/dashboard/submit-client/page.tsx`
- `src/lib/commission.ts`
- Any existing SignWell / SendGrid / Twilio code

## Error handling

- Unknown `networkSlug` → 404 `{ error: "Unknown network" }`
- Adapter timeout / network error → Deal still created, `outboundStatus: "error"`, audit row written, response returns 201 with the error message so the caller can surface it
- Demo gate (env vars unset) → Deal created, `outboundStatus: "demo"`, response returns 201 with a banner-style flag
- Invalid payload (missing firstName/lastName/email) → 400 before adapter is called

## Testing

Unit tests at `src/lib/__tests__/outbound-networks.test.ts` (runs via `npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' <path>`):

1. `getAdapter("frostlaw")` returns the Frost Law adapter
2. `getAdapter("bogus")` returns null
3. `FrostLawAdapter.submit(payload)` with env vars unset → returns `status: "demo"`, `externalDealId: null`
4. `mapPayloadToFrostLaw` passes through standard fields and merges `extras`

Manual integration:
- Super_admin hits `/api/admin/dev/outbound-test` → receives a synthetic Deal row + demo result
- After env vars are populated and Frost Law's inbound side is ready, the same route returns a real `externalDealId`

## Out of scope (explicitly)

- Fintella-hosted public intake form UI — **Sub-spec 2**
- Inbound webhook for network→Fintella status updates keyed by `externalDealId` — **Sub-spec 3**
- Admin UI for per-network URL/key/field-mapping config — **Sub-spec 4**
- Changing the inbound `/api/webhook/referral` contract — never
- Removing the Frost Law iframe from `/dashboard/submit-client` — never
- Enterprise partner override math — unchanged, still keyed off partner chain walk
