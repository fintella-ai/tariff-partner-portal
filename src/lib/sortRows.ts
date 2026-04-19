export type SortDir = "asc" | "desc";

const ISO_DATE_LEADING = /^\d{4}-/;

function getValue<T>(row: T, key: keyof T | string, accessors?: Record<string, (r: T) => unknown>): unknown {
  if (accessors && typeof key === "string" && key in accessors) return accessors[key](row);
  return (row as Record<string, unknown>)[key as string];
}

export function compareRows<T>(
  a: T,
  b: T,
  key: keyof T | string,
  dir: SortDir,
  accessors?: Record<string, (r: T) => unknown>
): number {
  const av = getValue(a, key, accessors);
  const bv = getValue(b, key, accessors);

  // Nulls sort last regardless of direction.
  const aNull = av === null || av === undefined;
  const bNull = bv === null || bv === undefined;
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;

  // Numbers.
  if (typeof av === "number" && typeof bv === "number") {
    return dir === "asc" ? av - bv : bv - av;
  }

  // ISO-ish date strings (leading YYYY-).
  if (typeof av === "string" && typeof bv === "string" && ISO_DATE_LEADING.test(av) && ISO_DATE_LEADING.test(bv)) {
    const ad = Date.parse(av);
    const bd = Date.parse(bv);
    if (!Number.isNaN(ad) && !Number.isNaN(bd)) {
      return dir === "asc" ? ad - bd : bd - ad;
    }
  }

  // Strings.
  const as = String(av);
  const bs = String(bv);
  return dir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
}
