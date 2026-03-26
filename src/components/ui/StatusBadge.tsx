import { COMMISSION_STATUS_COLORS } from "@/lib/constants";

export default function StatusBadge({ status }: { status?: string }) {
  const c = COMMISSION_STATUS_COLORS[status?.toLowerCase() || ""] || "#6b7280";

  return (
    <span
      className="inline-block rounded-full px-2.5 py-1 font-body text-[10px] font-semibold tracking-wider uppercase"
      style={{
        background: c + "22",
        color: c,
        border: `1px solid ${c}44`,
      }}
    >
      {status || "Pending"}
    </span>
  );
}
