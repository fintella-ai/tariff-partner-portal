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
        // Background alpha bumped 0x22 (~13%) → 0x40 (~25%) and border
        // 0x44 (~27%) → 0x66 (~40%) so colored stage chips — including
        // the Deal Pipeline filter buttons — read distinctly against
        // the card surfaces.
        background: s.color + "40",
        color: s.color,
        border: `1px solid ${s.color}66`,
      }}
    >
      {s.label}
    </span>
  );
}
