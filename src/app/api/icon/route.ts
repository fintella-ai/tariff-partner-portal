import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/icon?size=192
 * Serves the portal logo as a proper image file for PWA manifest icons.
 * Falls back to an SVG icon if no logo is uploaded.
 */
export async function GET(req: NextRequest) {
  const size = req.nextUrl.searchParams.get("size") || "192";

  try {
    const settings = await prisma.portalSettings.findUnique({
      where: { id: "global" },
      select: { logoUrl: true, faviconUrl: true, firmShort: true },
    });

    // Try logo first, then favicon
    const dataUrl = settings?.logoUrl || settings?.faviconUrl;

    if (dataUrl && dataUrl.startsWith("data:")) {
      const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
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

    // Fallback: gold rounded square SVG with firm initial
    const initial = (settings?.firmShort || "F").charAt(0);
    const s = parseInt(size) || 192;
    const fontSize = Math.round(s * 0.5);
    const textY = Math.round(s * 0.65);
    const rx = Math.round(s * 0.15);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}"><rect width="${s}" height="${s}" rx="${rx}" fill="#c4a050"/><text x="${s/2}" y="${textY}" text-anchor="middle" font-family="sans-serif" font-size="${fontSize}" font-weight="bold" fill="#fff">${initial}</text></svg>`;

    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch {
    return new NextResponse("", { status: 404 });
  }
}
