import test from 'node:test';
import assert from 'node:assert/strict';
import { detectWake, detectWakeAny } from '../lib/assistantRouter';

test('wake word after filler words is detected, with the command', () => {
  assert.deepEqual(detectWake('okay so hey siva what is ransomware'), { woke: true, command: 'what is ransomware' });
  assert.deepEqual(detectWake('um hey shiva, top threats'), { woke: true, command: 'top threats' });
  assert.equal(detectWake('um hey siva').woke, true);
});

test('just mentioning Shiva mid-sentence does not wake her', () => {
  assert.equal(detectWake('I talked to shiva yesterday about the server').woke, false);
  assert.equal(detectWake('the weather is nice').woke, false);
});

test('a wake word in a lower-ranked alternative still counts', () => {
  const r = detectWakeAny(['hey sivan what is phishing', 'hey shiva what is phishing']);
  assert.equal(r.woke, true);
  assert.equal(r.command, 'what is phishing');
  assert.deepEqual(detectWakeAny(['hello there', 'hollow there']), { woke: false, command: '', text: 'hello there' });
});
