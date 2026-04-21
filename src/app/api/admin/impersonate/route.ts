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

  // Impersonation is a privilege-escalation surface — restrict to the two
  // most-privileged roles only. accounting + partner_support must not be
  // able to assume a partner's identity, even briefly.
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) {
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

    // Generate a single-use token. Expiry is deliberately tight (60s) per
    // CLAUDE.md — admin clicks "View as Partner", the new tab opens the
    // token URL immediately, and the token is consumed on first read. A
    // longer window just widens the attack surface if the token leaks.
    const TOKEN_TTL_SECONDS = 60;
    const token = crypto.randomBytes(32).toString("hex");
    await prisma.impersonationToken.create({
      data: {
        token,
        partnerCode: partner.partnerCode,
        email: partner.email,
        name: `${partner.firstName} ${partner.lastName}`,
        expiresAt: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000),
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL || "https://fintella.partners";

    return NextResponse.json({
      url: `${baseUrl}/impersonate?token=${token}`,
      expiresIn: TOKEN_TTL_SECONDS,
    });
  } catch {
    return NextResponse.json({ error: "Failed to create impersonation token" }, { status: 500 });
  }
}

// The token is now consumed directly by the `impersonate-login` NextAuth
// provider in src/lib/auth.ts — no separate GET validation endpoint is
// needed. Consolidating prevents the token from being burned by two paths
// (the old flow used to GET-validate first, then sign in; if the sign-in
// failed the token was already consumed).
