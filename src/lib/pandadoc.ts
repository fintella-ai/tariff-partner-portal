/**
 * PandaDoc API Client
 *
 * Handles sending partnership agreements for e-signing via PandaDoc.
 * When PANDADOC_API_KEY is not set, operates in demo mode with mock responses.
 *
 * Drop-in replacement for signwell.ts — same exported function signatures so
 * callers can swap imports without logic changes.
 */

const PANDADOC_API_KEY = process.env.PANDADOC_API_KEY || "";
const PANDADOC_API_BASE = "https://api.pandadoc.com/public/v1";
const PANDADOC_TEMPLATE_ID = process.env.PANDADOC_TEMPLATE_ID || "";

interface PandaDocRecipient {
  id: string;
  email: string;
  name: string;
  role: string;
}

/**
 * A PandaDoc token (variable) pre-fill.
 *
 * PandaDoc templates use "tokens" to pre-populate values. Each token
 * has a `name` and a `value`. Unknown tokens are silently ignored.
 * We keep the same external interface shape as SignWellTemplateField
 * (api_id + value) so callers don't need to change — internally we
 * map api_id → name when building the PandaDoc request.
 */
export interface SignWellTemplateField {
  api_id: string;
  value: string;
}

interface PandaDocSendOptions {
  name: string;
  subject: string;
  message: string;
  recipients: PandaDocRecipient[];
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
  ssn?: string | null;
  commissionRate?: number | null;
  street?: string | null;
  street2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
}

/**
 * Render a decimal commission rate (0.25) as its written-out English word
 * form ("twenty-five") so templates can embed both a numeric and textual
 * version of the rate in the contract body.
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
 * Build a PandaDoc `tokens` payload from a partner record + profile.
 *
 * Produces the same api_id set as the SignWell version. PandaDoc calls
 * them "tokens" (name/value pairs) but we keep the external interface
 * identical so callers don't change.
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

  // Build full address string for partner_address token
  const addressParts = [ctx.street, ctx.street2, ctx.city, ctx.state, ctx.zip].filter(Boolean);
  const fullAddress = addressParts.join(", ");

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
    ["partner_address", fullAddress],
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
 * Map a partner commission rate to the configured agreement template id.
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

  // Prefer the single master template when configured.
  if (settings.agreementTemplateMaster) {
    return { templateId: settings.agreementTemplateMaster, templateRate: r };
  }

  // Legacy fallback: snap to the closest configured rate bucket.
  if (r >= 0.25) return { templateId: settings.agreementTemplate25 || "", templateRate: 0.25 };
  if (r >= 0.20) return { templateId: settings.agreementTemplate20 || "", templateRate: 0.20 };
  if (r >= 0.15) return { templateId: settings.agreementTemplate15 || "", templateRate: 0.15 };
  if (r >= 0.10) return { templateId: settings.agreementTemplate10 || "", templateRate: 0.10 };
  return { templateId: "", templateRate: r };
}

/**
 * Check if PandaDoc is configured with a real API key.
 */
export function isSignWellConfigured(): boolean {
  return !!PANDADOC_API_KEY;
}

/** Alias for clarity — callers may use either name. */
export const isPandaDocConfigured = isSignWellConfigured;

/**
 * Send a document for signing via PandaDoc API.
 * Creates a document from template, then sends it.
 * Returns the PandaDoc document ID for tracking.
 */
export async function sendForSigning(
  options: PandaDocSendOptions
): Promise<{ documentId: string; status: string; embeddedSigningUrl: string | null; cosignerSigningUrl?: string | null }> {
  // Demo mode — return a mock document ID
  if (!PANDADOC_API_KEY) {
    const mockId = `demo-pd-${Date.now()}`;
    return { documentId: mockId, status: "pending", embeddedSigningUrl: null };
  }

  // Resolve template ID: explicit option > env var > settings-based
  const templateUuid = options.templateId || PANDADOC_TEMPLATE_ID;

  // Build PandaDoc recipients array with signing order
  const recipients = options.recipients.map((r, idx) => {
    // Split name into first/last
    const nameParts = r.name.split(" ");
    const firstName = nameParts[0] || r.name;
    const lastName = nameParts.slice(1).join(" ") || "";

    return {
      email: r.email,
      first_name: firstName,
      last_name: lastName,
      role: r.role,
      signing_order: idx + 1,
    };
  });

  // Build PandaDoc tokens from template fields
  // PandaDoc tokens format: [{ name: "field_name", value: "field_value" }]
  const tokens = (options.templateFields || []).map((f) => ({
    name: f.api_id,
    value: f.value,
  }));

  // Step 1: Create document from template
  const createBody: Record<string, any> = {
    name: options.name,
    recipients,
    tokens,
  };

  if (templateUuid) {
    createBody.template_uuid = templateUuid;
  }

  const createRes = await fetch(`${PANDADOC_API_BASE}/documents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `API-Key ${PANDADOC_API_KEY}`,
    },
    body: JSON.stringify(createBody),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`PandaDoc create error (${createRes.status}): ${errText}`);
  }

  const doc = await createRes.json();
  const documentId = doc.id;

  // Step 2: Wait briefly for document to process before sending.
  // PandaDoc needs a moment after creation before the document is ready to send.
  // Poll the document status up to 10 times with 2s delay.
  let docReady = false;
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const statusRes = await fetch(`${PANDADOC_API_BASE}/documents/${documentId}`, {
      headers: { Authorization: `API-Key ${PANDADOC_API_KEY}` },
    });
    if (statusRes.ok) {
      const statusDoc = await statusRes.json();
      if (statusDoc.status === "document.draft") {
        docReady = true;
        break;
      }
    }
  }

  if (!docReady) {
    console.warn("[pandadoc] Document did not reach draft status in time, attempting send anyway");
  }

  // Step 3: Send the document for signing
  const sendRes = await fetch(`${PANDADOC_API_BASE}/documents/${documentId}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `API-Key ${PANDADOC_API_KEY}`,
    },
    body: JSON.stringify({
      message: options.message,
      subject: options.subject,
      silent: false,
    }),
  });

  if (!sendRes.ok) {
    const errText = await sendRes.text();
    throw new Error(`PandaDoc send error (${sendRes.status}): ${errText}`);
  }

  // Step 4: Create signing sessions for embedded signing
  // Partner is recipient[0], co-signer is recipient[1]
  let embeddedSigningUrl: string | null = null;
  let cosignerSigningUrl: string | null = null;

  try {
    const partnerSession = await createSigningSession(documentId, options.recipients[0]?.email);
    embeddedSigningUrl = partnerSession;
  } catch (e) {
    console.warn("[pandadoc] Failed to create partner signing session:", e);
  }

  if (options.recipients.length > 1) {
    try {
      const cosignerSession = await createSigningSession(documentId, options.recipients[1]?.email);
      cosignerSigningUrl = cosignerSession;
    } catch (e) {
      console.warn("[pandadoc] Failed to create cosigner signing session:", e);
    }
  }

  return { documentId, status: "pending", embeddedSigningUrl, cosignerSigningUrl };
}

/**
 * Create a PandaDoc signing session and return the signing URL.
 */
async function createSigningSession(
  documentId: string,
  recipientEmail: string
): Promise<string | null> {
  if (!PANDADOC_API_KEY || !recipientEmail) return null;

  const res = await fetch(`${PANDADOC_API_BASE}/documents/${documentId}/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `API-Key ${PANDADOC_API_KEY}`,
    },
    body: JSON.stringify({
      recipient: recipientEmail,
      lifetime: 900,
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  // PandaDoc signing URL: https://app.pandadoc.com/s/{session_id}
  return data.id ? `https://app.pandadoc.com/s/${data.id}` : null;
}

/**
 * Get the current status of a PandaDoc document.
 */
export async function getDocumentStatus(
  documentId: string
): Promise<{ status: string; completedAt: string | null; documentUrl: string | null }> {
  // Demo mode
  if (!PANDADOC_API_KEY) {
    return { status: "pending", completedAt: null, documentUrl: null };
  }

  const res = await fetch(`${PANDADOC_API_BASE}/documents/${documentId}`, {
    headers: { Authorization: `API-Key ${PANDADOC_API_KEY}` },
  });

  if (!res.ok) {
    throw new Error(`PandaDoc API error (${res.status})`);
  }

  const doc = await res.json();

  let status = "pending";
  if (doc.status === "document.completed") status = "signed";
  else if (doc.status === "document.voided") status = "expired";
  else if (doc.status === "document.viewed") status = "viewed";

  return {
    status,
    completedAt: doc.date_completed || null,
    documentUrl: doc.id ? `https://app.pandadoc.com/documents/${doc.id}` : null,
  };
}

/**
 * Retrieve the download URL for a completed (fully-signed) PDF.
 *
 * PandaDoc API: GET /documents/{id}/download
 * Returns a redirect URL to the PDF file.
 *
 * Returns null in demo mode or if PandaDoc rejects.
 */
export async function getCompletedPdfUrl(
  documentId: string
): Promise<string | null> {
  if (!PANDADOC_API_KEY) return null;

  // PandaDoc provides a download endpoint that returns the PDF.
  // We use the protected download link that requires auth.
  const res = await fetch(
    `${PANDADOC_API_BASE}/documents/${documentId}/download`,
    {
      headers: {
        Authorization: `API-Key ${PANDADOC_API_KEY}`,
      },
      redirect: "manual",
    }
  );

  // PandaDoc may return a 302 redirect to the actual file URL
  if (res.status === 302) {
    return res.headers.get("location") || null;
  }

  // Or it may return 200 with the PDF directly — in that case,
  // the download URL itself is the "completed pdf url"
  if (res.ok) {
    return `${PANDADOC_API_BASE}/documents/${documentId}/download`;
  }

  return null;
}

/**
 * Fetch completed document field values from PandaDoc.
 * Returns a map of field name → value for all fields the signer filled in.
 */
export async function getCompletedDocumentFields(
  documentId: string
): Promise<Record<string, string>> {
  if (!PANDADOC_API_KEY) return {};
  try {
    // PandaDoc: GET /documents/{id}/details returns full doc with fields
    const res = await fetch(`${PANDADOC_API_BASE}/documents/${documentId}/details`, {
      headers: { Authorization: `API-Key ${PANDADOC_API_KEY}` },
    });
    if (!res.ok) return {};
    const doc = await res.json();
    const fieldMap: Record<string, string> = {};

    // PandaDoc returns tokens in the response
    const tokens = doc.tokens || [];
    for (const t of tokens) {
      if (t.name && t.value) {
        fieldMap[t.name] = String(t.value);
      }
    }

    // Also check fields array if present
    const fields = doc.fields || [];
    for (const f of fields) {
      const key = f.name || f.api_id || f.merge_field;
      if (key && f.value) {
        fieldMap[key] = String(f.value);
      }
    }

    return fieldMap;
  } catch {
    return {};
  }
}

/**
 * Map completed document field values to PartnerProfile payout columns.
 *
 * Accepts both prefixed ("partner_bank_name") and non-prefixed ("bank_name")
 * field names. Returns `{ profileData, partnerData }`.
 */
export function mapSignWellFieldsToPayoutData(fields: Record<string, string>): {
  profileData: Record<string, any>;
  partnerData: Record<string, string>;
} {
  const f = (key: string) =>
    fields[`partner_${key}`] || fields[key] || "";

  const profileData: Record<string, any> = {};
  const partnerData: Record<string, string> = {};

  // TIN / SSN -> Partner row
  if (f("tin")) partnerData.tin = f("tin");
  if (f("ssn")) partnerData.ssn = f("ssn");

  // Payout method
  const wireOn = f("payout_wire") === "true" || f("payout_wire") === "on";
  const achOn = f("payout_ach") === "true" || f("payout_ach") === "on";
  const checkOn = f("payout_check") === "true" || f("payout_check") === "on";
  if (wireOn) profileData.payoutMethod = "wire";
  else if (achOn) profileData.payoutMethod = "ach";
  else if (checkOn) profileData.payoutMethod = "check";
  else if (f("payout_method")) profileData.payoutMethod = f("payout_method").toLowerCase();

  // Bank details
  const bankName = f("bank_name") || f("ach_bank_name");
  const routingNumber = f("routing_number") || f("ach_routing_number");
  const accountNumber = f("account_number") || f("ach_account_number");
  const beneficiaryName = f("beneficiary_name") || f("account_holder_name") || f("ach_account_holder");
  if (bankName) profileData.bankName = bankName;
  if (f("bank_address")) profileData.bankAddress = f("bank_address");
  if (routingNumber) profileData.routingNumber = routingNumber;
  if (accountNumber) profileData.accountNumber = accountNumber;
  if (beneficiaryName) profileData.beneficiaryName = beneficiaryName;
  if (f("wire_memo")) profileData.wireMemo = f("wire_memo");

  // Bank branch address fields
  if (f("bank_street")) profileData.bankStreet = f("bank_street");
  if (f("bank_street2")) profileData.bankStreet2 = f("bank_street2");
  if (f("bank_city")) profileData.bankCity = f("bank_city");
  if (f("bank_state")) profileData.bankState = f("bank_state");
  if (f("bank_zip")) profileData.bankZip = f("bank_zip");

  // Check mailing address
  if (f("check_payee") || f("check_payee_name")) profileData.checkPayeeName = f("check_payee") || f("check_payee_name");
  if (f("check_street")) profileData.checkStreet = f("check_street");
  if (f("check_street2")) profileData.checkStreet2 = f("check_street2");
  if (f("check_city")) profileData.checkCity = f("check_city");
  if (f("check_state")) profileData.checkState = f("check_state");
  if (f("check_zip")) profileData.checkZip = f("check_zip");

  // Account entity + type
  const entity = (f("account_entity")).toLowerCase().trim();
  if (entity) profileData.accountEntity = entity;
  const isBusiness = entity === "business";
  const isChecking = f("account_checking") === "true" || f("account_checking") === "on";
  const isSavings = f("account_savings") === "true" || f("account_savings") === "on";
  if (isChecking) {
    profileData.accountType = isBusiness ? "business_checking" : "checking";
  } else if (isSavings) {
    profileData.accountType = isBusiness ? "business_savings" : "savings";
  } else if (f("account_type")) {
    profileData.accountType = f("account_type").toLowerCase();
  }

  return { profileData, partnerData };
}

/**
 * Get the embedded signing URL for a specific recipient on a document.
 * Creates a new signing session via PandaDoc API.
 */
export async function getEmbeddedSigningUrl(
  documentId: string,
  recipientEmail?: string
): Promise<string | null> {
  if (!PANDADOC_API_KEY) return null;

  // If we have a specific recipient email, create a session for them
  if (recipientEmail) {
    return createSigningSession(documentId, recipientEmail);
  }

  // Otherwise get the document and use the first recipient's email
  try {
    const res = await fetch(`${PANDADOC_API_BASE}/documents/${documentId}`, {
      headers: { Authorization: `API-Key ${PANDADOC_API_KEY}` },
    });
    if (!res.ok) return null;
    const doc = await res.json();
    const firstRecipient = doc.recipients?.[0];
    if (firstRecipient?.email) {
      return createSigningSession(documentId, firstRecipient.email);
    }
  } catch {
    // fall through
  }

  return null;
}

/**
 * Cancel / void a PandaDoc document.
 * Uses DELETE endpoint to remove the document.
 */
export async function cancelDocument(documentId: string): Promise<boolean> {
  if (!PANDADOC_API_KEY) return true;

  const res = await fetch(`${PANDADOC_API_BASE}/documents/${documentId}`, {
    method: "DELETE",
    headers: { Authorization: `API-Key ${PANDADOC_API_KEY}` },
  });

  return res.ok || res.status === 204;
}
