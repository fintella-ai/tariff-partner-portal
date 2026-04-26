import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bumpKnowledgeVersion } from "@/lib/ai-knowledge-version";

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
  const body = await req.json();
  const { action, category, question, answer } = body as {
    action: "approve" | "dismiss";
    category?: string;
    question?: string;
    answer?: string;
  };

  const candidate = await prisma.aiFaqCandidate.findUnique({
    where: { id },
  });
  if (!candidate)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "dismiss") {
    await prisma.aiFaqCandidate.update({
      where: { id },
      data: { status: "dismissed" },
    });
    return NextResponse.json({ success: true });
  }

  if (action === "approve") {
    // Create the actual FAQ entry
    const faq = await prisma.fAQ.create({
      data: {
        question: question || candidate.question,
        answer: answer || candidate.answer,
        category: category || candidate.suggestedCategory || "general",
        published: true,
      },
    });

    await prisma.aiFaqCandidate.update({
      where: { id },
      data: {
        status: "approved",
        approvedBy: session.user.email || "unknown",
        approvedAt: new Date(),
        createdFaqId: faq.id,
      },
    });

    await bumpKnowledgeVersion();

    return NextResponse.json({ success: true, faqId: faq.id });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
