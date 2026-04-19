const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;
const DEAL_RE = /\[deal:([a-z0-9]+)\]/gi;

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

/**
 * Replace dangling mention/deal tokens with plain text when the
 * email or deal ID is not in the valid list. Valid tokens are
 * preserved as-is.
 */
export function stripInvalidTokens(
  content: string,
  validEmails: string[],
  validDealIds: string[]
): string {
  const emailSet = new Set(validEmails);
  const dealSet = new Set(validDealIds);

  let out = content.replace(MENTION_RE, (whole, name, email) => {
    return emailSet.has(email) ? whole : name;
  });
  out = out.replace(DEAL_RE, (whole, id) => {
    return dealSet.has(id) ? whole : id;
  });
  return out;
}
