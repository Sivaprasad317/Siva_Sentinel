// GET  /api/alerts            -> recent alerts + count of unseen
// POST /api/alerts {seen:"all"} | {ids:[...]} -> mark alerts as seen
// DELETE /api/alerts          -> clear all alerts
import { readStore, updateStore } from '../../../lib/store';
import { errorJson, json, limited, readJsonBody } from '../../../lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const store = await readStore();
  const alerts = store.alerts.slice(0, 50);
  return json({ alerts, unseen: store.alerts.filter((a) => !a.seen).length });
}

export async function POST(req: Request) {
  const blocked = limited(req, 'alerts', 60, 60_000);
  if (blocked) return blocked;
  const body = await readJsonBody(req);
  if (!body.ok) return body.res;
  const b = body.value as { seen?: unknown; ids?: unknown };
  const ids = Array.isArray(b.ids) ? new Set(b.ids.filter((x): x is string => typeof x === 'string')) : null;
  await updateStore((d) => {
    for (const a of d.alerts) if (b.seen === 'all' || ids?.has(a.id)) a.seen = true;
  });
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  const blocked = limited(req, 'alerts', 20, 60_000);
  if (blocked) return blocked;
  await updateStore((d) => {
    d.alerts = [];
  });
  return json({ ok: true });
}
