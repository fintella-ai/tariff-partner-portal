import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/reset-password?token=XXX
 * Check a token's validity without consuming it so the page can show
 * "this link has expired" before the user types a new password.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ valid: false, reason: "missing_token" }, { status: 400 });

  const row = await prisma.passwordResetToken.findUnique({ where: { token } }).catch(() => null);
  if (!row) return NextResponse.json({ valid: false, reason: "not_found" }, { status: 404 });
  if (row.usedAt) return NextResponse.json({ valid: false, reason: "used" }, { status: 410 });
  if (row.expiresAt < new Date()) return NextResponse.json({ valid: false, reason: "expired" }, { status: 410 });

  return NextResponse.json({ valid: true, email: row.email, role: row.role });
}

/**
 * POST /api/auth/reset-password
 * Body: { token: string, password: string }
 * Validates the token, rehashes the password, and updates the owning row
 * (Partner or User). Deletes the token after use.
 */
export async function POST(req: NextRequest) {
  let token: string;
  let password: string;
  try {
    const body = await req.json();
    token = typeof body?.token === "string" ? body.token : "";
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const row = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!row) return NextResponse.json({ error: "This link is invalid." }, { status: 404 });
  if (row.usedAt) return NextResponse.json({ error: "This link has already been used." }, { status: 410 });
  if (row.expiresAt < new Date()) {
    return NextResponse.json({ error: "This link has expired. Please request a new one." }, { status: 410 });
  }

  const passwordHash = await hash(password, 10);

  if (row.role === "partner") {
    const partner = await prisma.partner.findFirst({ where: { email: row.email } });
    if (!partner) return NextResponse.json({ error: "Account no longer exists." }, { status: 404 });
    await prisma.partner.update({ where: { id: partner.id }, data: { passwordHash } });
  } else if (row.role === "admin") {
    const user = await prisma.user.findUnique({ where: { email: row.email } });
    if (!user) return NextResponse.json({ error: "Account no longer exists." }, { status: 404 });
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  } else {
    return NextResponse.json({ error: "Invalid token role." }, { status: 400 });
  }

  await prisma.passwordResetToken.update({
    where: { token },
    data: { usedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
