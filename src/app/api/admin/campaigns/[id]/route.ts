import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = ["super_admin", "admin"];

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (!role || !ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: {
      steps: { orderBy: { stepNumber: "asc" } },
      enrollments: {
        take: 50,
        orderBy: { enrolledAt: "desc" },
      },
      _count: {
        select: { enrollments: true },
      },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const statusCounts = await prisma.campaignEnrollment.groupBy({
    by: ["status"],
    where: { campaignId: params.id },
    _count: true,
  });

  const stepCounts = await prisma.campaignEnrollment.groupBy({
    by: ["currentStep"],
    where: { campaignId: params.id, status: "active" },
    _count: true,
  });

  return NextResponse.json({
    campaign,
    statusBreakdown: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
    stepBreakdown: Object.fromEntries(stepCounts.map((s) => [s.currentStep, s._count])),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (!role || !ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { status, name, description } = body;

  const data: Record<string, unknown> = {};
  if (status) data.status = status;
  if (name) data.name = name;
  if (description !== undefined) data.description = description;

  if (status === "completed") data.completedAt = new Date();

  const campaign = await prisma.campaign.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json({ campaign });
}
