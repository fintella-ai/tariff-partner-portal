import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/webhook/referral
 *
 * Public webhook endpoint — receives form submissions from Frost Law's
 * referral form (via Referral Rock or direct webhook). No auth required
 * since this is called by an external service.
 *
 * Partner tracking: reads `utm_content` field to link the deal to the
 * submitting partner's account.
 *
 * Webhook URL to give Frost Law:
 *   https://trln.partners/api/webhook/referral
 *
 * Optional security: set REFERRAL_WEBHOOK_SECRET env var and send it
 * as a Bearer token or x-webhook-secret header.
 */
export async function POST(req: NextRequest) {
  try {
    // ── Optional secret verification ──────────────────────────────────
    const webhookSecret = process.env.REFERRAL_WEBHOOK_SECRET;
    if (webhookSecret) {
      const authHeader = req.headers.get("authorization") || "";
      const secretHeader = req.headers.get("x-webhook-secret") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (token !== webhookSecret && secretHeader !== webhookSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await req.json();

    // ── Flexible field resolver ───────────────────────────────────────
    // Accepts snake_case, camelCase, or common form field name variants
    const get = (...keys: string[]): string => {
      for (const key of keys) {
        const val = body[key];
        if (val !== undefined && val !== null && val !== "") return String(val).trim();
      }
      return "";
    };

    // ── Map form fields to Deal model ─────────────────────────────────

    // Partner tracking (from utm_content query param passed through form)
    const partnerCode = get(
      "utm_content", "utmcontent", "utm_Content",
      "referral_code", "REFERRALCODE", "referralCode", "referralcode",
      "partner_code", "partnerCode", "partner",
      "ref"
    );

    // Client contact info
    const firstName = get("first_name", "firstName", "fname", "First Name", "first");
    const lastName = get("last_name", "lastName", "lname", "Last Name", "last");
    const email = get("email", "Email", "e-mail", "emailAddress", "email_address");
    const phone = get("phone", "Phone", "phone_number", "phoneNumber", "telephone");

    // Business / service details
    const clientTitle = get("business_title", "businessTitle", "title", "Title", "job_title", "jobTitle");
    const serviceOfInterest = get("service_of_interest", "serviceOfInterest", "service", "Service of Interest", "service_interest");
    const legalEntityName = get("legal_entity_name", "legalEntityName", "company", "Company", "company_name", "companyName", "business_name", "businessName", "Legal Entity Name");
    const affiliateNotes = get("affiliate_notes", "affiliateNotes", "notes", "Notes", "comments", "Comments", "message", "Message");

    // Location
    const businessCity = get("city", "City", "business_city", "businessCity");
    const businessState = get("state", "State", "business_state", "businessState", "region");

    // Tariff-specific fields
    const importsGoods = get("imports_goods", "importsGoods", "imports", "Imports Goods", "do_you_import");
    const importCountries = get("import_countries", "importCountries", "countries", "Import Countries", "country_of_origin");
    const annualImportValue = get("annual_import_value", "annualImportValue", "import_value", "importValue", "Annual Import Value", "annual_value");
    const importerOfRecord = get("importer_of_record", "importerOfRecord", "ior", "Importer of Record");

    // Deal stage (passed through from Frost Law's system — stored as-is)
    const externalStage = get(
      "dealstage", "deal_stage", "dealStage",
      "stage", "Stage", "pipeline_stage", "pipelineStage",
      "status", "Status"
    );

    // ── Build deal name ───────────────────────────────────────────────
    const dealName = legalEntityName
      || (firstName && lastName ? `${firstName} ${lastName}` : "")
      || email
      || "Referral Form Submission";

    // ── Validate minimum data ─────────────────────────────────────────
    if (!firstName && !lastName && !email && !legalEntityName) {
      return NextResponse.json(
        { error: "At least one of: name, email, or company is required" },
        { status: 400 }
      );
    }

    // ── Create Deal record ────────────────────────────────────────────
    const deal = await prisma.deal.create({
      data: {
        dealName,
        partnerCode: partnerCode || "UNATTRIBUTED",
        stage: "new_lead",
        externalStage: externalStage || null,
        clientFirstName: firstName || null,
        clientLastName: lastName || null,
        clientName: firstName && lastName ? `${firstName} ${lastName}` : null,
        clientEmail: email || null,
        clientPhone: phone || null,
        clientTitle: clientTitle || null,
        serviceOfInterest: serviceOfInterest || null,
        legalEntityName: legalEntityName || null,
        businessCity: businessCity || null,
        businessState: businessState || null,
        importsGoods: importsGoods || null,
        importCountries: importCountries || null,
        annualImportValue: annualImportValue || null,
        importerOfRecord: importerOfRecord || null,
        affiliateNotes: affiliateNotes || null,
        notes: `Source: Frost Law Referral Form | Partner: ${partnerCode || "none"}${externalStage ? ` | External Stage: ${externalStage}` : ""}`,
      },
    });

    // ── Notify partner (if attributed) ────────────────────────────────
    if (partnerCode && partnerCode !== "UNATTRIBUTED") {
      await prisma.notification.create({
        data: {
          recipientType: "partner",
          recipientId: partnerCode,
          type: "deal_update",
          title: "New Client Referral Received",
          message: `A new referral for "${dealName}" has been submitted through your link and is now being processed.`,
          link: "/dashboard/deals",
        },
      }).catch(() => {}); // Don't fail the webhook if notification fails
    }

    return NextResponse.json({
      received: true,
      dealId: deal.id,
      dealName: deal.dealName,
      partnerCode: deal.partnerCode,
    }, { status: 201 });
  } catch (err: any) {
    console.error("[Webhook/Referral] Error:", err);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webhook/referral
 * Health check / documentation endpoint.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "POST /api/webhook/referral",
    description: "Frost Law referral form webhook receiver. Creates a Deal record from form submission data.",
    tracking: "Include utm_content={partnerCode} in the form URL to attribute deals to partners.",
    fields: {
      partner_tracking: ["utm_content", "referral_code", "partner_code"],
      client_info: ["first_name", "last_name", "email", "phone", "business_title"],
      business_details: ["legal_entity_name", "service_of_interest", "city", "state"],
      tariff_fields: ["imports_goods", "import_countries", "annual_import_value", "importer_of_record"],
      deal_stage: ["dealstage", "deal_stage", "stage", "pipeline_stage", "status"],
      other: ["affiliate_notes"],
    },
    security: "Optional: set REFERRAL_WEBHOOK_SECRET env var and send as x-webhook-secret header or Bearer token.",
  });
}
