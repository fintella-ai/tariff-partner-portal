import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/training/resources
 *
 * Fetches all published training resources ordered by sortOrder.
 * Requires an authenticated partner session.
 *
 * Returns: { resources: TrainingResource[] }
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode) {
    return NextResponse.json({ error: "Not a partner" }, { status: 403 });
  }

  try {
    const resources = await prisma.trainingResource.findMany({
      where: { published: true },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ resources });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch training resources" },
      { status: 500 }
    );
  }
}
