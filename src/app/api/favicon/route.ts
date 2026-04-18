import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/favicon
 * Serves the favicon from PortalSettings as an image.
 * Falls back to a default if none uploaded.
 */
export async function GET() {
  try {
    const settings = await prisma.portalSettings.findUnique({
      where: { id: "global" },
      select: { faviconUrl: true },
    });

    if (settings?.faviconUrl && settings.faviconUrl.startsWith("data:")) {
      // Parse data URL: data:image/png;base64,xxxxx
      const match = settings.faviconUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (match) {
        const contentType = match[1];
        const buffer = Buffer.from(match[2], "base64");
        return new NextResponse(buffer, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
          },
        });
      }
    }

    // Return a simple default SVG favicon with the gold brand color
    const defaultSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#c4a050"/><text x="16" y="22" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="bold" fill="#fff">F</text></svg>`;
    return new NextResponse(defaultSvg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch {
    // Absolute fallback
    return new NextResponse("", { status: 404 });
  }
}
