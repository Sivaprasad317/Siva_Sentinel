// GET /api/history          -> list of saved briefings (summaries only)
// GET /api/history?q=lockbit -> search stories across all saved briefings
// DELETE /api/history?id=<id>  -> delete one saved briefing
// DELETE /api/history?all=1     -> delete ALL saved briefings (the browser asks you to confirm first)
import { readStore, updateStore } from '../../../lib/store';
import { errorJson, json, limited } from '../../../lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().toLowerCase();
  if (q.length > 100) return errorJson('Search text too long', 400);
  const store = await readStore();

  const briefings = store.briefings.map((b) => ({
    id: b.id,
    createdAt: b.createdAt,
    trigger: b.trigger,
    storyCount: b.stories.length,
    criticalCount: b.stories.filter((s) => s.priority === 'critical').length,
    kevCount: b.stories.filter((s) => s.kev).length,
    ransomwareCount: b.stories.filter((s) => s.categories.includes('ransomware')).length,
    aiStatus: b.aiStatus,
  }));

  if (!q) return json({ briefings, results: [] });

  const results = [];
  const seen = new Set<string>();
  for (const b of store.briefings) {
    for (const s of b.stories) {
      if (seen.has(s.url)) continue;
      const hay = `${s.title} ${s.summary} ${s.snippet} ${s.cves.join(' ')} ${s.source}`.toLowerCase();
      if (!hay.includes(q)) continue;
      seen.add(s.url);
      results.push({ briefingId: b.id, briefingAt: b.createdAt, story: { id: s.id, title: s.title, url: s.url, source: s.source, publishedAt: s.publishedAt, priority: s.priority } });
      if (results.length >= 50) break;
    }
    if (results.length >= 50) break;
  }
  return json({ briefings, results });
}

export async function DELETE(req: Request) {
  const blocked = limited(req, 'history-delete', 30, 60_000);
  if (blocked) return blocked;
  const params = new URL(req.url).searchParams;
  const id = params.get('id');
  const all = params.get('all') === '1';
  if (!all && (!id || !/^[a-z0-9-]{1,64}$/i.test(id))) return errorJson('Give ?id=<briefing id> or ?all=1', 400);
  const removed = await updateStore((d) => {
    const before = d.briefings.length;
    d.briefings = all ? [] : d.briefings.filter((b) => b.id !== id);
    return before - d.briefings.length;
  });
  if (!all && removed === 0) return errorJson('Briefing not found', 404);
  return json({ removed });
}
