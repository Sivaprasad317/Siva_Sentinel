import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicUrl, isPrivateHost } from '../lib/netGuard';
import { fetchWithRetry, HttpError } from '../lib/http';
import { validateCustomSource } from '../lib/feedResolve';

test('private, loopback and metadata hosts are blocked; public ones are not', () => {
  for (const h of ['localhost', '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.5', '169.254.169.254', '[::1]', '::ffff:127.0.0.1', 'fd00::1', 'router.local', '0.0.0.0'])
    assert.equal(isPrivateHost(h), true, h);
  for (const h of ['example.com', '8.8.8.8', '172.32.0.1', '2606:4700::1111']) assert.equal(isPrivateHost(h), false, h);
});

test('assertPublicUrl rejects non-http schemes and private literals', async () => {
  await assert.rejects(assertPublicUrl('file:///etc/passwd'));
  await assert.rejects(assertPublicUrl('http://169.254.169.254/latest/meta-data'));
  await assertPublicUrl('https://8.8.8.8/');
});

test('publicOnly fetch refuses private targets and private redirect hops without retrying', async () => {
  let calls = 0;
  const direct = (async () => { calls++; return new Response('x'); }) as typeof fetch;
  await assert.rejects(fetchWithRetry('http://127.0.0.1:3000/api/status', { publicOnly: true, fetchImpl: direct, retries: 2 }), (e) => e instanceof HttpError && !e.retryable);
  assert.equal(calls, 0);

  const redirecting = (async (url: string) =>
    String(url).startsWith('https://8.8.8.8')
      ? new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } })
      : new Response('secret')) as typeof fetch;
  await assert.rejects(fetchWithRetry('https://8.8.8.8/feed', { publicOnly: true, fetchImpl: redirecting }), /not a public address/);
});

test('custom feeds cannot point at local addresses', () => {
  assert.equal(validateCustomSource('Mine', 'http://127.0.0.1:8080/feed').ok, false);
  assert.equal(validateCustomSource('Mine', 'https://example.com/feed.xml').ok, true);
});
