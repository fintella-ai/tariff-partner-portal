/**
 * HTS Classification Engine — Phase 2 of the Tariff Intelligence Engine
 *
 * Maps Harmonized Tariff Schedule (HTS) codes to applicable tariff programs.
 * Used to identify which imports are subject to IEEPA duties and qualify
 * for CAPE refunds.
 *
 * HTS codes are 10-digit numbers in XXXX.XX.XXXX format:
 *   - Chapter (2 digits): broad category
 *   - Heading (4 digits): product group
 *   - Subheading (6 digits): international standard (HS)
 *   - US-specific (8-10 digits): US tariff line
 *
 * Chapter 99 codes are the tariff action codes — they reference the
 * underlying HTS code but add the special duty rate. Example:
 *   9903.88.03 = 25% ad valorem on goods of China (Section 301, List 3)
 */

export interface HtsLookupResult {
  htsCode: string;
  description: string;
  chapter: number;
  heading: string;
  programs: TariffProgram[];
  ieepaApplicable: boolean;
  chapter99Codes: string[];
  combinedDutyRate: number;
  notes: string[];
}

export interface TariffProgram {
  type: "ieepa" | "section301" | "section232" | "adcvd" | "gsp" | "other";
  name: string;
  rate: number;
  chapter99Code?: string;
  executiveOrder?: string;
  effectiveDate?: string;
  endDate?: string;
  countries: string[];
}

const IEEPA_CHAPTER_99_RANGES: Array<{
  prefix: string;
  name: string;
  type: "fentanyl" | "reciprocal" | "section122";
  countries: string[];
}> = [
  { prefix: "9903.01", name: "IEEPA Fentanyl — China", type: "fentanyl", countries: ["CN"] },
  { prefix: "9903.02", name: "IEEPA Fentanyl — Canada/Mexico", type: "fentanyl", countries: ["CA", "MX"] },
  { prefix: "9903.03", name: "IEEPA Reciprocal — Baseline 10%", type: "reciprocal", countries: ["ALL"] },
  { prefix: "9903.04", name: "IEEPA Reciprocal — Country-specific", type: "reciprocal", countries: ["VARIES"] },
];

const SECTION_301_LISTS: Array<{
  chapter99Prefix: string;
  listName: string;
  rate: number;
  countries: string[];
}> = [
  { chapter99Prefix: "9903.88.01", listName: "Section 301 List 1", rate: 0.25, countries: ["CN"] },
  { chapter99Prefix: "9903.88.02", listName: "Section 301 List 2", rate: 0.25, countries: ["CN"] },
  { chapter99Prefix: "9903.88.03", listName: "Section 301 List 3", rate: 0.25, countries: ["CN"] },
  { chapter99Prefix: "9903.88.04", listName: "Section 301 List 4A", rate: 0.075, countries: ["CN"] },
  { chapter99Prefix: "9903.88.15", listName: "Section 301 List 4B", rate: 0.075, countries: ["CN"] },
];

const SECTION_232_CODES: Array<{
  chapter99Prefix: string;
  product: string;
  rate: number;
}> = [
  { chapter99Prefix: "9903.80.01", product: "Steel (Section 232)", rate: 0.25 },
  { chapter99Prefix: "9903.80.05", product: "Aluminum (Section 232)", rate: 0.10 },
];

export function classifyHtsCode(
  htsCode: string,
  countryOfOrigin: string,
  chapter99Codes?: string[],
): HtsLookupResult {
  const cleaned = htsCode.replace(/[.\-\s]/g, "");
  const chapter = parseInt(cleaned.slice(0, 2), 10) || 0;
  const heading = cleaned.slice(0, 4);
  const programs: TariffProgram[] = [];
  const ch99: string[] = chapter99Codes || [];
  const notes: string[] = [];
  let ieepaApplicable = false;

  for (const range of IEEPA_CHAPTER_99_RANGES) {
    const matches = ch99.some((c) => c.startsWith(range.prefix));
    if (matches || (range.countries.includes(countryOfOrigin.toUpperCase()) || range.countries.includes("ALL"))) {
      programs.push({
        type: "ieepa",
        name: range.name,
        rate: 0,
        chapter99Code: ch99.find((c) => c.startsWith(range.prefix)),
        countries: range.countries,
      });
      ieepaApplicable = true;
    }
  }

  for (const list of SECTION_301_LISTS) {
    if (ch99.some((c) => c.startsWith(list.chapter99Prefix)) && countryOfOrigin.toUpperCase() === "CN") {
      programs.push({
        type: "section301",
        name: list.listName,
        rate: list.rate,
        chapter99Code: list.chapter99Prefix,
        countries: list.countries,
      });
      notes.push(`${list.listName}: ${(list.rate * 100).toFixed(1)}% additional duty on China-origin goods`);
    }
  }

  for (const s232 of SECTION_232_CODES) {
    if (ch99.some((c) => c.startsWith(s232.chapter99Prefix))) {
      programs.push({
        type: "section232",
        name: s232.product,
        rate: s232.rate,
        chapter99Code: s232.chapter99Prefix,
        countries: ["ALL"],
      });
      notes.push(`${s232.product}: ${(s232.rate * 100).toFixed(0)}% tariff`);
    }
  }

  if (chapter === 72 || chapter === 73) {
    notes.push("Chapters 72-73 (Iron & Steel) — check for Section 232 applicability");
  }
  if (chapter === 76) {
    notes.push("Chapter 76 (Aluminum) — check for Section 232 applicability");
  }

  const combinedDutyRate = programs.reduce((sum, p) => sum + p.rate, 0);

  return {
    htsCode,
    description: getHtsDescription(heading),
    chapter,
    heading,
    programs,
    ieepaApplicable,
    chapter99Codes: ch99,
    combinedDutyRate,
    notes,
  };
}

export function detectTariffStacking(
  htsCode: string,
  countryOfOrigin: string,
  chapter99Codes: string[],
): { isStacked: boolean; programs: string[]; totalRate: number; warning: string | null } {
  const result = classifyHtsCode(htsCode, countryOfOrigin, chapter99Codes);

  const programNames = result.programs.map((p) => p.name);
  const totalRate = result.combinedDutyRate;
  const isStacked = result.programs.length > 1;

  let warning: string | null = null;
  if (isStacked) {
    warning = `Tariff stacking detected: ${programNames.join(" + ")} = ${(totalRate * 100).toFixed(1)}% combined rate. Verify each program's refund eligibility separately.`;
  }

  return { isStacked, programs: programNames, totalRate, warning };
}

function getHtsDescription(heading: string): string {
  const DESCRIPTIONS: Record<string, string> = {
    "0101": "Live horses, asses, mules",
    "2523": "Portland cement",
    "3901": "Polymers of ethylene",
    "3926": "Articles of plastics",
    "4011": "New pneumatic tires of rubber",
    "6110": "Jerseys, pullovers, cardigans",
    "6204": "Women's suits, dresses",
    "7210": "Flat-rolled iron/steel, coated",
    "7304": "Tubes, pipes of iron/steel",
    "7601": "Unwrought aluminum",
    "7606": "Aluminum plates, sheets",
    "8414": "Air pumps, compressors",
    "8471": "Automatic data processing machines",
    "8473": "Computer parts and accessories",
    "8501": "Electric motors and generators",
    "8504": "Transformers, static converters",
    "8517": "Telephone sets, smartphones",
    "8521": "Video recording/reproducing",
    "8528": "Monitors, projectors, TVs",
    "8541": "Semiconductor devices",
    "8542": "Electronic integrated circuits",
    "8544": "Insulated wire and cable",
    "8708": "Motor vehicle parts",
    "8711": "Motorcycles",
    "9401": "Seats and chairs",
    "9403": "Furniture and parts",
    "9503": "Toys, games, sports articles",
    "9504": "Video game consoles",
  };

  return DESCRIPTIONS[heading] || `HTS heading ${heading}`;
}

export function isIeepaEligibleCountry(countryCode: string): boolean {
  const NON_ELIGIBLE = new Set(["US", "PR", "GU", "VI", "AS", "MP"]);
  return !NON_ELIGIBLE.has(countryCode.toUpperCase());
}

export function getChapter99ForCountry(countryCode: string): string[] {
  const codes: string[] = [];
  const cc = countryCode.toUpperCase();

  if (cc === "CN") {
    codes.push("9903.01.XX"); // Fentanyl
    codes.push("9903.04.XX"); // Reciprocal (China-specific rate)
  } else if (cc === "CA" || cc === "MX") {
    codes.push("9903.02.XX"); // Fentanyl (CA/MX)
  }

  codes.push("9903.03.XX"); // Baseline reciprocal 10%

  return codes;
}
