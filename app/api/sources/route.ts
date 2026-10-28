// GET    /api/sources            -> all feeds (built-in, seed, custom) with enabled state + last status
// POST   /api/sources {name,url}  -> add a custom feed
// PUT    /api/sources {url,enabled} | {enableAllSeeds:true} | {disableAllSeeds:true}
// DELETE /api/sources?id=<custom id>  -> remove a custom feed
import { randomUUID } from 'node:crypto';
import { readStore, updateStore } from '../../../lib/store';
import { resolveAllSources, validateCustomSource, feedPrefKey as keyOf } from '../../../lib/feedResolve';
import { FEED_SEEDS } from '../../../lib/feedSeeds';
import { errorJson, json, limited, readJsonBody } from '../../../lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const store = await readStore();
  const rows = resolveAllSources(store);
  // Attach last fetch status/count from the most recent briefing.
  const status = new Map<string, { ok: boolean; items: number; error?: string }>();
  for (const s of store.briefings[0]?.sourceStatus ?? []) status.set(s.name, { ok: s.ok, items: s.items, error: s.error });
  return json({
    sources: rows.map((r) => ({ ...r, last: status.get(r.name) ?? null })),
    counts: { total: rows.length, enabled: rows.filter((r) => r.enabled).length },
  });
}

export async function POST(req: Request) {
  const blocked = limited(req, 'sources', 30, 60_000);
  if (blocked) return blocked;
  const body = await readJsonBody(req);
  if (!body.ok) return body.res;
  const b = body.value as { name?: unknown; url?: unknown };
  const v = validateCustomSource(b.name, b.url);
  if (!v.ok) return errorJson(v.error, 400);
  const k = keyOf(v.url);
  const added = await updateStore((d) => {
    const exists = d.sources.some((s) => keyOf(s.url) === k) || resolveAllSources(d).some((r) => keyOf(r.url) === k && r.origin !== 'custom');
    if (exists) return null;
    const entry = { id: randomUUID(), name: v.name, url: v.url, enabled: true, addedAt: new Date().toISOString() };
    d.sources.unshift(entry);
    return entry;
  });
  if (!added) return errorJson('That feed is already in the list.', 409);
  return json({ source: added }, 201);
}

export async function PUT(req: Request) {
  const blocked = limited(req, 'sources', 60, 60_000);
  if (blocked) return blocked;
  const body = await readJsonBody(req);
  if (!body.ok) return body.res;
  const b = body.value as { url?: unknown; enabled?: unknown; enableAllSeeds?: unknown; disableAllSeeds?: unknown };
  await updateStore((d) => {
    if (b.enableAllSeeds === true || b.disableAllSeeds === true) {
      const on = b.enableAllSeeds === true;
      for (const seed of FEED_SEEDS) d.feedPrefs[keyOf(seed.url)] = on;
      return;
    }
    if (typeof b.url !== 'string' || typeof b.enabled !== 'boolean') return;
    const k = keyOf(b.url);
    const custom = d.sources.find((s) => keyOf(s.url) === k);
    if (custom) custom.enabled = b.enabled;
    else d.feedPrefs[k] = b.enabled;
  });
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  const blocked = limited(req, 'sources', 30, 60_000);
  if (blocked) return blocked;
  const id = new URL(req.url).searchParams.get('id');
  if (!id || !/^[a-z0-9-]{1,64}$/i.test(id)) return errorJson('Give the custom source id to remove.', 400);
  const removed = await updateStore((d) => {
    const before = d.sources.length;
    d.sources = d.sources.filter((s) => s.id !== id);
    return before - d.sources.length;
  });
  if (!removed) return errorJson('Only custom sources you added can be removed (built-in and seed feeds can be disabled instead).', 404);
  return json({ removed });
}
