const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10; // per IP per 15 min

const store = new Map<string, number[]>();

setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  const keys = Array.from(store.keys());
  for (const key of keys) {
    const timestamps = store.get(key);
    if (!timestamps) continue;
    const valid = timestamps.filter((t) => t > cutoff);
    if (valid.length === 0) store.delete(key);
    else store.set(key, valid);
  }
}, 60_000);

export function checkAuthRateLimit(ip: string): { ok: boolean; remaining: number; retryAfterMs?: number } {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const timestamps = (store.get(ip) || []).filter((t) => t > cutoff);

  if (timestamps.length >= MAX_ATTEMPTS) {
    const oldest = timestamps[0];
    return { ok: false, remaining: 0, retryAfterMs: oldest + WINDOW_MS - now };
  }

  timestamps.push(now);
  store.set(ip, timestamps);
  return { ok: true, remaining: MAX_ATTEMPTS - timestamps.length };
}
