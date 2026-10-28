// Extra knowledge sources for answering questions (patch 4):
//   - Wikipedia summaries (background on malware, groups, technologies)          free, no key
//   - abuse.ch ThreatFox (is this IP / domain / URL / hash a known malicious IOC?)  free Auth-Key
// Everything returned here is UNTRUSTED data: it is only shown/quoted and passed to Gemini as DATA.
import { CWE_API_URL, EPSS_URL, THREATFOX_URL, WIKIPEDIA_SEARCH, WIKIPEDIA_SUMMARY, getEnv } from './config';
import { fetchWithRetry, readTextLimited } from './http';
import { stripHtml } from './normalize';

// ---------- IOC detection (pure) ----------

export type IocKind = 'md5' | 'sha1' | 'sha256' | 'ipv4' | 'domain' | 'url';

export function detectIoc(text: string): { kind: IocKind; value: string } | null {
  const t = text.trim();
  const url = /\bhttps?:\/\/[^\s"'<>]+/i.exec(t);
  if (url) return { kind: 'url', value: url[0].replace(/[.,;)]+$/, '') };
  const sha256 = /\b[a-f0-9]{64}\b/i.exec(t);
  if (sha256) return { kind: 'sha256', value: sha256[0].toLowerCase() };
  const sha1 = /\b[a-f0-9]{40}\b/i.exec(t);
  if (sha1) return { kind: 'sha1', value: sha1[0].toLowerCase() };
  const md5 = /\b[a-f0-9]{32}\b/i.exec(t);
  if (md5) return { kind: 'md5', value: md5[0].toLowerCase() };
  const ip = /\b((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)\b/.exec(t);
  if (ip) return { kind: 'ipv4', value: ip[0] };
  // Domains only when the user clearly asks about one (avoid matching "Node.js" etc.).
  const dom = /\b(?:domain|site|website|host|url|ioc|indicator)\s+([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24})\b/i.exec(t) ?? /\b(?:is|check)\s+([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|info|xyz|top|ru|cn|io|in|biz|site|online|shop|click|live|app))\s+(?:malicious|safe|bad|dangerous|a threat|known)/i.exec(t);
  if (dom) return { kind: 'domain', value: dom[1].toLowerCase() };
  return null;
}

// ---------- Wikipedia ----------

export interface WikiSummary {
  title: string;
  extract: string;
  url: string;
}

export function parseWikiSearch(json: unknown): string | null {
  // opensearch format: [query, [titles], [descriptions], [urls]]
  if (!Array.isArray(json) || !Array.isArray(json[1])) return null;
  const first = json[1][0];
  return typeof first === 'string' && first ? first : null;
}

export function parseWikiSummary(json: unknown): WikiSummary | null {
  const o = json as { type?: string; title?: string; extract?: string; content_urls?: { desktop?: { page?: string } } };
  if (!o || typeof o.title !== 'string' || typeof o.extract !== 'string' || !o.extract.trim()) return null;
  if (o.type === 'disambiguation') return null;
  const url = o.content_urls?.desktop?.page;
  return { title: o.title, extract: stripHtml(o.extract, 1200), url: typeof url === 'string' ? url : `https://en.wikipedia.org/wiki/${encodeURIComponent(o.title)}` };
}

export async function wikipediaSummary(topic: string): Promise<WikiSummary | null> {
  const { userAgent, enableWikipedia } = getEnv();
  if (!enableWikipedia || !topic.trim()) return null;
  const headers = { 'user-agent': `${userAgent} (https://github.com/; personal use)`, accept: 'application/json' };
  const s = await fetchWithRetry(`${WIKIPEDIA_SEARCH}?action=opensearch&limit=1&namespace=0&format=json&search=${encodeURIComponent(topic.slice(0, 100))}`, { headers, retries: 1, timeoutMs: 10_000 });
  const title = parseWikiSearch(JSON.parse(await readTextLimited(s, 200_000)));
  if (!title) return null;
  const r = await fetchWithRetry(`${WIKIPEDIA_SUMMARY}${encodeURIComponent(title.replace(/ /g, '_'))}`, { headers, retries: 1, timeoutMs: 10_000 });
  return parseWikiSummary(JSON.parse(await readTextLimited(r, 500_000)));
}

// ---------- abuse.ch ThreatFox ----------

export interface ThreatFoxHit {
  ioc: string;
  threatType: string;
  malware: string;
  confidence: number | null;
  firstSeen: string | null;
  reference: string | null;
}

export function parseThreatFox(json: unknown): { status: string; hits: ThreatFoxHit[] } {
  const o = json as { query_status?: unknown; data?: unknown };
  const status = typeof o?.query_status === 'string' ? o.query_status : 'unknown';
  if (!Array.isArray(o?.data)) return { status, hits: [] };
  const hits = (o.data as Record<string, unknown>[]).slice(0, 10).map((d) => ({
    ioc: String(d.ioc ?? ''),
    threatType: String(d.threat_type_desc ?? d.threat_type ?? ''),
    malware: String(d.malware_printable ?? d.malware ?? ''),
    confidence: typeof d.confidence_level === 'number' ? d.confidence_level : null,
    firstSeen: typeof d.first_seen === 'string' ? d.first_seen : null,
    reference: typeof d.reference === 'string' && /^https?:\/\//.test(d.reference) ? d.reference : null,
  }));
  return { status, hits };
}

export async function threatFoxLookup(ioc: { kind: IocKind; value: string }): Promise<{ status: string; hits: ThreatFoxHit[] } | null> {
  const { abuseChKey, userAgent } = getEnv();
  if (!abuseChKey) return null;
  const isHash = ioc.kind === 'md5' || ioc.kind === 'sha1' || ioc.kind === 'sha256';
  const body = isHash ? { query: 'search_hash', hash: ioc.value } : { query: 'search_ioc', search_term: ioc.value };
  const res = await fetchWithRetry(THREATFOX_URL, {
    method: 'POST',
    headers: { 'Auth-Key': abuseChKey, 'content-type': 'application/json', 'user-agent': userAgent },
    body: JSON.stringify(body),
    retries: 1,
    timeoutMs: 15_000,
  });
  return parseThreatFox(JSON.parse(await readTextLimited(res, 2_000_000)));
}

// ---------- FIRST EPSS: how likely a CVE is to be exploited in the next 30 days ----------
// Free, no key: https://api.first.org/data/v1/epss?cve=CVE-…  (epss and percentile are decimal strings)

export interface EpssScore {
  cve: string;
  /** probability 0..1 of exploitation activity in the next 30 days */
  epss: number;
  /** 0..1: share of all CVEs with a lower score */
  percentile: number;
  date: string | null;
}

export function parseEpss(json: unknown, cve: string): EpssScore | null {
  const rows = (json as { data?: { cve?: string; epss?: string | number; percentile?: string | number; date?: string }[] })?.data;
  const row = Array.isArray(rows) ? rows.find((r) => r?.cve?.toUpperCase() === cve.toUpperCase()) : undefined;
  if (!row) return null;
  const epss = Number(row.epss);
  const percentile = Number(row.percentile);
  if (!Number.isFinite(epss) || epss < 0 || epss > 1) return null;
  return { cve: cve.toUpperCase(), epss, percentile: Number.isFinite(percentile) ? percentile : 0, date: typeof row.date === 'string' ? row.date : null };
}

export function epssPlain(e: EpssScore): string {
  const pct = (e.epss * 100).toFixed(e.epss < 0.01 ? 2 : 1);
  const level = e.epss >= 0.5 ? 'very high' : e.epss >= 0.1 ? 'high' : e.epss >= 0.01 ? 'moderate' : 'low';
  const p = e.percentile * 100;
  const rank = p >= 99 ? `in the top ${Math.max(0.1, 100 - p).toFixed(1)}% of all CVEs` : `higher than ${Math.round(p)}% of all CVEs`;
  return `EPSS ${pct}% chance of being exploited in the next 30 days (${level}; ${rank})${e.date ? `, as of ${e.date}` : ''}.`;
}

export async function epssLookup(cve: string): Promise<EpssScore | null> {
  const res = await fetchWithRetry(`${EPSS_URL}?cve=${encodeURIComponent(cve)}`, { headers: { 'user-agent': getEnv().userAgent, accept: 'application/json' }, retries: 1, timeoutMs: 10_000 });
  return parseEpss(JSON.parse(await readTextLimited(res, 200_000)), cve);
}

// ---------- MITRE CWE: what kind of weakness a bug is, and how to prevent it ----------
// Free, no key: https://cwe-api.mitre.org/api/v1/cwe/weakness/{id}. The JSON mirrors the CWE XML;
// the parser is deliberately tolerant of both {Weaknesses:[…]} and a bare object, and of
// "ExtendedDescription"/"Extended_Description" style names.

export interface CweInfo {
  id: string; // CWE-79
  name: string;
  description: string;
  consequences: string[];
  mitigations: string[];
  url: string;
}

function textOf(v: unknown, max = 400): string {
  if (typeof v === 'string') return stripHtml(v, max);
  if (Array.isArray(v)) return textOf(v.map((x) => textOf(x, max)).filter(Boolean).join(' '), max);
  if (v && typeof v === 'object') return textOf(Object.values(v as Record<string, unknown>), max);
  return '';
}

function listOf(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
  if (v && typeof v === 'object') {
    const inner = Object.values(v as Record<string, unknown>).find(Array.isArray);
    return inner ? listOf(inner) : [v as Record<string, unknown>];
  }
  return [];
}

const pick = (o: Record<string, unknown>, ...keys: string[]) => keys.map((k) => o[k]).find((x) => x !== undefined);

export function parseCwe(json: unknown, id: string): CweInfo | null {
  const root = json as Record<string, unknown> | null;
  if (!root || typeof root !== 'object') return null;
  const w = (Array.isArray(root.Weaknesses) ? root.Weaknesses[0] : Array.isArray(root.weaknesses) ? root.weaknesses[0] : root) as Record<string, unknown> | undefined;
  if (!w || typeof w !== 'object') return null;
  const name = textOf(pick(w, 'Name', 'name'), 200);
  if (!name) return null;
  const num = id.replace(/^CWE-/i, '');
  const description = [textOf(pick(w, 'Description', 'description'), 500), textOf(pick(w, 'ExtendedDescription', 'Extended_Description', 'extendedDescription'), 500)].filter(Boolean).join(' ').slice(0, 900);
  const consequences = listOf(pick(w, 'CommonConsequences', 'Common_Consequences'))
    .map((c) => [textOf(pick(c, 'Impact'), 160), textOf(pick(c, 'Note'), 200)].filter(Boolean).join(': '))
    .filter(Boolean)
    .slice(0, 4);
  const mitigations = listOf(pick(w, 'PotentialMitigations', 'Potential_Mitigations'))
    .map((m) => {
      const phase = textOf(pick(m, 'Phase'), 60);
      const d = textOf(pick(m, 'Description', 'description'), 280);
      return d ? (phase ? `${phase}: ${d}` : d) : '';
    })
    .filter(Boolean)
    .slice(0, 5);
  return { id: `CWE-${num}`, name, description, consequences, mitigations, url: `https://cwe.mitre.org/data/definitions/${num}.html` };
}

export async function cweLookup(id: string): Promise<CweInfo | null> {
  const num = id.replace(/^CWE-/i, '');
  if (!/^\d{1,5}$/.test(num)) return null;
  const res = await fetchWithRetry(`${CWE_API_URL}${num}`, { headers: { 'user-agent': getEnv().userAgent, accept: 'application/json' }, retries: 1, timeoutMs: 12_000 });
  return parseCwe(JSON.parse(await readTextLimited(res, 2_000_000)), id);
}

/** Common weakness types (mostly the CWE Top 25), so a plain question can be linked to MITRE CWE. */
export const COMMON_CWES: { id: string; names: string[] }[] = [
  { id: 'CWE-79', names: ['cross-site scripting', 'cross site scripting', 'xss'] },
  { id: 'CWE-89', names: ['sql injection', 'sqli'] },
  { id: 'CWE-78', names: ['os command injection', 'command injection'] },
  { id: 'CWE-77', names: ['command injection'] },
  { id: 'CWE-94', names: ['code injection'] },
  { id: 'CWE-22', names: ['path traversal', 'directory traversal'] },
  { id: 'CWE-352', names: ['cross-site request forgery', 'cross site request forgery', 'csrf'] },
  { id: 'CWE-918', names: ['server-side request forgery', 'server side request forgery', 'ssrf'] },
  { id: 'CWE-502', names: ['insecure deserialization', 'deserialization', 'deserialisation'] },
  { id: 'CWE-787', names: ['out-of-bounds write', 'out of bounds write', 'buffer overflow', 'memory corruption'] },
  { id: 'CWE-125', names: ['out-of-bounds read', 'out of bounds read'] },
  { id: 'CWE-416', names: ['use after free', 'use-after-free'] },
  { id: 'CWE-476', names: ['null pointer dereference'] },
  { id: 'CWE-190', names: ['integer overflow'] },
  { id: 'CWE-434', names: ['unrestricted file upload', 'file upload vulnerability', 'malicious file upload'] },
  { id: 'CWE-287', names: ['improper authentication', 'authentication bypass'] },
  { id: 'CWE-306', names: ['missing authentication'] },
  { id: 'CWE-862', names: ['missing authorization', 'broken access control'] },
  { id: 'CWE-863', names: ['incorrect authorization'] },
  { id: 'CWE-639', names: ['idor', 'insecure direct object reference'] },
  { id: 'CWE-269', names: ['improper privilege management'] },
  { id: 'CWE-798', names: ['hardcoded credentials', 'hard-coded credentials', 'default credentials'] },
  { id: 'CWE-200', names: ['information disclosure', 'information exposure'] },
  { id: 'CWE-611', names: ['xxe', 'xml external entity'] },
  { id: 'CWE-400', names: ['uncontrolled resource consumption', 'resource exhaustion'] },
  { id: 'CWE-601', names: ['open redirect'] },
  { id: 'CWE-1321', names: ['prototype pollution'] },
  { id: 'CWE-362', names: ['race condition'] },
];

/** CWE IDs a question is about: explicit "CWE-79", or a known weakness name. */
export function findCwesInText(text: string, limit = 2): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\bCWE-(\d{1,5})\b/gi)) out.push(`CWE-${m[1]}`);
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9\- ]+/g, ' ').replace(/\s+/g, ' ')} `;
  for (const c of COMMON_CWES) if (c.names.some((n) => hay.includes(` ${n} `))) out.push(c.id);
  return [...new Set(out)].slice(0, limit);
}
