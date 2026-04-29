import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendL1InviteEmail } from "@/lib/sendgrid";
import crypto from "crypto";

const PORTAL_URL =
  process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://fintella.partners";

function generateToken(): string {
  return crypto.randomBytes(9).toString("base64url"); // 12 chars, URL-safe
}

/**
 * POST /api/admin/invites/[id]/resend
 *
 * Refreshes an existing invite's token and expiry (7 days from now) and
 * re-sends the invitation email. Works on active OR expired invites.
 * Blocked for invites that are already "used" (the person signed up).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const invite = await prisma.recruitmentInvite.findUnique({
      where: { id: params.id },
    });

    if (!invite)
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    if (invite.status === "used")
      return NextResponse.json(
        { error: "This invite has already been used — the partner has signed up" },
        { status: 400 }
      );
    if (!invite.invitedEmail)
      return NextResponse.json(
        { error: "Invite has no email address to send to" },
        { status: 400 }
      );

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const updated = await prisma.recruitmentInvite.update({
      where: { id: params.id },
      data: { token, expiresAt, status: "active" },
    });

    const signupUrl = `${PORTAL_URL}/getstarted?token=${token}`;

    await sendL1InviteEmail({
      toEmail: invite.invitedEmail,
      toName: invite.invitedName,
      signupUrl,
      commissionRate: invite.commissionRate ?? undefined,
    }).catch(() => {});

    return NextResponse.json({ invite: updated, signupUrl });
  } catch {
    return NextResponse.json(
      { error: "Failed to resend invite" },
      { status: 500 }
    );
  }
}
