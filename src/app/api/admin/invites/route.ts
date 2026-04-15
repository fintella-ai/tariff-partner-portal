import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendL1InviteEmail } from "@/lib/sendgrid";
import { ALLOWED_L1_RATES } from "@/lib/constants";
import crypto from "crypto";

const PORTAL_URL =
  process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://fintella.partners";

function generateToken(): string {
  return crypto.randomBytes(9).toString("base64url"); // 12 chars, URL-safe
}

/**
 * GET /api/admin/invites
 * List all admin-generated L1 partner invites.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const invites = await prisma.recruitmentInvite.findMany({
      where: { targetTier: "l1" },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ invites });
  } catch {
    return NextResponse.json({ error: "Failed to fetch invites" }, { status: 500 });
  }
}

/**
 * POST /api/admin/invites
 * Create an L1 partner invite and send the invite email.
 * Body: { email: string, firstName?: string, lastName?: string }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const email = body.email?.trim();
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

    const commissionRate = body.commissionRate != null ? parseFloat(body.commissionRate) : null;
    if (commissionRate == null || isNaN(commissionRate)) {
      return NextResponse.json({ error: "Commission rate is required" }, { status: 400 });
    }
    if (!ALLOWED_L1_RATES.some((r) => Math.abs(r - commissionRate) < 0.001)) {
      return NextResponse.json({
        error: `Invalid rate. Allowed L1 rates: ${ALLOWED_L1_RATES.map((r) => `${Math.round(r * 100)}%`).join(", ")}`,
      }, { status: 400 });
    }

    // Guard: don't invite someone who is already a partner
    const existing = await prisma.partner.findFirst({ where: { email } });
    if (existing)
      return NextResponse.json({ error: "This email already has a partner account" }, { status: 400 });

    const invitedName =
      [body.firstName?.trim(), body.lastName?.trim()].filter(Boolean).join(" ") || null;

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite = await prisma.recruitmentInvite.create({
      data: {
        token,
        inviterCode: null,     // admin-generated — no partner inviter
        targetTier: "l1",
        commissionRate,
        invitedEmail: email,
        invitedName,
        status: "active",
        expiresAt,
      },
    });

    const signupUrl = `${PORTAL_URL}/getstarted?token=${token}`;

    // Await the email so Vercel doesn't kill the function before the SendGrid
    // request completes. Email failure is still non-fatal — errors are swallowed
    // and written to EmailLog by sendL1InviteEmail internally.
    await sendL1InviteEmail({ toEmail: email, toName: invitedName, signupUrl }).catch(() => {});

    return NextResponse.json({ invite, signupUrl }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }
}
