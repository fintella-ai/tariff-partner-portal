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

export function fmtPercent(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}
