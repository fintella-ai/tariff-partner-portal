import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Log In — Fintella Partner Portal",
  description: "Sign in to your Fintella partner portal to track deals, commissions, and manage your referral network.",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
