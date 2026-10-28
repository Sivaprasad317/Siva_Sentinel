// GET /api/preferences -> current settings
// PUT /api/preferences -> update settings (validated)
import { readStore, updateStore } from '../../../lib/store';
import { validatePreferences } from '../../../lib/validate';
import { errorJson, json, limited, readJsonBody } from '../../../lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const store = await readStore();
  return json({ preferences: store.preferences });
}

export async function PUT(req: Request) {
  const blocked = limited(req, 'prefs', 30, 60_000);
  if (blocked) return blocked;
  const body = await readJsonBody(req);
  if (!body.ok) return body.res;
  const current = (await readStore()).preferences;
  const result = validatePreferences(body.value, current);
  if (!result.ok) return errorJson(result.error, 400);
  await updateStore((d) => {
    const scheduleChanged = d.preferences.briefingTime !== result.value.briefingTime || d.preferences.timezone !== result.value.timezone;
    d.preferences = result.value;
    // If the time was moved later today, allow today's run to happen at the new time.
    if (scheduleChanged) d.meta.lastScheduledDateKey = undefined;
  });
  return json({ preferences: result.value });
}
