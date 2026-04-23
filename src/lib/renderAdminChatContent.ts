export type ChatSegment =
  | { type: "text"; value: string }
  | { type: "mention"; email: string; name: string }
  | { type: "deal"; dealId: string; dealName: string | null }
  | { type: "partner"; partnerCode: string; partnerName: string | null };

export type RenderCtx = {
  deals: Record<string, string>;
  // Optional — passed in by the admin internal-chat UI so `[partner:…]`
  // tokens can render with a real name. Falls back to code if missing.
  partners?: Record<string, string>;
};

const COMBINED_RE = /@\[([^\]]+)\]\(([^)]+)\)|\[deal:([a-z0-9]+)\]|\[partner:([A-Za-z0-9_-]+)\]/gi;

export function renderAdminChatContent(content: string, ctx: RenderCtx): ChatSegment[] {
  if (!content) return [{ type: "text", value: "" }];

  const segments: ChatSegment[] = [];
  let cursor = 0;

  COMBINED_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COMBINED_RE.exec(content)) !== null) {
    if (m.index > cursor) {
      segments.push({ type: "text", value: content.slice(cursor, m.index) });
    }
    if (m[1] !== undefined && m[2] !== undefined) {
      segments.push({ type: "mention", email: m[2], name: m[1] });
    } else if (m[3] !== undefined) {
      const dealId = m[3];
      segments.push({ type: "deal", dealId, dealName: ctx.deals[dealId] ?? null });
    } else if (m[4] !== undefined) {
      const partnerCode = m[4];
      segments.push({
        type: "partner",
        partnerCode,
        partnerName: ctx.partners?.[partnerCode] ?? null,
      });
    }
    cursor = m.index + m[0].length;
  }
  if (cursor < content.length) {
    segments.push({ type: "text", value: content.slice(cursor) });
  }
  if (segments.length === 0) segments.push({ type: "text", value: content });
  return segments;
}
