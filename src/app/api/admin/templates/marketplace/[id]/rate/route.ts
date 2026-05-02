import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { rating, comment } = await req.json();
  if (!rating || rating < 1 || rating > 5) return NextResponse.json({ error: "Rating must be 1-5" }, { status: 400 });

  const partnerCode = (session.user as any).partnerCode || session.user.id!;

  await prisma.sharedTemplateRating.upsert({
    where: { sharedTemplateId_partnerCode: { sharedTemplateId: id, partnerCode } },
    update: { rating, comment },
    create: { sharedTemplateId: id, partnerCode, rating, comment },
  });

  const agg = await prisma.sharedTemplateRating.aggregate({
    where: { sharedTemplateId: id },
    _avg: { rating: true },
    _count: { rating: true },
  });

  await prisma.sharedTemplate.update({
    where: { id },
    data: { rating: agg._avg.rating || 0, ratingCount: agg._count.rating },
  });

  return NextResponse.json({ rating: agg._avg.rating, count: agg._count.rating });
}
