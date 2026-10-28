// Tests for patch 4: wake word "Yes boss", research pipeline, knowledge sources, grounded answers, streaming route.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { routeIntent } from '../lib/assistantRouter';
import { keywords, parseSectioned, relatedStories, research, type ResearchDeps } from '../lib/research';
import { detectIoc, parseThreatFox, parseWikiSearch, parseWikiSummary } from '../lib/knowledge';
import { parseGroundedResponse, AiDisabledError } from '../lib/gemini';
import { buildMatchers, findEntities, lookupIntel, parseAttackStix, parseMalpediaCluster, type IntelIndex } from '../lib/intel';
import { storyFromRaw } from '../lib/refresh';
import { toCard } from '../lib/answerCard';
import type { Briefing } from '../lib/types';

const NOW = new Date('2026-10-17T12:00:00Z');

test('"Hey Siva" alone is a wake-up; with a question it is routed normally', () => {
  assert.deepEqual(routeIntent('Hey Siva'), { type: 'wake' });
  assert.deepEqual(routeIntent('jarvis'), { type: 'wake' });
  assert.equal(routeIntent("Hey Siva, what's the update today?").type, 'briefing');
  assert.deepEqual(routeIntent('Hey Siva do you know about LockBit?').type, 'chat');
  assert.deepEqual(routeIntent('open intelligence dashboard'), { type: 'navigate', view: 'overview' });
  assert.deepEqual(routeIntent('go home'), { type: 'chat', text: 'go home' });
  assert.deepEqual(routeIntent('open home'), { type: 'navigate', view: 'home' });
});

test('sectioned answer parsing (Google Search grounded replies)', () => {
  const p = parseSectioned(`**TITLE:** LockBit ransomware
SUMMARY: LockBit is ransomware-as-a-service. Affiliates rent it [1].
KEY FACTS:
- Active since 2019 [2]
* Disrupted in 2024
WHAT TO DO:
1. Patch VPNs
2) Keep offline backups`);
  assert.equal(p.title, 'LockBit ransomware');
  assert.equal(p.summary, 'LockBit is ransomware-as-a-service. Affiliates rent it .');
  assert.deepEqual(p.facts, ['Active since 2019', 'Disrupted in 2024']);
  assert.deepEqual(p.actions, ['Patch VPNs', 'Keep offline backups']);
  const loose = parseSectioned('Just a paragraph answer.\n- one point');
  assert.equal(loose.summary, 'Just a paragraph answer.');
  assert.deepEqual(loose.facts, ['one point']);
});

test('grounded response parsing keeps https sources and search suggestions', () => {
  const g = parseGroundedResponse({
    candidates: [{
      content: { parts: [{ text: 'TITLE: X\nSUMMARY: Y' }] },
      groundingMetadata: {
        groundingChunks: [{ web: { uri: 'https://vertexaisearch.cloud.google.com/a', title: 'cisa.gov' } }, { web: { uri: 'javascript:bad', title: 'x' } }, { web: { uri: 'https://vertexaisearch.cloud.google.com/a', title: 'dup' } }],
        webSearchQueries: ['lockbit ransomware'],
        searchEntryPoint: { renderedContent: '<div>chips</div>' },
      },
    }],
  });
  assert.equal(g.sources.length, 1);
  assert.equal(g.sources[0].title, 'cisa.gov');
  assert.deepEqual(g.queries, ['lockbit ransomware']);
  assert.equal(g.suggestionsHtml, '<div>chips</div>');
  assert.throws(() => parseGroundedResponse({ candidates: [{ content: { parts: [] }, finishReason: 'SAFETY' }] }), /SAFETY/);
});

test('IOC detection', () => {
  assert.deepEqual(detectIoc('is 185.220.101.1 malicious?'), { kind: 'ipv4', value: '185.220.101.1' });
  assert.equal(detectIoc(`check ${'a'.repeat(64)}`)?.kind, 'sha256');
  assert.equal(detectIoc(`hash ${'b'.repeat(32)}`)?.kind, 'md5');
  assert.deepEqual(detectIoc('check domain evil-login.xyz please'), { kind: 'domain', value: 'evil-login.xyz' });
  assert.equal(detectIoc('tell me about Node.js security'), null, 'no false domain');
  assert.equal(detectIoc('visit https://bad.example/x?y=1.')?.value, 'https://bad.example/x?y=1');
  assert.equal(detectIoc('version 1.2.3 released'), null);
});

test('Wikipedia and ThreatFox parsing', () => {
  assert.equal(parseWikiSearch(['lockbit', ['LockBit'], [''], ['https://en.wikipedia.org/wiki/LockBit']]), 'LockBit');
  assert.equal(parseWikiSearch(['x', [], [], []]), null);
  const w = parseWikiSummary({ type: 'standard', title: 'LockBit', extract: 'LockBit is a <b>ransomware</b> group.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/LockBit' } } });
  assert.equal(w?.extract, 'LockBit is a ransomware group.');
  assert.equal(parseWikiSummary({ type: 'disambiguation', title: 'X', extract: 'may refer to' }), null);
  const tf = parseThreatFox({ query_status: 'ok', data: [{ ioc: '1.2.3.4:443', threat_type_desc: 'Botnet C&C', malware_printable: 'Cobalt Strike', confidence_level: 100, first_seen: '2026-10-01', reference: 'javascript:x' }] });
  assert.equal(tf.hits[0].malware, 'Cobalt Strike');
  assert.equal(tf.hits[0].reference, null, 'unsafe reference dropped');
  assert.deepEqual(parseThreatFox({ query_status: 'no_result', data: 'Your search did not yield any results' }), { status: 'no_result', hits: [] });
});

function intelIndex(): { index: IntelIndex; matchers: ReturnType<typeof buildMatchers> } {
  const a = parseAttackStix({
    objects: [
      { type: 'intrusion-set', name: 'APT29', aliases: ['APT29', 'Cozy Bear'], description: 'Russian group.', external_references: [{ source_name: 'mitre-attack', external_id: 'G0016', url: 'https://attack.mitre.org/groups/G0016' }] },
      { type: 'tool', name: 'Cobalt Strike', x_mitre_aliases: ['Cobalt Strike'], description: 'Commercial adversary simulation tool.', external_references: [{ source_name: 'mitre-attack', external_id: 'S0154', url: 'https://attack.mitre.org/software/S0154' }] },
    ],
  });
  const malpedia = parseMalpediaCluster({ values: [{ value: 'win.lockbit', description: 'LockBit ransomware family.', meta: { synonyms: ['LockBit 3.0', 'LockBit Black'], refs: ['https://malpedia.caad.fkie.fraunhofer.de/details/win.lockbit'] } }] });
  const index: IntelIndex = { builtAt: NOW.toISOString(), version: 2, groups: a.groups, techniques: a.techniques, software: [...a.software, ...malpedia], profiles: {}, status: { attack: 'ok', misp: 'ok', profiles: 'ok' } };
  return { index, matchers: buildMatchers(index.groups) };
}

test('malware and tool lookups (ATT&CK software + Malpedia)', () => {
  const { index, matchers } = intelIndex();
  const cs = lookupIntel('cobalt strike', index);
  assert.equal(cs?.kind, 'software');
  if (cs?.kind === 'software') assert.equal(cs.software[0].id, 'S0154');
  const lb = lookupIntel('LockBit', index);
  assert.equal(lb?.kind, 'software');
  if (lb?.kind === 'software') assert.equal(lb.software[0].source, 'Malpedia (MISP galaxy)');
  assert.deepEqual(findEntities('Do you know about lockbit and Cozy Bear using cobalt strike?', index, matchers).sort(), ['Cobalt Strike', 'Cozy Bear', 'lockbit'].sort());
});

test('keywords and related stories', () => {
  assert.deepEqual(keywords('Hey Siva, do you know about LockBit ransomware?'), ['lockbit', 'ransomware']);
  const s1 = storyFromRaw({ title: 'LockBit ransomware hits hospital', url: 'https://a.example/1', publishedAt: null, snippet: '', source: 'A', official: false }, NOW.toISOString());
  const s2 = storyFromRaw({ title: 'Chrome update fixes bugs', url: 'https://a.example/2', publishedAt: null, snippet: '', source: 'B', official: false }, NOW.toISOString());
  const r = relatedStories('Do you know about LockBit ransomware?', [{ ...s1, summary: '' }, { ...s2, summary: '' }]);
  assert.deepEqual(r.map((x) => x.id), [s1.id]);
});

function deps(over: Partial<ResearchDeps> = {}): ResearchDeps {
  const intel = intelIndex();
  return {
    getIntel: async () => intel,
    getKevMap: async () => new Map(),
    fetchNvdDetails: async () => null,
    wikipediaSummary: async () => ({ title: 'LockBit', extract: 'LockBit is a ransomware group.', url: 'https://en.wikipedia.org/wiki/LockBit' }),
    threatFoxLookup: async () => null,
    geminiGrounded: async () => ({ text: 'TITLE: LockBit\nSUMMARY: A ransomware gang.\nKEY FACTS:\n- Since 2019\nWHAT TO DO:\n- Patch VPNs', sources: [{ title: 'cisa.gov', url: 'https://g.example/1' }], queries: ['lockbit'], suggestionsHtml: '<div>s</div>' }),
    geminiJson: async () => ({ title: 'LockBit (data)', summary: 'From collected data.', facts: ['f'], actions: ['a'] }),
    ...over,
  };
}

test('research: reports real steps, uses web search, merges sources', async () => {
  process.env.ENABLE_WEB_SEARCH = '1';
  process.env.ENABLE_WIKIPEDIA = '1';
  const steps: string[] = [];
  const r = await research('Do you know about LockBit?', routeIntent('Do you know about LockBit?'), null, [], (s) => steps.push(s), deps());
  assert.equal(r.intent, 'research');
  assert.ok(steps[0].includes('MITRE'));
  assert.ok(steps.some((s) => s.includes('Wikipedia')));
  assert.ok(steps.some((s) => s.includes('Google Search')));
  assert.equal(r.card?.title, 'LockBit');
  assert.equal(r.card?.usedWebSearch, true);
  assert.equal(r.card?.searchSuggestionsHtml, '<div>s</div>');
  assert.deepEqual(r.card?.actions, ['Patch VPNs']);
  const urls = r.card!.sources.map((s) => s.url);
  assert.ok(urls.includes('https://malpedia.caad.fkie.fraunhofer.de/details/win.lockbit'));
  assert.ok(urls.includes('https://en.wikipedia.org/wiki/LockBit'));
  assert.ok(urls.includes('https://g.example/1'));
  assert.match(r.speech, /details on your screen, boss/);
});

test('research falls back to collected data when web search fails, and to plain sources without AI', async () => {
  const failed = await research('Who is APT29?', routeIntent('Who is APT29?'), null, [], undefined, deps({ geminiGrounded: async () => { throw new Error('HTTP 429'); } }));
  assert.equal(failed.card?.title, 'LockBit (data)');
  assert.match(failed.card?.note ?? '', /Web search was not available/);
  const noAi = await research('Who is APT29?', routeIntent('Who is APT29?'), null, [], undefined, deps({ geminiGrounded: async () => { throw new AiDisabledError(); }, geminiJson: async () => { throw new AiDisabledError(); } }));
  assert.equal(noAi.aiStatus, 'disabled');
  assert.equal(noAi.card?.title, 'APT29');
  assert.equal(noAi.card?.summary, 'Russian group.');
});

test('research checks indicators in ThreatFox only when a key is set', async () => {
  process.env.ABUSECH_AUTH_KEY = '';
  const noKey = await research('Is 1.2.3.4 malicious?', routeIntent('Is 1.2.3.4 malicious?'), null, [], undefined, deps());
  assert.match(noKey.card?.note ?? '', /ABUSECH_AUTH_KEY/);
  process.env.ABUSECH_AUTH_KEY = 'test';
  const steps: string[] = [];
  const hit = await research('Is 1.2.3.4 malicious?', routeIntent('Is 1.2.3.4 malicious?'), null, [], (s) => steps.push(s), deps({ threatFoxLookup: async () => ({ status: 'ok', hits: [{ ioc: '1.2.3.4:443', threatType: 'Botnet C&C', malware: 'Cobalt Strike', confidence: 100, firstSeen: '2026-10-01', reference: null }] }) }));
  assert.ok(steps.some((s) => s.includes('ThreatFox')));
  assert.ok(hit.card?.sections.some((s) => s.heading.includes('ThreatFox') && s.bullets[0].includes('Cobalt Strike')));
  delete process.env.ABUSECH_AUTH_KEY;
});

test('toCard turns a briefing reply into a readable card', () => {
  const s = storyFromRaw({ title: 'Story A', url: 'https://a.example/1', publishedAt: null, snippet: '', source: 'A', official: false }, NOW.toISOString());
  const b = { id: 'b', createdAt: NOW.toISOString(), stories: [s], executiveSummary: 'Exec', recommendations: ['Patch'], spokenScript: 'x', aiStatus: 'ok', sourceStatus: [], trigger: 'manual' } as Briefing;
  const c = toCard({ intent: 'briefing', speech: 'x', citations: [], actions: [], aiStatus: 'ok' }, b);
  assert.equal(c.title, "Today's update");
  assert.equal(c.summary, 'Exec');
  assert.deepEqual(c.actions, ['Patch']);
});

test('/api/ask streams steps and a final result (no network needed)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'siva-p4-'));
  process.env.DATA_DIR = dir;
  process.env.GEMINI_API_KEY = '';
  process.env.ENABLE_THREAT_INTEL = '0';
  process.env.ENABLE_WIKIPEDIA = '0';
  try {
    const { POST } = await import('../app/api/ask/route');
    const wake = await POST(new Request('http://127.0.0.1/api/ask', { method: 'POST', body: JSON.stringify({ message: 'Hey Siva' }) }));
    const wakeLines = (await wake.text()).trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(wakeLines.at(-1).type, 'result');
    assert.equal(wakeLines.at(-1).reply.speech, 'Yes boss.');
    const res = await POST(new Request('http://127.0.0.1/api/ask', { method: 'POST', body: JSON.stringify({ message: 'What is a botnet?' }) }));
    assert.match(res.headers.get('content-type') ?? '', /ndjson/);
    const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
    assert.ok(lines.some((l) => l.type === 'step'));
    const last = lines.at(-1);
    assert.equal(last.type, 'result');
    assert.equal(last.reply.intent, 'research');
    assert.equal(last.reply.aiStatus, 'disabled');
    const bad = await POST(new Request('http://127.0.0.1/api/ask', { method: 'POST', body: JSON.stringify({ message: '' }) }));
    assert.equal(bad.status, 400);
  } finally {
    delete process.env.ENABLE_THREAT_INTEL;
    delete process.env.ENABLE_WIKIPEDIA;
    rmSync(dir, { recursive: true, force: true });
  }
});
