# Tariff Intelligence Engine — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship IEEPA tariff refund calculator with rate database, public lead-gen calculator, widget tab, partner portal, and admin console — all in days, to catch the rolling 80-day CAPE liquidation cliff.

**Architecture:** Purely additive Prisma schema (6 new models, zero existing modifications). Shared calculator library (`src/lib/tariff-calculator.ts`) with pure functions consumed by 4 API layers (public, widget, partner, admin) and 4 UI surfaces (public /calculator, widget tab, partner portal, admin console). Rate data pre-seeded from JSON. Zero new env vars.

**Tech Stack:** Next.js 14 App Router, Prisma 5.20, Neon PostgreSQL, TypeScript, Tailwind CSS. Existing patterns: NextAuth session auth, widget JWT auth, demo-gate, fire-and-forget email.

**Spec:** `docs/superpowers/specs/2026-04-29-tariff-intelligence-engine-design.md`

---

## File Structure

### New Files

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` (modify) | Add 6 models + 5 enums |
| `src/lib/tariff-calculator.ts` | Pure calculator functions: rate lookup, duty calc, interest, eligibility, CAPE CSV |
| `src/lib/tariff-countries.ts` | Country code → name + flag emoji mapping |
| `src/lib/tariff-rate-limiter.ts` | IP-based rate limiter for public calculator (60 req/min) |
| `src/app/api/tariff/calculate/route.ts` | Public calculate endpoint (POST, no auth) |
| `src/app/api/tariff/rates/route.ts` | Public rates list (GET, no auth) |
| `src/app/api/tariff/rates/[countryCode]/route.ts` | Rate timeline per country (GET, no auth) |
| `src/app/api/partner/dossiers/route.ts` | Partner dossier CRUD (GET list, POST create) |
| `src/app/api/partner/dossiers/[id]/route.ts` | Single dossier (GET, PUT) |
| `src/app/api/partner/dossiers/[id]/entries/route.ts` | Add entries (POST) |
| `src/app/api/partner/dossiers/[id]/submit/route.ts` | Convert dossier → Deal (POST) |
| `src/app/api/partner/dossiers/[id]/cape-csv/route.ts` | Generate CAPE CSV (POST) |
| `src/app/api/partner/dossiers/csv-upload/route.ts` | Bulk CSV upload (POST) |
| `src/app/api/widget/calculate/route.ts` | Widget calculator (POST, JWT auth) |
| `src/app/api/admin/tariff/dossiers/route.ts` | Admin dossier list (GET) |
| `src/app/api/admin/tariff/dossiers/[id]/route.ts` | Admin dossier update (PUT) |
| `src/app/api/admin/tariff/rates/route.ts` | Admin rate CRUD (GET, POST) |
| `src/app/calculator/page.tsx` | Public calculator page (lead gen funnel) |
| `src/app/(partner)/dashboard/calculator/page.tsx` | Partner calculator (Quick Estimate + Bulk Upload + Dossiers) |
| `src/app/(admin)/admin/tariff-engine/page.tsx` | Admin console (Pipeline + Rates + Deadlines) |
| `scripts/seed-tariff-rates.js` | Seed script for IeepaRate + InterestRate tables |

### Modified Files

| File | Change |
|------|--------|
| `scripts/seed-all.js` | Add `require('./seed-tariff-rates.js')` call |
| `src/middleware.ts` | Add `/calculator` to public route allowlist |
| `src/app/widget/page.tsx` | Add Calculator tab (4th tab) |
| `src/app/api/widget/referral/route.ts` | Accept optional `calculatorData` field on referral submission |

---

### Task 1: Prisma Schema — Add TIE Models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add enums to schema.prisma**

Add these enums at the top of the schema file, after the datasource block:

```prisma
enum IeepaRateType {
  fentanyl
  reciprocal
  section122
}

enum DossierStatus {
  draft
  analyzing
  ready
  submitted
  converted
}

enum DossierSource {
  public_calculator
  widget
  portal
  csv_upload
  document_ai
  manual
}

enum LiquidationStatus {
  unliquidated
  liquidated
  final
  unknown
}

enum EntryEligibility {
  eligible
  excluded_type
  excluded_expired
  excluded_adcvd
  excluded_protest
  unknown
}

enum DocType {
  cf7501
  cf7501_continuation
  commercial_invoice
  ace_report
  cargowise_export
  cape_csv
  other
}

enum DocStatus {
  uploaded
  processing
  extracted
  failed
}

enum ExtractedFrom {
  manual
  csv
  document_ai
}
```

- [ ] **Step 2: Add IeepaRate model**

```prisma
model IeepaRate {
  id              String        @id @default(cuid())
  executiveOrder  String
  name            String
  rateType        IeepaRateType
  countryCode     String
  countryName     String
  rate            Decimal
  effectiveDate   DateTime
  endDate         DateTime?
  htsChapter99    String?
  appliesTo       String        @default("all")
  exemptions      Json?
  notes           String?
  isSeeded        Boolean       @default(true)
  createdAt       DateTime      @default(now())

  entries         TariffEntry[]

  @@unique([countryCode, rateType, effectiveDate])
  @@index([countryCode, effectiveDate])
}
```

- [ ] **Step 3: Add InterestRate model**

```prisma
model InterestRate {
  id               String   @id @default(cuid())
  quarter          String   @unique
  startDate        DateTime
  endDate          DateTime
  nonCorporateRate Decimal
  corporateRate    Decimal
  createdAt        DateTime @default(now())
}
```

- [ ] **Step 4: Add TariffDossier model**

```prisma
model TariffDossier {
  id                String        @id @default(cuid())
  partnerId         String?
  partner           Partner?      @relation(fields: [partnerId], references: [id])
  widgetSessionId   String?
  widgetSession     WidgetSession? @relation(fields: [widgetSessionId], references: [id])
  clientCompany     String
  clientContact     String?
  clientEmail       String?
  clientPhone       String?
  importerNumber    String?
  status            DossierStatus @default(draft)
  source            DossierSource
  totalEnteredValue Decimal?
  totalEstRefund    Decimal?
  totalEstInterest  Decimal?
  totalEstCommission Decimal?
  entryCount        Int           @default(0)
  eligibleCount     Int           @default(0)
  excludedCount     Int           @default(0)
  urgentCount       Int           @default(0)
  nearestDeadline   DateTime?
  deadlineDays      Int?
  dealId            String?
  deal              Deal?         @relation(fields: [dealId], references: [id])
  convertedAt       DateTime?
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  entries           TariffEntry[]
  documents         DossierDocument[]

  @@index([partnerId])
  @@index([status])
}
```

- [ ] **Step 5: Add TariffEntry model**

```prisma
model TariffEntry {
  id                String            @id @default(cuid())
  dossierId         String
  dossier           TariffDossier     @relation(fields: [dossierId], references: [id], onDelete: Cascade)
  entryNumber       String?
  entryDate         DateTime
  entryType         String?
  portCode          String?
  countryOfOrigin   String
  enteredValue      Decimal
  totalDutyPaid     Decimal?
  ieepaRateId       String?
  ieepaRateRef      IeepaRate?        @relation(fields: [ieepaRateId], references: [id])
  ieepaRate         Decimal
  ieepaDuty         Decimal
  estimatedInterest Decimal
  estimatedRefund   Decimal
  liquidationDate   DateTime?
  liquidationStatus LiquidationStatus @default(unknown)
  eligibility       EntryEligibility  @default(unknown)
  eligibilityReason String?
  deadlineDate      DateTime?
  deadlineDays      Int?
  isUrgent          Boolean           @default(false)
  htsCodes          String[]
  chapter99Codes    String[]
  hasSection301     Boolean           @default(false)
  hasSection232     Boolean           @default(false)
  hasAdCvd          Boolean           @default(false)
  extractedFrom     ExtractedFrom?
  confidence        Decimal?
  needsReview       Boolean           @default(false)
  createdAt         DateTime          @default(now())

  lines             TariffEntryLine[]

  @@index([dossierId])
  @@index([countryOfOrigin, entryDate])
}
```

- [ ] **Step 6: Add TariffEntryLine model**

```prisma
model TariffEntryLine {
  id               String       @id @default(cuid())
  entryId          String
  entry            TariffEntry  @relation(fields: [entryId], references: [id], onDelete: Cascade)
  lineNumber       Int
  htsCode          String
  description      String?
  countryOfOrigin  String
  enteredValue     Decimal
  dutyRate         Decimal?
  dutyAmount       Decimal?
  isChapter99      Boolean      @default(false)
  chapter99Code    String?
  chapter99Rate    Decimal?
  chapter99Duty    Decimal?
  parentLineNumber Int?
  ieepaApplicable  Boolean      @default(true)
  confidence       Decimal?
  createdAt        DateTime     @default(now())

  @@index([entryId])
}
```

- [ ] **Step 7: Add DossierDocument model**

```prisma
model DossierDocument {
  id                 String        @id @default(cuid())
  dossierId          String
  dossier            TariffDossier @relation(fields: [dossierId], references: [id], onDelete: Cascade)
  docType            DocType
  fileName           String
  fileUrl            String
  fileSize           Int
  mimeType           String
  status             DocStatus     @default(uploaded)
  extractedData      Json?
  confidence         Decimal?
  extractedEntryCount Int?
  processingLog      String?
  createdAt          DateTime      @default(now())

  @@index([dossierId])
}
```

- [ ] **Step 8: Add reverse relations on existing models**

Add to the `Partner` model:

```prisma
  tariffDossiers TariffDossier[]
```

Add to the `WidgetSession` model:

```prisma
  tariffDossiers TariffDossier[]
```

Add to the `Deal` model:

```prisma
  tariffDossiers TariffDossier[]
```

- [ ] **Step 9: Generate Prisma client and verify**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" success message

- [ ] **Step 10: Push schema to database**

Run: `npx prisma db push`
Expected: "Your database is now in sync with your Prisma schema" — all 6 new tables created

- [ ] **Step 11: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add Tariff Intelligence Engine schema — 6 new models, 7 enums"
```

---

### Task 2: Calculator Library — Pure Functions

**Files:**
- Create: `src/lib/tariff-calculator.ts`
- Create: `src/lib/tariff-countries.ts`

- [ ] **Step 1: Create country mapping utility**

Create `src/lib/tariff-countries.ts`:

```typescript
export const COUNTRY_FLAGS: Record<string, string> = {
  CN: "🇨🇳", CA: "🇨🇦", MX: "🇲🇽", VN: "🇻🇳", TW: "🇹🇼", IN: "🇮🇳",
  JP: "🇯🇵", KR: "🇰🇷", DE: "🇩🇪", FR: "🇫🇷", IT: "🇮🇹", GB: "🇬🇧",
  TH: "🇹🇭", ID: "🇮🇩", MY: "🇲🇾", BD: "🇧🇩", KH: "🇰🇭", PH: "🇵🇭",
  PK: "🇵🇰", LK: "🇱🇰", MM: "🇲🇲", LA: "🇱🇦", IL: "🇮🇱", JO: "🇯🇴",
  AU: "🇦🇺", BR: "🇧🇷", NO: "🇳🇴", CH: "🇨🇭", SE: "🇸🇪", FI: "🇫🇮",
  DK: "🇩🇰", NL: "🇳🇱", BE: "🇧🇪", ES: "🇪🇸", PT: "🇵🇹", AT: "🇦🇹",
  IE: "🇮🇪", PL: "🇵🇱", CZ: "🇨🇿", HU: "🇭🇺", RO: "🇷🇴", GR: "🇬🇷",
  TR: "🇹🇷", ZA: "🇿🇦", NG: "🇳🇬", EG: "🇪🇬", SA: "🇸🇦", AE: "🇦🇪",
  SG: "🇸🇬", NZ: "🇳🇿", CL: "🇨🇱", CO: "🇨🇴", AR: "🇦🇷", PE: "🇵🇪",
};

export function getCountryFlag(code: string): string {
  return COUNTRY_FLAGS[code.toUpperCase()] || "🏳️";
}

export const IEEPA_TERMINATION_DATE = new Date("2026-02-24T00:00:00Z");
export const IEEPA_START_DATE = new Date("2025-02-01T00:00:00Z");
export const IEEPA_END_DATE = new Date("2026-02-23T23:59:59Z");
```

- [ ] **Step 2: Create tariff-calculator.ts with rate lookup**

Create `src/lib/tariff-calculator.ts`:

```typescript
import { Decimal } from "@prisma/client/runtime/library";

export interface RateRecord {
  id: string;
  rateType: string;
  rate: Decimal | number;
  name: string;
  executiveOrder: string;
  countryCode: string;
  effectiveDate: Date;
  endDate: Date | null;
}

export interface RateLookupResult {
  combinedRate: number;
  rates: RateRecord[];
  rateName: string;
  breakdown: { fentanyl?: number; reciprocal?: number; section122?: number };
}

export function lookupCombinedRate(rates: RateRecord[]): RateLookupResult {
  const breakdown: Record<string, number> = {};
  let combinedRate = 0;
  const names: string[] = [];

  for (const r of rates) {
    const rateNum = typeof r.rate === "number" ? r.rate : Number(r.rate);
    breakdown[r.rateType] = (breakdown[r.rateType] || 0) + rateNum;
    combinedRate += rateNum;
    names.push(r.name);
  }

  return {
    combinedRate,
    rates,
    rateName: names.join(" + ") || "No IEEPA tariff",
    breakdown: {
      fentanyl: breakdown.fentanyl,
      reciprocal: breakdown.reciprocal,
      section122: breakdown.section122,
    },
  };
}

export function calculateIeepaDuty(enteredValue: number, rate: number): number {
  return Math.round(enteredValue * rate * 100) / 100;
}

interface QuarterRate {
  startDate: Date;
  endDate: Date;
  nonCorporateRate: number;
}

export function calculateInterest(
  ieepaDuty: number,
  depositDate: Date,
  endDate: Date,
  quarterRates: QuarterRate[]
): number {
  if (ieepaDuty <= 0 || depositDate >= endDate) return 0;

  let totalInterest = 0;

  for (const q of quarterRates) {
    const qStart = q.startDate > depositDate ? q.startDate : depositDate;
    const qEnd = q.endDate < endDate ? q.endDate : endDate;
    if (qStart >= qEnd) continue;

    const days = Math.ceil(
      (qEnd.getTime() - qStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    const year = qStart.getFullYear();
    const daysInYear = isLeapYear(year) ? 366 : 365;
    const rate = typeof q.nonCorporateRate === "number"
      ? q.nonCorporateRate
      : Number(q.nonCorporateRate);

    const interestQ =
      (Math.pow(1 + rate / daysInYear, days) - 1) * ieepaDuty;
    totalInterest += interestQ;
  }

  return Math.round(totalInterest * 100) / 100;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const EXCLUDED_ENTRY_TYPES = ["08", "09", "23", "47"];
const IEEPA_START = new Date("2025-02-01");
const IEEPA_END = new Date("2026-02-23");

export interface EligibilityResult {
  status: string;
  reason: string;
  deadlineDays?: number;
  isUrgent?: boolean;
  deadlineDate?: Date;
}

export function checkEligibility(entry: {
  entryDate: Date;
  entryType?: string | null;
  ieepaRate: number;
  liquidationStatus: string;
  liquidationDate?: Date | null;
  hasAdCvd: boolean;
}): EligibilityResult {
  if (entry.entryDate < IEEPA_START || entry.entryDate > IEEPA_END) {
    return {
      status: "excluded_type",
      reason: "Entry date outside IEEPA period (Feb 1, 2025 – Feb 23, 2026)",
    };
  }

  if (entry.entryType && EXCLUDED_ENTRY_TYPES.includes(entry.entryType)) {
    const typeNames: Record<string, string> = {
      "08": "Duty Deferral",
      "09": "Reconciliation",
      "23": "Temporary Importation Under Bond",
      "47": "Drawback",
    };
    return {
      status: "excluded_type",
      reason: `Type ${entry.entryType} (${typeNames[entry.entryType] || "excluded"}) not eligible for Phase 1`,
    };
  }

  if (entry.ieepaRate === 0) {
    return {
      status: "excluded_type",
      reason: "No IEEPA tariff applicable for this country/date combination",
    };
  }

  if (entry.hasAdCvd && entry.liquidationStatus === "unliquidated") {
    return {
      status: "excluded_adcvd",
      reason: "AD/CVD pending liquidation instructions — excluded from Phase 1",
    };
  }

  if (entry.liquidationDate) {
    const deadlineDate = new Date(entry.liquidationDate);
    deadlineDate.setDate(deadlineDate.getDate() + 80);

    const now = new Date();
    const daysLeft = Math.ceil(
      (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysLeft <= 0) {
      return {
        status: "excluded_expired",
        reason: "80-day voluntary reliquidation window has closed — permanently ineligible for Phase 1",
      };
    }

    return {
      status: "eligible",
      reason: "Phase 1 eligible",
      deadlineDays: daysLeft,
      isUrgent: daysLeft <= 14,
      deadlineDate,
    };
  }

  return { status: "eligible", reason: "Phase 1 eligible" };
}

export function validateEntryNumber(entryNumber: string): boolean {
  const clean = entryNumber.replace(/[^A-Z0-9]/gi, "");
  if (clean.length !== 11) return false;

  const charValues: Record<string, number> = {
    A: 2, B: 3, C: 4, D: 5, E: 6, F: 7, G: 8, H: 9, I: 10,
    J: 11, K: 12, L: 13, M: 14, N: 15, O: 16, P: 17, Q: 18,
    R: 19, S: 20, T: 21, U: 22, V: 23, W: 24, X: 25, Y: 26, Z: 27,
  };

  const weights = [1, 3, 1, 3, 1, 3, 1, 3, 1, 3];
  let sum = 0;

  for (let i = 0; i < 10; i++) {
    const ch = clean[i].toUpperCase();
    const val = charValues[ch] ?? parseInt(ch, 10);
    if (isNaN(val)) return false;
    sum += val * weights[i];
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  return parseInt(clean[10], 10) === checkDigit;
}

export function generateCapeCsv(
  entries: Array<{ entryNumber: string; eligibility: string; liquidationStatus: string }>
): string[] {
  const eligible = entries.filter(
    (e) =>
      e.entryNumber &&
      e.eligibility === "eligible" &&
      e.liquidationStatus === "liquidated" &&
      validateEntryNumber(e.entryNumber)
  );

  const BATCH_SIZE = 9999;
  const files: string[] = [];

  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const batch = eligible.slice(i, i + BATCH_SIZE);
    const csv = ["Entry Number", ...batch.map((e) => e.entryNumber)].join("\n");
    files.push(csv);
  }

  return files.length > 0 ? files : ["Entry Number"];
}

export interface DossierSummary {
  entryCount: number;
  eligibleCount: number;
  excludedCount: number;
  urgentCount: number;
  totalEnteredValue: number;
  totalEstRefund: number;
  totalEstInterest: number;
  nearestDeadline: Date | null;
  deadlineDays: number | null;
}

export function aggregateDossier(
  entries: Array<{
    enteredValue: number;
    ieepaDuty: number;
    estimatedInterest: number;
    eligibility: string;
    isUrgent: boolean;
    deadlineDate?: Date | null;
    deadlineDays?: number | null;
  }>
): DossierSummary {
  let totalEnteredValue = 0;
  let totalEstRefund = 0;
  let totalEstInterest = 0;
  let eligibleCount = 0;
  let excludedCount = 0;
  let urgentCount = 0;
  let nearestDeadline: Date | null = null;
  let minDeadlineDays: number | null = null;

  for (const e of entries) {
    totalEnteredValue += e.enteredValue;
    totalEstRefund += e.ieepaDuty;
    totalEstInterest += e.estimatedInterest;
    if (e.eligibility === "eligible") eligibleCount++;
    if (e.eligibility.startsWith("excluded")) excludedCount++;
    if (e.isUrgent) urgentCount++;
    if (e.deadlineDate) {
      if (!nearestDeadline || e.deadlineDate < nearestDeadline) {
        nearestDeadline = e.deadlineDate;
      }
    }
    if (e.deadlineDays != null) {
      if (minDeadlineDays == null || e.deadlineDays < minDeadlineDays) {
        minDeadlineDays = e.deadlineDays;
      }
    }
  }

  return {
    entryCount: entries.length,
    eligibleCount,
    excludedCount,
    urgentCount,
    totalEnteredValue: Math.round(totalEnteredValue * 100) / 100,
    totalEstRefund: Math.round(totalEstRefund * 100) / 100,
    totalEstInterest: Math.round(totalEstInterest * 100) / 100,
    nearestDeadline,
    deadlineDays: minDeadlineDays,
  };
}
```

- [ ] **Step 3: Verify build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to tariff-calculator.ts or tariff-countries.ts

- [ ] **Step 4: Commit**

```bash
git add src/lib/tariff-calculator.ts src/lib/tariff-countries.ts
git commit -m "feat: add tariff calculator library — rate lookup, interest, eligibility, CAPE CSV"
```

---

### Task 3: Seed Script — Pre-populate Rate Database

**Files:**
- Create: `scripts/seed-tariff-rates.js`
- Modify: `scripts/seed-all.js`

- [ ] **Step 1: Create seed-tariff-rates.js**

Create `scripts/seed-tariff-rates.js`:

```javascript
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

async function seedTariffRates() {
  const prisma = new PrismaClient();

  try {
    const dataPath = path.join(__dirname, "../prisma/seed-data/ieepa-tariff-rates.json");
    if (!fs.existsSync(dataPath)) {
      console.log("⏭️  No ieepa-tariff-rates.json found, skipping tariff rate seed");
      return;
    }

    const raw = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
    const rates = raw.rates || [];
    console.log(`📊 Seeding ${rates.length} IEEPA tariff rates...`);

    let upserted = 0;
    for (const r of rates) {
      await prisma.ieepaRate.upsert({
        where: {
          countryCode_rateType_effectiveDate: {
            countryCode: r.countryCode,
            rateType: r.rateType,
            effectiveDate: new Date(r.effectiveDate),
          },
        },
        create: {
          executiveOrder: r.executiveOrder,
          name: r.name,
          rateType: r.rateType,
          countryCode: r.countryCode,
          countryName: r.countryName,
          rate: r.rate,
          effectiveDate: new Date(r.effectiveDate),
          endDate: r.endDate ? new Date(r.endDate) : null,
          htsChapter99: r.htsChapter99 || null,
          appliesTo: r.appliesTo || "all",
          exemptions: r.exemptions || null,
          notes: r.notes || null,
          isSeeded: true,
        },
        update: {
          name: r.name,
          rate: r.rate,
          endDate: r.endDate ? new Date(r.endDate) : null,
          notes: r.notes || null,
        },
      });
      upserted++;
    }
    console.log(`✅ Upserted ${upserted} IEEPA rates`);

    const interestRates = raw.interestRates || [];
    if (interestRates.length > 0) {
      console.log(`📊 Seeding ${interestRates.length} IRS interest rates...`);
      for (const ir of interestRates) {
        await prisma.interestRate.upsert({
          where: { quarter: ir.quarter },
          create: {
            quarter: ir.quarter,
            startDate: new Date(ir.startDate),
            endDate: new Date(ir.endDate),
            nonCorporateRate: ir.nonCorporateRate,
            corporateRate: ir.corporateRate,
          },
          update: {
            nonCorporateRate: ir.nonCorporateRate,
            corporateRate: ir.corporateRate,
          },
        });
      }
      console.log(`✅ Upserted ${interestRates.length} interest rates`);
    } else {
      console.log("📊 Seeding default IRS interest rates (Q1 2025 – Q2 2026)...");
      const defaultRates = [
        { quarter: "2025-Q1", startDate: "2025-01-01", endDate: "2025-03-31", nonCorporateRate: 0.07, corporateRate: 0.06 },
        { quarter: "2025-Q2", startDate: "2025-04-01", endDate: "2025-06-30", nonCorporateRate: 0.07, corporateRate: 0.06 },
        { quarter: "2025-Q3", startDate: "2025-07-01", endDate: "2025-09-30", nonCorporateRate: 0.07, corporateRate: 0.06 },
        { quarter: "2025-Q4", startDate: "2025-10-01", endDate: "2025-12-31", nonCorporateRate: 0.07, corporateRate: 0.06 },
        { quarter: "2026-Q1", startDate: "2026-01-01", endDate: "2026-03-31", nonCorporateRate: 0.07, corporateRate: 0.06 },
        { quarter: "2026-Q2", startDate: "2026-04-01", endDate: "2026-06-30", nonCorporateRate: 0.06, corporateRate: 0.05 },
      ];
      for (const ir of defaultRates) {
        await prisma.interestRate.upsert({
          where: { quarter: ir.quarter },
          create: {
            quarter: ir.quarter,
            startDate: new Date(ir.startDate),
            endDate: new Date(ir.endDate),
            nonCorporateRate: ir.nonCorporateRate,
            corporateRate: ir.corporateRate,
          },
          update: {},
        });
      }
      console.log("✅ Upserted 6 default interest rates");
    }
  } catch (err) {
    console.error("❌ Tariff rate seed error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = seedTariffRates;

if (require.main === module) {
  seedTariffRates().then(() => process.exit(0));
}
```

- [ ] **Step 2: Wire into seed-all.js**

Add at the end of `scripts/seed-all.js`, before `prisma.$disconnect()` or at the very end:

```javascript
// Tariff Intelligence Engine — seed IEEPA rates
const seedTariffRates = require("./seed-tariff-rates.js");
await seedTariffRates();
```

If `seed-all.js` uses a top-level async function, add inside it. If it uses `.then()` chaining, chain it.

- [ ] **Step 3: Run seed locally to verify**

Run: `node scripts/seed-tariff-rates.js`
Expected: "Seeding N IEEPA tariff rates... ✅ Upserted N IEEPA rates" + interest rates

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-tariff-rates.js scripts/seed-all.js
git commit -m "feat: add tariff rate seed script — IEEPA rates + IRS interest rates"
```

---

### Task 4: Public Calculator API — `/api/tariff/calculate`

**Files:**
- Create: `src/lib/tariff-rate-limiter.ts`
- Create: `src/app/api/tariff/calculate/route.ts`
- Create: `src/app/api/tariff/rates/route.ts`
- Create: `src/app/api/tariff/rates/[countryCode]/route.ts`

- [ ] **Step 1: Create IP-based rate limiter**

Create `src/lib/tariff-rate-limiter.ts`:

```typescript
const ipRequests = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

export function checkPublicRateLimit(ip: string): {
  ok: boolean;
  remaining: number;
  retryAfterMs?: number;
} {
  const now = Date.now();
  const entry = ipRequests.get(ip);

  if (!entry || now > entry.resetAt) {
    ipRequests.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: MAX_REQUESTS - 1 };
  }

  entry.count++;
  if (entry.count > MAX_REQUESTS) {
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: entry.resetAt - now,
    };
  }

  return { ok: true, remaining: MAX_REQUESTS - entry.count };
}
```

- [ ] **Step 2: Create calculate route**

Create `src/app/api/tariff/calculate/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  lookupCombinedRate,
  calculateIeepaDuty,
  calculateInterest,
  checkEligibility,
  aggregateDossier,
  type RateRecord,
} from "@/lib/tariff-calculator";
import { checkPublicRateLimit } from "@/lib/tariff-rate-limiter";

export const dynamic = "force-dynamic";

interface EntryInput {
  countryOfOrigin: string;
  entryDate: string;
  enteredValue: number;
  entryNumber?: string | null;
  entryType?: string | null;
  liquidationDate?: string | null;
  liquidationStatus?: string;
  hasAdCvd?: boolean;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateCheck = checkPublicRateLimit(ip);
  if (!rateCheck.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterMs: rateCheck.retryAfterMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)) } }
    );
  }

  let body: { entries: EntryInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.entries || !Array.isArray(body.entries) || body.entries.length === 0) {
    return NextResponse.json({ error: "entries array required" }, { status: 400 });
  }

  if (body.entries.length > 500) {
    return NextResponse.json({ error: "Maximum 500 entries per request" }, { status: 400 });
  }

  const allRates = await prisma.ieepaRate.findMany({
    orderBy: [{ countryCode: "asc" }, { effectiveDate: "desc" }],
  });
  const interestRates = await prisma.interestRate.findMany({
    orderBy: { startDate: "asc" },
  });
  const quarterRates = interestRates.map((ir) => ({
    startDate: ir.startDate,
    endDate: ir.endDate,
    nonCorporateRate: Number(ir.nonCorporateRate),
  }));

  const ieepaTermination = new Date("2026-02-24T00:00:00Z");
  const results = [];

  for (const input of body.entries) {
    const entryDate = new Date(input.entryDate);
    const enteredValue = Number(input.enteredValue);

    if (isNaN(entryDate.getTime()) || isNaN(enteredValue) || enteredValue < 0) {
      results.push({
        ...input,
        error: "Invalid entryDate or enteredValue",
        ieepaRate: 0,
        ieepaDuty: 0,
        estimatedInterest: 0,
        estimatedRefund: 0,
        eligibility: "unknown",
        eligibilityReason: "Invalid input",
      });
      continue;
    }

    const matchingRates = allRates.filter((r) => {
      if (r.countryCode !== input.countryOfOrigin.toUpperCase()) return false;
      if (r.effectiveDate > entryDate) return false;
      if (r.endDate && r.endDate <= entryDate) return false;
      return true;
    }) as RateRecord[];

    const lookup = lookupCombinedRate(matchingRates);
    const ieepaDuty = calculateIeepaDuty(enteredValue, lookup.combinedRate);

    const depositDate = entryDate;
    const liqDate = input.liquidationDate ? new Date(input.liquidationDate) : null;
    const interestEnd = liqDate && liqDate < ieepaTermination ? liqDate : ieepaTermination;
    const interest = calculateInterest(ieepaDuty, depositDate, interestEnd, quarterRates);

    const eligResult = checkEligibility({
      entryDate,
      entryType: input.entryType || null,
      ieepaRate: lookup.combinedRate,
      liquidationStatus: input.liquidationStatus || "unknown",
      liquidationDate: liqDate,
      hasAdCvd: input.hasAdCvd || false,
    });

    results.push({
      countryOfOrigin: input.countryOfOrigin.toUpperCase(),
      entryDate: input.entryDate,
      enteredValue,
      entryNumber: input.entryNumber || null,
      ieepaRate: lookup.combinedRate,
      rateName: lookup.rateName,
      rateBreakdown: lookup.breakdown,
      ieepaDuty,
      estimatedInterest: interest,
      estimatedRefund: ieepaDuty + interest,
      eligibility: eligResult.status,
      eligibilityReason: eligResult.reason,
      deadlineDays: eligResult.deadlineDays ?? null,
      isUrgent: eligResult.isUrgent ?? false,
    });
  }

  const summary = aggregateDossier(
    results.map((r) => ({
      enteredValue: r.enteredValue,
      ieepaDuty: r.ieepaDuty,
      estimatedInterest: r.estimatedInterest,
      eligibility: r.eligibility,
      isUrgent: r.isUrgent || false,
      deadlineDays: r.deadlineDays,
    }))
  );

  return NextResponse.json({
    summary: {
      ...summary,
      totalEstTotal: summary.totalEstRefund + summary.totalEstInterest,
    },
    entries: results,
  });
}
```

- [ ] **Step 3: Create rates list route**

Create `src/app/api/tariff/rates/route.ts`:

```typescript
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const rates = await prisma.ieepaRate.findMany({
    select: {
      countryCode: true,
      countryName: true,
      rateType: true,
      rate: true,
      effectiveDate: true,
      endDate: true,
      executiveOrder: true,
      name: true,
    },
    orderBy: [{ countryName: "asc" }, { effectiveDate: "asc" }],
  });

  const countries = new Map<string, {
    code: string;
    name: string;
    periods: typeof rates;
  }>();

  for (const r of rates) {
    if (!countries.has(r.countryCode)) {
      countries.set(r.countryCode, {
        code: r.countryCode,
        name: r.countryName,
        periods: [],
      });
    }
    countries.get(r.countryCode)!.periods.push(r);
  }

  return NextResponse.json({
    countries: Array.from(countries.values()),
    totalCountries: countries.size,
    totalRates: rates.length,
  });
}
```

- [ ] **Step 4: Create per-country rate timeline route**

Create `src/app/api/tariff/rates/[countryCode]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { countryCode: string } }
) {
  const code = params.countryCode.toUpperCase();

  const rates = await prisma.ieepaRate.findMany({
    where: { countryCode: code },
    orderBy: { effectiveDate: "asc" },
  });

  if (rates.length === 0) {
    return NextResponse.json(
      { error: `No IEEPA rates found for country code: ${code}` },
      { status: 404 }
    );
  }

  return NextResponse.json({
    countryCode: code,
    countryName: rates[0].countryName,
    timeline: rates,
  });
}
```

- [ ] **Step 5: Verify build compiles**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds, new API routes listed

- [ ] **Step 6: Commit**

```bash
git add src/lib/tariff-rate-limiter.ts src/app/api/tariff/
git commit -m "feat: add public tariff calculator API — calculate, rates, rate timeline"
```

---

### Task 5: Public Calculator Page — `/calculator`

**Files:**
- Create: `src/app/calculator/page.tsx`
- Modify: `src/middleware.ts`

- [ ] **Step 1: Add /calculator to middleware public allowlist**

In `src/middleware.ts`, add to the public route check:

```typescript
pathname.startsWith("/calculator") ||
```

- [ ] **Step 2: Create the public calculator page**

Create `src/app/calculator/page.tsx`. This is a `"use client"` page with:
- Hero section with headline "How Much Are Your Clients Owed?"
- Form with country dropdown (populated from `/api/tariff/rates`), entry date range, entered value, number of entries
- Calls `POST /api/tariff/calculate` on submit
- Displays results: big refund number, interest, eligible/urgent counts, deadline warning
- Commission preview at 20% default
- CTA buttons: "Submit This Client" (→ /apply), "Calculate Another"
- Stores results in localStorage for pickup after signup
- Below fold: legal stats section (19 USC §1592 penalties, CAPE rejection rates)

The page should follow the existing Fintella visual design patterns: dark theme, `var(--app-*)` CSS variables, `theme-*` utility classes. Use the mockup from the brainstorm as reference (see `.superpowers/brainstorm/` content files).

Key implementation details:
- Fetch countries from `/api/tariff/rates` on mount for the dropdown
- Format currency with `Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })`
- Animate the results card appearing with a CSS transition
- Deadline warnings use red styling (`text-red-500`) with clock emoji
- Commission preview uses purple styling, shows 20% default with note "rates vary"
- Mobile-responsive: single column on small screens
- UTM tracking: read `utm_source`, `utm_medium`, `utm_campaign` from URL params, store in localStorage

- [ ] **Step 3: Verify the page renders**

Run: `npm run dev`
Visit: `http://localhost:3000/calculator`
Expected: Page loads without auth redirect, form renders, country dropdown populates

- [ ] **Step 4: Test the calculate flow**

Enter: Country=China, Date=2025-06-15, Value=$185,000, Entries=1
Click Calculate.
Expected: Results show ~$55,500 IEEPA refund + ~$2,775 interest = ~$58,275 total

- [ ] **Step 5: Commit**

```bash
git add src/app/calculator/ src/middleware.ts
git commit -m "feat: add public tariff calculator page — zero-signup lead gen funnel"
```

---

### Task 6: Widget Calculator Tab

**Files:**
- Modify: `src/app/widget/page.tsx`
- Create: `src/app/api/widget/calculate/route.ts`

- [ ] **Step 1: Create widget calculate API route**

Create `src/app/api/widget/calculate/route.ts` following the exact auth pattern from `src/app/api/widget/referral/route.ts`:

- OPTIONS handler for CORS preflight
- POST handler: extract Bearer token → `verifyWidgetJwt()` → find WidgetSession → `checkWidgetRateLimit()` → process
- Accept body: `{ countryOfOrigin, entryDate, enteredValue }`
- Call the same calculator logic as the public route but return a compact response
- Include CORS headers from `getCorsHeaders()`

- [ ] **Step 2: Add Calculator tab to widget page**

In `src/app/widget/page.tsx`, add a 4th tab "Calculator" (between Dashboard and the existing Refer tab). The tab contains:
- Compact country dropdown
- Entry date input
- Entered value input
- Calculate button
- Result card showing refund + interest in large text
- "Submit as Referral" button that switches to the Refer tab with data pre-filled

Keep the widget compact — it renders inside an iframe in CargoWise/Magaya.

- [ ] **Step 3: Verify widget renders with new tab**

Run dev server, visit: `http://localhost:3000/widget?apiKey=test`
Expected: 4-tab widget renders with Dashboard, Calculator, Refer, Info tabs

- [ ] **Step 4: Commit**

```bash
git add src/app/api/widget/calculate/ src/app/widget/page.tsx
git commit -m "feat: add calculator tab to TMS widget — 4th tab with instant refund estimate"
```

---

### Task 7: Partner Portal Calculator — `/dashboard/calculator`

**Files:**
- Create: `src/app/(partner)/dashboard/calculator/page.tsx`

- [ ] **Step 1: Create the partner calculator page**

Create `src/app/(partner)/dashboard/calculator/page.tsx` as a `"use client"` page with 4 tabs:

**Tab 1: Quick Estimate**
- Multi-entry form: rows of [Entry # (optional)] [Country ▼] [Entry Date] [Entered Value] [IEEPA Rate (auto-filled)]
- "Add Row" button, "Paste from Clipboard" button
- Rate auto-lookup: when country + date are filled, call `/api/tariff/rates/[countryCode]` and display the applicable rate
- Summary cards at bottom: Est. Refund | Est. Interest | Your Commission | Nearest Deadline
- Action buttons: Save as Draft | Submit as Referral | Export PDF Report | Generate CAPE CSV

**Tab 2: Bulk Upload (CSV)**
- Drag-and-drop zone (or file input)
- Accept CSV, TSV, XLSX
- Smart column detection: map "Entry Summary Number" → entryNumber, "Goods Value" → enteredValue, etc.
- ES-003 auto-detection: if column headers match CBP format, auto-map everything
- "Try with Demo Data" button loads 47 sample entries
- Preview table with validation highlights
- "Calculate All" button → process through calculator
- Auto-group by importer if importer column present
- Results table with sort/filter

**Tab 3: Document Intake (AI)** — disabled with "Coming Soon" badge

**Tab 4: My Dossiers**
- Fetch from `GET /api/partner/dossiers`
- Table: Client | Entries | Est. Refund | Status | Urgent | Created | Actions
- Status badges with colors per spec
- Click row → expand/navigate to detail

Use the existing partner portal layout (sidebar, header from the `(partner)` route group).

- [ ] **Step 2: Verify page renders**

Run dev server, log in as a partner, visit: `http://localhost:3000/dashboard/calculator`
Expected: 4-tab calculator page renders within partner portal layout

- [ ] **Step 3: Commit**

```bash
git add src/app/\(partner\)/dashboard/calculator/
git commit -m "feat: add partner portal tariff calculator — Quick Estimate, Bulk Upload, Dossiers"
```

---

### Task 8: Partner Dossier API Routes

**Files:**
- Create: `src/app/api/partner/dossiers/route.ts`
- Create: `src/app/api/partner/dossiers/[id]/route.ts`
- Create: `src/app/api/partner/dossiers/[id]/entries/route.ts`
- Create: `src/app/api/partner/dossiers/[id]/submit/route.ts`
- Create: `src/app/api/partner/dossiers/[id]/cape-csv/route.ts`
- Create: `src/app/api/partner/dossiers/csv-upload/route.ts`

All routes follow the existing partner auth pattern:

```typescript
import { auth } from "@/lib/auth";
const session = await auth();
if (!session?.user?.partnerCode) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

- [ ] **Step 1: Create dossier list + create routes**

`src/app/api/partner/dossiers/route.ts`:
- GET: list dossiers for the authenticated partner (filter by partnerId from session, include entry count)
- POST: create new dossier with `clientCompany`, `source`, optionally `clientContact`, `clientEmail`

- [ ] **Step 2: Create single dossier routes**

`src/app/api/partner/dossiers/[id]/route.ts`:
- GET: return dossier with all entries, verify partner owns it
- PUT: update dossier fields (clientCompany, status, etc.), re-aggregate summary

- [ ] **Step 3: Create entries route**

`src/app/api/partner/dossiers/[id]/entries/route.ts`:
- POST: accept array of entries `{ countryOfOrigin, entryDate, enteredValue, entryNumber?, ... }`
- For each entry: look up IEEPA rate, calculate duty + interest, check eligibility
- Create TariffEntry rows, re-aggregate dossier summary
- Return updated dossier with all entries

- [ ] **Step 4: Create submit (dossier → Deal) route**

`src/app/api/partner/dossiers/[id]/submit/route.ts`:
- POST: converts dossier to a Deal referral
- Creates a Deal with `dealName: dossier.clientCompany`, `partnerCode`, `stage: "lead_submitted"`, `estimatedRefundAmount: dossier.totalEstRefund`
- Links dossier to deal via `dealId`
- Sets dossier status to `submitted`
- Fire-and-forget: send notification email to admin

- [ ] **Step 5: Create CAPE CSV generation route**

`src/app/api/partner/dossiers/[id]/cape-csv/route.ts`:
- POST: generates CAPE-ready CSV from eligible entries
- Uses `generateCapeCsv()` from tariff-calculator
- Returns CSV as download: `Content-Type: text/csv`, `Content-Disposition: attachment; filename="cape-declaration-{id}.csv"`

- [ ] **Step 6: Create CSV bulk upload route**

`src/app/api/partner/dossiers/csv-upload/route.ts`:
- POST: accepts multipart form data with CSV/TSV file
- Parse CSV, detect columns (smart mapping for ES-003, CargoWise, generic formats)
- Create dossier + entries in one transaction
- Return dossier with calculated entries

- [ ] **Step 7: Verify build compiles**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds, all new API routes listed

- [ ] **Step 8: Commit**

```bash
git add src/app/api/partner/dossiers/
git commit -m "feat: add partner dossier API — CRUD, entries, submit, CAPE CSV, bulk upload"
```

---

### Task 9: Admin Console — `/admin/tariff-engine`

**Files:**
- Create: `src/app/(admin)/admin/tariff-engine/page.tsx`

- [ ] **Step 1: Create the admin tariff engine page**

Create `src/app/(admin)/admin/tariff-engine/page.tsx` as a `"use client"` page with tabs:

**Tab 1: Dossier Pipeline**
- Kanban columns: Draft → Analyzing → Ready → Submitted → Converted
- Cards show: client name, entry count, est. refund, partner name, urgent count badge
- Drag to change status (or dropdown)
- Fetch from `GET /api/admin/tariff/dossiers`

**Tab 2: Rate Database**
- Table of all IeepaRate rows: Country | Rate Type | Rate | Effective | End | EO | Ch.99
- Seeded rows show lock icon (non-editable)
- "Add Rate" button for admin corrections
- Fetch from `GET /api/admin/tariff/rates`

**Tab 3: Deadline Alerts**
- Entries approaching 80-day cliff, sorted by urgency
- Red: ≤7 days, Yellow: 8-14 days, Green: 15-30 days
- Shows partner name, client, entry count, days remaining
- Fetch from `GET /api/admin/tariff/deadlines`

Follow existing admin page patterns: `"use client"`, fetch data on mount, use ResizableTable for tables.

- [ ] **Step 2: Verify page renders**

Run dev server, log in as admin, visit: `http://localhost:3000/admin/tariff-engine`
Expected: Page renders within admin layout with 3 tabs

- [ ] **Step 3: Commit**

```bash
git add src/app/\(admin\)/admin/tariff-engine/
git commit -m "feat: add admin tariff engine console — dossier pipeline, rate DB, deadline alerts"
```

---

### Task 10: Admin API Routes

**Files:**
- Create: `src/app/api/admin/tariff/dossiers/route.ts`
- Create: `src/app/api/admin/tariff/dossiers/[id]/route.ts`
- Create: `src/app/api/admin/tariff/rates/route.ts`
- Create: `src/app/api/admin/tariff/deadlines/route.ts`

All routes use admin auth:

```typescript
import { auth } from "@/lib/auth";
const session = await auth();
const role = (session?.user as any)?.role;
if (!["super_admin", "admin"].includes(role)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

- [ ] **Step 1: Create admin dossier list route**

`src/app/api/admin/tariff/dossiers/route.ts`:
- GET: list all dossiers with partner info, filterable by status
- Include partner name, entry count, urgent count, total refund

- [ ] **Step 2: Create admin dossier update route**

`src/app/api/admin/tariff/dossiers/[id]/route.ts`:
- PUT: update dossier status (e.g., move through pipeline)
- Only admin can set status to `converted`

- [ ] **Step 3: Create admin rate CRUD route**

`src/app/api/admin/tariff/rates/route.ts`:
- GET: list all rates with filter by country/rateType
- POST: add new rate (admin corrections, `isSeeded: false`)
- Prevent editing seeded rates (only admin-added rates are editable)

- [ ] **Step 4: Create deadline alerts route**

`src/app/api/admin/tariff/deadlines/route.ts`:
- GET: find all TariffEntry rows where `isUrgent = true` or `deadlineDays <= 30`
- Include dossier info, partner info
- Sort by deadlineDays ascending (most urgent first)

- [ ] **Step 5: Verify build compiles**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/tariff/
git commit -m "feat: add admin tariff API — dossier management, rate CRUD, deadline alerts"
```

---

### Task 11: Go-to-Market Integration

**Files:**
- Modify: `src/app/api/widget/referral/route.ts`

- [ ] **Step 1: Accept calculatorData on widget referral submission**

In `src/app/api/widget/referral/route.ts`, extend the POST body to accept an optional `calculatorData` field:

```typescript
const {
  clientCompanyName,
  clientContactName,
  clientEmail,
  clientPhone,
  estimatedImportValue,
  // ... existing fields
  calculatorData, // NEW: { countryOfOrigin, entryDate, enteredValue, ieepaRate, estimatedRefund }
} = body;
```

If `calculatorData` is present, store it in the `notes` field or a new JSON column on `WidgetReferral` so the admin can see the refund estimate alongside the referral.

- [ ] **Step 2: Verify full build**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds with all new pages and API routes, 97+ pages

- [ ] **Step 3: Commit**

```bash
git add src/app/api/widget/referral/route.ts
git commit -m "feat: accept calculator data on widget referral submissions"
```

---

### Task 12: Final Verification & Cleanup

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds. New page count should be ~100+ (97 existing + calculator + dashboard/calculator + admin/tariff-engine + API routes)

- [ ] **Step 2: Run seed script to verify rate data**

Run: `node scripts/seed-tariff-rates.js`
Expected: Rates and interest rates seeded/upserted without errors

- [ ] **Step 3: Verify Prisma Studio shows new tables**

Run: `npx prisma studio`
Expected: IeepaRate, InterestRate, TariffDossier, TariffEntry, TariffEntryLine, DossierDocument tables visible with seeded data

- [ ] **Step 4: Manual smoke test**

1. Visit `/calculator` (no login) → form loads, countries populate
2. Calculate with China, $185K, June 2025 → shows ~$55K refund
3. Log in as partner → `/dashboard/calculator` loads with 4 tabs
4. Quick Estimate tab → add entry, see rate auto-lookup
5. Log in as admin → `/admin/tariff-engine` loads with 3 tabs
6. Rate Database tab → shows seeded rates

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: tariff intelligence engine Phase 1 — final cleanup and verification"
```
