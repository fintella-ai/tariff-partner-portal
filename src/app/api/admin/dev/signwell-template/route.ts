import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * GET /api/admin/dev/signwell-template?id=<template_id>
 *
 * Admin-only diagnostic. Fetches a PandaDoc template by id via the
 * PandaDoc API and returns a compact summary showing every recipient
 * role plus its tokens/fields, so we can see EXACTLY what variable
 * names our code needs to match when sending.
 *
 * Returns the raw template JSON too so the admin can spot anything
 * weird the summary might miss. Gated to super_admin + admin since it
 * exposes template internals.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const templateIdRaw = req.nextUrl.searchParams.get("id");
  if (!templateIdRaw) {
    return NextResponse.json(
      { error: "Pass ?id=<template_id> in the query string." },
      { status: 400 }
    );
  }
  // PandaDoc template IDs are alphanumeric strings
  if (!/^[A-Za-z0-9]{10,30}$/.test(templateIdRaw)) {
    return NextResponse.json(
      { error: "Invalid template id format." },
      { status: 400 }
    );
  }
  const templateId = templateIdRaw;

  const apiKey = process.env.PANDADOC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "PANDADOC_API_KEY not configured on the server." },
      { status: 500 }
    );
  }

  const res = await fetch(
    `https://api.pandadoc.com/public/v1/templates/${templateId}/details`,
    {
      headers: {
        Authorization: `API-Key ${apiKey}`,
        Accept: "application/json",
      },
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    return NextResponse.json(
      {
        error: "PandaDoc API rejected the request.",
        status: res.status,
        detail: errText.slice(0, 500),
      },
      { status: 502 }
    );
  }

  const raw = await res.json();

  // Extract recipients/roles
  const roles = (raw.roles || []).map((r: any, idx: number) => ({
    index: idx + 1,
    name: r.name || null,
    signing_order: r.signing_order || null,
  }));

  // Extract tokens
  const tokens = (raw.tokens || []).map((t: any) => ({
    name: t.name,
    value: t.value || null,
  }));

  // Extract fields if present
  const fields = (raw.fields || []).map((f: any) => ({
    name: f.name || f.api_id,
    type: f.type,
    role: f.role,
    required: f.required,
  }));

  return NextResponse.json(
    {
      template_id: templateId,
      name: raw.name,
      roles,
      tokens,
      fields,
      raw,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
