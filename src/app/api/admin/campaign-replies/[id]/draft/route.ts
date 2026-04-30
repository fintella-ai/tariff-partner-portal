import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateCampaignReply } from "@/lib/campaign-reply-ai";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (!role || !["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const email = await prisma.inboundEmail.findUnique({ where: { id: params.id } });
  if (!email) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let leadName = email.fromName || "there";
  let leadLocation: string | undefined;

  if (email.leadId) {
    const lead = await prisma.partnerLead.findUnique({
      where: { id: email.leadId },
      select: { firstName: true, lastName: true, notes: true, state: true },
    });
    if (lead) {
      leadName = lead.firstName || leadName;
      const locMatch = (lead.notes || "").match(/Location: (.+)/);
      leadLocation = locMatch?.[1] || lead.state || undefined;
    }
  }

  const draft = await generateCampaignReply(email.textBody, leadName, leadLocation);

  await prisma.inboundEmail.update({
    where: { id: params.id },
    data: { aiDraft: draft, aiDraftAt: new Date(), read: true },
  });

  return NextResponse.json({ draft });
}
