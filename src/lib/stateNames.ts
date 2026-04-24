/**
 * US state + territory name normalization.
 *
 * The Fintella webhook accepts `state` in either 2-letter abbreviation
 * form ("CA") or full name ("California") and normalizes to the full name
 * on write. Downstream consumers (admin UI, reporting, SignWell merge
 * fields) then have a consistent representation to render.
 *
 * Case-insensitive: "ca" / "Ca" / "CA" all resolve to "California".
 * Unknown inputs pass through unchanged (trimmed) so we never corrupt
 * data we don't recognize — better to surface an odd string in the
 * admin deal detail than to silently drop it.
 */

const ABBR_TO_NAME: Record<string, string> = {
  // 50 states
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  // Federal district + common territories we might see on importer paperwork
  DC: "District of Columbia",
  PR: "Puerto Rico", VI: "U.S. Virgin Islands", GU: "Guam",
  AS: "American Samoa", MP: "Northern Mariana Islands",
};

const NAME_SET = new Set(
  Object.values(ABBR_TO_NAME).map((n) => n.toLowerCase())
);

/**
 * Normalize a state-ish input to its full state/territory name.
 *
 * - 2-letter abbrev (any case) → full name from ABBR_TO_NAME
 * - Full name (any case) → Title-Cased canonical full name
 * - Anything else → trimmed input as-is (so unknown data isn't dropped)
 * - Empty / null → empty string
 */
export function normalizeStateName(input: string | null | undefined): string {
  if (!input) return "";
  const trimmed = input.trim();
  if (!trimmed) return "";

  // 2-letter abbrev
  if (trimmed.length === 2) {
    const upper = trimmed.toUpperCase();
    const full = ABBR_TO_NAME[upper];
    if (full) return full;
  }

  // Full name — canonicalize by comparing against the known set
  const lower = trimmed.toLowerCase();
  if (NAME_SET.has(lower)) {
    // Find the exact cased version
    for (const name of Object.values(ABBR_TO_NAME)) {
      if (name.toLowerCase() === lower) return name;
    }
  }

  // Pass through unchanged — don't corrupt unfamiliar input.
  return trimmed;
}
