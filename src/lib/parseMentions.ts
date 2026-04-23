const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;
const DEAL_RE = /\[deal:([a-z0-9]+)\]/gi;
// Partner refs: [partner:PTN…] — partnerCode is uppercase+digits in
// production but we tolerate mixed case when parsing. Used by the
// admin internal-chat widget's `&partner` trigger so admins can tag
// a partner into an admin-to-admin conversation.
const PARTNER_RE = /\[partner:([A-Za-z0-9_-]+)\]/g;

export function parseMentions(content: string): string[] {
  const emails = new Set<string>();
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(content)) !== null) emails.add(m[2]);
  return Array.from(emails);
}

export function parseDealRefs(content: string): string[] {
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  DEAL_RE.lastIndex = 0;
  while ((m = DEAL_RE.exec(content)) !== null) ids.add(m[1]);
  return Array.from(ids);
}

export function parsePartnerRefs(content: string): string[] {
  const codes = new Set<string>();
  let m: RegExpExecArray | null;
  PARTNER_RE.lastIndex = 0;
  while ((m = PARTNER_RE.exec(content)) !== null) codes.add(m[1]);
  return Array.from(codes);
}

/**
 * Replace dangling mention/deal/partner tokens with plain text when
 * the referenced entity is not in the valid list. Valid tokens are
 * preserved as-is.
 *
 * `validPartnerCodes` is optional for call-site backwards compat —
 * callers that don't pass it simply leave partner tokens untouched,
 * so existing message content isn't retroactively clobbered.
 */
export function stripInvalidTokens(
  content: string,
  validEmails: string[],
  validDealIds: string[],
  validPartnerCodes?: string[]
): string {
  const emailSet = new Set(validEmails);
  const dealSet = new Set(validDealIds);

  let out = content.replace(MENTION_RE, (whole, name, email) => {
    return emailSet.has(email) ? whole : name;
  });
  out = out.replace(DEAL_RE, (whole, id) => {
    return dealSet.has(id) ? whole : id;
  });
  if (validPartnerCodes) {
    const partnerSet = new Set(validPartnerCodes);
    out = out.replace(PARTNER_RE, (whole, code) => {
      return partnerSet.has(code) ? whole : code;
    });
  }
  return out;
}
