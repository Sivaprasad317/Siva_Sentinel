// Tests for cleaning and deduplication.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalUrl, dedupeStories, urlKey, extractCves, parseDate, stripHtml } from '../lib/normalize';
import { storyFromRaw } from '../lib/refresh';
import type { RawItem } from '../lib/types';

const raw = (p: Partial<RawItem>): RawItem => ({
  title: 'x', url: 'https://a.example/x', publishedAt: '2026-10-16T00:00:00.000Z', snippet: '', source: 'A', official: false, ...p,
});

test('canonicalUrl drops tracking params, fragments and slashes but keeps the URL openable', () => {
  assert.equal(canonicalUrl('http://WWW.Example.com/a/b/?utm_source=x&id=5#top'), 'http://www.example.com/a/b?id=5');
  assert.equal(canonicalUrl('javascript:alert(1)'), null);
  assert.equal(canonicalUrl('not a url'), null);
});

test('urlKey treats http/https and www/no-www as the same article', () => {
  assert.equal(urlKey('http://www.example.com/a/'), urlKey('https://example.com/a?utm_source=x'));
  assert.notEqual(urlKey('https://example.com/a'), urlKey('https://example.com/b'));
});

test('dedupeStories merges the same article seen over http and https', () => {
  const base = { title: '', source: 'x', snippet: '', cves: [], publishedAt: null };
  const out = dedupeStories([
    { ...base, title: 'Alpha patch released today', url: 'http://www.example.com/a', sources: [{ name: 'A', url: 'http://www.example.com/a', publishedAt: null, official: false }] },
    { ...base, title: 'Totally different headline words', url: 'https://example.com/a', sources: [{ name: 'B', url: 'https://example.com/a', publishedAt: null, official: false }] },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].url, 'http://www.example.com/a');
});

test('parseDate validates timestamps', () => {
  const now = new Date('2026-10-17T00:00:00Z');
  assert.equal(parseDate('2026-10-16T10:00:00+05:30', now), '2026-10-16T04:30:00.000Z');
  assert.equal(parseDate('garbage', now), null);
  assert.equal(parseDate('2030-01-01', now), null);
  assert.equal(parseDate('1999-01-01', now), null);
  assert.equal(parseDate(undefined, now), null);
});

test('extractCves finds unique, upper-cased CVE IDs', () => {
  assert.deepEqual(extractCves('cve-2026-1234 and CVE-2026-1234, CVE-2025-123456'), ['CVE-2026-1234', 'CVE-2025-123456']);
});

test('stripHtml removes tags and decodes entities', () => {
  assert.equal(stripHtml('<p>Hello&nbsp;<b>world</b> &amp; you</p>'), 'Hello world & you');
});

test('dedupe merges the same story from two outlets and keeps both sources', () => {
  const now = '2026-10-17T00:00:00.000Z';
  const stories = [
    storyFromRaw(raw({ title: 'Cisco warns of exploited Secure Email Gateway flaw', url: 'https://a.example/1', source: 'A', publishedAt: '2026-10-15T00:00:00.000Z' }), now),
    storyFromRaw(raw({ title: 'Cisco warns of exploited Secure Email Gateway flaw!', url: 'https://b.example/2', source: 'B', publishedAt: '2026-10-14T00:00:00.000Z' }), now),
    storyFromRaw(raw({ title: 'Totally different ransomware story', url: 'https://c.example/3', source: 'C' }), now),
  ];
  const out = dedupeStories(stories);
  assert.equal(out.length, 2);
  assert.equal(out[0].sources.length, 2);
  assert.equal(out[0].publishedAt, '2026-10-14T00:00:00.000Z', 'earliest publication time kept');
});

test('dedupe merges stories about the same single CVE even with different titles', () => {
  const now = '2026-10-17T00:00:00.000Z';
  const out = dedupeStories([
    storyFromRaw(raw({ title: 'Fortinet fixes FortiMail bug CVE-2026-104286', url: 'https://a.example/f' }), now),
    storyFromRaw(raw({ title: 'Hackers abuse new FortiMail zero-day (CVE-2026-104286)', url: 'https://b.example/f', source: 'B' }), now),
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].cves, ['CVE-2026-104286']);
});

test('dedupe does not merge unrelated stories', () => {
  const now = '2026-10-17T00:00:00.000Z';
  const out = dedupeStories([
    storyFromRaw(raw({ title: 'Microsoft patches Exchange flaw', url: 'https://a.example/1' }), now),
    storyFromRaw(raw({ title: 'Akira ransomware hits hospital', url: 'https://a.example/2' }), now),
  ]);
  assert.equal(out.length, 2);
});
