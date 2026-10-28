// Tests for patch 10: Threat Graph (entities, links, trends, outlook, questions, layout).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSoftwareMatcher, buildThreatGraph, canonicalVendor, describeNode, findNode, neighbors, relationFor, storyEntities, vendorsInText, weeklyOutlook, whoTargets, type GraphStory } from '../lib/threatGraph';
import { layoutGraph } from '../lib/graphLayout';
import { graphOutlookReply, graphQueryReply } from '../lib/graphAnswers';
import { routeIntent } from '../lib/assistantRouter';

const NOW = new Date('2026-10-18T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const sw = buildSoftwareMatcher([
  { name: 'Cobalt Strike', aliases: ['Cobalt Strike', 'Beacon'], url: 'https://attack.mitre.org/software/S0154' },
  { name: 'qakbot', aliases: ['QakBot', 'Qbot'] },
  { name: 'Agent', aliases: ['agent'] },
]);

function st(id: string, d: number, title: string, extra: Partial<GraphStory> = {}): GraphStory {
  return { id, url: `https://n.example/${id}`, title, source: 'Src', publishedAt: daysAgo(d), summary: '', ...extra };
}
const LB = { actors: [{ name: 'LockBit', source: 'MISP galaxy' as const, matchedAlias: 'LockBit' }], techniques: [] };
const KEV = { cveID: 'CVE-2024-3400', vendorProject: 'Palo Alto Networks', product: 'PAN-OS', vulnerabilityName: 'x', dateAdded: '2024-04-12', shortDescription: '', requiredAction: '', dueDate: '2024-04-19', knownRansomwareCampaignUse: 'Known' };

const STORIES: GraphStory[] = [
  st('1', 1, 'LockBit exploits CVE-2024-3400 in Palo Alto GlobalProtect', { intel: LB, cves: ['CVE-2024-3400'], kev: KEV, priority: 'critical' }),
  st('2', 2, 'LockBit affiliates drop Cobalt Strike after PAN-OS break-in', { intel: LB }),
  st('3', 3, 'LockBit hits hospital using Cobalt Strike beacons', { intel: LB }),
  st('4', 10, 'QakBot returns with Microsoft OneNote lures'),
  st('5', 9, 'Old LockBit story', { intel: LB }),
  st('6', 60, 'Too old for 30 days: Fortinet bug', {}),
  st('1', 1, 'duplicate copy without intel'),
];

test('vendors are recognised and KEV vendor names are made canonical', () => {
  assert.deepEqual(vendorsInText('Patch for Palo Alto GlobalProtect and Windows'), ['Microsoft', 'Palo Alto Networks']);
  assert.deepEqual(vendorsInText('the outlook for words like apachee and windowsill'), []);
  assert.equal(canonicalVendor('Microsoft Corporation'), 'Microsoft');
  assert.equal(canonicalVendor('Fortinet'), 'Fortinet');
  assert.equal(canonicalVendor('Acme Widgets'), 'Acme Widgets');
});

test('software matcher uses whole words and skips common words', () => {
  assert.deepEqual(sw.find('Attackers used Cobalt Strike and QBot.').map((s) => s.name), ['Cobalt Strike', 'qakbot']);
  assert.deepEqual(sw.find('The agent asked for a beacon of hope'), []);
  assert.deepEqual(sw.find('cobaltstrikes'), []);
});

test('entities from one story: actor, CVE (KEV), vendor, malware', () => {
  const e = storyEntities(STORIES[1], sw);
  assert.deepEqual(e.map((x) => `${x.type}:${x.label}`).sort(), ['actor:LockBit', 'malware:Cobalt Strike', 'vendor:Palo Alto Networks'].sort());
  const k = storyEntities(STORIES[0], sw);
  assert.ok(k.find((x) => x.type === 'cve')?.kev);
});

test('graph links things named in the same story, counts stories and trends, dedupes URLs', () => {
  const g = buildThreatGraph(STORIES, NOW, { days: 30, software: sw });
  assert.equal(g.storyCount, 5, 'duplicate URL merged, 60-day-old story excluded');
  const lb = findNode(g, 'lockbit')!;
  assert.equal(lb.stories, 4);
  assert.equal(lb.last7, 3);
  assert.equal(lb.prev7, 1);
  assert.equal(lb.trend, 'rising');
  const cs = neighbors(g, lb.id).find((n) => n.node.label === 'Cobalt Strike')!;
  assert.equal(cs.edge.weight, 2);
  assert.equal(cs.edge.relation, 'uses');
  assert.equal(cs.edge.evidence[0].url, 'https://n.example/2', 'newest evidence first');
  const cve = findNode(g, 'CVE-2024-3400')!;
  assert.equal(cve.kev, true);
  assert.equal(cve.critical, true);
  assert.equal(neighbors(g, cve.id).find((n) => n.node.type === 'vendor')?.edge.relation, 'affects');
  assert.equal(findNode(g, 'fortinet'), null);
  assert.equal(findNode(g, 'qbot')?.label ?? findNode(g, 'qakbot')?.label, 'Qakbot');
});

test('relations read naturally in both directions', () => {
  assert.equal(relationFor('cve', 'actor'), 'exploits');
  assert.equal(relationFor('vendor', 'malware'), 'targets');
  assert.equal(relationFor('vendor', 'cve'), 'affects');
});

test('weekly outlook is built from real week-on-week trends', () => {
  const g = buildThreatGraph(STORIES, NOW, { days: 30, software: sw });
  const o = weeklyOutlook(g);
  assert.ok(o.bullets.some((b) => /Most active group this week: LockBit \(3 stories, was 1\)/.test(b)));
  assert.ok(o.bullets.some((b) => /CVE-2024-3400/.test(b)));
  assert.match(o.headline, /trends, not predictions/);
  const empty = weeklyOutlook(buildThreatGraph([], NOW));
  assert.equal(empty.bullets.length, 0);
  assert.match(empty.headline, /not enough connected data/);
});

test('who targets a vendor, and describe a node with evidence', () => {
  const g = buildThreatGraph(STORIES, NOW, { days: 30, software: sw });
  const r = whoTargets(g, 'palo alto');
  assert.equal(r.vendor?.label, 'Palo Alto Networks');
  assert.deepEqual(r.list.map((x) => x.node.label), ['LockBit']);
  const d = describeNode(g, findNode(g, 'lockbit')!);
  assert.match(d.summary, /appears in 4 stories in the last 30 days, and it is rising \(3 stories this week vs 1/);
  assert.ok(d.sections.some((s) => s.heading === 'Malware & tools' && s.bullets[0].startsWith('Cobalt Strike — uses (2 stories)')));
  assert.ok(d.evidence.length >= 3);
});

test('big graphs are trimmed to the most important nodes', () => {
  const many = Array.from({ length: 50 }, (_, i) => st(`m${i}`, 2, `CVE-2026-${1000 + i} and CVE-2026-${2000 + i} in Microsoft`));
  const g = buildThreatGraph(many, NOW, { maxNodes: 20 });
  assert.equal(g.nodes.length, 20);
  assert.ok(g.nodes.some((n) => n.label === 'Microsoft'), 'the most-mentioned node is kept');
  assert.ok(g.edges.every((e) => g.nodes.some((n) => n.id === e.a) && g.nodes.some((n) => n.id === e.b)));
});

test('layout is deterministic, finite and keeps linked nodes closer', () => {
  const g = buildThreatGraph(STORIES, NOW, { days: 30, software: sw });
  const a = layoutGraph(g.nodes, g.edges);
  const b = layoutGraph(g.nodes, g.edges);
  assert.deepEqual([...a.entries()], [...b.entries()]);
  for (const p of a.values()) assert.ok(p.every(Number.isFinite));
  const dist = (x: string, y: string) => Math.hypot(...a.get(x)!.map((v, i) => v - a.get(y)![i]));
  const lb = findNode(g, 'lockbit')!.id;
  const cs = findNode(g, 'cobalt strike')!.id;
  const far = g.nodes.filter((n) => !neighbors(g, lb).some((x) => x.node.id === n.id) && n.id !== lb);
  if (far.length) assert.ok(dist(lb, cs) < Math.max(...far.map((n) => dist(lb, n.id))));
});

test('voice questions route to the graph', () => {
  assert.deepEqual(routeIntent("what's the threat outlook this week?"), { type: 'outlook' });
  assert.deepEqual(routeIntent("what's trending"), { type: 'outlook' });
  assert.deepEqual(routeIntent('Which groups are targeting Microsoft?'), { type: 'graph', mode: 'targets', query: 'microsoft', nodeType: 'actor' });
  assert.deepEqual(routeIntent('which malware is hitting fortinet this week'), { type: 'graph', mode: 'targets', query: 'fortinet', nodeType: 'malware' });
  assert.deepEqual(routeIntent("Hey Siva, what's connected to LockBit?"), { type: 'graph', mode: 'connected', query: 'lockbit', nodeType: 'actor' });
  assert.deepEqual(routeIntent('what is linked to CVE-2024-3400'), { type: 'graph', mode: 'connected', query: 'cve-2024-3400', nodeType: 'actor' });
  assert.deepEqual(routeIntent('open the threat graph'), { type: 'navigate', view: 'graph' });
  assert.equal(routeIntent('Explain CVE-2024-3400').type, 'cve');
});

test('graph answers speak the key facts, list evidence, and offer to open the graph', () => {
  const g = buildThreatGraph(STORIES, NOW, { days: 30, software: sw });
  const out = graphOutlookReply(g, 'boss');
  assert.match(out.speech, /^Here is this week's threat outlook, boss\. Most active group this week: LockBit/);
  assert.match(out.speech, /not predictions/);
  const t = graphQueryReply(g, { type: 'graph', mode: 'targets', query: 'palo alto', nodeType: 'actor' }, 'boss');
  assert.equal(t.card?.title, 'Hacker groups linked to Palo Alto Networks');
  assert.match(t.card!.summary, /not proof of an attack/);
  assert.ok(t.card?.graphFocus?.startsWith('vendor:'));
  const c = graphQueryReply(g, { type: 'graph', mode: 'connected', query: 'lockbit', nodeType: 'actor' }, 'boss');
  assert.equal(c.card?.title, 'What’s connected to LockBit');
  assert.ok(c.card!.sources.some((s) => s.url === 'https://n.example/1'));
  const miss = graphQueryReply(g, { type: 'graph', mode: 'connected', query: 'nonexistent gang', nodeType: 'actor' }, 'boss');
  assert.match(miss.speech, /does not appear/);
});
