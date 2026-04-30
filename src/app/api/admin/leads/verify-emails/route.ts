import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyEmail } from "@/lib/email-verify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 50;

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (!role || !["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const leadIds = body.leadIds as string[] | undefined;

  const where: Record<string, unknown> = {
    email: { not: { contains: "@import.placeholder" } },
  };
  if (leadIds?.length) {
    where.id = { in: leadIds };
  } else {
    where.status = { in: ["prospect", "contacted"] };
  }

  const leads = await prisma.partnerLead.findMany({
    where,
    select: { id: true, email: true, notes: true },
    take: BATCH_SIZE,
    orderBy: { createdAt: "desc" },
  });

  let verified = 0;
  let invalid = 0;
  const results: Array<{ id: string; email: string; valid: boolean; reason: string }> = [];

  for (const lead of leads) {
    const result = await verifyEmail(lead.email);
    results.push({ id: lead.id, email: lead.email, valid: result.valid, reason: result.reason });

    const tag = result.valid
      ? `[verified] MX: ${result.mxHost || "ok"}`
      : `[invalid] ${result.reason}`;

    const notes = (lead.notes || "").includes("[verified]") || (lead.notes || "").includes("[invalid]")
      ? lead.notes
      : [lead.notes || "", tag].filter(Boolean).join("\n");

    await prisma.partnerLead.update({
      where: { id: lead.id },
      data: { notes },
    });

    if (result.valid) verified++;
    else invalid++;
  }

  return NextResponse.json({
    total: leads.length,
    verified,
    invalid,
    results,
  });
}
