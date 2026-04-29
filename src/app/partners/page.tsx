import type { Metadata } from "next";
import PartnersPageRenderer from "@/components/landing/PartnersPageRenderer";
import { getPartnersContent } from "@/lib/getLandingContent";

export const metadata: Metadata = {
  title: "Become a Partner — Earn Commissions on Tariff Refund Referrals | Fintella",
  description: "Customs brokers and trade professionals: earn legal referral commissions on every IEEPA tariff recovery. Arizona-licensed counsel pays you directly. No cost to join.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Earn Commissions on Tariff Refund Referrals — Fintella Partner Program",
    description: "$166B in IEEPA refunds available. Your clients are owed money. Refer them through Fintella and earn on every recovery.",
    type: "website",
  },
};

export const dynamic = "force-dynamic";

export default async function PartnersPage() {
  const c = await getPartnersContent();
  return <PartnersPageRenderer c={c} />;
}
