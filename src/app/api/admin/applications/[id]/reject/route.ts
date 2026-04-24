import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_ROLES = ["super_admin", "admin"];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ADMIN_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : null;

  const application = await prisma.partnerApplication.update({
    where: { id: params.id },
    data: {
      status: "rejected",
      rejectedAt: new Date(),
      rejectionReason: reason,
    },
  });

  return NextResponse.json({ success: true, application });
}
