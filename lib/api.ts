// Small helpers shared by the API route handlers.
import { checkRate } from './rateLimit';

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function errorJson(message: string, status: number, headers: Record<string, string> = {}) {
  return json({ error: message }, status, headers);
}

// The server listens on 127.0.0.1, so every caller is "local". X-Forwarded-For is client-controlled
// and is only honoured when you run behind your own reverse proxy (TRUST_PROXY=1).
export function clientKey(req: Request): string {
  if (process.env.TRUST_PROXY !== '1') return 'local';
  return req.headers.get('x-forwarded-for')?.split(',').pop()?.trim() || 'local';
}

/** Returns a 429 response if the caller is over the limit, otherwise null. */
export function limited(req: Request, bucket: string, limit: number, windowMs: number): Response | null {
  const r = checkRate(`${bucket}:${clientKey(req)}`, limit, windowMs);
  return r.ok ? null : errorJson(`Too many requests. Try again in ${r.retryAfterSec} s.`, 429, { 'retry-after': String(r.retryAfterSec) });
}

/** Read a small JSON body safely (max 16 KB). */
export async function readJsonBody(req: Request, maxBytes = 16_384): Promise<{ ok: true; value: unknown } | { ok: false; res: Response }> {
  const text = await req.text();
  if (text.length > maxBytes) return { ok: false, res: errorJson('Request body too large', 413) };
  try {
    return { ok: true, value: JSON.parse(text || '{}') };
  } catch {
    return { ok: false, res: errorJson('Body must be valid JSON', 400) };
  }
}
