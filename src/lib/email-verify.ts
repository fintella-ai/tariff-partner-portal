import { promises as dns } from "dns";

export interface EmailVerifyResult {
  email: string;
  valid: boolean;
  reason: string;
  hasMx: boolean;
  mxHost?: string;
  isDisposable: boolean;
  isCatchAll?: boolean;
}

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "tempmail.com", "throwaway.email",
  "yopmail.com", "10minutemail.com", "trashmail.com", "fakeinbox.com",
  "sharklasers.com", "guerrillamailblock.com", "grr.la", "dispostable.com",
  "maildrop.cc", "mailnesia.com", "tmpmail.org", "temp-mail.org",
]);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function verifyEmail(email: string): Promise<EmailVerifyResult> {
  const lower = email.trim().toLowerCase();

  if (!EMAIL_REGEX.test(lower)) {
    return { email: lower, valid: false, reason: "Invalid format", hasMx: false, isDisposable: false };
  }

  if (lower.includes("@import.placeholder")) {
    return { email: lower, valid: false, reason: "Placeholder email", hasMx: false, isDisposable: false };
  }

  const domain = lower.split("@")[1];

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { email: lower, valid: false, reason: "Disposable email domain", hasMx: false, isDisposable: true };
  }

  let mxRecords: Array<{ exchange: string; priority: number }> = [];
  try {
    mxRecords = await dns.resolveMx(domain);
  } catch {
    return { email: lower, valid: false, reason: "No MX records — domain cannot receive email", hasMx: false, isDisposable: false };
  }

  if (mxRecords.length === 0) {
    return { email: lower, valid: false, reason: "No MX records", hasMx: false, isDisposable: false };
  }

  const topMx = mxRecords.sort((a, b) => a.priority - b.priority)[0].exchange;

  return {
    email: lower,
    valid: true,
    reason: "MX verified",
    hasMx: true,
    mxHost: topMx,
    isDisposable: false,
  };
}

export async function batchVerifyEmails(
  emails: string[],
  concurrency = 10,
): Promise<EmailVerifyResult[]> {
  const results: EmailVerifyResult[] = [];

  for (let i = 0; i < emails.length; i += concurrency) {
    const batch = emails.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(verifyEmail));
    results.push(...batchResults);
  }

  return results;
}
