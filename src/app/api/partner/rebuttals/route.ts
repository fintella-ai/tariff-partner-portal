import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerCode = (session.user as { partnerCode?: string }).partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  const rebuttals = await prisma.rebuttal.findMany({
    where: { status: "approved" },
    orderBy: [{ usageCount: "desc" }, { createdAt: "desc" }],
    select: {
      id: true, objection: true, approvedResponse: true,
      category: true, usageCount: true,
    },
  });

  const mySubmissions = await prisma.rebuttal.findMany({
    where: { submittedBy: partnerCode },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ rebuttals, mySubmissions });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerCode = (session.user as { partnerCode?: string }).partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  const body = await req.json();
  if (!body.objection?.trim())
    return NextResponse.json({ error: "Objection text is required" }, { status: 400 });

  const validCats = ["eligibility", "pricing", "trust", "competition", "timing", "general"];
  const partner = await prisma.partner.findUnique({
    where: { partnerCode },
    select: { firstName: true, lastName: true },
  });

  const rebuttal = await prisma.rebuttal.create({
    data: {
      objection: body.objection.trim(),
      suggestedResponse: body.suggestedResponse?.trim() || null,
      category: validCats.includes(body.category) ? body.category : "general",
      submittedBy: partnerCode,
      submittedByName: partner ? `${partner.firstName} ${partner.lastName}` : null,
    },
  });

  return NextResponse.json({ rebuttal }, { status: 201 });
}
