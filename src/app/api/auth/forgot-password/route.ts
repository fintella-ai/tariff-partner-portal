import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/sendgrid";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

const PORTAL_URL =
  process.env.PORTAL_URL?.replace(/\/+$/, "") ||
  process.env.NEXT_PUBLIC_PORTAL_URL?.replace(/\/+$/, "") ||
  "https://fintella.partners";

/**
 * POST /api/auth/forgot-password
 * Body: { email: string }
 *
 * Always returns 200 with a generic message, regardless of whether the email
 * matches a partner or admin row. This prevents account enumeration.
 * The token email is sent in the background for real matches only.
 */
export async function POST(req: NextRequest) {
  let email: string;
  try {
    const body = await req.json();
    email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Structural email check — avoid regex backtracking risk.
  const atIdx = email.indexOf("@");
  const dotIdx = email.lastIndexOf(".");
  if (!email || email.length > 254 || atIdx < 1 || dotIdx < atIdx + 2 || dotIdx >= email.length - 1) {
    return NextResponse.json({ ok: true });
  }

  // Look up partner first, then admin. Partners take precedence since partner
  // accounts vastly outnumber admin accounts in the steady state.
  const partner = await prisma.partner
    .findFirst({ where: { email }, select: { email: true, firstName: true, lastName: true, status: true } })
    .catch(() => null);

  let role: "partner" | "admin" | null = null;
  let displayEmail = email;
  let displayName: string | null = null;

  if (partner && partner.status !== "blocked") {
    role = "partner";
    displayEmail = partner.email;
    displayName = `${partner.firstName} ${partner.lastName}`.trim() || null;
  } else {
    const admin = await prisma.user
      .findUnique({ where: { email }, select: { email: true, name: true } })
      .catch(() => null);
    if (admin) {
      role = "admin";
      displayEmail = admin.email;
      displayName = admin.name;
    }
  }

  if (!role) {
    // Anti-enumeration — pretend success even when no account matched.
    return NextResponse.json({ ok: true });
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.passwordResetToken
    .create({ data: { token, email: displayEmail, role, expiresAt } })
    .catch((err) => {
      console.error("[forgot-password] token create failed:", err);
    });

  const resetUrl = `${PORTAL_URL}/reset-password?token=${token}`;

  // Fire-and-forget the email — failures shouldn't leak via response timing.
  sendPasswordResetEmail({
    email: displayEmail,
    name: displayName,
    resetUrl,
    role,
  }).catch((err) => {
    console.error("[forgot-password] email send failed:", err);
  });

  return NextResponse.json({ ok: true });
}
