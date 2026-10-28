// Tests for patch 11: unique source names, feed auto-discovery, Google News credit, reading memory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAllSources } from '../lib/feedResolve';
import { discoverFeedLinks, looksLikeHtml, parseFeed } from '../lib/feedParser';
import { freshness, memoryKeywords, searchMemory, timeWindow } from '../lib/memory';
import { research, type ResearchDeps } from '../lib/research';
import { routeIntent } from '../lib/assistantRouter';
import { AiDisabledError } from '../lib/gemini';
import type { FeedLogEntry } from '../lib/types';

const NOW = new Date('2026-10-18T06:00:00Z');
const hAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

test('every source name is unique (no duplicate SecurityWeek), built-in wins', () => {
  const rows = resolveAllSources({});
  const names = rows.map((r) => r.name.toLowerCase());
  assert.equal(new Set(names).size, names.length);
  assert.equal(rows.filter((r) => r.name === 'SecurityWeek').length, 1);
  assert.equal(rows.find((r) => r.name === 'SecurityWeek')?.origin, 'builtin');
  const mine = resolveAllSources({ sources: [{ id: 'c1', name: 'SecurityWeek', url: 'https://example.com/my.xml', enabled: true, addedAt: NOW.toISOString() }] });
  assert.ok(mine.some((r) => r.name === 'SecurityWeek (yours)' && r.origin === 'custom'));
});

test('Google News feeds are built in and on by default', () => {
  const g = resolveAllSources({}).filter((r) => r.url.includes('news.google.com'));
  assert.equal(g.length, 4);
  assert.ok(g.every((r) => r.enabled && r.kind === 'feed'));
});

test('feed auto-discovery finds the RSS a blog page advertises', () => {
  const html = `<!DOCTYPE html><html><head>
    <link rel="stylesheet" href="/a.css">
    <link rel="alternate" type="application/rss+xml" title="Blog" href="/blog/feed/">
    <link rel="alternate" type="application/rss+xml" title="Comments" href="/comments/feed/">
    <link rel='alternate' type='application/atom+xml' href='https://cdn.example.org/atom.xml'>
  </head><body>hi</body></html>`;
  assert.equal(looksLikeHtml(html), true);
  assert.equal(looksLikeHtml('<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>'), false);
  assert.deepEqual(discoverFeedLinks(html, 'https://www.example.com/research/'), ['https://www.example.com/blog/feed/', 'https://cdn.example.org/atom.xml']);
  assert.deepEqual(discoverFeedLinks('<html><head></head></html>', 'https://x.example/'), []);
});

test('Google News items credit the real publisher and drop the " - Publisher" suffix', () => {
  const xml = `<rss><channel>
  <item><title>Microsoft Fixes 1,118 Vulnerabilities in October Patch Tuesday - CyberSecurityNews</title><link>https://news.google.com/rss/articles/abc?oc=5</link><pubDate>Sat, 18 Oct 2026 03:00:00 GMT</pubDate><description>&lt;a href="x"&gt;Microsoft Fixes 1,118 Vulnerabilities in October Patch Tuesday&lt;/a&gt; CyberSecurityNews</description><source url="https://cybersecuritynews.com">CyberSecurityNews</source></item>
  <item><title>Big breach at retailer - UC Today</title><link>https://news.google.com/rss/articles/def?oc=5</link><pubDate>Sat, 18 Oct 2026 02:00:00 GMT</pubDate></item>
  </channel></rss>`;
  const items = parseFeed(xml, 'Google News: Cybersecurity', false, NOW, true);
  assert.equal(items[0].title, 'Microsoft Fixes 1,118 Vulnerabilities in October Patch Tuesday');
  assert.equal(items[0].source, 'CyberSecurityNews');
  assert.equal(items[1].title, 'Big breach at retailer');
  assert.equal(items[1].source, 'UC Today');
  // Normal feeds keep their own name.
  assert.equal(parseFeed(xml, 'Some Blog', false, NOW, false)[0].source, 'Some Blog');
});

function row(id: string, h: number, title: string, extra: Partial<FeedLogEntry> = {}): FeedLogEntry {
  return { url: `https://n.example/${id}`, title, source: 'Src', publishedAt: hAgo(h), firstSeenAt: hAgo(h), matter: '', priority: 'medium', kev: false, cves: [], ...extra };
}
const LOG: FeedLogEntry[] = [
  row('1', 3, 'Microsoft Fixes 1,118 Vulnerabilities in October Patch Tuesday', { source: 'CyberSecurityNews', priority: 'high' }),
  row('2', 5, 'Microsoft patches record 1413 vulnerabilities, Meta discloses GitHub breach', { source: 'UC Today' }),
  row('3', 30, 'Fortinet FortiWeb flaw CVE-2026-1111 exploited', { kev: true, cves: ['CVE-2026-1111'], priority: 'critical' }),
  row('4', 200, 'Old Microsoft Exchange story'),
  row('5', 4, 'LockBit claims attack on hospital'),
];

test('time windows from plain words', () => {
  assert.equal(timeWindow('what happened today', NOW)?.label, 'the last 24 hours');
  assert.equal(timeWindow('any updates this week?', NOW)?.label, 'the last 7 days');
  assert.equal(timeWindow('latest on lockbit', NOW)?.label, 'the last 3 days');
  assert.equal(timeWindow('in the last 6 hours', NOW)?.label, 'the last 6 hours');
  assert.equal(timeWindow('what is phishing', NOW), null);
  assert.deepEqual(memoryKeywords('Hey Siva, what is the latest on Microsoft patch tuesday?'), ['microsoft', 'patch', 'tuesday']);
});

test('memory search finds what Siva read, newest/most relevant first, within the time asked', () => {
  const r = searchMemory(LOG, 'latest Microsoft patch tuesday news', NOW);
  assert.equal(r.hits[0].entry.url, 'https://n.example/1');
  assert.ok(r.hits.some((h) => h.entry.url === 'https://n.example/2'));
  assert.ok(!r.hits.some((h) => h.entry.url === 'https://n.example/4'), '200-hour-old item is outside "latest"');
  const today = searchMemory(LOG, 'what happened today?', NOW);
  assert.deepEqual(today.hits.map((h) => h.entry.url).sort(), ['https://n.example/1', 'https://n.example/2', 'https://n.example/5'].sort());
  const cve = searchMemory(LOG, 'tell me about CVE-2026-1111', NOW);
  assert.equal(cve.hits[0].entry.url, 'https://n.example/3');
});

test('freshness says how current Siva is and flags 2+ hours as stale', () => {
  assert.equal(freshness(null, NOW).stale, true);
  assert.match(freshness(hAgo(0.5), NOW).label, /30 minutes ago/);
  assert.equal(freshness(hAgo(1.5), NOW).stale, false);
  const old = freshness(hAgo(3), NOW);
  assert.equal(old.stale, true);
  assert.match(old.label, /3 hours ago/);
});

function deps(over: Partial<ResearchDeps> = {}): ResearchDeps {
  return {
    getIntel: async () => null,
    getKevMap: async () => new Map(),
    fetchNvdDetails: async () => null,
    wikipediaSummary: async () => null,
    threatFoxLookup: async () => null,
    geminiGrounded: async () => { throw new AiDisabledError(); },
    geminiJson: async () => { throw new AiDisabledError(); },
    memory: async () => ({ log: LOG, lastRunAt: new Date(Date.now() - 30 * 60_000).toISOString(), timezone: 'Asia/Kolkata' }),
    ...over,
  };
}

test('answers include what Siva read herself (with dates) and tell Gemini to use it first', async () => {
  // Make the log "recent" relative to the real clock used by research().
  const shift = Date.now() - NOW.getTime();
  const live = LOG.map((e) => ({ ...e, publishedAt: new Date(Date.parse(e.publishedAt!) + shift).toISOString(), firstSeenAt: new Date(Date.parse(e.firstSeenAt) + shift).toISOString() }));
  let prompt = '';
  const steps: string[] = [];
  const r = await research('What is the latest on Microsoft Patch Tuesday?', routeIntent('What is the latest on Microsoft Patch Tuesday?'), null, [], (s) => steps.push(s), deps({
    memory: async () => ({ log: live, lastRunAt: new Date(Date.now() - 30 * 60_000).toISOString(), timezone: 'Asia/Kolkata' }),
    geminiGrounded: async (req) => {
      prompt = req.user;
      return { text: 'TITLE: Patch Tuesday\nSUMMARY: Microsoft fixed many bugs.', sources: [], queries: [] } as never;
    },
  }));
  assert.ok(steps.some((s) => /Searching my reading memory \(5 items · I last read my sources 30 minutes ago\)/.test(s)));
  assert.match(prompt, /recentNews/);
  assert.match(prompt, /1,118 Vulnerabilities/);
  const sec = r.card!.sections.find((s) => s.heading.startsWith('From my reading'))!;
  assert.match(sec.heading, /the last 3 days/);
  assert.match(sec.bullets[0], /Microsoft Fixes 1,118 Vulnerabilities .* — CyberSecurityNews/);
});

test('stale reading triggers a background re-read and says so', async () => {
  let started = 0;
  const r = await research('latest ransomware news', routeIntent('latest ransomware news'), null, [], undefined, deps({
    memory: async () => ({ log: [], lastRunAt: new Date(Date.now() - 3 * 3_600_000).toISOString(), timezone: 'Asia/Kolkata' }),
    refreshIfStale: () => (started++, true),
  }));
  assert.equal(started, 1);
  assert.match(r.card?.note ?? '', /started reading all my sources again/);
  const fresh = await research('latest ransomware news', routeIntent('latest ransomware news'), null, [], undefined, deps({ refreshIfStale: () => (started++, true) }));
  assert.equal(started, 1, 'fresh reading does not re-read');
  assert.doesNotMatch(fresh.card?.note ?? '', /started reading/);
});
