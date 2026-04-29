import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendL1InviteEmail } from "@/lib/sendgrid";
import crypto from "crypto";

const PORTAL_URL =
  process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://fintella.partners";

function generateToken(): string {
  return crypto.randomBytes(9).toString("base64url");
}

async function resendOne(
  id: string
): Promise<{ id: string; ok: boolean; error?: string }> {
  try {
    const invite = await prisma.recruitmentInvite.findUnique({ where: { id } });
    if (!invite) return { id, ok: false, error: "Not found" };
    if (invite.status === "used") return { id, ok: false, error: "Already used" };
    if (!invite.invitedEmail) return { id, ok: false, error: "No email address" };

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.recruitmentInvite.update({
      where: { id },
      data: { token, expiresAt, status: "active" },
    });

    const signupUrl = `${PORTAL_URL}/getstarted?token=${token}`;

    await sendL1InviteEmail({
      toEmail: invite.invitedEmail,
      toName: invite.invitedName,
      signupUrl,
      commissionRate: invite.commissionRate ?? undefined,
    }).catch(() => {});

    return { id, ok: true };
  } catch (err: any) {
    return { id, ok: false, error: err?.message || "Unknown error" };
  }
}

/**
 * POST /api/admin/invites/bulk-resend
 *
 * Body: { ids: string[] }  — array of RecruitmentInvite IDs to resend.
 * Refreshes each invite's token + expiry and re-sends the invitation email.
 * Capped at 100 per call. Returns per-item results + aggregate counts.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).filter((x) => typeof x === "string") as string[] : [];
  if (ids.length === 0)
    return NextResponse.json({ error: "No invite IDs provided" }, { status: 400 });
  if (ids.length > 100)
    return NextResponse.json({ error: "Max 100 invites per bulk resend" }, { status: 400 });

  const results = await Promise.all(ids.map(resendOne));
  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  return NextResponse.json({ results, succeeded, failed });
}
