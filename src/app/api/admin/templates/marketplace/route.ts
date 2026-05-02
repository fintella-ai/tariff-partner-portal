import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "approved";
  const category = searchParams.get("category");
  const sort = searchParams.get("sort") || "downloads";

  const where: any = { status };
  if (category) where.category = category;

  const orderBy: any = sort === "rating" ? { rating: "desc" } : sort === "newest" ? { createdAt: "desc" } : sort === "conversion" ? { conversionRate: "desc" } : { downloads: "desc" };

  const templates = await prisma.sharedTemplate.findMany({ where, orderBy, take: 50 });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, description, templateType, sourceTemplateId, category, bodyPreview, variableKeys, workflowTags } = body;
  if (!name || !templateType || !sourceTemplateId || !bodyPreview) {
    return NextResponse.json({ error: "name, templateType, sourceTemplateId, bodyPreview required" }, { status: 400 });
  }

  const partnerCode = (session.user as any).partnerCode || "ADMIN";
  const partnerName = session.user.name || "Admin";

  const shared = await prisma.sharedTemplate.create({
    data: {
      name, description, templateType, sourceTemplateId, bodyPreview,
      sharedByCode: partnerCode, sharedByName: partnerName,
      category: category || "General",
      variableKeys: variableKeys || [],
      workflowTags: workflowTags || [],
      status: "pending",
    },
  });
  return NextResponse.json(shared, { status: 201 });
}
