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

type Props = {
  id: string;
  title?: string;
  className?: string;
  children: ReactNode;
};

export default function EditableSection({
  id,
  title,
  className,
  children,
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
