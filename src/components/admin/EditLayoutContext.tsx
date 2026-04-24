"use client";

/**
 * Level 3 Edit Layout — shared client context for Phases A + B + C.
 *
 * Wraps both the admin layout and the partner dashboard layout. Exposes:
 *   - canEdit / editMode / toggleEditMode — star-super-admin-only toggle
 *   - text overrides     (Phase A): getOverride, saveOverride, overrides
 *   - section overrides  (Phases B+C): getSection, saveSection, sections
 *
 * Non-star sessions get a permanently-false editMode and no-op saves —
 * the context still renders so children can safely call useEditLayout()
 * without a provider check.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import { isStarSuperAdminEmail } from "@/lib/starSuperAdmin";

type OverrideMap = Record<string, string>;

export type SectionOverride = { hidden?: boolean; order?: number };
type SectionOverrideMap = Record<string, SectionOverride>;

type EditLayoutContextValue = {
  canEdit: boolean;
  editMode: boolean;
  toggleEditMode: () => void;
  overrides: OverrideMap;
  getOverride: (id: string) => string | null;
  saveOverride: (id: string, value: string | null) => Promise<void>;
  sections: SectionOverrideMap;
  getSection: (id: string) => SectionOverride | null;
  saveSection: (id: string, patch: SectionOverride) => Promise<void>;
};

const EditLayoutContext = createContext<EditLayoutContextValue | null>(null);

export function EditLayoutProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const canEdit = isStarSuperAdminEmail(session?.user?.email);

  const [editMode, setEditMode] = useState(false);
  const [overrides, setOverrides] = useState<OverrideMap>({});
  const [sections, setSections] = useState<SectionOverrideMap>({});

  useEffect(() => {
    if (!canEdit) {
      setOverrides({});
      setSections({});
      setEditMode(false);
      return;
    }
    let cancelled = false;
    Promise.all([
      fetch("/api/admin/page-overrides", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch("/api/admin/page-sections", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([o, s]) => {
      if (cancelled) return;
      if (o?.overrides && typeof o.overrides === "object") {
        setOverrides(o.overrides as OverrideMap);
      }
      if (s?.sections && typeof s.sections === "object") {
        setSections(s.sections as SectionOverrideMap);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [canEdit]);

  const toggleEditMode = useCallback(() => {
    if (!canEdit) return;
    setEditMode((prev) => !prev);
  }, [canEdit]);

  const getOverride = useCallback(
    (id: string) => overrides[id] ?? null,
    [overrides]
  );

  const saveOverride = useCallback(
    async (id: string, value: string | null) => {
      if (!canEdit) return;
      const res = await fetch("/api/admin/page-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, value }),
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (data?.overrides && typeof data.overrides === "object") {
        setOverrides(data.overrides as OverrideMap);
      } else {
        setOverrides((prev) => {
          const next = { ...prev };
          const trimmed = typeof value === "string" ? value.trim() : "";
          if (!trimmed) delete next[id];
          else next[id] = value as string;
          return next;
        });
      }
    },
    [canEdit]
  );

  const getSection = useCallback(
    (id: string) => sections[id] ?? null,
    [sections]
  );

  const saveSection = useCallback(
    async (id: string, patch: SectionOverride) => {
      if (!canEdit) return;
      const res = await fetch("/api/admin/page-sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (data?.sections && typeof data.sections === "object") {
        setSections(data.sections as SectionOverrideMap);
      } else {
        setSections((prev) => ({
          ...prev,
          [id]: { ...(prev[id] ?? {}), ...patch },
        }));
      }
    },
    [canEdit]
  );

  const value = useMemo<EditLayoutContextValue>(
    () => ({
      canEdit,
      editMode,
      toggleEditMode,
      overrides,
      getOverride,
      saveOverride,
      sections,
      getSection,
      saveSection,
    }),
    [
      canEdit,
      editMode,
      toggleEditMode,
      overrides,
      getOverride,
      saveOverride,
      sections,
      getSection,
      saveSection,
    ]
  );

  return (
    <EditLayoutContext.Provider value={value}>
      {children}
    </EditLayoutContext.Provider>
  );
}

export function useEditLayout(): EditLayoutContextValue {
  const ctx = useContext(EditLayoutContext);
  if (ctx) return ctx;
  // Safe default so <EditableText> / <EditableSection> can render outside
  // a provider (e.g. on pages not yet wrapped). Never throws.
  return {
    canEdit: false,
    editMode: false,
    toggleEditMode: () => {},
    overrides: {},
    getOverride: () => null,
    saveOverride: async () => {},
    sections: {},
    getSection: () => null,
    saveSection: async () => {},
  };
}
