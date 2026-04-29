import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/unsubscribe
 * Public — marks a PartnerLead as unsubscribed.
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email?.trim()) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const normalized = email.trim().toLowerCase();

    const lead = await prisma.partnerLead.findFirst({
      where: { email: normalized },
    });

    if (lead) {
      await prisma.partnerLead.update({
        where: { id: lead.id },
        data: {
          unsubscribedAt: new Date(),
          scheduledSendAt: null,
          notes: [
            lead.notes || "",
            `[${new Date().toISOString().split("T")[0]}] Unsubscribed via /unsubscribe`,
          ].filter(Boolean).join("\n"),
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
