import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeDealCommissions } from "@/lib/commission";

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * POST / PATCH / GET  /api/webhook/referral
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Public webhook endpoint — receives form submissions and deal updates from
 * Frost Law. Layered security + resilience:
 *
 *   1. API-key auth     — accepts EITHER legacy `x-webhook-secret` /
 *                         `Authorization: Bearer` (env: REFERRAL_WEBHOOK_SECRET)
 *                         OR new `X-Fintella-Api-Key` (env: FROST_LAW_API_KEY).
 *                         If NEITHER env var is set, auth is disabled (dev mode).
 *
 *   2. Rate limit       — 60 requests / 60 seconds per API key (or per IP if
 *                         no key). In-memory per serverless instance — not a
 *                         distributed limit. Fine for MVP; revisit if traffic
 *                         outgrows a single Vercel instance.
 *
 *   3. HMAC signature   — reads `X-Fintella-Signature` header if present.
 *                         Computes HMAC-SHA256 of raw body with WEBHOOK_SECRET
 *                         env var. Currently LOG-ONLY (warning on mismatch or
 *                         missing signature) — will be enforced once Frost Law
 *                         implements signing on their side.
 *
 *   4. Idempotency      — POST accepts optional `idempotencyKey`. If provided,
 *                         re-POST with the same key returns the existing deal
 *                         with HTTP 200 instead of creating a duplicate.
 *
 *   5. Input validation — POST requires at least one of name/email/company.
 *                         Optional `event` field (if provided) is validated
 *                         against the allowed list. PATCH requires `dealId`.
 *
 * Webhook URL: https://fintella.partners/api/webhook/referral
 * Partner tracking: reads `utm_content` to link the deal to a partner.
 */

// ─── Config ────────────────────────────────────────────────────────────────

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

const ALLOWED_EVENTS = new Set([
  "referral.submitted",
  "referral.stage_updated",
  "referral.closed",
]);

// ─── Shared in-memory rate-limit store (per serverless instance) ───────────

type Timestamps = number[];
const rateLimitStore = new Map<string, Timestamps>();

function getRateLimitKey(req: NextRequest): string {
  const apiKey =
    req.headers.get("x-fintella-api-key") ||
    req.headers.get("x-webhook-secret") ||
    "";
  if (apiKey) return `key:${apiKey.slice(0, 12)}`;
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0]!.trim() : "unknown";
  return `ip:${ip}`;
}

function checkRateLimit(
  key: string
): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (rateLimitStore.get(key) || []).filter(
    (t) => t > windowStart
  );
  if (timestamps.length >= RATE_LIMIT_MAX) {
    const oldest = timestamps[0]!;
    const retryAfter = Math.max(
      1,
      Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000)
    );
    return { ok: false, retryAfter };
  }
  timestamps.push(now);
  rateLimitStore.set(key, timestamps);
  return { ok: true };
}

// ─── Auth: accept EITHER legacy secret OR new Fintella API key ─────────────

function checkAuth(
  req: NextRequest
): { ok: true } | { ok: false; status: number; error: string } {
  const legacySecret = process.env.REFERRAL_WEBHOOK_SECRET;
  const apiKey = process.env.FROST_LAW_API_KEY;

  // If neither env var is set, auth is disabled (dev / demo mode).
  if (!legacySecret && !apiKey) return { ok: true };

  const authHeader = req.headers.get("authorization") || "";
  const legacyHeader = req.headers.get("x-webhook-secret") || "";
  const fintellaHeader = req.headers.get("x-fintella-api-key") || "";
  const bearerToken = authHeader.replace(/^Bearer\s+/i, "");

  if (
    legacySecret &&
    (legacyHeader === legacySecret || bearerToken === legacySecret)
  ) {
    return { ok: true };
  }
  if (apiKey && fintellaHeader === apiKey) {
    return { ok: true };
  }

  return { ok: false, status: 401, error: "Unauthorized" };
}

// ─── HMAC signature verify (log-only prep — not enforced yet) ──────────────

async function verifyHmacSignature(
  req: NextRequest,
  rawBody: string
): Promise<void> {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return; // HMAC not configured on our side — skip

  const sig = req.headers.get("x-fintella-signature");
  if (!sig) {
    console.warn(
      "[webhook/referral] HMAC: X-Fintella-Signature missing — will be enforced in a future release"
    );
    return;
  }

  try {
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBuf = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      enc.encode(rawBody)
    );
    const computed = Array.from(new Uint8Array(signatureBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const expected = sig.startsWith("sha256=") ? sig.slice(7) : sig;
    if (computed !== expected) {
      console.warn(
        `[webhook/referral] HMAC mismatch — computed=${computed.slice(0, 8)}… received=${expected.slice(0, 8)}… (not enforced yet)`
      );
    }
  } catch (e) {
    console.warn("[webhook/referral] HMAC verification error:", e);
  }
}

// ─── Shared pre-flight for POST + PATCH ────────────────────────────────────

async function preflightCheck(
  req: NextRequest,
  rawBody: string
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  // 1. Auth
  const auth = checkAuth(req);
  if (!auth.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: auth.error }, { status: auth.status }),
    };
  }

  // 2. Rate limit
  const rl = checkRateLimit(getRateLimitKey(req));
  if (!rl.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Too many requests", retryAfter: rl.retryAfter },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
      ),
    };
  }

  // 3. HMAC signature (log-only)
  await verifyHmacSignature(req, rawBody);

  return { ok: true };
}

// ─── Flexible body-field resolver ──────────────────────────────────────────

function makeFieldResolver(body: Record<string, any>) {
  return (...keys: string[]): string => {
    for (const key of keys) {
      const val = body[key];
      if (val !== undefined && val !== null && val !== "") {
        return String(val).trim();
      }
    }
    return "";
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// POST — create a new deal
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  try {
    // Read the raw body once so we can HMAC-verify it AND JSON-parse it.
    const rawBody = await req.text();

    const pf = await preflightCheck(req, rawBody);
    if (!pf.ok) return pf.response;

    let body: Record<string, any>;
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    // Optional event-type whitelist (only enforced if the field is present)
    if (body.event !== undefined) {
      if (typeof body.event !== "string" || !ALLOWED_EVENTS.has(body.event)) {
        return NextResponse.json(
          {
            error: `Invalid event type. Must be one of: ${Array.from(ALLOWED_EVENTS).join(", ")}`,
          },
          { status: 400 }
        );
      }
    }

    // Idempotency — if the caller provided a key, check for prior submission
    const idempotencyKey =
      typeof body.idempotencyKey === "string" && body.idempotencyKey.trim()
        ? body.idempotencyKey.trim()
        : typeof body.idempotency_key === "string" &&
          body.idempotency_key.trim()
        ? body.idempotency_key.trim()
        : null;

    if (idempotencyKey) {
      const existing = await prisma.deal.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        return NextResponse.json(
          {
            received: true,
            dealId: existing.id,
            dealName: existing.dealName,
            partnerCode: existing.partnerCode,
            idempotent: true,
          },
          { status: 200 }
        );
      }
    }

    const get = makeFieldResolver(body);

    // Partner tracking (from utm_content query param passed through form)
    const partnerCode = get(
      "utm_content",
      "utmcontent",
      "utm_Content",
      "referral_code",
      "REFERRALCODE",
      "referralCode",
      "referralcode",
      "partner_code",
      "partnerCode",
      "partner",
      "ref"
    );

    // Client contact info
    const firstName = get(
      "first_name",
      "firstName",
      "fname",
      "First Name",
      "first"
    );
    const lastName = get(
      "last_name",
      "lastName",
      "lname",
      "Last Name",
      "last"
    );
    const email = get(
      "email",
      "Email",
      "e-mail",
      "emailAddress",
      "email_address"
    );
    const phone = get(
      "phone",
      "Phone",
      "phone_number",
      "phoneNumber",
      "telephone"
    );

    // Business / service details
    const clientTitle = get(
      "business_title",
      "businessTitle",
      "title",
      "Title",
      "job_title",
      "jobTitle"
    );
    const serviceOfInterest = get(
      "service_of_interest",
      "serviceOfInterest",
      "service",
      "Service of Interest",
      "service_interest"
    );
    const legalEntityName = get(
      "legal_entity_name",
      "legalEntityName",
      "company",
      "Company",
      "company_name",
      "companyName",
      "business_name",
      "businessName",
      "Legal Entity Name"
    );
    const affiliateNotes = get(
      "affiliate_notes",
      "affiliateNotes",
      "notes",
      "Notes",
      "comments",
      "Comments",
      "message",
      "Message"
    );

    // Location
    const businessCity = get(
      "city",
      "City",
      "business_city",
      "businessCity"
    );
    const businessState = get(
      "state",
      "State",
      "business_state",
      "businessState",
      "region"
    );

    // Tariff-specific fields
    const importsGoods = get(
      "imports_goods",
      "importsGoods",
      "imports",
      "Imports Goods",
      "do_you_import"
    );
    const importCountries = get(
      "import_countries",
      "importCountries",
      "countries",
      "Import Countries",
      "country_of_origin"
    );
    const annualImportValue = get(
      "annual_import_value",
      "annualImportValue",
      "import_value",
      "importValue",
      "Annual Import Value",
      "annual_value"
    );
    const importerOfRecord = get(
      "importer_of_record",
      "importerOfRecord",
      "ior",
      "Importer of Record"
    );

    // Deal stage (passed through from Frost Law's system — stored as-is per PR #12)
    const externalStage = get(
      "dealstage",
      "deal_stage",
      "dealStage",
      "stage",
      "Stage",
      "pipeline_stage",
      "pipelineStage",
      "status",
      "Status"
    );

    // Consultation scheduling
    const consultBookedDate = get(
      "consult_booked_date",
      "consultBookedDate",
      "consultation_date",
      "consultationDate",
      "consult_date",
      "meeting_date",
      "meetingDate"
    );
    const consultBookedTime = get(
      "consult_booked_time",
      "consultBookedTime",
      "consultation_time",
      "consultationTime",
      "consult_time",
      "meeting_time",
      "meetingTime"
    );

    // Build deal name
    const dealName =
      legalEntityName ||
      (firstName && lastName ? `${firstName} ${lastName}` : "") ||
      email ||
      "Referral Form Submission";

    // Validate minimum data
    if (!firstName && !lastName && !email && !legalEntityName) {
      return NextResponse.json(
        { error: "At least one of: name, email, or company is required" },
        { status: 400 }
      );
    }

    // Create Deal record
    const deal = await prisma.deal.create({
      data: {
        dealName,
        partnerCode: partnerCode || "UNATTRIBUTED",
        stage: "new_lead",
        externalStage: externalStage || null,
        clientFirstName: firstName || null,
        clientLastName: lastName || null,
        clientName:
          firstName && lastName ? `${firstName} ${lastName}` : null,
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
        consultBookedDate: consultBookedDate || null,
        consultBookedTime: consultBookedTime || null,
        idempotencyKey: idempotencyKey || null,
        notes: `Source: Frost Law Referral Form | Partner: ${
          partnerCode || "none"
        }${externalStage ? ` | External Stage: ${externalStage}` : ""}`,
      },
    });

    // Notify partner (if attributed)
    if (partnerCode && partnerCode !== "UNATTRIBUTED") {
      await prisma.notification
        .create({
          data: {
            recipientType: "partner",
            recipientId: partnerCode,
            type: "deal_update",
            title: "New Client Referral Received",
            message: `A new referral for "${dealName}" has been submitted through your link and is now being processed.`,
            link: "/dashboard/deals",
          },
        })
        .catch(() => {}); // Don't fail the webhook if notification fails
    }

    return NextResponse.json(
      {
        received: true,
        dealId: deal.id,
        dealName: deal.dealName,
        partnerCode: deal.partnerCode,
      },
      { status: 201 }
    );
  } catch (err: any) {
    // Race-condition guard: two concurrent POSTs with the same
    // idempotencyKey could both pass the findUnique check above and both
    // reach create() — the unique index will reject the second one with a
    // P2002 unique constraint violation. Recover by returning the winner.
    if (err?.code === "P2002" && err?.meta?.target?.includes("idempotencyKey")) {
      try {
        const body = await req.clone().json();
        const key =
          typeof body.idempotencyKey === "string"
            ? body.idempotencyKey.trim()
            : typeof body.idempotency_key === "string"
            ? body.idempotency_key.trim()
            : null;
        if (key) {
          const existing = await prisma.deal.findUnique({
            where: { idempotencyKey: key },
          });
          if (existing) {
            return NextResponse.json(
              {
                received: true,
                dealId: existing.id,
                dealName: existing.dealName,
                partnerCode: existing.partnerCode,
                idempotent: true,
              },
              { status: 200 }
            );
          }
        }
      } catch {
        // fall through
      }
    }
    console.error("[Webhook/Referral] Error:", err);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PATCH — update an existing deal by dealId
// ═══════════════════════════════════════════════════════════════════════════

export async function PATCH(req: NextRequest) {
  try {
    const rawBody = await req.text();

    const pf = await preflightCheck(req, rawBody);
    if (!pf.ok) return pf.response;

    let body: Record<string, any>;
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    // Optional event-type whitelist
    if (body.event !== undefined) {
      if (typeof body.event !== "string" || !ALLOWED_EVENTS.has(body.event)) {
        return NextResponse.json(
          {
            error: `Invalid event type. Must be one of: ${Array.from(ALLOWED_EVENTS).join(", ")}`,
          },
          { status: 400 }
        );
      }
    }

    const { dealId } = body;

    if (!dealId || typeof dealId !== "string" || !dealId.trim()) {
      return NextResponse.json(
        { error: "dealId is required" },
        { status: 400 }
      );
    }

    // Find the deal
    const deal = await prisma.deal.findUnique({ where: { id: dealId } });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const data: Record<string, any> = {};

    // Deal stage — stored as-is per PR #12 architectural decision
    const stage =
      body.dealstage ||
      body.deal_stage ||
      body.dealStage ||
      body.stage ||
      body.pipeline_stage ||
      body.status;
    if (stage) data.externalStage = stage;

    // Estimated refund amount
    const refundAmount =
      body.estimated_refund_amount ||
      body.estimatedRefundAmount ||
      body.refund_amount ||
      body.deal_amount ||
      body.dealAmount ||
      body.amount;
    if (refundAmount !== undefined) {
      const parsed = parseFloat(String(refundAmount).replace(/[,$]/g, ""));
      if (!isNaN(parsed)) data.estimatedRefundAmount = parsed;
    }

    // Firm fee rate (as decimal: 0.20 = 20%, or as percentage: 20)
    const feeRate =
      body.firm_fee_rate ||
      body.firmFeeRate ||
      body.fee_rate ||
      body.feeRate;
    if (feeRate !== undefined) {
      let parsed = parseFloat(String(feeRate));
      if (!isNaN(parsed)) {
        if (parsed > 1) parsed = parsed / 100; // Convert 20 → 0.20
        data.firmFeeRate = parsed;
      }
    }

    // Firm fee amount
    const feeAmount =
      body.firm_fee_amount ||
      body.firmFeeAmount ||
      body.fee_amount ||
      body.feeAmount;
    if (feeAmount !== undefined) {
      const parsed = parseFloat(String(feeAmount).replace(/[,$]/g, ""));
      if (!isNaN(parsed)) data.firmFeeAmount = parsed;
    }

    // Closed lost reason
    const closedLostReason =
      body.closed_lost_reason ||
      body.closedLostReason ||
      body.lost_reason ||
      body.lostReason;
    if (closedLostReason)
      data.closedLostReason = String(closedLostReason).trim();

    // Consultation scheduling (create or reschedule)
    const consultDate =
      body.consult_booked_date ||
      body.consultBookedDate ||
      body.consultation_date ||
      body.consultationDate;
    if (consultDate) data.consultBookedDate = String(consultDate).trim();
    const consultTime =
      body.consult_booked_time ||
      body.consultBookedTime ||
      body.consultation_time ||
      body.consultationTime;
    if (consultTime) data.consultBookedTime = String(consultTime).trim();

    // Close date (if stage is closedwon or closedlost)
    if (stage) {
      const normalizedStage = String(stage)
        .toLowerCase()
        .replace(/[\s\-_]/g, "");
      if (
        normalizedStage === "closedwon" ||
        normalizedStage === "closedlost"
      ) {
        if (!deal.closeDate) data.closeDate = new Date();
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No updatable fields provided" },
        { status: 400 }
      );
    }

    // ─── Auto-create CommissionLedger on first closed_won transition ───
    // When a deal first transitions to closed_won via this webhook, we
    // materialize the L1/L2/L3 commissions as "pending" ledger rows.
    // Partners immediately see expected commissions in their dashboard;
    // admin later flips the rows from pending → due by clicking
    // "Mark Payment Received" on /admin/deals once the firm has wired
    // Fintella the override.
    //
    // Guarded by: (a) the stage must be closed_won AND the deal's prior
    // externalStage was NOT closed_won — so replays / repeat PATCHes
    // don't duplicate; (b) the (dealId, partnerCode, tier) unique index
    // on CommissionLedger as belt-and-suspender.
    const stageNormalized = stage
      ? String(stage).toLowerCase().replace(/[\s\-_]/g, "")
      : "";
    const priorStageNormalized = deal.externalStage
      ? deal.externalStage.toLowerCase().replace(/[\s\-_]/g, "")
      : "";
    const isClosedWonTransition =
      stageNormalized === "closedwon" && priorStageNormalized !== "closedwon";

    // Compute ledger entries OUTSIDE the transaction so any DB read errors
    // surface before we start writing. Effective firm fee is the value
    // in this PATCH if provided, else the existing deal row.
    let entriesToCreate: Array<{ partnerCode: string; tier: string; amount: number }> = [];
    let ledgerSkipReason: string | null = null;
    let effectiveFirmFee = 0;

    if (isClosedWonTransition) {
      effectiveFirmFee =
        typeof data.firmFeeAmount === "number" && data.firmFeeAmount > 0
          ? data.firmFeeAmount
          : deal.firmFeeAmount || 0;

      if (effectiveFirmFee <= 0) {
        ledgerSkipReason = "no_firm_fee_on_deal_or_in_payload";
      } else {
        const existingForDeal = await prisma.commissionLedger.findFirst({
          where: { dealId },
        });
        if (existingForDeal) {
          ledgerSkipReason = "ledger_already_exists";
        } else {
          const computed = await computeDealCommissions(prisma, {
            partnerCode: deal.partnerCode,
            firmFeeAmount: effectiveFirmFee,
          });
          entriesToCreate = computed.entries;
          if (entriesToCreate.length === 0) {
            ledgerSkipReason = "waterfall_returned_zero_entries";
          }
        }
      }
    }

    // Single transaction: deal update + optional ledger creates + optional audit note
    const updated = await prisma.$transaction(async (tx) => {
      const d = await tx.deal.update({ where: { id: dealId }, data });

      if (entriesToCreate.length > 0) {
        for (const entry of entriesToCreate) {
          await tx.commissionLedger.create({
            data: {
              partnerCode: entry.partnerCode,
              dealId: d.id,
              dealName: d.dealName,
              tier: entry.tier,
              amount: entry.amount,
              status: "pending",
              periodMonth: new Date().toISOString().slice(0, 7),
            },
          });
        }

        // Mirror computed amounts onto the Deal row so admin views stay in
        // sync with the ledger. Only overwrite the fields we actually have
        // data for (don't clobber a non-zero existing value with 0).
        const l1Amount =
          entriesToCreate.find((e) => e.tier === "l1")?.amount || 0;
        const l2Amount =
          entriesToCreate.find((e) => e.tier === "l2")?.amount || 0;
        const dealFieldUpdate: Record<string, any> = {};
        if (l1Amount > 0) {
          dealFieldUpdate.l1CommissionAmount = l1Amount;
          dealFieldUpdate.l1CommissionStatus = "pending";
        }
        if (l2Amount > 0) {
          dealFieldUpdate.l2CommissionAmount = l2Amount;
          dealFieldUpdate.l2CommissionStatus = "pending";
        }
        if (Object.keys(dealFieldUpdate).length > 0) {
          await tx.deal.update({
            where: { id: d.id },
            data: dealFieldUpdate,
          });
        }

        const totalCommission = entriesToCreate.reduce(
          (s, e) => s + e.amount,
          0
        );
        await tx.dealNote.create({
          data: {
            dealId: d.id,
            content:
              `Deal auto-transitioned to closed_won via Frost Law webhook. ` +
              `Firm fee: $${effectiveFirmFee.toFixed(2)}. ` +
              `Pending commissions created: ${entriesToCreate.length} entries totaling $${totalCommission.toFixed(2)} ` +
              `(${entriesToCreate
                .map(
                  (e) =>
                    `${e.tier.toUpperCase()} ${e.partnerCode} $${e.amount.toFixed(2)}`
                )
                .join(", ")}). ` +
              `Admin must click "Mark Payment Received" on /admin/deals once Frost Law sends the override to Fintella.`,
            authorName: "Frost Law Webhook",
            authorEmail: "webhook@fintella.partners",
          },
        });
      }

      return d;
    });

    return NextResponse.json({
      updated: true,
      dealId: updated.id,
      dealName: updated.dealName,
      fieldsUpdated: Object.keys(data),
      ledger: isClosedWonTransition
        ? {
            created: entriesToCreate.length,
            totalAmount: entriesToCreate.reduce((s, e) => s + e.amount, 0),
            status: entriesToCreate.length > 0 ? "pending" : null,
            skipReason: ledgerSkipReason,
          }
        : undefined,
    });
  } catch (err: any) {
    // Unique-constraint violation on (dealId, partnerCode, tier) means a
    // concurrent PATCH already inserted — idempotent recovery.
    if (
      err?.code === "P2002" &&
      Array.isArray(err?.meta?.target) &&
      err.meta.target.includes("dealId") &&
      err.meta.target.includes("partnerCode") &&
      err.meta.target.includes("tier")
    ) {
      console.warn(
        "[Webhook/Referral PATCH] Race on ledger unique constraint — treating as idempotent success"
      );
      const updatedDeal = await prisma.deal.findUnique({
        where: { id: (err?.meta?.dealId as string) || "" },
      }).catch(() => null);
      return NextResponse.json({
        updated: true,
        dealId: updatedDeal?.id,
        dealName: updatedDeal?.dealName,
        fieldsUpdated: [],
        ledger: { created: 0, status: "pending", skipReason: "race_on_unique_constraint" },
      });
    }
    console.error("[Webhook/Referral PATCH] Error:", err);
    return NextResponse.json(
      { error: "Webhook update failed" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET — health check / documentation
// ═══════════════════════════════════════════════════════════════════════════

export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoints: {
      create: "POST /api/webhook/referral",
      update: "PATCH /api/webhook/referral",
    },
    description:
      "Frost Law referral form webhook. POST creates deals, PATCH updates existing deals by dealId.",
    tracking:
      "Include utm_content={partnerCode} in the form URL to attribute deals to partners.",
    create_fields: {
      partner_tracking: ["utm_content", "referral_code", "partner_code"],
      client_info: [
        "first_name",
        "last_name",
        "email",
        "phone",
        "business_title",
      ],
      business_details: [
        "legal_entity_name",
        "service_of_interest",
        "city",
        "state",
      ],
      tariff_fields: [
        "imports_goods",
        "import_countries",
        "annual_import_value",
        "importer_of_record",
      ],
      deal_stage: [
        "dealstage",
        "deal_stage",
        "stage",
        "pipeline_stage",
        "status",
      ],
      idempotency: ["idempotencyKey (optional — re-POST with same key returns existing deal)"],
      other: ["affiliate_notes", "event (optional)"],
    },
    update_fields: {
      required: ["dealId"],
      deal_stage: [
        "dealstage",
        "deal_stage",
        "stage",
        "pipeline_stage",
        "status",
      ],
      financials: [
        "estimated_refund_amount",
        "firm_fee_rate",
        "firm_fee_amount",
      ],
      other: ["closed_lost_reason"],
    },
    security: {
      api_key:
        "Send X-Fintella-Api-Key header (value = FROST_LAW_API_KEY env var). Legacy x-webhook-secret / Authorization: Bearer still accepted.",
      rate_limit: `${RATE_LIMIT_MAX} requests per ${Math.round(RATE_LIMIT_WINDOW_MS / 1000)}s per API key. 429 with Retry-After if exceeded.`,
      hmac: "Optional: send X-Fintella-Signature header with sha256=HEX of HMAC-SHA256(body, WEBHOOK_SECRET). Currently logged but not enforced.",
      allowed_events: Array.from(ALLOWED_EVENTS),
    },
  });
}
