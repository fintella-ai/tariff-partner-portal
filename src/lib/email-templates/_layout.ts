/**
 * Shared HTML layout for all Fintella transactional emails.
 *
 * Email client rendering rules — read this before changing anything:
 *
 *   1. Use `<table>` for layout, not flex/grid. Outlook + many corporate mail
 *      clients (and the "show plain text" view in Gmail) ignore CSS layout
 *      properties beyond the bare basics.
 *   2. Inline styles only. <style> tags get stripped by Gmail and many others.
 *   3. Light background only. Dark-mode email is a minefield (Outlook will
 *      auto-invert your colors and break the brand). Use a near-white card
 *      against a soft gold/cream backdrop — looks consistent everywhere.
 *   4. Width capped at 600px. Anything wider gets letterboxed on mobile.
 *   5. Web fonts are unreliable — fall back to system font stacks.
 *   6. No background images. Many clients block them.
 *
 * Branding (matches the live portal at fintella.partners):
 *   - Gold accent: #c4a050 (deep) / #f0d070 (highlight)
 *   - Headers: serif fallback (Playfair Display would need a web font)
 *   - Body: sans-serif fallback
 *   - Footer: muted gray, includes opt-out language for transactional compliance
 */

import { FIRM_SHORT, FIRM_NAME, FIRM_PHONE } from "@/lib/constants";

export interface EmailLayoutOptions {
  /** Hero headline at the top of the email (e.g. "Welcome to Fintella") */
  heading: string;
  /** Optional subheading shown below the heading in muted gold */
  subheading?: string;
  /** Main body HTML (already escaped — pass safe HTML only) */
  bodyHtml: string;
  /** Optional CTA button — { label, url } */
  cta?: { label: string; url: string };
  /** Optional preview text shown in mail clients before the user opens */
  previewText?: string;
}

const PORTAL_URL = "https://fintella.partners";
const GOLD_DEEP = "#c4a050";
const GOLD_LIGHT = "#f0d070";
const TEXT_DARK = "#1a1a2e";
const TEXT_MUTED = "#6b7280";
const BG_CARD = "#ffffff";
const BG_PAGE = "#fdf9ed"; // soft cream that complements the gold

/**
 * Build the full HTML email document with Fintella branding.
 * Returns a single string ready to pass as the `html` arg to sendEmail().
 */
export function renderEmail(opts: EmailLayoutOptions): string {
  const { heading, subheading, bodyHtml, cta, previewText } = opts;

  // Preview text: shown in inbox list view before the user opens the email.
  // Hidden inside the email body via a wrapped span with display:none styles —
  // this is the standard transactional email pattern.
  const preview = previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BG_PAGE};">${escapeHtml(previewText)}</div>`
    : "";

  const ctaButton = cta
    ? `
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:24px auto 0;">
          <tr>
            <td style="background:${GOLD_DEEP};border-radius:6px;text-align:center;">
              <a href="${cta.url}" style="display:inline-block;padding:14px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:#ffffff;text-decoration:none;">${escapeHtml(cta.label)}</a>
            </td>
          </tr>
        </table>
      `
    : "";

  const subheadingHtml = subheading
    ? `<p style="margin:8px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;font-weight:500;color:${GOLD_DEEP};letter-spacing:0.5px;text-transform:uppercase;">${escapeHtml(subheading)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BG_PAGE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
${preview}
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:${BG_PAGE};padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;background-color:${BG_CARD};border-radius:12px;border:1px solid ${GOLD_LIGHT};box-shadow:0 2px 8px rgba(196,160,80,0.08);">
        <!-- Logo header -->
        <tr>
          <td style="padding:32px 40px 0;text-align:center;border-bottom:1px solid #f3ead0;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:700;color:${GOLD_DEEP};letter-spacing:1px;">${escapeHtml(FIRM_SHORT)}</div>
            <div style="margin-top:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;font-weight:500;color:${TEXT_MUTED};letter-spacing:1.5px;text-transform:uppercase;">Partner Portal</div>
            <div style="height:24px;"></div>
          </td>
        </tr>

        <!-- Heading -->
        <tr>
          <td style="padding:32px 40px 0;text-align:center;">
            <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;color:${TEXT_DARK};line-height:1.3;">${escapeHtml(heading)}</h1>
            ${subheadingHtml}
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:24px 40px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.65;color:${TEXT_DARK};">
            ${bodyHtml}
            ${ctaButton}
          </td>
        </tr>

        <!-- Footer divider -->
        <tr>
          <td style="padding:0 40px;">
            <div style="height:1px;background:linear-gradient(to right,transparent,${GOLD_LIGHT},transparent);"></div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px 32px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;line-height:1.6;color:${TEXT_MUTED};">
            <div style="margin-bottom:8px;">
              <strong style="color:${GOLD_DEEP};">${escapeHtml(FIRM_NAME)}</strong>
            </div>
            <div>
              ${escapeHtml(FIRM_PHONE)} &nbsp;·&nbsp; <a href="${PORTAL_URL}" style="color:${GOLD_DEEP};text-decoration:none;">fintella.partners</a>
            </div>
            <div style="margin-top:12px;color:${TEXT_MUTED};">
              You're receiving this email because you're an active partner with ${escapeHtml(FIRM_SHORT)}.
              <br>
              Manage your notification preferences in your <a href="${PORTAL_URL}/dashboard/account" style="color:${GOLD_DEEP};text-decoration:none;">account settings</a>.
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * Escape user-supplied strings before injecting into HTML. We never trust
 * deal names, partner names, or any field that originated from a webhook,
 * form submission, or DB write. Only static template strings + escaped
 * variables make it into the final HTML.
 */
export function escapeHtml(input: string | null | undefined): string {
  if (input === null || input === undefined) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Format a number as USD currency for use in email bodies.
 * Returns a string like "$1,234.56" or "$0.00".
 */
export function formatCurrency(amount: number | null | undefined): string {
  const n = typeof amount === "number" && !isNaN(amount) ? amount : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}
