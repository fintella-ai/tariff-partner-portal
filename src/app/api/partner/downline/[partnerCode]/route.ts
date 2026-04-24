import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/partner/downline/:partnerCode
 * Returns full detail for a single downline partner (L2 or L3) plus every
 * PartnershipAgreement and uploaded agreement Document on file for them.
 * Fuels the partner-side downline detail page at
 * /dashboard/downline/[partnerCode].
 *
 * Authorization: the calling partner must be the direct parent OR the
 * grandparent of the target. Anything else → 403.
 */
export async function GET(req: NextRequest, { params }: { params: { partnerCode: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const uploaderCode = (session.user as any).partnerCode;
  if (!uploaderCode) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  const targetCode = params.partnerCode;
  const partner = await prisma.partner.findUnique({ where: { partnerCode: targetCode } });
  if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

  // Compute depth-from-viewer while we do the authorization walk so the
  // detail page can render a viewer-relative "My L2 / My L3" chip without
  // re-walking the chain on the client.
  let authorized = partner.referredByPartnerCode === uploaderCode;
  let relativeDepth: 2 | 3 | null = authorized ? 2 : null;
  if (!authorized && partner.referredByPartnerCode) {
    const parent = await prisma.partner.findUnique({
      where: { partnerCode: partner.referredByPartnerCode },
      select: { referredByPartnerCode: true },
    });
    if (parent?.referredByPartnerCode === uploaderCode) {
      authorized = true;
      relativeDepth = 3;
    }
  }
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const agreements = await prisma.partnershipAgreement.findMany({
    where: { partnerCode: targetCode },
    orderBy: { version: "desc" },
  });

  const documents = await prisma.document.findMany({
    where: { partnerCode: targetCode, docType: "agreement" },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ partner, agreements, documents, relativeDepth });
}
