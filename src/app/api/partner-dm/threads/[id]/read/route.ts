// src/app/api/partner-dm/threads/[id]/read/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const partnerCode = (session?.user as any)?.partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const thread = await prisma.partnerDmThread.findUnique({ where: { id: params.id } });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  if (thread.participantA !== partnerCode && thread.participantB !== partnerCode) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.partnerDmReadState.upsert({
    where: { threadId_partnerCode: { threadId: params.id, partnerCode } },
    update: { lastReadAt: new Date() },
    create: { threadId: params.id, partnerCode },
  });
  return NextResponse.json({ ok: true });
}
