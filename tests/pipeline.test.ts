// End-to-end test of the refresh pipeline with a fake network (no real internet needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('runRefresh collects, links KEV, ranks and saves a briefing; failed sources are reported', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'siva-test-'));
  process.env.DATA_DIR = dir;
  process.env.NVD_MAX_LOOKUPS = '0';
  process.env.GEMINI_API_KEY = '';
  const rss = readFileSync(join(__dirname, 'fixtures', 'rss.xml'), 'utf8').replace(/Fri, 16 Oct 2026 09:30:00 \+0000/, new Date().toUTCString());
  const today = new Date().toISOString().slice(0, 10);
  const kev = {
    vulnerabilities: [
      { cveID: 'CVE-2026-11111', vendorProject: 'VendorX', product: 'Gateway', vulnerabilityName: 'Auth bypass', dateAdded: today, shortDescription: 'd', requiredAction: 'Apply updates per vendor instructions.', dueDate: today, knownRansomwareCampaignUse: 'Unknown' },
      { cveID: 'CVE-2026-44444', vendorProject: 'VendorZ', product: 'Router', vulnerabilityName: 'RCE', dateAdded: today, shortDescription: 'd2', requiredAction: 'Patch.', dueDate: today, knownRansomwareCampaignUse: 'Known' },
    ],
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes('known_exploited')) return new Response(JSON.stringify(kev));
    if (u.includes('thehackernews') || u.includes('TheHackersNews')) return new Response(rss);
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const { runRefresh } = await import('../lib/refresh');
    const { readStore } = await import('../lib/store');
    const b = await runRefresh('manual');
    assert.equal(b.aiStatus, 'disabled');
    const news = b.stories.find((s) => s.cves.includes('CVE-2026-11111'));
    assert.ok(news, 'news story present');
    assert.equal(news!.kev?.cveID, 'CVE-2026-11111', 'news linked to KEV');
    assert.ok(b.stories.some((s) => s.id === 'kev-cve-2026-44444'), 'KEV-only story added');
    assert.equal(b.stories[0].priority, 'critical', 'exploited items rank first');
    const failed = b.sourceStatus.filter((s) => !s.ok).map((s) => s.name);
    assert.ok(failed.includes('BleepingComputer'), 'failed feeds are reported, not hidden');
    const store = await readStore();
    assert.equal(store.briefings.length, 1, 'briefing saved');
  } finally {
    globalThis.fetch = realFetch;
    rmSync(dir, { recursive: true, force: true });
  }
});
