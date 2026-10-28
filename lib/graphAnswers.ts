// Turn Threat Graph lookups into Siva's spoken + on-screen answers (pure, no AI needed).
import type { AnswerCard, AssistantReply, Citation } from './types';
import type { Intent } from './assistantRouter';
import { describeNode, findNode, TYPE_LABEL, weeklyOutlook, whoTargets, dedupeEvidence, type GraphEvidence, type ThreatGraph } from './threatGraph';

const TYPE_WORD = { actor: 'hacker groups', malware: 'malware families', cve: 'vulnerabilities' } as const;

function card(title: string, summary: string, sections: AnswerCard['sections'], evidence: GraphEvidence[], actions: string[] = []): AnswerCard {
  return {
    title,
    summary,
    sections,
    actions,
    sources: evidence.slice(0, 10).map((e) => ({ title: `${e.title} (${e.source})`, url: e.url, kind: e.storyId ? 'story' : 'link' })),
    usedWebSearch: false,
    steps: ['Connecting the dots in the Threat Graph'],
  };
}

function cites(evidence: GraphEvidence[]): Citation[] {
  return evidence.slice(0, 8).map((e) => ({ storyId: e.storyId ?? '', title: e.title, url: e.url }));
}

function done(intent: string, speech: string, c: AnswerCard, evidence: GraphEvidence[], focus?: string): AssistantReply {
  if (focus) c.graphFocus = focus;
  return { intent, speech, display: `${c.title}\n\n${c.summary}`, card: c, citations: cites(evidence), actions: [], aiStatus: 'ok' };
}

export function graphOutlookReply(graph: ThreatGraph, userTitle: string): AssistantReply {
  const o = weeklyOutlook(graph);
  const sections: AnswerCard['sections'] = [];
  if (o.bullets.length) sections.push({ heading: 'Key points', bullets: o.bullets });
  for (const r of o.rising) sections.push({ heading: `Rising: ${TYPE_LABEL[r.type]}`, bullets: r.items.map((n) => `${n.label}: ${n.last7} this week (was ${n.prev7})${n.trend === 'new' ? ' — new' : ''}${n.kev ? ' · exploited (KEV)' : ''}`) });
  if (o.mostConnected.length) sections.push({ heading: 'Most connected right now', bullets: o.mostConnected.map((n) => `${n.label} — ${n.degree} links across ${n.stories} stories`) });
  const evidence = dedupeEvidence(o.strongestLinks.flatMap((l) => l.edge.evidence)).slice(0, 8);
  const actions = o.bullets.length ? ['Check whether you use any of the rising vendors or vulnerabilities, and patch those first.', 'Open the Threat Graph to see the stories behind each link.'] : [];
  const c = card('Threat outlook — this week vs last week', o.headline, sections, evidence, actions);
  const speech = o.bullets.length ? `Here is this week's threat outlook, ${userTitle}. ${o.bullets.slice(0, 3).join(' ')} These are real trends from the news, not predictions. The details are on your screen.` : `${o.headline}`;
  return done('outlook', speech, c, evidence, 'outlook');
}

export function graphQueryReply(graph: ThreatGraph, intent: Extract<Intent, { type: 'graph' }>, userTitle: string): AssistantReply {
  if (intent.mode === 'targets') {
    const { vendor, list } = whoTargets(graph, intent.query, intent.nodeType);
    const word = TYPE_WORD[intent.nodeType];
    if (!vendor) {
      const c = card(`Nothing found for “${intent.query}”`, `I could not find “${intent.query}” in the stories from the last ${graph.days} days, so I cannot connect it to ${word} yet. Try a vendor or product name, like Microsoft, Fortinet or Ivanti.`, [], []);
      return done('graph', c.summary, c, []);
    }
    const evidence = dedupeEvidence(list.flatMap((x) => x.edge.evidence)).slice(0, 10);
    if (!list.length) {
      const c = card(`${word[0].toUpperCase()}${word.slice(1)} linked to ${vendor.label}`, `${vendor.label} appears in ${vendor.stories} stories in the last ${graph.days} days, but none of them name any ${word} together with it.`, [], []);
      return done('graph', c.summary, c, [], vendor.id);
    }
    const bullets = list.slice(0, 8).map((x) => `${x.node.label} — ${x.edge.relation} ${vendor.label} (${x.edge.weight} stor${x.edge.weight === 1 ? 'y' : 'ies'}, latest ${x.edge.evidence[0]?.date.slice(0, 10) ?? '?'})${x.node.kev ? ' · exploited (KEV)' : ''}`);
    const summary = `In the last ${graph.days} days, ${list.length} ${word} were named in the same stories as ${vendor.label}. The strongest link is ${list[0].node.label} (${list[0].edge.weight} stories). A shared story is evidence of a link, not proof of an attack — open the sources to check.`;
    const c = card(`${word[0].toUpperCase()}${word.slice(1)} linked to ${vendor.label}`, summary, [{ heading: 'Key points', bullets }], evidence, [`If you use ${vendor.label}, check its latest security advisories and patch exploited (KEV) issues first.`]);
    return done('graph', `${summary.split('. ').slice(0, 2).join('. ')}. The full list is on your screen, ${userTitle}.`, c, evidence, vendor.id);
  }
  const node = findNode(graph, intent.query);
  if (!node) {
    const c = card(`Nothing found for “${intent.query}”`, `“${intent.query}” does not appear in the stories from the last ${graph.days} days, so there is nothing to connect yet.`, [], []);
    return done('graph', c.summary, c, []);
  }
  const d = describeNode(graph, node);
  const c = card(`What’s connected to ${node.label}`, d.summary, d.sections, d.evidence, node.url ? [] : []);
  if (node.url) c.sources.unshift({ title: `Reference: ${node.label}`, url: node.url, kind: 'link' });
  return done('graph', `${d.summary} The full map is on your screen, ${userTitle}.`, c, d.evidence, node.id);
}
