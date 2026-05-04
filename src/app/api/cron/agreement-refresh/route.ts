import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/cron/agreement-refresh
 *
 * Auto-polls SignWell every 5 minutes for agreements in
 * pending/viewed/partner_signed. Catches status changes ~5 min
 * after partner signs and ~15 min after partner views, even if
 * webhooks are delayed or missed.
 *
 * Vercel cron schedule: *\/5 * * * *  (every 5 minutes)
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization") || "";
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const SIGNWELL_API_KEY = process.env.SIGNWELL_API_KEY || "";
  if (!SIGNWELL_API_KEY) {
    return NextResponse.json({ skipped: true, reason: "SIGNWELL_API_KEY not set" });
  }

  const agreements = await prisma.partnershipAgreement.findMany({
    where: { status: { in: ["pending", "viewed", "partner_signed"] } },
  });

  const partnerCodes = Array.from(new Set(agreements.map((a) => a.partnerCode)));
  const partnerRows = partnerCodes.length > 0
    ? await prisma.partner.findMany({
        where: { partnerCode: { in: partnerCodes } },
        select: { id: true, firstName: true, lastName: true, partnerCode: true },
      })
    : [];
  const partnerMap = new Map(partnerRows.map((p) => [p.partnerCode, p]));

  if (agreements.length === 0) {
    return NextResponse.json({ refreshed: 0, message: "No agreements to refresh" });
  }

  const settings = await prisma.portalSettings.findUnique({ where: { id: "global" } });
  const cosignerEmail = settings?.fintellaSignerEmail;

  let refreshed = 0;
  let errors = 0;
  const results: Array<{ partnerCode: string; oldStatus: string; newStatus: string }> = [];

  for (const agreement of agreements) {
    if (!agreement.signwellDocumentId) continue;

    try {
      const docRes = await fetch(
        `https://www.signwell.com/api/v1/documents/${agreement.signwellDocumentId}`,
        { headers: { "X-Api-Key": SIGNWELL_API_KEY } }
      );

      if (!docRes.ok) {
        errors++;
        continue;
      }

      const doc = await docRes.json();
      const recipients = doc.recipients || [];
      const allSigned = recipients.every((r: any) => r.status === "completed");
      const partnerSigned = recipients.length > 0 && recipients[0]?.status === "completed";

      let newStatus = agreement.status;
      if (allSigned && doc.status === "completed") {
        newStatus = "signed";
      } else if (partnerSigned) {
        newStatus = "partner_signed";
      } else if (doc.status === "viewed" || recipients.some((r: any) => r.status === "viewed")) {
        newStatus = "viewed";
      }

      const cosignerRecipient = doc.recipients_with_urls?.find((r: any) => r.email === cosignerEmail)
        || doc.recipients_with_urls?.[1];
      const cosignerUrl = cosignerRecipient?.embedded_signing_url || null;

      if (newStatus !== agreement.status || cosignerUrl) {
        await prisma.partnershipAgreement.update({
          where: { id: agreement.id },
          data: {
            status: newStatus,
            ...(newStatus === "signed" ? { signedDate: new Date() } : {}),
            ...(cosignerUrl ? { cosignerSigningUrl: cosignerUrl } : {}),
          },
        });

        const partnerInfo = partnerMap.get(agreement.partnerCode);

        // Auto-activate partner on fully signed
        if (newStatus === "signed") {
          await prisma.partner.update({
            where: { partnerCode: agreement.partnerCode },
            data: { status: "active" },
          }).catch(() => {});
        }

        // Notify admins when partner has signed (needs co-sign)
        if (newStatus === "partner_signed" && agreement.status !== "partner_signed") {
          const partnerName = partnerInfo
            ? `${partnerInfo.firstName} ${partnerInfo.lastName}`
            : agreement.partnerCode;
          const link = partnerInfo
            ? `/admin/partners/${partnerInfo.id}?tab=documents`
            : `/admin/partners?search=${encodeURIComponent(agreement.partnerCode)}`;

          const admins = await prisma.user.findMany({
            where: { role: { in: ["super_admin", "admin"] } },
            select: { email: true },
          });
          for (const admin of admins) {
            await prisma.notification.create({
              data: {
                recipientType: "admin",
                recipientId: admin.email,
                type: "document_request",
                title: "Agreement Ready for Co-sign",
                message: `${partnerName} has signed their partnership agreement. Co-sign to complete.`,
                link,
              },
            }).catch(() => {});
          }
        }

        results.push({
          partnerCode: agreement.partnerCode,
          oldStatus: agreement.status,
          newStatus,
        });
        refreshed++;
      }
    } catch {
      errors++;
    }
  }

  return NextResponse.json({
    refreshed,
    errors,
    checked: agreements.length,
    results,
  });
}
