// src/lib/validateCallMeta.ts
export type CallMetaInput = {
  url: string;
  title?: string;
  startsAt?: string;      // ISO 8601
  durationMins?: number;
  provider?: string;
};

export type ValidateResult =
  | { ok: true; value: CallMetaInput }
  | { ok: false; error: string };

export function validateCallMeta(input: CallMetaInput): ValidateResult {
  if (!input || typeof input.url !== "string") return { ok: false, error: "url required" };
  let u: URL;
  try { u = new URL(input.url); }
  catch { return { ok: false, error: "url must be a valid URL" }; }
  if (u.protocol !== "https:") return { ok: false, error: "url must use https" };
  if (u.username || u.password) return { ok: false, error: "url must not contain credentials" };

  if (input.title !== undefined && (typeof input.title !== "string" || input.title.length > 200)) {
    return { ok: false, error: "title must be a string ≤200 chars" };
  }
  if (input.startsAt !== undefined) {
    const d = Date.parse(input.startsAt);
    if (Number.isNaN(d)) return { ok: false, error: "startsAt must be ISO 8601" };
  }
  if (input.durationMins !== undefined) {
    if (typeof input.durationMins !== "number" || input.durationMins <= 0 || input.durationMins > 24 * 60) {
      return { ok: false, error: "durationMins must be 1..1440" };
    }
  }
  if (input.provider !== undefined && (typeof input.provider !== "string" || input.provider.length > 80)) {
    return { ok: false, error: "provider must be a string ≤80 chars" };
  }
  return { ok: true, value: input };
}
