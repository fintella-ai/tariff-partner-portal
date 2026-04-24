/**
 * Level 3 Edit Layout — Phase D storage for star-admin-authored custom
 * sections.
 *
 * Sibling of page-text-overrides.ts / page-section-overrides.ts. The
 * blob on PortalSettings.pageCustomSections is a page-keyed map whose
 * value is an ordered array of descriptors:
 *
 *   { "<pageId>": [{ id, type, order, data }, ...] }
 *
 * `type` is a key in the client-side section-type registry; this lib
 * never looks at it beyond passing it through. `data` is arbitrary JSON
 * whose shape is the registry's contract. `order` is the same integer
 * scheme as page-section-overrides so built-in + custom sections can
 * interleave in the parent page's render.
 *
 * Writes are star-super-admin gated at the API layer. This file is a
 * thin DB wrapper.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import crypto from "crypto";

export type CustomSection = {
  id: string;
  type: string;
  order: number;
  data: Record<string, unknown>;
};

type PageMap = Record<string, CustomSection[]>;

function normalizeSection(raw: unknown): CustomSection | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" && r.id.length > 0 ? r.id : null;
  const type = typeof r.type === "string" && r.type.length > 0 ? r.type : null;
  const order = typeof r.order === "number" && Number.isFinite(r.order) ? Math.trunc(r.order) : null;
  const data = r.data && typeof r.data === "object" && !Array.isArray(r.data)
    ? (r.data as Record<string, unknown>)
    : {};
  if (!id || !type || order === null) return null;
  return { id, type, order, data };
}

async function readRaw(): Promise<PageMap> {
  const settings = await prisma.portalSettings.findUnique({
    where: { id: "global" },
    select: { pageCustomSections: true },
  });
  const blob = settings?.pageCustomSections;
  if (!blob || typeof blob !== "object" || Array.isArray(blob)) return {};
  const out: PageMap = {};
  for (const [pageId, list] of Object.entries(blob as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const normalized = list
      .map(normalizeSection)
      .filter((s): s is CustomSection => s !== null);
    if (normalized.length) out[pageId] = normalized;
  }
  return out;
}

async function writeRaw(next: PageMap): Promise<PageMap> {
  const blob = next as unknown as Prisma.InputJsonValue;
  await prisma.portalSettings.upsert({
    where: { id: "global" },
    create: { id: "global", pageCustomSections: blob },
    update: { pageCustomSections: blob },
  });
  return next;
}

export async function getAllCustomSections(): Promise<PageMap> {
  return readRaw();
}

export async function addCustomSection(
  pageId: string,
  type: string,
  data: Record<string, unknown>,
  explicitOrder?: number
): Promise<PageMap> {
  const current = await readRaw();
  const list = current[pageId] ? [...current[pageId]] : [];
  const maxOrder = list.reduce((m, s) => (s.order > m ? s.order : m), -1);
  const order = typeof explicitOrder === "number" && Number.isFinite(explicitOrder)
    ? Math.trunc(explicitOrder)
    : maxOrder + 1;
  const id = `custom_${crypto.randomBytes(6).toString("hex")}`;
  list.push({ id, type, order, data });
  return writeRaw({ ...current, [pageId]: list });
}

export async function updateCustomSection(
  pageId: string,
  id: string,
  patch: Partial<Pick<CustomSection, "order" | "data">>
): Promise<PageMap> {
  const current = await readRaw();
  const list = current[pageId];
  if (!list) return current;
  const next = list.map((s) => {
    if (s.id !== id) return s;
    const merged = { ...s };
    if (typeof patch.order === "number" && Number.isFinite(patch.order)) {
      merged.order = Math.trunc(patch.order);
    }
    if (patch.data && typeof patch.data === "object" && !Array.isArray(patch.data)) {
      merged.data = { ...patch.data };
    }
    return merged;
  });
  return writeRaw({ ...current, [pageId]: next });
}

export async function removeCustomSection(
  pageId: string,
  id: string
): Promise<PageMap> {
  const current = await readRaw();
  const list = current[pageId];
  if (!list) return current;
  const next = list.filter((s) => s.id !== id);
  const copy = { ...current };
  if (next.length === 0) delete copy[pageId];
  else copy[pageId] = next;
  return writeRaw(copy);
}
