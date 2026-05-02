import { prisma } from "@/lib/prisma";

export type PlanId = "free" | "pro" | "enterprise";

export interface PlanConfig {
  id: PlanId;
  name: string;
  priceMonthly: number; // cents
  priceDisplay: string;
  features: string[];
  limits: {
    calculatorEntries: number; // per month
    bulkUploadEntries: number; // per upload
    dossiers: number; // active dossiers
    pdfExports: number; // per month
    aiChats: number; // per day
    knowledgeSearch: boolean;
    apiAccess: boolean;
    whiteLabel: boolean;
    prioritySupport: boolean;
  };
}

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    priceDisplay: "Free",
    features: [
      "IEEPA Tariff Calculator",
      "CAPE CSV Generation",
      "Pre-Submission Audit",
      "Up to 10 entries per calculation",
      "1 active dossier",
      "3 PDF exports per month",
      "Community support",
    ],
    limits: {
      calculatorEntries: 10,
      bulkUploadEntries: 10,
      dossiers: 1,
      pdfExports: 3,
      aiChats: 5,
      knowledgeSearch: false,
      apiAccess: false,
      whiteLabel: false,
      prioritySupport: false,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 14900, // $149.00
    priceDisplay: "$149/mo",
    features: [
      "Everything in Free",
      "Unlimited calculator entries",
      "Bulk CSV upload (500 entries)",
      "Unlimited dossiers",
      "Unlimited PDF exports",
      "AI Knowledge Base search",
      "Priority email support",
      "Client summary PDF branding",
      "Advanced audit analytics",
      "Deadline monitoring alerts",
    ],
    limits: {
      calculatorEntries: 999999,
      bulkUploadEntries: 500,
      dossiers: 999999,
      pdfExports: 999999,
      aiChats: 50,
      knowledgeSearch: true,
      apiAccess: false,
      whiteLabel: false,
      prioritySupport: true,
    },
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    priceMonthly: 0, // custom pricing
    priceDisplay: "Custom",
    features: [
      "Everything in Pro",
      "API access for TMS integration",
      "White-label PDF branding",
      "Dedicated account manager",
      "Custom commission structure",
      "Bulk import automation",
      "SLA-backed support",
    ],
    limits: {
      calculatorEntries: 999999,
      bulkUploadEntries: 9999,
      dossiers: 999999,
      pdfExports: 999999,
      aiChats: 999999,
      knowledgeSearch: true,
      apiAccess: true,
      whiteLabel: true,
      prioritySupport: true,
    },
  },
};

export async function getPartnerPlan(partnerCode: string): Promise<PlanConfig> {
  const sub = await prisma.subscription.findUnique({ where: { partnerCode } });
  if (!sub || sub.status === "canceled") return PLANS.free;
  if (sub.plan === "enterprise") return PLANS.enterprise;
  if (sub.plan === "pro" && (sub.status === "active" || sub.status === "trialing")) return PLANS.pro;
  return PLANS.free;
}

export async function getPartnerSubscription(partnerCode: string) {
  return prisma.subscription.findUnique({ where: { partnerCode } });
}

export async function checkFeatureAccess(
  partnerCode: string,
  feature: keyof PlanConfig["limits"],
): Promise<{ allowed: boolean; plan: PlanConfig; currentPlan: PlanId }> {
  const plan = await getPartnerPlan(partnerCode);
  const value = plan.limits[feature];
  const allowed = typeof value === "boolean" ? value : value > 0;
  return { allowed, plan, currentPlan: plan.id };
}

export async function checkUsageLimit(
  partnerCode: string,
  feature: "calculatorEntries" | "pdfExports" | "dossiers",
): Promise<{ allowed: boolean; used: number; limit: number; plan: PlanConfig }> {
  const plan = await getPartnerPlan(partnerCode);
  const limit = plan.limits[feature] as number;

  let used = 0;
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  switch (feature) {
    case "dossiers":
      used = await prisma.tariffDossier.count({
        where: { partner: { partnerCode }, status: { not: "converted" } },
      });
      break;
    case "pdfExports":
      // Track via audit log or just allow unlimited for now
      used = 0;
      break;
    case "calculatorEntries":
      used = 0; // Track client-side
      break;
  }

  return { allowed: used < limit, used, limit, plan };
}

export async function createSubscription(
  partnerCode: string,
  plan: PlanId,
  gatewayData?: {
    gatewayId?: string;
    gatewayCustomerId?: string;
    cardLast4?: string;
    cardBrand?: string;
  },
) {
  const planConfig = PLANS[plan];
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  return prisma.subscription.upsert({
    where: { partnerCode },
    update: {
      plan,
      status: "active",
      priceMonthly: planConfig.priceMonthly,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      canceledAt: null,
      cancelReason: null,
      ...(gatewayData || {}),
    },
    create: {
      partnerCode,
      plan,
      status: "active",
      priceMonthly: planConfig.priceMonthly,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      ...(gatewayData || {}),
    },
  });
}

export async function cancelSubscription(partnerCode: string, reason?: string) {
  return prisma.subscription.update({
    where: { partnerCode },
    data: {
      status: "canceled",
      canceledAt: new Date(),
      cancelReason: reason || "User requested",
    },
  });
}

// ─── Portal-level tier (admin features like AI Governance) ────────────────

export type PortalTier = "free" | "pro" | "enterprise";

/** Gated portal features — maps feature key to required minimum tier */
export const PORTAL_FEATURE_TIERS: Record<string, PortalTier> = {
  ai_governance: "enterprise",
};

/**
 * Read the portal-level subscription tier from PortalSettings.
 * Falls back to "free" if the row is missing or the field is unset.
 * During development (no row), returns "enterprise" to avoid locking
 * out admins — controlled by the FALLBACK comment below.
 */
export async function getPortalTier(): Promise<PortalTier> {
  const settings = await prisma.portalSettings.findUnique({
    where: { id: "global" },
    select: { subscriptionTier: true },
  });
  if (!settings) return "enterprise"; // FALLBACK: don't lock out during dev
  const tier = settings.subscriptionTier as PortalTier;
  if (!["free", "pro", "enterprise"].includes(tier)) return "free";
  return tier;
}

const TIER_RANK: Record<PortalTier, number> = { free: 0, pro: 1, enterprise: 2 };

/**
 * Check whether the portal's current tier meets the minimum for a feature.
 */
export async function checkPortalFeature(
  feature: string,
): Promise<{ allowed: boolean; currentTier: PortalTier; requiredTier: PortalTier }> {
  const required = PORTAL_FEATURE_TIERS[feature] ?? "free";
  const current = await getPortalTier();
  return {
    allowed: TIER_RANK[current] >= TIER_RANK[required],
    currentTier: current,
    requiredTier: required,
  };
}
