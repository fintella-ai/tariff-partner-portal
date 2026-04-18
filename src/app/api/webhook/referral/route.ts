import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/format";
import { computeDealCommissions, getL1CommissionRateSnapshot } from "@/lib/commission";
import { sendDealStatusUpdateEmail } from "@/lib/sendgrid";

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
 *                         env var. Enforced when WEBHOOK_SECRET is set: returns
 *                         401 on missing or mismatched signature. No-op when the
 *                         env var is absent — safe to deploy before Frost Law
 *                         implements signing; set WEBHOOK_SECRET to activate.
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

/**
 * Canonical internal deal stage enum. Matches STAGE_LABELS in src/lib/constants.ts
 * and the stage filter pills in /admin/deals + /dashboard/deals. Whatever string
 * Frost Law sends as their external stage, if it normalizes to one of these
 * values we also update `deal.stage` so the UI displays the correct badge.
 * If the incoming string doesn't match any known internal value, the deal's
 * internal stage stays at whatever it was (usually "new_lead" for fresh
 * referrals), and only `externalStage` changes.
 */
const INTERNAL_STAGES = [
  "new_lead",
  "no_consultation",
  "consultation_booked",
  "client_no_show",
  "client_qualified",
  "client_engaged",
  "in_process",
  "closedwon",
  "closedlost",
] as const;

// Frost Law / HubSpot pipeline stage IDs (numeric). Map each to an internal
// enum value. If HubSpot renames a stage in-place their ID stays the same, so
// this map is a stable contract until they rebuild the pipeline.
const HUBSPOT_STAGE_MAP: Record<string, string> = {
  "3468521172": "consultation_booked", // Meeting Booked
  "3467318997": "client_no_show",      // Meeting Missed
  "3468521174": "client_qualified",    // Qualified
  "3468521175": "closedlost",          // Disqualified (closedLostReason = "disqualified")
};

/**
 * Normalize an incoming stage string to look up against internal values.
 * Lowercases, strips spaces/hyphens/underscores. So "Closed Won",
 * "closed_won", "closed-won", "CLOSEDWON" all collapse to "closedwon"
 * which maps to the internal "closedwon" value.
 */
function normalizeStage(s: string): string {
  return String(s).toLowerCase().replace(/[\s\-_]/g, "");
}

/**
 * Map from normalized external stage → internal enum value. Built once at
 * module load so the PATCH path is a simple lookup.
 */
const STAGE_MAP: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const s of INTERNAL_STAGES) {
    m[normalizeStage(s)] = s;
  }
  // Common synonyms Frost Law or CRM systems might send that don't match
  // our internal names 1:1. Add more as we see them in real traffic.
  m["won"] = "closedwon";
  m["closed"] = "closedwon";
  m["lost"] = "closedlost";
  m["nocc"] = "no_consultation";
  m["noconsult"] = "no_consultation";
  m["ccbooked"] = "consultation_booked";
  m["consultbooked"] = "consultation_booked";
  m["noshow"] = "client_no_show";
  m["engaged"] = "client_engaged";
  m["inprogress"] = "in_process";
  return m;
})();

/**
 * Resolve an external stage string to an internal enum value, or null if
 * no match. Exported via the closure — used only inside PATCH.
 */
function resolveInternalStage(external: string): string | null {
  // HubSpot numeric pipeline stage IDs — direct map wins, no normalization.
  const asNumericId = String(external).trim();
  if (HUBSPOT_STAGE_MAP[asNumericId]) return HUBSPOT_STAGE_MAP[asNumericId];
  return STAGE_MAP[normalizeStage(external)] ?? null;
}

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
  // Temporary bypass flag — set WEBHOOK_AUTH_BYPASS=true on Vercel to let
  // unauthenticated HubSpot/Frost Law calls through while key sync is in
  // progress. Logs a loud warning so the bypass is visible in Vercel logs.
  // Flip this off as soon as the API key is aligned on both sides.
  if (process.env.WEBHOOK_AUTH_BYPASS === "true") {
    console.warn("[webhook/referral] WEBHOOK_AUTH_BYPASS=true — auth skipped");
    return { ok: true };
  }

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

// ─── HMAC signature verify — enforced when WEBHOOK_SECRET is set ───────────

async function verifyHmacSignature(
  req: NextRequest,
  rawBody: string
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  // Full bypass (auth + HMAC) via WEBHOOK_AUTH_BYPASS — see checkAuth.
  if (process.env.WEBHOOK_AUTH_BYPASS === "true") {
    return { ok: true };
  }
  // Narrower bypass: WEBHOOK_SKIP_HMAC=true keeps API-key auth enforced but
  // skips HMAC. Use this when an upstream (e.g. HubSpot Automation Actions)
  // can authenticate via X-Fintella-Api-Key but has no way to sign bodies.
  if (process.env.WEBHOOK_SKIP_HMAC === "true") {
    return { ok: true };
  }
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return { ok: true }; // HMAC not configured — skip (no-op until activated)

  const sig = req.headers.get("x-fintella-signature");
  if (!sig) {
    console.warn("[webhook/referral] HMAC: X-Fintella-Signature missing — rejected");
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Missing HMAC signature. Include X-Fintella-Signature: sha256=<hex> header." },
        { status: 401 }
      ),
    };
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
        `[webhook/referral] HMAC mismatch — rejected (computed=${computed.slice(0, 8)}… received=${expected.slice(0, 8)}…)`
      );
      return {
        ok: false,
        response: NextResponse.json(
          { error: "HMAC signature mismatch." },
          { status: 401 }
        ),
      };
    }
    return { ok: true };
  } catch (e) {
    // Fail open on unexpected crypto errors — don't lock out Frost Law due
    // to an edge case in the HMAC path. Log prominently so it surfaces.
    console.error("[webhook/referral] HMAC verification error (failing open):", e);
    return { ok: true };
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

  // 3. HMAC signature — enforced when WEBHOOK_SECRET env var is set
  const hmac = await verifyHmacSignature(req, rawBody);
  if (!hmac.ok) return hmac;

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

async function postHandler(req: NextRequest): Promise<Response> {
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
      "jobTitle",
      "jobtitle"
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
      "do_you_import",
      "import_good_to_us",
      "importGoodToUs"
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
      "hs_pipeline_stage",
      "hsPipelineStage",
      "status",
      "Status"
    );

    // HubSpot's deal ID (number in payload; stringify for our unique index).
    const externalDealIdRaw = get("hs_object_id", "hsObjectId", "hubspotDealId", "externalDealId");
    const externalDealId = externalDealIdRaw ? String(externalDealIdRaw) : null;

    // Resolve the internal stage NOW from the external marker so we can set
    // Deal.stage at creation time for HubSpot-originated rows. Falls back to
    // "new_lead" when no match (preserves existing behavior for untagged POSTs).
    const resolvedStage = externalStage ? resolveInternalStage(externalStage) : null;
    const initialStage = resolvedStage || "new_lead";
    const initialClosedLostReason =
      resolvedStage === "closedlost" && String(externalStage).trim() === "3468521175"
        ? "disqualified"
        : null;

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

    // Snapshot the L1 commission rate at deal-creation time so later
    // changes to Partner.commissionRate don't retro-affect this deal.
    // Skip for UNATTRIBUTED deals — no partner chain to walk.
    const l1RateSnapshot =
      partnerCode && partnerCode !== "UNATTRIBUTED"
        ? await getL1CommissionRateSnapshot(prisma, partnerCode).catch(() => null)
        : null;

    // Create Deal record
    const deal = await prisma.deal.create({
      data: {
        dealName,
        partnerCode: partnerCode || "UNATTRIBUTED",
        stage: initialStage,
        externalStage: externalStage || null,
        externalDealId: externalDealId,
        rawPayload: rawBody.slice(0, 20_000),
        closedLostReason: initialClosedLostReason,
        clientFirstName: firstName || null,
        clientLastName: lastName || null,
        clientName:
          firstName && lastName ? `${firstName} ${lastName}` : null,
        clientEmail: email || null,
        clientPhone: normalizePhone(phone),
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
        l1CommissionRate: l1RateSnapshot,
        idempotencyKey: idempotencyKey || null,
        notes: `Source: Frost Law Referral Form | Partner: ${
          partnerCode || "none"
        }${externalStage ? ` | External Stage: ${externalStage}` : ""}`,
      },
    });

    // Fire workflow trigger (fire-and-forget)
    import("@/lib/workflow-engine").then(({ fireWorkflowTrigger }) =>
      fireWorkflowTrigger("deal.created", { deal })
    ).catch(() => {});

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

async function patchHandler(req: NextRequest): Promise<Response> {
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

    // Deal stage — stored AS-IS in externalStage per PR #12 architectural
    // decision (preserves Frost Law's audit-grade source of truth even for
    // stages that don't match our internal enum). But we ALSO try to map
    // the incoming string through STAGE_MAP and update the internal
    // `deal.stage` field when we recognize it. That's what drives the
    // StageBadge in the /admin/deals + /dashboard/deals tables, the
    // filter pills, and the dashboard stats. Before this change, PATCH
    // only updated externalStage so the UI always showed the old stage.
    const stage =
      body.dealstage ||
      body.deal_stage ||
      body.dealStage ||
      body.stage ||
      body.pipeline_stage ||
      body.status;
    if (stage) {
      data.externalStage = stage;
      const internalStage = resolveInternalStage(String(stage));
      if (internalStage) {
        data.stage = internalStage;
      }
    }

    // Estimated refund amount (initial deal size estimate from submission)
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

    // Actual refund amount — set after Frost Law confirms the refund check
    // the client actually received. Typically sent alongside the
    // closed_won transition payload, but acceptable to update later.
    const actualRefund =
      body.actual_refund_amount ??
      body.actualRefundAmount ??
      body.actual_refund ??
      body.actualRefund;
    if (actualRefund !== undefined && actualRefund !== null && actualRefund !== "") {
      const parsed = parseFloat(String(actualRefund).replace(/[,$]/g, ""));
      if (!isNaN(parsed)) data.actualRefundAmount = parsed;
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

    // L1 commission rate (per-deal override, decimal 0.25 or percentage 25)
    const l1Rate =
      body.l1_commission_rate ??
      body.l1CommissionRate ??
      body.commission_rate ??
      body.commissionRate;
    if (l1Rate !== undefined && l1Rate !== null && l1Rate !== "") {
      let parsed = parseFloat(String(l1Rate));
      if (!isNaN(parsed)) {
        if (parsed > 1) parsed = parsed / 100;
        data.l1CommissionRate = parsed;
      }
    }

    // String field helper: first non-empty alias wins, trimmed
    const pickStr = (...keys: string[]): string | undefined => {
      for (const k of keys) {
        const v = body[k];
        if (v !== undefined && v !== null && String(v).trim() !== "") {
          return String(v).trim();
        }
      }
      return undefined;
    };

    // Deal name (if Frost Law renames the opportunity)
    const dealName = pickStr("deal_name", "dealName", "opportunity_name", "opportunityName");
    if (dealName) data.dealName = dealName;

    // Client contact — update any subset
    const firstName = pickStr("first_name", "firstName", "fname", "First Name");
    if (firstName) data.clientFirstName = firstName;
    const lastName = pickStr("last_name", "lastName", "lname", "Last Name");
    if (lastName) data.clientLastName = lastName;
    // If either name changed, resync composite clientName
    if (firstName || lastName) {
      const f = firstName ?? deal.clientFirstName ?? "";
      const l = lastName ?? deal.clientLastName ?? "";
      const composite = `${f} ${l}`.trim();
      if (composite) data.clientName = composite;
    }
    const clientName = pickStr("client_name", "clientName");
    if (clientName) data.clientName = clientName;

    const clientEmail = pickStr("email", "Email", "client_email", "clientEmail", "emailAddress", "email_address");
    if (clientEmail) data.clientEmail = clientEmail;
    const clientPhone = pickStr("phone", "Phone", "client_phone", "clientPhone", "phone_number", "phoneNumber", "telephone");
    if (clientPhone) data.clientPhone = normalizePhone(clientPhone) ?? clientPhone;
    const clientTitle = pickStr("business_title", "businessTitle", "client_title", "clientTitle", "title", "job_title", "jobTitle");
    if (clientTitle) data.clientTitle = clientTitle;

    // Service & business details
    const serviceOfInterest = pickStr("service_of_interest", "serviceOfInterest", "service", "service_interest");
    if (serviceOfInterest) data.serviceOfInterest = serviceOfInterest;
    const legalEntityName = pickStr(
      "legal_entity_name", "legalEntityName",
      "company", "Company", "company_name", "companyName",
      "business_name", "businessName"
    );
    if (legalEntityName) data.legalEntityName = legalEntityName;
    const businessCity = pickStr("city", "City", "business_city", "businessCity");
    if (businessCity) data.businessCity = businessCity;
    const businessState = pickStr("state", "State", "business_state", "businessState", "region");
    if (businessState) data.businessState = businessState;

    // Tariff-specific
    const importsGoods = pickStr("imports_goods", "importsGoods", "imports", "do_you_import");
    if (importsGoods) data.importsGoods = importsGoods;
    const importCountries = pickStr("import_countries", "importCountries", "countries", "country_of_origin");
    if (importCountries) data.importCountries = importCountries;
    const annualImportValue = pickStr("annual_import_value", "annualImportValue", "import_value", "importValue", "annual_value");
    if (annualImportValue) data.annualImportValue = annualImportValue;
    const importerOfRecord = pickStr("importer_of_record", "importerOfRecord", "ior");
    if (importerOfRecord) data.importerOfRecord = importerOfRecord;

    // Product details
    const productType = pickStr("product_type", "productType");
    if (productType) data.productType = productType;
    const importedProducts = pickStr("imported_products", "importedProducts", "products", "goods");
    if (importedProducts) data.importedProducts = importedProducts;

    // Notes fields
    const affiliateNotes = pickStr("affiliate_notes", "affiliateNotes");
    if (affiliateNotes) data.affiliateNotes = affiliateNotes;
    const notes = pickStr("notes", "Notes", "internal_notes", "internalNotes", "comments", "Comments", "message", "Message");
    if (notes) data.notes = notes;

    // Closed lost reason
    const closedLostReason = pickStr("closed_lost_reason", "closedLostReason", "lost_reason", "lostReason");
    if (closedLostReason) data.closedLostReason = closedLostReason;

    // Consultation scheduling (create or reschedule)
    const consultDate = pickStr("consult_booked_date", "consultBookedDate", "consultation_date", "consultationDate", "consult_date", "meeting_date", "meetingDate");
    if (consultDate) data.consultBookedDate = consultDate;
    const consultTime = pickStr("consult_booked_time", "consultBookedTime", "consultation_time", "consultationTime", "consult_time", "meeting_time", "meetingTime");
    if (consultTime) data.consultBookedTime = consultTime;

    // Close date (if stage is closedwon or closedlost). Uses the internal
    // stage value we just resolved via STAGE_MAP, so "Closed Won" /
    // "closed-won" / "won" all stamp the close date correctly.
    if (data.stage === "closedwon" || data.stage === "closedlost") {
      if (!deal.closeDate) data.closeDate = new Date();
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No updatable fields provided" },
        { status: 400 }
      );
    }

    // ─── Stage-specific required fields ────────────────────────────────
    // client_engaged (contract signed): only firm_fee_rate required.
    //   Refund amount may not be known yet at contract signing.
    // in_process / closedwon: both firm_fee_rate AND estimated_refund_amount
    //   required, since commission calculations need both.
    // Firm fee AMOUNT is never required — derived from refund × rate.
    const stagesRequiringRate = new Set(["client_engaged", "in_process", "closedwon"]);
    const stagesRequiringRefund = new Set(["in_process", "closedwon"]);
    if (data.stage && stagesRequiringRate.has(data.stage)) {
      const effectiveRefund =
        typeof data.estimatedRefundAmount === "number"
          ? data.estimatedRefundAmount
          : deal.estimatedRefundAmount;
      const effectiveRate =
        typeof data.firmFeeRate === "number"
          ? data.firmFeeRate
          : deal.firmFeeRate;
      const missing: string[] = [];
      if (stagesRequiringRefund.has(data.stage) && (!effectiveRefund || effectiveRefund <= 0)) {
        missing.push("estimated_refund_amount");
      }
      if (!effectiveRate || effectiveRate <= 0) missing.push("firm_fee_rate");
      if (missing.length > 0) {
        return NextResponse.json(
          {
            error: `Stage "${data.stage}" requires these fields to be set: ${missing.join(", ")}. They can be provided on this PATCH or already present on the deal from an earlier update.`,
            missing,
            stage: data.stage,
          },
          { status: 400 }
        );
      }
    }

    // ─── Auto-create CommissionLedger on first closed_won transition ───
    // When a deal first transitions to closed_won via this webhook, we
    // materialize the L1/L2/L3 commissions as "pending" ledger rows.
    // Partners immediately see expected commissions in their dashboard;
    // admin later flips the rows from pending → due by clicking
    // "Mark Payment Received" on /admin/deals once the firm has wired
    // Fintella the override.
    //
    // Guarded by: (a) the new internal stage is closedwon AND the deal's
    // prior internal stage was NOT already closedwon — so replays / repeat
    // PATCHes don't duplicate ledger entries; (b) the (dealId, partnerCode,
    // tier) unique index on CommissionLedger as belt-and-suspender.
    //
    // Uses the resolved internal stage (data.stage, set above via STAGE_MAP)
    // instead of normalizing strings inline, so "Closed Won" / "closed-won"
    // / "won" all trigger the transition correctly.
    const isClosedWonTransition =
      data.stage === "closedwon" && deal.stage !== "closedwon";

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

    // Fire workflow triggers for stage changes (fire-and-forget)
    if (data.stage && data.stage !== deal.stage) {
      import("@/lib/workflow-engine").then(({ fireWorkflowTrigger }) => {
        const previousStage = deal.stage;
        const newStage = data.stage;
        fireWorkflowTrigger("deal.stage_changed", { deal: updated, previousStage, newStage }).catch(() => {});
        if (newStage === "closedwon") fireWorkflowTrigger("deal.closed_won", { deal: updated }).catch(() => {});
        if (newStage === "closedlost") fireWorkflowTrigger("deal.closed_lost", { deal: updated }).catch(() => {});
      }).catch(() => {});
    }

    // Fire-and-forget deal status update email to the partner whenever
    // the internal stage actually changed. Uses the deal_status_update
    // template (editable by super admin in /admin/settings Communications).
    // Wrapped in a catch so any email failure never blocks the webhook
    // response — email is opportunistic, not load-bearing.
    if (data.stage && data.stage !== deal.stage) {
      (async () => {
        try {
          const partner = await prisma.partner.findFirst({
            where: { partnerCode: updated.partnerCode },
            select: { email: true, firstName: true, lastName: true },
          });
          if (partner?.email) {
            await sendDealStatusUpdateEmail({
              partnerEmail: partner.email,
              partnerName: `${partner.firstName} ${partner.lastName}`,
              partnerCode: updated.partnerCode,
              dealName: updated.dealName,
              newStage: data.stage,
            });
          }
        } catch (e) {
          console.warn("[webhook/referral] deal status email failed:", e);
        }
      })();
    }

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

function getHandler(): Response {
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
      conditionally_required: {
        "client_engaged (contract signed)":
          "firm_fee_rate must be present (on this PATCH or already on the deal).",
        "in_process / closedwon":
          "estimated_refund_amount + firm_fee_rate must both be present. firm_fee_amount is NOT required — it is derived from refund × rate.",
      },
      deal_stage: [
        "dealstage",
        "deal_stage",
        "stage",
        "pipeline_stage",
        "status",
      ],
      financials: [
        "estimated_refund_amount",
        "actual_refund_amount",
        "firm_fee_rate",
        "firm_fee_amount",
        "l1_commission_rate",
      ],
      deal_meta: ["deal_name"],
      client_info: [
        "first_name",
        "last_name",
        "client_name",
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
      product_details: ["product_type", "imported_products"],
      consultation: [
        "consult_booked_date",
        "consult_booked_time",
      ],
      notes: ["affiliate_notes", "notes"],
      other: ["closed_lost_reason"],
      locked: [
        "id", "partnerCode", "idempotencyKey",
        "l1CommissionAmount", "l1CommissionStatus",
        "l2CommissionAmount", "l2CommissionStatus",
        "paymentReceivedAt", "paymentReceivedBy",
        "closeDate (auto-stamped on closedwon/closedlost)",
        "createdAt", "updatedAt",
      ],
    },
    security: {
      api_key:
        "Send X-Fintella-Api-Key header (value = FROST_LAW_API_KEY env var). Legacy x-webhook-secret / Authorization: Bearer still accepted.",
      rate_limit: `${RATE_LIMIT_MAX} requests per ${Math.round(RATE_LIMIT_WINDOW_MS / 1000)}s per API key. 429 with Retry-After if exceeded.`,
      hmac: "Send X-Fintella-Signature: sha256=HEX of HMAC-SHA256(body, WEBHOOK_SECRET). Enforced when WEBHOOK_SECRET env var is set; no-op otherwise.",
      allowed_events: Array.from(ALLOWED_EVENTS),
    },
  });
}

// ─── Request logging wrapper ────────────────────────────────────────────────
// Wraps POST/PATCH handlers to capture every incoming request into
// WebhookRequestLog for inspection in the admin developer panel.
// Auth header values are redacted before storage. Fire-and-forget —
// log writes never block the response to the caller.

const REDACTED_HEADERS = new Set([
  "x-webhook-secret",
  "x-fintella-api-key",
  "authorization",
  "cookie",
]);

async function withApiLog(
  req: NextRequest,
  handler: (req: NextRequest) => Promise<Response>
): Promise<Response> {
  const start = Date.now();

  const sourceIp =
    (req.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || null;

  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k] = REDACTED_HEADERS.has(k.toLowerCase()) ? "[REDACTED]" : v;
  });

  // Clone request before any body reads so the original stream is intact
  // for the handler to consume normally via req.json().
  let bodyStr: string | null = null;
  try {
    bodyStr = await req.clone().text();
    if (bodyStr) bodyStr = bodyStr.slice(0, 10_000);
  } catch {}

  let response: Response;
  let error: string | undefined;
  try {
    response = await handler(req);
  } catch (e: any) {
    error = e?.message || "Unhandled error";
    response = NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  let responseBodyStr: string | null = null;
  try {
    responseBodyStr = (await response.clone().text()).slice(0, 4_000);
  } catch {}

  // Awaited — Vercel kills unawaited promises before they complete.
  await prisma.webhookRequestLog
    .create({
      data: {
        method: req.method,
        path: "/api/webhook/referral",
        sourceIp,
        headers: JSON.stringify(headers),
        body: bodyStr,
        responseStatus: response.status,
        responseBody: responseBodyStr,
        durationMs: Date.now() - start,
        error,
      },
    })
    .catch((e) => console.error("[api-log] write failed:", e));

  return response;
}

// ─── Next.js route exports ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  return withApiLog(req, postHandler);
}

export async function PATCH(req: NextRequest) {
  return withApiLog(req, patchHandler);
}

export function GET() {
  return getHandler();
}
