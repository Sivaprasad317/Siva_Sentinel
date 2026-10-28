// Fetchers for the live intelligence sources: RSS feeds, CISA KEV and NVD.
import type { Cvss, FeedConfig, KevInfo, RawItem, SourceStatus } from './types';
import { KEV_URL, NVD_URL, getEnv } from './config';
import { fetchWithRetry, readTextLimited } from './http';
import { discoverFeedLinks, looksLikeHtml, parseFeed } from './feedParser';

/** Page URL → feed URL found by auto-discovery (kept for the life of the server). */
const discovered = new Map<string, string>();

export async function fetchFeed(feed: FeedConfig, now = new Date()): Promise<{ items: RawItem[]; status: SourceStatus }> {
  const fetchedAt = now.toISOString();
  try {
    const res = await fetchWithRetry(feed.url, {
      publicOnly: true,
      headers: { 'user-agent': getEnv().userAgent, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
    });
    const zerohour = /(^|\/\/)zerohour\.day\//i.test(feed.url);
    const aggregator = /news\.google\.com/i.test(feed.url) || zerohour;
    let xml = await readTextLimited(res);
    let note: string | undefined;
    // A blog home page instead of a feed: find its advertised RSS/Atom feed and read that instead.
    if (looksLikeHtml(xml)) {
      const known = discovered.get(feed.url);
      const candidates = known ? [known] : discoverFeedLinks(xml, feed.url).slice(0, 2);
      if (!candidates.length) throw new Error('This is a web page with no RSS/Atom feed advertised. Add its feed URL instead (often /feed/ or /rss).');
      let got = false;
      for (const c of candidates) {
        try {
          const r2 = await fetchWithRetry(c, { retries: 1, publicOnly: true, headers: { 'user-agent': getEnv().userAgent, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } });
          const x2 = await readTextLimited(r2);
          if (looksLikeHtml(x2)) continue;
          xml = x2;
          discovered.set(feed.url, c);
          note = `read via discovered feed ${c}`;
          got = true;
          break;
        } catch {
          /* try the next candidate */
        }
      }
      if (!got) throw new Error('The page advertises a feed, but it could not be read.');
    }
    const items = parseFeed(xml, feed.name, feed.official, now, aggregator, zerohour);
    return { items, status: { name: feed.name, kind: 'rss', ok: true, items: items.length, fetchedAt, ...(note ? { note } : {}) } };
  } catch (err) {
    return { items: [], status: { name: feed.name, kind: 'rss', ok: false, items: 0, error: (err as Error).message, fetchedAt } };
  }
}

const CVE_RE = /^CVE-\d{4}-\d{4,7}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate the KEV JSON. Entries that do not have the expected shape are dropped, not guessed. */
export function parseKev(json: unknown): KevInfo[] {
  const list = (json as { vulnerabilities?: unknown })?.vulnerabilities;
  if (!Array.isArray(list)) throw new Error('KEV feed has an unexpected format');
  const out: KevInfo[] = [];
  for (const v of list) {
    if (!v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    const str = (k: string) => (typeof r[k] === 'string' ? (r[k] as string).trim() : '');
    const entry: KevInfo = {
      cveID: str('cveID'),
      vendorProject: str('vendorProject'),
      product: str('product'),
      vulnerabilityName: str('vulnerabilityName'),
      dateAdded: str('dateAdded'),
      shortDescription: str('shortDescription'),
      requiredAction: str('requiredAction'),
      dueDate: str('dueDate'),
      knownRansomwareCampaignUse: str('knownRansomwareCampaignUse') || 'Unknown',
    };
    if (!CVE_RE.test(entry.cveID) || !DATE_RE.test(entry.dateAdded)) continue;
    out.push(entry);
  }
  return out;
}

export async function fetchKev(now = new Date()): Promise<{ entries: KevInfo[]; status: SourceStatus }> {
  const fetchedAt = now.toISOString();
  try {
    const res = await fetchWithRetry(KEV_URL, { headers: { 'user-agent': getEnv().userAgent }, timeoutMs: 30_000 });
    const entries = parseKev(JSON.parse(await readTextLimited(res, 30_000_000)));
    return { entries, status: { name: 'CISA KEV catalog', kind: 'kev', ok: true, items: entries.length, fetchedAt } };
  } catch (err) {
    return { entries: [], status: { name: 'CISA KEV catalog', kind: 'kev', ok: false, items: 0, error: (err as Error).message, fetchedAt } };
  }
}

/** KEV entries added within the last `days` days. */
export function recentKev(entries: KevInfo[], now: Date, days: number): KevInfo[] {
  const cutoff = now.getTime() - days * 86_400_000;
  return entries.filter((e) => Date.parse(`${e.dateAdded}T00:00:00Z`) >= cutoff);
}

/** Pull the best available CVSS score out of an NVD API 2.0 response. */
export function parseNvdCvss(json: unknown, cve: string): Cvss | null {
  const vuln = (json as { vulnerabilities?: { cve?: { id?: string; metrics?: Record<string, unknown> } }[] })?.vulnerabilities?.[0]?.cve;
  if (!vuln || vuln.id !== cve || !vuln.metrics) return null;
  const order: [string, string][] = [
    ['cvssMetricV40', '4.0'],
    ['cvssMetricV31', '3.1'],
    ['cvssMetricV30', '3.0'],
  ];
  for (const [key, version] of order) {
    const arr = vuln.metrics[key];
    if (!Array.isArray(arr) || !arr.length) continue;
    // Prefer NVD's own ("Primary") score, else the first one listed.
    const metric = (arr.find((m: { type?: string }) => m?.type === 'Primary') ?? arr[0]) as {
      cvssData?: { baseScore?: number; baseSeverity?: string };
    };
    const score = metric?.cvssData?.baseScore;
    if (typeof score === 'number' && score >= 0 && score <= 10) {
      return { cve, score, severity: String(metric.cvssData?.baseSeverity ?? 'UNKNOWN'), version };
    }
  }
  return null;
}

export async function fetchNvdCvss(cve: string): Promise<Cvss | null> {
  const { nvdKey, userAgent } = getEnv();
  const headers: Record<string, string> = { 'user-agent': userAgent };
  if (nvdKey) headers.apiKey = nvdKey;
  const res = await fetchWithRetry(`${NVD_URL}?cveId=${encodeURIComponent(cve)}`, { headers, timeoutMs: 20_000, baseDelayMs: 6_000 });
  return parseNvdCvss(await res.json(), cve);
}

export interface NvdDetails {
  cve: string;
  description: string;
  published: string | null;
  cvss: Cvss | null;
  references: string[];
  /** Weakness types (CWE IDs) NVD assigned, e.g. ["CWE-79"]. */
  cwes?: string[];
}

/** Description, dates, score and references for one CVE from an NVD API 2.0 response. */
export function parseNvdDetails(json: unknown, cve: string): NvdDetails | null {
  const v = (json as { vulnerabilities?: { cve?: { id?: string; published?: string; descriptions?: { lang?: string; value?: string }[]; references?: { url?: string }[]; weaknesses?: { description?: { value?: string }[] }[] } }[] })
    ?.vulnerabilities?.[0]?.cve;
  if (!v || v.id !== cve) return null;
  const description = v.descriptions?.find((d) => d.lang === 'en')?.value ?? '';
  return {
    cve,
    description: description.slice(0, 2000),
    published: typeof v.published === 'string' ? v.published : null,
    cvss: parseNvdCvss(json, cve),
    references: (v.references ?? []).map((r) => r.url).filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, 8),
    cwes: [...new Set((v.weaknesses ?? []).flatMap((w) => (w.description ?? []).map((d) => d.value ?? '')).filter((x) => /^CWE-\d+$/.test(x)))].slice(0, 4),
  };
}

export async function fetchNvdDetails(cve: string): Promise<NvdDetails | null> {
  const { nvdKey, userAgent } = getEnv();
  const headers: Record<string, string> = { 'user-agent': userAgent };
  if (nvdKey) headers.apiKey = nvdKey;
  const res = await fetchWithRetry(`${NVD_URL}?cveId=${encodeURIComponent(cve)}`, { headers, timeoutMs: 20_000, baseDelayMs: 6_000 });
  return parseNvdDetails(await res.json(), cve);
}

const kevMem = globalThis as unknown as { __sivaKev?: { at: number; map: Map<string, KevInfo> } };

/** CISA KEV as a map, cached in memory for 6 hours (used by scans and CVE questions). */
export async function getKevMap(): Promise<Map<string, KevInfo>> {
  const c = kevMem.__sivaKev;
  if (c && Date.now() - c.at < 6 * 3_600_000) return c.map;
  const { entries, status } = await fetchKev();
  if (!status.ok) {
    if (c) return c.map;
    throw new Error(status.error ?? 'Could not load CISA KEV');
  }
  const map = new Map(entries.map((e) => [e.cveID, e]));
  kevMem.__sivaKev = { at: Date.now(), map };
  return map;
}
