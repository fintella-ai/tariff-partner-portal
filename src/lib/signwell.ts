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

interface SignWellSendOptions {
  name: string;
  subject: string;
  message: string;
  recipients: SignWellRecipient[];
  templateId?: string;
  fileUrl?: string;
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

  const body: Record<string, any> = {
    name: options.name,
    subject: options.subject,
    message: options.message,
    recipients: options.recipients.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
      placeholder_name: r.role,
    })),
    reminders: true,
    apply_signing_order: false,
    embedded_signing: true,
    embedded_signing_notifications: true,
  };

  // Use template or file URL
  if (options.templateId) {
    body.template_id = options.templateId;
  } else if (options.fileUrl) {
    body.files = [{ file_url: options.fileUrl }];
  }

  const res = await fetch(`${SIGNWELL_API_BASE}/documents`, {
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
