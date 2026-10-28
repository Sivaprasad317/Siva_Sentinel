// Tests for the streaming body-size limit and the intel-index retry schedule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readTextLimited } from '../lib/http';
import { INTEL_INDEX_VERSION, intelNeedsRebuild, type IntelIndex } from '../lib/intel';

test('readTextLimited returns small bodies intact (including multi-byte text)', async () => {
  assert.equal(await readTextLimited(new Response('héllo wörld'), 100), 'héllo wörld');
});

test('readTextLimited rejects a declared Content-Length over the limit without reading', async () => {
  const res = new Response('x'.repeat(50), { headers: { 'content-length': '50' } });
  await assert.rejects(readTextLimited(res, 10), /too large/);
});

test('readTextLimited stops a stream that grows past the limit', async () => {
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      pulled++;
      c.enqueue(new Uint8Array(1000));
    },
  });
  await assert.rejects(readTextLimited(new Response(body), 5000), /too large/);
  assert.ok(pulled < 20, `read ${pulled} chunks`);
});

test('intel index retries a failed download after hours, not a week', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  const base: IntelIndex = { version: INTEL_INDEX_VERSION, builtAt: '2026-10-28T00:00:00Z', groups: [], techniques: [], profiles: {}, status: { attack: 'ok', misp: 'ok', profiles: 'ok' } };
  assert.equal(intelNeedsRebuild(base, now), false);
  assert.equal(intelNeedsRebuild({ ...base, retryAt: '2026-10-28T18:00:00Z' }, now), false);
  assert.equal(intelNeedsRebuild({ ...base, retryAt: '2026-10-28T06:00:00Z' }, now), true);
  assert.equal(intelNeedsRebuild({ ...base, builtAt: '2026-10-20T00:00:00Z' }, now), true);
  assert.equal(intelNeedsRebuild({ ...base, version: 1 }, now), true);
});
