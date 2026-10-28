// Cleaning helpers: turn messy feed text into consistent, safe values.

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff) return '';
      try {
        return String.fromCodePoint(n);
      } catch {
        return '';
      }
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** Remove HTML tags/scripts and collapse whitespace. Output is plain text only. */
export function stripHtml(input: string, maxLen = 600): string {
  let s = input
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
  s = decodeEntities(s).replace(/<[^>]*>/g, ' '); // second pass for double-encoded HTML
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > maxLen) s = s.slice(0, maxLen - 1).trimEnd() + '…';
  return s;
}

const TRACKING_PARAMS = /^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|ref|cmpid|_hsenc|_hsmi)$/i;

/**
 * Clean a URL (drop tracking params, fragment, trailing slash) while keeping it openable:
 * the scheme and any "www." are left alone, since some sites only answer on one of them.
 * Returns null for non-http(s) URLs. Use urlKey() to compare two URLs.
 */
export function canonicalUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '');
  return u.toString();
}

/** Comparison key: the same article over http/https or with/without "www." gives the same key. */
export function urlKey(raw: string): string {
  const c = canonicalUrl(raw);
  if (!c) return raw.trim();
  const u = new URL(c);
  u.protocol = 'https:';
  u.hostname = u.hostname.replace(/^www\./, '');
  return u.toString();
}

/**
 * Validate a timestamp from a feed. Returns ISO string or null.
 * Rejects unparseable dates, dates before 2000 and dates more than 1 hour in the future
 * (a future date usually means a broken feed, not real news).
 */
export function parseDate(raw: string | null | undefined, now: Date = new Date()): string | null {
  if (!raw) return null;
  const t = Date.parse(raw.trim());
  if (!Number.isFinite(t)) return null;
  if (t > now.getTime() + 60 * 60 * 1000) return null;
  if (t < Date.UTC(2000, 0, 1)) return null;
  return new Date(t).toISOString();
}

export function extractCves(text: string): string[] {
  const found = text.match(/CVE-\d{4}-\d{4,7}/gi) ?? [];
  return [...new Set(found.map((c) => c.toUpperCase()))];
}

const STOPWORDS = new Set(
  'the a an and or of to in on for with from by at as is are was were be its it this that new over after into via how why what who your you our than more'.split(' '),
);

export function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\- ]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Minimal shape needed for deduplication (Story satisfies it). */
export interface Dedupable {
  title: string;
  url: string;
  source: string;
  sources: { name: string; url: string; publishedAt: string | null; official: boolean }[];
  publishedAt: string | null;
  snippet: string;
  cves: string[];
}

/**
 * Merge stories that are really the same news:
 *  - same canonical URL, or
 *  - very similar titles (Jaccard >= 0.7), or
 *  - both about exactly one CVE, and it is the same CVE.
 * The merged story keeps every source so the dashboard can show "reported by N outlets".
 */
export function dedupeStories<T extends Dedupable>(stories: T[], threshold = 0.7): T[] {
  const out: T[] = [];
  const tokens = new Map<T, Set<string>>();
  const tok = (s: T) => {
    let t = tokens.get(s);
    if (!t) tokens.set(s, (t = titleTokens(s.title)));
    return t;
  };
  for (const s of stories) {
    const match = out.find(
      (o) =>
        urlKey(o.url) === urlKey(s.url) ||
        jaccard(tok(o), tok(s)) >= threshold ||
        (o.cves.length === 1 && s.cves.length === 1 && o.cves[0] === s.cves[0]),
    );
    if (!match) {
      out.push(s);
      continue;
    }
    for (const ref of s.sources) {
      if (!match.sources.some((r) => urlKey(r.url) === urlKey(ref.url))) match.sources.push(ref);
    }
    match.cves = [...new Set([...match.cves, ...s.cves])];
    if (s.publishedAt && (!match.publishedAt || s.publishedAt < match.publishedAt)) match.publishedAt = s.publishedAt;
    if (s.snippet.length > match.snippet.length) match.snippet = s.snippet;
  }
  return out;
}
