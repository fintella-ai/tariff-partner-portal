"use client";

/**
 * Level 3 Edit Layout — Phase A floating toggle.
 *
 * Bottom-right pill, star-super-admin only. Click → toggles edit mode
 * for every <EditableText> on the page. Completely invisible to anyone
 * else (including other super_admins) so the surface can't be discovered
 * by accident.
 *
 * Positioned to avoid colliding with:
 *   - SoftPhone (admin bottom-right, anchored ~bottom-6 right-6)
 *   - InternalChatWidget floating bubble (admin bottom-right)
 *   - PartnerOS assistant picker (partner bottom-right)
 *
 * We nudge it up ~220px (see `bottom-[220px]`) so it sits above the
 * softphone dock but still within easy thumb reach.
 */
import { useEditLayout } from "@/components/admin/EditLayoutContext";

export default function EditLayoutButton() {
  const { canEdit, editMode, toggleEditMode } = useEditLayout();
  if (!canEdit) return null;
  return (
    <button
      onClick={toggleEditMode}
      aria-pressed={editMode}
      aria-label={editMode ? "Done editing layout" : "Edit Layout"}
      title={editMode ? "Done editing layout" : "Edit Layout (Star Super Admin)"}
      className={`fixed right-4 bottom-[220px] z-[1001] flex items-center gap-2 rounded-full px-4 py-2.5 font-body text-[12px] font-semibold shadow-lg backdrop-blur-sm transition-all active:scale-[0.97] ${
        editMode
          ? "bg-brand-gold text-black border border-brand-gold hover:bg-yellow-300"
          : "bg-black/70 text-brand-gold border border-brand-gold/40 hover:bg-black/90"
      }`}
      style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom, 0px))" }}
    >
      <span aria-hidden>{editMode ? "✓" : "✎"}</span>
      <span>{editMode ? "Done editing" : "Edit Layout"}</span>
    </button>
  );
}
