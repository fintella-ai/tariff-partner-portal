import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function resolvePartnerId(session: any): Promise<string | null> {
  const partnerCode = session.user?.partnerCode;
  if (!partnerCode) return null;
  const partner = await prisma.partner.findUnique({ where: { partnerCode }, select: { id: true } });
  return partner?.id ?? null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const partnerId = await resolvePartnerId(session);
  if (!partnerId) {
    return NextResponse.json({ error: "Partner not found" }, { status: 403 });
  }

  const key = await prisma.widgetSession.findFirst({
    where: { id: params.id, partnerId },
    select: {
      id: true,
      apiKeyHint: true,
      platform: true,
      origin: true,
      isActive: true,
      lastSeenAt: true,
      createdAt: true,
    },
  });

  if (!key) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(key);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const partnerId = await resolvePartnerId(session);
  if (!partnerId) {
    return NextResponse.json({ error: "Partner not found" }, { status: 403 });
  }

  const key = await prisma.widgetSession.findFirst({
    where: { id: params.id, partnerId },
  });

  if (!key) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.widgetSession.update({
    where: { id: params.id },
    data: { isActive: false },
  });

  return NextResponse.json({ success: true, message: "API key deactivated" });
}
