/**
 * Append-style log of inbound webhook bodies on a Deal row.
 *
 * Stored in Deal.rawPayload as a JSON array. Each entry captures one
 * POST (create) or PATCH (update) from Frost Law's HubSpot workflow.
 *
 * Design goals:
 *   - Never let a single Deal's payload log grow unbounded (MAX_TOTAL_BYTES).
 *   - Keep the most recent events if we have to evict (FIFO drop from oldest).
 *   - Degrade gracefully if the existing column contains the legacy single-body
 *     string (pre this feature) — wrap it as a synthetic POST event so admins
 *     don't lose that history on the first PATCH after migration.
 */

export type DealPayloadMethod = "POST" | "PATCH";

export type DealPayloadEvent = {
  ts: string;            // ISO timestamp
  method: DealPayloadMethod;
  body: string;          // raw JSON body as received (may be truncated)
};

const MAX_ENTRIES = 20;
const MAX_TOTAL_BYTES = 50_000;
const MAX_BODY_BYTES = 10_000;
const LEGACY_TS = "1970-01-01T00:00:00.000Z";

function toEventArray(existing: string | null | undefined): DealPayloadEvent[] {
  if (!existing) return [];
  try {
    const parsed = JSON.parse(existing);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (e): e is DealPayloadEvent =>
          e && typeof e === "object" && typeof e.body === "string" && typeof e.method === "string"
      );
    }
  } catch {
    // fall through to legacy wrap
  }
  // Legacy single-body string (pre-array migration). Preserve as a synthetic
  // POST event with an unknown-time sentinel so the first append doesn't lose
  // whatever originally landed in the column.
  return [{ ts: LEGACY_TS, method: "POST", body: String(existing).slice(0, MAX_BODY_BYTES) }];
}

/**
 * Append a new inbound payload event to the Deal's rawPayload log.
 * Returns the serialized JSON string to store back on the Deal row.
 *
 * @param existing current value of Deal.rawPayload (may be null for brand-new
 *   deals, an already-serialized array, or the legacy single-body string)
 * @param entry the event to append — pass the raw JSON text of the inbound
 *   body; this function handles truncation and timestamping
 */
export function appendDealPayload(
  existing: string | null | undefined,
  entry: { method: DealPayloadMethod; body: string; ts?: string }
): string {
  const events = toEventArray(existing);

  events.push({
    ts: entry.ts || new Date().toISOString(),
    method: entry.method,
    body: entry.body.slice(0, MAX_BODY_BYTES),
  });

  // Cap by entry count first (cheap check).
  while (events.length > MAX_ENTRIES) events.shift();

  // Cap by total serialized bytes. Drop oldest until we fit.
  let serialized = JSON.stringify(events);
  while (serialized.length > MAX_TOTAL_BYTES && events.length > 1) {
    events.shift();
    serialized = JSON.stringify(events);
  }
  return serialized;
}

/**
 * Parse a stored rawPayload value into the event array for rendering.
 * Never throws — on malformed data returns either a single synthetic event
 * wrapping the raw string, or an empty array.
 */
export function parseDealPayloadLog(raw: string | null | undefined): DealPayloadEvent[] {
  return toEventArray(raw);
}
