import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/manifest
 * Dynamic Web App Manifest served from PortalSettings.
 */
export async function GET() {
  try {
    const settings = await prisma.portalSettings.findUnique({
      where: { id: "global" },
      select: { firmName: true, firmShort: true, firmSlogan: true },
    });

    const manifest = {
      name: settings?.firmName || "Financial Intelligence Network",
      short_name: settings?.firmShort || "Fintella",
      description: settings?.firmSlogan || "Fighting for what's owed, reclaiming what's fair.",
      start_url: "/dashboard/home",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#060a18",
      theme_color: "#c4a050",
      id: "/",
      icons: [
        { src: "/api/icon?size=180", sizes: "180x180", type: "image/png", purpose: "any" },
        { src: "/api/icon?size=192", sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: "/api/icon?size=512", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    };

    return new NextResponse(JSON.stringify(manifest), {
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch {
    return new NextResponse("{}", {
      status: 500,
      headers: { "Content-Type": "application/manifest+json" },
    });
  }
}
