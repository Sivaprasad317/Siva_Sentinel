// Simple in-memory rate limiter (fixed window). Protects your Gemini quota and the
// public sources from accidental floods, e.g. a stuck button or a script.
const g = globalThis as unknown as { __sivaRate?: Map<string, { count: number; resetAt: number }> };

export function checkRate(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  g.__sivaRate ??= new Map();
  const map = g.__sivaRate;
  if (map.size > 1000) for (const [k, v] of map) if (v.resetAt <= now) map.delete(k);
  const entry = map.get(key);
  if (!entry || entry.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (entry.count >= limit) return { ok: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  entry.count++;
  return { ok: true, retryAfterSec: 0 };
}

export function resetRateLimits() {
  g.__sivaRate?.clear();
}
