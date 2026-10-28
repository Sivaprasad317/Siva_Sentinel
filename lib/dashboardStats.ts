// Numbers for the main dashboard charts, computed from everything Siva has read (the live feed log).
// Pure functions so they can be tested without a browser.
import type { FeedLogEntry, Priority } from './types';

export const SEVERITIES: Priority[] = ['critical', 'high', 'medium', 'low'];

export interface DayBucket {
  key: string; // YYYY-MM-DD in the user's time zone
  label: string; // "18 Oct"
  weekday: string; // "Sun"
  counts: Record<Priority, number>;
  kev: number;
  total: number;
}

export interface DashboardStats {
  days: DayBucket[];
  severity: Record<Priority, number>; // last 7 days
  severityTotal: number;
  topSources: { name: string; count: number }[]; // last 7 days
  topCves: { id: string; count: number }[]; // last 7 days
  weekTotal: number;
  prevWeekTotal: number;
  kevWeek: number;
}

const DAY = 86_400_000;

function dayKey(d: Date, tz: string): string {
  try {
    // en-CA formats as YYYY-MM-DD
    return d.toLocaleDateString('en-CA', { timeZone: tz });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

const zero = (): Record<Priority, number> => ({ critical: 0, high: 0, medium: 0, low: 0 });
const when = (e: FeedLogEntry) => Date.parse(e.publishedAt || e.firstSeenAt) || Date.parse(e.firstSeenAt) || 0;

export function dashboardStats(log: FeedLogEntry[], now: Date, tz: string, dayCount = 14): DashboardStats {
  const days: DayBucket[] = [];
  const index = new Map<string, DayBucket>();
  for (let i = dayCount - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY);
    const key = dayKey(d, tz);
    if (index.has(key)) continue;
    const b: DayBucket = {
      key,
      label: d.toLocaleDateString('en-GB', { timeZone: tz, day: 'numeric', month: 'short' }),
      weekday: d.toLocaleDateString('en-GB', { timeZone: tz, weekday: 'short' }),
      counts: zero(),
      kev: 0,
      total: 0,
    };
    days.push(b);
    index.set(key, b);
  }
  const severity = zero();
  const sources = new Map<string, number>();
  const cves = new Map<string, number>();
  let weekTotal = 0;
  let prevWeekTotal = 0;
  let kevWeek = 0;
  const t0 = now.getTime();
  for (const e of log) {
    const t = when(e);
    if (!t || t > t0 + DAY) continue;
    const pr: Priority = SEVERITIES.includes(e.priority) ? e.priority : 'low';
    const b = index.get(dayKey(new Date(t), tz));
    if (b) {
      b.counts[pr] += 1;
      b.total += 1;
      if (e.kev) b.kev += 1;
    }
    const age = t0 - t;
    if (age <= 7 * DAY) {
      weekTotal += 1;
      severity[pr] += 1;
      if (e.kev) kevWeek += 1;
      sources.set(e.source, (sources.get(e.source) ?? 0) + 1);
      for (const c of e.cves) cves.set(c, (cves.get(c) ?? 0) + 1);
    } else if (age <= 14 * DAY) prevWeekTotal += 1;
  }
  const top = <T extends string>(m: Map<T, number>, n: number) =>
    [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
  return {
    days,
    severity,
    severityTotal: SEVERITIES.reduce((s, k) => s + severity[k], 0),
    topSources: top(sources, 8).map(([name, count]) => ({ name, count })),
    topCves: top(cves, 6).map(([id, count]) => ({ id, count })),
    weekTotal,
    prevWeekTotal,
    kevWeek,
  };
}

/** "+23% vs last week" style change (null when there is nothing to compare). */
export function weekChange(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

/** Nice round maximum for a y-axis, plus 3 tick values. */
export function niceScale(max: number): { max: number; ticks: number[] } {
  if (max <= 0) return { max: 4, ticks: [0, 2, 4] };
  const raw = max / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return { max: top, ticks };
}
