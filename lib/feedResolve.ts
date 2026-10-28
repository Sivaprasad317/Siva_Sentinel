// Resolve the effective list of feeds to fetch, from three layers:
//   1. built-in core feeds (lib/config FEEDS) — always on unless the user disabled one
//   2. seed threat-intel feeds (lib/feedSeeds) — on if defaultOn, or if the user enabled it
//   3. the user's own custom feeds (store.sources)
// The user's choices (store.feedPrefs: url -> on/off) override the defaults.
// Everything is de-duplicated by canonical URL so no feed is fetched twice.
import type { CustomSource, FeedConfig, SourceRow } from './types';
import { FEEDS } from './config';
import { FEED_SEEDS } from './feedSeeds';
import { canonicalUrl, urlKey } from './normalize';
import { isPrivateHost } from './netGuard';

/** Guess whether a URL is a real RSS/Atom feed or just an HTML page. */
export function feedKind(url: string): 'feed' | 'page' {
  const u = url.toLowerCase();
  if (/\.(xml|rss|atom)(\?|#|$)/.test(u)) return 'feed';
  if (/\/(feed|rss|rssfeed|rssfeed_full|blogfeed|feeds)(\/|\b|$)/.test(u)) return 'feed';
  if (/[?&](format|type)=(rss|atom|xml)/.test(u)) return 'feed';
  if (/(^|\.)feeds?\./.test(new URL(url).host.toLowerCase())) return 'feed';
  if (/\/rss\//.test(u) || u.endsWith('/rss')) return 'feed';
  return 'page';
}

export interface StoreLike {
  sources?: CustomSource[];
  feedPrefs?: Record<string, boolean>;
}

/** Canonical key a feed URL is stored under in feedPrefs / de-dup. */
export function feedPrefKey(url: string): string {
  return canonicalUrl(url) ? urlKey(url) : url.toLowerCase().replace(/\/+$/, '');
}
const key = feedPrefKey;

/** Full list of sources with their enabled state, for the Sources panel. */
export function resolveAllSources(store: StoreLike): SourceRow[] {
  const prefs = store.feedPrefs ?? {};
  const rows: SourceRow[] = [];
  const seen = new Set<string>();
  const seenNames = new Set<string>();
  const add = (r: SourceRow) => {
    const k = key(r.url);
    const nk = r.name.trim().toLowerCase();
    // Same feed (URL) or same publisher name already listed: keep the first (built-in wins),
    // so nothing is fetched twice and every name is unique on screen.
    if (seen.has(k) || (r.origin !== 'custom' && seenNames.has(nk))) return;
    if (seenNames.has(nk)) r = { ...r, name: `${r.name} (yours)` };
    seen.add(k);
    seenNames.add(r.name.trim().toLowerCase());
    rows.push(r);
  };
  for (const f of FEEDS as FeedConfig[]) {
    add({ name: f.name, url: f.url, category: 'core', origin: 'builtin', kind: feedKind(f.url), enabled: prefs[key(f.url)] !== false, official: f.official });
  }
  for (const s of FEED_SEEDS) {
    const pref = prefs[key(s.url)];
    add({ name: s.name, url: s.url, category: s.category, origin: 'seed', kind: feedKind(s.url), enabled: pref === undefined ? s.defaultOn : pref, official: false });
  }
  for (const c of store.sources ?? []) {
    add({ name: c.name, url: c.url, category: 'research', origin: 'custom', kind: feedKind(c.url), enabled: c.enabled, official: false, id: c.id });
  }
  return rows;
}

/** Just the enabled feeds, as FeedConfig, ready for the refresh pipeline. */
export function resolveFeeds(store: StoreLike): FeedConfig[] {
  return resolveAllSources(store)
    .filter((r) => r.enabled)
    .map((r) => ({ name: r.name, url: r.url, official: r.official }));
}

export function validateCustomSource(name: unknown, url: unknown): { ok: true; name: string; url: string } | { ok: false; error: string } {
  if (typeof name !== 'string' || !name.trim() || name.length > 80) return { ok: false, error: 'Give the source a short name (max 80 characters).' };
  if (typeof url !== 'string') return { ok: false, error: 'Enter a feed URL.' };
  const c = canonicalUrl(url);
  if (!c) return { ok: false, error: 'Enter a valid http(s) feed URL.' };
  if (isPrivateHost(new URL(c).hostname)) return { ok: false, error: 'Feed URLs must point to a public website, not a local or private address.' };
  return { ok: true, name: name.trim(), url: c };
}
