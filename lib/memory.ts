// Siva's reading memory: everything she has read from her feeds (the live feed log), searchable by
// topic and by time ("today", "this week", "latest"). This is what lets her answer from what she has
// read herself — not only from the current top-60 briefing. Pure functions; easy to test.
import type { FeedLogEntry } from './types';

const DAY = 86_400_000;

const STOP = new Set(
  'what which who whom whose when where why how is are was were the a an of to in on for with about do does did you your know have has any tell me please explain latest new news today this that there their they them it its and or can could would should siva boss hey update updates recent recently happened happening going on week yesterday last past hours hour days day any anything something give show find search read cyber security cybersecurity'.split(' '),
);

export function memoryKeywords(q: string): string[] {
  return [...new Set(q.toLowerCase().replace(/[^a-z0-9\-. ]+/g, ' ').split(/\s+/).map((w) => w.replace(/^[.\-]+|[.\-]+$/g, '')).filter((w) => w.length >= 3 && !STOP.has(w)))];
}

/** Time window the question asks about, if any. */
export function timeWindow(q: string, now: Date): { from: number; label: string } | null {
  const t = q.toLowerCase();
  const n = now.getTime();
  if (/\b(today|this morning|tonight|last 24 hours|past 24 hours|right now|just now)\b/.test(t)) return { from: n - DAY, label: 'the last 24 hours' };
  if (/\byesterday\b/.test(t)) return { from: n - 2 * DAY, label: 'since yesterday' };
  const hrs = /\b(?:last|past)\s+(\d{1,2})\s+hours?\b/.exec(t);
  if (hrs) return { from: n - Number(hrs[1]) * 3_600_000, label: `the last ${hrs[1]} hours` };
  if (/\b(this week|past week|last week|last 7 days|past 7 days|weekly)\b/.test(t)) return { from: n - 7 * DAY, label: 'the last 7 days' };
  if (/\b(this month|past month|last 30 days)\b/.test(t)) return { from: n - 30 * DAY, label: 'the last 30 days' };
  if (/\b(latest|recent|recently|new|newest|updates?|happening|going on|breaking)\b/.test(t)) return { from: n - 3 * DAY, label: 'the last 3 days' };
  return null;
}

export interface MemoryHit {
  entry: FeedLogEntry;
  score: number;
}

const when = (e: FeedLogEntry) => Date.parse(e.publishedAt || e.firstSeenAt) || 0;

/**
 * Search what Siva has read. Matching words in the title count most; recent, exploited (KEV) and
 * critical items get a small boost. With a time window and no topic words, returns the most
 * important items from that window.
 */
export function searchMemory(log: FeedLogEntry[], question: string, now: Date, limit = 8): { hits: MemoryHit[]; window: ReturnType<typeof timeWindow>; words: string[] } {
  const words = memoryKeywords(question);
  const window = timeWindow(question, now);
  const cves = (question.match(/CVE-\d{4}-\d{4,7}/gi) ?? []).map((c) => c.toUpperCase());
  const hits: MemoryHit[] = [];
  for (const e of log) {
    const t = when(e);
    if (window && t < window.from) continue;
    const title = e.title.toLowerCase();
    const body = `${e.matter} ${e.source} ${e.cves.join(' ')}`.toLowerCase();
    let score = 0;
    let matched = 0;
    for (const w of words) {
      if (title.includes(w)) {
        score += 3;
        matched++;
      } else if (body.includes(w)) {
        score += 1;
        matched++;
      }
    }
    if (cves.some((c) => e.cves.includes(c) || e.title.toUpperCase().includes(c))) score += 6;
    if (words.length && matched === 0 && !score) continue;
    // Several topic words: require at least half of them (avoids weak one-word matches).
    if (words.length >= 3 && matched < Math.ceil(words.length / 2) && score < 6) continue;
    const ageDays = Math.max(0, (now.getTime() - t) / DAY);
    score += Math.max(0, 2 - ageDays * 0.3) + (e.kev ? 1.5 : 0) + (e.priority === 'critical' ? 1 : e.priority === 'high' ? 0.5 : 0);
    hits.push({ entry: e, score });
  }
  hits.sort((a, b) => b.score - a.score || when(b.entry) - when(a.entry));
  // One item per near-identical headline (the same story from several feeds).
  const seen = new Set<string>();
  const out: MemoryHit[] = [];
  for (const h of hits) {
    const k = h.entry.title.toLowerCase().replace(/[^a-z0-9 ]+/g, '').split(' ').slice(0, 8).join(' ');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h);
    if (out.length >= limit) break;
  }
  return { hits: out, window, words };
}

/** "My knowledge is current as of …": how fresh Siva's reading is. */
export function freshness(lastRunAt: string | null | undefined, now: Date): { ageMinutes: number | null; stale: boolean; label: string } {
  if (!lastRunAt) return { ageMinutes: null, stale: true, label: 'I have not read the news yet' };
  const age = Math.max(0, Math.round((now.getTime() - Date.parse(lastRunAt)) / 60_000));
  const label = age < 2 ? 'I read my sources just now' : age < 60 ? `I last read my sources ${age} minutes ago` : `I last read my sources ${Math.round(age / 6) / 10} hours ago`;
  return { ageMinutes: age, stale: age >= 120, label };
}

export function fmtDay(iso: string, tz: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { timeZone: tz, day: '2-digit', month: 'short' });
}
