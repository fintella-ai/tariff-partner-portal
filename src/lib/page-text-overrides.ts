/**
 * Level 3 Edit Layout — Phase A primitive storage.
 *
 * The star super admin (admin@fintella.partners) can click any
 * <EditableText id="..."> marker in edit mode and rewrite the copy live.
 * The edit is persisted into PortalSettings.pageTextOverrides as a JSON
 * map of `{ "<page>.<section>.<key>": "<override string>", ... }`.
 *
 * Contract:
 *   - Missing key OR empty/whitespace-only override → revert to the
 *     component's `fallback` prop (never render an empty string).
 *   - Keys are developer-authored strings baked into JSX. They never
 *     change once shipped — if a developer really wants to "rename" a
 *     key, they must accept that the override resets.
 *   - Reads are fire-and-forget cheap (single settings row). No need for
 *     caching gymnastics yet — revisit at Phase C if we're hitting it
 *     from every page render.
 *   - Writes are star-super-admin gated at the API layer, NOT here. This
 *     module is a thin DB wrapper; callers are responsible for auth.
 */
import { prisma } from "@/lib/prisma";

type OverrideMap = Record<string, string>;

async function readRaw(): Promise<OverrideMap> {
  const settings = await prisma.portalSettings.findUnique({
    where: { id: "global" },
    select: { pageTextOverrides: true },
  });
  const blob = settings?.pageTextOverrides;
  if (!blob || typeof blob !== "object" || Array.isArray(blob)) return {};
  const out: OverrideMap = {};
  for (const [k, v] of Object.entries(blob as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim().length > 0) out[k] = v;
  }
  return out;
}

export async function getAllOverrides(): Promise<OverrideMap> {
  return readRaw();
}

export async function getOverride(id: string): Promise<string | null> {
  const all = await readRaw();
  return all[id] ?? null;
}

export async function setOverride(
  id: string,
  value: string | null
): Promise<OverrideMap> {
  const current = await readRaw();
  const next = { ...current };
  const trimmed = typeof value === "string" ? value.trim() : null;
  if (!trimmed) {
    delete next[id];
  } else {
    next[id] = value as string;
  }
  await prisma.portalSettings.upsert({
    where: { id: "global" },
    create: { id: "global", pageTextOverrides: next },
    update: { pageTextOverrides: next },
  });
  return next;
}
