// Threat Graph: "connect the dots" across everything Siva has read.
// Nodes are real things named in the stories — hacker groups, malware, CVEs, vendors, ATT&CK techniques.
// Two things are linked when the same story mentions both; every link keeps the stories that prove it.
// Nothing is simulated or predicted: trends compare the last 7 days with the 7 days before.
// Pure functions (no network), so it is fast, free and fully testable.
import type { Story } from './types';

export type NodeType = 'actor' | 'malware' | 'cve' | 'vendor' | 'technique';

export interface GraphEvidence {
  title: string;
  url: string;
  source: string;
  date: string;
  storyId?: string;
}

export interface GraphNode {
  id: string; // `${type}:${key}`
  type: NodeType;
  label: string;
  url?: string; // reference page (MITRE, NVD, …)
  stories: number; // how many distinct stories mention it
  last7: number; // stories in the last 7 days
  prev7: number; // stories in the 7 days before that
  trend: 'new' | 'rising' | 'steady' | 'falling';
  firstSeen: string;
  lastSeen: string;
  kev?: boolean; // CVE confirmed exploited (CISA KEV)
  critical?: boolean; // appears in a critical-priority story
  degree: number; // number of links
}

export interface GraphEdge {
  id: string;
  a: string; // node id
  b: string;
  relation: string; // plain words: "exploits", "targets", "uses", "affects", "linked with"
  weight: number; // number of stories that mention both
  evidence: GraphEvidence[]; // newest first, capped
}

export interface ThreatGraph {
  builtAt: string;
  days: number;
  storyCount: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** The fields of a story the graph needs (works for briefing stories and feed-log rows). */
export type GraphStory = Pick<Story, 'title' | 'url' | 'source'> &
  Partial<Pick<Story, 'id' | 'summary' | 'snippet' | 'cves' | 'kev' | 'intel' | 'publishedAt' | 'firstSeenAt' | 'retrievedAt' | 'priority'>>;

export interface SoftwareRef {
  name: string;
  aliases: string[];
  url?: string;
}

// ---------- Vendors ----------

/** Canonical vendor names and the words that identify them. Order matters only for display. */
export const VENDORS: { name: string; match: string[] }[] = [
  { name: 'Microsoft', match: ['microsoft', 'windows', 'exchange server', 'sharepoint', 'azure', 'entra', 'office 365', 'microsoft 365', 'microsoft outlook', 'microsoft teams', 'hyper-v'] },
  { name: 'Google', match: ['google', 'chrome', 'chromium', 'android', 'gmail', 'google cloud'] },
  { name: 'Apple', match: ['apple', 'ios', 'ipados', 'macos', 'safari', 'iphone', 'webkit'] },
  { name: 'Cisco', match: ['cisco', 'webex', 'ios xe', 'asa firewall'] },
  { name: 'Fortinet', match: ['fortinet', 'fortigate', 'fortios', 'fortimanager', 'fortiweb', 'forticlient', 'fortisiem'] },
  { name: 'Palo Alto Networks', match: ['palo alto networks', 'palo alto', 'pan-os', 'globalprotect', 'cortex xdr'] },
  { name: 'Ivanti', match: ['ivanti', 'connect secure', 'pulse secure', 'endpoint manager mobile', 'epmm'] },
  { name: 'Citrix', match: ['citrix', 'netscaler'] },
  { name: 'VMware', match: ['vmware', 'esxi', 'vcenter', 'broadcom vmware'] },
  { name: 'Oracle', match: ['oracle', 'weblogic', 'e-business suite', 'java se'] },
  { name: 'SAP', match: ['sap netweaver', 'sap '] },
  { name: 'Atlassian', match: ['atlassian', 'confluence', 'jira', 'bitbucket'] },
  { name: 'Adobe', match: ['adobe', 'acrobat', 'coldfusion', 'magento'] },
  { name: 'Juniper', match: ['juniper', 'junos'] },
  { name: 'SonicWall', match: ['sonicwall'] },
  { name: 'F5', match: ['f5 big-ip', 'big-ip', 'f5 networks'] },
  { name: 'Check Point', match: ['check point'] },
  { name: 'Zyxel', match: ['zyxel'] },
  { name: 'D-Link', match: ['d-link', 'dlink'] },
  { name: 'TP-Link', match: ['tp-link', 'tplink'] },
  { name: 'Apache', match: ['apache', 'tomcat', 'struts', 'log4j', 'log4shell', 'activemq'] },
  { name: 'Linux', match: ['linux kernel', 'linux'] },
  { name: 'WordPress', match: ['wordpress'] },
  { name: 'Salesforce', match: ['salesforce'] },
  { name: 'Okta', match: ['okta'] },
  { name: 'CrowdStrike', match: ['crowdstrike'] },
  { name: 'Veeam', match: ['veeam'] },
  { name: 'SolarWinds', match: ['solarwinds'] },
  { name: 'Progress Software', match: ['progress software', 'moveit', 'ws_ftp', 'telerik'] },
  { name: 'GitLab', match: ['gitlab'] },
  { name: 'GitHub', match: ['github'] },
  { name: 'Jenkins', match: ['jenkins'] },
  { name: 'Docker', match: ['docker'] },
  { name: 'Kubernetes', match: ['kubernetes'] },
  { name: 'Amazon Web Services', match: ['amazon web services', 'aws'] },
  { name: 'Cloudflare', match: ['cloudflare'] },
  { name: 'Samsung', match: ['samsung'] },
  { name: 'Qualcomm', match: ['qualcomm'] },
  { name: 'Intel', match: ['intel cpu', 'intel processors', 'intel corporation'] },
  { name: 'NVIDIA', match: ['nvidia'] },
  { name: 'Zoho', match: ['zoho', 'manageengine'] },
  { name: 'Synology', match: ['synology'] },
  { name: 'QNAP', match: ['qnap'] },
  { name: 'Mozilla', match: ['mozilla', 'firefox', 'thunderbird'] },
  { name: 'OpenAI', match: ['openai', 'chatgpt'] },
  { name: 'Zimbra', match: ['zimbra'] },
  { name: 'Roundcube', match: ['roundcube'] },
  { name: 'Craft CMS', match: ['craft cms'] },
  { name: 'Commvault', match: ['commvault'] },
  { name: 'SimpleHelp', match: ['simplehelp'] },
  { name: 'BeyondTrust', match: ['beyondtrust'] },
  { name: 'ConnectWise', match: ['connectwise', 'screenconnect'] },
  { name: 'Kaseya', match: ['kaseya'] },
];

const vendorAlias = new Map<string, string>();
for (const v of VENDORS) {
  vendorAlias.set(v.name.toLowerCase(), v.name);
  for (const m of v.match) vendorAlias.set(m.trim(), v.name);
}

/** Map a CISA KEV vendorProject ("Palo Alto Networks", "Microsoft Corporation") to a canonical vendor name. */
export function canonicalVendor(raw: string): string {
  const r = raw.toLowerCase().replace(/\b(inc|corp|corporation|ltd|llc|co)\.?$/g, '').trim();
  if (vendorAlias.has(r)) return vendorAlias.get(r)!;
  for (const v of VENDORS) if (v.match.some((m) => m.trim().length >= 4 && r.includes(m.trim()))) return v.name;
  return raw.trim();
}

function wordHit(hay: string, phrase: string): boolean {
  const p = phrase.trim().toLowerCase();
  if (!p) return false;
  const i = hay.indexOf(p);
  if (i < 0) return false;
  // whole-word check on both ends (hay is padded with spaces)
  let at = i;
  while (at >= 0) {
    const before = hay[at - 1] ?? ' ';
    const after = hay[at + p.length] ?? ' ';
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
    at = hay.indexOf(p, at + 1);
  }
  return false;
}

export function vendorsInText(text: string): string[] {
  const hay = ` ${text.toLowerCase()} `;
  const out: string[] = [];
  for (const v of VENDORS) if (v.match.some((m) => wordHit(hay, m))) out.push(v.name);
  return out;
}

// ---------- Malware / tools ----------

// Common words that also happen to be malware or tool names; matching them causes false links.
const SOFTWARE_STOP = new Set(
  'agent beacon office shell windows update chrome cloud mail email server client loader backdoor dropper stealer ransomware trojan worm virus rat bot botnet android linux apple microsoft google remote admin system service network security monitor phantom ghost spider shadow storm hydra cobra viper raven falcon eagle hunter rover bandit pirate vulnerability exploit patch attack attacks hackers group report campaign active users data files access login password play hive cuba nova vice royal snake black blue white mars luna zeus2 echo iris lynx moon star code data user host node core edge gate link mesh port root sync wave'.split(' '),
);

export interface SoftwareMatcher {
  find(text: string): SoftwareRef[];
}

/** Build a whole-word matcher from ATT&CK software + Malpedia names (skips short/common words). */
export function buildSoftwareMatcher(list: SoftwareRef[]): SoftwareMatcher {
  const entries: { phrase: string; ref: SoftwareRef }[] = [];
  const seen = new Set<string>();
  for (const sw of list) {
    for (const a of [sw.name, ...sw.aliases]) {
      const p = a.toLowerCase().replace(/[^a-z0-9.\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
      // Short names only when they are styled like a name (QBot, njRAT), never plain words.
      const styled = /[a-z]/.test(a) && (/^[A-Z]/.test(a) || /\d/.test(a));
      if ((p.length < 5 && !(p.length >= 4 && styled)) || SOFTWARE_STOP.has(p) || seen.has(p) || /^\d+$/.test(p)) continue;
      seen.add(p);
      entries.push({ phrase: p, ref: sw });
    }
  }
  entries.sort((x, y) => y.phrase.length - x.phrase.length);
  return {
    find(text: string) {
      const hay = ` ${text.toLowerCase().replace(/[^a-z0-9.\- ]+/g, ' ').replace(/\s+/g, ' ')} `;
      const out: SoftwareRef[] = [];
      for (const e of entries) {
        if (out.includes(e.ref)) continue;
        if (wordHit(hay, e.phrase)) out.push(e.ref);
        if (out.length >= 4) break;
      }
      return out;
    },
  };
}

// ---------- Entity extraction ----------

export interface Entity {
  type: NodeType;
  key: string;
  label: string;
  url?: string;
  kev?: boolean;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

export function storyEntities(s: GraphStory, software?: SoftwareMatcher): Entity[] {
  const text = `${s.title} ${s.summary ?? ''} ${s.snippet ?? ''}`;
  const out = new Map<string, Entity>();
  const add = (e: Entity) => {
    const id = `${e.type}:${e.key}`;
    const prev = out.get(id);
    if (!prev) out.set(id, e);
    else if (e.kev) prev.kev = true;
  };
  for (const a of s.intel?.actors ?? []) add({ type: 'actor', key: norm(a.name), label: a.name, url: a.url });
  for (const t of s.intel?.techniques ?? []) add({ type: 'technique', key: t.id.toLowerCase(), label: `${t.id} ${t.name}`, url: t.url });
  const cves = new Set([...(s.cves ?? []), ...(text.match(/CVE-\d{4}-\d{4,7}/gi) ?? []).map((c) => c.toUpperCase())]);
  for (const c of [...cves].slice(0, 8)) add({ type: 'cve', key: c.toLowerCase(), label: c, url: `https://nvd.nist.gov/vuln/detail/${c}`, kev: s.kev?.cveID === c });
  if (s.kev) {
    add({ type: 'cve', key: s.kev.cveID.toLowerCase(), label: s.kev.cveID, url: `https://nvd.nist.gov/vuln/detail/${s.kev.cveID}`, kev: true });
    add({ type: 'vendor', key: norm(canonicalVendor(s.kev.vendorProject)), label: canonicalVendor(s.kev.vendorProject) });
  }
  for (const v of vendorsInText(text)) add({ type: 'vendor', key: norm(v), label: v });
  if (software) {
    const actorKeys = new Set([...out.values()].filter((e) => e.type === 'actor').map((e) => e.key));
    for (const sw of software.find(text)) {
      const key = norm(sw.name);
      if (actorKeys.has(key)) continue; // ransomware gangs are often both a group and a malware name
      add({ type: 'malware', key, label: prettyName(sw.name), url: sw.url });
    }
  }
  return [...out.values()];
}

function prettyName(n: string): string {
  return /[A-Z]/.test(n) ? n : n.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// ---------- Relations ----------

const REL: Record<string, string> = {
  'actor|cve': 'exploits',
  'actor|malware': 'uses',
  'actor|technique': 'uses technique',
  'actor|vendor': 'targets',
  'cve|malware': 'exploited by',
  'cve|technique': 'linked with',
  'cve|vendor': 'affects',
  'malware|technique': 'uses technique',
  'malware|vendor': 'targets',
  'technique|vendor': 'used against',
  'actor|actor': 'seen with',
  'malware|malware': 'seen with',
  'cve|cve': 'chained with',
  'vendor|vendor': 'mentioned with',
  'technique|technique': 'used with',
};

export function relationFor(a: NodeType, b: NodeType): string {
  const k = [a, b].sort().join('|');
  return REL[k] ?? 'linked with';
}

const DAY = 86_400_000;

function storyDate(s: GraphStory): string {
  return s.publishedAt || s.firstSeenAt || s.retrievedAt || new Date(0).toISOString();
}

const TYPE_WEIGHT: Record<NodeType, number> = { actor: 3, malware: 2.5, cve: 2.2, vendor: 1.2, technique: 1.5 };

/**
 * Build the graph from stories (duplicates by URL are merged). Only stories within `days` are used.
 * Big graphs are trimmed to the most important `maxNodes` nodes so the 3D view stays readable.
 */
export function buildThreatGraph(input: GraphStory[], now: Date, opts: { days?: number; software?: SoftwareMatcher; maxNodes?: number; maxEvidence?: number } = {}): ThreatGraph {
  const days = opts.days ?? 30;
  const maxNodes = opts.maxNodes ?? 160;
  const maxEvidence = opts.maxEvidence ?? 6;
  const since = now.getTime() - days * DAY;
  const wk = now.getTime() - 7 * DAY;
  const wk2 = now.getTime() - 14 * DAY;

  const byUrl = new Map<string, GraphStory>();
  for (const s of input) {
    if (!s.url) continue;
    const t = Date.parse(storyDate(s));
    if (!Number.isFinite(t) || t < since || t > now.getTime() + DAY) continue;
    const prev = byUrl.get(s.url);
    // Prefer the richest copy (one with intel / KEV / summary).
    if (!prev || (s.intel && !prev.intel) || (s.kev && !prev.kev) || ((s.summary?.length ?? 0) > (prev.summary?.length ?? 0))) byUrl.set(s.url, { ...prev, ...s });
  }

  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  for (const s of byUrl.values()) {
    const date = storyDate(s);
    const t = Date.parse(date);
    const ents = storyEntities(s, opts.software);
    if (!ents.length) continue;
    const ev: GraphEvidence = { title: s.title, url: s.url, source: s.source, date, storyId: s.id };
    for (const e of ents) {
      const id = `${e.type}:${e.key}`;
      let n = nodes.get(id);
      if (!n) {
        n = { id, type: e.type, label: e.label, url: e.url, stories: 0, last7: 0, prev7: 0, trend: 'steady', firstSeen: date, lastSeen: date, degree: 0 };
        nodes.set(id, n);
      }
      n.stories++;
      if (t >= wk) n.last7++;
      else if (t >= wk2) n.prev7++;
      if (date < n.firstSeen) n.firstSeen = date;
      if (date > n.lastSeen) n.lastSeen = date;
      if (e.kev) n.kev = true;
      if (s.priority === 'critical') n.critical = true;
      if (!n.url && e.url) n.url = e.url;
    }
    // Link every pair in the story (capped so one long round-up article cannot connect everything).
    const linkable = ents.slice(0, 10);
    for (let i = 0; i < linkable.length; i++) {
      for (let j = i + 1; j < linkable.length; j++) {
        const x = `${linkable[i].type}:${linkable[i].key}`;
        const y = `${linkable[j].type}:${linkable[j].key}`;
        const [a, b] = x < y ? [x, y] : [y, x];
        const id = `${a}|${b}`;
        let e = edges.get(id);
        if (!e) {
          e = { id, a, b, relation: relationFor(nodes.get(a)!.type, nodes.get(b)!.type), weight: 0, evidence: [] };
          edges.set(id, e);
        }
        e.weight++;
        e.evidence.push(ev);
      }
    }
  }

  for (const n of nodes.values()) n.trend = n.stories === n.last7 && n.last7 > 0 && new Date(n.firstSeen).getTime() >= wk ? 'new' : n.last7 > n.prev7 ? 'rising' : n.last7 < n.prev7 ? 'falling' : 'steady';

  // Keep the most important nodes.
  const score = (n: GraphNode) => n.stories * TYPE_WEIGHT[n.type] + (n.kev ? 4 : 0) + (n.critical ? 2 : 0) + n.last7;
  const kept = new Set([...nodes.values()].sort((x, y) => score(y) - score(x)).slice(0, maxNodes).map((n) => n.id));
  const keptEdges = [...edges.values()]
    .filter((e) => kept.has(e.a) && kept.has(e.b))
    .map((e) => ({ ...e, evidence: e.evidence.sort((p, q) => q.date.localeCompare(p.date)).slice(0, maxEvidence) }))
    .sort((p, q) => q.weight - p.weight)
    .slice(0, maxNodes * 4);
  const keptNodes = [...nodes.values()].filter((n) => kept.has(n.id));
  const deg = new Map<string, number>();
  for (const e of keptEdges) {
    deg.set(e.a, (deg.get(e.a) ?? 0) + 1);
    deg.set(e.b, (deg.get(e.b) ?? 0) + 1);
  }
  for (const n of keptNodes) n.degree = deg.get(n.id) ?? 0;
  keptNodes.sort((x, y) => score(y) - score(x));
  return { builtAt: now.toISOString(), days, storyCount: byUrl.size, nodes: keptNodes, edges: keptEdges };
}

// ---------- Questions over the graph ----------

/** Find the node the user means ("lockbit", "CVE-2024-3400", "palo alto", "T1566"). */
export function findNode(graph: Pick<ThreatGraph, 'nodes'>, query: string): GraphNode | null {
  const q = query.trim().toLowerCase().replace(/[?.!]+$/, '');
  if (!q) return null;
  const nq = norm(q);
  const vendor = vendorAlias.get(q);
  const exact = graph.nodes.find((n) => n.label.toLowerCase() === q || n.id.endsWith(`:${nq}`) || (vendor && n.type === 'vendor' && n.label === vendor) || (n.type === 'technique' && n.label.toLowerCase().startsWith(`${q} `)));
  if (exact) return exact;
  const partial = graph.nodes.filter((n) => nq.length >= 3 && (norm(n.label).includes(nq) || (nq.length >= 5 && nq.includes(norm(n.label)) && norm(n.label).length >= 4)));
  return partial.sort((a, b) => b.stories - a.stories)[0] ?? null;
}

export interface Neighbor {
  node: GraphNode;
  edge: GraphEdge;
}

export function neighbors(graph: Pick<ThreatGraph, 'nodes' | 'edges'>, id: string, type?: NodeType): Neighbor[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const out: Neighbor[] = [];
  for (const e of graph.edges) {
    const other = e.a === id ? e.b : e.b === id ? e.a : null;
    if (!other) continue;
    const node = byId.get(other);
    if (node && (!type || node.type === type)) out.push({ node, edge: e });
  }
  return out.sort((x, y) => y.edge.weight - x.edge.weight || y.node.stories - x.node.stories);
}

export const TYPE_LABEL: Record<NodeType, string> = { actor: 'Hacker groups', malware: 'Malware & tools', cve: 'Vulnerabilities (CVEs)', vendor: 'Vendors & products', technique: 'Attack techniques' };
const TYPE_ONE: Record<NodeType, string> = { actor: 'hacker group', malware: 'malware or tool', cve: 'vulnerability', vendor: 'vendor', technique: 'attack technique' };

/** Plain-English description of one node and its strongest connections. */
export function describeNode(graph: ThreatGraph, n: GraphNode): { summary: string; sections: { heading: string; bullets: string[] }[]; evidence: GraphEvidence[] } {
  const nb = neighbors(graph, n.id);
  const trendWord = n.trend === 'new' ? 'new this week' : n.trend === 'rising' ? `rising (${n.last7} stories this week vs ${n.prev7} the week before)` : n.trend === 'falling' ? `quieter (${n.last7} this week vs ${n.prev7} before)` : `steady (${n.last7} this week)`;
  const summary =
    `${n.label} is a ${TYPE_ONE[n.type]} that appears in ${n.stories} stor${n.stories === 1 ? 'y' : 'ies'} in the last ${graph.days} days, and it is ${trendWord}.` +
    (n.kev ? ' CISA confirms it is being exploited in the wild.' : '') +
    (nb.length ? ` It is most often mentioned together with ${nb.slice(0, 3).map((x) => x.node.label).join(', ')}.` : ' It has no links to other items yet.');
  const sections: { heading: string; bullets: string[] }[] = [];
  for (const t of ['actor', 'malware', 'cve', 'vendor', 'technique'] as NodeType[]) {
    const group = nb.filter((x) => x.node.type === t).slice(0, 6);
    if (group.length) sections.push({ heading: TYPE_LABEL[t], bullets: group.map((x) => `${x.node.label} — ${x.edge.relation === 'linked with' ? 'linked' : x.edge.relation} (${x.edge.weight} stor${x.edge.weight === 1 ? 'y' : 'ies'})${x.node.kev ? ' · exploited (KEV)' : ''}`) });
  }
  const evidence = dedupeEvidence(nb.flatMap((x) => x.edge.evidence)).slice(0, 8);
  return { summary, sections, evidence };
}

export function dedupeEvidence(list: GraphEvidence[]): GraphEvidence[] {
  const seen = new Set<string>();
  return list.filter((e) => (seen.has(e.url) ? false : (seen.add(e.url), true))).sort((a, b) => b.date.localeCompare(a.date));
}

export interface Outlook {
  headline: string;
  rising: { type: NodeType; items: GraphNode[] }[];
  newThisWeek: GraphNode[];
  mostConnected: GraphNode[];
  strongestLinks: { a: GraphNode; b: GraphNode; edge: GraphEdge }[];
  bullets: string[];
}

/** Weekly threat outlook built ONLY from real trends in the graph (no prediction, no AI needed). */
export function weeklyOutlook(graph: ThreatGraph): Outlook {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const risingScore = (n: GraphNode) => n.last7 - n.prev7 + (n.kev ? 1 : 0);
  const rising = (['actor', 'malware', 'cve', 'vendor', 'technique'] as NodeType[])
    .map((type) => ({ type, items: graph.nodes.filter((n) => n.type === type && (n.trend === 'rising' || n.trend === 'new') && n.last7 >= 1).sort((a, b) => risingScore(b) - risingScore(a) || b.last7 - a.last7).slice(0, 5) }))
    .filter((g) => g.items.length);
  const newThisWeek = graph.nodes.filter((n) => n.trend === 'new' && (n.type === 'actor' || n.type === 'malware' || (n.type === 'cve' && n.kev))).slice(0, 6);
  const mostConnected = [...graph.nodes].sort((a, b) => b.degree - a.degree || b.stories - a.stories).slice(0, 5);
  const strongestLinks = graph.edges
    .filter((e) => {
      const ta = byId.get(e.a)?.type;
      const tb = byId.get(e.b)?.type;
      return ta !== tb && e.weight >= 2;
    })
    .slice(0, 5)
    .map((edge) => ({ a: byId.get(edge.a)!, b: byId.get(edge.b)!, edge }));
  const bullets: string[] = [];
  const topActor = rising.find((r) => r.type === 'actor')?.items[0];
  const topCve = graph.nodes.filter((n) => n.type === 'cve' && n.kev && n.last7 > 0).sort((a, b) => b.last7 - a.last7)[0];
  const topVendor = rising.find((r) => r.type === 'vendor')?.items[0];
  if (topActor) bullets.push(`Most active group this week: ${topActor.label} (${topActor.last7} stories, was ${topActor.prev7}).`);
  if (topCve) bullets.push(`Exploited vulnerability in the news: ${topCve.label} (${topCve.last7} stories this week) — patch it if you use the product.`);
  if (topVendor) bullets.push(`Vendor under the most pressure: ${topVendor.label} (${topVendor.last7} stories this week, was ${topVendor.prev7}).`);
  for (const l of strongestLinks.slice(0, 2)) bullets.push(`Strong link: ${l.a.label} ${l.edge.relation} ${l.b.label} — seen in ${l.edge.weight} stories.`);
  if (newThisWeek.length) bullets.push(`New names this week: ${newThisWeek.map((n) => n.label).join(', ')}.`);
  const headline = bullets.length
    ? `This outlook is built from ${graph.storyCount} real stories over ${graph.days} days, comparing this week with last week. It shows trends, not predictions.`
    : `There is not enough connected data yet (${graph.storyCount} stories). It fills in as Siva reads more news.`;
  return { headline, rising, newThisWeek, mostConnected, strongestLinks, bullets };
}

/** "Which groups are targeting Microsoft?" → hacker groups linked to that vendor, strongest first. */
export function whoTargets(graph: ThreatGraph, vendorQuery: string, type: NodeType = 'actor'): { vendor: GraphNode | null; list: Neighbor[] } {
  const vendor = findNode({ nodes: graph.nodes.filter((n) => n.type === 'vendor' || n.type === 'cve') }, vendorQuery) ?? findNode(graph, vendorQuery);
  if (!vendor) return { vendor: null, list: [] };
  return { vendor, list: neighbors(graph, vendor.id, type) };
}
