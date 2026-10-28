// Tests for patch 3: report escaping, history delete, voice choice, live mode, first-seen tracking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildReportHtml, esc, safeUrl } from '../lib/report';
import { pickVoice } from '../lib/voice';
import { isLiveDue, minutesToNextLive } from '../lib/schedule';
import { validatePreferences } from '../lib/validate';
import { DEFAULT_PREFERENCES } from '../lib/config';
import { storyFromRaw } from '../lib/refresh';
import type { Briefing } from '../lib/types';

const NOW = new Date('2026-10-17T12:00:00Z');

test('report escapes untrusted text and drops non-http links', () => {
  assert.equal(esc('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('https://a.example/x'), 'https://a.example/x');
  const s = storyFromRaw({ title: '<img src=x onerror=alert(1)> Evil title', url: 'https://news.example.org/a', publishedAt: null, snippet: 's', source: 'Src', official: false }, NOW.toISOString());
  const b = {
    id: 'b1', createdAt: NOW.toISOString(), trigger: 'manual',
    stories: [{ ...s, summary: 'Summary </p><script>bad()</script>', verification: ['v'], sources: [...s.sources, { name: 'bad', url: 'javascript:alert(2)', publishedAt: null, official: false }] }],
    executiveSummary: 'Exec <b>bold</b>', spokenScript: '', recommendations: ['Patch <now>'], aiStatus: 'ok', sourceStatus: [{ name: 'Feed', kind: 'rss', ok: true, items: 1, fetchedAt: NOW.toISOString() }],
  } as Briefing;
  const html = buildReportHtml(b);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(!html.includes('<img src=x'), 'title escaped');
  assert.ok(!html.includes('<script>bad()'), 'summary escaped');
  assert.ok(!html.includes('href="javascript:'), 'javascript: links removed');
  assert.match(html, /Exec &lt;b&gt;bold&lt;\/b&gt;/);
  assert.match(html, /SIVA SENTINEL/);
  assert.ok(!html.includes('window.print()},400'), 'no auto print by default');
  assert.match(buildReportHtml(b, { autoPrint: true }), /window\.print\(\)\},400/);
});

test('voice picker (woman mode) prefers a female Indian-English voice', () => {
  const voices = [
    { name: 'Microsoft David - English (United States)', lang: 'en-US' },
    { name: 'Microsoft Ravi - English (India)', lang: 'en-IN' },
    { name: 'Microsoft Heera - English (India)', lang: 'en-IN' },
    { name: 'Google UK English Female', lang: 'en-GB' },
  ];
  assert.equal(pickVoice(voices, '', 'en-IN', 'female')?.name, 'Microsoft Heera - English (India)');
  const edge = [...voices, { name: 'Microsoft Neerja Online (Natural) - English (India)', lang: 'en-IN' }];
  assert.equal(pickVoice(edge, '', 'en-IN', 'female')?.name, 'Microsoft Neerja Online (Natural) - English (India)');
  assert.equal(pickVoice(voices, 'Google UK English Female', 'en-IN', 'female')?.name, 'Google UK English Female', 'saved choice wins');
  assert.equal(pickVoice([voices[0], voices[1], voices[3]], '', 'en-IN', 'female')?.name, 'Google UK English Female', 'female fallback, not Ravi');
  assert.equal(pickVoice([], '', 'en-IN'), null);
});

test('live mode timing', () => {
  const last = '2026-10-17T11:00:00Z';
  assert.equal(isLiveDue(NOW, 60, last, null), true);
  assert.equal(isLiveDue(NOW, 90, last, null), false);
  assert.equal(isLiveDue(NOW, 0, last, null), false, 'off');
  assert.equal(isLiveDue(NOW, 60, null, null), false, 'never ran: wait');
  assert.equal(isLiveDue(NOW, 60, last, '2026-10-17T11:30:00Z'), false, 'recent failed attempt also counts');
  assert.equal(minutesToNextLive(NOW, 90, last), 30);
  assert.equal(minutesToNextLive(NOW, 0, last), null);
});

test('new preferences are validated', () => {
  assert.equal(validatePreferences({ liveRefreshMinutes: 4 }, DEFAULT_PREFERENCES).ok, false);
  assert.equal(validatePreferences({ liveRefreshMinutes: 0 }, DEFAULT_PREFERENCES).ok, true);
  assert.equal(validatePreferences({ liveRefreshMinutes: 60, voicePitch: 1.2, voiceName: 'Microsoft Heera - English (India)' }, DEFAULT_PREFERENCES).ok, true);
  assert.equal(validatePreferences({ voicePitch: 3 }, DEFAULT_PREFERENCES).ok, false);
  assert.equal(validatePreferences({ voiceName: 'x'.repeat(200) }, DEFAULT_PREFERENCES).ok, false);
});

test('history DELETE removes one or all briefings; live refreshes replace the same-day snapshot and keep first-seen times', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'siva-p3-'));
  process.env.DATA_DIR = dir;
  process.env.NVD_MAX_LOOKUPS = '0';
  process.env.GEMINI_API_KEY = '';
  process.env.ENABLE_THREAT_INTEL = '0';
  process.env.ARTICLE_READ_LIMIT = '0';
  const today = new Date().toISOString().slice(0, 10);
  const kev = { vulnerabilities: [{ cveID: 'CVE-2026-77777', vendorProject: 'V', product: 'P', vulnerabilityName: 'n', dateAdded: today, shortDescription: 'd', requiredAction: 'a', dueDate: today, knownRansomwareCampaignUse: 'Unknown' }] };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => (String(url).includes('known_exploited') ? new Response(JSON.stringify(kev)) : new Response('nope', { status: 404 }))) as typeof fetch;
  try {
    const { runRefresh } = await import('../lib/refresh');
    const { readStore } = await import('../lib/store');
    const first = await runRefresh('live');
    const seen = first.stories[0].firstSeenAt;
    assert.ok(seen);
    await new Promise((r) => setTimeout(r, 20));
    const second = await runRefresh('live');
    let store = await readStore();
    assert.equal(store.briefings.length, 1, 'same-day live snapshot replaced');
    assert.equal(store.briefings[0].id, second.id);
    assert.equal(second.stories[0].firstSeenAt, seen, 'first-seen time carried over');
    await runRefresh('manual');
    store = await readStore();
    assert.equal(store.briefings.length, 2);

    const { DELETE } = await import('../app/api/history/route');
    const bad = await DELETE(new Request('http://127.0.0.1/api/history?id=../../etc', { method: 'DELETE' }));
    assert.equal(bad.status, 400);
    const one = await DELETE(new Request(`http://127.0.0.1/api/history?id=${second.id}`, { method: 'DELETE' }));
    assert.equal(one.status, 200);
    assert.equal((await readStore()).briefings.length, 1);
    const missing = await DELETE(new Request(`http://127.0.0.1/api/history?id=${second.id}`, { method: 'DELETE' }));
    assert.equal(missing.status, 404);
    const all = await DELETE(new Request('http://127.0.0.1/api/history?all=1', { method: 'DELETE' }));
    assert.equal(all.status, 200);
    assert.equal((await readStore()).briefings.length, 0);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.ENABLE_THREAT_INTEL;
    delete process.env.ARTICLE_READ_LIMIT;
    rmSync(dir, { recursive: true, force: true });
  }
});
