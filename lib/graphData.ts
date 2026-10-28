// Server side: build the Threat Graph from Siva's saved briefings + live feed log, with a small cache.
import { readStore } from './store';
import { getIntel } from './intel';
import { buildSoftwareMatcher, buildThreatGraph, type GraphStory, type SoftwareMatcher, type ThreatGraph } from './threatGraph';

const g = globalThis as unknown as { __sivaGraph?: Map<string, ThreatGraph>; __sivaSw?: { builtAt: string; m: SoftwareMatcher } };

async function softwareMatcher(): Promise<SoftwareMatcher | undefined> {
  const intel = await getIntel(false).catch(() => null);
  if (!intel?.index.software?.length) return undefined;
  if (g.__sivaSw?.builtAt === intel.index.builtAt) return g.__sivaSw.m;
  const m = buildSoftwareMatcher(intel.index.software.map((s) => ({ name: s.name, aliases: s.aliases, url: s.url })));
  g.__sivaSw = { builtAt: intel.index.builtAt, m };
  return m;
}

export const GRAPH_DAYS = [7, 30, 90] as const;

export async function getThreatGraph(days = 30): Promise<ThreatGraph> {
  const d = GRAPH_DAYS.includes(days as (typeof GRAPH_DAYS)[number]) ? days : 30;
  const store = await readStore();
  const key = `${d}|${store.meta.lastRunAt ?? ''}|${store.feedLog.length}`;
  g.__sivaGraph ??= new Map();
  const hit = g.__sivaGraph.get(key);
  if (hit) return hit;
  const stories: GraphStory[] = [];
  for (const b of store.briefings) if (!b.isSample) stories.push(...b.stories);
  // Feed-log rows add the items that never made a top-60 briefing.
  for (const r of store.feedLog) stories.push({ title: r.title, url: r.url, source: r.source, summary: r.matter, cves: r.cves, publishedAt: r.publishedAt, firstSeenAt: r.firstSeenAt, priority: r.priority });
  const graph = buildThreatGraph(stories, new Date(), { days: d, software: await softwareMatcher() });
  g.__sivaGraph.clear(); // keep only the latest few
  g.__sivaGraph.set(key, graph);
  return graph;
}
