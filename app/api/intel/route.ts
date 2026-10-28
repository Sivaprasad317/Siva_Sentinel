// GET /api/intel        -> intel data status, toolbox links, actors/techniques seen in the latest briefing
// GET /api/intel?q=APT29 -> look up an actor (name/alias/G-id) or technique (T-id/name)
import { readStore } from '../../../lib/store';
import { getIntel, lookupIntel } from '../../../lib/intel';
import { TOOLBOX_LINKS } from '../../../lib/config';
import { errorJson, json, limited } from '../../../lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const blocked = limited(req, 'intel', 60, 60_000);
  if (blocked) return blocked;
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (q.length > 80) return errorJson('Search text too long', 400);

  const store = await readStore();
  const latest = store.briefings[0] ?? null;
  const intel = await getIntel(false).catch(() => null);

  // Actors and techniques mentioned in the latest briefing.
  const seen = new Map<string, { name: string; source: string; id?: string; url?: string; ttpProfileUrl?: string; stories: { id: string; title: string }[] }>();
  const techs = new Map<string, { id: string; name: string; url: string; stories: number }>();
  for (const s of latest?.stories ?? []) {
    for (const a of s.intel?.actors ?? []) {
      const e = seen.get(a.name) ?? { name: a.name, source: a.source, id: a.id, url: a.url, ttpProfileUrl: a.ttpProfileUrl, stories: [] };
      e.stories.push({ id: s.id, title: s.title });
      seen.set(a.name, e);
    }
    for (const t of s.intel?.techniques ?? []) {
      const e = techs.get(t.id) ?? { ...t, stories: 0 };
      e.stories++;
      techs.set(t.id, e);
    }
  }

  let result = null;
  if (q && intel) {
    const found = lookupIntel(q, intel.index);
    if (found) {
      const related = (latest?.stories ?? [])
        .filter((s) =>
          found.kind === 'technique'
            ? s.intel?.techniques.some((t) => t.id === found.technique.id)
            : found.kind === 'actor'
              ? s.intel?.actors.some((a) => found.groups.some((gr) => gr.name === a.name))
              : found.software.some((sw) => sw.aliases.some((al) => `${s.title} ${s.summary}`.toLowerCase().includes(al.toLowerCase()))),
        )
        .map((s) => ({ id: s.id, title: s.title, url: s.url }));
      result = { ...found, related };
    }
  }

  return json({
    loaded: Boolean(intel),
    builtAt: intel?.index.builtAt ?? null,
    status: intel?.index.status ?? null,
    counts: intel ? { groups: intel.index.groups.length, techniques: intel.index.techniques.length, profiles: Object.keys(intel.index.profiles).length } : null,
    actorsToday: [...seen.values()].sort((a, b) => b.stories.length - a.stories.length),
    techniquesToday: [...techs.values()].sort((a, b) => b.stories - a.stories),
    toolbox: TOOLBOX_LINKS,
    query: q || null,
    result,
  });
}
