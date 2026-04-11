import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

// In-memory store for impersonation tokens (short-lived, single-use)
// In production, use Redis or a DB table. For this portal's scale, in-memory is fine.
const impersonationTokens = new Map<string, { partnerCode: string; email: string; name: string; expiresAt: number }>();

// Clean up expired tokens periodically
function cleanExpired() {
  const now = Date.now();
  const expired: string[] = [];
  impersonationTokens.forEach((data, token) => {
    if (data.expiresAt < now) expired.push(token);
  });
  expired.forEach((t) => impersonationTokens.delete(t));
}

/**
 * POST /api/admin/impersonate
 * Admin generates a one-time impersonation token for a partner.
 * Returns a URL that opens the partner portal as that partner.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { partnerCode } = body;

    if (!partnerCode) return NextResponse.json({ error: "Partner code is required" }, { status: 400 });

    const partner = await prisma.partner.findUnique({ where: { partnerCode } });
    if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

    cleanExpired();

    // Generate a single-use token (expires in 60 seconds)
    const token = crypto.randomBytes(32).toString("hex");
    impersonationTokens.set(token, {
      partnerCode: partner.partnerCode,
      email: partner.email,
      name: `${partner.firstName} ${partner.lastName}`,
      expiresAt: Date.now() + 60 * 1000, // 60 seconds
    });

    const baseUrl = process.env.NEXTAUTH_URL || "https://trln.partners";

    return NextResponse.json({
      url: `${baseUrl}/impersonate?token=${token}`,
      expiresIn: 60,
    });
  } catch {
    return NextResponse.json({ error: "Failed to create impersonation token" }, { status: 500 });
  }
}

/**
 * GET /api/admin/impersonate?token=XXX
 * Validates an impersonation token. Used by the impersonate page to get partner info.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

  cleanExpired();

  const data = impersonationTokens.get(token);
  if (!data) return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  if (data.expiresAt < Date.now()) {
    impersonationTokens.delete(token);
    return NextResponse.json({ error: "Token expired" }, { status: 401 });
  }

  // Consume the token (single use)
  impersonationTokens.delete(token);

  return NextResponse.json({
    partnerCode: data.partnerCode,
    email: data.email,
    name: data.name,
  });
}
