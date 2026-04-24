import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up — Fintella Partner Portal",
  description: "Create your Fintella partner account. Sign up with your invitation link to start earning commissions on tariff recovery referrals.",
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
