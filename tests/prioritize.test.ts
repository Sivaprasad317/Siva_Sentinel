// Tests for ranking: exploitation evidence must beat raw CVSS severity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorize, scoreStory } from '../lib/prioritize';
import { linkKev, storyFromRaw } from '../lib/refresh';
import type { KevInfo, Story } from '../lib/types';

const NOW = new Date('2026-10-17T12:00:00Z');
const prefs = { topics: ['india'] };

const kev: KevInfo = {
  cveID: 'CVE-2026-11111', vendorProject: 'VendorX', product: 'Gateway', vulnerabilityName: 'Auth bypass',
  dateAdded: '2026-10-16', shortDescription: 'Auth bypass.', requiredAction: 'Apply mitigations per vendor instructions.',
  dueDate: '2026-10-20', knownRansomwareCampaignUse: 'Known',
};

function story(p: Partial<Story>): Story {
  const s = storyFromRaw(
    { title: p.title ?? 'Some story', url: p.url ?? 'https://x.example/1', publishedAt: '2026-10-17T06:00:00.000Z', snippet: p.snippet ?? '', source: 'X', official: false },
    NOW.toISOString(),
  );
  return { ...s, ...p };
}

test('categorize detects key categories', () => {
  assert.ok(categorize('Akira ransomware leak site').includes('ransomware'));
  assert.ok(categorize('zero-day exploited in the wild').includes('exploited'));
  assert.ok(categorize('Lazarus APT backdoor').includes('threat-actor'));
  assert.deepEqual(categorize('quarterly earnings call'), ['general']);
});

test('a KEV-listed CVSS 7.5 bug outranks a non-exploited CVSS 9.8 bug', () => {
  const exploited = story({ title: 'VendorX Gateway flaw', kev, cves: ['CVE-2026-11111'], cvss: { cve: 'CVE-2026-11111', score: 7.5, severity: 'HIGH', version: '3.1' } });
  const severe = story({ title: 'VendorY patches bug', url: 'https://x.example/2', cves: ['CVE-2026-22222'], categories: ['vulnerability'], cvss: { cve: 'CVE-2026-22222', score: 9.8, severity: 'CRITICAL', version: '3.1' } });
  const a = scoreStory(exploited, prefs, NOW);
  const b = scoreStory(severe, prefs, NOW);
  assert.ok(a.score > b.score, `${a.score} should be > ${b.score}`);
  assert.equal(a.priority, 'critical');
  assert.notEqual(b.priority, 'critical', 'high CVSS alone is never critical');
  assert.equal(a.confidence, 'confirmed');
  assert.ok(a.reasons.some((r) => r.includes('CISA KEV')));
  assert.ok(a.reasons.some((r) => r.includes('ransomware')));
});

test('news-only exploitation claims are flagged for verification', () => {
  const s = story({ title: 'Hackers exploit zero-day in widget', categories: ['exploited', 'vulnerability'] });
  const r = scoreStory(s, prefs, NOW);
  assert.equal(r.confidence, 'single-source');
  assert.ok(r.verification.some((v) => v.includes('vendor advisory')));
});

test('ransomware leak-site claims are labelled as claims', () => {
  const s = story({ title: 'Gang claims attack on retailer', snippet: 'The ransomware group claims it stole data.', categories: ['ransomware', 'breach'] });
  const r = scoreStory(s, prefs, NOW);
  assert.ok(r.verification.some((v) => v.includes('claim')));
});

test('topic preferences and missing dates affect ranking', () => {
  const withTopic = scoreStory(story({ title: 'Attack on India bank', categories: ['breach'] }), prefs, NOW);
  const without = scoreStory(story({ title: 'Attack on bank', categories: ['breach'] }), prefs, NOW);
  assert.equal(withTopic.score - without.score, 10);
  const noDate = scoreStory(story({ title: 'Attack on bank', categories: ['breach'], publishedAt: null }), prefs, NOW);
  assert.ok(noDate.verification.some((v) => v.includes('Publication time')));
});

test('linkKev attaches KEV to news and adds KEV-only stories for uncovered CVEs', () => {
  const kev2: KevInfo = { ...kev, cveID: 'CVE-2026-33333', product: 'Router' };
  const news = story({ title: 'VendorX bug exploited', cves: ['CVE-2026-11111'], categories: ['vulnerability'] });
  const out = linkKev([news], [kev, kev2], new Map([[kev.cveID, kev], [kev2.cveID, kev2]]), NOW.toISOString());
  assert.equal(out.length, 2);
  assert.equal(out[0].kev?.cveID, 'CVE-2026-11111');
  assert.ok(out[0].categories.includes('exploited'));
  assert.equal(out[1].id, 'kev-cve-2026-33333');
  assert.ok(out[1].sources.some((s) => s.name === 'CISA KEV catalog'));
});
