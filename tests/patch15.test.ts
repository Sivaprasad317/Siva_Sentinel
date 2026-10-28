// Patch 15: one dashboard with charts, no "Namaste", Siva asks how he can help.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardStats, niceScale, weekChange } from '../lib/dashboardStats';
import { stripNamaste } from '../lib/voice';
import { greetLine } from '../lib/avatarMotion';
import { SYSTEM_RULES } from '../lib/ai';
import type { FeedLogEntry } from '../lib/types';

const NOW = new Date('2026-10-18T09:00:00Z'); // 14:30 IST
const e = (hoursAgo: number, priority: FeedLogEntry['priority'], source = 'BleepingComputer', extra: Partial<FeedLogEntry> = {}): FeedLogEntry => ({
  url: `https://x.example/${Math.random()}`,
  title: 't',
  source,
  publishedAt: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(),
  firstSeenAt: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(),
  matter: '',
  priority,
  kev: false,
  cves: [],
  ...extra,
});

test('dashboard stats: 14 day buckets, stacked by severity, in the user time zone', () => {
  const log = [e(1, 'critical', 'CISA', { kev: true, cves: ['CVE-2026-1111'] }), e(2, 'high'), e(3, 'high', 'The Hacker News', { cves: ['CVE-2026-1111', 'CVE-2026-2222'] }), e(30, 'low'), e(24 * 9, 'medium'), e(24 * 20, 'critical')];
  const s = dashboardStats(log, NOW, 'Asia/Kolkata');
  assert.equal(s.days.length, 14);
  assert.equal(s.days[13].key, '2026-10-18');
  assert.equal(s.days[13].total, 3);
  assert.equal(s.days[13].counts.high, 2);
  assert.equal(s.days[13].kev, 1);
  assert.equal(s.weekTotal, 4);
  assert.equal(s.prevWeekTotal, 1);
  assert.equal(s.kevWeek, 1);
  assert.deepEqual(s.severity, { critical: 1, high: 2, medium: 0, low: 1 });
  assert.equal(s.severityTotal, 4);
  assert.equal(s.topSources[0].name, 'BleepingComputer');
  assert.deepEqual(s.topCves[0], { id: 'CVE-2026-1111', count: 2 });
  const sum = s.days.reduce((n, d) => n + d.total, 0);
  assert.equal(sum, 5, 'the 20-day-old story is outside the 14-day chart');
});

test('chart helpers: nice axis and week-over-week change', () => {
  assert.deepEqual(niceScale(0), { max: 4, ticks: [0, 2, 4] });
  const n = niceScale(37);
  assert.ok(n.max >= 37 && n.ticks[0] === 0 && n.ticks.at(-1) === n.max);
  assert.equal(weekChange(120, 100), 20);
  assert.equal(weekChange(80, 100), -20);
  assert.equal(weekChange(5, 0), null);
});

test('Siva never says Namaste', () => {
  assert.equal(stripNamaste('Namaste boss! Two flaws are exploited.'), 'boss! Two flaws are exploited.');
  assert.equal(stripNamaste('Namaste. Good morning.'), 'Good morning.');
  assert.equal(stripNamaste('Hello, namasteji, all good'), 'Hello, all good');
  assert.match(SYSTEM_RULES, /Never say "Namaste"/);
});

test('when he arrives he greets by time and asks how he can help', () => {
  assert.equal(greetLine(19, 'boss'), 'Good evening, boss. I am Siva. How can I help you today?');
});
