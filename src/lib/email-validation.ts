/**
 * Email validation — uses SendGrid Email Validation API if available,
 * falls back to basic format + known-bad domain checks.
 */

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "tempmail.com", "throwaway.email",
  "yopmail.com", "sharklasers.com", "guerrillamailblock.com", "grr.la",
  "discard.email", "discardmail.com", "trashmail.com", "fakeinbox.com",
]);

export interface EmailValidationResult {
  email: string;
  verdict: "Valid" | "Risky" | "Invalid" | "unknown";
  score: number;
  hasValidMx: boolean;
  isDisposable: boolean;
  isCatchAll: boolean;
  demo: boolean;
  method: "sendgrid" | "basic";
}

export async function validateEmail(email: string): Promise<EmailValidationResult> {
  const result = await validateViaSendGrid(email);
  if (result) return result;
  return validateBasic(email);
}

async function validateViaSendGrid(email: string): Promise<EmailValidationResult | null> {
  if (!SENDGRID_API_KEY) return null;

  try {
    const res = await fetch("https://api.sendgrid.com/v3/validations/email", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, source: "fintella_import" }),
    });

    if (res.status === 403 || res.status === 404 || res.status === 401) {
      return null;
    }

    if (!res.ok) return null;

    const data = await res.json();
    const r = data.result || {};
    return {
      email,
      verdict: r.verdict || "unknown",
      score: r.score ?? 0,
      hasValidMx: r.checks?.domain?.has_valid_address_syntax ?? false,
      isDisposable: r.checks?.additional?.is_disposable_address ?? false,
      isCatchAll: r.checks?.additional?.is_suspected_disposable_address ?? false,
      demo: false,
      method: "sendgrid",
    };
  } catch {
    return null;
  }
}

function validateBasic(email: string): EmailValidationResult {
  const atIdx = email.indexOf("@");
  const domain = atIdx > 0 ? email.slice(atIdx + 1).toLowerCase() : "";

  if (!domain || atIdx < 1 || !domain.includes(".")) {
    return { email, verdict: "Invalid", score: 0, hasValidMx: false, isDisposable: false, isCatchAll: false, demo: false, method: "basic" };
  }

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { email, verdict: "Risky", score: 0.2, hasValidMx: true, isDisposable: true, isCatchAll: false, demo: false, method: "basic" };
  }

  const knownGoodTlds = [".com", ".net", ".org", ".gov", ".edu", ".co", ".io", ".us"];
  const hasGoodTld = knownGoodTlds.some((tld) => domain.endsWith(tld));

  return {
    email,
    verdict: hasGoodTld ? "Valid" : "Risky",
    score: hasGoodTld ? 0.7 : 0.4,
    hasValidMx: true,
    isDisposable: false,
    isCatchAll: false,
    demo: false,
    method: "basic",
  };
}
