// Patch 14: Indian man's voice, 3D presenter motion, greetings and downloadable reports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickVoice, pitchFor, voiceGender } from '../lib/voice';
import { greetingFor, greetLine, poseFor, walkAt, WALK, WALK_SECONDS, approach, hourIn } from '../lib/avatarMotion';
import { answerReportHtml, reportFileName } from '../lib/answerReport';
import { validatePreferences } from '../lib/validate';
import { DEFAULT_PREFERENCES } from '../lib/config';
import { SYSTEM_RULES } from '../lib/ai';

const VOICES = [
  { name: 'Microsoft David - English (United States)', lang: 'en-US' },
  { name: 'Microsoft Heera - English (India)', lang: 'en-IN' },
  { name: 'Microsoft Ravi - English (India)', lang: 'en-IN' },
  { name: 'Google UK English Female', lang: 'en-GB' },
  { name: 'Google UK English Male', lang: 'en-GB' },
];

test('default voice is an Indian man: Prabhat (Edge) > Ravi (Windows)', () => {
  assert.equal(pickVoice(VOICES, '', 'en-IN')?.name, 'Microsoft Ravi - English (India)');
  const edge = [...VOICES, { name: 'Microsoft Prabhat Online (Natural) - English (India)', lang: 'en-IN' }, { name: 'Microsoft Neerja Online (Natural) - English (India)', lang: 'en-IN' }];
  assert.equal(pickVoice(edge, '', 'en-IN')?.name, 'Microsoft Prabhat Online (Natural) - English (India)');
  const mac = [{ name: 'Veena', lang: 'en-IN' }, { name: 'Rishi', lang: 'en-IN' }];
  assert.equal(pickVoice(mac, '', 'en-IN')?.name, 'Rishi');
});

test('an old saved female voice does not override the man voice; a saved male one does', () => {
  assert.equal(pickVoice(VOICES, 'Microsoft Heera - English (India)', 'en-IN')?.name, 'Microsoft Ravi - English (India)');
  assert.equal(pickVoice(VOICES, 'Google UK English Male', 'en-IN')?.name, 'Google UK English Male');
  assert.equal(pickVoice(VOICES, 'Microsoft Heera - English (India)', 'en-IN', 'female')?.name, 'Microsoft Heera - English (India)');
});

test('no male voice installed: fall back to a non-female English voice, else lower the pitch', () => {
  const onlyFemale = [{ name: 'Microsoft Heera - English (India)', lang: 'en-IN' }, { name: 'Google UK English Female', lang: 'en-GB' }];
  assert.ok(pickVoice(onlyFemale, '', 'en-IN'));
  assert.equal(pitchFor('Microsoft Heera - English (India)', 1.1, 'male'), 0.72);
  assert.equal(pitchFor('Microsoft Ravi - English (India)', 1.1, 'male'), 1);
  assert.equal(pitchFor('Microsoft Heera - English (India)', 1.1, 'female'), 1.1);
});

test('voice gender is read from the name', () => {
  assert.equal(voiceGender('Google UK English Female'), 'female');
  assert.equal(voiceGender('Google UK English Male'), 'male');
  assert.equal(voiceGender('Microsoft Prabhat Online (Natural) - English (India)'), 'male');
  assert.equal(voiceGender('Microsoft Neerja Online (Natural) - English (India)'), 'female');
  assert.equal(voiceGender('Some Voice'), 'unknown');
});

test('voiceGender preference validates', () => {
  assert.equal(validatePreferences({ voiceGender: 'male' }, DEFAULT_PREFERENCES).ok, true);
  assert.equal(validatePreferences({ voiceGender: 'female' }, DEFAULT_PREFERENCES).ok, true);
  assert.equal(validatePreferences({ voiceGender: 'robot' }, DEFAULT_PREFERENCES).ok, false);
  assert.equal(DEFAULT_PREFERENCES.voiceGender, 'male');
});

test('persona is a young Indian man with light, clear Indian-English flavour', () => {
  assert.match(SYSTEM_RULES, /young Indian man/);
  assert.match(SYSTEM_RULES, /sparingly/);
  assert.doesNotMatch(SYSTEM_RULES, /woman/);
});

test('walk-in: starts in the fog, slows down, stops exactly in the spotlight', () => {
  const start = walkAt(0);
  assert.equal(start.z, WALK.startZ);
  const mid = walkAt(3);
  assert.ok(mid.z > WALK.startZ && mid.z < WALK.endZ);
  assert.equal(mid.speed, WALK.speed);
  const slowing = walkAt(WALK_SECONDS - 1);
  assert.ok(slowing.speed < WALK.speed && slowing.speed > 0, 'slows down near the end');
  const end = walkAt(WALK_SECONDS + 0.01);
  assert.equal(end.done, true);
  assert.ok(Math.abs(end.z - WALK.endZ) < 1e-6);
  assert.equal(end.speed, 0);
  let prev = -Infinity;
  for (let t = 0; t <= WALK_SECONDS + 1; t += 0.1) {
    const z = walkAt(t).z;
    assert.ok(z >= prev - 1e-9, 'never walks backwards');
    prev = z;
  }
  assert.ok(WALK_SECONDS > 6 && WALK_SECONDS < 12, 'a cinematic but not boring walk');
});

test('greeting follows the time of day', () => {
  assert.equal(greetingFor(7), 'Good morning');
  assert.equal(greetingFor(13), 'Good afternoon');
  assert.equal(greetingFor(19), 'Good evening');
  assert.equal(greetLine(8, 'boss'), 'Good morning, boss. I am Siva. How can I help you today?');
  const h = hourIn('Asia/Kolkata', new Date('2026-10-18T02:00:00Z')); // 07:30 IST
  assert.equal(h, 7);
});

test('body language: walking swings arms against legs; speaking opens the mouth; listening tilts the head', () => {
  const base = { t: 1, wordPulse: 0, wave: 0, ack: 0, look: { x: 0, y: 0 } };
  const walk = poseFor({ ...base, state: 'idle', gait: { phase: Math.PI / 2, amp: 1 } });
  assert.ok(walk.lHipX < 0 && walk.rHipX > 0, 'left leg forward, right leg back');
  assert.ok(walk.lShX > 0 && walk.rShX < 0, 'left arm back, right arm forward');
  const stand = poseFor({ ...base, state: 'idle', gait: { phase: 0, amp: 0 } });
  assert.equal(stand.mouth, 0);
  const talk = poseFor({ ...base, state: 'speaking', gait: { phase: 0, amp: 0 }, wordPulse: 1 });
  assert.ok(talk.mouth > 0.8);
  assert.ok(talk.lElX < -0.6 && talk.rElX < -0.6, 'talks with his hands');
  const listen = poseFor({ ...base, state: 'listening', gait: { phase: 0, amp: 0 } });
  assert.ok(listen.headZ > 0.1 && listen.brow > 0.5);
  const wave = poseFor({ ...base, state: 'idle', gait: { phase: 0, amp: 0 }, wave: 1 });
  assert.ok(wave.rShZ < -2, 'right arm raised to wave');
  assert.ok(Math.abs(approach(0, 1, 10, 1) - 1) < 1e-3);
});

test('report download: escaped HTML with every answer, question, sources and actions', () => {
  const html = answerReportHtml(
    [
      { question: 'What is <script>alert(1)</script>?', askedAt: '2026-10-18T05:00:00Z', card: { title: 'XSS', summary: 'A web flaw', sections: [{ heading: 'Key points', bullets: ['Escapes & encodes'] }], actions: ['Patch now'], sources: [{ title: 'OWASP', url: 'https://owasp.org/x' }, { title: 'Bad', url: 'javascript:alert(1)' }] } },
    ],
    { tz: 'Asia/Kolkata', now: new Date('2026-10-18T06:00:00Z'), userTitle: 'boss' },
  );
  assert.match(html, /^<!doctype html>/);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('Escapes &amp; encodes'));
  assert.ok(html.includes('href="https://owasp.org/x"'));
  assert.ok(!html.includes('javascript:alert'), 'unsafe links are neutralised');
  assert.ok(html.includes('What to do') && html.includes('Patch now'));
  assert.equal(reportFileName(new Date('2026-10-18T06:00:00Z')), 'siva-report-2026-10-18.html');
  assert.equal(reportFileName(new Date('2026-10-18T06:00:00Z'), 'What is LockBit?'), 'siva-report-2026-10-18-what-is-lockbit.html');
});
