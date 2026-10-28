// Tests for timezone scheduling (Asia/Kolkata is UTC+05:30, no daylight saving).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDue, nextRunLabel, zonedParts } from '../lib/schedule';
import { isBriefingIntent, stripWakePhrase } from '../lib/intent';

const prefs = { scheduleEnabled: true, briefingTime: '07:30', timezone: 'Asia/Kolkata' };

test('zonedParts converts UTC to IST', () => {
  assert.deepEqual(zonedParts(new Date('2026-10-17T02:00:00Z'), 'Asia/Kolkata'), { dateKey: '2026-10-17', hhmm: '07:30' });
  // 20:00 UTC is already the next day in India
  assert.deepEqual(zonedParts(new Date('2026-10-17T20:00:00Z'), 'Asia/Kolkata'), { dateKey: '2026-10-18', hhmm: '01:30' });
});

test('isDue fires at 07:30 IST, not before, and only once per day', () => {
  assert.equal(isDue(new Date('2026-10-17T01:59:00Z'), prefs, undefined), false, '07:29 IST: not yet');
  assert.equal(isDue(new Date('2026-10-17T02:00:00Z'), prefs, undefined), true, '07:30 IST: due');
  assert.equal(isDue(new Date('2026-10-17T02:00:00Z'), prefs, '2026-10-17'), false, 'already ran today');
  assert.equal(isDue(new Date('2026-10-17T10:00:00Z'), prefs, '2026-10-16'), true, 'catch-up later the same day');
  assert.equal(isDue(new Date('2026-10-17T20:00:00Z'), prefs, '2026-10-17'), false, '01:30 IST next day: before 07:30');
});

test('isDue respects disabled schedules and invalid settings', () => {
  assert.equal(isDue(new Date('2026-10-17T05:00:00Z'), { ...prefs, scheduleEnabled: false }, undefined), false);
  assert.equal(isDue(new Date('2026-10-17T05:00:00Z'), { ...prefs, timezone: 'Not/AZone' }, undefined), false);
  assert.equal(isDue(new Date('2026-10-17T05:00:00Z'), { ...prefs, briefingTime: '7:30' }, undefined), false);
});

test('isDue works for other timezones', () => {
  const ny = { scheduleEnabled: true, briefingTime: '08:00', timezone: 'America/New_York' };
  // 2026-10-17 12:00 UTC = 08:00 EDT
  assert.equal(isDue(new Date('2026-10-17T12:00:00Z'), ny, undefined), true);
  assert.equal(isDue(new Date('2026-10-17T11:59:00Z'), ny, undefined), false);
});

test('nextRunLabel describes the next run', () => {
  assert.equal(nextRunLabel(new Date('2026-10-17T01:00:00Z'), prefs, undefined), 'Today 07:30 (Asia/Kolkata)');
  assert.equal(nextRunLabel(new Date('2026-10-17T03:00:00Z'), prefs, '2026-10-17'), 'Tomorrow 07:30 (Asia/Kolkata)');
  assert.equal(nextRunLabel(new Date('2026-10-17T03:00:00Z'), { ...prefs, scheduleEnabled: false }, undefined), null);
});

test('voice intent: briefing requests vs specific questions', () => {
  assert.equal(isBriefingIntent(stripWakePhrase("Hey Siva, what's the updates today?")), true);
  assert.equal(isBriefingIntent('Brief me'), true);
  assert.equal(isBriefingIntent('Is CVE-2026-104286 patched yet? any updates'), false);
  assert.equal(isBriefingIntent('Which ransomware groups target hospitals?'), false);
  assert.equal(stripWakePhrase('Hey Siva, tell me about Akira'), 'tell me about Akira');
});
