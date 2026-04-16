import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const logs = await prisma.workflowLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      workflow: { select: { id: true, name: true, trigger: true } },
    },
  });

  return NextResponse.json({ logs });
}
