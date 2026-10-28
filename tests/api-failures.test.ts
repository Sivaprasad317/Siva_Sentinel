// Tests for retry behaviour and for AI failures falling back safely.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError, fetchWithRetry, parseRetryAfter } from '../lib/http';
import { parseJsonLoose } from '../lib/gemini';
import { answerQuestion, summarizeBriefing, validateBriefingJson } from '../lib/ai';
import { storyFromRaw } from '../lib/refresh';
import { checkRate, resetRateLimits } from '../lib/rateLimit';
import { validateChatInput, validatePreferences } from '../lib/validate';
import { DEFAULT_PREFERENCES } from '../lib/config';
import type { Briefing } from '../lib/types';

const noSleep = async () => undefined;

function fakeFetch(responses: (number | 'network')[]) {
  let i = 0;
  const calls = { count: 0 };
  const impl = (async () => {
    calls.count++;
    const r = responses[Math.min(i++, responses.length - 1)];
    if (r === 'network') throw new TypeError('fetch failed');
    return new Response(r === 200 ? 'ok' : 'err', { status: r });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

test('retries 503 then succeeds', async () => {
  const { impl, calls } = fakeFetch([503, 503, 200]);
  const res = await fetchWithRetry('https://x.example', { fetchImpl: impl, sleep: noSleep, retries: 2 });
  assert.equal(res.status, 200);
  assert.equal(calls.count, 3);
});

test('does not retry permanent errors like 404', async () => {
  const { impl, calls } = fakeFetch([404, 200]);
  await assert.rejects(fetchWithRetry('https://x.example', { fetchImpl: impl, sleep: noSleep }), (e: unknown) => e instanceof HttpError && e.status === 404);
  assert.equal(calls.count, 1);
});

test('gives up after the retry limit on network errors', async () => {
  const { impl, calls } = fakeFetch(['network']);
  await assert.rejects(fetchWithRetry('https://x.example', { fetchImpl: impl, sleep: noSleep, retries: 2 }), /Network error/);
  assert.equal(calls.count, 3);
});

test('honours Retry-After on 429', async () => {
  const waits: number[] = [];
  let n = 0;
  const impl = (async () => (n++ === 0 ? new Response('', { status: 429, headers: { 'retry-after': '3' } }) : new Response('ok'))) as unknown as typeof fetch;
  await fetchWithRetry('https://x.example', { fetchImpl: impl, sleep: async (ms) => void waits.push(ms) });
  assert.deepEqual(waits, [3000]);
  assert.equal(parseRetryAfter('abc'), null);
});

test('parseJsonLoose handles fenced JSON', () => {
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('Here you go: {"a":2} thanks'), { a: 2 });
  assert.throws(() => parseJsonLoose('no json here'));
});

const stories = [
  storyFromRaw({ title: 'Akira ransomware hits hospital', url: 'https://a.example/1', publishedAt: null, snippet: 'Source text one.', source: 'A', official: false }, '2026-10-17T00:00:00Z'),
  storyFromRaw({ title: 'FortiMail zero-day CVE-2026-104286 exploited', url: 'https://a.example/2', publishedAt: null, snippet: 'Source text two.', source: 'B', official: false }, '2026-10-17T00:00:00Z'),
];

test('validateBriefingJson drops unknown story ids (no invented stories)', () => {
  const out = validateBriefingJson(
    {
      executiveSummary: 'Summary',
      spokenScript: 'Script',
      recommendations: ['Patch FortiMail', 42],
      stories: [
        { id: stories[0].id, summary: 'AI summary', whyItMatters: 'w', whoIsAffected: 'hospitals' },
        { id: 'made-up', summary: 'Invented story' },
      ],
    },
    new Set(stories.map((s) => s.id)),
  );
  assert.equal(out.perStory.size, 1);
  assert.deepEqual(out.recommendations, ['Patch FortiMail']);
  assert.throws(() => validateBriefingJson({ stories: [] }, new Set()));
});

test('summarizeBriefing falls back to source text when Gemini fails', async () => {
  const failing = async () => {
    throw new Error('HTTP 503');
  };
  const out = await summarizeBriefing(stories, failing);
  assert.equal(out.aiStatus, 'failed');
  assert.equal(out.stories[0].summary, 'Source text one.');
  assert.equal(out.stories[0].aiGenerated, false);
  assert.match(out.executiveSummary, /AI summaries are unavailable/);
});

test('summarizeBriefing merges valid Gemini output', async () => {
  const ok = async () => ({
    executiveSummary: 'Exec', spokenScript: 'Speak',
    recommendations: ['Do X'],
    stories: [{ id: stories[1].id, summary: 'AI two', whyItMatters: 'Exploited', whoIsAffected: 'FortiMail users' }],
  });
  const out = await summarizeBriefing(stories, ok);
  assert.equal(out.aiStatus, 'ok');
  assert.equal(out.stories[1].summary, 'AI two');
  assert.equal(out.stories[1].aiGenerated, true);
  assert.equal(out.stories[0].aiGenerated, false);
});

test('answerQuestion only cites stories that exist, and falls back on failure', async () => {
  const briefing = { id: 'b1', stories: stories.map((s) => ({ ...s, summary: s.snippet })) } as unknown as Briefing;
  const good = await answerQuestion('Tell me about FortiMail', briefing, [], async () => ({ answer: 'It is exploited.', citedIds: [stories[1].id, 'fake-id'] }));
  assert.equal(good.citations.length, 1);
  assert.equal(good.citations[0].url, 'https://a.example/2');
  const bad = await answerQuestion('Tell me about FortiMail', briefing, [], async () => {
    throw new Error('HTTP 429');
  });
  assert.equal(bad.aiStatus, 'failed');
  assert.ok(bad.citations.length > 0);
  const empty = await answerQuestion('anything', null, []);
  assert.match(empty.answer, /Run a refresh/);
});

test('rate limiter blocks after the limit', () => {
  resetRateLimits();
  assert.ok(checkRate('k', 2, 1000, 0).ok);
  assert.ok(checkRate('k', 2, 1000, 1).ok);
  assert.equal(checkRate('k', 2, 1000, 2).ok, false);
  assert.ok(checkRate('k', 2, 1000, 1001).ok, 'window resets');
});

test('input validation rejects bad chat and preference input', () => {
  assert.equal(validateChatInput({ message: '' }).ok, false);
  assert.equal(validateChatInput({ message: 'x'.repeat(1001) }).ok, false);
  assert.equal(validateChatInput({ message: 'hi' }).ok, true);
  assert.equal(validatePreferences({ briefingTime: '25:00' }, DEFAULT_PREFERENCES).ok, false);
  assert.equal(validatePreferences({ timezone: 'Mars/Base' }, DEFAULT_PREFERENCES).ok, false);
  assert.equal(validatePreferences({ lookbackDays: 30 }, DEFAULT_PREFERENCES).ok, false);
  const ok = validatePreferences({ briefingTime: '06:45', topics: [' Ransomware ', 'ransomware', 'AWS'] }, DEFAULT_PREFERENCES);
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual(ok.value.topics, ['ransomware', 'aws']);
});

test('geminiJson sends the key in a header (not the URL) and parses the reply', async () => {
  const { geminiJson } = await import('../lib/gemini');
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.GEMINI_MODEL = 'test-model';
  let seenUrl = '';
  let seenKey = '';
  const impl = (async (url: string, init: RequestInit) => {
    seenUrl = url;
    seenKey = (init.headers as Record<string, string>)['x-goog-api-key'];
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }));
  }) as unknown as typeof fetch;
  try {
    assert.deepEqual(await geminiJson({ system: 's', user: 'u' }, impl), { ok: true });
    assert.equal(seenUrl, 'https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent');
    assert.ok(!seenUrl.includes('test-key'));
    assert.equal(seenKey, 'test-key');
    const denied = (async () => new Response('{}', { status: 403 })) as unknown as typeof fetch;
    await assert.rejects(geminiJson({ system: 's', user: 'u' }, denied), /API key/);
  } finally {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
  }
});
