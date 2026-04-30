# Smart Routing UI — Design Spec

## Overview

Add a routing layer to the Tariff Intelligence Engine calculator that classifies entries into actionable buckets: "Self-File Ready" (broker files CAPE themselves) vs "Needs Legal Counsel" (referral to legal partner for CIT litigation). This makes the eligibility split visible to brokers and creates a clear path for monetizing complex entries through the existing referral commission model.

## Bucket Mapping

The existing `checkEligibility()` in `src/lib/tariff-calculator.ts` already returns eligibility statuses. This spec adds a routing bucket derived from those statuses.

| Eligibility Status | Routing Bucket | Color | Broker Action |
|---|---|---|---|
| `eligible` (no deadline) | **Self-File Ready** | GREEN | Download CAPE CSV, file in ACE Portal |
| `eligible` (deadline >14 days) | **Self-File Ready** | GREEN | Same, with deadline countdown |
| `eligible` (urgent ≤14 days) | **Self-File Ready** | GREEN (pulse) | Same, with urgent warning |
| `excluded_type` (Type 08/09/23/47) | **Needs Legal Counsel** | RED | Submit to legal partner |
| `excluded_expired` (>80 days) | **Needs Legal Counsel** | RED | Submit to legal partner |
| `excluded_adcvd` (AD/CVD pending) | **Needs Legal Counsel** | RED | Submit to legal partner |
| `excluded_date` (outside IEEPA period) | **Not Applicable** | GRAY | No action — no IEEPA tariff |

## New Calculator Function

Add to `src/lib/tariff-calculator.ts`:

```typescript
export type RoutingBucket = "self_file" | "legal_required" | "not_applicable";

export function getRoutingBucket(eligibilityStatus: string): RoutingBucket {
  if (eligibilityStatus === "eligible") return "self_file";
  if (eligibilityStatus === "excluded_date" || eligibilityStatus === "unknown") return "not_applicable";
  return "legal_required";
}

export function getRoutingLabel(bucket: RoutingBucket): string {
  switch (bucket) {
    case "self_file": return "Self-File Ready";
    case "legal_required": return "Needs Legal Counsel";
    case "not_applicable": return "Not Applicable";
  }
}

export function getRoutingColor(bucket: RoutingBucket): string {
  switch (bucket) {
    case "self_file": return "green";
    case "legal_required": return "red";
    case "not_applicable": return "gray";
  }
}
```

## API Changes

### `POST /api/tariff/calculate` response enhancement

Add `routingBucket` and `routingSummary` to the response:

```json
{
  "summary": {
    "...existing fields...",
    "selfFileCount": 32,
    "legalRequiredCount": 15,
    "notApplicableCount": 0
  },
  "entries": [
    {
      "...existing fields...",
      "routingBucket": "self_file"
    }
  ],
  "routingSummary": {
    "selfFile": { "count": 32, "totalRefund": 450000, "totalInterest": 22500 },
    "legalRequired": { "count": 15, "totalRefund": 397250, "totalInterest": 19862 },
    "notApplicable": { "count": 0, "totalRefund": 0, "totalInterest": 0 }
  }
}
```

## UI Changes

### 1. Public Calculator (`/calculator`) — Routing Summary Card

After the existing results card, add a **Routing Summary** section:

**Self-File section (green border):**
- Count of self-file entries + total refund for those entries
- "Download CAPE CSV" button (only includes self-file + liquidated entries)
- Brief instruction: "Upload this CSV to your ACE Portal → CAPE tab"

**Legal Required section (red border):**
- Count of legal-required entries + total refund for those entries
- Why these need legal: per-status explanation (e.g., "8 entries excluded — protest window expired", "7 entries — AD/CVD pending")
- "Submit to Legal Partner →" button
- Brief explanation: "These entries require Court of International Trade representation to recover"

**Not Applicable section (gray, collapsed/hidden if count is 0)**

### 2. Partner Portal Calculator (`/dashboard/calculator`)

**Entry table badges:**
Each entry row gets a colored badge in a "Route" column:
- Green pill: "Self-File"
- Red pill: "Legal"
- Gray pill: "N/A"

**Summary bar above table:**
Same routing summary as public calculator but with action buttons inline.

**Dossier split:**
When saving as dossier, broker can choose to split into two dossiers:
- One for self-file entries (status: "ready")
- One for legal-required entries (status: "submitted" → creates Deal referral)

### 3. Widget Calculator Tab

Keep it simple — the widget just shows the refund number. Add a one-line note below the result:
- If all entries are self-file: "All entries eligible for self-filing"
- If some need legal: "X entries need legal review — submit as referral for details"

### 4. "Submit to Legal Partner" Flow

When broker clicks "Submit to Legal Partner":

1. If not authenticated → redirect to `/apply` with localStorage data preserved
2. If authenticated:
   a. Filter entries to `legal_required` bucket only
   b. Create a TariffDossier with `source: "portal"`, `status: "submitted"`
   c. Create TariffEntry rows for the legal-required entries only
   d. Create a Deal: `dealName: clientCompany`, `partnerCode`, `stage: "lead_submitted"`, `estimatedRefundAmount: legalRequired.totalRefund`
   e. Link dossier to deal
   f. Fire-and-forget notification email to admin
   g. Show success: "Submitted X entries ($Y estimated refund) to our legal partner. You'll be contacted within 24 hours."

### 5. CAPE CSV Download — Enhanced

The existing CAPE CSV download now:
- Only includes entries where `routingBucket === "self_file"` AND `liquidationStatus === "liquidated"`
- Button label shows count: "Download CAPE CSV (32 entries)"
- If some entries are excluded: show note "15 entries require legal counsel and are not included"
- If no entries are eligible: disable button with message "No entries eligible for self-filing"

## Legal Disclaimers (REQUIRED — must ship with routing UI)

### 1. Calculator Results Disclaimer
Displayed below every calculation result:
> "These estimates are for informational purposes only and do not constitute legal, tax, or customs advice. Actual refund amounts are determined by CBP and may differ. Fintella is not a law firm, customs broker, or licensed professional. Consult a qualified professional before making filing decisions."

### 2. CAPE CSV Download Disclaimer
Displayed on the download button tooltip or confirmation:
> "This CSV is generated from your input data. Fintella does not guarantee accuracy or completeness. You are responsible for verifying all entry data before submitting to CBP. Incorrect CAPE submissions cannot be amended after acceptance."

### 3. Legal Referral Disclaimer
Displayed when broker clicks "Submit to Legal Partner":
> "By submitting, you authorize Fintella to share this entry data with our vetted legal partner for review. This is a referral, not legal representation. Attorney-client relationship is established directly between you/your client and the legal partner. Fintella receives a referral fee per Arizona Supreme Court Administrative Order 2020-180 (ER 5.4)."

### 4. Commission Preview Disclaimer
Below the commission estimate:
> "Commission rates vary by partnership tier and agreement. Displayed rate is illustrative only."

### 5. Rate Data Disclaimer
Footer of calculator page:
> "IEEPA tariff rates sourced from Federal Register executive orders and CBP guidance. Rate data covers Feb 1, 2025 – Feb 23, 2026. Report errors to support@fintella.partners."

## Files to Create/Modify

| File | Change |
|------|--------|
| `src/lib/tariff-calculator.ts` | Add `getRoutingBucket()`, `getRoutingLabel()`, `getRoutingColor()` |
| `src/app/api/tariff/calculate/route.ts` | Add `routingBucket` per entry + `routingSummary` to response |
| `src/app/calculator/page.tsx` | Add Routing Summary section, CAPE CSV button, Submit to Legal CTA, all 5 disclaimers |
| `src/app/(partner)/dashboard/calculator/page.tsx` | Add routing badges, summary bar, dossier split option |
| `src/app/widget/page.tsx` or `src/components/widget/WidgetCalculator.tsx` | Add one-line routing note |
| `src/app/api/partner/dossiers/[id]/submit/route.ts` | Accept optional `bucketFilter` to submit only legal-required entries |

## What This Does NOT Include

- No payment/subscription tier implementation (separate brainstorm)
- No YELLOW "doc prep" bucket (requires CAPE rejection status data)
- No Frost Law direct API integration (uses existing webhook referral pipeline)
- No broker self-service CAPE filing guide content (future content task)
- No per-entry breakdown page (entries are shown in aggregate for now)
