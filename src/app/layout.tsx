import type { Metadata } from "next";
import SessionProvider from "@/components/layout/SessionProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tax Refund, Recovery, & Litigation Network — Partner Portal",
  description: "Fighting for what's owed, reclaiming what's fair.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
