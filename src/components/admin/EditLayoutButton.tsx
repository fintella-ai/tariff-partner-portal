"use client";

import { useEditLayout } from "@/components/admin/EditLayoutContext";
import { useDevice } from "@/lib/useDevice";

export default function EditLayoutButton() {
  const { canEdit, editMode, toggleEditMode } = useEditLayout();
  const device = useDevice();

  if (!canEdit || device.isMobile) return null;

  return (
    <div className="w-full flex justify-center py-1.5" style={{ background: editMode ? "var(--brand-gold)" : "transparent" }}>
      <button
        onClick={toggleEditMode}
        className={`font-body text-[10px] font-semibold tracking-[1px] uppercase rounded-full px-4 py-1 transition-all ${
          editMode
            ? "bg-black/15 text-black hover:bg-black/25"
            : "bg-brand-gold/10 border border-brand-gold/20 text-brand-gold hover:bg-brand-gold/15"
        }`}
      >
        {editMode ? "✓ Done Editing" : "✎ Edit Layout"}
      </button>
    </div>
  );
}
