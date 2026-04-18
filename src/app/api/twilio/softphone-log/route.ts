import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/format";

/**
 * POST /api/twilio/softphone-log
 * Creates a CallLog entry for a softphone-initiated call so the
 * recording webhook can match it via logId.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const toPhone = normalizePhone(body.toPhone) || body.toPhone || "";

    // Use explicit partnerCode if provided, otherwise match by phone
    let partnerCode: string | null = body.partnerCode || null;
    if (!partnerCode && toPhone) {
      const partner = await prisma.partner.findFirst({
        where: { OR: [{ mobilePhone: toPhone }, { phone: toPhone }] },
        select: { partnerCode: true },
      });
      partnerCode = partner?.partnerCode || null;
    }

    const log = await prisma.callLog.create({
      data: {
        partnerCode,
        direction: "outbound",
        toPhone,
        fromPhone: process.env.TWILIO_FROM_NUMBER || "",
        initiatedByEmail: (session.user as any).email || null,
        initiatedByName: (session.user as any).name || null,
        status: "initiated",
      },
    });

    return NextResponse.json({ logId: log.id });
  } catch (err: any) {
    console.error("[softphone-log] error:", err);
    return NextResponse.json({ error: "Failed to create log" }, { status: 500 });
  }
}

/**
 * PATCH /api/twilio/softphone-log
 * Updates a CallLog entry with status changes from the browser softphone.
 */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const { logId, status, errorMessage } = body;
    if (!logId || !status) return NextResponse.json({ error: "logId and status required" }, { status: 400 });

    const data: Record<string, any> = { status };
    if (status === "completed" || status === "failed" || status === "canceled" || status === "no-answer") {
      data.completedAt = new Date();
    }
    if (errorMessage) data.errorMessage = errorMessage;

    await prisma.callLog.update({ where: { id: logId }, data });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[softphone-log] PATCH error:", err);
    return NextResponse.json({ error: "Failed to update log" }, { status: 500 });
  }
}
