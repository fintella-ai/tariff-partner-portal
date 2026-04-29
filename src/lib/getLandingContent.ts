import { prisma } from "@/lib/prisma";
import {
  DEFAULT_RECOVER, DEFAULT_PARTNERS, DEFAULT_BROKERS,
  parsePageContent,
  type RecoverPageContent, type PartnersPageContent,
} from "@/lib/landingPageSchemas";

export async function getRecoverContent(): Promise<RecoverPageContent> {
  try {
    const row = await prisma.landingPageConfig.findUnique({ where: { slug: "recover" } });
    if (row?.published && row.published !== "{}") {
      return parsePageContent(row.published, DEFAULT_RECOVER);
    }
  } catch {}
  return DEFAULT_RECOVER;
}

export async function getPartnersContent(): Promise<PartnersPageContent> {
  try {
    const row = await prisma.landingPageConfig.findUnique({ where: { slug: "partners" } });
    if (row?.published && row.published !== "{}") {
      return parsePageContent(row.published, DEFAULT_PARTNERS);
    }
  } catch {}
  return DEFAULT_PARTNERS;
}

export async function getBrokersContent(): Promise<PartnersPageContent> {
  try {
    const row = await prisma.landingPageConfig.findUnique({ where: { slug: "brokers" } });
    if (row?.published && row.published !== "{}") {
      return parsePageContent(row.published, DEFAULT_BROKERS);
    }
  } catch {}
  return DEFAULT_BROKERS;
}
