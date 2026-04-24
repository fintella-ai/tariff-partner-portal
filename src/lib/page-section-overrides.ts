/**
 * Level 3 Edit Layout — section-level overrides (Phases B + C).
 *
 * Sibling of page-text-overrides.ts. Phase B uses `hidden`. Phase C adds
 * `order`. Phase D will add `sections` (the admin-authored new-section
 * list) but that's out of scope here.
 *
 * JSON shape on PortalSettings.pageSectionOverrides:
 *   { "<page>.<section>": { hidden?: boolean, order?: number } }
 *
 * Contract:
 *   - Missing key, empty object, or fully-default values → no effect
 *     (page renders its hardcoded default layout).
 *   - Writes are star-super-admin gated at the API layer, NOT here.
 */
import { prisma } from "@/lib/prisma";

export type SectionOverride = {
  hidden?: boolean;
  order?: number;
};

type SectionOverrideMap = Record<string, SectionOverride>;

function normalize(entry: unknown): SectionOverride | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const raw = entry as Record<string, unknown>;
  const out: SectionOverride = {};
  if (typeof raw.hidden === "boolean") out.hidden = raw.hidden;
  if (typeof raw.order === "number" && Number.isFinite(raw.order)) out.order = raw.order;
  if (out.hidden === undefined && out.order === undefined) return null;
  return out;
}

async function readRaw(): Promise<SectionOverrideMap> {
  const settings = await prisma.portalSettings.findUnique({
    where: { id: "global" },
    select: { pageSectionOverrides: true },
  });
  const blob = settings?.pageSectionOverrides;
  if (!blob || typeof blob !== "object" || Array.isArray(blob)) return {};
  const out: SectionOverrideMap = {};
  for (const [k, v] of Object.entries(blob as Record<string, unknown>)) {
    const n = normalize(v);
    if (n) out[k] = n;
  }
  return out;
}

export async function getAllSectionOverrides(): Promise<SectionOverrideMap> {
  return readRaw();
}

export async function getSectionOverride(
  id: string
): Promise<SectionOverride | null> {
  const all = await readRaw();
  return all[id] ?? null;
}

export async function setSectionOverride(
  id: string,
  patch: SectionOverride
): Promise<SectionOverrideMap> {
  const current = await readRaw();
  const next = { ...current };
  const merged: SectionOverride = { ...(current[id] ?? {}), ...patch };
  // Strip explicit undefineds so the blob stays tidy.
  if (merged.hidden === undefined) delete merged.hidden;
  if (merged.order === undefined) delete merged.order;
  // Also strip defaulty values so the blob doesn't grow for no reason.
  if (merged.hidden === false) delete merged.hidden;
  if (merged.hidden === undefined && merged.order === undefined) {
    delete next[id];
  } else {
    next[id] = merged;
  }
  await prisma.portalSettings.upsert({
    where: { id: "global" },
    create: { id: "global", pageSectionOverrides: next },
    update: { pageSectionOverrides: next },
  });
  return next;
}
