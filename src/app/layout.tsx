import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import SessionProvider from "@/components/layout/SessionProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fintella — Financial Intelligence Network Partner Portal",
  description: "Fighting for what's owed, reclaiming what's fair.",
  manifest: "/api/manifest",
  icons: {
    icon: "/api/favicon",
    shortcut: "/api/favicon",
    apple: "/api/icon?size=180",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Fintella",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "application-name": "Fintella",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#c4a050",
  viewportFit: "cover",
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
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
