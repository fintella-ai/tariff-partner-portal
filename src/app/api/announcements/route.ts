// src/app/api/announcements/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  const partnerCode = (session?.user as any)?.partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const memberships = await prisma.channelMembership.findMany({
    where: { partnerCode, removedAt: null, channel: { archivedAt: null } },
    include: {
      channel: {
        include: {
          messages: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 3 },
        },
      },
    },
    orderBy: { channel: { updatedAt: "desc" } },
  });
  return NextResponse.json({
    channels: memberships.map((m) => ({
      id: m.channel.id,
      name: m.channel.name,
      description: m.channel.description,
      recentMessages: m.channel.messages.reverse(),
    })),
  });
}
