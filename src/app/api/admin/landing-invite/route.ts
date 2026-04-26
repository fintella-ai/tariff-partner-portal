import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendLandingInviteEmail } from "@/lib/sendgrid";

const ADMIN_ROLES = ["super_admin", "admin"];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ADMIN_ROLES.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { email?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim();
  if (!email)
    return NextResponse.json(
      { error: "email is required" },
      { status: 400 },
    );

  const landingUrl = `${process.env.NEXTAUTH_URL || "https://fintella.partners"}/landing-v2`;
  const senderName = (session.user as any).name || undefined;

  const result = await sendLandingInviteEmail({
    toEmail: email,
    toName: body.name?.trim() || null,
    landingUrl,
    senderName,
  });

  if (result.status === "failed") {
    return NextResponse.json(
      { error: result.error || "Failed to send email" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
