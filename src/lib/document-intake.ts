import Anthropic from "@anthropic-ai/sdk";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

let _client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  return _client;
}

export interface ExtractedEntry {
  entryNumber: string | null;
  entryDate: string | null;
  entryType: string | null;
  countryOfOrigin: string | null;
  enteredValue: number | null;
  dutyPaid: number | null;
  htsCode: string | null;
  importerName: string | null;
  importerNumber: string | null;
  liquidationDate: string | null;
  filerCode: string | null;
  confidence: number;
  rawText?: string;
}

export interface DocumentExtractionResult {
  entries: ExtractedEntry[];
  documentType: string;
  pageCount: number;
  importerName: string | null;
  importerNumber: string | null;
  warnings: string[];
  rawResponse?: string;
}

const EXTRACTION_PROMPT = `You are a customs document parser. Extract ALL entry data from this customs document image.

The document may be a CF 7501 (Entry Summary), ACE Portal report, commercial invoice, or other customs filing.

Return a JSON object with this exact structure:
{
  "documentType": "cf7501" | "ace_report" | "commercial_invoice" | "entry_summary" | "unknown",
  "importerName": "company name or null",
  "importerNumber": "IOR number or null",
  "entries": [
    {
      "entryNumber": "XXX-XXXXXXX-X format or null",
      "entryDate": "YYYY-MM-DD or null",
      "entryType": "01" | "03" | "06" | etc or null,
      "countryOfOrigin": "two-letter ISO code (CN, MX, VN, etc) or null",
      "enteredValue": number or null (in USD, no commas),
      "dutyPaid": number or null (total duties paid in USD),
      "htsCode": "XXXX.XX.XXXX or null",
      "importerName": "company name or null",
      "importerNumber": "IOR number or null",
      "liquidationDate": "YYYY-MM-DD or null",
      "filerCode": "3-char broker filer code or null",
      "confidence": 0.0 to 1.0 (how confident you are in this extraction)
    }
  ],
  "warnings": ["any issues or ambiguities found"]
}

Rules:
- Extract EVERY entry you can find, even partial data
- Country codes must be 2-letter ISO (China=CN, Mexico=MX, Vietnam=VN, etc.)
- Entry numbers should be in XXX-XXXXXXX-X format (3 filer code + 7 digits + 1 check digit)
- Dates must be YYYY-MM-DD format
- Values must be numbers without currency symbols or commas
- If a field is unclear or missing, use null — don't guess
- Set confidence lower (0.3-0.6) for partially readable or ambiguous data
- Set confidence higher (0.8-1.0) for clearly readable data
- Return ONLY the JSON object, no explanation`;

export async function extractFromImage(
  imageBase64: string,
  mimeType: string,
): Promise<DocumentExtractionResult> {
  const client = getClient();

  if (!client) {
    return {
      entries: [],
      documentType: "unknown",
      pageCount: 1,
      importerName: null,
      importerNumber: null,
      warnings: ["ANTHROPIC_API_KEY not configured — document parsing unavailable"],
    };
  }

  const mediaType = mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageBase64 },
          },
          { type: "text", text: EXTRACTION_PROMPT },
        ],
      },
    ],
  });

  const block = response.content[0];
  const rawText = block.type === "text" ? block.text : "";

  try {
    const cleaned = rawText.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries.map((e: Record<string, unknown>) => ({
        entryNumber: typeof e.entryNumber === "string" ? e.entryNumber : null,
        entryDate: typeof e.entryDate === "string" ? e.entryDate : null,
        entryType: typeof e.entryType === "string" ? e.entryType : null,
        countryOfOrigin: typeof e.countryOfOrigin === "string" ? e.countryOfOrigin.toUpperCase() : null,
        enteredValue: typeof e.enteredValue === "number" ? e.enteredValue : null,
        dutyPaid: typeof e.dutyPaid === "number" ? e.dutyPaid : null,
        htsCode: typeof e.htsCode === "string" ? e.htsCode : null,
        importerName: typeof e.importerName === "string" ? e.importerName : null,
        importerNumber: typeof e.importerNumber === "string" ? e.importerNumber : null,
        liquidationDate: typeof e.liquidationDate === "string" ? e.liquidationDate : null,
        filerCode: typeof e.filerCode === "string" ? e.filerCode : null,
        confidence: typeof e.confidence === "number" ? e.confidence : 0.5,
      })) : [],
      documentType: parsed.documentType || "unknown",
      pageCount: 1,
      importerName: parsed.importerName || null,
      importerNumber: parsed.importerNumber || null,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      rawResponse: rawText,
    };
  } catch {
    return {
      entries: [],
      documentType: "unknown",
      pageCount: 1,
      importerName: null,
      importerNumber: null,
      warnings: ["Failed to parse AI response — document may be unreadable"],
      rawResponse: rawText,
    };
  }
}

export async function extractFromPdf(
  pdfBase64: string,
): Promise<DocumentExtractionResult> {
  const client = getClient();

  if (!client) {
    return {
      entries: [],
      documentType: "unknown",
      pageCount: 0,
      importerName: null,
      importerNumber: null,
      warnings: ["ANTHROPIC_API_KEY not configured"],
    };
  }

  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          },
          { type: "text", text: EXTRACTION_PROMPT },
        ],
      },
    ],
  });

  const block = response.content[0];
  const rawText = block.type === "text" ? block.text : "";

  try {
    const cleaned = rawText.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries.map((e: Record<string, unknown>) => ({
        entryNumber: typeof e.entryNumber === "string" ? e.entryNumber : null,
        entryDate: typeof e.entryDate === "string" ? e.entryDate : null,
        entryType: typeof e.entryType === "string" ? e.entryType : null,
        countryOfOrigin: typeof e.countryOfOrigin === "string" ? e.countryOfOrigin.toUpperCase() : null,
        enteredValue: typeof e.enteredValue === "number" ? e.enteredValue : null,
        dutyPaid: typeof e.dutyPaid === "number" ? e.dutyPaid : null,
        htsCode: typeof e.htsCode === "string" ? e.htsCode : null,
        importerName: typeof e.importerName === "string" ? e.importerName : null,
        importerNumber: typeof e.importerNumber === "string" ? e.importerNumber : null,
        liquidationDate: typeof e.liquidationDate === "string" ? e.liquidationDate : null,
        filerCode: typeof e.filerCode === "string" ? e.filerCode : null,
        confidence: typeof e.confidence === "number" ? e.confidence : 0.5,
      })) : [],
      documentType: parsed.documentType || "unknown",
      pageCount: parsed.pageCount || 1,
      importerName: parsed.importerName || null,
      importerNumber: parsed.importerNumber || null,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      rawResponse: rawText,
    };
  } catch {
    return {
      entries: [],
      documentType: "unknown",
      pageCount: 0,
      importerName: null,
      importerNumber: null,
      warnings: ["Failed to parse AI response"],
      rawResponse: rawText,
    };
  }
}

export async function extractFromMultipleDocuments(
  files: Array<{ base64: string; mimeType: string; fileName: string }>,
): Promise<{
  results: Array<{ fileName: string; result: DocumentExtractionResult }>;
  allEntries: ExtractedEntry[];
  totalDocuments: number;
  importerName: string | null;
}> {
  const results: Array<{ fileName: string; result: DocumentExtractionResult }> = [];
  const allEntries: ExtractedEntry[] = [];
  let importerName: string | null = null;

  for (const file of files) {
    const result = file.mimeType === "application/pdf"
      ? await extractFromPdf(file.base64)
      : await extractFromImage(file.base64, file.mimeType);

    results.push({ fileName: file.fileName, result });
    allEntries.push(...result.entries);

    if (!importerName && result.importerName) {
      importerName = result.importerName;
    }
  }

  return {
    results,
    allEntries,
    totalDocuments: files.length,
    importerName,
  };
}
