"use client";

/**
 * Level 3 Edit Layout — bottom banner toggle (scrolls with page).
 *
 * Star-super-admin only. Renders as a sticky bottom banner (like sudo
 * banner but at the bottom). Hidden on mobile entirely.
 */
import { useEditLayout } from "@/components/admin/EditLayoutContext";
import { useDevice } from "@/lib/useDevice";

export default function EditLayoutButton() {
  const { canEdit, editMode, toggleEditMode } = useEditLayout();
  const device = useDevice();

  if (!canEdit || device.isMobile) return null;

  return (
    <div
      className={`sticky bottom-0 left-0 right-0 z-[1001] flex items-center justify-center gap-3 py-2 px-4 font-body text-[12px] font-semibold tracking-wider transition-all ${
        editMode
          ? "bg-brand-gold text-black"
          : "bg-black/80 text-brand-gold backdrop-blur-sm border-t border-brand-gold/20"
      }`}
    >
      <span aria-hidden>{editMode ? "✎" : "✎"}</span>
      <span>{editMode ? "EDIT MODE ACTIVE — Changes save automatically" : "Star Super Admin — Edit layout available"}</span>
      <button
        onClick={toggleEditMode}
        className={`ml-2 rounded-lg px-4 py-1 text-[11px] font-semibold transition-colors ${
          editMode
            ? "bg-black/20 hover:bg-black/30 text-black"
            : "bg-brand-gold/20 hover:bg-brand-gold/30 text-brand-gold"
        }`}
      >
        {editMode ? "Done Editing" : "Edit Layout"}
      </button>
    </div>
  );
}
