// A careful wrapper around fetch():
//  - stops waiting after a timeout
//  - retries ONLY temporary failures (network errors, HTTP 429 "too many requests", HTTP 5xx)
//  - never retries permanent errors like 400/401/403/404 (retrying those just wastes quota)
//  - honours the server's Retry-After header (capped at 30 s)

import { assertPublicUrl } from './netGuard';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface RetryOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  retries?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** For untrusted URLs: refuse loopback/private addresses, re-checking every redirect hop. */
  publicOnly?: boolean;
}

async function guardedFetch(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= 5; hop++) {
    try {
      await assertPublicUrl(current);
    } catch (err) {
      throw new HttpError(0, (err as Error).message, false);
    }
    const res = await fetchImpl(current, { ...init, redirect: 'manual' });
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  throw new HttpError(0, `Too many redirects from ${hostOf(url)}`, false);
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'unknown host';
  }
}

export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const when = Date.parse(value);
  if (Number.isFinite(when)) return Math.max(0, when - now);
  return null;
}

export async function fetchWithRetry(url: string, opts: RetryOptions = {}): Promise<Response> {
  const {
    method = 'GET',
    headers,
    body,
    retries = 2,
    timeoutMs = 15_000,
    baseDelayMs = 800,
    fetchImpl = fetch,
    sleep = defaultSleep,
    publicOnly = false,
  } = opts;

  let lastError: HttpError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = publicOnly
        ? await guardedFetch(fetchImpl, url, { method, headers, body, signal: controller.signal, cache: 'no-store' })
        : await fetchImpl(url, { method, headers, body, signal: controller.signal, redirect: 'follow', cache: 'no-store' });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof HttpError && !err.retryable) throw err;
      const aborted = (err as Error)?.name === 'AbortError';
      lastError = new HttpError(0, `${aborted ? 'Timed out' : 'Network error'} contacting ${hostOf(url)}`, true);
      if (attempt === retries) throw lastError;
      await sleep(baseDelayMs * 2 ** attempt);
      continue;
    }
    clearTimeout(timer);

    if (res.ok) return res;

    const retryable = res.status === 429 || res.status >= 500;
    const error = new HttpError(res.status, `HTTP ${res.status} from ${hostOf(url)}`, retryable);
    if (!retryable || attempt === retries) throw error;
    lastError = error;
    const wait = parseRetryAfter(res.headers.get('retry-after')) ?? baseDelayMs * 2 ** attempt;
    await sleep(Math.min(wait, 30_000));
  }
  throw lastError ?? new HttpError(0, `Request to ${hostOf(url)} failed`, false);
}

/** Read a response body as text, refusing absurdly large bodies. */
export async function readTextLimited(res: Response, maxBytes = 5_000_000): Promise<string> {
  const tooLarge = (n: number | string) => new HttpError(0, `Response too large (${n} bytes, limit ${maxBytes})`, false);
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw tooLarge(declared);
  }
  if (!res.body) return '';
  // Count bytes as they arrive and stop as soon as the limit is passed, so a huge body is never buffered.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel().catch(() => {});
      throw tooLarge(`over ${maxBytes}`);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}
