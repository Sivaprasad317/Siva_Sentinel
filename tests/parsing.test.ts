// Tests for source parsing: RSS, Atom, KEV and NVD.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFeed } from '../lib/feedParser';
import { parseKev, parseNvdCvss, recentKev } from '../lib/sources';

const NOW = new Date('2026-10-17T12:00:00Z');
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

test('RSS: extracts items, strips HTML/scripts, removes tracking params', () => {
  const items = parseFeed(fixture('rss.xml'), 'Example News', false, NOW);
  assert.equal(items.length, 3, 'items without a usable http(s) link are skipped');
  const [first, second, third] = items;
  assert.equal(first.title, 'Vendor X patches zero-day exploited in the wild (CVE-2026-11111)');
  assert.equal(first.url, 'https://www.example.org/news/vendor-x-zero-day');
  assert.equal(first.publishedAt, '2026-10-16T09:30:00.000Z');
  assert.ok(!first.snippet.includes('<'), 'no HTML tags in snippet');
  assert.ok(!first.snippet.includes('alert(1)'), 'script content removed');
  assert.equal(second.title, 'Ransomware gang & its "leak site" claims attack');
  assert.equal(second.publishedAt, null, 'invalid date becomes null, not a guess');
  assert.equal(second.snippet, 'The group claims it stole 2 TB.');
  assert.equal(third.publishedAt, null, 'future dates are rejected');
});

test('Atom: uses rel=alternate link and published date', () => {
  const items = parseFeed(fixture('atom.xml'), 'Vendor', true, NOW);
  assert.equal(items.length, 2);
  assert.equal(items[0].url, 'https://advisories.example.com/advisory/1');
  assert.equal(items[0].publishedAt, '2026-10-15T12:00:00.000Z');
  assert.equal(items[0].official, true);
  assert.equal(items[1].url, 'https://advisories.example.com/advisory/2');
  assert.equal(items[1].publishedAt, '2026-10-14T08:00:00.000Z');
  assert.equal(items[1].snippet, 'Details here.');
});

test('RSS: garbage input returns no items instead of throwing', () => {
  assert.deepEqual(parseFeed('<html>not a feed</html>', 'x', false, NOW), []);
  assert.deepEqual(parseFeed('', 'x', false, NOW), []);
});

test('KEV: keeps valid entries, drops malformed ones', () => {
  const entries = parseKev({
    vulnerabilities: [
      { cveID: 'CVE-2026-11111', vendorProject: 'VendorX', product: 'Gateway', vulnerabilityName: 'Auth bypass', dateAdded: '2026-10-15', shortDescription: 'desc', requiredAction: 'Apply updates.', dueDate: '2026-11-05', knownRansomwareCampaignUse: 'Known' },
      { cveID: 'not-a-cve', dateAdded: '2026-10-15' },
      { cveID: 'CVE-2020-1234', dateAdded: 'yesterday' },
      null,
    ],
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].knownRansomwareCampaignUse, 'Known');
  assert.throws(() => parseKev({ nope: true }));
  assert.equal(recentKev(entries, NOW, 7).length, 1);
  assert.equal(recentKev(entries, new Date('2026-12-01T00:00:00Z'), 7).length, 0);
});

test('NVD: prefers v4.0 then v3.1, primary metric, and checks the CVE id', () => {
  const json = {
    vulnerabilities: [
      {
        cve: {
          id: 'CVE-2026-11111',
          metrics: {
            cvssMetricV31: [
              { type: 'Secondary', cvssData: { baseScore: 7.5, baseSeverity: 'HIGH' } },
              { type: 'Primary', cvssData: { baseScore: 9.8, baseSeverity: 'CRITICAL' } },
            ],
          },
        },
      },
    ],
  };
  assert.deepEqual(parseNvdCvss(json, 'CVE-2026-11111'), { cve: 'CVE-2026-11111', score: 9.8, severity: 'CRITICAL', version: '3.1' });
  assert.equal(parseNvdCvss(json, 'CVE-2026-99999'), null, 'mismatched id is rejected');
  assert.equal(parseNvdCvss({ vulnerabilities: [] }, 'CVE-2026-11111'), null);
});
