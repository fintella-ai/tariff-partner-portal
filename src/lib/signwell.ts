/**
 * SignWell API Client
 *
 * Handles sending partnership agreements for e-signing via SignWell.
 * When SIGNWELL_API_KEY is not set, operates in demo mode with mock responses.
 */

const SIGNWELL_API_KEY = process.env.SIGNWELL_API_KEY || "";
const SIGNWELL_API_BASE = "https://www.signwell.com/api/v1";
const SIGNWELL_API_APP_ID = process.env.SIGNWELL_API_APP_ID || "";

interface SignWellRecipient {
  id: string;
  email: string;
  name: string;
  role: string;
}

/**
 * A SignWell template field pre-fill.
 *
 * When using a template, SignWell lets the API caller pre-populate field
 * values by referencing either the field's `api_id` (preferred — stable,
 * set by the template designer in the SignWell UI) or — as a last resort —
 * the human-readable field label.
 *
 * Admins map partner data to template fields by setting matching `api_id`
 * values on their SignWell templates (e.g. `partner_name`, `partner_email`,
 * `partner_company`, `partner_street`, `partner_city`, `partner_state`,
 * `partner_zip`, `partner_tin`, `partner_commission_rate_pct`).
 * Any field whose api_id is not present in the template is silently ignored
 * by SignWell, so over-sending is safe.
 */
export interface SignWellTemplateField {
  api_id: string;
  value: string;
}

interface SignWellSendOptions {
  name: string;
  subject: string;
  message: string;
  recipients: SignWellRecipient[];
  templateId?: string;
  fileUrl?: string;
  templateFields?: SignWellTemplateField[];
}

/**
 * Partner data shape used for building template field pre-fills.
 * Kept loose so the various route handlers can pass whatever they have
 * loaded from Prisma without needing to match a strict type.
 */
export interface PartnerTemplateContext {
  partnerCode: string;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
  companyName?: string | null;
  title?: string | null;
  tin?: string | null;
  ssn?: string | null; // ###-##-#### if no TIN
  commissionRate?: number | null; // 0.25, 0.20, 0.15, 0.10
  street?: string | null;
  street2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
}

/**
 * Render a decimal commission rate (0.25) as its written-out English word
 * form ("twenty-five") so SignWell templates can embed both a numeric and
 * a textual version of the rate in the contract body. The template supplies
 * the surrounding words ("percent", "%") so this helper returns the bare
 * spelled number — e.g. "twenty-eight", not "twenty-eight percent".
 * Returns empty string for a non-integer or out-of-range rate so the
 * template field just renders blank.
 */
function commissionRateToText(rate: number | null | undefined): string {
  if (typeof rate !== "number" || !isFinite(rate)) return "";
  const pct = Math.round(rate * 100);
  if (pct < 1 || pct > 99) return "";

  const ones = [
    "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
    "sixteen", "seventeen", "eighteen", "nineteen",
  ];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

  if (pct < 20) return ones[pct];
  const t = Math.floor(pct / 10);
  const o = pct % 10;
  return o === 0 ? tens[t] : `${tens[t]}-${ones[o]}`;
}

/**
 * Build a SignWell `template_fields` payload from a partner record + profile.
 *
 * This produces a reasonable default set of api_ids that an admin can wire
 * into any SignWell partnership agreement template. Because SignWell ignores
 * unknown api_ids, we send the full set every time — the template only
 * consumes what it declares.
 *
 * Admins configuring templates in SignWell should set the `api_id` (not the
 * display label) on each field in the template editor to match these names.
 */
export function buildPartnerTemplateFields(
  ctx: PartnerTemplateContext
): SignWellTemplateField[] {
  const fullName =
    ctx.fullName ||
    [ctx.firstName, ctx.lastName].filter(Boolean).join(" ").trim() ||
    "";
  const ratePct =
    typeof ctx.commissionRate === "number"
      ? `${Math.round(ctx.commissionRate * 100)}`
      : "";
  const today = new Date();
  const todayStr = today.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const commissionText = commissionRateToText(ctx.commissionRate);

  const fields: Array<[string, string | null | undefined]> = [
    ["partner_code", ctx.partnerCode],
    ["partner_name", fullName],
    ["partner_name1", fullName],
    ["partner_name2", fullName],
    ["partner_name3", fullName],
    ["partner_first_name", ctx.firstName || ""],
    ["partner_last_name", ctx.lastName || ""],
    ["partner_email", ctx.email || ""],
    ["partner_phone", ctx.phone || ctx.mobilePhone || ""],
    ["partner_mobile", ctx.mobilePhone || ""],
    ["partner_company", ctx.companyName || ""],
    ["partner_company1", ctx.companyName || ""],
    ["partner_company2", ctx.companyName || ""],
    ["partner_company3", ctx.companyName || ""],
    ["partner_title", ctx.title || ""],
    ["partner_title1", ctx.title || ""],
    ["partner_title2", ctx.title || ""],
    ["partner_tin", ctx.tin || ""],
    ["partner_ssn", ctx.ssn || ""],
    ["partner_commission_rate", ratePct],
    ["partner_commission_rate_pct", ratePct],
    ["partner_commission_text", commissionText],
    ["partner_street", ctx.street || ""],
    ["partner_street2", ctx.street2 || ""],
    ["partner_city", ctx.city || ""],
    ["partner_state", ctx.state || ""],
    ["partner_zip", ctx.zip || ""],
    ["partner_country", ctx.country || "US"],
    ["agreement_date", todayStr],
    ["signed_agreement_date", todayStr],
  ];

  return fields
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([api_id, value]) => ({ api_id, value: String(value) }));
}

/**
 * Map a partner commission rate to the configured SignWell template id.
 * Returns an empty string when no template is set — callers should then
 * fall through to the file-based send path.
 */
export function resolveAgreementTemplateId(
  rate: number | null | undefined,
  settings: {
    agreementTemplateMaster?: string | null;
    agreementTemplate25?: string | null;
    agreementTemplate20?: string | null;
    agreementTemplate15?: string | null;
    agreementTemplate10?: string | null;
  } | null
): { templateId: string; templateRate: number } {
  if (!settings) return { templateId: "", templateRate: rate || 0 };
  const r = rate ?? 0;

  // Option B Phase 3: prefer the single master template when it's
  // configured. The recruit's actual rate is surfaced in the agreement
  // body via the `partner_commission_rate` / `partner_commission_text`
  // template fields (see buildPartnerTemplateFields), so we don't need
  // to snap to a bucket — pass `r` through as-is.
  if (settings.agreementTemplateMaster) {
    return { templateId: settings.agreementTemplateMaster, templateRate: r };
  }

  // Legacy fallback (to be dropped in Phase 6): snap to the closest
  // configured rate bucket when the master field is still empty.
  if (r >= 0.25) return { templateId: settings.agreementTemplate25 || "", templateRate: 0.25 };
  if (r >= 0.20) return { templateId: settings.agreementTemplate20 || "", templateRate: 0.20 };
  if (r >= 0.15) return { templateId: settings.agreementTemplate15 || "", templateRate: 0.15 };
  if (r >= 0.10) return { templateId: settings.agreementTemplate10 || "", templateRate: 0.10 };
  return { templateId: "", templateRate: r };
}

interface SignWellDocumentResponse {
  id: string;
  status: string;
  name: string;
  recipients: SignWellRecipient[];
  created_at: string;
  completed_at: string | null;
  original_file_url: string | null;
  completed_pdf_url: string | null;
  embedded_signing_url?: string;
  recipients_with_urls?: Array<{
    id: string;
    email: string;
    embedded_signing_url: string;
  }>;
}

/**
 * Check if SignWell is configured with a real API key.
 */
export function isSignWellConfigured(): boolean {
  return !!SIGNWELL_API_KEY;
}

/**
 * Send a document for signing via SignWell API.
 * Returns the SignWell document ID for tracking.
 */
export async function sendForSigning(
  options: SignWellSendOptions
): Promise<{ documentId: string; status: string; embeddedSigningUrl: string | null; cosignerSigningUrl?: string | null }> {
  // Demo mode — return a mock document ID with a demo signing URL
  if (!SIGNWELL_API_KEY) {
    const mockId = `demo-sw-${Date.now()}`;
    return { documentId: mockId, status: "pending", embeddedSigningUrl: null };
  }

  // Per SignWell API docs (developers.signwell.com/reference/createdocumentfromtemplate):
  //   Endpoint: POST /api/v1/document_templates/documents
  //   template_id goes in the BODY (not the URL path)
  //   Recipients key is "recipients" (not "signees")
  //   Field pre-fills key is "template_fields"
  //   Each recipient needs "id" matching the template placeholder id
  const usingTemplate = !!options.templateId;

  // For template sends, fetch the template to get:
  //   1. placeholder name→id map (recipients need `id` matching placeholder id)
  //   2. set of valid field api_ids (SignWell rejects unknown api_ids)
  //   3. locked field types to skip (autofill_date_signed can't be pre-filled)
  let placeholderIdByName: Record<string, string> = {};
  let validFieldApiIds: Set<string> = new Set();
  const LOCKED_FIELD_TYPES = new Set(["autofill_date_signed", "signature"]);
  if (usingTemplate) {
    try {
      const tplRes = await fetch(
        `${SIGNWELL_API_BASE}/document_templates/${options.templateId}`,
        {
          headers: {
            "X-Api-Key": SIGNWELL_API_KEY,
            Accept: "application/json",
          },
        }
      );
      if (tplRes.ok) {
        const tpl = await tplRes.json();
        // Build placeholder name→id map
        const placeholders: Array<{ id?: string; name?: string }> =
          Array.isArray(tpl.placeholders) ? tpl.placeholders : [];
        for (const p of placeholders) {
          if (p.name && p.id) placeholderIdByName[p.name] = p.id;
        }
        // Build set of pre-fillable field api_ids from the template.
        // Fields is a 2D array; flatten and collect api_ids, skipping
        // locked types (signatures, auto-dated fields).
        const allFields: Array<{ api_id?: string; type?: string }> =
          Array.isArray(tpl.fields) ? tpl.fields.flat() : [];
        for (const f of allFields) {
          if (f.api_id && !LOCKED_FIELD_TYPES.has(f.type || "")) {
            validFieldApiIds.add(f.api_id);
          }
        }
      } else {
        console.warn("[signwell] Failed to fetch template:", tplRes.status);
      }
    } catch (e) {
      console.warn("[signwell] Template lookup error:", e);
    }
  }

  // Case-insensitive placeholder resolver. Admins type the template
  // placeholder name into PortalSettings (e.g. "Fintella") but the
  // template definition may use different casing ("fintella"), which
  // SignWell treats as a different placeholder and 422s with
  // `missing_placeholder_names`. Resolve to the template's canonical
  // casing so the binding lands whichever form the admin typed.
  const placeholderNameLookup: Record<string, string> = {};
  for (const name of Object.keys(placeholderIdByName)) {
    placeholderNameLookup[name.toLowerCase()] = name;
  }
  const recipients = options.recipients.map((r, idx) => {
    const recipient: Record<string, any> = {
      email: r.email,
      name: r.name,
      signing_order: idx + 1,
    };
    if (usingTemplate) {
      const canonical = placeholderNameLookup[r.role.toLowerCase()] || r.role;
      recipient.id = placeholderIdByName[canonical] || String(idx + 1);
      recipient.placeholder_name = canonical;
    } else {
      recipient.id = r.id;
    }
    return recipient;
  });

  const body: Record<string, any> = {
    name: options.name,
    subject: options.subject,
    message: options.message,
    recipients,
    reminders: true,
    apply_signing_order: options.recipients.length > 1,
    // embedded_signing: true makes SignWell return a signing URL.
    // We NEVER iframe — always window.open() in new tab.
    // embedded_signing_notifications: true tells SignWell to email
    // the next signer after the previous one completes.
    embedded_signing: true,
    embedded_signing_notifications: true,
  };

  if (usingTemplate) {
    // Template send: template_id in body, template_fields for pre-fills.
    // Filter to only api_ids that exist on the template and aren't locked —
    // SignWell rejects unknown api_ids (not silently ignored).
    body.template_id = options.templateId;
    if (options.templateFields && options.templateFields.length > 0) {
      const filtered = validFieldApiIds.size > 0
        ? options.templateFields.filter((f) => validFieldApiIds.has(f.api_id))
        : options.templateFields;
      if (filtered.length > 0) {
        body.template_fields = filtered;
      }
    }
  } else if (options.fileUrl) {
    // Non-template send: attach file
    body.files = [{ file_url: options.fileUrl }];
  }

  // Attach API App ID for branded signing experience if configured
  if (SIGNWELL_API_APP_ID) {
    body.api_application_id = SIGNWELL_API_APP_ID;
  }

  // Template docs: POST /document_templates/documents
  // Regular docs:  POST /documents
  const url = usingTemplate
    ? `${SIGNWELL_API_BASE}/document_templates/documents`
    : `${SIGNWELL_API_BASE}/documents`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": SIGNWELL_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`SignWell API error (${res.status}): ${errText}`);
  }

  const doc = await res.json();

  // Extract signing URLs from response — opens in new tab, never iframe
  const allRecipients = doc.recipients_with_urls || doc.recipients || doc.signees || [];
  const signingUrl = allRecipients[0]?.embedded_signing_url || doc.embedded_signing_url || null;
  const cosignerUrl = allRecipients[1]?.embedded_signing_url || null;

  return { documentId: doc.id, status: "pending", embeddedSigningUrl: signingUrl, cosignerSigningUrl: cosignerUrl };
}

/**
 * Get the current status of a SignWell document.
 */
export async function getDocumentStatus(
  documentId: string
): Promise<{ status: string; completedAt: string | null; documentUrl: string | null }> {
  // Demo mode
  if (!SIGNWELL_API_KEY) {
    return { status: "pending", completedAt: null, documentUrl: null };
  }

  const res = await fetch(`${SIGNWELL_API_BASE}/documents/${documentId}`, {
    headers: { "X-Api-Key": SIGNWELL_API_KEY },
  });

  if (!res.ok) {
    throw new Error(`SignWell API error (${res.status})`);
  }

  const doc: SignWellDocumentResponse = await res.json();

  let status = "pending";
  if (doc.status === "completed") status = "signed";
  else if (doc.status === "expired") status = "expired";

  return {
    status,
    completedAt: doc.completed_at,
    documentUrl: doc.completed_pdf_url || doc.original_file_url,
  };
}

/**
 * Retrieve the persistent URL to the completed (fully-signed) PDF.
 *
 * Per SignWell docs (developers.signwell.com/reference/getcompletedpdf):
 *   GET /documents/{id}/completed_pdf?url_only=true
 *   → { file_url: "https://files.signwell.com/..." }
 *
 * The returned file_url is a pre-signed S3 URL that works without the API
 * key, so it's safe to persist on the Document row and hand directly to
 * the browser for view/download.
 *
 * Returns null in demo mode or if SignWell rejects (e.g. document not
 * fully signed yet).
 */
export async function getCompletedPdfUrl(
  documentId: string
): Promise<string | null> {
  if (!SIGNWELL_API_KEY) return null;

  // audit_page=true → SignWell appends the signed audit trail to the PDF,
  // giving us the legally-defensible record alongside the agreement body.
  const res = await fetch(
    `${SIGNWELL_API_BASE}/documents/${documentId}/completed_pdf?url_only=true&audit_page=true`,
    {
      headers: {
        "X-Api-Key": SIGNWELL_API_KEY,
        Accept: "application/json",
      },
    }
  );

  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  return data?.file_url || null;
}

/**
 * Fetch completed document field values from SignWell.
 * Returns a map of api_id → value for all fields the signer filled in.
 */
export async function getCompletedDocumentFields(
  documentId: string
): Promise<Record<string, string>> {
  if (!SIGNWELL_API_KEY) return {};
  try {
    const res = await fetch(`${SIGNWELL_API_BASE}/documents/${documentId}`, {
      headers: { "X-Api-Key": SIGNWELL_API_KEY },
    });
    if (!res.ok) return {};
    const doc = await res.json();
    const fieldMap: Record<string, string> = {};
    const recipients = doc.recipients || [];
    for (const r of recipients) {
      const fields = r.fields || [];
      for (const f of fields) {
        if (f.api_id && f.value) {
          fieldMap[f.api_id] = String(f.value);
        }
      }
    }
    return fieldMap;
  } catch {
    return {};
  }
}

/**
 * Get the embedded signing URL for a specific recipient on a document.
 */
export async function getEmbeddedSigningUrl(
  documentId: string,
  recipientEmail?: string
): Promise<string | null> {
  if (!SIGNWELL_API_KEY) return null;

  const res = await fetch(`${SIGNWELL_API_BASE}/documents/${documentId}`, {
    headers: { "X-Api-Key": SIGNWELL_API_KEY },
  });

  if (!res.ok) return null;

  const doc: SignWellDocumentResponse = await res.json();

  if (recipientEmail && doc.recipients_with_urls) {
    const match = doc.recipients_with_urls.find((r) => r.email === recipientEmail);
    if (match) return match.embedded_signing_url;
  }

  return doc.recipients_with_urls?.[0]?.embedded_signing_url || doc.embedded_signing_url || null;
}

/**
 * Cancel / void a pending SignWell document.
 */
export async function cancelDocument(documentId: string): Promise<boolean> {
  if (!SIGNWELL_API_KEY) return true;

  const res = await fetch(`${SIGNWELL_API_BASE}/documents/${documentId}`, {
    method: "DELETE",
    headers: { "X-Api-Key": SIGNWELL_API_KEY },
  });

  return res.ok;
}
