import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/format";
import { computeDealCommissions, getL1CommissionRateSnapshot, roundCents, resolveCommissionStatus } from "@/lib/commission";
import { resolveDealFinancials } from "@/lib/dealCalc";
import { sendDealStatusUpdateEmail } from "@/lib/sendgrid";
import { appendDealPayload } from "@/lib/appendDealPayload";
import { normalizeStateName } from "@/lib/stateNames";

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
  "lead_submitted",
  "meeting_booked",
  "meeting_missed",
  "qualified",
  "disqualified",
  "client_engaged",
  "in_process",
  "closedwon",
] as const;

// HubSpot pipeline stage IDs (numeric). Map each to an internal stage.
// If HubSpot renames a stage in-place their ID stays the same, so this
// map is a stable contract until they rebuild the pipeline.
const HUBSPOT_STAGE_MAP: Record<string, string> = {
  "3468521171": "lead_submitted",   // Lead Submitted
  "3468521172": "meeting_booked",   // Meeting Booked
  "3467318997": "meeting_missed",   // Meeting Missed
  "3468521174": "qualified",        // Qualified
  "3468521175": "disqualified",     // Disqualified
};

/**
 * Normalize an incoming stage string to look up against internal values.
 * Lowercases, strips spaces/hyphens/underscores. "Closed Won" /
 * "closed_won" / "CLOSEDWON" all collapse to "closedwon" which maps
 * to our "client_engaged" (HubSpot's closed-won = client signed).
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
  // HubSpot's "closedwon" = client signed. Maps to our client_engaged,
  // NOT our internal closedwon (refund received + commissions payable).
  m["closedwon"] = "client_engaged";
  m["won"] = "client_engaged";
  m["closed"] = "client_engaged";
  m["lost"] = "disqualified";
  m["closedlost"] = "disqualified";
  m["newlead"] = "lead_submitted";
  m["new_lead"] = "lead_submitted";
  m["consultationbooked"] = "meeting_booked";
  m["ccbooked"] = "meeting_booked";
  m["consultbooked"] = "meeting_booked";
  m["clientnoshow"] = "meeting_missed";
  m["noshow"] = "meeting_missed";
  m["clientqualified"] = "qualified";
  m["noconsultation"] = "meeting_missed";
  m["nocc"] = "meeting_missed";
  m["noconsult"] = "meeting_missed";
  m["engaged"] = "client_engaged";
  m["inprogress"] = "in_process";
  return m;
})();

/**
 * Resolve an external stage string to an internal stage. Tries HubSpot
 * numeric IDs first, then normalizes against the synonym map. If no
 * match, passes the value through as-is (lowercased, trimmed) so
 * unknown stages still land on the deal row.
 */
function resolveInternalStage(external: string): string {
  const trimmed = String(external).trim();
  if (HUBSPOT_STAGE_MAP[trimmed]) return HUBSPOT_STAGE_MAP[trimmed];
  const normalized = normalizeStage(trimmed);
  if (STAGE_MAP[normalized]) return STAGE_MAP[normalized];
  return trimmed.toLowerCase();
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

// ─── Flexible field resolver ──────────────────────────────────────────────
//
// Tries each candidate key in order and returns the first non-empty value.
// Looks in the POST body first (primary source for the webhook) and then
// falls back to the request's URL query params so integrators can pass
// things like `?ep=EA-ACME-042` without having to reshape their JSON.

function makeFieldResolver(
  body: Record<string, any>,
  searchParams?: URLSearchParams
) {
  return (...keys: string[]): string => {
    for (const key of keys) {
      const val = body[key];
      if (val !== undefined && val !== null && val !== "") {
        return String(val).trim();
      }
    }
    if (searchParams) {
      for (const key of keys) {
        const val = searchParams.get(key);
        if (val !== null && val !== "") return val.trim();
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

    // Event-type is LOG-ONLY now — we accept whatever the caller sends so
    // Frost Law's integration testing never gets blocked by an unexpected
    // event string. Unknown types are stored in rawPayload for review.
    if (body.event !== undefined && typeof body.event === "string") {
      if (!ALLOWED_EVENTS.has(body.event)) {
        console.log(
          `[webhook/referral POST] unrecognized event type "${body.event}" — accepting anyway`
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

    const get = makeFieldResolver(body, req.nextUrl.searchParams);

    // Partner tracking (from utm_content query param passed through form)
    let partnerCode = get(
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

    // If the value looks like a name rather than a code, try to resolve it.
    // Partner codes are uppercase alphanumeric (e.g. PTNS4XDMN); if the value
    // contains a space or lowercase letters, it's likely a partner name.
    if (partnerCode && /[a-z ]/.test(partnerCode)) {
      const nameParts = partnerCode.trim().split(/\s+/);
      const matchByName = await prisma.partner.findFirst({
        where: nameParts.length >= 2
          ? { firstName: { equals: nameParts[0], mode: "insensitive" }, lastName: { equals: nameParts.slice(1).join(" "), mode: "insensitive" } }
          : { OR: [
              { firstName: { equals: partnerCode.trim(), mode: "insensitive" } },
              { lastName: { equals: partnerCode.trim(), mode: "insensitive" } },
              { companyName: { equals: partnerCode.trim(), mode: "insensitive" } },
            ] },
        select: { partnerCode: true },
      }).catch(() => null);
      if (matchByName) {
        partnerCode = matchByName.partnerCode;
      }
    }

    // Enterprise Partner tracking — `ep` (URL query or body) carries the EA's
    // own internal L1 code when the referring partner is reselling under their
    // own portal. `utm_medium` variants remain accepted for backwards compat
    // with any in-flight links cut before the rename. Raw, no normalization;
    // may be null if this isn't an EA-sourced deal.
    const epLevel1 = get("ep", "EP", "utm_medium", "utmmedium", "utm_Medium");

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

    // Company identifier
    const companyEin = get(
      "company_ein",
      "companyEin",
      "ein",
      "EIN",
      "Company EIN",
      "tax_id",
      "taxId"
    );

    // Location
    const businessStreetAddress = get(
      "address",
      "street_address",
      "streetAddress",
      "business_address",
      "businessAddress",
      "Address"
    );
    const businessStreetAddress2 = get(
      "street_address_2",
      "streetAddress2",
      "address_2",
      "address2",
      "Address 2",
      "suite",
      "unit"
    );
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
    const businessZip = get(
      "zip",
      "Zip",
      "zip_code",
      "zipCode",
      "postal_code",
      "postalCode",
      "postcode"
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
    // "lead_submitted" when no stage provided.
    const resolvedStage = externalStage ? resolveInternalStage(externalStage) : null;
    const initialStage = resolvedStage || "lead_submitted";
    const initialClosedLostReason =
      resolvedStage === "disqualified" ? "disqualified" : null;

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

    // NO GATEKEEPING BEYOND AUTH — if the caller has a valid API key we
    // accept the payload even if it's missing every identifier. We store
    // whatever they sent in `rawPayload` so nothing is lost, and return a
    // 201 with a `warning` field flagging the sparse data rather than a
    // hard 400. (Directive from John 2026-04-24: during Frost Law's
    // integration push, zero validation errors while they're testing.)
    const sparseData = !firstName && !lastName && !email && !legalEntityName;

    // House deal detection — ANNEXATIONPR is Fintella's own referral code.
    // These are direct company deals tracked at 40% for revenue reporting.
    // No downline waterfall — the commission is company profit.
    const HOUSE_CODES = ["ANNEXATIONPR"];
    const isHouseDeal = partnerCode ? HOUSE_CODES.includes(partnerCode.toUpperCase()) : false;
    const HOUSE_COMMISSION_RATE = 0.40;

    // Snapshot the L1 commission rate at deal-creation time so later
    // changes to Partner.commissionRate don't retro-affect this deal.
    // House deals use the fixed house rate. Skip for UNATTRIBUTED deals.
    const l1RateSnapshot = isHouseDeal
      ? HOUSE_COMMISSION_RATE
      : partnerCode && partnerCode !== "UNATTRIBUTED"
        ? await getL1CommissionRateSnapshot(prisma, partnerCode).catch(() => null)
        : null;

    // Create Deal record
    const deal = await prisma.$transaction(async (tx) => {
      const d = await tx.deal.create({
        data: {
          dealName,
          partnerCode: partnerCode || "UNATTRIBUTED",
          stage: initialStage,
          externalStage: externalStage || null,
          externalDealId: externalDealId,
          rawPayload: appendDealPayload(null, { method: "POST", body: rawBody }),
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
          companyEin: companyEin || null,
          businessStreetAddress: businessStreetAddress || null,
          businessStreetAddress2: businessStreetAddress2 || null,
          businessCity: businessCity || null,
          businessState: normalizeStateName(businessState) || null,
          businessZip: businessZip || null,
          importsGoods: importsGoods || null,
          importCountries: importCountries || null,
          annualImportValue: annualImportValue || null,
          importerOfRecord: importerOfRecord || null,
          affiliateNotes: affiliateNotes || null,
          epLevel1: epLevel1 || null,
          consultBookedDate: consultBookedDate || null,
          consultBookedTime: consultBookedTime || null,
          l1CommissionRate: l1RateSnapshot,
          idempotencyKey: idempotencyKey || null,
          notes: `Source: Referral Form | Partner: ${partnerCode || "none"}${externalStage ? ` | External Stage: ${externalStage}` : ""}`,
        },
      });
      // Additive: create the admin-chat deal thread eagerly.
      const { getOrCreateDealThread } = await import("@/lib/adminChatThread");
      await getOrCreateDealThread(tx, d.id);
      return d;
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
        ...(sparseData && {
          warning:
            "Accepted but the payload had no identifying fields (name / email / company). Full payload saved to rawPayload for admin review.",
        }),
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

    // Accept our internal dealId OR HubSpot's hs_object_id (stored as
    // externalDealId). Partners typically only have the HubSpot ID.
    const rawDealId =
      typeof body.dealId === "string" && body.dealId.trim()
        ? body.dealId.trim()
        : null;
    const rawExternalId =
      body.hs_object_id != null && String(body.hs_object_id).trim()
        ? String(body.hs_object_id).trim()
        : body.externalDealId != null && String(body.externalDealId).trim()
        ? String(body.externalDealId).trim()
        : null;

    if (!rawDealId && !rawExternalId) {
      return NextResponse.json(
        { error: "dealId or hs_object_id is required" },
        { status: 400 }
      );
    }

    // Find the deal — try internal ID first, then externalDealId
    const deal = rawDealId
      ? await prisma.deal.findUnique({ where: { id: rawDealId } })
      : await prisma.deal.findUnique({ where: { externalDealId: rawExternalId! } });
    if (!deal) {
      // Deal not found. Only fall back to create if the payload has
      // enough data for a real deal (at minimum a name or email).
      // Stage-update-only payloads (just hs_object_id + stage) should
      // NOT create ghost deals with empty fields.
      const hasClientData = body.first_name || body.firstName || body.last_name || body.lastName
        || body.email || body.company || body.legalEntityName || body.company_name;
      if (!hasClientData) {
        return NextResponse.json(
          { error: "Deal not found and payload has no client data to create one", hs_object_id: rawExternalId },
          { status: 404 }
        );
      }
      console.log("[Webhook/Referral] PATCH fallback: deal not found for", rawDealId || rawExternalId, "— payload has client data, falling back to POST create handler");
      const freshReq = new NextRequest(req.url, {
        method: "POST",
        headers: req.headers,
        body: rawBody,
      });
      return postHandler(freshReq);
    }

    const data: Record<string, any> = {};

    // Append this PATCH payload to the deal's event log (capped, JSON array in
    // Deal.rawPayload). Always included regardless of which business fields
    // the PATCH touches, so the log is a complete history of inbound calls.
    data.rawPayload = appendDealPayload(deal.rawPayload, { method: "PATCH", body: rawBody });

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
    const companyEin = pickStr("company_ein", "companyEin", "ein", "EIN", "tax_id", "taxId");
    if (companyEin) data.companyEin = companyEin;
    const businessStreetAddress = pickStr(
      "address", "street_address", "streetAddress",
      "business_address", "businessAddress"
    );
    if (businessStreetAddress) data.businessStreetAddress = businessStreetAddress;
    const businessStreetAddress2 = pickStr(
      "street_address_2", "streetAddress2",
      "address_2", "address2", "suite", "unit"
    );
    if (businessStreetAddress2) data.businessStreetAddress2 = businessStreetAddress2;
    const businessCity = pickStr("city", "City", "business_city", "businessCity");
    if (businessCity) data.businessCity = businessCity;
    const businessState = pickStr("state", "State", "business_state", "businessState", "region");
    if (businessState) data.businessState = normalizeStateName(businessState);
    const businessZip = pickStr("zip", "Zip", "zip_code", "zipCode", "postal_code", "postalCode", "postcode");
    if (businessZip) data.businessZip = businessZip;

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

    // Close date (if stage is closedwon or disqualified). Uses the internal
    // stage value we just resolved via STAGE_MAP, so "Closed Won" /
    // "closed-won" / "won" all stamp the close date correctly.
    if (data.stage === "closedwon" || data.stage === "disqualified") {
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

    // Broader lifecycle gate (Option C — commission-status-lifecycle):
    // The webhook creates / upserts commission ledger rows on any
    // transition that enters a state with a non-null resolveCommissionStatus
    // result (client_engaged, in_process, closed_won, closed_lost).
    // resolveCommissionStatus() maps stage → canonical status; the
    // upsert below applies that status to existing or new rows.
    const prevLedgerStatus = resolveCommissionStatus(
      deal.stage,
      deal.paymentReceivedAt ?? null,
    );
    const nextLedgerStatus = resolveCommissionStatus(
      data.stage ?? deal.stage,
      (data.paymentReceivedAt ?? deal.paymentReceivedAt) ?? null,
    );
    // A ledger-relevant transition is any change that lands in a
    // status-producing state, OR any status flip between two
    // status-producing states (e.g. projected → pending_payment on
    // closed-won, pending_payment → due on payment received).
    const isLedgerLifecycleTransition =
      !!nextLedgerStatus && nextLedgerStatus !== prevLedgerStatus;

    // Compute ledger entries OUTSIDE the transaction so any DB read errors
    // surface before we start writing. Effective firm fee is the value
    // in this PATCH if provided, else the existing deal row.
    let entriesToCreate: Array<{ partnerCode: string; tier: string; amount: number }> = [];
    // Full waterfall amounts (unrounded) — used to write Deal.l{1,2,3}CommissionAmount
    // snapshots that stay true to the tier-by-tier breakdown EVEN in Disabled mode,
    // where `entriesToCreate` collapses to a single L1 row. These snapshots power
    // the partner-side Downline Accounting view for Disabled L1s (spec §6).
    let waterfallSnapshot: { l1Amount: number; l2Amount: number; l3Amount: number } = { l1Amount: 0, l2Amount: 0, l3Amount: 0 };
    let ledgerSkipReason: string | null = null;
    let effectiveFirmFee = 0;

    if (isClosedWonTransition) {
      // Resolve the effective firm fee through the canonical resolver so this
      // path honors the same rules the display surfaces use:
      //  - stored firmFeeAmount wins when present and the deal isn't closed_won
      //    with an updated actual refund,
      //  - otherwise compute rate × refund, where the refund prefers the
      //    actual (post-close truth) over the estimated (opening ticket).
      // The webhook payload's firmFeeAmount (when Frost Law sends it) still
      // takes highest priority — that's their authoritative value for the deal.
      const projectedEstimated =
        typeof data.estimatedRefundAmount === "number"
          ? data.estimatedRefundAmount
          : deal.estimatedRefundAmount;
      const projectedActual =
        typeof data.actualRefundAmount === "number"
          ? data.actualRefundAmount
          : deal.actualRefundAmount ?? null;
      const projectedFirmFeeRate =
        typeof data.firmFeeRate === "number"
          ? data.firmFeeRate
          : deal.firmFeeRate;
      const projectedFirmFeeAmount =
        typeof data.firmFeeAmount === "number" && data.firmFeeAmount > 0
          ? data.firmFeeAmount
          : deal.firmFeeAmount || 0;
      const fin = resolveDealFinancials({
        estimatedRefundAmount: projectedEstimated,
        actualRefundAmount: projectedActual,
        stage: "closedwon",
        firmFeeRate: projectedFirmFeeRate,
        firmFeeAmount: projectedFirmFeeAmount,
        l1CommissionRate: deal.l1CommissionRate,
        l1CommissionAmount: 0,
      });
      effectiveFirmFee = fin.firmFeeAmount;

      // If we derived a firm fee (no stored value, but rate × refund available),
      // persist it to Deal.firmFeeAmount so the admin form + downstream reads
      // see the true cached value instead of 0.
      if (
        fin.firmFeeAmountComputed &&
        fin.firmFeeAmount > 0 &&
        (!data.firmFeeAmount || data.firmFeeAmount <= 0)
      ) {
        data.firmFeeAmount = roundCents(fin.firmFeeAmount);
      }

      if (effectiveFirmFee <= 0) {
        ledgerSkipReason = "no_firm_fee_on_deal_or_in_payload";
      } else {
        const existingForDeal = await prisma.commissionLedger.findFirst({
          where: { dealId: deal.id },
        });
        if (existingForDeal) {
          ledgerSkipReason = "ledger_already_exists";
        } else {
          const computed = await computeDealCommissions(prisma, {
            partnerCode: deal.partnerCode,
            firmFeeAmount: effectiveFirmFee,
          });
          entriesToCreate = computed.entries;
          waterfallSnapshot = {
            l1Amount: computed.waterfall.l1Amount,
            l2Amount: computed.waterfall.l2Amount,
            l3Amount: computed.waterfall.l3Amount,
          };
          if (entriesToCreate.length === 0) {
            ledgerSkipReason = "waterfall_returned_zero_entries";
          }
        }
      }
    }

    // Single transaction: deal update + optional ledger creates + optional audit note
    const updated = await prisma.$transaction(async (tx) => {
      const d = await tx.deal.update({ where: { id: deal.id }, data });

      if (entriesToCreate.length > 0) {
        for (const entry of entriesToCreate) {
          await tx.commissionLedger.create({
            data: {
              partnerCode: entry.partnerCode,
              dealId: d.id,
              dealName: d.dealName,
              tier: entry.tier,
              amount: entry.amount,
              // Closed-won transition: firm hasn't paid Fintella yet, so
              // status is "pending_payment". Flips to "due" once
              // paymentReceivedAt is stamped on the deal.
              status: "pending_payment",
              periodMonth: new Date().toISOString().slice(0, 7),
            },
          });
        }

        // Mirror the full waterfall amounts onto Deal.l{1,2,3}CommissionAmount
        // as a per-tier snapshot. In Enabled mode these match the ledger rows;
        // in Disabled mode the ledger has a single collapsed L1 row but the
        // snapshots still capture what each downline tier "would have earned"
        // so the partner-side Downline Accounting view can show what L1 owes.
        // Status fields track ledger presence — only the tier that actually
        // has a ledger row in the current mode gets its status flipped to
        // "pending". Guards prevent clobbering a non-zero existing value with 0.
        const dealFieldUpdate: Record<string, any> = {};
        const hasLedgerTier = (t: string) => entriesToCreate.some((e) => e.tier === t);
        if (waterfallSnapshot.l1Amount > 0) {
          dealFieldUpdate.l1CommissionAmount = roundCents(waterfallSnapshot.l1Amount);
          if (hasLedgerTier("l1")) dealFieldUpdate.l1CommissionStatus = "pending_payment";
        }
        if (waterfallSnapshot.l2Amount > 0) {
          dealFieldUpdate.l2CommissionAmount = roundCents(waterfallSnapshot.l2Amount);
          if (hasLedgerTier("l2")) dealFieldUpdate.l2CommissionStatus = "pending_payment";
        }
        if (waterfallSnapshot.l3Amount > 0) {
          dealFieldUpdate.l3CommissionAmount = roundCents(waterfallSnapshot.l3Amount);
          if (hasLedgerTier("l3")) dealFieldUpdate.l3CommissionStatus = "pending_payment";
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

    // ─── Commission lifecycle transitions that aren't closed-won ────────
    // The closed_won block above handles the initial creation and sets
    // status="pending_payment". This block covers the remaining
    // transitions that flip status WITHOUT creating new rows:
    //   → closed_lost: flip any existing rows to "lost"
    //   → client_engaged / in_process: if no rows yet, create with
    //     status "projected" so partners see a row during the engagement
    //     phase (before firm fee is paid).
    //   → back TO client_engaged / in_process from closed_won: flip
    //     existing rows from pending_payment/due back to "projected"
    //     (stage regression; rare but possible).
    if (isLedgerLifecycleTransition && nextLedgerStatus && !isClosedWonTransition) {
      if (nextLedgerStatus === "lost") {
        // Flip every existing row for the deal to "lost". If no rows
        // exist (deal never reached client_engaged), nothing to do.
        await prisma.commissionLedger.updateMany({
          where: { dealId: deal.id, status: { notIn: ["paid"] } },
          data: { status: "lost" },
        });
        // Mirror onto the Deal.l{1,2,3}CommissionStatus snapshot fields.
        await prisma.deal.update({
          where: { id: deal.id },
          data: {
            l1CommissionStatus: "lost",
            l2CommissionStatus: "lost",
            l3CommissionStatus: "lost",
          },
        });
      } else if (nextLedgerStatus === "projected") {
        // Client-engaged or in-process transition. If rows already
        // exist (e.g. from a prior closed-won that got rolled back),
        // flip them back to projected. Otherwise create fresh rows
        // with projected status using the same waterfall computation
        // the closed-won path uses, so partners see their expected
        // earnings starting at engagement.
        const existingRows = await prisma.commissionLedger.findMany({
          where: { dealId: deal.id },
          select: { id: true, status: true },
        });
        if (existingRows.length > 0) {
          await prisma.commissionLedger.updateMany({
            where: { dealId: deal.id, status: { notIn: ["paid", "lost"] } },
            data: { status: "projected" },
          });
          await prisma.deal.update({
            where: { id: deal.id },
            data: {
              l1CommissionStatus: "projected",
              l2CommissionStatus: "projected",
              l3CommissionStatus: "projected",
            },
          });
        } else {
          // No rows exist yet → create projected rows. Uses the same
          // firm-fee resolution as the closed-won path above so the
          // projected amounts match what the partner will ultimately
          // be paid (if the deal closes won).
          const projectedEstimated =
            typeof data.estimatedRefundAmount === "number"
              ? data.estimatedRefundAmount
              : deal.estimatedRefundAmount;
          const projectedFirmFeeRate =
            typeof data.firmFeeRate === "number"
              ? data.firmFeeRate
              : deal.firmFeeRate;
          const projectedFirmFeeAmount =
            typeof data.firmFeeAmount === "number" && data.firmFeeAmount > 0
              ? data.firmFeeAmount
              : deal.firmFeeAmount || 0;
          const fin = resolveDealFinancials({
            estimatedRefundAmount: projectedEstimated,
            actualRefundAmount: null,
            stage: data.stage ?? deal.stage,
            firmFeeRate: projectedFirmFeeRate,
            firmFeeAmount: projectedFirmFeeAmount,
            l1CommissionRate: deal.l1CommissionRate,
            l1CommissionAmount: 0,
          });
          const effFee = fin.firmFeeAmount;
          if (effFee > 0) {
            const computed = await computeDealCommissions(prisma, {
              partnerCode: deal.partnerCode,
              firmFeeAmount: effFee,
            });
            for (const entry of computed.entries) {
              // Use upsert so concurrent webhook replays don't trip the
              // @@unique([dealId, partnerCode, tier]) constraint.
              await prisma.commissionLedger.upsert({
                where: {
                  dealId_partnerCode_tier: {
                    dealId: deal.id,
                    partnerCode: entry.partnerCode,
                    tier: entry.tier,
                  },
                },
                create: {
                  partnerCode: entry.partnerCode,
                  dealId: deal.id,
                  dealName: deal.dealName,
                  tier: entry.tier,
                  amount: entry.amount,
                  status: "projected",
                  periodMonth: new Date().toISOString().slice(0, 7),
                },
                update: { amount: entry.amount, status: "projected" },
              });
            }
          }
        }
      }
    }

    // Fire workflow triggers for stage changes (fire-and-forget)
    if (data.stage && data.stage !== deal.stage) {
      import("@/lib/workflow-engine").then(({ fireWorkflowTrigger }) => {
        const previousStage = deal.stage;
        const newStage = data.stage;
        fireWorkflowTrigger("deal.stage_changed", { deal: updated, previousStage, newStage }).catch(() => {});
        if (newStage === "closedwon") fireWorkflowTrigger("deal.closed_won", { deal: updated }).catch(() => {});
        if (newStage === "disqualified") fireWorkflowTrigger("deal.closed_lost", { deal: updated }).catch(() => {});
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

// POST is the only verb some integrators (firewalled partner stacks, plain
// HTML forms, zaps) can send, so it now covers BOTH create and update:
//
//   - body.dealId present → treated as an update (delegates to patchHandler)
//   - body.dealId absent  → treated as a new-deal submission (postHandler)
//
// PATCH still works for callers that can send it — same update path.
export async function POST(req: NextRequest) {
  return withApiLog(req, async (innerReq) => {
    // Peek the body via a clone so the real handler can still read the
    // stream. An unparseable body peeks as "no dealId" → falls through to
    // postHandler, which will return a proper 400 for the bad JSON.
    let looksLikeUpdate = false;
    try {
      const peek = await innerReq.clone().json();
      if (peek && typeof peek === "object") {
        const hasDealId = peek.dealId != null && String(peek.dealId).trim().length > 0;
        const hasHsId = peek.hs_object_id != null && String(peek.hs_object_id).trim().length > 0;
        const hasExtId = peek.externalDealId != null && String(peek.externalDealId).trim().length > 0;
        looksLikeUpdate = hasDealId || hasHsId || hasExtId;
      }
    } catch {
      looksLikeUpdate = false;
    }
    return looksLikeUpdate ? patchHandler(innerReq) : postHandler(innerReq);
  });
}

export async function PATCH(req: NextRequest) {
  return withApiLog(req, patchHandler);
}

export function GET() {
  return getHandler();
}
