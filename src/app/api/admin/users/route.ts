import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashSync } from "bcryptjs";

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
 * Create or update an admin user. Super admin only.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "super_admin")
    return NextResponse.json({ error: "Only super admins can manage users" }, { status: 403 });

  try {
    const body = await req.json();

    // Create new user
    if (body.action === "create") {
      const { email, name, password, userRole } = body;
      if (!email || !password || !userRole) {
        return NextResponse.json({ error: "Email, password, and role are required" }, { status: 400 });
      }
      if (password.length < 6) {
        return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
      }
      if (!["admin", "accounting", "partner_support"].includes(userRole)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
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

    // Update user role
    if (body.action === "update_role") {
      const { userId, userRole } = body;
      if (!userId || !userRole) {
        return NextResponse.json({ error: "userId and userRole are required" }, { status: 400 });
      }

      // Prevent changing own role
      const currentUser = await prisma.user.findUnique({ where: { email: session.user.email! } });
      if (currentUser?.id === userId) {
        return NextResponse.json({ error: "You cannot change your own role" }, { status: 400 });
      }

      // Prevent creating another super_admin (only system-level)
      if (userRole === "super_admin") {
        return NextResponse.json({ error: "Cannot assign super_admin role through the portal" }, { status: 400 });
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: { role: userRole },
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      });

      return NextResponse.json({ user });
    }

    // Reset password
    if (body.action === "reset_password") {
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

    // Delete user
    if (body.action === "delete") {
      const { userId } = body;
      if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

      // Prevent deleting self — the only hard footgun guard. A super_admin
      // CAN delete another super_admin (intentional — needed to clean up
      // orphaned accounts like the legacy `admin@trln.com` row left over
      // from the pre-rebrand TRLN deployment). The endpoint is already
      // gated to `role === "super_admin"` at the top of this handler, so
      // only super admins can reach this branch in the first place.
      const currentUser = await prisma.user.findUnique({ where: { email: session.user.email! } });
      if (currentUser?.id === userId) {
        return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
      }

      // Last-super-admin guard: refuse to delete the final remaining
      // super_admin in the system. Without this, an admin could lock
      // themselves and everyone else out of the user-management surface
      // (no super_admin would mean no one can promote a replacement).
      // This is a tighter check than the self-delete guard above —
      // self-delete is blocked even when other super_admins exist; this
      // additional check blocks deletion of the LAST super_admin even
      // when the deleter is themselves a super_admin.
      const target = await prisma.user.findUnique({ where: { id: userId } });
      if (target?.role === "super_admin") {
        const superAdminCount = await prisma.user.count({
          where: { role: "super_admin" },
        });
        if (superAdminCount <= 1) {
          return NextResponse.json(
            {
              error:
                "Cannot delete the last remaining super admin. Promote another user to super_admin first (via direct DB access — the portal UI does not allow super_admin promotion).",
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
