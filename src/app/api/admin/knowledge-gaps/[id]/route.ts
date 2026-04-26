import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (
    !session?.user ||
    !["super_admin", "admin"].includes((session.user as any).role)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const category = typeof body.category === "string" ? body.category : undefined;

  const gap = await prisma.aiKnowledgeGap.update({
    where: { id },
    data: {
      resolved: true,
      resolvedBy: session.user.email || "unknown",
      resolvedAt: new Date(),
      ...(category !== undefined ? { category } : {}),
    },
  });

  return NextResponse.json(gap);
}
