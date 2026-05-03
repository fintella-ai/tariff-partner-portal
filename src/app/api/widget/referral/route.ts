import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWidgetJwt, getCorsHeaders } from "@/lib/widget-auth";
import { checkWidgetRateLimit } from "@/lib/widget-rate-limit";
import { sendEmail } from "@/lib/sendgrid";
import { FIRM_SHORT, SUPPORT_EMAIL } from "@/lib/constants";

function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(req.headers.get("origin"), null),
  });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const cors = getCorsHeaders(origin, null);

  const token = extractToken(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: cors });
  }

  const payload = verifyWidgetJwt(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401, headers: cors });
  }

  const { sub: partnerId, sid: sessionId } = payload;

  const session = await prisma.widgetSession.findUnique({
    where: { id: sessionId },
    select: { apiKeyHint: true, isActive: true },
  });
  if (!session?.isActive) {
    return NextResponse.json({ error: "Session deactivated" }, { status: 401, headers: cors });
  }

  const rateCheck = checkWidgetRateLimit(session.apiKeyHint);
  if (!rateCheck.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterMs: rateCheck.retryAfterMs },
      {
        status: 429,
        headers: {
          ...cors,
          "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)),
        },
      }
    );
  }

  try {
    const body = await req.json();
    const { clientCompanyName, clientContactName, clientEmail, clientPhone,
            estimatedImportValue, importDateRange, htsCodes, entryCount,
            tmsReference, notes, calculatorData, documentUrls,
            isImporterOfRecord } = body;

    // Build final notes, appending calculator estimate if provided
    let finalNotes = (notes as string) || "";
    if (calculatorData) {
      const calcSummary = `[Calculator Estimate] Country: ${calculatorData.countryOfOrigin}, Value: $${Number(calculatorData.enteredValue).toLocaleString()}, IEEPA Rate: ${(Number(calculatorData.ieepaRate) * 100).toFixed(1)}%, Est. Refund: $${Number(calculatorData.estimatedRefund).toLocaleString()}, Interest: $${Number(calculatorData.estimatedInterest).toLocaleString()}`;
      finalNotes = finalNotes ? `${finalNotes}\n\n${calcSummary}` : calcSummary;
    }

    if (!clientCompanyName || !clientContactName || !clientEmail) {
      return NextResponse.json(
        { error: "clientCompanyName, clientContactName, and clientEmail are required" },
        { status: 400, headers: cors }
      );
    }

    if (!clientEmail.includes("@") || clientEmail.length > 254) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400, headers: cors }
      );
    }

    // 30-day dedup
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const existing = await prisma.widgetReferral.findFirst({
      where: {
        partnerId,
        clientEmail: { equals: clientEmail.trim(), mode: "insensitive" },
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { success: true, referralId: existing.id, message: "Client already referred within 30 days", duplicate: true },
        { headers: cors }
      );
    }

    const referral = await prisma.widgetReferral.create({
      data: {
        widgetSessionId: sessionId,
        partnerId,
        clientCompanyName: clientCompanyName.trim(),
        clientContactName: clientContactName.trim(),
        clientEmail: clientEmail.trim().toLowerCase(),
        clientPhone: clientPhone?.trim() || null,
        estimatedImportValue: estimatedImportValue || null,
        importDateRange: importDateRange || null,
        htsCodes: Array.isArray(htsCodes) ? htsCodes : [],
        entryCount: entryCount ? parseInt(entryCount, 10) : null,
        isImporterOfRecord: isImporterOfRecord !== undefined ? Boolean(isImporterOfRecord) : true,
        tmsReference: tmsReference?.trim() || null,
        notes: finalNotes || null,
        documentUrls: Array.isArray(documentUrls) ? documentUrls : [],
      },
    });

    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { firstName: true, lastName: true, email: true, partnerCode: true },
    });

    // Email 1: Ops team notification
    sendEmail({
      to: SUPPORT_EMAIL,
      subject: `New widget referral from ${partner?.firstName} ${partner?.lastName} — ${clientCompanyName}`,
      template: "widget_referral_ops",
      partnerCode: partner?.partnerCode,
      text: `New widget referral submitted.\n\nPartner: ${partner?.firstName} ${partner?.lastName} (${partner?.partnerCode})\nClient: ${clientCompanyName}\nContact: ${clientContactName} <${clientEmail}>${clientPhone ? ` ${clientPhone}` : ""}\nEstimated Value: ${estimatedImportValue || "N/A"}\nImport Period: ${importDateRange || "N/A"}\nHTS Codes: ${Array.isArray(htsCodes) && htsCodes.length > 0 ? htsCodes.join(", ") : "N/A"}\nTMS Reference: ${tmsReference || "N/A"}\n\nReferral ID: ${referral.id}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#c4a050">New Widget Referral</h2><p><strong>Partner:</strong> ${partner?.firstName} ${partner?.lastName} (${partner?.partnerCode})</p><p><strong>Client:</strong> ${clientCompanyName}</p><p><strong>Contact:</strong> ${clientContactName} &lt;${clientEmail}&gt;${clientPhone ? ` ${clientPhone}` : ""}</p><p><strong>Estimated Value:</strong> ${estimatedImportValue || "N/A"}</p><p><strong>Import Period:</strong> ${importDateRange || "N/A"}</p><p><strong>HTS Codes:</strong> ${Array.isArray(htsCodes) && htsCodes.length > 0 ? htsCodes.join(", ") : "N/A"}</p><p><strong>TMS Ref:</strong> ${tmsReference || "N/A"}</p><hr><p style="color:#888;font-size:12px">Referral ID: ${referral.id}</p></div>`,
    }).catch(() => {});

    // Email 2: Broker confirmation
    if (partner?.email) {
      sendEmail({
        to: partner.email,
        subject: `Referral confirmed — ${clientCompanyName}`,
        template: "widget_referral_confirmation",
        partnerCode: partner.partnerCode,
        text: `Hi ${partner.firstName},\n\nYour referral for ${clientCompanyName} has been received.\n\nTracking ID: ${referral.id}\nClient: ${clientContactName} <${clientEmail}>\n\nOur team will reach out to the client within 24 hours. You'll be notified of status changes.\n\nThank you,\n${FIRM_SHORT}`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#c4a050">Referral Confirmed</h2><p>Hi ${partner.firstName},</p><p>Your referral for <strong>${clientCompanyName}</strong> has been received.</p><table style="border-collapse:collapse;width:100%;margin:16px 0"><tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Tracking ID</td><td style="padding:8px;border:1px solid #ddd">${referral.id}</td></tr><tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Client</td><td style="padding:8px;border:1px solid #ddd">${clientContactName} &lt;${clientEmail}&gt;</td></tr></table><p>Our team will reach out to the client within 24 hours. You'll be notified of status changes.</p><p>Thank you,<br><strong>${FIRM_SHORT}</strong></p></div>`,
      }).catch(() => {});
    }

    return NextResponse.json(
      { success: true, referralId: referral.id, message: "Client referred successfully" },
      { status: 201, headers: cors }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: cors }
    );
  }
}
