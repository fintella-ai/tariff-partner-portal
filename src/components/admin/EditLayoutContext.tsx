"use client";

/**
 * Level 3 Edit Layout — Phase A client context.
 *
 * Wraps both the admin layout and the partner dashboard layout. Exposes:
 *   - editMode:       is the star super admin currently editing?
 *   - toggleEditMode: flip the above (no-op for non-star users)
 *   - overrides:      hydrated page-text overrides map
 *   - getOverride:    helper for <EditableText>
 *   - saveOverride:   PATCH + mutate-in-place on successful save
 *   - canEdit:        true iff current session is the star super admin
 *
 * The context is always mounted so children can call useEditLayout()
 * safely from server-component-free client trees — but non-star users
 * get a permanently-false editMode and a no-op toggle. This avoids a
 * separate rendering branch for "button exists at all."
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

type EditLayoutContextValue = {
  canEdit: boolean;
  editMode: boolean;
  toggleEditMode: () => void;
  overrides: OverrideMap;
  getOverride: (id: string) => string | null;
  saveOverride: (id: string, value: string | null) => Promise<void>;
};

const EditLayoutContext = createContext<EditLayoutContextValue | null>(null);

export function EditLayoutProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const canEdit = isStarSuperAdminEmail(session?.user?.email);

  const [editMode, setEditMode] = useState(false);
  const [overrides, setOverrides] = useState<OverrideMap>({});

  useEffect(() => {
    if (!canEdit) {
      setOverrides({});
      setEditMode(false);
      return;
    }
    let cancelled = false;
    fetch("/api/admin/page-overrides", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled && data?.overrides && typeof data.overrides === "object") {
          setOverrides(data.overrides as OverrideMap);
        }
      })
      .catch(() => {});
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

  const value = useMemo<EditLayoutContextValue>(
    () => ({
      canEdit,
      editMode,
      toggleEditMode,
      overrides,
      getOverride,
      saveOverride,
    }),
    [canEdit, editMode, toggleEditMode, overrides, getOverride, saveOverride]
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
  // Safe default so <EditableText> can render outside a provider (e.g.
  // on pages not yet wrapped). Never throws; always returns fallback.
  return {
    canEdit: false,
    editMode: false,
    toggleEditMode: () => {},
    overrides: {},
    getOverride: () => null,
    saveOverride: async () => {},
  };
}
