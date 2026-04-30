# Tariff Intelligence Engine (TIE) — Design Spec

## Overview

The Tariff Intelligence Engine transforms Fintella's TMS widget from a manual referral form into the industry's only AI-powered IEEPA tariff refund calculator and deal packager. It computes per-entry refund estimates with interest, checks CAPE Phase 1 eligibility, counts down to the 80-day liquidation cliff, and converts results into submitted referrals — all from a public URL that requires no login.

**The core insight:** the public calculator IS the lead gen funnel. A broker enters one client's data, sees "$847K refund, 12 entries expiring in 23 days," and converts before the page reloads.

## Phasing

All three phases share one data model. Phase 1 ships within days to catch the rolling 80-day liquidation cliff.

| Phase | Scope | Ship Target |
|-------|-------|-------------|
| 1 | IEEPA Rate DB + Refund Calculator + Public/Widget/Portal/Admin UX | Days |
| 2 | HTS Classification Engine + Tariff Stacking Resolver | Week after P1 |
| 3 | AI Document Intake Wizard + Dossier Builder | Week after P2 |

---

## Phase 1: Rate Database + Refund Calculator

### 1.1 Data Model

#### New Prisma Models (purely additive — no existing models modified)

**IeepaRate** — pre-seeded reference table (~300 rows)

| Field | Type | Description |
|-------|------|-------------|
| id | String @id | CUID |
| executiveOrder | String | "EO 14195", "EO 14257", etc. |
| name | String | Human-readable: "Fentanyl - China 20%" |
| rateType | Enum | `fentanyl`, `reciprocal`, `section122` |
| countryCode | String | ISO 3166-1 alpha-2: "CN", "VN", etc. |
| countryName | String | "China", "Vietnam", etc. |
| rate | Decimal | 0.20 = 20% |
| effectiveDate | DateTime | When this rate took effect |
| endDate | DateTime? | When superseded (null = terminated Feb 24, 2026) |
| htsChapter99 | String? | "9903.01.25" — the Chapter 99 subheading |
| appliesTo | String | "all" or JSON list of HTS chapters |
| exemptions | Json? | Section 232 product exemptions |
| notes | String? | Context: "90-day pause", "retaliation response" |
| @@unique | [countryCode, rateType, effectiveDate] | Prevents duplicate rate entries |

**InterestRate** — IRS quarterly overpayment rates

| Field | Type | Description |
|-------|------|-------------|
| id | String @id | CUID |
| quarter | String | "2025-Q1" |
| startDate | DateTime | Quarter start |
| endDate | DateTime | Quarter end |
| nonCorporateRate | Decimal | Federal short-term + 3% (typically 7%) |
| corporateRate | Decimal | Federal short-term + 2% (typically 6%) |
| @@unique | [quarter] | One row per quarter |

**TariffDossier** — groups entries for one importer/client

| Field | Type | Description |
|-------|------|-------------|
| id | String @id | CUID |
| partnerId | String? | → Partner (who created it, null for public calc) |
| widgetSessionId | String? | → WidgetSession (if from widget) |
| clientCompany | String | Importer company name |
| clientContact | String? | Contact person |
| clientEmail | String? | For follow-up |
| clientPhone | String? | |
| importerNumber | String? | IRS EIN or CBP-assigned |
| status | Enum | `draft`, `analyzing`, `ready`, `submitted`, `converted` |
| source | Enum | `public_calculator`, `widget`, `portal`, `csv_upload`, `document_ai`, `manual` |
| totalEnteredValue | Decimal? | Sum of all entry values |
| totalEstRefund | Decimal? | Sum of IEEPA duty refunds |
| totalEstInterest | Decimal? | Sum of interest across all entries |
| totalEstCommission | Decimal? | Partner's commission on the refund |
| entryCount | Int @default(0) | Total entries in this dossier |
| eligibleCount | Int @default(0) | Phase 1 eligible entries |
| excludedCount | Int @default(0) | Excluded entries (wrong type, expired, etc.) |
| urgentCount | Int @default(0) | Entries within 14 days of 80-day cliff |
| nearestDeadline | DateTime? | Earliest expiring entry's deadline |
| deadlineDays | Int? | Days until nearestDeadline |
| dealId | String? | → Deal (linked when submitted as referral) |
| convertedAt | DateTime? | When dossier became a Deal |
| createdAt | DateTime @default(now()) | |
| updatedAt | DateTime @updatedAt | |
| entries | TariffEntry[] | |
| documents | DossierDocument[] | |

**TariffEntry** — one row per customs entry being analyzed

| Field | Type | Description |
|-------|------|-------------|
| id | String @id | CUID |
| dossierId | String | → TariffDossier |
| entryNumber | String? | 11-digit CBP format: XXX-XXXXXXX-X |
| entryDate | DateTime | Determines which IEEPA rate applies |
| entryType | String? | "01" consumption, "03" AD/CVD, etc. |
| portCode | String? | 4-digit Schedule D port |
| countryOfOrigin | String | ISO 3166-1 alpha-2 |
| enteredValue | Decimal | Total entered value (USD) |
| totalDutyPaid | Decimal? | Total duty paid across all programs |
| ieepaRateId | String? | → IeepaRate (looked up from country+date) |
| ieepaRate | Decimal | The applicable IEEPA rate (snapshot) |
| ieepaDuty | Decimal | enteredValue × ieepaRate |
| estimatedInterest | Decimal | Computed per 19 USC §1505 |
| estimatedRefund | Decimal | ieepaDuty + estimatedInterest |
| liquidationDate | DateTime? | From ACE (if known) |
| liquidationStatus | Enum | `unliquidated`, `liquidated`, `final`, `unknown` |
| eligibility | Enum | `eligible`, `excluded_type`, `excluded_expired`, `excluded_adcvd`, `excluded_protest`, `unknown` |
| eligibilityReason | String? | Human-readable: "Type 09 reconciliation excluded" |
| deadlineDate | DateTime? | 80-day cliff date (liquidationDate + 80 days) |
| deadlineDays | Int? | Days remaining until cliff |
| isUrgent | Boolean @default(false) | deadlineDays <= 14 |
| htsCodes | String[] | All HTS codes on this entry |
| chapter99Codes | String[] | 9903.01.xx / 9903.02.xx codes |
| hasSection301 | Boolean @default(false) | Stacking flag |
| hasSection232 | Boolean @default(false) | Stacking flag |
| hasAdCvd | Boolean @default(false) | Stacking flag |
| extractedFrom | Enum? | `manual`, `csv`, `document_ai` |
| confidence | Decimal? | AI extraction confidence 0-1 |
| needsReview | Boolean @default(false) | Flagged for human review |
| lines | TariffEntryLine[] | Per-line HTS breakdown (Phase 2) |
| createdAt | DateTime @default(now()) | |

**TariffEntryLine** — per-line HTS classification within an entry (Phase 2, but schema ships now)

| Field | Type | Description |
|-------|------|-------------|
| id | String @id | CUID |
| entryId | String | → TariffEntry |
| lineNumber | Int | CF 7501 Block 22 |
| htsCode | String | 10-digit: XXXX.XX.XXXX |
| description | String? | Merchandise description |
| countryOfOrigin | String | Per-line country (may differ from entry header) |
| enteredValue | Decimal | Line-level entered value |
| dutyRate | Decimal? | Base duty rate |
| dutyAmount | Decimal? | Base duty amount |
| isChapter99 | Boolean @default(false) | Is this a Chapter 99 IEEPA line? |
| chapter99Code | String? | 9903.XX.XX subheading |
| chapter99Rate | Decimal? | IEEPA rate on this line |
| chapter99Duty | Decimal? | IEEPA duty amount |
| parentLineNumber | Int? | Links Ch.99 line to its commodity line |
| ieepaApplicable | Boolean @default(true) | False if Section 232 exemption applies |
| confidence | Decimal? | AI extraction confidence |

**DossierDocument** — uploaded files (Phase 3, but schema ships now)

| Field | Type | Description |
|-------|------|-------------|
| id | String @id | CUID |
| dossierId | String | → TariffDossier |
| docType | Enum | `cf7501`, `cf7501_continuation`, `commercial_invoice`, `ace_report`, `cargowise_export`, `other` |
| fileName | String | Original filename |
| fileUrl | String | Vercel Blob URL |
| fileSize | Int | Bytes |
| mimeType | String | application/pdf, image/png, etc. |
| status | Enum | `uploaded`, `processing`, `extracted`, `failed` |
| extractedData | Json? | Structured extraction output |
| confidence | Decimal? | Overall extraction confidence |
| extractedEntryCount | Int? | How many entries were extracted |
| processingLog | String? | AI processing notes |
| createdAt | DateTime @default(now()) | |

### 1.2 Calculator Engine

#### Rate Lookup

```
lookupIeepaRate(countryCode, entryDate) → IeepaRate | null

1. Query IeepaRate WHERE countryCode = input AND effectiveDate <= entryDate
   AND (endDate IS NULL OR endDate > entryDate)
   ORDER BY effectiveDate DESC, rateType ASC
2. If multiple rates apply (fentanyl + reciprocal), SUM them
   - China after April 2: fentanyl (20%) + reciprocal (varies) = combined rate
3. Check exemptions: if product is Section 232 steel/aluminum/auto, IEEPA does not apply
4. Return the rate and the IeepaRate record(s) for audit trail
```

#### Combined Rate Logic (China)

China is the complex case because fentanyl and reciprocal tariffs stacked:

| Period | Fentanyl | Reciprocal | Combined |
|--------|----------|------------|----------|
| Feb 4 – Mar 3, 2025 | 10% | — | 10% |
| Mar 4 – Apr 1, 2025 | 20% | — | 20% |
| Apr 2 – Apr 8, 2025 | 20% | 34% | 54% |
| Apr 9 – May 13, 2025 | 20% | 125% | 145% |
| May 14 – Oct 2025 | 20% | 10% | 30% |
| Nov 4, 2025 – Feb 23, 2026 | 10% | 10% | 20% |
| Feb 24, 2026+ | TERMINATED | TERMINATED | 0% |

All other countries: 10% baseline reciprocal (April 5 – Feb 23, 2026), with country-specific higher rates only during April 9 (paused same day for 90 days, then never reinstated before termination).

Canada: 25% (10% on energy resources), with USMCA-compliant goods paused Mar 7 – Apr 2.

Mexico: 25%, with USMCA-compliant goods paused Mar 7 – Apr 2.

#### IEEPA Duty Calculation

```
For each TariffEntry:
  ieepaRate = lookupIeepaRate(countryOfOrigin, entryDate)
  ieepaDuty = enteredValue × ieepaRate
```

#### Interest Calculation (19 USC §1505)

```
depositDate = entryDate (when duties were deposited)
endDate = min(liquidationDate ?? today, Feb 24, 2026)

For each quarter Q between depositDate and endDate:
  daysInQ = overlap days between [depositDate, endDate] and quarter Q
  quarterRate = InterestRate.nonCorporateRate for quarter Q
  daysInYear = isLeapYear(Q.year) ? 366 : 365
  interestQ = (((1 + (quarterRate / daysInYear)) ^ daysInQ) - 1) × ieepaDuty

totalInterest = sum of interestQ for all quarters
```

IRS quarterly rates for the IEEPA period:

| Quarter | Non-Corporate | Corporate |
|---------|--------------|-----------|
| 2025-Q1 | 7% | 6% |
| 2025-Q2 | 7% | 6% |
| 2025-Q3 | 7% | 6% |
| 2025-Q4 | 7% | 6% |
| 2026-Q1 | 7% | 6% |
| 2026-Q2 | 7% | 6% |

#### Eligibility Check (CAPE Phase 1)

```
function checkEligibility(entry: TariffEntry): Eligibility {
  // Entry must be within IEEPA period
  if (entry.entryDate < "2025-02-01" || entry.entryDate > "2026-02-23")
    return { status: "excluded_type", reason: "Entry date outside IEEPA period" }

  // Entry type exclusions
  const excludedTypes = ["08", "09", "23", "47"]
  if (excludedTypes.includes(entry.entryType))
    return { status: "excluded_type", reason: `Type ${entry.entryType} excluded from Phase 1` }

  // Must have IEEPA HTS codes
  if (entry.ieepaRate === 0)
    return { status: "excluded_type", reason: "No IEEPA tariff applicable for this country/date" }

  // Liquidation check
  if (entry.liquidationStatus === "final") {
    const daysSinceLiq = daysBetween(entry.liquidationDate, today)
    if (daysSinceLiq > 80)
      return { status: "excluded_expired", reason: "Liquidated >80 days ago — permanently ineligible" }
  }

  // AD/CVD pending
  if (entry.hasAdCvd && entry.liquidationStatus === "unliquidated")
    return { status: "excluded_adcvd", reason: "AD/CVD pending liquidation instructions" }

  // Calculate deadline
  if (entry.liquidationDate) {
    const deadlineDate = addDays(entry.liquidationDate, 80)
    const daysLeft = daysBetween(today, deadlineDate)
    entry.deadlineDays = daysLeft
    entry.isUrgent = daysLeft <= 14
    if (daysLeft <= 0)
      return { status: "excluded_expired", reason: "80-day reliquidation window has closed" }
  }

  return { status: "eligible", reason: "Phase 1 eligible" }
}
```

#### Dossier Aggregation

```
function aggregateDossier(dossier: TariffDossier): void {
  const entries = dossier.entries
  dossier.entryCount = entries.length
  dossier.totalEnteredValue = sum(entries, e => e.enteredValue)
  dossier.totalEstRefund = sum(entries, e => e.ieepaDuty)
  dossier.totalEstInterest = sum(entries, e => e.estimatedInterest)
  dossier.eligibleCount = count(entries, e => e.eligibility === "eligible")
  dossier.excludedCount = count(entries, e => e.eligibility.startsWith("excluded"))
  dossier.urgentCount = count(entries, e => e.isUrgent)
  dossier.nearestDeadline = min(entries, e => e.deadlineDate)
  dossier.deadlineDays = min(entries, e => e.deadlineDays)
  dossier.totalEstCommission = dossier.totalEstRefund * partner.commissionRate
}
```

### 1.3 API Routes

All routes follow existing patterns: NextAuth session + role check, JSON responses, demo-gate on env vars.

#### Public (no auth)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/tariff/calculate` | Quick estimate: country + value + date → refund |
| GET | `/api/tariff/rates` | List available countries with date ranges |
| GET | `/api/tariff/rates/[countryCode]` | Rate timeline for a country |

**POST /api/tariff/calculate** request:
```json
{
  "entries": [
    {
      "countryOfOrigin": "CN",
      "entryDate": "2025-06-15",
      "enteredValue": 185000,
      "entryNumber": null,
      "entryType": "01",
      "liquidationDate": null
    }
  ]
}
```

Response:
```json
{
  "summary": {
    "totalEnteredValue": 185000,
    "totalEstRefund": 55500,
    "totalEstInterest": 2775,
    "totalEstTotal": 58275,
    "entryCount": 1,
    "eligibleCount": 1,
    "urgentCount": 0
  },
  "entries": [
    {
      "countryOfOrigin": "CN",
      "entryDate": "2025-06-15",
      "enteredValue": 185000,
      "ieepaRate": 0.30,
      "rateName": "Fentanyl 20% + Reciprocal 10% (90-day deal)",
      "ieepaDuty": 55500,
      "estimatedInterest": 2775,
      "estimatedRefund": 58275,
      "eligibility": "eligible",
      "deadlineDays": null,
      "rateBreakdown": {
        "fentanyl": 0.20,
        "reciprocal": 0.10
      }
    }
  ]
}
```

Rate limiting: 60 requests/minute per IP (no auth needed, but prevent abuse).

#### Partner-authenticated

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/partner/dossiers` | List partner's dossiers |
| POST | `/api/partner/dossiers` | Create new dossier |
| GET | `/api/partner/dossiers/[id]` | Get dossier with entries |
| PUT | `/api/partner/dossiers/[id]` | Update dossier |
| POST | `/api/partner/dossiers/[id]/entries` | Add entries to dossier |
| DELETE | `/api/partner/dossiers/[id]/entries/[entryId]` | Remove entry |
| POST | `/api/partner/dossiers/[id]/submit` | Convert dossier → Deal referral |
| POST | `/api/partner/dossiers/[id]/export` | Export PDF/CSV report |
| POST | `/api/partner/dossiers/[id]/cape-csv` | Generate CAPE declaration CSV |
| POST | `/api/partner/dossiers/csv-upload` | Bulk upload entries from CSV |

#### Widget (JWT auth)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/widget/calculate` | Quick estimate from widget |
| POST | `/api/widget/referral` | Submit referral with calculator data attached |

#### Admin

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/tariff/dossiers` | All dossiers with filters |
| PUT | `/api/admin/tariff/dossiers/[id]` | Update dossier status |
| GET | `/api/admin/tariff/rates` | All rates |
| POST | `/api/admin/tariff/rates` | Add/edit rate |
| GET | `/api/admin/tariff/analytics` | Calculator usage, conversion stats |
| GET | `/api/admin/tariff/deadlines` | Entries approaching 80-day cliff |

### 1.4 UX Surfaces

#### Surface 1: Public Calculator — `/calculator`

No login required. This is the lead gen funnel.

**Layout:**
- Hero: "How Much Are Your Clients Owed?" + "Free IEEPA tariff refund estimate — results in 30 seconds"
- Simple form: Country dropdown (with flags), entry date range, total entered value, number of entries
- Calculate button → animated results card
- Results: big green refund number + interest + entry stats + deadline warning (red, urgent)
- Commission preview (shows what the broker would earn)
- CTA: "Submit This Client" → creates account + dossier, or "Calculate Another Client"
- Below the fold: abbreviated version of the broker landing page legal stats (19 USC §1592 penalties, CAPE rejection rates, CIT costs)

**Conversion flow:**
1. Broker lands on /calculator (from cold email, LinkedIn, broker landing page)
2. Enters ONE client: country=China, value=$2.4M, dates=Apr-Dec 2025, entries=47
3. Sees: $847,250 refund + $42,362 interest + 12 entries expiring in 23 days
4. Sees: "Your commission: $169,450"
5. Clicks "Submit This Client" → redirect to /apply or /dashboard/calculator (if logged in)
6. Once authenticated: dossier is created with the calculator data pre-filled

**Data capture (no login):** the calculate endpoint stores results in a cookie/localStorage so they persist when the user creates an account.

#### Surface 2: Widget Calculator Tab

New 4th tab in the existing TMS widget (Dashboard | Calculator | Refer | Info).

**Layout:**
- Compact form: Country dropdown, entered value, entry date
- One-click calculate
- Result card: refund amount + interest
- "Submit as Referral" button → existing WidgetReferral flow with calculator data attached

The widget calculator is intentionally simpler than the portal version. It's a gateway — show the number, close the deal.

#### Surface 3: Partner Portal — `/dashboard/calculator`

Full-power calculator for authenticated partners.

**Tabs:**
1. **Quick Estimate** — same as public calculator but auto-links to partner account
2. **Bulk Upload (CSV)** — upload CSV with columns: entry_number, country, entry_date, entered_value. System adds IEEPA rate, interest, eligibility. Results in a table.
3. **Document Intake (AI)** — Phase 3 tab (disabled until Phase 3, with "Coming Soon" badge)
4. **My Dossiers** — list of all dossiers created by this partner

**Quick Estimate layout:**
- Multi-entry form: rows of [Entry # (optional)] [Country ▼] [Entry Date] [Entered Value] [IEEPA Rate (auto)]
- Add row button, bulk paste from clipboard
- IEEPA rate auto-populated from country + date with a blue info callout
- Summary cards: Est. Refund | Est. Interest | Your Commission | Nearest Deadline
- Actions: Submit as Referral | Export PDF Report | Save as Draft | Generate CAPE CSV

**Bulk Upload layout:**
- Drag-and-drop zone or file picker
- Accepts CSV, TSV, XLSX — with **native ES-003 auto-detection** (the standard CBP ACE report)
- Smart column mapping: auto-detects "Entry Summary Number", "Tariff Ordinal Number", "Goods Value", "Country of Origin", "Liquidation Status", "Liquidation Date" from ES-003 headers. Also maps CargoWise and Magaya export column names.
- Required columns (flexible names): country (or country_of_origin), entry_date, entered_value
- Optional columns: entry_number, entry_type, liquidation_date, hts_codes, importer_name, importer_number
- **Auto-group by importer** — if importer_name/importer_number columns present, results grouped by client with per-client refund totals
- **Sample data button** — "Try with demo data" loads 47 sample entries across 3 importers (China, Vietnam, EU) so brokers can see the output format before uploading real data
- Preview table with validation highlights (red for errors, yellow for warnings)
- "Calculate All" → runs calculator engine on every row
- Results table with sorting, filtering, export
- **CAPE pre-validation** — checks UTF-8 encoding, duplicate entries, entry number format, filer code consistency

**My Dossiers layout:**
- Table: Client Company | Entries | Est. Refund | Status | Urgent ⚠️ | Created | Actions
- Status badges: draft (gray), analyzing (purple), ready (green), submitted (yellow), converted (blue)
- Click → dossier detail page with entry-level breakdown

#### Surface 4: Admin Console — `/admin/tariff-engine`

**Tabs:**
1. **Dossier Pipeline** — Kanban-style pipeline: Draft → Analyzing → Ready → Submitted → Converted. Cards show client name, entry count, est. refund, partner name, urgent count.
2. **Rate Database** — table of all IeepaRate records. Admin can add/edit rates (for corrections or new EOs). Seed data is read-only, admin additions are editable.
3. **Calculator Analytics** — usage stats: calculations/day, unique IPs, conversion rate (calculate → submit), top countries, avg refund size.
4. **CAPE Tracking** — entries grouped by CAPE declaration status (generated, filed, acknowledged). Deadline countdown dashboard.
5. **Deadline Alerts** — entries approaching 80-day cliff, sorted by urgency. Red/yellow/green coding.

### 1.5 Seed Data

The IeepaRate table will be pre-seeded with ~300 rows covering:

**China (10+ rate periods):**
- EO 14195 fentanyl 10% (Feb 4 – Mar 3, 2025)
- EO 14195 fentanyl 20% (Mar 4 – Oct 2025)
- EO 14195 fentanyl 10% (Nov 4, 2025 – Feb 23, 2026)
- EO 14257 reciprocal 34% (Apr 2 – Apr 8, 2025)
- Retaliation reciprocal 125% (Apr 9 – May 13, 2025)
- 90-day deal reciprocal 10% (May 14 – Oct 2025)
- Extension reciprocal 10% (Nov 4, 2025 – Feb 23, 2026)

**Canada (3+ rate periods):**
- EO 14193: 25% most goods, 10% energy (Feb 4 – Feb 23, 2026)
- USMCA pause (Mar 7 – Apr 2, 2025) — separate rows with rate=0

**Mexico (3+ rate periods):**
- EO 14194: 25% all goods (Feb 4 – Feb 23, 2026)
- USMCA pause (Mar 7 – Apr 2, 2025)

**Liberation Day countries (~180 rows):**
- All countries from EO 14257 Annex I with their specific reciprocal rates
- Most were 10% baseline (Apr 5 – Feb 23, 2026) since the country-specific rates were paused on Apr 9

**Interest rates (6 rows):**
- Q1 2025 through Q2 2026, all 7%/6% (non-corp/corp)

The seed script will use `prisma db seed` with upsert semantics.

### 1.6 CAPE CSV Generation

The system can auto-generate CAPE-ready CSV files:

```
Entry Number
ABC-1234567-8
DEF-2345678-9
```

Rules:
- Single column, header "Entry Number"
- Max 9,999 entries per file (auto-batch if more)
- Entry number format: XXX-XXXXXXX-X with check digit validation
- Only include entries with eligibility = "eligible"
- Only include entries with liquidationStatus = "liquidated" and within 180-day protest window

### 1.7 PDF Report Export

Partners can export a client-ready PDF report containing:
- Client company name and analysis date
- Summary: total entries, eligible entries, estimated refund, estimated interest
- Entry table: entry number, country, date, value, IEEPA rate, refund, eligibility, deadline
- Deadline warnings for urgent entries
- Fintella branding and contact info
- Legal disclaimer: "Estimates only. Actual refunds subject to CBP review."

Generated server-side using React-PDF or html-to-pdf.

### 1.8 Go-to-Market Integration

**Cold email campaign (14,454 CBP contacts):**
- Email subject: "Your clients are owed IEEPA refunds — see how much in 30 seconds"
- CTA link: `fintella.partners/calculator` (NOT the signup page)
- The calculator IS the pitch

**Broker landing page (`/partners/brokers`):**
- Add "Try the Calculator" CTA button linking to /calculator
- Add live calculator widget embedded inline in the "Earnings math" section

**Widget demo:**
- Record GIF of calculator in action inside CargoWise
- Embed in broker outreach emails

**Partner portal home:**
- Add "Tariff Calculator" card to the partner home dashboard modules
- Show partner's dossier stats: total refunds calculated, pending submissions

**Google Ads:**
- Landing page variant at `/calculator?utm_source=google` with conversion tracking
- Target keywords: "IEEPA refund calculator", "tariff refund estimate", "CAPE filing help"

---

## Phase 2: HTS Classification Engine

### 2.1 HTS Code Database

Seed from USITC downloadable data (hts.usitc.gov/download):
- All 99 chapters, headings, subheadings
- General duty rates
- Special program indicators (GSP, FTA, etc.)
- Chapter 99 IEEPA subheadings (9903.01.xx, 9903.02.xx, 9903.03.xx)

New model:

**HtsCode**

| Field | Type | Description |
|-------|------|-------------|
| id | String @id | The HTS code itself: "0902.10.1015" |
| chapter | Int | 1-99 |
| heading | String | 4-digit: "0902" |
| subheading | String | 6-digit: "0902.10" |
| usSubheading | String | 8-digit: "0902.10.10" |
| fullCode | String | 10-digit with statistical suffix |
| description | String | Official description |
| generalRate | String? | "Free", "6.4%", "2.1¢/kg" |
| specialPrograms | String[] | ["A", "AU", "BH", "CA", ...] |
| isChapter99 | Boolean | True for 9903.xx.xx codes |
| ieepaRateType | String? | "fentanyl", "reciprocal" for Ch.99 codes |
| section301 | Boolean | Subject to Section 301? |
| section232 | Boolean | Subject to Section 232? |
| notes | String? | |

### 2.2 Tariff Stacking Detection

When a broker enters an HTS code, the engine detects all applicable tariff programs:

```
analyzeTariffStack(htsCode, countryCode, entryDate) → {
  baseDuty: { rate, amount },
  section301: { applicable, rate, amount } | null,
  section232: { applicable, rate, amount } | null,
  adCvd: { applicable, caseNumber, rate, amount } | null,
  ieepa: { applicable, rate, amount, refundable: true },
  total: { rate, amount },
  ieepaRefundable: amount  // This is what the client gets back
}
```

The stacking resolver handles the key exemption: products subject to Section 232 steel/aluminum tariffs are EXEMPT from IEEPA tariffs. This prevents the calculator from over-counting refunds.

### 2.3 AI-Assisted HTS Classification

For Phase 2, add a product description → HTS code suggestion feature:
- Broker types "stainless steel kitchen sinks, 18 gauge, single bowl"
- Claude suggests: "7324.10.0000 — Sinks and washbasins, of stainless steel" with confidence score
- Broker confirms or corrects
- Uses Claude Sonnet 4.6 with the HTS database as context (prompt-cached)

### 2.4 Enhanced Calculator

With the HTS engine, the calculator can:
- Accept HTS codes per entry line (not just country-level estimates)
- Show per-line duty breakdown (base + 301 + 232 + IEEPA)
- Highlight which portions are refundable vs. not
- Detect Section 232 exemptions automatically
- Flag potential classification errors

---

## Phase 3: AI Document Intake Wizard

### 3.1 Document Processing Pipeline

```
Upload → Classify → Extract → Normalize → Validate → Enrich → Review → Confirm
```

**Step 1: Upload**
- Drag-and-drop zone accepting PDF, PNG, JPG, XLSX, CSV
- Vercel Blob storage (existing pattern)
- Max 10MB per file, up to 50 files per dossier

**Step 2: Classify**
- Claude vision identifies document type: CF 7501, continuation sheet, commercial invoice, ACE report, CargoWise export, other
- Routes to appropriate extraction pipeline

**Step 3: Extract**
Priority order (accuracy and cost):
1. CSV/XLSX → direct parse (99.9% accurate, free)
2. Text-layer PDF → PDF text extraction (98%+ accurate, minimal cost)
3. Scanned PDF/image → Claude vision extraction (95-98% accurate, AI cost)

For Claude vision extraction of CF 7501:
- Extract all numbered blocks into structured JSON
- Special handling for line items (Block 22-35)
- Chapter 99 lines linked to parent commodity lines
- Per-field confidence scores

**Step 4: Normalize**
- Entry number check digit validation (mod-10 algorithm)
- HTS code format validation (10 digits)
- Country code validation (ISO 3166-1)
- Date format normalization
- Currency normalization (all to USD)

**Step 5: Validate**
- Duty math verification: entered_value × duty_rate ≈ duty_amount (within 1%)
- Cross-reference Chapter 99 codes against IeepaRate database
- Flag inconsistencies for human review
- Check for duplicate entries within dossier

**Step 6: Enrich**
- Look up IEEPA rate from country + date
- Calculate refund and interest
- Check eligibility
- Detect tariff stacking

**Step 7: Review**
- Show extracted data in an interactive table
- Highlight low-confidence fields in yellow
- Highlight errors in red
- Broker can edit any field inline
- "Confirm" locks the data and moves dossier to "ready"

**Step 8: Confirm**
- Dossier moves to "ready" status
- Summary generated
- "Submit as Referral" creates a Deal

### 3.2 Smart Wizard UX

The wizard guides brokers through document intake with conversational UI:

```
Step 1: "Upload your entry documents"
        [Drag & drop zone]
        Accepted: CF 7501, ACE exports, CargoWise reports, invoices

Step 2: "I found 47 entries across 3 documents. Let me verify..."
        [Processing animation]
        [Progress: 12/47 entries extracted]

Step 3: "Here's what I found. Please review:"
        [Interactive table with edit-in-place]
        [Yellow highlights on 3 low-confidence fields]
        "I couldn't read the entry date on line 23. Could you check?"

Step 4: "All verified! Here's your summary:"
        [Summary cards: 47 entries, $847K refund, 12 urgent]
        [Submit as Referral] [Export PDF] [Save Draft]
```

### 3.3 Gap Detection

The AI identifies missing documents:
- "Entry 123-4567890-1 appears on the CF 7501 but I don't see a matching commercial invoice. Want to upload it?"
- "I found HTS codes but no entered values for 3 entries. These might be on a continuation sheet."
- "Liquidation dates are needed for deadline calculation. You can get these from your ACE portal. Want instructions?"

### 3.4 CAPE CSV Auto-Generation

Once a dossier is "ready" and entries are validated:
- One-click "Generate CAPE Declaration" button
- Filters to eligible + liquidated entries
- Validates all entry numbers (check digit)
- Generates CSV file(s) — batched at 9,999 entries each
- Stored in DossierDocument with docType = "cape_csv"
- Downloadable by broker for upload to ACE portal

---

## Cross-Phase Architecture

### Shared Calculator Library

`/src/lib/tariff-calculator.ts` — pure functions, no side effects:
- `lookupIeepaRate(countryCode, entryDate)`
- `calculateIeepaDuty(enteredValue, rate)`
- `calculateInterest(ieepaDuty, depositDate, endDate)`
- `checkEligibility(entry)`
- `aggregateDossier(dossier)`
- `validateEntryNumber(entryNumber)` — check digit validation
- `generateCapeCsv(entries)`

### Environment Variables

| Var | Required | Purpose |
|-----|----------|---------|
| (none new for Phase 1) | — | Rate DB is seeded, calculator is pure math |
| BLOB_READ_WRITE_TOKEN | Phase 3 | Already exists for Vercel Blob uploads |
| ANTHROPIC_API_KEY | Phase 3 | Already exists for AI integration |

Phase 1 requires ZERO new environment variables — it's pure database + math.

### Performance

- Rate lookups: indexed on [countryCode, effectiveDate], ~300 rows total — sub-millisecond
- Calculator: pure math, O(n) entries — negligible
- Dossier aggregation: computed on write (not read) — summary fields denormalized on TariffDossier
- Public calculator: rate-limited at 60 req/min per IP, no auth overhead
- Bulk CSV upload: process async with status polling (for large files)

### Security

- Public calculator: no auth, rate-limited, no PII stored unless user creates account
- Partner routes: standard NextAuth session check
- Widget routes: existing JWT auth (unchanged)
- Admin routes: existing role-based access
- CAPE CSV: generated server-side, stored in Vercel Blob, only accessible to owning partner + admin
- File uploads (Phase 3): existing Vercel Blob pattern with MIME type + size validation

---

## Competitive Landscape & Differentiation

### Existing Competitors (as of April 2026)

| Tool | Type | Weakness |
|------|------|----------|
| Allied CHB | 7501 PDF drag-drop calculator | No TMS embed, single-importer focus, no CAPE generation |
| Flexport | AI audit + bulk upload | Requires Flexport account, no broker multi-client dashboard |
| UNIS/ITEM | ES-003 analyzer | Client-side only (no persistence), no commission tracking |
| The Trade Lab | CSV/Excel upload | Basic calculator, no eligibility pre-check, no deadline tracking |
| TariffClaim.ai | Free upload calculator | No signup, but also no CAPE generation or monitoring |
| TariffRefundIQ | NPV sensitivity model | Analytical, not operational — doesn't generate filing-ready output |
| Tariff Recovery Team | Managed service | Competes with law firms, not broker tools |

### Fintella's Unique Position (What Nobody Else Has)

1. **TMS-embedded widget** — calculator runs INSIDE CargoWise/Magaya, not a separate tab
2. **Multi-client broker dashboard** — one upload, results grouped BY IMPORTER with per-client refund totals
3. **CAPE CSV auto-generation** — pre-validated, correct format (UTF-8, LF, proper header), ready to upload to ACE
4. **Commission tracking** — brokers see their referral earnings alongside refund estimates
5. **Deadline countdown** — per-entry 80-day cliff alerts with urgency badges
6. **Dossier-to-Deal pipeline** — calculator results flow directly into the referral/commission system
7. **AI document intake** (Phase 3) — OCR/extraction from scanned 7501s, not just CSVs
8. **Partner network monetization** — free tool feeds the Arizona-licensed referral commission model

### Critical UX Insights from Competitor Analysis

1. **Accept ES-003 CSV natively** — this is THE standard ACE report brokers already export. Auto-detect columns, no mapping required.
2. **7501 PDF drag-and-drop** — Allied CHB proved this is the "holy shit" moment. Brokers have stacks of 7501 PDFs.
3. **Sample data mode** — let brokers try with demo data before uploading real client info. Lowers the trust barrier.
4. **Zero-signup results** — show refund estimates BEFORE asking for email/account. Gate the CAPE generation and monitoring behind signup.
5. **Auto-group by importer** — brokers manage portfolios of 50-200 importers. Show results per-client, not per-entry.
6. **CAPE format pre-validation** — catch UTF-8 encoding, BOM markers, CRLF line endings, duplicate entries, header format issues BEFORE submission. This alone saves brokers from rejected declarations.
7. **ACH enrollment awareness** — flag clients who may not have refund-specific ACH enrollment. Huge pain point: having an approved refund but no way to receive payment.

### Phase 1 Competitive Advantage

Phase 1 alone (Rate DB + Calculator) beats every competitor because it combines:
- Free public calculator (lead gen) — matches Allied CHB's zero-signup UX
- ES-003 CSV upload (bulk) — matches UNIS/ITEM's ACE integration
- CAPE CSV generation — nobody else does this
- Commission tracking — unique to Fintella
- Deadline countdown — only UNIS/ITEM does this, and not as well
- TMS widget embed — nobody has this
- Multi-client grouping — nobody has this

## What This Spec Does NOT Cover

- ACE API integration (no public API exists — data comes via CSV/document upload)
- Real-time liquidation status monitoring (requires ABI connection — future)
- CIT case filing automation (attorney function, out of scope)
- Multi-currency support (all values in USD, which is how CBP reports)
- Historical HTS revisions (using current USITC data only)
