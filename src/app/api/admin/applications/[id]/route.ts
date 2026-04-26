import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit-log";
import { sendNoShowRebookingEmail } from "@/lib/sendgrid";

const ADMIN_ROLES = ["super_admin", "admin", "partner_support"];
const ALLOWED_STATUSES = ["new", "contacted", "meeting_booked", "no_show", "qualified", "approved", "rejected"];

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ADMIN_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const application = await prisma.partnerApplication.findUnique({
    where: { id: params.id },
    include: {
      bookings: {
        orderBy: { createdAt: "desc" },
        include: {
          slot: true,
        },
      },
    },
  });
  if (!application) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ application });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ADMIN_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const data: Record<string, any> = {};

  if (typeof body.status === "string") {
    if (!ALLOWED_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = body.status;
  }
  if (typeof body.adminNotes === "string") data.adminNotes = body.adminNotes;
  if (typeof body.uplineCode === "string" && body.uplineCode.trim()) {
    data.uplineCode = body.uplineCode.trim().toUpperCase();
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const application = await prisma.partnerApplication.update({
    where: { id: params.id },
    data,
  });

  logAudit({
    action: "application.update",
    actorEmail: session.user.email || "unknown",
    actorRole: (session.user as any).role || "unknown",
    actorId: session.user.id,
    targetType: "partner_application",
    targetId: params.id,
    details: { updatedFields: Object.keys(data) },
    ipAddress: req.headers.get("x-forwarded-for") || undefined,
    userAgent: req.headers.get("user-agent") || undefined,
  }).catch(() => {});

  if (data.status === "no_show") {
    const portalUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://fintella.partners";
    sendNoShowRebookingEmail({
      toEmail: application.email,
      toName: application.firstName || null,
      rebookUrl: `${portalUrl}/booker?applicationId=${application.id}`,
    }).catch(() => {});
  }

  return NextResponse.json({ application });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.partnerApplication.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
