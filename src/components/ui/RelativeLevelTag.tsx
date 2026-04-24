/**
 * RelativeLevelTag — partner-side level chip that reads from the VIEWER's
 * vantage point, not the absolute Fintella tier.
 *
 * Today's admin-side LevelTag renders absolute tiers (L1 / L2 / L3 / L4+
 * from root-of-chain). On the partner side we want each partner to see
 * themselves as their own root, so their direct recruits display as
 * "My L2", grandchildren as "My L3", and so on. Each partner is L1 from
 * their own vantage; we don't render that chip because it's tautological
 * ("you = L1 to yourself") — a viewer-relative chip only makes sense for
 * DOWNLINE partners.
 *
 * Maps from the existing data model:
 *   relativeLevel = 2 ("My L2") = viewer's direct recruits
 *                                  (Partner rows whose referredByPartnerCode
 *                                   points to the viewer)
 *   relativeLevel = 3 ("My L3") = viewer's grandchildren
 *                                  (partner rows two hops below)
 *   relativeLevel = 4+ ("My L4+") = deeper — partners DON'T see these
 *                                  (visibility window is My L2 + My L3 per
 *                                   Option B). A chip is provided anyway
 *                                   so admin-side code can reuse the
 *                                   same component if it wants to display
 *                                   relative depth somewhere.
 *
 * Styling mirrors LevelTag — same gold/silver/bronze palette, same sizes —
 * so partners get visual continuity with the admin UI.
 */

type RelativeLevel = 2 | 3 | 4;

const STYLES: Record<RelativeLevel, string> = {
  // Silver — direct recruits (parallels admin L2)
  2: "bg-[rgba(200,205,215,0.14)] text-[#d7dbe3] border border-[rgba(200,205,215,0.35)]",
  // Bronze — grandchildren (parallels admin L3)
  3: "bg-[rgba(184,115,51,0.15)] text-[#d99a6c] border border-[rgba(184,115,51,0.45)]",
  // Neutral — anything deeper, kept in case admin-side reuses this
  4: "bg-[var(--app-input-bg)] text-[var(--app-text-muted)] border border-[var(--app-border)]",
};

export interface RelativeLevelTagProps {
  /**
   * How many hops the partner is below the viewer. 2 = direct recruit,
   * 3 = grandchild, 4+ = deeper (rendered as "My L4+" — though partner
   * UI shouldn't surface these in practice).
   */
  relativeLevel: number;
  size?: "xs" | "sm";
  className?: string;
}

export default function RelativeLevelTag({ relativeLevel, size = "sm", className = "" }: RelativeLevelTagProps) {
  const clamped = (relativeLevel === 2 ? 2 : relativeLevel === 3 ? 3 : 4) as RelativeLevel;
  const label = clamped === 4 ? "My L4+" : `My L${clamped}`;
  const sizeCls = size === "xs"
    ? "text-[10px] px-1.5 py-0.5"
    : "text-[11px] px-2 py-0.5";
  return (
    <span
      className={`inline-block font-mono font-semibold rounded ${sizeCls} ${STYLES[clamped]} ${className}`}
    >
      {label}
    </span>
  );
}
