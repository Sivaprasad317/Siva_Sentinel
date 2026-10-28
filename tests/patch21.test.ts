// Patch 21: personal voice phrases, "Cool" to stop, no automatic greetings, real conversational AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_VOICE_COMMANDS, isOwnEcho, matchVoiceCommand, phraseMatches, stripGreeting, validateVoiceCommands } from '../lib/voiceCommands';
import { chooseChatMode, isSecurityTopic } from '../lib/chatRoute';
import { converse, historyToContents, runTool, toSpeech } from '../lib/converse';
import { parseChatTurn, type ChatContent } from '../lib/gemini';
import { validatePreferences } from '../lib/validate';
import { DEFAULT_PREFERENCES } from '../lib/config';
import type { ChatMessage } from '../lib/types';

const C = DEFAULT_VOICE_COMMANDS;

test('your phrases: "Hey Siva wake up" -> Good morning boss; "how was the day" -> Good evening boss, day was good', () => {
  assert.equal(matchVoiceCommand('wake up', C, 'normal', true)?.reply, 'Good morning boss');
  assert.equal(matchVoiceCommand('wake up please', C, 'normal', true)?.reply, 'Good morning boss');
  assert.equal(matchVoiceCommand('How was the day?', C, 'normal', true)?.reply, 'Good evening boss, day was good');
  assert.equal(matchVoiceCommand('how was your day', C, 'normal', true)?.reply, 'Good evening boss, day was good');
  assert.equal(matchVoiceCommand('wake up', C, 'normal', false), null, 'needs "Hey Siva" first');
  assert.equal(matchVoiceCommand('what is the update today', C, 'normal', true), null);
  assert.equal(matchVoiceCommand('what is cool about passkeys', C, 'normal', true), null, '"cool" inside a question is not a command');
});

test('"Cool" while Siva is reading stops him — but not his own voice, and not long sentences', () => {
  assert.equal(matchVoiceCommand('cool', C, 'speaking')?.action, 'stop');
  assert.equal(matchVoiceCommand('Cool.', C, 'speaking')?.action, 'stop');
  assert.equal(matchVoiceCommand('ok stop', C, 'speaking')?.action, 'stop');
  assert.equal(matchVoiceCommand('two flaws are being exploited today so please patch', C, 'speaking'), null);
  assert.equal(isOwnEcho('cool', 'That is a cool new feature, boss.'), true);
  assert.equal(isOwnEcho('cool', 'Patch your VPN first.'), false);
  assert.equal(phraseMatches('kool', 'cool'), true, 'small mis-hearing still works');
});

test('Siva never greets on his own', () => {
  assert.equal(stripGreeting('Good morning boss! Two flaws are exploited.'), 'Two flaws are exploited.');
  assert.equal(stripGreeting('Good evening, boss. Namaste. Patch now.'), 'Patch now.');
  assert.equal(stripGreeting('Two flaws are exploited.'), 'Two flaws are exploited.');
});

test('voice commands are saved and validated', () => {
  assert.equal(validatePreferences({ voiceCommands: C }, DEFAULT_PREFERENCES).ok, true);
  assert.equal(validatePreferences({ voiceCommands: [{ phrase: '', reply: 'x', action: 'say' }] }, DEFAULT_PREFERENCES).ok, false);
  assert.equal(validatePreferences({ voiceCommands: [{ phrase: 'hi', reply: '', action: 'say' }] }, DEFAULT_PREFERENCES).ok, false);
  assert.deepEqual(validateVoiceCommands([{ phrase: ' cool ', reply: '', action: 'stop', whileSpeaking: true }]), [{ phrase: 'cool', reply: '', action: 'stop', needsWake: false, whileSpeaking: true }]);
  assert.deepEqual(DEFAULT_PREFERENCES.voiceCommands, C);
});

test('which brain answers: security research vs conversation (tools or web)', () => {
  assert.equal(isSecurityTopic('what is ransomware'), true);
  assert.equal(isSecurityTopic('explain CVE-2024-3400'), true);
  assert.equal(isSecurityTopic('tell me a joke'), false);
  assert.equal(chooseChatMode('tell me a joke', true), 'chat-tools');
  assert.equal(chooseChatMode('who won the match yesterday', true), 'chat-web');
  assert.equal(chooseChatMode("what's in my briefing", true), 'chat-tools');
  assert.equal(chooseChatMode('who won the match yesterday', false), 'chat-tools');
});

test('conversation memory becomes proper multi-turn contents', () => {
  const h: ChatMessage[] = [
    { id: '0', role: 'assistant', text: 'old', createdAt: '' },
    { id: '1', role: 'user', text: 'What is LockBit?', createdAt: '' },
    { id: '2', role: 'assistant', text: 'LockBit is a ransomware gang.', createdAt: '' },
  ];
  const c = historyToContents(h);
  assert.equal(c[0].role, 'user', 'always starts with the user');
  assert.deepEqual(c.map((x) => x.role), ['user', 'model']);
});

test('function calling: tool call -> tool result (same id) -> spoken answer, with screen actions', async () => {
  const seen: ChatContent[][] = [];
  let n = 0;
  const chat = async (req: { contents: ChatContent[] }) => {
    seen.push(JSON.parse(JSON.stringify(req.contents)));
    n++;
    if (n === 1) return { content: { role: 'model' as const, parts: [{ functionCall: { id: 'c1', name: 'check_cve', args: { cve_id: 'CVE-2024-3400' } }, thoughtSignature: 'sig' }, { functionCall: { id: 'c2', name: 'open_screen', args: { screen: 'threat_graph' } } }] }, text: '', calls: [{ id: 'c1', name: 'check_cve', args: { cve_id: 'CVE-2024-3400' } }, { id: 'c2', name: 'open_screen', args: { screen: 'threat_graph' } }] };
    return { content: { role: 'model' as const, parts: [{ text: '**Yes**, boss — CVE-2024-3400 is *actively exploited*.\n- Patch PAN-OS now.' }] }, text: '**Yes**, boss — CVE-2024-3400 is *actively exploited*.\n- Patch PAN-OS now.', calls: [] };
  };
  const tools = {
    feedLog: async () => ({ log: [], lastRunAt: null }),
    briefing: () => null,
    kev: async () => new Map([['CVE-2024-3400', { cveID: 'CVE-2024-3400', vendorProject: 'Palo Alto Networks', product: 'PAN-OS', vulnerabilityName: '', dateAdded: '2024-04-12', shortDescription: '', requiredAction: '', dueDate: '2024-04-19', knownRansomwareCampaignUse: 'Unknown' }]]),
    nvd: async () => null,
    epss: async () => null,
    outlook: async () => 'quiet week',
  };
  const steps: string[] = [];
  const r = await converse('is that one exploited? open the graph', [], null, (s) => steps.push(s), { chat: chat as never, grounded: (async () => { throw new Error('no web'); }) as never, tools: tools as never });
  assert.equal(r.intent, 'chat');
  assert.equal(r.speech, 'Yes, boss — CVE-2024-3400 is actively exploited. Patch PAN-OS now.', 'no markdown in speech');
  assert.deepEqual(r.actions, [{ type: 'navigate', view: 'graph' }]);
  const second = seen[1];
  const back = second[second.length - 1];
  assert.equal(back.role, 'user');
  const fr = back.parts.map((p) => p.functionResponse!);
  assert.equal(fr[0].id, 'c1');
  assert.equal((fr[0].response.result as { exploitedPerCisaKev: { yes: boolean } }).exploitedPerCisaKev.yes, true);
  assert.equal(second[second.length - 2].parts[0].thoughtSignature, 'sig', 'model turn kept unchanged (thought signature)');
  assert.ok(steps.includes('Checking the CVE (CISA KEV, EPSS, NVD)'));
});

test('tools validate input and report errors instead of crashing', async () => {
  const acts: never[] = [];
  const t = { feedLog: async () => ({ log: [], lastRunAt: null }), briefing: () => null, kev: async () => new Map(), nvd: async () => null, epss: async () => null, outlook: async () => '' };
  assert.match(String((await runTool('check_cve', { cve_id: 'nope' }, t as never, acts)).error), /not a valid CVE/);
  assert.match(String((await runTool('get_todays_briefing', {}, t as never, acts)).error), /No briefing/);
  assert.match(String((await runTool('nope', {}, t as never, acts)).error), /Unknown tool/);
});

test('model replies are parsed safely (thought parts hidden) and spoken cleanly', () => {
  const r = parseChatTurn({ candidates: [{ content: { role: 'model', parts: [{ text: 'thinking…', thought: true }, { text: 'Hello there.' }] } }] });
  assert.equal(r.text, 'Hello there.');
  assert.equal(r.calls.length, 0);
  assert.equal(toSpeech('Good morning boss! See https://x.com **this**'), 'See this');
});
