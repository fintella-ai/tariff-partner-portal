import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { compare, hashSync } from "bcryptjs";

/**
 * GET /api/admin/account
 * Returns the current admin's account info.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email || "" },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Failed to fetch account" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/account
 * Update admin name, email, and/or password.
 */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, email, currentPassword, newPassword } = body;

    const user = await prisma.user.findUnique({
      where: { email: session.user.email || "" },
    });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const data: Record<string, any> = {};

    // Update name
    if (name !== undefined) data.name = name;

    // Update email
    if (email !== undefined && email !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 400 });
      data.email = email;
    }

    // Change password
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json({ error: "Current password is required to set a new one" }, { status: 400 });
      }

      const valid = await compare(currentPassword, user.passwordHash);
      if (!valid) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
      }

      if (newPassword.length < 6) {
        return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
      }

      data.passwordHash = hashSync(newPassword, 10);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ message: "No changes" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data,
    });

    return NextResponse.json({
      success: true,
      message: newPassword ? "Password updated successfully" : "Account updated successfully",
    });
  } catch {
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }
}
