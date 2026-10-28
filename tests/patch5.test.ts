// Tests for patch 5: fuzzy matching, the security glossary, fuzzy wake word, fuzzy intel lookup,
// glossary-aware research, and the wakeOnLoad preference.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestFuzzyMatch, editDistance, normalizeWord, similarity, soundsLike } from '../lib/fuzzy';
import { findTermsInText, glossaryPrimer, GLOSSARY, lookupTerm } from '../lib/glossary';
import { detectWake, routeIntent } from '../lib/assistantRouter';
import { buildMatchers, lookupIntel, parseAttackStix, parseMalpediaCluster, type IntelIndex } from '../lib/intel';
import { research, type ResearchDeps } from '../lib/research';
import { validatePreferences } from '../lib/validate';
import { DEFAULT_PREFERENCES } from '../lib/config';
import { AiDisabledError } from '../lib/gemini';

const NOW = new Date('2026-10-17T12:00:00Z');

test('edit distance and similarity', () => {
  assert.equal(editDistance('siva', 'shiva'), 1);
  assert.equal(editDistance('lockbit', 'lockbyte'), 2);
  assert.equal(editDistance('abc', 'abc'), 0);
  assert.ok(similarity('ransomware', 'ransomwear') >= 0.8);
  assert.equal(normalizeWord('APT-29!'), 'apt29');
});

test('soundsLike matches mispronounced wake names but not random words', () => {
  for (const w of ['siva', 'shiva', 'saiva', 'sheeva', 'civa', 'seeva', 'jarvis', 'jervis']) {
    assert.ok(soundsLike(w, ['siva', 'shiva', 'jarvis']), `${w} should match`);
  }
  assert.equal(soundsLike('hello', ['siva', 'shiva', 'jarvis']), false);
  assert.equal(soundsLike('server', ['siva', 'shiva', 'jarvis']), false);
  assert.equal(soundsLike('a', ['siva']), false, 'too short');
});

test('detectWake handles mis-heard names and extracts the command', () => {
  assert.deepEqual(detectWake('hey shiva'), { woke: true, command: '' });
  assert.deepEqual(detectWake('hey saiva what is the update today'), { woke: true, command: 'what is the update today' });
  assert.deepEqual(detectWake('ok civa do you know about lockbit'), { woke: true, command: 'do you know about lockbit' });
  assert.deepEqual(detectWake('jarvis top threats'), { woke: true, command: 'top threats' });
  assert.equal(detectWake('what is the weather today').woke, false);
  assert.equal(detectWake('the server is down').woke, false);
});

test('glossary lookup is exact, acronym-aware and typo-tolerant', () => {
  assert.equal(lookupTerm('phishing')?.term, 'Phishing');
  assert.equal(lookupTerm('fishing')?.term, 'Phishing', 'common misspelling');
  assert.equal(lookupTerm('RCE')?.term, 'Remote code execution');
  assert.equal(lookupTerm('mfa')?.term, 'MFA');
  assert.equal(lookupTerm('ransom ware')?.term, 'Ransomware');
  assert.equal(lookupTerm('c2')?.term, 'Command and control');
  assert.equal(lookupTerm('ransomwear')?.term, 'Ransomware', 'fuzzy');
  assert.equal(lookupTerm('banana'), null);
  assert.ok(GLOSSARY.length >= 50, 'a real glossary');
  assert.ok(glossaryPrimer().includes('Ransomware:'));
});

test('findTermsInText picks terms used in a sentence', () => {
  const terms = findTermsInText('A phishing email dropped ransomware and used command and control');
  const names = terms.map((t) => t.term);
  assert.ok(names.includes('Phishing'));
  assert.ok(names.includes('Ransomware'));
  assert.ok(names.includes('Command and control'));
  assert.equal(findTermsInText('the weather is nice today').length, 0);
});

function intelIndex(): { index: IntelIndex; matchers: ReturnType<typeof buildMatchers> } {
  const a = parseAttackStix({
    objects: [
      { type: 'intrusion-set', name: 'APT29', aliases: ['APT29', 'Cozy Bear'], description: 'Russian group.', external_references: [{ source_name: 'mitre-attack', external_id: 'G0016', url: 'https://attack.mitre.org/groups/G0016' }] },
      { type: 'tool', name: 'Cobalt Strike', x_mitre_aliases: ['Cobalt Strike'], description: 'Adversary simulation tool.', external_references: [{ source_name: 'mitre-attack', external_id: 'S0154', url: 'https://attack.mitre.org/software/S0154' }] },
    ],
  });
  const malpedia = parseMalpediaCluster({ values: [{ value: 'win.lockbit', description: 'LockBit ransomware.', meta: { synonyms: ['LockBit 3.0'], refs: ['https://malpedia.caad.fkie.fraunhofer.de/details/win.lockbit'] } }] });
  const index: IntelIndex = { builtAt: NOW.toISOString(), version: 2, groups: a.groups, techniques: a.techniques, software: [...a.software, ...malpedia], profiles: {}, status: { attack: 'ok', misp: 'ok', profiles: 'ok' } };
  return { index, matchers: buildMatchers(index.groups) };
}

test('intel lookup falls back to fuzzy for mis-typed actor and malware names', () => {
  const { index } = intelIndex();
  // exact still works
  assert.equal(lookupIntel('cobalt strike', index)?.kind, 'software');
  // fuzzy
  const cs = lookupIntel('cobaltstrike', index);
  assert.equal(cs?.kind, 'software');
  const lb = lookupIntel('lockbite', index);
  assert.equal(lb?.kind, 'software');
  if (lb?.kind === 'software') assert.match(lb.software[0].name.toLowerCase(), /lockbit/);
  const cozy = lookupIntel('cosy bear', index);
  assert.equal(cozy?.kind, 'actor');
  assert.equal(lookupIntel('completely unrelated name', index), null);
});

function deps(over: Partial<ResearchDeps> = {}): ResearchDeps {
  const intel = intelIndex();
  return {
    getIntel: async () => intel,
    getKevMap: async () => new Map(),
    fetchNvdDetails: async () => null,
    wikipediaSummary: async () => null,
    threatFoxLookup: async () => null,
    geminiGrounded: async () => { throw new AiDisabledError(); },
    geminiJson: async () => { throw new AiDisabledError(); },
    ...over,
  };
}

test('research defines a term from the glossary, even with AI off', async () => {
  process.env.ENABLE_WEB_SEARCH = '1';
  const steps: string[] = [];
  const r = await research('what is phishing', routeIntent('what is phishing'), null, [], (s) => steps.push(s), deps());
  assert.ok(steps.some((s) => s.toLowerCase().includes('phishing')), 'a glossary step was reported');
  assert.equal(r.card?.title, 'Phishing');
  assert.match(r.card?.summary ?? '', /trick email|pretends/i);
  assert.ok(r.card?.sections.some((sec) => sec.heading === 'In simple words'));
});

test('research explains a mis-typed term too ("what is fishing")', async () => {
  const r = await research('explain fishing attack', routeIntent('explain fishing attack'), null, [], undefined, deps());
  assert.equal(r.card?.title, 'Phishing');
});

test('wakeOnLoad preference is validated', () => {
  assert.equal(validatePreferences({ wakeOnLoad: true }, DEFAULT_PREFERENCES).ok, true);
  const bad = validatePreferences({ wakeOnLoad: 'yes' }, DEFAULT_PREFERENCES);
  assert.equal(bad.ok, false);
  const ok = validatePreferences({ wakeOnLoad: true }, DEFAULT_PREFERENCES);
  if (ok.ok) assert.equal(ok.value.wakeOnLoad, true);
});
