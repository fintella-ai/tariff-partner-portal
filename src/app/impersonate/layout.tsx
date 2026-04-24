import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Partner View — Fintella Admin",
  description: "Admin impersonation access to partner portal.",
  robots: { index: false, follow: false },
};

export default function ImpersonateLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
