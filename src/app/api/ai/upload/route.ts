import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/ai/upload
 *
 * Multipart form upload used by the partner AI chat to attach screenshots
 * to Ollie's bug investigation flow. Phase 3 of the PartnerOS roadmap
 * deferred scope (Vercel Blob SDK).
 *
 * Demo-gated: when `BLOB_READ_WRITE_TOKEN` is unset the endpoint returns a
 * helpful 503 so the UI can tell the partner screenshot uploads aren't
 * available yet. The @vercel/blob SDK honors the standard env var name.
 *
 * Validation:
 *   - Must be an image (image/png, image/jpeg, image/webp, image/gif)
 *   - Max 8 MB (keeps admins able to view inline in the Notification feed)
 *   - File name sanitized; upload path is namespaced under `ai-uploads/<partnerCode>/<timestamp>-<name>`
 *
 * The returned `url` is what Ollie's `investigate_bug` tool accepts in
 * its `screenshots` input array.
 */
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Demo gate.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          "Screenshot uploads are not configured yet. Set BLOB_READ_WRITE_TOKEN on Vercel to enable.",
        demo: true,
      },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field is required" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      {
        error: `Unsupported content type: ${file.type}. Allowed: PNG, JPEG, WebP, GIF.`,
      },
      { status: 415 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${file.size} bytes). Max 8 MB.` },
      { status: 413 }
    );
  }

  const partnerCode = (session.user as any).partnerCode || "admin";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
  const blobPath = `ai-uploads/${partnerCode}/${Date.now()}-${safeName}`;

  try {
    const result = await put(blobPath, file, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: true,
    });
    return NextResponse.json({
      url: result.url,
      pathname: result.pathname,
      contentType: file.type,
      bytes: file.size,
    });
  } catch (e: any) {
    console.error("[api/ai/upload]", e);
    return NextResponse.json(
      { error: e?.message || "Upload failed" },
      { status: 500 }
    );
  }
}
