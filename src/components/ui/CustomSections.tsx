"use client";

/**
 * Level 3 Edit Layout — Phase D render surface.
 *
 * Mount `<CustomSections pageId="home" />` wherever admin-authored
 * sections should appear. The component:
 *
 *   - Reads `customSections[pageId]` from EditLayoutContext, sorts by
 *     `order`, renders each through the section-type registry.
 *   - In display mode: zero chrome, just the sections.
 *   - In edit mode (star admin, Edit Layout toggled on):
 *       - Dashed gold outline around each section.
 *       - "Edit" + "Delete" buttons top-right of each section.
 *       - "+ Add section" dashed-outline box at the end that opens the
 *         add-modal.
 *
 * The add/edit modal is self-contained inside this file — it's small
 * enough to not need its own export and keeps the registry-glue in one
 * place.
 */
import { useMemo, useState } from "react";
import { useEditLayout, type CustomSection } from "@/components/admin/EditLayoutContext";
import {
  SECTION_TYPES,
  SECTION_TYPE_IDS,
  type SectionField,
} from "@/components/ui/PageSectionTypes";

type Props = {
  pageId: string;
  /** Optional top margin to give the whole block some breathing room
   * when it sits below other content. */
  className?: string;
};

export default function CustomSections({ pageId, className }: Props) {
  const {
    canEdit,
    editMode,
    getCustomSections,
    addCustomSection,
    updateCustomSection,
    removeCustomSection,
  } = useEditLayout();
  const sections = useMemo(
    () =>
      [...getCustomSections(pageId)].sort(
        (a, b) => a.order - b.order || a.id.localeCompare(b.id)
      ),
    [getCustomSections, pageId]
  );

  const [modal, setModal] = useState<
    | { mode: "add"; type: string; data: Record<string, unknown> }
    | { mode: "edit"; section: CustomSection; data: Record<string, unknown> }
    | null
  >(null);

  const isEditing = canEdit && editMode;

  return (
    <div className={className}>
      {sections.map((s) => {
        const def = SECTION_TYPES[s.type];
        const body = def ? def.render(s.data) : (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-4 font-body text-[12px] text-red-400">
            Unknown section type: <code>{s.type}</code>
          </div>
        );
        if (!isEditing) {
          return (
            <div key={s.id} className="mb-6 sm:mb-8 animate-fade-up">
              {body}
            </div>
          );
        }
        return (
          <div
            key={s.id}
            className="relative mb-6 sm:mb-8 animate-fade-up rounded-md outline-dashed outline-1 outline-brand-gold/40 hover:outline-brand-gold transition-[outline-color] p-1"
          >
            <div className="absolute right-2 top-2 z-10 flex items-center gap-2">
              <span className="rounded-full bg-black/80 text-brand-gold text-[10px] font-body tracking-[1px] uppercase px-2 py-0.5 border border-brand-gold/40">
                {def?.label || s.type}
              </span>
              <button
                type="button"
                onClick={() =>
                  setModal({
                    mode: "edit",
                    section: s,
                    data: { ...s.data },
                  })
                }
                className="rounded-full px-2.5 py-1 text-[10px] font-body font-semibold tracking-[1px] uppercase border bg-black/80 text-brand-gold border-brand-gold/40 hover:bg-black shadow-md transition-colors"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm("Remove this section? This cannot be undone.")) return;
                  await removeCustomSection(pageId, s.id);
                }}
                className="rounded-full px-2.5 py-1 text-[10px] font-body font-semibold tracking-[1px] uppercase border bg-red-500/20 text-red-300 border-red-500/40 hover:bg-red-500/30 shadow-md transition-colors"
              >
                Delete
              </button>
            </div>
            {body}
          </div>
        );
      })}

      {isEditing && (
        <button
          type="button"
          onClick={() => {
            const firstType = SECTION_TYPE_IDS[0];
            if (!firstType) return;
            setModal({
              mode: "add",
              type: firstType,
              data: { ...(SECTION_TYPES[firstType].defaultData || {}) },
            });
          }}
          className="w-full mb-6 sm:mb-8 py-6 rounded-xl border-2 border-dashed border-brand-gold/40 hover:border-brand-gold/80 text-brand-gold font-body text-[13px] font-semibold tracking-[1px] uppercase transition-colors"
        >
          + Add Section
        </button>
      )}

      {modal && (
        <SectionModal
          state={modal}
          onClose={() => setModal(null)}
          onSubmit={async (nextData, nextType) => {
            if (modal.mode === "add") {
              await addCustomSection(pageId, nextType ?? modal.type, nextData);
            } else {
              await updateCustomSection(pageId, modal.section.id, { data: nextData });
            }
            setModal(null);
          }}
          onChangeType={(nextType) => {
            if (modal.mode !== "add") return;
            setModal({
              mode: "add",
              type: nextType,
              data: { ...(SECTION_TYPES[nextType]?.defaultData || {}) },
            });
          }}
          onChangeField={(key, value) => {
            setModal((prev) => {
              if (!prev) return prev;
              return { ...prev, data: { ...prev.data, [key]: value } } as typeof prev;
            });
          }}
        />
      )}
    </div>
  );
}

type ModalState =
  | { mode: "add"; type: string; data: Record<string, unknown> }
  | { mode: "edit"; section: CustomSection; data: Record<string, unknown> };

function SectionModal({
  state,
  onClose,
  onSubmit,
  onChangeType,
  onChangeField,
}: {
  state: ModalState;
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>, type?: string) => void | Promise<void>;
  onChangeType: (nextType: string) => void;
  onChangeField: (key: string, value: unknown) => void;
}) {
  const activeType = state.mode === "add" ? state.type : state.section.type;
  const def = SECTION_TYPES[activeType];
  const title = state.mode === "add" ? "Add Section" : `Edit ${def?.label || activeType}`;

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center px-4 bg-black/80 backdrop-blur-sm">
      <div className="max-w-xl w-full max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-bg-secondary)] p-5 sm:p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-body text-[11px] text-[var(--app-text-muted)] tracking-[2px] uppercase">
              {state.mode === "add" ? "New section" : "Edit section"}
            </div>
            <h2 className="font-display text-[18px] font-bold mt-0.5">{title}</h2>
            {def?.description && (
              <p className="font-body text-[12px] text-[var(--app-text-muted)] mt-1">
                {def.description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--app-text-muted)] hover:bg-white/5"
          >
            ✕
          </button>
        </div>

        {state.mode === "add" && (
          <label className="flex flex-col gap-1.5">
            <span className="font-body text-[11px] text-[var(--app-text-muted)] tracking-[1px] uppercase">
              Section type
            </span>
            <select
              value={state.type}
              onChange={(e) => onChangeType(e.target.value)}
              className="bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2 font-body text-[13px] text-[var(--app-text)]"
            >
              {SECTION_TYPE_IDS.map((id) => (
                <option key={id} value={id}>
                  {SECTION_TYPES[id].label}
                </option>
              ))}
            </select>
          </label>
        )}

        {def?.fields.map((f) => (
          <FieldEditor key={f.key} field={f} value={state.data[f.key]} onChange={onChangeField} />
        ))}

        {def?.fields.length === 0 && (
          <div className="font-body text-[12px] text-[var(--app-text-muted)] italic">
            This section type has no editable fields.
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="font-body text-[13px] px-4 py-2 rounded-lg border border-[var(--app-border)] text-[var(--app-text-muted)] hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit(state.data, activeType)}
            className="font-body text-[13px] font-semibold px-4 py-2 rounded-lg bg-brand-gold text-black border border-brand-gold hover:bg-yellow-300"
          >
            {state.mode === "add" ? "Add section" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldEditor({
  field,
  value,
  onChange,
}: {
  field: SectionField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}) {
  const stringValue = typeof value === "string" ? value : "";
  const commonInputCls =
    "bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2 font-body text-[13px] text-[var(--app-text)] outline-none focus:border-brand-gold/40 transition-colors";
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-body text-[11px] text-[var(--app-text-muted)] tracking-[1px] uppercase">
        {field.label}
      </span>
      {field.kind === "textarea" ? (
        <textarea
          value={stringValue}
          rows={4}
          placeholder={field.placeholder}
          onChange={(e) => onChange(field.key, e.target.value)}
          className={commonInputCls}
        />
      ) : field.kind === "color" ? (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={stringValue || "#c4a050"}
            onChange={(e) => onChange(field.key, e.target.value)}
            className="h-10 w-14 rounded border border-[var(--app-border)] bg-transparent cursor-pointer"
          />
          <input
            type="text"
            value={stringValue}
            placeholder="#c4a050"
            onChange={(e) => onChange(field.key, e.target.value)}
            className={`${commonInputCls} flex-1`}
          />
        </div>
      ) : (
        <input
          type={field.kind === "url" ? "url" : "text"}
          value={stringValue}
          placeholder={field.placeholder}
          onChange={(e) => onChange(field.key, e.target.value)}
          className={commonInputCls}
        />
      )}
    </label>
  );
}
