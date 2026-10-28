// POST /api/briefing/refresh -> start collecting live intelligence in the background.
// Rate limited to 3 starts per 10 minutes to protect your Gemini quota and the sources.
import { startRefresh } from '../../../../lib/refresh';
import { errorJson, json, limited } from '../../../../lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const blocked = limited(req, 'refresh', 3, 10 * 60_000);
  if (blocked) return blocked;
  const started = startRefresh('manual');
  if (!started) return errorJson('A refresh is already running.', 409);
  return json({ started: true }, 202);
}
