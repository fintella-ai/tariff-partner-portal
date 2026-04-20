// src/app/api/partner-dm/messages/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishPortalChatEvent } from "@/lib/portalChatEvents";

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

async function gate(params: { id: string }, session: any) {
  const partnerCode = (session?.user as any)?.partnerCode;
  if (!partnerCode) return { err: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const msg = await prisma.partnerDmMessage.findUnique({ where: { id: params.id } });
  if (!msg) return { err: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (msg.senderPartnerCode !== partnerCode) return { err: NextResponse.json({ error: "Only sender can edit or delete" }, { status: 403 }) };
  if (Date.now() - new Date(msg.createdAt).getTime() > EDIT_WINDOW_MS) {
    return { err: NextResponse.json({ error: "Edit window expired" }, { status: 403 }) };
  }
  return { msg };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const g = await gate(params, session); if (g.err) return g.err;
  const body = await req.json().catch(() => null);
  if (!body?.content || typeof body.content !== "string") return NextResponse.json({ error: "content required" }, { status: 400 });
  const updated = await prisma.partnerDmMessage.update({
    where: { id: params.id },
    data: { content: body.content, editedAt: new Date() },
  });
  await publishPortalChatEvent({ event: "partner_dm.message.updated", threadId: updated.threadId, messageId: updated.id });
  return NextResponse.json({ message: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const g = await gate(params, session); if (g.err) return g.err;
  const updated = await prisma.partnerDmMessage.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  });
  await publishPortalChatEvent({ event: "partner_dm.message.deleted", threadId: updated.threadId, messageId: updated.id });
  return NextResponse.json({ ok: true });
}
