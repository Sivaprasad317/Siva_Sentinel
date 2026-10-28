// Patch 17/18: the app may frame its own pages, other sites cannot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('the app may frame its own pages, but other sites still cannot frame it', () => {
  const cfg = readFileSync(join(__dirname, '..', 'next.config.mjs'), 'utf8');
  assert.match(cfg, /X-Frame-Options', value: 'SAMEORIGIN'/);
  assert.match(cfg, /frame-ancestors 'self'/);
  assert.doesNotMatch(cfg, /value: 'DENY'/);
});
