// Tests for patch 7: feed resolution, feed-kind detection, source validation, and critical alerts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedKind, resolveAllSources, resolveFeeds, validateCustomSource, feedPrefKey } from '../lib/feedResolve';
import { diffNewAlerts, isAlertable } from '../lib/alerts';
import { FEED_SEEDS } from '../lib/feedSeeds';
import { storyFromRaw } from '../lib/refresh';
import type { Story } from '../lib/types';

const NOW = new Date('2026-10-18T12:00:00Z');

test('feedKind detects real feeds vs plain pages', () => {
  assert.equal(feedKind('https://example.com/feed/'), 'feed');
  assert.equal(feedKind('https://example.com/rss.xml'), 'feed');
  assert.equal(feedKind('https://example.com/blog/rss/'), 'feed');
  assert.equal(feedKind('https://feeds.feedburner.com/TheHackersNews'), 'feed');
  assert.equal(feedKind('https://www.crowdstrike.com/blog/'), 'page');
  assert.equal(feedKind('https://thehackernews.com/'), 'page');
  assert.equal(feedKind('https://blog.google/threat-analysis-group/rss/'), 'feed');
});

test('seed list is sane and has a default-on subset', () => {
  assert.ok(FEED_SEEDS.length > 100, 'all the user feeds are stored');
  const on = FEED_SEEDS.filter((s) => s.defaultOn).length;
  assert.ok(on >= 20 && on < FEED_SEEDS.length, 'a curated subset is on by default, not all');
  for (const s of FEED_SEEDS) assert.match(s.url, /^https?:\/\//, `${s.name} has a URL`);
});

test('resolveFeeds merges built-in + seeds + custom, applies prefs, and de-dupes', () => {
  const base = resolveFeeds({});
  assert.ok(base.length >= 20, 'built-ins + default-on seeds');
  // A seed off by default is excluded until enabled.
  const offSeed = FEED_SEEDS.find((s) => !s.defaultOn)!;
  assert.ok(!base.some((f) => f.url === offSeed.url));
  // Enabling an off-by-default seed via its canonical pref key brings it in.
  const enabled = resolveFeeds({ feedPrefs: { [feedPrefKey(offSeed.url)]: true } });
  assert.ok(enabled.some((f) => f.url === offSeed.url));
  // A built-in disabled via pref is removed.
  const anyBuiltin = resolveAllSources({}).find((r) => r.origin === 'builtin')!;
  const disabled = resolveFeeds({ feedPrefs: { [feedPrefKey(anyBuiltin.url)]: false } });
  assert.ok(!disabled.some((f) => f.url === anyBuiltin.url));
  // Custom feed added and enabled appears once.
  const custom = resolveFeeds({ sources: [{ id: '1', name: 'My Feed', url: 'https://my.example/feed/', enabled: true, addedAt: NOW.toISOString() }] });
  assert.equal(custom.filter((f) => f.url === 'https://my.example/feed').length + custom.filter((f) => f.url === 'https://my.example/feed/').length, 1);
});

test('resolveAllSources marks enabled state and origin for the panel', () => {
  const rows = resolveAllSources({ sources: [{ id: 'x', name: 'Mine', url: 'https://mine.example/rss', enabled: false, addedAt: NOW.toISOString() }] });
  const mine = rows.find((r) => r.id === 'x');
  assert.equal(mine?.origin, 'custom');
  assert.equal(mine?.enabled, false);
  assert.ok(rows.some((r) => r.origin === 'builtin' && r.category === 'core'));
  assert.ok(rows.some((r) => r.origin === 'seed'));
});

test('custom source validation', () => {
  assert.equal(validateCustomSource('', 'https://x.example/feed').ok, false);
  assert.equal(validateCustomSource('A'.repeat(90), 'https://x.example/feed').ok, false);
  assert.equal(validateCustomSource('OK', 'ftp://x.example/feed').ok, false);
  assert.equal(validateCustomSource('OK', 'not a url').ok, false);
  const ok = validateCustomSource('  My Blog ', 'https://x.example/feed/');
  assert.ok(ok.ok);
  if (ok.ok) assert.equal(ok.name, 'My Blog');
});

function story(p: Partial<Story> & Pick<Story, 'priority'>): Story {
  const s = storyFromRaw({ title: p.title ?? 'T', url: p.url ?? 'https://n.example/' + Math.random(), publishedAt: NOW.toISOString(), snippet: '', source: p.source ?? 'Src', official: false }, NOW.toISOString());
  return { ...s, ...p };
}

test('isAlertable: exploited or critical only', () => {
  assert.equal(isAlertable(story({ priority: 'critical' })), true);
  assert.equal(isAlertable(story({ priority: 'low', kev: { cveID: 'CVE-2026-1', vendorProject: 'V', product: 'P', vulnerabilityName: 'n', dateAdded: '2026-10-18', shortDescription: 'd', requiredAction: 'a', dueDate: '2026-10-20', knownRansomwareCampaignUse: 'Unknown' } })), true);
  assert.equal(isAlertable(story({ priority: 'high' })), false);
  assert.equal(isAlertable(story({ priority: 'medium' })), false);
});

test('diffNewAlerts raises only new critical items and remembers them', () => {
  const s1 = story({ priority: 'critical', url: 'https://n.example/a', title: 'Critical one', cves: ['CVE-2026-9'] });
  const s2 = story({ priority: 'low', url: 'https://n.example/b' });
  const first = diffNewAlerts([s1, s2], [], NOW);
  assert.equal(first.alerts.length, 1);
  assert.equal(first.alerts[0].url, 'https://n.example/a');
  assert.equal(first.alerts[0].cve, 'CVE-2026-9');
  assert.ok(first.alertedUrls.includes('https://n.example/a'));
  // Same story next time -> no new alert.
  const second = diffNewAlerts([s1], first.alertedUrls, NOW);
  assert.equal(second.alerts.length, 0);
  // A brand-new critical does alert.
  const s3 = story({ priority: 'critical', url: 'https://n.example/c' });
  const third = diffNewAlerts([s1, s3], first.alertedUrls, NOW);
  assert.equal(third.alerts.length, 1);
  assert.equal(third.alerts[0].url, 'https://n.example/c');
});

test('diffNewAlerts caps the alerted-url history', () => {
  const many = Array.from({ length: 10 }, (_, i) => `https://n.example/${i}`);
  const r = diffNewAlerts([], many, NOW, 5);
  assert.equal(r.alertedUrls.length, 5);
});
