import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/partner/passkeys/[id]
 * Remove a passkey from the logged-in partner's account. The row must
 * belong to the caller — cross-partner deletes return 404 to avoid
 * leaking existence of someone else's credential.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  const row = await prisma.passkey.findUnique({ where: { id: params.id } });
  if (!row || row.partnerCode !== partnerCode) {
    return NextResponse.json({ error: "Passkey not found" }, { status: 404 });
  }

  await prisma.passkey.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
