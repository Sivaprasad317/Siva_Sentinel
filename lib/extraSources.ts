// Extra live sources added in patch 2:
//  - Hacker News (Y Combinator) via the official Algolia search API (community discussion)
//  - ransomware.live API v2 (ransomware leak-site posts: these are CLAIMS, not confirmed breaches)
import type { RawItem, SourceStatus } from './types';
import { HN_QUERIES, HN_SEARCH_URL, RANSOMWARE_LIVE_URL, getEnv } from './config';
import { fetchWithRetry, readTextLimited } from './http';
import { canonicalUrl, parseDate, stripHtml } from './normalize';
import { categorize } from './prioritize';

// ---------------- Hacker News ----------------

interface HnHit {
  objectID?: unknown;
  title?: unknown;
  url?: unknown;
  created_at?: unknown;
  points?: unknown;
  num_comments?: unknown;
}

/** Turn Algolia hits into RawItems. Keeps only security-related stories with some community traction. */
export function parseHnHits(json: unknown, now: Date, minPoints = 15): RawItem[] {
  const hits = (json as { hits?: unknown })?.hits;
  if (!Array.isArray(hits)) throw new Error('Hacker News API returned an unexpected format');
  const out: RawItem[] = [];
  for (const h of hits as HnHit[]) {
    const id = typeof h.objectID === 'string' ? h.objectID : '';
    const title = typeof h.title === 'string' ? stripHtml(h.title, 300) : '';
    if (!id || !title) continue;
    const points = typeof h.points === 'number' ? h.points : 0;
    if (points < minPoints) continue;
    if (categorize(title).includes('general')) continue; // not security related
    const discussion = `https://news.ycombinator.com/item?id=${encodeURIComponent(id)}`;
    const url = (typeof h.url === 'string' && canonicalUrl(h.url)) || discussion;
    const comments = typeof h.num_comments === 'number' ? h.num_comments : 0;
    out.push({
      title,
      url,
      publishedAt: parseDate(typeof h.created_at === 'string' ? h.created_at : null, now),
      snippet: `Discussed on Hacker News: ${points} points, ${comments} comments. Discussion: ${discussion}`,
      source: 'Hacker News',
      official: false,
      origin: 'community',
    });
  }
  return out;
}

export async function fetchHackerNews(now: Date, lookbackDays: number): Promise<{ items: RawItem[]; status: SourceStatus }> {
  const fetchedAt = now.toISOString();
  const since = Math.floor(now.getTime() / 1000) - lookbackDays * 86_400;
  const seen = new Set<string>();
  const items: RawItem[] = [];
  let failures = 0;
  let lastError = '';
  for (const q of HN_QUERIES) {
    const url = `${HN_SEARCH_URL}?tags=story&hitsPerPage=30&query=${encodeURIComponent(q)}&numericFilters=${encodeURIComponent(`created_at_i>${since}`)}`;
    try {
      const res = await fetchWithRetry(url, { headers: { 'user-agent': getEnv().userAgent } });
      for (const item of parseHnHits(JSON.parse(await readTextLimited(res)), now)) {
        if (seen.has(item.url)) continue;
        seen.add(item.url);
        items.push(item);
      }
    } catch (err) {
      failures++;
      lastError = (err as Error).message;
    }
  }
  const ok = failures < HN_QUERIES.length;
  return {
    items,
    status: { name: 'Hacker News (Algolia API)', kind: 'rss', ok, items: items.length, error: failures ? `${failures}/${HN_QUERIES.length} queries failed: ${lastError}` : undefined, fetchedAt },
  };
}

// ---------------- ransomware.live ----------------

export interface LeakClaim {
  victim: string;
  group: string;
  date: string | null;
  country: string;
  url: string | null;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Parse ransomware.live records defensively (field names differ between API versions). */
export function parseRansomwareLive(json: unknown, now: Date): LeakClaim[] {
  const list = Array.isArray(json) ? json : (json as { victims?: unknown; data?: unknown })?.victims ?? (json as { data?: unknown })?.data;
  if (!Array.isArray(list)) throw new Error('ransomware.live returned an unexpected format');
  const out: LeakClaim[] = [];
  for (const r of list as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object') continue;
    const victim = stripHtml(str(r.victim) || str(r.post_title) || str(r.name), 200);
    const group = stripHtml(str(r.group) || str(r.group_name), 80);
    if (!victim || !group) continue;
    const rawUrl = str(r.url) || str(r.post_url);
    out.push({
      victim,
      group,
      date: parseDate(str(r.attackdate) || str(r.discovered) || str(r.published) || null, now),
      country: str(r.country).toUpperCase().slice(0, 2),
      url: rawUrl ? canonicalUrl(rawUrl) : null,
    });
  }
  return out;
}

/**
 * Turn many leak-site claims into a few briefing items:
 *  - one summary item (counts per group), and
 *  - one item per claim whose country matches the user's watch list (default: India).
 */
export function claimsToItems(claims: LeakClaim[], now: Date, lookbackDays: number, watchCountries: string[] = ['IN']): RawItem[] {
  const cutoff = now.getTime() - lookbackDays * 86_400_000;
  const recent = claims.filter((c) => !c.date || Date.parse(c.date) >= cutoff);
  if (!recent.length) return [];
  const byGroup = new Map<string, number>();
  for (const c of recent) byGroup.set(c.group, (byGroup.get(c.group) ?? 0) + 1);
  const top = [...byGroup.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const items: RawItem[] = [
    {
      title: `Ransomware leak-site claims: ${recent.length} new victim posts in the last ${lookbackDays} day(s)`,
      url: 'https://www.ransomware.live/',
      publishedAt: now.toISOString(),
      snippet: `Ransomware groups claim these attacks on their leak sites; victims have not necessarily confirmed them. Most active groups: ${top.map(([g, n]) => `${g} (${n})`).join(', ')}.`,
      source: 'ransomware.live',
      official: false,
      origin: 'leak-site',
    },
  ];
  for (const c of recent) {
    if (!watchCountries.includes(c.country)) continue;
    items.push({
      title: `${c.group} ransomware claims attack on ${c.victim} (${c.country})`,
      url: c.url ?? `https://www.ransomware.live/#${encodeURIComponent(`${c.group}-${c.victim}`)}`,
      publishedAt: c.date,
      snippet: `The ${c.group} group listed "${c.victim}" on its leak site. This is a claim by the attackers and is not confirmed by the victim.`,
      source: 'ransomware.live',
      official: false,
      origin: 'leak-site',
    });
  }
  return items;
}

export async function fetchRansomwareLive(now: Date, lookbackDays: number): Promise<{ items: RawItem[]; status: SourceStatus }> {
  const fetchedAt = now.toISOString();
  try {
    const res = await fetchWithRetry(RANSOMWARE_LIVE_URL, { headers: { 'user-agent': getEnv().userAgent, accept: 'application/json' }, timeoutMs: 30_000 });
    const claims = parseRansomwareLive(JSON.parse(await readTextLimited(res, 20_000_000)), now);
    const items = claimsToItems(claims, now, lookbackDays);
    return { items, status: { name: 'ransomware.live (leak-site claims)', kind: 'rss', ok: true, items: claims.length, fetchedAt } };
  } catch (err) {
    return { items: [], status: { name: 'ransomware.live (leak-site claims)', kind: 'rss', ok: false, items: 0, error: (err as Error).message, fetchedAt } };
  }
}
