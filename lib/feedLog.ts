// The live feed log: every item Siva reads, kept (newest first) so you can see exactly what came in
// and when — even items that did not make the top-60 briefing. Pure functions, easy to test.
import type { FeedLogEntry, Story } from './types';

export const FEED_LOG_CAP = 2000;

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** "What matters" text: Gemini's explanation if present, else the summary, else the feed snippet. */
export function matterText(s: Pick<Story, 'whyItMatters' | 'summary' | 'snippet' | 'aiGenerated'>): string {
  const best = (s.aiGenerated && (s.whyItMatters || s.summary)) || s.summary || s.snippet || s.whyItMatters || '';
  return clip(best, 260);
}

export function entryFromStory(s: Story, now: string): FeedLogEntry {
  return {
    url: s.url,
    title: clip(s.title, 200),
    source: s.source,
    publishedAt: s.publishedAt,
    firstSeenAt: s.firstSeenAt ?? now,
    matter: matterText(s),
    priority: s.priority,
    kev: Boolean(s.kev),
    cyber: !s.categories.includes('general'),
    cves: s.cves.slice(0, 4),
  };
}

/**
 * Merge freshly-read stories into the log. Existing rows keep their firstSeenAt; their text and
 * priority are refreshed. Returns the new log (newest first, capped) and how many rows were NEW.
 */
export function mergeFeedLog(existing: FeedLogEntry[], pool: Story[], now: string, cap = FEED_LOG_CAP): { log: FeedLogEntry[]; added: number } {
  const byUrl = new Map(existing.map((e) => [e.url, e]));
  let added = 0;
  for (const s of pool) {
    const prev = byUrl.get(s.url);
    if (prev) {
      byUrl.set(s.url, { ...entryFromStory(s, prev.firstSeenAt), firstSeenAt: prev.firstSeenAt });
    } else {
      byUrl.set(s.url, entryFromStory({ ...s, firstSeenAt: now }, now));
      added++;
    }
  }
  const log = [...byUrl.values()].sort((a, b) => sortKey(b).localeCompare(sortKey(a))).slice(0, cap);
  return { log, added };
}

/** Newest first by publish time, falling back to when we first saw it. */
export function sortKey(e: Pick<FeedLogEntry, 'publishedAt' | 'firstSeenAt'>): string {
  return e.publishedAt || e.firstSeenAt;
}

export function feedLogStats(log: FeedLogEntry[], todayKeyOf: (iso: string) => string, todayKey: string) {
  return { total: log.length, today: log.filter((e) => todayKeyOf(e.firstSeenAt) === todayKey).length };
}
