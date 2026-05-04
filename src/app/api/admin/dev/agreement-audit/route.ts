import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/dev/agreement-audit
 *
 * Audits all "signed" agreements against SignWell API.
 * If SignWell says a document is NOT fully completed, resets the
 * agreement status to the correct state and deactivates the partner.
 *
 * Also checks "partner_signed" agreements to verify the partner
 * actually signed (not just the co-signer).
 *
 * Super admin only. Pass ?fix=true to actually apply corrections.
 */
export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role !== "super_admin") {
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  }

  const url = new URL(req.url);
  const fix = url.searchParams.get("fix") === "true";

  const SIGNWELL_API_KEY = process.env.SIGNWELL_API_KEY || "";
  if (!SIGNWELL_API_KEY) {
    return NextResponse.json({ error: "SIGNWELL_API_KEY not set" }, { status: 400 });
  }

  const settings = await prisma.portalSettings.findUnique({
    where: { id: "global" },
    select: { fintellaSignerEmail: true },
  });
  const cosignerEmail = (settings?.fintellaSignerEmail || "").toLowerCase();

  const agreements = await prisma.partnershipAgreement.findMany({
    where: { status: { in: ["signed", "partner_signed"] } },
  });

  const results: Array<{
    partnerCode: string;
    agreementId: string;
    currentStatus: string;
    signwellStatus: string;
    correctStatus: string;
    fixed: boolean;
    recipients: Array<{ name: string; email: string; status: string }>;
  }> = [];

  let fixedCount = 0;

  for (const agreement of agreements) {
    if (!agreement.signwellDocumentId) continue;

    try {
      const res = await fetch(
        `https://www.signwell.com/api/v1/documents/${agreement.signwellDocumentId}`,
        { headers: { "X-Api-Key": SIGNWELL_API_KEY } }
      );

      if (!res.ok) {
        results.push({
          partnerCode: agreement.partnerCode,
          agreementId: agreement.id,
          currentStatus: agreement.status,
          signwellStatus: `API error ${res.status}`,
          correctStatus: "unknown",
          fixed: false,
          recipients: [],
        });
        continue;
      }

      const doc = await res.json();
      const recipients = doc.recipients || [];

      const partnerRecipient = recipients.find((r: any) =>
        r.email?.toLowerCase() !== cosignerEmail
      ) || recipients[0];

      const allCompleted = recipients.every((r: any) => r.status === "completed");
      const partnerCompleted = partnerRecipient?.status === "completed";
      const partnerViewed = partnerRecipient?.status === "viewed";

      let correctStatus = "pending";
      if (allCompleted && doc.status === "completed") {
        correctStatus = "signed";
      } else if (partnerCompleted) {
        correctStatus = "partner_signed";
      } else if (partnerViewed) {
        correctStatus = "viewed";
      }

      const needsFix = correctStatus !== agreement.status;

      if (needsFix && fix) {
        await prisma.partnershipAgreement.update({
          where: { id: agreement.id },
          data: {
            status: correctStatus,
            ...(correctStatus !== "signed" ? { signedDate: null } : {}),
          },
        });

        if (correctStatus !== "signed") {
          await prisma.partner.update({
            where: { partnerCode: agreement.partnerCode },
            data: { status: "pending" },
          }).catch(() => {});
        }

        fixedCount++;
      }

      if (needsFix) {
        results.push({
          partnerCode: agreement.partnerCode,
          agreementId: agreement.id,
          currentStatus: agreement.status,
          signwellStatus: doc.status,
          correctStatus,
          fixed: fix,
          recipients: recipients.map((r: any) => ({
            name: r.name || "",
            email: r.email || "",
            status: r.status || "",
          })),
        });
      }
    } catch (err) {
      results.push({
        partnerCode: agreement.partnerCode,
        agreementId: agreement.id,
        currentStatus: agreement.status,
        signwellStatus: `Error: ${(err as Error).message}`,
        correctStatus: "unknown",
        fixed: false,
        recipients: [],
      });
    }
  }

  return NextResponse.json({
    checked: agreements.length,
    mismatched: results.length,
    fixed: fixedCount,
    dryRun: !fix,
    results,
  });
}
