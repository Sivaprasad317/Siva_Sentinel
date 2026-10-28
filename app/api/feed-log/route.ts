// GET /api/feed-log -> every item Siva has read (newest first) + live counters.
// If the log is still empty (first run after upgrading) it is built from saved briefings.
import { readStore } from '../../../lib/store';
import { mergeFeedLog } from '../../../lib/feedLog';
import { json } from '../../../lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const store = await readStore();
  let log = store.feedLog;
  if (!log.length) {
    for (const b of [...store.briefings].reverse()) log = mergeFeedLog(log, b.stories, b.createdAt).log;
  }
  return json({
    items: log,
    total: log.length,
    checks: store.meta.checks ?? 0,
    lastNew: store.meta.lastNewItems ?? 0,
    lastCheckedAt: store.meta.lastRunAt ?? null,
    timezone: store.preferences.timezone,
  });
}
