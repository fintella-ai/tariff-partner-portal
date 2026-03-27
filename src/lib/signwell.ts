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
): Promise<{ documentId: string; status: string }> {
  // Demo mode — return a mock document ID
  if (!SIGNWELL_API_KEY) {
    const mockId = `demo-sw-${Date.now()}`;
    return { documentId: mockId, status: "pending" };
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
  return { documentId: doc.id, status: "pending" };
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
