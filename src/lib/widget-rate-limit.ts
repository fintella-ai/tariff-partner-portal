const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS = 20;

const store = new Map<string, number[]>();

setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, timestamps] of store) {
    const valid = timestamps.filter((t) => t > cutoff);
    if (valid.length === 0) store.delete(key);
    else store.set(key, valid);
  }
}, 60_000);

export function checkWidgetRateLimit(apiKeyHint: string): {
  ok: boolean;
  remaining: number;
  retryAfterMs?: number;
} {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const timestamps = (store.get(apiKeyHint) || []).filter((t) => t > cutoff);

  if (timestamps.length >= MAX_REQUESTS) {
    const oldest = timestamps[0];
    return { ok: false, remaining: 0, retryAfterMs: oldest + WINDOW_MS - now };
  }

  timestamps.push(now);
  store.set(apiKeyHint, timestamps);
  return { ok: true, remaining: MAX_REQUESTS - timestamps.length };
}
