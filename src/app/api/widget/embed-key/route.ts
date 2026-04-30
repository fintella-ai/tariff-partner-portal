import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateApiKey, hashApiKey, getApiKeyHint } from "@/lib/widget-auth";

const PORTAL_URL = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://fintella.partners";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== "partner") {
    return NextResponse.json({ error: "Partners only" }, { status: 403 });
  }

  const partnerCode = user.partnerCode;
  if (!partnerCode) {
    return NextResponse.json({ error: "Missing partner code" }, { status: 403 });
  }

  try {
    const partner = await prisma.partner.findUnique({ where: { partnerCode }, select: { id: true } });
    if (!partner) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }
    const partnerId = partner.id;

    const body = await req.json();
    const { platform, origin } = body;

    if (!platform || !["cargowise", "magaya", "generic"].includes(platform)) {
      return NextResponse.json(
        { error: "platform must be 'cargowise', 'magaya', or 'generic'" },
        { status: 400 }
      );
    }

    const existingCount = await prisma.widgetSession.count({
      where: { partnerId, isActive: true },
    });
    if (existingCount >= 10) {
      return NextResponse.json(
        { error: "Maximum 10 active API keys per partner" },
        { status: 400 }
      );
    }

    const rawKey = generateApiKey();
    const keyHash = await hashApiKey(rawKey);
    const hint = getApiKeyHint(rawKey);

    const widgetSession = await prisma.widgetSession.create({
      data: {
        partnerId,
        apiKeyHash: keyHash,
        apiKeyHint: hint,
        origin: origin?.trim() || null,
        platform,
      },
    });

    const widgetUrl = `${PORTAL_URL}/widget?apiKey=${rawKey}`;
    const embedCode = `<iframe src="${widgetUrl}" width="420" height="600" style="border:none;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.15)" allow="clipboard-write"></iframe>`;

    return NextResponse.json({
      id: widgetSession.id,
      apiKey: rawKey,
      apiKeyHint: hint,
      platform,
      origin: widgetSession.origin,
      embedCode,
      widgetUrl,
    });
  } catch (err) {
    console.error("[widget/embed-key] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== "partner") {
    return NextResponse.json({ error: "Partners only" }, { status: 403 });
  }

  const partnerCode = user.partnerCode;
  if (!partnerCode) {
    return NextResponse.json({ error: "Missing partner code" }, { status: 403 });
  }

  const partner = await prisma.partner.findUnique({ where: { partnerCode }, select: { id: true } });
  if (!partner) {
    return NextResponse.json({ error: "Partner not found" }, { status: 404 });
  }

  const keys = await prisma.widgetSession.findMany({
    where: { partnerId: partner.id },
    orderBy: { createdAt: "desc" },
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

  return NextResponse.json({ keys });
}
