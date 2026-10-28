// Patch 20 (final): Home orb landing page, one colour scheme, voice-only use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { threatLevel } from '../lib/sivaBus';
import { detectWake } from '../lib/assistantRouter';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

test('Home is the voice landing page: orb, greeting, date, status, big mic + keyboard', () => {
  const home = src('components/OrbHome.tsx');
  for (const part of ['SivaOrb', 'home-greet', 'home-date', 'home-status', 'oh-mic-btn', 'oh-kbd', 'Listening… just say “Hey Siva”']) assert.ok(home.includes(part), part);
  const dash = src('components/Dashboard.tsx');
  assert.match(dash, /\['home', '◉', 'Siva \(Home\)'\]/);
  assert.match(dash, /\['overview', '◈', 'Dashboard'\]/);
  assert.doesNotMatch(dash, /theme-ember/, 'one colour scheme everywhere');
});

test('one colour scheme: the dashboard uses the Home navy/violet palette', () => {
  const css = src('app/globals.css');
  const last = css.slice(css.indexOf('Patch 20'));
  assert.match(last, /\.hero-text h1 em \{[^}]*#a855f7/);
  assert.match(last, /\.oh-mic-btn \{[^}]*#ec4899, #a855f7/);
  assert.doesNotMatch(src('components/DashboardCharts.tsx'), /#ffb067|#e2742d/, 'no ember chart colours left');
});

test('voice keeps itself alive: watchdog restart and follow-up questions without the wake word', () => {
  const home = src('components/HomeView.tsx');
  assert.match(home, /setInterval\(revive, 4_000\)/);
  assert.match(home, /visibilitychange/);
  assert.match(home, /awaitingUntil\.current = Date\.now\(\) \+ 8_000/);
});

test('"Hey Siva" is recognised in many spoken forms', () => {
  for (const s of ['hey siva', 'hey shiva what is ransomware', 'hi siva', 'okay siva open the dashboard']) assert.equal(detectWake(s).woke, true, s);
  assert.equal(detectWake('the weather is nice').woke, false);
});

test('threat-level helper still sane', () => {
  assert.equal(threatLevel({ critical: 0, kev: 0 }).label, 'Low');
});
