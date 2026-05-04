import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCompletedPdfUrl } from "@/lib/signwell";

const DOC_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * GET /api/signwell/document?docId=<signwell-document-id>
 *
 * Given a SignWell document ID, resolves the pre-signed S3 `file_url` for
 * the completed (fully-signed) PDF via the server-side SignWell API key,
 * then 302-redirects the browser to it. The pre-signed URL works without
 * auth, so the browser can stream/download the PDF directly from S3
 * without ever seeing the SignWell API key.
 *
 * Security notes:
 * - Session-gated (401 for unauthenticated).
 * - The SignWell request URL is constructed server-side from a strict
 *   docId pattern, so there is no user-controlled URL in any outbound
 *   fetch (no SSRF surface).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const docId = req.nextUrl.searchParams.get("docId");
  if (!docId || !DOC_ID_PATTERN.test(docId)) {
    return NextResponse.json({ error: "Invalid docId" }, { status: 400 });
  }

  const fileUrl = await getCompletedPdfUrl(docId);
  if (!fileUrl) {
    return NextResponse.json({ error: "Document not available" }, { status: 404 });
  }

  return NextResponse.redirect(fileUrl, 302);
}
