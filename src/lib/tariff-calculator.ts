// ---------------------------------------------------------------------------
// Tariff Intelligence Engine — Pure calculation functions
//
// Stateless utilities consumed by API routes and UI components.
// No database calls, no side-effects, no framework imports.
// ---------------------------------------------------------------------------

import { Decimal } from "@prisma/client/runtime/library";
import { IEEPA_START_DATE, IEEPA_END_DATE } from "./tariff-countries";

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface RateRecord {
  id: string;
  rateType: string;       // "fentanyl" | "reciprocal" | "section122"
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

export interface EligibilityResult {
  status: string;         // "eligible" | "excluded_expired" | "excluded_adcvd" | "excluded_type" | "excluded_date"
  reason: string;
  deadlineDays?: number;
  isUrgent?: boolean;
  deadlineDate?: Date;
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

export interface QuarterlyRate {
  startDate: Date;
  endDate: Date;
  rate: number;           // annual rate as decimal, e.g. 0.04 = 4%
}

export interface EntryForEligibility {
  entryDate: Date;
  entryType: string;      // CBP entry type code
  liquidationDate?: Date | null;
  isAdCvd?: boolean;
}

export interface EntryForCape {
  entryNumber: string;
  status: string;         // eligibility status
  liquidationDate?: Date | null;
}

export interface EntryForDossier {
  enteredValue: number;
  estimatedRefund: number;
  estimatedInterest: number;
  eligibility: EligibilityResult;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toNumber(v: Decimal | number): number {
  if (typeof v === "number") return v;
  return v.toNumber();
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86_400_000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

// ── 1. lookupCombinedRate ───────────────────────────────────────────────────

/**
 * Takes matching rate records (already filtered by country + date), sums
 * fentanyl + reciprocal rates, returns combined rate with breakdown.
 */
export function lookupCombinedRate(rates: RateRecord[]): RateLookupResult {
  const breakdown: { fentanyl?: number; reciprocal?: number; section122?: number } = {};
  let combinedRate = 0;
  const names: string[] = [];

  for (const r of rates) {
    const val = toNumber(r.rate);
    const type = r.rateType.toLowerCase();

    if (type === "fentanyl") {
      breakdown.fentanyl = (breakdown.fentanyl ?? 0) + val;
    } else if (type === "reciprocal") {
      breakdown.reciprocal = (breakdown.reciprocal ?? 0) + val;
    } else if (type === "section122") {
      breakdown.section122 = (breakdown.section122 ?? 0) + val;
    }

    combinedRate += val;
    names.push(r.name);
  }

  return {
    combinedRate,
    rates,
    rateName: names.join(" + "),
    breakdown,
  };
}

// ── 2. calculateIeepaDuty ───────────────────────────────────────────────────

/**
 * IEEPA duty = entered value * rate, rounded to nearest cent.
 */
export function calculateIeepaDuty(enteredValue: number, rate: number): number {
  return Math.round(enteredValue * rate * 100) / 100;
}

// ── 3. calculateInterest ────────────────────────────────────────────────────

/**
 * Per 19 USC 1505, compound daily interest across quarterly rate periods.
 *
 * For each quarter the entry spans:
 *   interestQ = (((1 + quarterRate / daysInYear)^daysInQ) - 1) * ieepaDuty
 *
 * The total interest is the sum across all quarters.
 *
 * @param ieepaDuty    - the duty amount being refunded
 * @param depositDate  - date the duty was deposited (entry summary date)
 * @param endDate      - calculation end date (typically liquidation or today)
 * @param quarterRates - quarterly IRS underpayment rates covering the span
 */
export function calculateInterest(
  ieepaDuty: number,
  depositDate: Date,
  endDate: Date,
  quarterRates: QuarterlyRate[],
): number {
  if (ieepaDuty <= 0 || depositDate >= endDate || quarterRates.length === 0) {
    return 0;
  }

  let totalInterest = 0;

  for (const qr of quarterRates) {
    // Clamp the quarter window to [depositDate, endDate]
    const qStart = qr.startDate > depositDate ? qr.startDate : depositDate;
    const qEnd = qr.endDate < endDate ? qr.endDate : endDate;

    if (qStart >= qEnd) continue;

    const days = daysBetween(qStart, qEnd);
    if (days <= 0) continue;

    const yearDays = daysInYear(qStart.getFullYear());
    const dailyFactor = 1 + qr.rate / yearDays;

    // Compound: ((1+r/n)^d - 1) * principal
    const interestQ = (Math.pow(dailyFactor, days) - 1) * ieepaDuty;
    totalInterest += interestQ;
  }

  return Math.round(totalInterest * 100) / 100;
}

// ── 4. checkEligibility ─────────────────────────────────────────────────────

/** CBP entry types excluded from CAPE Phase 1 */
const EXCLUDED_ENTRY_TYPES = new Set(["08", "09", "23", "47"]);

/** Days from liquidation within which a CAPE Phase 1 claim can be filed */
const CAPE_PHASE1_WINDOW_DAYS = 80;

/** Days from liquidation within which a protest can be filed (19 USC 1514) */
const PROTEST_DEADLINE_DAYS = 180;

/** Entries with <= this many days remaining are flagged urgent */
const URGENT_THRESHOLD_DAYS = 14;

/**
 * Checks CAPE Phase 1 eligibility for a single entry.
 */
export function checkEligibility(entry: EntryForEligibility): EligibilityResult {
  // 1. Date range check
  if (entry.entryDate < IEEPA_START_DATE || entry.entryDate > IEEPA_END_DATE) {
    return {
      status: "excluded_date",
      reason: "Entry date outside IEEPA period (Feb 1, 2025 – Feb 23, 2026)",
    };
  }

  // 2. Entry type exclusion
  if (EXCLUDED_ENTRY_TYPES.has(entry.entryType)) {
    return {
      status: "excluded_type",
      reason: `Entry type ${entry.entryType} excluded from CAPE Phase 1`,
    };
  }

  // 3. AD/CVD check (unliquidated AD/CVD entries are excluded)
  if (entry.isAdCvd && !entry.liquidationDate) {
    return {
      status: "excluded_adcvd",
      reason: "Unliquidated AD/CVD entry excluded from Phase 1",
    };
  }

  // 4. Liquidation window checks (three tiers)
  if (entry.liquidationDate) {
    const capeDeadlineDate = new Date(entry.liquidationDate);
    capeDeadlineDate.setDate(capeDeadlineDate.getDate() + CAPE_PHASE1_WINDOW_DAYS);

    const protestDeadlineDate = new Date(entry.liquidationDate);
    protestDeadlineDate.setDate(protestDeadlineDate.getDate() + PROTEST_DEADLINE_DAYS);

    const now = new Date();
    const capeDaysRemaining = daysBetween(now, capeDeadlineDate);
    const protestDaysRemaining = daysBetween(now, protestDeadlineDate);

    if (capeDaysRemaining >= 0) {
      // Within 80 days of liquidation — CAPE Phase 1 eligible
      return {
        status: "eligible",
        reason: entry.isAdCvd
          ? "Liquidated AD/CVD entry — eligible with deadline"
          : "Liquidated entry — eligible with deadline",
        deadlineDays: capeDaysRemaining,
        isUrgent: capeDaysRemaining <= URGENT_THRESHOLD_DAYS,
        deadlineDate: capeDeadlineDate,
      };
    }

    if (protestDaysRemaining >= 0) {
      // Beyond CAPE Phase 1 window (>80 days) but protest still available (<180 days)
      // Euro-Notions order (Apr 7, 2026) covers these entries; path is protest under 19 USC 1514
      return {
        status: "excluded_cape_protest_eligible",
        reason: "Not eligible for CAPE Phase 1 (liquidated >80 days ago). Protest available under 19 USC 1514.",
        deadlineDays: protestDaysRemaining,
        isUrgent: protestDaysRemaining <= URGENT_THRESHOLD_DAYS,
        deadlineDate: protestDeadlineDate,
      };
    }

    // Beyond both CAPE Phase 1 and protest windows (>180 days)
    // Euro-Notions court order still directs CBP to reliquidate these entries,
    // but refund requires litigation track — CBP has not yet operationalized this path.
    return {
      status: "excluded_expired",
      reason: "CAPE Phase 1 and protest windows expired. Refund may still be available via Euro-Notions court order (CIT No. 25-00595) litigation track.",
      deadlineDays: protestDaysRemaining,
      deadlineDate: protestDeadlineDate,
    };
  }

  // 5. Unliquidated, non-AD/CVD, in date range → eligible
  return {
    status: "eligible",
    reason: "Unliquidated entry — eligible, no immediate deadline",
  };
}

// ── 5. validateEntryNumber ──────────────────────────────────────────────────

/**
 * CBP mod-10 check digit validation for 11-character entry numbers.
 *
 * Format: 3-char filer code + 7-digit entry number + 1 check digit
 * Weights alternate 1, 3 across first 10 characters.
 * Alpha mapping: A=2, B=3, ..., Z=27.
 * Check digit = (10 - (sum % 10)) % 10.
 */
export function validateEntryNumber(entryNumber: string): boolean {
  // Strip hyphens
  const clean = entryNumber.replace(/-/g, "");

  if (clean.length !== 11) return false;

  const weights = [1, 3, 1, 3, 1, 3, 1, 3, 1, 3];
  let sum = 0;

  for (let i = 0; i < 10; i++) {
    const ch = clean[i].toUpperCase();
    let value: number;

    if (ch >= "A" && ch <= "Z") {
      // A=2, B=3, ..., Z=27
      value = ch.charCodeAt(0) - "A".charCodeAt(0) + 2;
    } else if (ch >= "0" && ch <= "9") {
      value = parseInt(ch, 10);
    } else {
      return false; // invalid character
    }

    sum += value * weights[i];
  }

  const expectedCheckDigit = (10 - (sum % 10)) % 10;
  const actualCheckDigit = parseInt(clean[10], 10);

  if (isNaN(actualCheckDigit)) return false;

  return expectedCheckDigit === actualCheckDigit;
}

// ── 6. generateCapeCsv ──────────────────────────────────────────────────────

/** Maximum entries per CAPE CSV file */
const CAPE_BATCH_SIZE = 9_999;

/**
 * Generates CAPE-ready CSV strings, batched at 9,999 entries.
 * Only includes eligible + liquidated entries.
 * Returns array of CSV strings (one per batch).
 */
export function generateCapeCsv(entries: EntryForCape[]): string[] {
  // Filter: only eligible entries with a liquidation date
  const eligible = entries.filter(
    (e) => e.status === "eligible" && e.liquidationDate != null,
  );

  if (eligible.length === 0) return [];

  const batches: string[] = [];

  for (let i = 0; i < eligible.length; i += CAPE_BATCH_SIZE) {
    const batch = eligible.slice(i, i + CAPE_BATCH_SIZE);
    const lines = ["Entry Number", ...batch.map((e) => e.entryNumber)];
    batches.push(lines.join("\n"));
  }

  return batches;
}

// ── 7. aggregateDossier ─────────────────────────────────────────────────────

/**
 * Aggregates entry-level data into dossier summary statistics.
 */
export function aggregateDossier(entries: EntryForDossier[]): DossierSummary {
  let eligibleCount = 0;
  let excludedCount = 0;
  let urgentCount = 0;
  let totalEnteredValue = 0;
  let totalEstRefund = 0;
  let totalEstInterest = 0;
  let nearestDeadline: Date | null = null;

  for (const entry of entries) {
    totalEnteredValue += entry.enteredValue;
    totalEstRefund += entry.estimatedRefund;
    totalEstInterest += entry.estimatedInterest;

    if (entry.eligibility.status === "eligible") {
      eligibleCount++;

      if (entry.eligibility.isUrgent) {
        urgentCount++;
      }

      if (entry.eligibility.deadlineDate) {
        if (!nearestDeadline || entry.eligibility.deadlineDate < nearestDeadline) {
          nearestDeadline = entry.eligibility.deadlineDate;
        }
      }
    } else {
      excludedCount++;
    }
  }

  let deadlineDays: number | null = null;
  if (nearestDeadline) {
    deadlineDays = daysBetween(new Date(), nearestDeadline);
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
    deadlineDays,
  };
}

// ── Routing Buckets ──────────────────────────────────────────────────────────

export type RoutingBucket = "self_file" | "legal_required" | "not_applicable";

export function getRoutingBucket(eligibilityStatus: string): RoutingBucket {
  if (eligibilityStatus === "eligible") return "self_file";
  if (eligibilityStatus === "excluded_date" || eligibilityStatus === "unknown") return "not_applicable";
  // excluded_cape_protest_eligible, excluded_expired, excluded_type, excluded_adcvd → legal counsel
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
