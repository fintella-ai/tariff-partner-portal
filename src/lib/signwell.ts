/**
 * SignWell API Client
 *
 * Handles sending partnership agreements for e-signing via SignWell.
 * When SIGNWELL_API_KEY is not set, operates in demo mode with mock responses.
 */

const SIGNWELL_API_KEY = process.env.SIGNWELL_API_KEY || "";
const SIGNWELL_API_BASE = "https://www.signwell.com/api/v1";

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
 * a textual version of the rate in the contract body. Returns empty string
 * for an unknown rate so the template field just renders blank.
 */
function commissionRateToText(rate: number | null | undefined): string {
  if (typeof rate !== "number" || !isFinite(rate)) return "";
  const pct = Math.round(rate * 100);
  const lookup: Record<number, string> = {
    10: "ten",
    15: "fifteen",
    20: "twenty",
    25: "twenty-five",
    30: "thirty",
    35: "thirty-five",
    40: "forty",
    45: "forty-five",
    50: "fifty",
  };
  return lookup[pct] || "";
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
      ? `${Math.round(ctx.commissionRate * 100)}%`
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
    ["partner_first_name", ctx.firstName || ""],
    ["partner_last_name", ctx.lastName || ""],
    ["partner_email", ctx.email || ""],
    ["partner_phone", ctx.phone || ctx.mobilePhone || ""],
    ["partner_mobile", ctx.mobilePhone || ""],
    ["partner_company", ctx.companyName || ""],
    ["partner_title", ctx.title || ""],
    ["partner_tin", ctx.tin || ""],
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
    // Alias for templates using a "signed_agreement_date" api_id. Same
    // value as agreement_date — SignWell will consume whichever the
    // template actually declares.
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
    agreementTemplate25?: string | null;
    agreementTemplate20?: string | null;
    agreementTemplate15?: string | null;
    agreementTemplate10?: string | null;
  } | null
): { templateId: string; templateRate: number } {
  if (!settings) return { templateId: "", templateRate: rate || 0 };
  const r = rate ?? 0;
  // Snap to the closest configured rate bucket.
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
): Promise<{ documentId: string; status: string; embeddedSigningUrl: string | null }> {
  // Demo mode — return a mock document ID with a demo signing URL
  if (!SIGNWELL_API_KEY) {
    const mockId = `demo-sw-${Date.now()}`;
    return { documentId: mockId, status: "pending", embeddedSigningUrl: null };
  }

  // Template sends use a dedicated endpoint that already knows its file
  // and placeholder structure. Recipients match by `placeholder_name`
  // (e.g. "Partner", "Fintella") — no numeric id needed. Fields are a
  // flat array of {api_id, value} applied across all placeholders.
  const usingTemplate = !!options.templateId;

  const body: Record<string, any> = {
    name: options.name,
    subject: options.subject,
    message: options.message,
    recipients: options.recipients.map((r, idx) => {
      const recipient: Record<string, any> = {
        email: r.email,
        name: r.name,
        signing_order: idx + 1,
      };
      if (usingTemplate) {
        // Template docs match recipients to placeholders by name
        recipient.placeholder_name = r.role;
      } else {
        recipient.id = r.id;
      }
      return recipient;
    }),
    reminders: true,
    apply_signing_order: options.recipients.length > 1,
    embedded_signing: true,
    embedded_signing_notifications: true,
  };

  // Template sends: field pre-fills via `fields`, no files needed.
  // Non-template sends: attach a file URL.
  if (usingTemplate && options.templateFields && options.templateFields.length > 0) {
    body.fields = options.templateFields;
  }
  if (!usingTemplate && options.fileUrl) {
    body.files = [{ file_url: options.fileUrl }];
  }

  // Template documents use /document_templates/{id}/documents;
  // non-template documents use /documents.
  const url = usingTemplate
    ? `${SIGNWELL_API_BASE}/document_templates/${options.templateId}/documents`
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

  const doc: SignWellDocumentResponse = await res.json();

  // Extract embedded signing URL for the first recipient
  const embeddedSigningUrl =
    doc.recipients_with_urls?.[0]?.embedded_signing_url ||
    doc.embedded_signing_url ||
    null;

  return { documentId: doc.id, status: "pending", embeddedSigningUrl };
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
