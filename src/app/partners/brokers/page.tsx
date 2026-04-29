import type { Metadata } from "next";
import PartnersPageRenderer from "@/components/landing/PartnersPageRenderer";
import { getBrokersContent } from "@/lib/getLandingContent";

export const metadata: Metadata = {
  title: "Customs Broker Partner Program — Earn on IEEPA Tariff Recoveries | Fintella",
  description: "Licensed customs brokers: earn legal referral commissions when your importer clients recover IEEPA tariff refunds. Arizona-licensed counsel pays you directly.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Customs Broker Partner Program — Fintella",
    description: "Your importer clients are owed IEEPA tariff refunds. Earn commissions on every recovery through Fintella's licensed referral program.",
    type: "website",
  },
};

export const dynamic = "force-dynamic";

export default async function BrokersPage() {
  const c = await getBrokersContent();
  return <PartnersPageRenderer c={c} />;
}
