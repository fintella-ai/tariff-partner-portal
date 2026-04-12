import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

/**
 * POST /api/admin/impersonate
 * Admin generates a one-time impersonation token for a partner.
 * Returns a URL that opens the partner portal as that partner.
 * Token stored in DB so it works across serverless function instances.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { partnerCode } = body;

    if (!partnerCode) return NextResponse.json({ error: "Partner code is required" }, { status: 400 });

    const partner = await prisma.partner.findUnique({ where: { partnerCode } });
    if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

    // Clean up old expired tokens
    await prisma.impersonationToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    }).catch(() => {});

    // Generate a single-use token (expires in 15 minutes)
    const token = crypto.randomBytes(32).toString("hex");
    await prisma.impersonationToken.create({
      data: {
        token,
        partnerCode: partner.partnerCode,
        email: partner.email,
        name: `${partner.firstName} ${partner.lastName}`,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL || "https://trln.partners";

    return NextResponse.json({
      url: `${baseUrl}/impersonate?token=${token}`,
      expiresIn: 900,
    });
  } catch {
    return NextResponse.json({ error: "Failed to create impersonation token" }, { status: 500 });
  }
}

/**
 * GET /api/admin/impersonate?token=XXX
 * Validates and consumes an impersonation token.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

  try {
    const record = await prisma.impersonationToken.findUnique({ where: { token } });

    if (!record) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    if (record.used) {
      return NextResponse.json({ error: "Token has already been used" }, { status: 401 });
    }

    if (new Date() > record.expiresAt) {
      await prisma.impersonationToken.delete({ where: { token } }).catch(() => {});
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }

    // Mark as used (single use)
    await prisma.impersonationToken.update({
      where: { token },
      data: { used: true },
    });

    return NextResponse.json({
      partnerCode: record.partnerCode,
      email: record.email,
      name: record.name,
    });
  } catch {
    return NextResponse.json({ error: "Failed to validate token" }, { status: 500 });
  }
}
