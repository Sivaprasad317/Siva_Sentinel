// Tests for patch 8: live feed log, "who are you", navigation to the feed log.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeFeedLog, matterText, sortKey } from '../lib/feedLog';
import { aboutSiva } from '../lib/about';
import { routeIntent } from '../lib/assistantRouter';
import { storyFromRaw } from '../lib/refresh';
import type { Story } from '../lib/types';

const T0 = '2026-10-18T06:00:00.000Z';
const T1 = '2026-10-18T07:00:00.000Z';

function story(url: string, over: Partial<Story> = {}): Story {
  const s = storyFromRaw({ title: `Title ${url}`, url, publishedAt: T0, snippet: 'A snippet about it.', source: 'Src', official: false }, T0);
  return { ...s, ...over };
}

test('feed log keeps every item, marks only new ones as added, and never loses firstSeenAt', () => {
  const a = story('https://x.example/a');
  const b = story('https://x.example/b');
  const first = mergeFeedLog([], [a, b], T0);
  assert.equal(first.added, 2);
  assert.equal(first.log.length, 2);
  const c = story('https://x.example/c', { publishedAt: '2026-10-18T06:30:00.000Z' });
  const second = mergeFeedLog(first.log, [a, c], T1);
  assert.equal(second.added, 1, 'only c is new');
  assert.equal(second.log.length, 3, 'b stays even though it was not in this pool');
  const aRow = second.log.find((e) => e.url === a.url)!;
  assert.equal(aRow.firstSeenAt, T0, 'first-seen time is kept');
  assert.equal(second.log.find((e) => e.url === c.url)!.firstSeenAt, T1);
  // newest-published first
  assert.equal(second.log[0].url, c.url);
});

test('feed log is capped and prefers Gemini text for "what matters"', () => {
  const many = Array.from({ length: 12 }, (_, i) => story(`https://x.example/${i}`, { publishedAt: `2026-10-18T0${i % 10}:00:00.000Z` }));
  assert.equal(mergeFeedLog([], many, T0, 5).log.length, 5);
  assert.match(matterText({ aiGenerated: true, whyItMatters: 'Patch this now.', summary: 'sum', snippet: 'snip' }), /Patch this now/);
  assert.match(matterText({ aiGenerated: false, whyItMatters: '', summary: '', snippet: 'Only a snippet' }), /Only a snippet/);
  assert.equal(sortKey({ publishedAt: null, firstSeenAt: T1 }), T1);
});

test('"who are you" is understood in several wordings (not treated as an actor lookup)', () => {
  for (const q of ['who are you', 'Who are you?', 'hey siva who are you', 'what are you', 'introduce yourself', 'tell me about yourself', 'what is your name', 'what can you do', 'how capable are you']) {
    assert.equal(routeIntent(q).type, 'about', q);
  }
  assert.equal(routeIntent('who is APT29').type, 'actor');
  assert.equal(routeIntent('help').type, 'help');
});

test('about answer explains what she is and her real capabilities, and states limits honestly', () => {
  const r = aboutSiva({ userTitle: 'boss', feedsOn: 30, geminiOn: true, model: 'gemini-4-argon', webSearch: true, intel: true });
  assert.equal(r.intent, 'about');
  assert.match(r.speech, /Siva/);
  assert.match(r.speech, /30 security sources/);
  assert.match(r.speech, /never change your systems/);
  assert.ok(r.card && r.card.sections.length >= 3);
  assert.ok(r.card!.sections.some((s) => /limits/i.test(s.heading)));
  assert.match(r.card!.summary, /gemini-4-argon/);
  const off = aboutSiva({ userTitle: 'boss', feedsOn: 5, geminiOn: false, model: 'x', webSearch: false, intel: false });
  assert.match(off.card!.summary, /not switched on/);
});

test('voice commands can open the new screens', () => {
  assert.deepEqual(routeIntent('open the live feed log'), { type: 'navigate', view: 'feedlog' });
  assert.deepEqual(routeIntent('show feed log'), { type: 'navigate', view: 'feedlog' });
  assert.deepEqual(routeIntent('open live sources'), { type: 'navigate', view: 'sources' });
});

test('feed-log rows record whether an item is cyber news, so dashboard cards can count the whole log', () => {
  const cyber = story('https://x.example/cyber', { categories: ['ransomware'] });
  const general = story('https://x.example/general', { categories: ['general'] });
  const { log } = mergeFeedLog([], [cyber, general], T0);
  assert.equal(log.find((e) => e.url === cyber.url)!.cyber, true);
  assert.equal(log.find((e) => e.url === general.url)!.cyber, false);
});

test('live refresh can be set as often as every 5 minutes', async () => {
  const { isLiveDue } = await import('../lib/schedule');
  const now = new Date('2026-10-18T12:00:00Z');
  assert.equal(isLiveDue(now, 5, '2026-10-18T11:54:00Z', null), true);
  assert.equal(isLiveDue(now, 5, '2026-10-18T11:57:00Z', null), false);
  assert.equal(isLiveDue(now, 3, '2026-10-18T10:00:00Z', null), false);
});
