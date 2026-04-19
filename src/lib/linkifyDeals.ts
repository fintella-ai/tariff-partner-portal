// src/lib/linkifyDeals.ts
export type LinkifyDeal = {
  id: string;
  dealName: string | null;
  legalEntityName: string | null;
  clientLastName: string | null;
};

export type Segment =
  | { type: "text"; value: string }
  | { type: "link"; href: string; value: string };

const MIN_MATCH_LEN = 4;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Candidate = { start: number; end: number; value: string; dealIds: Set<string> };

export function linkifyDealMentions(content: string, deals: LinkifyDeal[]): Segment[] {
  try {
    if (!content) return [{ type: "text", value: content ?? "" }];
    if (!deals || deals.length === 0) return [{ type: "text", value: content }];

    // Build (candidateText → dealId) map. Each deal contributes up to 3 candidates.
    const candidateTexts: Array<{ text: string; dealId: string }> = [];
    for (const d of deals) {
      for (const field of [d.dealName, d.legalEntityName, d.clientLastName]) {
        if (!field) continue;
        const trimmed = field.trim();
        if (trimmed.length < MIN_MATCH_LEN) continue;
        candidateTexts.push({ text: trimmed, dealId: d.id });
      }
    }
    if (candidateTexts.length === 0) return [{ type: "text", value: content }];

    // Find every hit in the content (case-insensitive, word-boundary).
    // `\b` only fires between word/non-word chars, so if the candidate begins
    // or ends with a non-word char (e.g. "Acme (US) Corp."), use the candidate
    // edge directly instead of `\b` on that side.
    const hits: Candidate[] = [];
    const isWordChar = (ch: string) => /\w/.test(ch);
    for (const { text, dealId } of candidateTexts) {
      const leftBoundary = isWordChar(text[0]) ? "\\b" : "";
      const rightBoundary = isWordChar(text[text.length - 1]) ? "\\b" : "";
      const re = new RegExp(`${leftBoundary}${escapeRegex(text)}${rightBoundary}`, "gi");
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        const existing = hits.find((h) => h.start === m!.index && h.end === m!.index + m![0].length);
        if (existing) {
          existing.dealIds.add(dealId);
        } else {
          hits.push({
            start: m.index,
            end: m.index + m[0].length,
            value: m[0],
            dealIds: new Set([dealId]),
          });
        }
      }
    }
    if (hits.length === 0) return [{ type: "text", value: content }];

    // Sort hits by start (asc), then by length (desc — longest wins on ties).
    hits.sort((a, b) => (a.start - b.start) || ((b.end - b.start) - (a.end - a.start)));

    // Walk left-to-right, pick the earliest hit, skip any that overlap it.
    const chosen: Candidate[] = [];
    let cursor = 0;
    for (const h of hits) {
      if (h.start < cursor) continue; // overlaps a previously chosen hit
      chosen.push(h);
      cursor = h.end;
    }

    // Emit segments. Adjacent text segments are coalesced so an ambiguous
    // hit (left as text) merges with surrounding text rather than fragmenting
    // the output.
    const out: Segment[] = [];
    const pushText = (value: string) => {
      if (!value) return;
      const last = out[out.length - 1];
      if (last && last.type === "text") {
        last.value += value;
      } else {
        out.push({ type: "text", value });
      }
    };
    let pos = 0;
    for (const h of chosen) {
      if (h.start > pos) pushText(content.slice(pos, h.start));
      if (h.dealIds.size === 1) {
        const [dealId] = Array.from(h.dealIds);
        out.push({ type: "link", href: `/admin/deals/${dealId}`, value: h.value });
      } else {
        pushText(h.value);
      }
      pos = h.end;
    }
    if (pos < content.length) pushText(content.slice(pos));
    return out;
  } catch {
    return [{ type: "text", value: content }];
  }
}
