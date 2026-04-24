// src/app/api/admin/channels/[id]/members/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";

const PORTAL_URL = (process.env.NEXT_PUBLIC_PORTAL_URL || "https://fintella.partners")
  .trim()
  .replace(/\/$/, "");

/**
 * GET  — list current members of a channel (with partner name + email).
 * POST — add partners to a channel. For each NEW add (vs re-activating a
 *        soft-removed row) we also write a Notification row, fire the
 *        `partner.added_to_channel` workflow trigger, and send an email
 *        via the `partner_added_to_channel` template (fallback copy
 *        baked into sendgrid.ts).
 */

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAnyAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const memberships = await prisma.channelMembership.findMany({
    where: { channelId: params.id, removedAt: null },
    orderBy: { createdAt: "asc" },
  });
  const codes = memberships.map((m) => m.partnerCode);
  const partners = codes.length
    ? await prisma.partner.findMany({
        where: { partnerCode: { in: codes } },
        select: { partnerCode: true, firstName: true, lastName: true, email: true, tier: true, referredByPartnerCode: true },
      })
    : [];
  const byCode = Object.fromEntries(partners.map((p) => [p.partnerCode, p]));
  return NextResponse.json({
    members: memberships.map((m) => ({
      ...m,
      partner: byCode[m.partnerCode] || null,
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const adminEmail = session?.user?.email;
  if (!adminEmail || !isAnyAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const codes: string[] = Array.isArray(body?.partnerCodes) ? body.partnerCodes : [];
  if (codes.length === 0) {
    return NextResponse.json({ error: "partnerCodes required" }, { status: 400 });
  }

  // Load channel metadata + pre-existing memberships in one shot so we can
  // (a) tell which codes are net-new vs already-active (skip the ping) and
  // (b) fill the email/notification body with the channel's human name.
  const [channel, existing] = await Promise.all([
    prisma.announcementChannel.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, archivedAt: true },
    }),
    prisma.channelMembership.findMany({
      where: { channelId: params.id, partnerCode: { in: codes } },
      select: { partnerCode: true, removedAt: true },
    }),
  ]);

  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  if (channel.archivedAt) return NextResponse.json({ error: "Channel is archived" }, { status: 400 });

  // An "active" membership already exists if removedAt is null. Those get
  // re-upserted (idempotent) but we DON'T re-notify — the partner already
  // sees the channel.
  const alreadyActive = new Set(
    existing.filter((m) => m.removedAt === null).map((m) => m.partnerCode),
  );
  const newlyAdded: string[] = [];

  for (const code of codes) {
    await prisma.channelMembership.upsert({
      where: { channelId_partnerCode: { channelId: params.id, partnerCode: code } },
      update: { source: "manual", removedAt: null, addedByEmail: adminEmail },
      create: { channelId: params.id, partnerCode: code, source: "manual", addedByEmail: adminEmail },
    });
    if (!alreadyActive.has(code)) newlyAdded.push(code);
  }

  // Fire notification + email + workflow for each newly-added partner.
  // Runs async (fire-and-forget) — never blocks the upsert response.
  if (newlyAdded.length > 0) {
    notifyNewChannelMembers({
      channelId: channel.id,
      channelName: channel.name,
      partnerCodes: newlyAdded,
      addedByEmail: adminEmail,
    }).catch((err) => {
      console.error("[channels/members] notify fan-out failed:", err);
    });
  }

  return NextResponse.json({
    ok: true,
    added: newlyAdded.length,
    reactivated: codes.length - newlyAdded.length - (alreadyActive.size - (codes.length - newlyAdded.length - alreadyActive.size)),
  });
}

async function notifyNewChannelMembers(opts: {
  channelId: string;
  channelName: string;
  partnerCodes: string[];
  addedByEmail: string;
}) {
  const { channelId, channelName, partnerCodes, addedByEmail } = opts;
  const partners = await prisma.partner.findMany({
    where: { partnerCode: { in: partnerCodes } },
    select: { partnerCode: true, firstName: true, lastName: true, email: true },
  });

  const channelLink = `/dashboard/announcements?channel=${channelId}`;

  // 1) In-portal notifications (one row per partner)
  await prisma.notification.createMany({
    data: partners.map((p) => ({
      recipientType: "partner",
      recipientId: p.partnerCode,
      type: "channel_invite",
      title: `You've been added to a new channel: ${channelName}`,
      message: `An admin added you to the "${channelName}" announcement channel. Head to Announcements to see new posts there.`,
      link: channelLink,
      read: false,
    })),
    skipDuplicates: true,
  });

  // 2) Email fan-out — fire per-partner, don't let a single SendGrid hiccup
  //    block the rest. Each call returns a result we ignore.
  const { sendChannelInviteEmail } = await import("@/lib/sendgrid");
  await Promise.allSettled(
    partners
      .filter((p) => !!p.email)
      .map((p) =>
        sendChannelInviteEmail({
          toEmail: p.email!,
          toName: `${p.firstName || ""} ${p.lastName || ""}`.trim() || null,
          channelName,
          channelUrl: `${PORTAL_URL}${channelLink}`,
          partnerCode: p.partnerCode,
        }),
      ),
  );

  // 3) Workflow trigger — one fire per partner so action conditions can
  //    match on the partner's own shape. Fire-and-forget.
  const { fireWorkflowTrigger } = await import("@/lib/workflow-engine");
  await Promise.allSettled(
    partners.map((p) =>
      fireWorkflowTrigger("partner.added_to_channel", {
        partner: p,
        channelId,
        channelName,
        channelUrl: `${PORTAL_URL}${channelLink}`,
        addedByEmail,
      }),
    ),
  );
}
