// src/app/api/admin/channels/messages/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";
import { validateCallMeta } from "@/lib/validateCallMeta";
import { publishPortalChatEvent } from "@/lib/portalChatEvents";

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

async function gate(params: { id: string }, session: any) {
  const role = (session?.user as any)?.role;
  const email = session?.user?.email;
  if (!email || !isAnyAdmin(role)) return { err: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const msg = await prisma.channelMessage.findUnique({ where: { id: params.id } });
  if (!msg) return { err: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  const isSuper = role === "super_admin";
  const isSender = msg.authorEmail === email;
  const withinWindow = Date.now() - new Date(msg.createdAt).getTime() < EDIT_WINDOW_MS;
  if (!(isSuper || (isSender && withinWindow))) {
    return { err: NextResponse.json({ error: "Edit window expired or not sender" }, { status: 403 }) };
  }
  return { msg };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const g = await gate(params, session); if (g.err) return g.err;
  const body = await req.json().catch(() => null);
  const data: any = {};
  if (typeof body?.content === "string") data.content = body.content;
  if (body?.callMeta !== undefined) {
    if (body.callMeta === null) data.callMeta = null;
    else {
      const v = validateCallMeta(body.callMeta);
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
      data.callMeta = JSON.stringify(v.value);
    }
  }
  data.editedAt = new Date();
  const updated = await prisma.channelMessage.update({ where: { id: params.id }, data });
  await publishPortalChatEvent({ event: "channel.announcement.updated", channelId: updated.channelId, messageId: updated.id });
  return NextResponse.json({ message: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const g = await gate(params, session); if (g.err) return g.err;
  const updated = await prisma.channelMessage.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
  await publishPortalChatEvent({ event: "channel.announcement.deleted", channelId: updated.channelId, messageId: updated.id });
  return NextResponse.json({ ok: true });
}
