import { STAGE_LABELS } from "@/lib/constants";

export default function StageBadge({ stage }: { stage?: string }) {
  const s = STAGE_LABELS[stage?.toLowerCase() || ""] || {
    label: stage || "Unknown",
    color: "#6b7280",
  };

  return (
    <span
      className="inline-block rounded-full px-2.5 py-1 font-body text-[10px] font-semibold tracking-wider uppercase whitespace-nowrap"
      style={{
        background: s.color + "22",
        color: s.color,
        border: `1px solid ${s.color}44`,
      }}
    >
      {s.label}
    </span>
  );
}
