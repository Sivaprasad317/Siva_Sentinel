// GET /api/briefing            -> latest saved briefing
// GET /api/briefing?id=<id>    -> a specific briefing from history
// GET /api/briefing?sample=1   -> clearly labelled fictional sample data (for testing the UI)
import { readStore } from '../../../lib/store';
import { sampleBriefing } from '../../../lib/sample';
import { isStale } from '../../../lib/format';
import { errorJson, json } from '../../../lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  if (params.get('sample') === '1') return json({ briefing: sampleBriefing(), stale: false });

  const id = params.get('id');
  if (id && !/^[a-z0-9-]{1,64}$/i.test(id)) return errorJson('Invalid id', 400);

  const store = await readStore();
  const briefing = id ? store.briefings.find((b) => b.id === id) ?? null : store.briefings[0] ?? null;
  if (id && !briefing) return errorJson('Briefing not found', 404);
  return json({ briefing, stale: briefing ? isStale(briefing.createdAt) : false });
}
