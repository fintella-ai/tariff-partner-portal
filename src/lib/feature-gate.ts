import { getPartnerPlan, type PlanId } from "@/lib/subscription";

export type GatedFeature =
  | "bulk_upload"
  | "unlimited_entries"
  | "unlimited_dossiers"
  | "unlimited_pdf"
  | "knowledge_search"
  | "api_access"
  | "white_label"
  | "priority_support"
  | "advanced_analytics"
  | "deadline_alerts";

const PRO_FEATURES: GatedFeature[] = [
  "bulk_upload",
  "unlimited_entries",
  "unlimited_dossiers",
  "unlimited_pdf",
  "knowledge_search",
  "priority_support",
  "advanced_analytics",
  "deadline_alerts",
];

const ENTERPRISE_ONLY: GatedFeature[] = ["api_access", "white_label"];
const ALL_PAID: GatedFeature[] = [...PRO_FEATURES, ...ENTERPRISE_ONLY];

export function isPlanFeature(feature: GatedFeature, plan: PlanId): boolean {
  if (plan === "enterprise") return true;
  if (plan === "pro") return PRO_FEATURES.includes(feature) || !ENTERPRISE_ONLY.includes(feature);
  return !PRO_FEATURES.includes(feature) && !ENTERPRISE_ONLY.includes(feature);
}

export async function checkGate(
  partnerCode: string,
  feature: GatedFeature,
): Promise<{ allowed: boolean; currentPlan: PlanId; requiredPlan: PlanId }> {
  const plan = await getPartnerPlan(partnerCode);
  const allowed = isPlanFeature(feature, plan.id);
  const requiredPlan: PlanId = ENTERPRISE_ONLY.includes(feature)
    ? "enterprise"
    : PRO_FEATURES.includes(feature) ? "pro" : "free";

  return { allowed, currentPlan: plan.id, requiredPlan };
}

export function getUpgradeMessage(feature: GatedFeature): string {
  const messages: Record<GatedFeature, string> = {
    bulk_upload: "Bulk CSV upload is a Pro feature. Upgrade to process up to 500 entries at once.",
    unlimited_entries: "Free plan limited to 10 entries per calculation. Upgrade to Pro for unlimited.",
    unlimited_dossiers: "Free plan allows 1 active dossier. Upgrade to Pro for unlimited.",
    unlimited_pdf: "Free plan allows 3 PDF exports per month. Upgrade to Pro for unlimited.",
    knowledge_search: "AI Knowledge Base search is a Pro feature.",
    api_access: "API access requires an Enterprise plan.",
    white_label: "White-label PDF branding requires an Enterprise plan.",
    priority_support: "Priority support is available on Pro and Enterprise plans.",
    advanced_analytics: "Advanced audit analytics is a Pro feature.",
    deadline_alerts: "Deadline monitoring alerts are a Pro feature.",
  };
  return messages[feature];
}
