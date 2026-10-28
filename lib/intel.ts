// Threat-intel enrichment: links stories to known threat actors and ATT&CK techniques.
// Reference data (downloaded at most weekly, cached in data/intel-index.json):
//   - MITRE ATT&CK Enterprise STIX 2.1 (groups + techniques)         https://attack.mitre.org/
//   - MISP galaxy threat-actor and ransomware clusters (CC0)          https://github.com/MISP/misp-galaxy
//   - crocodyli/ThreatActors-TTPs folder list (we only LINK to it)    https://github.com/crocodyli/ThreatActors-TTPs
// Matching is automatic and can be wrong; the UI labels it "auto-detected".
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { IntelActor, IntelTechnique, StoryIntel } from './types';
import { ATTACK_STIX_URL, MISP_MALPEDIA_URL, MISP_RANSOMWARE_URL, MISP_THREAT_ACTOR_URL, TTP_PROFILES_API, TTP_PROFILES_WEB, getEnv } from './config';
import { bestFuzzyMatch, normalizeWord, type FuzzyCandidate } from './fuzzy';
import { fetchWithRetry, readTextLimited } from './http';

export interface IntelGroup {
  id?: string;
  name: string;
  aliases: string[];
  url?: string;
  description: string;
  country?: string;
  source: IntelActor['source'];
}

/** Malware families and attacker tools (MITRE ATT&CK software, MISP Malpedia). Used for lookups. */
export interface IntelSoftware {
  id?: string; // e.g. S0154
  name: string;
  aliases: string[];
  url?: string;
  description: string;
  kind: 'malware' | 'tool';
  source: 'MITRE ATT&CK' | 'Malpedia (MISP galaxy)';
}

export const INTEL_INDEX_VERSION = 3; // v3: technique mitigations + detection

export interface IntelIndex {
  version?: number;
  software?: IntelSoftware[];
  builtAt: string;
  groups: IntelGroup[]; // MITRE + MISP
  techniques: IntelTechniqueFull[];
  profiles: Record<string, string>; // normalised name -> crocodyli folder URL
  status: { attack: string; misp: string; profiles: string; malware?: string };
}

/** An ATT&CK technique with the defensive knowledge Siva explains (what it is, how to spot it, how to stop it). */
export type IntelTechniqueFull = IntelTechnique & {
  tactics: string[];
  description: string;
  /** MITRE mitigations ("M1032 Multi-factor Authentication: ..."). */
  mitigations?: { id: string; name: string; description: string }[];
  /** MITRE's detection guidance, when the data has it. */
  detection?: string;
  platforms?: string[];
};

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// ---------- Parsers (pure, tested) ----------

interface StixObject {
  id?: string;
  type?: string;
  relationship_type?: string;
  source_ref?: string;
  target_ref?: string;
  x_mitre_detection?: string;
  x_mitre_platforms?: string[];
  name?: string;
  aliases?: string[];
  x_mitre_aliases?: string[];
  description?: string;
  revoked?: boolean;
  x_mitre_deprecated?: boolean;
  external_references?: { source_name?: string; external_id?: string; url?: string }[];
  kill_chain_phases?: { phase_name?: string }[];
}

export function parseAttackStix(json: unknown): Pick<IntelIndex, 'groups' | 'techniques'> & { software: IntelSoftware[] } {
  const objects = (json as { objects?: StixObject[] })?.objects;
  if (!Array.isArray(objects)) throw new Error('ATT&CK data has an unexpected format');
  const groups: IntelGroup[] = [];
  const techniques: IntelIndex['techniques'] = [];
  const software: IntelSoftware[] = [];
  const stixToTech = new Map<string, IntelIndex['techniques'][number]>();
  const mitigationById = new Map<string, { id: string; name: string; description: string }>();
  const cleanText = (t: string | undefined, n: number) => clip((t ?? '').replace(/\(Citation:[^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim(), n);
  for (const o of objects) {
    if (!o || o.revoked || o.x_mitre_deprecated || typeof o.name !== 'string') continue;
    const ref = o.external_references?.find((r) => r.source_name === 'mitre-attack');
    if (!ref?.external_id) continue;
    const description = clip((o.description ?? '').replace(/\(Citation:[^)]*\)/g, '').replace(/\s+/g, ' ').trim(), 700);
    if (o.type === 'intrusion-set') {
      groups.push({ id: ref.external_id, name: o.name, aliases: [...new Set([o.name, ...(o.aliases ?? [])])], url: ref.url, description, source: 'MITRE ATT&CK' });
    } else if ((o.type === 'malware' || o.type === 'tool') && /^S\d{4}$/.test(ref.external_id)) {
      software.push({ id: ref.external_id, name: o.name, aliases: [...new Set([o.name, ...(o.x_mitre_aliases ?? [])])], url: ref.url, description, kind: o.type, source: 'MITRE ATT&CK' });
    } else if (o.type === 'course-of-action' && /^M\d{4}$/.test(ref.external_id) && o.id) {
      mitigationById.set(o.id, { id: ref.external_id, name: o.name, description: cleanText(o.description, 260) });
    } else if (o.type === 'attack-pattern' && /^T\d{4}(\.\d{3})?$/.test(ref.external_id)) {
      const t: IntelIndex['techniques'][number] = {
        id: ref.external_id,
        name: o.name,
        url: ref.url ?? `https://attack.mitre.org/techniques/${ref.external_id.replace('.', '/')}/`,
        tactics: (o.kill_chain_phases ?? []).map((k) => k.phase_name ?? '').filter(Boolean),
        description,
      };
      if (o.x_mitre_detection) t.detection = cleanText(o.x_mitre_detection, 500);
      if (o.x_mitre_platforms?.length) t.platforms = o.x_mitre_platforms.slice(0, 8);
      techniques.push(t);
      if (o.id) stixToTech.set(o.id, t);
    }
  }
  // Second pass: "course-of-action mitigates attack-pattern" relationships.
  for (const o of objects) {
    if (o?.type !== 'relationship' || o.relationship_type !== 'mitigates' || o.revoked || o.x_mitre_deprecated) continue;
    const m = o.source_ref ? mitigationById.get(o.source_ref) : undefined;
    const t = o.target_ref ? stixToTech.get(o.target_ref) : undefined;
    if (!m || !t) continue;
    t.mitigations ??= [];
    if (t.mitigations.length < 8 && !t.mitigations.some((x) => x.id === m.id)) t.mitigations.push(m);
  }
  return { groups, techniques, software };
}

/** Malpedia families from the MISP galaxy (value looks like "win.cobalt_strike" or a plain name). */
export function parseMalpediaCluster(json: unknown): IntelSoftware[] {
  return parseMispCluster(json).map((gr) => {
    const pretty = gr.name.includes('.') && /^[a-z]+\./.test(gr.name) ? gr.name.split('.').slice(1).join('.').replace(/_/g, ' ') : gr.name;
    return { name: pretty, aliases: [...new Set([pretty, ...gr.aliases])], url: gr.url, description: gr.description, kind: 'malware' as const, source: 'Malpedia (MISP galaxy)' as const };
  });
}

export function parseMispCluster(json: unknown): IntelGroup[] {
  const values = (json as { values?: unknown })?.values;
  if (!Array.isArray(values)) throw new Error('MISP cluster has an unexpected format');
  const out: IntelGroup[] = [];
  for (const v of values as { value?: unknown; description?: unknown; meta?: { synonyms?: unknown; country?: unknown; refs?: unknown } }[]) {
    if (typeof v?.value !== 'string') continue;
    const synonyms = Array.isArray(v.meta?.synonyms) ? (v.meta!.synonyms as unknown[]).filter((s): s is string => typeof s === 'string') : [];
    const refs = Array.isArray(v.meta?.refs) ? (v.meta!.refs as unknown[]).filter((s): s is string => typeof s === 'string' && /^https?:\/\//.test(s)) : [];
    out.push({
      name: v.value,
      aliases: [...new Set([v.value, ...synonyms])],
      url: refs[0],
      description: clip(typeof v.description === 'string' ? v.description.replace(/\s+/g, ' ') : '', 700),
      country: typeof v.meta?.country === 'string' ? v.meta.country : undefined,
      source: 'MISP galaxy',
    });
  }
  return out;
}

export function parseProfileListing(json: unknown): Record<string, string> {
  if (!Array.isArray(json)) throw new Error('GitHub listing has an unexpected format');
  const out: Record<string, string> = {};
  for (const e of json as { type?: string; name?: string }[]) {
    if (e?.type !== 'dir' || typeof e.name !== 'string' || e.name.startsWith('.') || /^commands?$/i.test(e.name)) continue;
    const url = `${TTP_PROFILES_WEB}/${encodeURIComponent(e.name)}`;
    out[norm(e.name)] = url;
    for (const part of e.name.split(/[-_ ]+/)) if (part.length >= 4) out[norm(part)] ??= url;
  }
  return out;
}

// ---------- Matching ----------

/** Short/common words that are also actor names: only count them with context ("Play ransomware"). */
const AMBIGUOUS = new Set(
  'play lead gold storm spider panda bear kitten silence magic shadow ghost scarlet ember iron cobalt carbon crystal energy equation charming hive royal black blue green cuba medusa akira nova money cactus hunters fancy cozy wizard spider dark angels babuk'.split(
    /\s+/,
  ),
);
const CONTEXT = '(?:\\s+(?:ransomware|group|gang|actor|hackers|operators|apt|threat))';

interface Matcher {
  alias: string;
  first: string;
  re: RegExp;
  group: IntelGroup;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildMatchers(groups: IntelGroup[]): Matcher[] {
  const out: Matcher[] = [];
  for (const group of groups) {
    for (const alias of group.aliases) {
      const a = alias.trim();
      if (a.length < 4 || a.length > 60) continue;
      const lower = a.toLowerCase();
      const allCaps = /^[A-Z]+$/.test(a) && a.length <= 8;
      const ambiguous = AMBIGUOUS.has(lower);
      const body = `(?<![\\w-])${escapeRe(a)}(?![\\w-])${ambiguous ? CONTEXT : ''}`;
      out.push({ alias: a, first: lower.split(/[^a-z0-9]+/)[0] || lower, re: new RegExp(body, allCaps ? '' : 'i'), group });
    }
  }
  return out;
}

export function matchIntel(text: string, index: Pick<IntelIndex, 'techniques' | 'profiles'>, matchers: Matcher[]): StoryIntel {
  const words = new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const found: { m: Matcher; keys: Set<string> }[] = [];
  for (const m of matchers) {
    if (!words.has(m.first) || !m.re.test(text)) continue;
    const keys = new Set(m.group.aliases.map(norm));
    // Same actor from MITRE and MISP? Keep the first (MITRE is listed first).
    if (found.some((f) => f.m.group === m.group || [...keys].some((k) => f.keys.has(k)))) continue;
    found.push({ m, keys });
  }
  const actors: IntelActor[] = found.slice(0, 6).map(({ m, keys }) => ({
    name: m.group.name,
    source: m.group.source,
    id: m.group.id,
    url: m.group.url,
    country: m.group.country,
    matchedAlias: m.alias,
    ttpProfileUrl: [...keys].map((k) => index.profiles[k]).find(Boolean),
  }));
  const techById = new Map(index.techniques.map((t) => [t.id, t]));
  const ids = [...new Set(text.match(/\bT\d{4}(?:\.\d{3})?\b/g) ?? [])];
  const techniques: IntelTechnique[] = ids
    .map((id) => techById.get(id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .slice(0, 12)
    .map(({ id, name, url }) => ({ id, name, url }));
  return { actors, techniques };
}

// ---------- Loading + caching ----------

const g = globalThis as unknown as { __sivaIntel?: { index: IntelIndex; matchers: Matcher[] } };
const WEEK = 7 * 86_400_000;

function cacheFile() {
  return path.join(getEnv().dataDir, 'intel-index.json');
}

async function download(url: string, maxBytes: number, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetchWithRetry(url, { headers: { 'user-agent': getEnv().userAgent, ...headers }, timeoutMs: 120_000 });
  return JSON.parse(await readTextLimited(res, maxBytes));
}

async function buildIndex(previous: IntelIndex | null): Promise<IntelIndex> {
  const index: IntelIndex = {
    builtAt: new Date().toISOString(),
    groups: [],
    techniques: previous?.techniques ?? [],
    profiles: previous?.profiles ?? {},
    status: { attack: 'not loaded', misp: 'not loaded', profiles: 'not loaded', malware: 'not loaded' },
    version: INTEL_INDEX_VERSION,
    software: previous?.software ?? [],
  };
  let attackSoftware = previous?.software?.filter((x) => x.source === 'MITRE ATT&CK') ?? [];
  let malpedia = previous?.software?.filter((x) => x.source !== 'MITRE ATT&CK') ?? [];
  let attackGroups = previous?.groups.filter((x) => x.source === 'MITRE ATT&CK') ?? [];
  let mispGroups = previous?.groups.filter((x) => x.source === 'MISP galaxy') ?? [];
  try {
    const attack = parseAttackStix(await download(ATTACK_STIX_URL, 300_000_000));
    attackGroups = attack.groups;
    attackSoftware = attack.software;
    index.techniques = attack.techniques;
    index.status.attack = `ok: ${attack.groups.length} groups, ${attack.techniques.length} techniques`;
  } catch (err) {
    index.status.attack = `failed (${(err as Error).message}); using ${attackGroups.length ? 'cached' : 'no'} data`;
  }
  try {
    const [actors, ransomware] = await Promise.all([download(MISP_THREAT_ACTOR_URL, 50_000_000), download(MISP_RANSOMWARE_URL, 50_000_000)]);
    mispGroups = [...parseMispCluster(actors), ...parseMispCluster(ransomware)];
    index.status.misp = `ok: ${mispGroups.length} actors/ransomware groups`;
  } catch (err) {
    index.status.misp = `failed (${(err as Error).message}); using ${mispGroups.length ? 'cached' : 'no'} data`;
  }
  try {
    index.profiles = parseProfileListing(await download(TTP_PROFILES_API, 5_000_000, { accept: 'application/vnd.github+json' }));
    index.status.profiles = `ok: ${Object.keys(index.profiles).length} profile names`;
  } catch (err) {
    index.status.profiles = `failed (${(err as Error).message})`;
  }
  try {
    malpedia = parseMalpediaCluster(await download(MISP_MALPEDIA_URL, 80_000_000));
    index.status.malware = `ok: ${attackSoftware.length} ATT&CK software, ${malpedia.length} Malpedia families`;
  } catch (err) {
    index.status.malware = `failed (${(err as Error).message}); using ${malpedia.length ? 'cached' : 'no'} Malpedia data`;
  }
  index.groups = [...attackGroups, ...mispGroups];
  index.software = [...attackSoftware, ...malpedia];
  // A failed download should be retried in ~6 hours, not after another full week.
  if (Object.values(index.status).some((s) => s.startsWith('failed'))) index.builtAt = new Date(Date.now() - WEEK + 6 * 3_600_000).toISOString();
  return index;
}

/** Load the intel index (from memory, disk, or by downloading if older than a week). */
export async function getIntel(allowDownload = true): Promise<{ index: IntelIndex; matchers: Matcher[] } | null> {
  if (!getEnv().enableIntel) return null;
  const mem = g.__sivaIntel;
  if (mem && (!allowDownload || Date.now() - Date.parse(mem.index.builtAt) < WEEK)) return mem;
  let disk: IntelIndex | null = null;
  try {
    disk = JSON.parse(await fs.readFile(cacheFile(), 'utf8')) as IntelIndex;
  } catch {
    disk = null;
  }
  let index = disk;
  if (!index && !allowDownload) return null; // not downloaded yet: the next refresh will do it
  const outdated = index && (index.version ?? 1) < INTEL_INDEX_VERSION;
  if (!index || (allowDownload && (outdated || Date.now() - Date.parse(index.builtAt) >= WEEK))) {
    index = await buildIndex(disk);
    if (index.groups.length || index.techniques.length) {
      await fs.mkdir(path.dirname(cacheFile()), { recursive: true });
      await fs.writeFile(cacheFile(), JSON.stringify(index), 'utf8');
    }
  }
  g.__sivaIntel = { index, matchers: buildMatchers(index.groups) };
  return g.__sivaIntel;
}

/** Look up an actor (by name/alias/G-id) or technique (by T-id or exact name). */
export function lookupIntel(query: string, index: IntelIndex) {
  const q = query.trim();
  const tech = /^T\d{4}(\.\d{3})?$/i.test(q)
    ? index.techniques.find((t) => t.id === q.toUpperCase())
    : index.techniques.find((t) => t.name.toLowerCase() === q.toLowerCase());
  if (tech) return { kind: 'technique' as const, technique: tech };
  const nq = norm(q);
  if (!nq) return null;
  const groups = index.groups.filter((gr) => gr.id?.toLowerCase() === q.toLowerCase() || gr.aliases.some((a) => norm(a) === nq));
  if (!groups.length) {
    const software = (index.software ?? []).filter((sw) => sw.id?.toLowerCase() === q.toLowerCase() || sw.aliases.some((a) => norm(a) === nq));
    if (software.length) return { kind: 'software' as const, software: software.slice(0, 4) };
    // Fuzzy fallback: a mispronounced / mis-typed name ("lockbyte", "cobaltstrike", "ap t29").
    const cands: FuzzyCandidate[] = [];
    for (const gr of index.groups) for (const a of gr.aliases) cands.push({ key: normalizeWord(a), value: `actor:${gr.name}` });
    for (const sw of index.software ?? []) for (const a of sw.aliases) cands.push({ key: normalizeWord(a), value: `sw:${sw.name}` });
    const fuzzy = bestFuzzyMatch(q, cands, 0.82);
    if (fuzzy) {
      const [kind, name] = [fuzzy.value.slice(0, fuzzy.value.indexOf(':')), fuzzy.value.slice(fuzzy.value.indexOf(':') + 1)];
      if (kind === 'actor') {
        const groups = index.groups.filter((gr) => gr.name === name);
        if (groups.length) {
          const keys = new Set(groups.flatMap((gr) => gr.aliases.map(norm)));
          return { kind: 'actor' as const, groups, ttpProfileUrl: [...keys].map((k) => index.profiles[k]).find(Boolean) };
        }
      } else {
        const sw = (index.software ?? []).filter((x) => x.name === name);
        if (sw.length) return { kind: 'software' as const, software: sw.slice(0, 4) };
      }
    }
    return null;
  }
  const keys = new Set(groups.flatMap((gr) => gr.aliases.map(norm)));
  const profile = [...keys].map((k) => index.profiles[k]).find(Boolean);
  return { kind: 'actor' as const, groups, ttpProfileUrl: profile };
}

/**
 * ATT&CK techniques whose NAME appears in a question ("what is phishing", "explain credential dumping").
 * Longest names first; very short generic names are skipped to avoid false hits.
 */
export function findTechniquesInText(text: string, index: Pick<IntelIndex, 'techniques'>, limit = 2): IntelIndex['techniques'] {
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')} `;
  const plural = (n: string) => [n, `${n}s`, n.endsWith('ing') ? n : `${n}ing`];
  const hits = index.techniques
    .filter((t) => {
      const n = t.name.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (n.length < 6) return false;
      return plural(n).some((v) => hay.includes(` ${v} `));
    })
    .sort((a, b) => b.name.length - a.name.length || a.id.length - b.id.length);
  const out: IntelIndex['techniques'] = [];
  for (const t of hits) {
    if (out.some((o) => o.name.toLowerCase().includes(t.name.toLowerCase()))) continue;
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

/** Find known actors, malware and tools mentioned in free text (for questions like "do you know about X?"). */
export function findEntities(text: string, index: IntelIndex, actorMatchers: Matcher[]): string[] {
  const out: string[] = [];
  const found = matchIntel(text, index, actorMatchers);
  for (const a of found.actors) out.push(a.matchedAlias);
  const lower = ` ${text.toLowerCase().replace(/[^a-z0-9.\- ]+/g, ' ')} `;
  for (const sw of index.software ?? []) {
    for (const a of sw.aliases) {
      const al = a.toLowerCase();
      if (al.length < 5 || AMBIGUOUS.has(al)) continue;
      if (lower.includes(` ${al} `)) {
        out.push(a);
        break;
      }
    }
    if (out.length >= 4) break;
  }
  for (const t of found.techniques) out.push(t.id);
  return [...new Set(out)];
}
