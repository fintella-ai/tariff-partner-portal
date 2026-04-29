import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DEFAULT_PAGES = [
  { slug: "recover", label: "Client Recovery (/recover)" },
  { slug: "partners", label: "Partner Recruitment (/partners)" },
  { slug: "brokers", label: "Customs Brokers (/partners/brokers)" },
  { slug: "webinar", label: "Webinar Funnel (/webinar)" },
];

export async function GET() {
  const session = await auth();
  if (!session?.user || !["super_admin", "admin"].includes((session.user as any).role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const pages = await prisma.landingPageConfig.findMany({
    orderBy: { slug: "asc" },
  });

  const pageMap = new Map(pages.map((p) => [p.slug, p]));
  const result = DEFAULT_PAGES.map((dp) => {
    const existing = pageMap.get(dp.slug);
    return existing || { slug: dp.slug, label: dp.label, draft: "{}", published: "{}", enabled: true, lastPublishedAt: null, lastPublishedBy: null, updatedAt: null };
  });

  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !["super_admin", "admin"].includes((session.user as any).role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const { slug, draft, publish, enabled } = body;

  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  const defaultPage = DEFAULT_PAGES.find((p) => p.slug === slug);
  if (!defaultPage) {
    return NextResponse.json({ error: "Invalid page slug" }, { status: 400 });
  }

  const data: any = { updatedAt: new Date() };
  if (draft !== undefined) data.draft = typeof draft === "string" ? draft : JSON.stringify(draft);
  if (enabled !== undefined) data.enabled = enabled;
  if (publish) {
    const current = await prisma.landingPageConfig.findUnique({ where: { slug } });
    data.published = current?.draft || "{}";
    data.lastPublishedAt = new Date();
    data.lastPublishedBy = (session.user as any).id || "admin";
  }

  const page = await prisma.landingPageConfig.upsert({
    where: { slug },
    create: { slug, label: defaultPage.label, ...data },
    update: data,
  });

  return NextResponse.json(page);
}
