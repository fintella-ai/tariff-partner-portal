"use client";

/**
 * Level 3 Edit Layout — Phase B section primitive.
 *
 * Wrap any discrete page region the star super admin should be able to
 * hide without a code change:
 *
 *   <EditableSection id="home.announcements" title="Announcements">
 *     ...card stack / chart / whatever...
 *   </EditableSection>
 *
 * Contract:
 *   - `id` is a stable developer-authored key; don't rename once shipped.
 *   - `title` is an optional humane label shown in the edit-mode overlay
 *     ("Hide [Announcements]"). Defaults to the id.
 *   - Display mode (everyone):
 *       - `hidden=true` → renders nothing.
 *       - `hidden=false/undefined` → renders children as-is.
 *   - Edit mode (star super admin, toggled on):
 *       - Always renders children (hidden or not) so the admin can still
 *         see the section they're about to re-show.
 *       - A dashed gold outline wraps the region.
 *       - A floating "Hide section" / "Show section" pill sits top-right
 *         and persists the flip to /api/admin/page-sections.
 *       - Hidden sections render at 40% opacity so it's obvious they're
 *         off for regular users.
 */
import { useState, type ReactNode } from "react";
import { useEditLayout } from "@/components/admin/EditLayoutContext";

type ReorderNeighbor = {
  id: string;
  effectiveOrder: number;
};

type Props = {
  id: string;
  title?: string;
  className?: string;
  children: ReactNode;
  /** Phase C — effective order of this section (default index OR saved
   * order). Needed so move-up / move-down swaps assign the correct int. */
  effectiveOrder?: number;
  /** Phase C — the neighbor above in render order, or null if this is
   * already first. When null, the ↑ arrow hides. */
  prev?: ReorderNeighbor | null;
  /** Phase C — the neighbor below, or null if last. When null, ↓ hides. */
  next?: ReorderNeighbor | null;
};

export default function EditableSection({
  id,
  title,
  className,
  children,
  effectiveOrder,
  prev,
  next,
}: Props) {
  const { canEdit, editMode, getSection, saveSection } = useEditLayout();
  const section = getSection(id);
  const hidden = section?.hidden === true;
  const [busy, setBusy] = useState(false);

  const isEditing = canEdit && editMode;

  if (hidden && !isEditing) return null;

  const toggleHidden = async () => {
    setBusy(true);
    try {
      await saveSection(id, { hidden: !hidden });
    } finally {
      setBusy(false);
    }
  };

  const swapWith = async (neighbor: ReorderNeighbor | null | undefined) => {
    if (!neighbor || effectiveOrder === undefined) return;
    setBusy(true);
    try {
      // Two sequential saves — the second overwrites the first in state.
      // Ordering matters: write the neighbor first so its row reflects
      // *our* previous position even if we crash between the two.
      await saveSection(neighbor.id, { order: effectiveOrder });
      await saveSection(id, { order: neighbor.effectiveOrder });
    } finally {
      setBusy(false);
    }
  };

  if (!isEditing) {
    // Display mode — render naked so there's zero layout impact.
    return <>{children}</>;
  }

  return (
    <div
      className={`relative rounded-md outline-dashed outline-1 outline-brand-gold/40 hover:outline-brand-gold transition-[outline-color] ${hidden ? "opacity-40" : ""} ${className ?? ""}`.trim()}
      data-section-id={id}
    >
      <div className="absolute right-2 top-2 z-10 flex items-center gap-2">
        <span className="rounded-full bg-black/80 text-brand-gold text-[10px] font-body tracking-[1px] uppercase px-2 py-0.5 border border-brand-gold/40">
          {title || id}
        </span>
        {prev !== undefined && (
          <button
            type="button"
            onClick={() => swapWith(prev)}
            disabled={busy || !prev}
            aria-label="Move section up"
            title="Move up"
            className={`w-7 h-7 rounded-full border transition-colors shadow-md flex items-center justify-center text-sm leading-none ${
              prev
                ? "bg-black/80 text-brand-gold border-brand-gold/40 hover:bg-black"
                : "bg-black/40 text-brand-gold/30 border-brand-gold/10 cursor-not-allowed"
            } ${busy ? "opacity-60" : ""}`}
          >
            ↑
          </button>
        )}
        {next !== undefined && (
          <button
            type="button"
            onClick={() => swapWith(next)}
            disabled={busy || !next}
            aria-label="Move section down"
            title="Move down"
            className={`w-7 h-7 rounded-full border transition-colors shadow-md flex items-center justify-center text-sm leading-none ${
              next
                ? "bg-black/80 text-brand-gold border-brand-gold/40 hover:bg-black"
                : "bg-black/40 text-brand-gold/30 border-brand-gold/10 cursor-not-allowed"
            } ${busy ? "opacity-60" : ""}`}
          >
            ↓
          </button>
        )}
        <button
          type="button"
          onClick={toggleHidden}
          disabled={busy}
          className={`rounded-full px-2.5 py-1 text-[10px] font-body font-semibold tracking-[1px] uppercase border transition-colors shadow-md ${
            hidden
              ? "bg-brand-gold text-black border-brand-gold hover:bg-yellow-300"
              : "bg-black/80 text-brand-gold border-brand-gold/40 hover:bg-black"
          } ${busy ? "opacity-60" : ""}`}
        >
          {hidden ? "Show" : "Hide"}
        </button>
      </div>
      {children}
    </div>
  );
}
