import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const RATE_LIMIT_WINDOW = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const ipCounts = new Map<string, { count: number; resetAt: number }>();

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const now = Date.now();
  const entry = ipCounts.get(ip);
  if (entry && now < entry.resetAt) {
    if (entry.count >= RATE_LIMIT_MAX) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    entry.count++;
  } else {
    ipCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
  }

  let body: {
    email?: string;
    name?: string;
    estimatedRefund?: number;
    source?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const existing = await prisma.partnerLead.findFirst({ where: { email } });
  if (existing) {
    const notes = [
      existing.notes || "",
      `[${new Date().toISOString().slice(0, 10)}] Calculator lead capture (${body.source || "calculator"})`,
      body.estimatedRefund ? `Est. refund: $${Math.round(body.estimatedRefund).toLocaleString()}` : "",
      body.utm_campaign ? `UTM: ${body.utm_source || ""}/${body.utm_medium || ""}/${body.utm_campaign || ""}` : "",
    ].filter(Boolean).join("\n");

    await prisma.partnerLead.update({
      where: { id: existing.id },
      data: { notes },
    });

    return NextResponse.json({ success: true, existing: true });
  }

  const nameParts = (body.name || "").trim().split(/\s+/);
  const firstName = nameParts[0] || "Visitor";
  const lastName = nameParts.slice(1).join(" ") || "";

  const notes = [
    `Source: Calculator lead capture`,
    body.estimatedRefund ? `Est. refund: $${Math.round(body.estimatedRefund).toLocaleString()}` : "",
    body.utm_campaign ? `UTM: ${body.utm_source || "direct"}/${body.utm_medium || "web"}/${body.utm_campaign}/${body.utm_content || ""}` : "",
    `Captured: ${new Date().toISOString().slice(0, 10)}`,
  ].filter(Boolean).join("\n");

  await prisma.partnerLead.create({
    data: {
      firstName,
      lastName,
      email,
      source: "calculator",
      status: "prospect",
      tier: "l2",
      commissionRate: 0.20,
      referredByCode: "PTNS4XDMN",
      notes,
    },
  });

  return NextResponse.json({ success: true, existing: false });
}
