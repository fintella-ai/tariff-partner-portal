import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = ["super_admin", "admin"];

export async function GET(_req: NextRequest) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (!role || !ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      steps: { orderBy: { stepNumber: "asc" } },
      _count: { select: { enrollments: true } },
    },
  });

  return NextResponse.json({ campaigns });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (!role || !ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, audience, steps } = body;

  if (!name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  const campaign = await prisma.campaign.create({
    data: {
      name,
      description: description || null,
      audience: audience || "all_leads",
      steps: {
        create: (steps || []).map((s: { templateKey: string; delayDays: number; subject?: string; skipIfOpened?: boolean; skipIfClicked?: boolean }, i: number) => ({
          stepNumber: i + 1,
          templateKey: s.templateKey,
          delayDays: s.delayDays ?? (i === 0 ? 0 : 3),
          subject: s.subject || null,
          skipIfOpened: s.skipIfOpened ?? false,
          skipIfClicked: s.skipIfClicked ?? false,
        })),
      },
    },
    include: { steps: { orderBy: { stepNumber: "asc" } } },
  });

  return NextResponse.json({ campaign }, { status: 201 });
}
