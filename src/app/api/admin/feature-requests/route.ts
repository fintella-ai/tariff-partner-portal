import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/feature-requests
 * Returns all feature requests. Super admin only.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "super_admin")
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const statusFilter = req.nextUrl.searchParams.get("status");

  try {
    const where: any = {};
    if (statusFilter && statusFilter !== "all") where.status = statusFilter;

    const requests = await prisma.featureRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    // Summary stats
    const allRequests = await prisma.featureRequest.findMany({ select: { status: true } });
    const stats = {
      total: allRequests.length,
      submitted: allRequests.filter((r) => r.status === "submitted").length,
      in_review: allRequests.filter((r) => r.status === "in_review").length,
      in_progress: allRequests.filter((r) => r.status === "in_progress").length,
      completed: allRequests.filter((r) => r.status === "completed").length,
      rejected: allRequests.filter((r) => r.status === "rejected").length,
    };

    return NextResponse.json({ requests, stats });
  } catch {
    return NextResponse.json({ error: "Failed to fetch feature requests" }, { status: 500 });
  }
}
