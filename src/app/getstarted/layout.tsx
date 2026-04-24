import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get Started — Fintella Partner Portal",
  description: "Complete your partner registration and sign your partnership agreement to start earning with Fintella.",
};

export default function GetStartedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
