export function fmt$(n: number | string | null | undefined): string {
  if (!n || isNaN(Number(n))) return "$0";
  return "$" + Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Date + time stamp used by communications-style UI (email/SMS/call logs,
 * admin notes, support ticket messages, notifications, inbound emails).
 * Example: "Apr 15, 2026, 2:47 PM".
 */
export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fmtPercent(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

/**
 * Normalize any US phone input to E.164 (+1##########).
 * Strips formatting, accepts 10-digit or 11-digit (leading 1) numbers.
 * Returns null for blank or unrecognizable input.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 0) return null;
  return raw.trim(); // non-US / already formatted — store as-is
}
