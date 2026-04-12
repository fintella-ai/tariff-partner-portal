import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/feature-requests
 * Returns the current user's own feature requests (partner or admin).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partnerCode = (session.user as any).partnerCode;
  const role = (session.user as any).role;
  const submittedBy = partnerCode || session.user.email || "";

  try {
    const requests = await prisma.featureRequest.findMany({
      where: { submittedBy },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ requests });
  } catch {
    return NextResponse.json({ error: "Failed to fetch feature requests" }, { status: 500 });
  }
}

/**
 * POST /api/feature-requests
 * Submit a new feature request (partner or admin).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { title, description, priority, category } = body;

    if (!title?.trim() || !description?.trim()) {
      return NextResponse.json({ error: "Title and description are required" }, { status: 400 });
    }

    const partnerCode = (session.user as any).partnerCode;
    const submittedBy = partnerCode || session.user.email || "unknown";
    const submittedByType = partnerCode ? "partner" : "admin";
    const submittedByName = session.user.name || submittedBy;

    const request = await prisma.featureRequest.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        priority: priority || "normal",
        category: category || null,
        submittedBy,
        submittedByType,
        submittedByName,
        status: "submitted",
      },
    });

    return NextResponse.json({ request }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to submit feature request" }, { status: 500 });
  }
}
