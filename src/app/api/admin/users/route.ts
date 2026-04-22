import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashSync } from "bcryptjs";
import { isStarSuperAdminEmail } from "@/lib/starSuperAdmin";

/**
 * GET /api/admin/users
 * Returns all admin users. Super admin only.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "super_admin")
    return NextResponse.json({ error: "Only super admins can manage users" }, { status: 403 });

  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ users });
  } catch {
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

/**
 * POST /api/admin/users
 *
 * Actions:
 *   create          — super_admin
 *   delete          — super_admin (plus self-delete + last-super-admin guards)
 *   update_profile  — ⭐ star super admin only (edit name/email)
 *   update_role     — ⭐ star super admin only
 *   reset_password  — ⭐ star super admin only
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "super_admin")
    return NextResponse.json({ error: "Only super admins can manage users" }, { status: 403 });

  const sessionEmail = session.user.email || "";
  const isStar = isStarSuperAdminEmail(sessionEmail);

  // Helper used by every star-gated action so the error message is consistent.
  const starOnly = () =>
    NextResponse.json(
      { error: "Only the star super admin (admin@fintella.partners) can perform this action" },
      { status: 403 }
    );

  try {
    const body = await req.json();

    // Create new user — any super_admin.
    if (body.action === "create") {
      const { email, name, password, userRole } = body;
      if (!email || !password || !userRole) {
        return NextResponse.json({ error: "Email, password, and role are required" }, { status: 400 });
      }
      if (password.length < 6) {
        return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
      }
      const allowedRoles = isStar
        ? ["super_admin", "admin", "accounting", "partner_support"]
        : ["admin", "accounting", "partner_support"];
      if (!allowedRoles.includes(userRole)) {
        return NextResponse.json(
          { error: isStar ? "Invalid role" : "Only the star super admin can assign super_admin role" },
          { status: 400 }
        );
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return NextResponse.json({ error: "A user with this email already exists" }, { status: 400 });
      }

      const user = await prisma.user.create({
        data: {
          email: email.trim().toLowerCase(),
          name: name?.trim() || null,
          passwordHash: hashSync(password, 10),
          role: userRole,
        },
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      });

      return NextResponse.json({ user }, { status: 201 });
    }

    // Update profile (name + email) — ⭐ STAR ONLY.
    if (body.action === "update_profile") {
      if (!isStar) return starOnly();
      const { userId, name, email } = body;
      if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

      const data: { name?: string | null; email?: string } = {};
      if (typeof name === "string") data.name = name.trim() || null;
      if (typeof email === "string" && email.trim()) {
        const normalized = email.trim().toLowerCase();
        // Reject collisions with an existing row OTHER than this user.
        const existing = await prisma.user.findUnique({ where: { email: normalized } });
        if (existing && existing.id !== userId) {
          return NextResponse.json({ error: "A user with this email already exists" }, { status: 400 });
        }
        data.email = normalized;
      }
      if (Object.keys(data).length === 0) {
        return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data,
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      });
      return NextResponse.json({ user });
    }

    // Update user role — ⭐ STAR ONLY.
    if (body.action === "update_role") {
      if (!isStar) return starOnly();
      const { userId, userRole } = body;
      if (!userId || !userRole) {
        return NextResponse.json({ error: "userId and userRole are required" }, { status: 400 });
      }

      // Prevent changing own role — star super admin can still do everything
      // else to their own account, but flipping their own role out of
      // super_admin would lock them out of this route entirely.
      const currentUser = await prisma.user.findUnique({ where: { email: sessionEmail } });
      if (currentUser?.id === userId) {
        return NextResponse.json({ error: "You cannot change your own role" }, { status: 400 });
      }

      const allowed = ["super_admin", "admin", "accounting", "partner_support"];
      if (!allowed.includes(userRole)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: { role: userRole },
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      });

      return NextResponse.json({ user });
    }

    // Reset password — ⭐ STAR ONLY.
    if (body.action === "reset_password") {
      if (!isStar) return starOnly();
      const { userId, password } = body;
      if (!userId || !password || password.length < 6) {
        return NextResponse.json({ error: "userId and password (min 6 chars) required" }, { status: 400 });
      }

      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: hashSync(password, 10) },
      });

      return NextResponse.json({ success: true });
    }

    // Delete user — any super_admin (unchanged, kept for cleaning up orphans).
    if (body.action === "delete") {
      const { userId } = body;
      if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

      const currentUser = await prisma.user.findUnique({ where: { email: sessionEmail } });
      if (currentUser?.id === userId) {
        return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
      }

      // Last-super-admin guard.
      const target = await prisma.user.findUnique({ where: { id: userId } });
      if (target?.role === "super_admin") {
        const superAdminCount = await prisma.user.count({ where: { role: "super_admin" } });
        if (superAdminCount <= 1) {
          return NextResponse.json(
            {
              error:
                "Cannot delete the last remaining super admin. Promote another user to super_admin first.",
            },
            { status: 400 }
          );
        }
      }

      await prisma.user.delete({ where: { id: userId } });
      return NextResponse.json({ deleted: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    console.error("Admin users error:", e);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
