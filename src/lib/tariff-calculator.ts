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

/**
 * How an eligible entry should be filed with CBP:
 *  - cape_phase1: unliquidated OR liquidated within the 80-day window → automated CAPE refund (Phase 1, live Apr 20, 2026)
 *  - cape_phase2: reconciliation-flagged entry (types 01/02/06) where Type 09 not yet filed → CAPE Phase 2 (live Jun 29, 2026)
 *                 CRITICAL: submit the CAPE declaration BEFORE filing the reconciliation entry (Type 09) or the path closes permanently.
 *  - cape_phase3: finally-liquidated entry (>80 days) per CIT reliquidation order (Jul 17, 2026) → CAPE Phase 3 (DELAYED as of Aug 25, 2026)
 *  - protest:     liquidated 80–180 days ago → formal protest (19 U.S.C. §1514) — also file as protective measure while Phase 3 is delayed
 *  - litigation:  liquidated > 180 days ago → protest window closed; CIT litigation or CAPE Phase 3 (when live)
 *  - none:        not eligible for any refund path
 */
export type FilingMethod = "cape_phase1" | "cape_phase2" | "cape_phase3" | "protest" | "litigation" | "none";

export interface EligibilityResult {
  status: string;         // "eligible" | "excluded_expired" | "excluded_adcvd" | "excluded_type" | "excluded_date" | "excluded_drawback" | "excluded_usmca" | "excluded_recon_filed"
  reason: string;
  deadlineDays?: number;
  isUrgent?: boolean;
  deadlineDate?: Date;
  filingMethod?: FilingMethod;
  needsReview?: boolean;  // human-review flag (e.g. mixed Section 232/301 goods)
  reviewNote?: string;
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
  countryOfOrigin?: string; // ISO 2-letter — needed for the USMCA exemption check
  isUsmca?: boolean;        // goods claimed USMCA-preferential (CA/MX exemption from IEEPA fentanyl tariffs)
  isDrawback?: boolean;     // entry is on drawback — CAPE rejects ("ENTRY ON DRAWBACK")
  hasSection232?: boolean;  // entry contains Section 232 goods (exempt from IEEPA per Annex II)
  hasSection301?: boolean;  // entry contains Section 301 duties (not refundable; only IEEPA portion is)
  // Phase 2 (live Jun 29, 2026): reconciliation-flagged entries
  isReconFlagged?: boolean;  // entry is flagged for reconciliation (waiting for a Type 09) — eligible via Phase 2 if Type 09 not yet filed
  hasReconFiled?: boolean;   // the Type 09 reconciliation entry has already been filed — LOCKS OUT of CAPE Phase 2 permanently
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

/**
 * CBP entry types excluded from CAPE (Phase 1 and Phase 2, as of 2026-09-07):
 *  - 08 (duty deferral), 23 (TIB), 47 (drawback) — excluded from all phases
 *  - 09 (reconciliation summary) — the Type 09 ITSELF is not directly filed through CAPE;
 *    however, the underlying entries (types 01/02/06) flagged for reconciliation ARE now
 *    eligible via Phase 2 (live Jun 29, 2026) PROVIDED the Type 09 has not yet been filed.
 *    See `isReconFlagged` / `hasReconFiled` on EntryForEligibility.
 * Phase 3 (finally-liquidated entries) is expected to expand eligibility further but is
 * currently DELAYED pending CBP validation work (delayed Aug 25, 2026; no new launch date).
 */
const EXCLUDED_ENTRY_TYPES = new Set(["08", "09", "23", "47"]);

/**
 * Legal protest deadline: a protest must be filed within 180 days of
 * liquidation under 19 U.S.C. §1514. After this, the only path is CIT
 * litigation. (NOT to be confused with the 80-day CAPE Phase-1 window.)
 */
const PROTEST_WINDOW_DAYS = 180;

/**
 * CAPE Phase-1 scope: CBP automatically processes unliquidated entries and
 * entries liquidated within the last 80 days. Entries liquidated 80–180 days
 * ago are still recoverable, but require a formal protest rather than the
 * automated CAPE channel.
 */
const CAPE_PHASE1_LIQUIDATION_WINDOW_DAYS = 80;

/** Entries with <= this many days remaining are flagged urgent */
const URGENT_THRESHOLD_DAYS = 14;

/** USMCA-compliant CA/MX goods are exempt from IEEPA fentanyl tariffs from this date. */
const USMCA_EXEMPTION_DATE = new Date("2025-03-07T00:00:00Z");
const USMCA_COUNTRIES = new Set(["CA", "MX"]);

/**
 * Applies a human-review flag to an otherwise-eligible result when the entry
 * carries Section 232 or Section 301 duties. These do not disqualify the IEEPA
 * refund, but they affect the recoverable amount and warrant verification.
 */
function applySectionReviewFlag(
  result: EligibilityResult,
  entry: EntryForEligibility,
): EligibilityResult {
  const notes: string[] = [];
  if (entry.hasSection232) {
    notes.push(
      "Section 232 goods were exempt from IEEPA (Annex II) — verify IEEPA duty was actually paid before claiming.",
    );
  }
  if (entry.hasSection301) {
    notes.push(
      "Section 301 duties are not refundable — only the IEEPA portion of duties paid is recoverable.",
    );
  }
  if (notes.length === 0) return result;
  return { ...result, needsReview: true, reviewNote: notes.join(" ") };
}

/**
 * Determines refund eligibility and the correct filing path for a single entry.
 * Distinguishes the CAPE Phase-1 (80-day) automated window from the 180-day
 * statutory protest deadline (19 U.S.C. §1514).
 */
export function checkEligibility(entry: EntryForEligibility): EligibilityResult {
  // 1. Date range check
  if (entry.entryDate < IEEPA_START_DATE || entry.entryDate > IEEPA_END_DATE) {
    return {
      status: "excluded_date",
      reason: "Entry date outside IEEPA period (Feb 1, 2025 – Feb 23, 2026)",
      filingMethod: "none",
    };
  }

  // 2. Drawback exclusion — CAPE rejects entries on drawback ("ENTRY ON DRAWBACK")
  if (entry.isDrawback) {
    return {
      status: "excluded_drawback",
      reason: "Entry is on drawback — not refundable via CAPE (duties already recovered)",
      filingMethod: "none",
    };
  }

  // 2b. Reconciliation lock-out (Phase 2) — if the Type 09 reconciliation entry has already
  //     been filed, the underlying entry is permanently locked out of the CAPE Phase 2 path.
  //     Filing the Type 09 first was the single most common Phase 2 rejection. The refund (if any)
  //     must now flow through the reconciliation entry, which is complex and may require counsel.
  if (entry.isReconFlagged && entry.hasReconFiled) {
    return {
      status: "excluded_recon_filed",
      reason: "Reconciliation entry (Type 09) has already been filed — CAPE Phase 2 path is permanently closed for these entries. Consult counsel; refund may flow through the reconciliation entry.",
      filingMethod: "none",
    };
  }

  // 3. USMCA exemption — USMCA-compliant CA/MX goods paid no IEEPA fentanyl duty (eff. Mar 7, 2025)
  if (
    entry.isUsmca &&
    entry.countryOfOrigin &&
    USMCA_COUNTRIES.has(entry.countryOfOrigin.toUpperCase()) &&
    entry.entryDate >= USMCA_EXEMPTION_DATE
  ) {
    return {
      status: "excluded_usmca",
      reason: "USMCA-compliant goods exempt from IEEPA fentanyl tariffs (eff. Mar 7, 2025) — no IEEPA duty paid",
      filingMethod: "none",
    };
  }

  // 4. Entry type exclusion (types 08/23/47 excluded from all CAPE phases; type 09 itself not directly CAPE-filed)
  if (EXCLUDED_ENTRY_TYPES.has(entry.entryType)) {
    return {
      status: "excluded_type",
      reason: `Entry type ${entry.entryType} excluded from all CAPE phases`,
      filingMethod: "none",
    };
  }

  // 5. AD/CVD check (unliquidated AD/CVD entries are excluded from Phase 1)
  if (entry.isAdCvd && !entry.liquidationDate) {
    return {
      status: "excluded_adcvd",
      reason: "Unliquidated AD/CVD entry excluded from Phase 1",
      filingMethod: "none",
    };
  }

  // 6. Liquidation → protest-deadline + filing-method determination
  if (entry.liquidationDate) {
    const now = new Date();
    const deadlineDate = new Date(entry.liquidationDate);
    deadlineDate.setDate(deadlineDate.getDate() + PROTEST_WINDOW_DAYS);
    const daysRemaining = daysBetween(now, deadlineDate);
    const daysSinceLiquidation = daysBetween(new Date(entry.liquidationDate), now);

    // Past the 180-day protest deadline → litigation only
    if (daysRemaining < 0) {
      return {
        status: "excluded_expired",
        reason: "Protest window expired (liquidated > 180 days ago) — CIT litigation only",
        deadlineDays: daysRemaining,
        deadlineDate,
        filingMethod: "litigation",
      };
    }

    if (daysSinceLiquidation <= CAPE_PHASE1_LIQUIDATION_WINDOW_DAYS) {
      // Within 80 days: CAPE Phase 1 (standard) or Phase 2 (reconciliation-flagged, live Jun 29, 2026)
      const filingMethod: FilingMethod = entry.isReconFlagged ? "cape_phase2" : "cape_phase1";
      const base: EligibilityResult = {
        status: "eligible",
        reason:
          filingMethod === "cape_phase2"
            ? "Reconciliation-flagged entry within 80 days — eligible via CAPE Phase 2. Submit CAPE declaration BEFORE filing the reconciliation entry (Type 09)."
            : "Liquidated within 80 days — eligible via CAPE Phase 1",
        deadlineDays: daysRemaining,
        isUrgent: daysRemaining <= URGENT_THRESHOLD_DAYS,
        deadlineDate,
        filingMethod,
      };
      if (entry.isReconFlagged) {
        // Attach the critical ordering warning — filing Type 09 first permanently forfeits Phase 2.
        // Compose with any Section 232/301 flags from applySectionReviewFlag.
        const withFlags = applySectionReviewFlag(base, entry);
        return {
          ...withFlags,
          needsReview: true,
          reviewNote: [
            "CRITICAL FILING SEQUENCE (CAPE Phase 2): Submit the CAPE declaration FIRST. Filing the reconciliation entry (Type 09) before the CAPE declaration permanently locks these entries out of the Phase 2 refund path.",
            ...(withFlags.reviewNote ? [withFlags.reviewNote] : []),
          ].join(" "),
        };
      }
      return applySectionReviewFlag(base, entry);
    }

    // 80–180 days since liquidation: CAPE Phase 3 is planned (but DELAYED as of Aug 25, 2026);
    // a formal protest (19 U.S.C. §1514) remains the reliable path and should be filed as a
    // protective measure before the deadline while Phase 3 availability is uncertain.
    const base: EligibilityResult = {
      status: "eligible",
      reason: "Liquidated 80–180 days ago — eligible via formal protest (19 U.S.C. §1514). CAPE Phase 3 (finally-liquidated entries) is planned but currently delayed; file a protest now as a protective measure.",
      deadlineDays: daysRemaining,
      isUrgent: daysRemaining <= URGENT_THRESHOLD_DAYS,
      deadlineDate,
      filingMethod: "protest",
      needsReview: true,
      reviewNote: "CAPE Phase 3 (finally-liquidated entries) is delayed pending CBP validation work as of Aug 25, 2026. File a formal protest before the 180-day deadline to preserve all refund options. When Phase 3 launches, a CAPE declaration may also be filed.",
    };
    return applySectionReviewFlag(base, entry);
  }

  // 7. Unliquidated, non-AD/CVD, in date range → eligible via CAPE Phase 1 (or Phase 2 for recon-flagged)
  const filingMethod: FilingMethod = entry.isReconFlagged ? "cape_phase2" : "cape_phase1";
  const unliqBase: EligibilityResult = {
    status: "eligible",
    reason: entry.isReconFlagged
      ? "Unliquidated reconciliation-flagged entry — eligible via CAPE Phase 2. Submit CAPE declaration BEFORE filing the reconciliation entry (Type 09)."
      : "Unliquidated entry — eligible via CAPE Phase 1, no immediate deadline",
    filingMethod,
  };
  if (entry.isReconFlagged) {
    const withFlags = applySectionReviewFlag(unliqBase, entry);
    return {
      ...withFlags,
      needsReview: true,
      reviewNote: [
        "CRITICAL FILING SEQUENCE (CAPE Phase 2): Submit the CAPE declaration FIRST. Filing the reconciliation entry (Type 09) before the CAPE declaration permanently locks these entries out of the Phase 2 refund path.",
        ...(withFlags.reviewNote ? [withFlags.reviewNote] : []),
      ].join(" "),
    };
  }
  return applySectionReviewFlag(unliqBase, entry);
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

// ── Deal Tiering (small-deal targeting) ──────────────────────────────────────

/** Upper bound (exclusive) of total IEEPA duties for a Tier-1 ("small") deal. */
export const TIER1_MAX_DUTIES = 1_000_000;

export type DealTier = "tier1" | "standard";

/**
 * Classifies a deal by total IEEPA duties paid. Tier-1 = under $1M total duties —
 * the underserved small-deal segment Fintella targets. `standard` = $1M+.
 */
export function classifyDealTier(totalIeepaDuties: number): DealTier {
  return totalIeepaDuties < TIER1_MAX_DUTIES ? "tier1" : "standard";
}

export type RoutingBucket = "self_file" | "legal_required" | "not_applicable";

export function getRoutingBucket(eligibilityStatus: string): RoutingBucket {
  if (eligibilityStatus === "eligible") return "self_file";
  // Entries that paid no refundable IEEPA duty (or none was due) → nothing to file
  if (
    eligibilityStatus === "excluded_date" ||
    eligibilityStatus === "excluded_drawback" ||
    eligibilityStatus === "excluded_usmca" ||
    eligibilityStatus === "unknown"
  ) {
    return "not_applicable";
  }
  // excluded_type / excluded_adcvd / excluded_expired / excluded_recon_filed → needs counsel / litigation
  // Note: excluded_recon_filed means Phase 2 is closed (Type 09 already filed); refund path is complex.
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
