import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import SessionProvider from "@/components/layout/SessionProvider";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
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
  // Allow pinch-zoom for accessibility (WCAG 2.1 SC 1.4.4).
  // maximumScale + userScalable:false are intentionally omitted.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#080d1c" },
  ],
  // viewport-fit:cover lets us extend behind iPhone notch / home indicator;
  // fixed elements opt in to env(safe-area-inset-*) padding individually.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/* Anti-flash: set data-theme before first paint so there's no flicker */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme',t||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));var p=localStorage.getItem('portalTheme');if(p&&p!=='default'){document.documentElement.setAttribute('data-portal-theme',p);}}catch(e){}` }} />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <SessionProvider>{children}</SessionProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
