import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_ROLES = ["super_admin", "admin", "partner_support"];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ADMIN_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const status = req.nextUrl.searchParams.get("status");
  const where = status && status !== "all" ? { status } : undefined;

  const applications = await prisma.partnerApplication.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      bookings: {
        orderBy: { createdAt: "desc" },
        include: {
          slot: {
            select: {
              id: true,
              startsAt: true,
              endsAt: true,
              title: true,
              location: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json({ applications });
}
