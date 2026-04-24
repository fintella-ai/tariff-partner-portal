"use client";

/**
 * Level 3 Edit Layout — Phase A primitive.
 *
 * Wrap any piece of user-facing copy the star super admin should be able
 * to rewrite without a code change:
 *
 *   <EditableText id="home.hero.greeting" fallback="Welcome back" as="h1" className="..." />
 *
 * Contract:
 *   - `id` is a stable developer-authored key. Don't rename once shipped.
 *   - `fallback` is the ground-truth copy that renders when no override
 *     exists OR when the override is whitespace-only. Always required so
 *     the page never goes blank.
 *   - `as` picks the rendered tag. Defaults to <span>. Inline-ish tags
 *     (span/p/h1-h6/strong/em/label/small/div) are all fine.
 *   - Edit mode (star super admin + EditLayoutButton toggled on):
 *       - A dashed gold outline shows on hover.
 *       - Click → contentEditable. Blur → save. Escape → cancel.
 *       - Empty save reverts to fallback (server handles this).
 *   - Display mode (everyone else, always): renders override ?? fallback
 *     as plain text inside the chosen tag.
 */
import { useEffect, useRef, useState, type ElementType } from "react";
import { useEditLayout } from "@/components/admin/EditLayoutContext";

type Props = {
  id: string;
  fallback: string;
  as?: ElementType;
  className?: string;
};

export default function EditableText({
  id,
  fallback,
  as,
  className,
}: Props) {
  const Tag = (as ?? "span") as ElementType;
  const { canEdit, editMode, getOverride, saveOverride } = useEditLayout();
  const override = getOverride(id);
  const displayValue = override ?? fallback;

  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLElement | null>(null);
  const originalRef = useRef<string>(displayValue);

  // Keep the DOM text in sync when the override changes from elsewhere
  // (e.g. another edit to the same id, or hydration).
  useEffect(() => {
    if (!ref.current) return;
    if (ref.current.textContent !== displayValue) {
      ref.current.textContent = displayValue;
    }
    originalRef.current = displayValue;
  }, [displayValue]);

  const isEditable = canEdit && editMode;

  const handleBlur = async () => {
    if (!ref.current) return;
    const next = ref.current.textContent ?? "";
    if (next === originalRef.current) return;
    setSaving(true);
    try {
      await saveOverride(id, next.trim().length === 0 ? null : next);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (ref.current) ref.current.textContent = originalRef.current;
      (ref.current as HTMLElement | null)?.blur();
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      (ref.current as HTMLElement | null)?.blur();
    }
  };

  const editableClass = isEditable
    ? `${className ?? ""} cursor-text outline-dashed outline-1 outline-transparent hover:outline-brand-gold/60 focus:outline-brand-gold focus:outline-2 rounded-sm transition-[outline-color] ${saving ? "opacity-60" : ""}`.trim()
    : className;

  return (
    <Tag
      ref={ref as any}
      className={editableClass}
      contentEditable={isEditable}
      suppressContentEditableWarning
      spellCheck={isEditable}
      onBlur={isEditable ? handleBlur : undefined}
      onKeyDown={isEditable ? handleKeyDown : undefined}
      data-edit-id={isEditable ? id : undefined}
    >
      {displayValue}
    </Tag>
  );
}
