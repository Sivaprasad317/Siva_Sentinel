// "I am checking, boss": the research pipeline behind Siva's answers.
// It gathers evidence from several sources (each step is reported live to the screen),
// then asks Gemini to explain it in simple English. Nothing is invented: if a source
// has nothing, Siva says so.
import type { AnswerCard, AssistantReply, Briefing, ChatMessage, Citation, KevInfo, Story } from './types';
import type { Intent } from './assistantRouter';
import { SYSTEM_RULES } from './ai';
import { AiDisabledError, geminiGrounded, geminiJson, type GroundedAnswer } from './gemini';
import { getIntel, lookupIntel, findEntities, findTechniquesInText, type IntelTechniqueFull } from './intel';
import { fetchNvdDetails, getKevMap, type NvdDetails } from './sources';
import { cweLookup, detectIoc, epssLookup, epssPlain, findCwesInText, threatFoxLookup, wikipediaSummary, type CweInfo, type EpssScore, type ThreatFoxHit, type WikiSummary } from './knowledge';
import { GLOSSARY, findTermsInText, glossaryPrimer, lookupTerm } from './glossary';
import { getEnv } from './config';
import { cardToText } from './answerCard';
import { findNode, neighbors, type ThreatGraph } from './threatGraph';
import { getThreatGraph } from './graphData';
import { freshness, fmtDay, searchMemory } from './memory';
import { readStore } from './store';
import { getRefreshState, startRefresh } from './refresh';
import type { FeedLogEntry } from './types';

export type StepFn = (text: string) => void;

export interface ResearchDeps {
  getIntel: typeof getIntel;
  getKevMap: typeof getKevMap;
  fetchNvdDetails: typeof fetchNvdDetails;
  wikipediaSummary: typeof wikipediaSummary;
  threatFoxLookup: typeof threatFoxLookup;
  geminiGrounded: typeof geminiGrounded;
  geminiJson: typeof geminiJson;
  /** Optional so older callers/tests keep working; the app always provides them. */
  epssLookup?: typeof epssLookup;
  cweLookup?: typeof cweLookup;
  /** Threat Graph built from the stories Siva has read (optional). */
  threatGraph?: () => Promise<ThreatGraph>;
  /** Everything Siva has read (live feed log) + when she last read her sources (optional). */
  memory?: () => Promise<{ log: FeedLogEntry[]; lastRunAt: string | null; timezone: string }>;
  /** Start a background re-read when her reading is stale; returns true if one started (optional). */
  refreshIfStale?: () => boolean;
}

const defaultDeps: ResearchDeps = { getIntel, getKevMap, fetchNvdDetails, wikipediaSummary, threatFoxLookup, geminiGrounded, geminiJson, epssLookup, cweLookup, threatGraph: () => getThreatGraph(90),
  memory: async () => {
    const st = await readStore();
    return { log: st.feedLog, lastRunAt: st.meta.lastRunAt ?? null, timezone: st.preferences.timezone };
  },
  refreshIfStale: () => getRefreshState().running || startRefresh('live'),
};

const STOP = new Set('what which who whom whose when where why how is are was were the a an of to in on for with about do does did you your know have has any tell me please explain latest new today this that there their they them it its and or can could would should siva boss hey'.split(' '));

export function keywords(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\-. ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

/** Stories from the current briefing that really relate to the question. */
export function relatedStories(q: string, stories: Story[], extraTerms: string[] = [], limit = 5): Story[] {
  const words = [...new Set([...keywords(q), ...extraTerms.map((t) => t.toLowerCase())])];
  if (!words.length) return [];
  return stories
    .map((s) => {
      const hay = `${s.title} ${s.summary} ${s.cves.join(' ')} ${s.intel?.actors.map((a) => `${a.name} ${a.matchedAlias}`).join(' ') ?? ''}`.toLowerCase();
      const hits = words.filter((w) => hay.includes(w)).length;
      return { s, hits };
    })
    .filter((x) => x.hits >= Math.min(2, words.length) || extraTerms.some((t) => `${x.s.title} ${x.s.summary}`.toLowerCase().includes(t.toLowerCase())))
    .sort((a, b) => b.hits - a.hits || b.s.score - a.s.score)
    .slice(0, limit)
    .map((x) => x.s);
}

/** Section headings Siva asks Gemini for, mapped to what the screen shows. */
const SECTION_HEADS: { re: RegExp; key: SectionKey; heading: string }[] = [
  { re: /^(title)$/, key: 'title', heading: '' },
  { re: /^(summary|simple explanation|in simple words|simple words)$/, key: 'summary', heading: '' },
  { re: /^(how it works|how does it work|how it happens|how the attack works)$/, key: 'how', heading: 'How it works' },
  { re: /^(key points|key facts|facts|details|important points)$/, key: 'facts', heading: 'Key points' },
  { re: /^(real[- ]world examples?|examples?|real examples?)$/, key: 'example', heading: 'Real-world example' },
  { re: /^(why it matters|impact|who is affected|why this matters|risk)$/, key: 'why', heading: 'Why it matters' },
  { re: /^(how to spot it|how to detect it|detection|warning signs|signs)$/, key: 'detect', heading: 'How to spot it' },
  { re: /^(what to do|recommended actions|actions|how to protect|protection|how to stay safe|defen[cs]e)$/, key: 'actions', heading: 'What to do' },
  { re: /^(latest|latest news|recent developments|in the news|latest updates?)$/, key: 'latest', heading: 'Latest from the news' },
  { re: /^(related terms|related|see also|related topics)$/, key: 'related', heading: 'Related terms' },
];
type SectionKey = 'title' | 'summary' | 'how' | 'facts' | 'example' | 'why' | 'detect' | 'actions' | 'latest' | 'related';

/** Order the explanation sections appear in on screen (summary/actions are shown separately). */
export const SECTION_ORDER: Exclude<SectionKey, 'title' | 'summary' | 'actions'>[] = ['how', 'facts', 'example', 'why', 'detect', 'latest', 'related'];
export const SECTION_HEADING: Record<string, string> = Object.fromEntries(SECTION_HEADS.filter((h) => h.heading).map((h) => [h.key, h.heading]));

export interface Sectioned {
  title: string;
  summary: string;
  facts: string[];
  actions: string[];
  /** Every bullet section by key (how, facts, example, why, detect, actions, latest, related). */
  sections: Partial<Record<SectionKey, string[]>>;
}

const LIMITS: Partial<Record<SectionKey, number>> = { how: 6, facts: 10, example: 3, why: 4, detect: 5, actions: 7, latest: 5, related: 6 };

/** Parse Gemini's sectioned plain-text answer (used with Google Search grounding, which cannot return JSON). */
export function parseSectioned(text: string): Sectioned {
  const clean = (s: string) => s.replace(/\*\*|__|`/g, '').replace(/\[(\d+(,\s*\d+)*)\]/g, '').trim();
  let title = '';
  let summary = '';
  const sections: Partial<Record<SectionKey, string[]>> = {};
  let mode: SectionKey | 'none' = 'none';
  const push = (k: SectionKey, v: string) => {
    const t = v.trim();
    if (!t) return;
    (sections[k] ??= []).push(t);
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = clean(raw);
    if (!line) continue;
    const head = /^#*\s*([a-z][a-z \-']{1,40}?)\s*:\s*(.*)$/i.exec(line);
    const def = head ? SECTION_HEADS.find((h) => h.re.test(head[1].trim().toLowerCase())) : undefined;
    if (head && def) {
      const rest = head[2].trim();
      if (def.key === 'title') {
        title = rest;
        mode = 'none';
      } else if (def.key === 'summary') {
        mode = 'summary';
        if (rest) summary = rest;
      } else {
        mode = def.key;
        if (rest) push(def.key, rest);
      }
      continue;
    }
    const bullet = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    const item = bullet ? bullet[1].trim() : line;
    if (mode === 'summary') summary = summary ? `${summary} ${item}` : item;
    else if (mode !== 'none') push(mode, item);
    else if (!summary) summary = item;
    else push('facts', item);
  }
  for (const k of Object.keys(sections) as SectionKey[]) sections[k] = sections[k]!.slice(0, LIMITS[k] ?? 6).map((x) => x.slice(0, 400));
  return { title: title.slice(0, 160), summary: summary.slice(0, 1200), facts: sections.facts ?? [], actions: sections.actions ?? [], sections };
}

/** Turn Gemini's JSON answer (non-search path) into the same shape. Accepts old {facts} too. */
export function parseExpertJson(raw: unknown): Sectioned {
  const o = (raw ?? {}) as Record<string, unknown>;
  const strs = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, n).map((x) => x.trim().slice(0, 400)) : []);
  const sections: Partial<Record<SectionKey, string[]>> = {};
  const set = (k: SectionKey, v: unknown) => {
    const a = strs(v, LIMITS[k] ?? 6);
    if (a.length) sections[k] = a;
  };
  set('how', o.howItWorks);
  set('facts', o.keyPoints ?? o.facts);
  set('example', o.example ?? o.examples);
  set('why', o.whyItMatters);
  set('detect', o.howToSpot ?? o.detect);
  set('actions', o.actions ?? o.whatToDo);
  set('latest', o.latest);
  set('related', o.relatedTerms ?? o.related);
  return {
    title: typeof o.title === 'string' ? o.title.slice(0, 160) : '',
    summary: typeof o.summary === 'string' ? o.summary.slice(0, 1200) : '',
    facts: sections.facts ?? [],
    actions: sections.actions ?? [],
    sections,
  };
}

/** What Siva says aloud: the simple explanation plus the top key points (the screen has the rest). */
export function spokenAnswer(summary: string, title: string, keyPoints: string[], userTitle: string): string {
  const sentences = summary.match(/[^.!?]+[.!?]+/g) ?? [summary];
  const head = sentences.slice(0, 3).map((x) => x.trim()).join(' ').trim() || title;
  const pts = keyPoints
    .slice(0, 3)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length <= 220)
    .map((p) => (/[.!?]$/.test(p) ? p : `${p}.`));
  const kp = pts.length ? ` Key points: ${pts.join(' ')}` : '';
  return `${head}${kp} I have put the full details on your screen, ${userTitle}.`;
}

/** Extra rules for answering questions: expert knowledge for concepts, sources for current facts. */
export const EXPERT_RULES = `ANSWERING QUESTIONS (these rules refine the DATA rule above):
- You are also a senior cybersecurity expert and a patient teacher. For STABLE, textbook knowledge — what a term, attack, malware type or weakness is; how it works step by step; why it is dangerous; how defenders detect and prevent it; how frameworks such as MITRE ATT&CK, CWE, OWASP Top 10, NIST CSF and the cyber kill chain work — use your own expert knowledge confidently and in depth, even when DATA is empty.
- For TIME-SENSITIVE or specific facts — particular CVEs, CVSS/EPSS numbers, dates, versions, victims, recent campaigns, arrests, "latest" anything — use ONLY DATA or Google Search results, and give the date. Never invent them. If they are not available, write "Not in my sources yet" for that point.
- When DATA contains MITRE ATT&CK, CWE, CISA KEV, NVD or EPSS records, build on them and keep their facts exact.
- Give MORE information, organised as KEY POINTS: every bullet is one idea, at most about 25 words, plain English, no filler. Explain every acronym the first time.
- Defensive only: never give attack instructions, exploit code, commands to break into systems or ways to evade security. Explain HOW attacks work at the level a defender needs to recognise and stop them.
- For this request, follow the output format given in the user message exactly (it overrides "JSON only" when plain text is requested).`;

const TEXT_FORMAT = `Reply in EXACTLY this plain-text format (omit a section only if it truly does not apply; never leave a heading empty):
TITLE: <short title>
SUMMARY: <2-4 simple sentences a complete beginner understands: what it is and why it matters>
HOW IT WORKS:
- <3-5 short steps or mechanisms, defender-level, no attack instructions>
KEY POINTS:
- <5-8 most important points; include dates and numbers when known from sources>
REAL-WORLD EXAMPLE:
- <1-2 real, well-known examples with year; only ones you are sure about>
WHY IT MATTERS:
- <2-3 points: who is affected and the impact>
HOW TO SPOT IT:
- <2-4 warning signs or detection ideas>
WHAT TO DO:
- <3-6 practical defensive steps, most important first>
LATEST:
- <up to 4 recent developments WITH dates, only from search results or DATA>
RELATED TERMS:
- <3-5 items as "Term — a few plain words">`;

const JSON_FORMAT = `Return JSON with exactly these keys (use [] when a list does not apply):
{"title": "short title",
 "summary": "2-4 simple sentences: what it is and why it matters",
 "howItWorks": ["3-5 short steps/mechanisms, defender-level"],
 "keyPoints": ["5-8 most important points; dates/numbers only from DATA"],
 "example": ["1-2 real, well-known examples with year, only if sure"],
 "whyItMatters": ["2-3 points: who is affected, impact"],
 "howToSpot": ["2-4 warning signs / detection ideas"],
 "actions": ["3-6 practical defensive steps"],
 "latest": ["recent developments with dates, ONLY from DATA"],
 "relatedTerms": ["3-5 items as 'Term — a few plain words'"]}`;

export async function research(
  question: string,
  intent: Intent,
  briefing: Briefing | null,
  history: ChatMessage[],
  onStep: StepFn = () => undefined,
  deps: ResearchDeps = defaultDeps,
): Promise<AssistantReply> {
  const env = getEnv();
  const steps: string[] = [];
  const step = (t: string) => {
    steps.push(t);
    onStep(t);
  };
  const sources: AnswerCard['sources'] = [];
  const addSource = (title: string, url: string | undefined, kind: string) => {
    if (url && /^https?:\/\//.test(url) && !sources.some((s) => s.url === url)) sources.push({ title, url, kind });
  };
  const evidence: Record<string, unknown> = {};
  const notes: string[] = [];
  /** Sections built straight from authoritative sources (always shown, even without AI). */
  const refSections: AnswerCard['sections'] = [];

  // 1. Threat-intel reference data (ATT&CK, MISP, Malpedia).
  step('Searching MITRE ATT&CK, MISP galaxy and Malpedia');
  const intel = await deps.getIntel(false).catch(() => null);
  const terms: string[] = [];
  if (intent.type === 'actor') terms.push(intent.name);
  if (intent.type === 'technique') terms.push(intent.id);
  if (intel) for (const e of findEntities(question, intel.index, intel.matchers)) if (!terms.some((t) => t.toLowerCase() === e.toLowerCase())) terms.push(e);
  // Techniques named in plain words ("what is phishing", "explain credential dumping").
  if (intel) for (const t of findTechniquesInText(question, intel.index)) if (!terms.includes(t.id)) terms.push(t.id);
  const intelFound: unknown[] = [];
  let mainTech: IntelTechniqueFull | null = null;
  if (intel) {
    for (const t of terms.slice(0, 3)) {
      const f = lookupIntel(t, intel.index);
      if (!f) continue;
      if (f.kind === 'technique') {
        const tech = f.technique as IntelTechniqueFull;
        mainTech ??= tech;
        intelFound.push({ type: 'ATT&CK technique', id: tech.id, name: tech.name, tactics: tech.tactics, platforms: tech.platforms, description: tech.description, detection: tech.detection, mitigations: tech.mitigations?.map((m) => `${m.id} ${m.name}: ${m.description}`) });
        addSource(`MITRE ATT&CK ${tech.id} ${tech.name}`, tech.url, 'mitre');
      } else if (f.kind === 'actor') {
        for (const gr of f.groups.slice(0, 2)) {
          intelFound.push({ type: 'threat actor', source: gr.source, id: gr.id, name: gr.name, aliases: gr.aliases.slice(0, 12), country: gr.country, description: gr.description });
          addSource(`${gr.source}: ${gr.name}`, gr.url, 'intel');
        }
        if (f.ttpProfileUrl) addSource('TTP profile (crocodyli/ThreatActors-TTPs)', f.ttpProfileUrl, 'intel');
      } else {
        for (const sw of f.software) {
          intelFound.push({ type: sw.kind, source: sw.source, id: sw.id, name: sw.name, aliases: sw.aliases.slice(0, 12), description: sw.description });
          addSource(`${sw.source}: ${sw.name}`, sw.url, 'intel');
        }
      }
    }
  } else notes.push('Threat-intel reference data is not downloaded yet (it downloads during the next refresh).');
  if (intelFound.length) evidence.threatIntel = intelFound;
  if (mainTech) {
    const bullets = [
      `${mainTech.id} ${mainTech.name}${mainTech.tactics.length ? ` — attacker goal: ${mainTech.tactics.map((t) => t.replace(/-/g, ' ')).join(', ')}` : ''}.`,
      ...(mainTech.platforms?.length ? [`Seen on: ${mainTech.platforms.join(', ')}.`] : []),
      ...(mainTech.detection ? [`How MITRE says to detect it: ${mainTech.detection}`] : []),
    ];
    refSections.push({ heading: `MITRE ATT&CK: ${mainTech.name}`, bullets });
    if (mainTech.mitigations?.length) refSections.push({ heading: 'MITRE mitigations', bullets: mainTech.mitigations.slice(0, 6).map((m) => `${m.name} (${m.id}): ${m.description}`) });
  }

  // 1b. Security glossary: define any terms the user used, so jargon is always explained.
  const isDefinition = /\b(what|whats|what's|define|definition|meaning|mean|explain|explained?|how does|how do)\b/i.test(question) || keywords(question).length <= 3;
  const direct = isDefinition ? lookupTerm(question.replace(/\b(what|whats|what's|is|are|the|a|an|does|do|mean|means|meaning|define|definition|of|explain|tell|me|about|siva|boss|please|in|cyber|security|attack|attacks|how|works?|it)\b/gi, ' ').trim()) : null;
  const termsUsed = [...new Set([...(direct ? [direct] : []), ...findTermsInText(question)])].slice(0, 5);
  if (termsUsed.length) {
    step(`Explaining ${termsUsed.length === 1 ? 'the term' : 'terms'}: ${termsUsed.map((t) => t.term).join(', ')}`);
    evidence.glossary = termsUsed.map((t) => ({ term: t.term, meaning: t.short, more: t.more, example: t.example, category: t.category }));
  }

  // 2. Today's collected stories.
  step("Checking today's collected stories");
  const related = relatedStories(question, briefing?.stories ?? [], terms.filter((t) => !/^T\d{4}/.test(t)));
  if (related.length) {
    evidence.todaysStories = related.map((s) => ({ title: s.title, source: s.source, published: s.publishedAt, summary: s.summary, kev: s.kev ? `${s.kev.cveID} in CISA KEV` : null }));
    for (const s of related) addSource(s.title, s.url, 'story');
  }

  const cveFromQ = (/CVE-\d{4}-\d{4,7}/i.exec(question)?.[0] ?? '').toUpperCase();
  // 2b. Siva's own reading memory: everything she has read from her feeds (with dates).
  let memoryHits: FeedLogEntry[] = [];
  let memWindowLabel = '';
  let fresh: ReturnType<typeof freshness> | null = null;
  if (deps.memory) {
    const mem = await deps.memory().catch(() => null);
    if (mem) {
      fresh = freshness(mem.lastRunAt, new Date());
      step(`Searching my reading memory (${mem.log.length} items · ${fresh.label})`);
      const extraWords = [...terms.filter((t) => !/^T\d{4}/.test(t)), cveFromQ].filter(Boolean).join(' ');
      const r = searchMemory(mem.log, `${question} ${extraWords}`, new Date(), 8);
      const seenUrls = new Set(related.map((x) => x.url));
      memoryHits = r.hits.map((h) => h.entry).filter((e) => !seenUrls.has(e.url));
      memWindowLabel = r.window?.label ?? '';
      if (memoryHits.length) {
        evidence.recentNews = memoryHits.map((e) => ({ date: (e.publishedAt || e.firstSeenAt).slice(0, 16), title: e.title, source: e.source, whatMatters: e.matter, exploited: e.kev || undefined, cves: e.cves.length ? e.cves : undefined }));
        evidence.readingStatus = `${fresh.label}; items are what Siva herself read from her feeds${memWindowLabel ? ` (filtered to ${memWindowLabel})` : ''}.`;
        for (const e of memoryHits) addSource(`${e.title} (${e.source})`, e.url, 'memory');
        refSections.push({ heading: `From my reading${memWindowLabel ? ` — ${memWindowLabel}` : ''}`, bullets: memoryHits.map((e) => `${fmtDay(e.publishedAt || e.firstSeenAt, mem.timezone)} · ${e.title} — ${e.source}${e.kev ? ' · exploited (KEV)' : ''}`) });
      }
      if (fresh.stale && deps.refreshIfStale?.()) notes.push(`${fresh.label}, so I have started reading all my sources again in the background. Ask me again in two or three minutes for the very latest.`);
    }
  }

  // 3. CVE details: NVD + CISA KEV + EPSS (how likely it is to be exploited).
  const cve = intent.type === 'cve' ? intent.cve : (/CVE-\d{4}-\d{4,7}/i.exec(question)?.[0] ?? '').toUpperCase();
  const cweIds = findCwesInText(question);
  if (cve) {
    step(`Checking ${cve} in NVD, the CISA exploited list and FIRST EPSS`);
    const [kevR, nvdR, epssR] = await Promise.allSettled([deps.getKevMap(), deps.fetchNvdDetails(cve), deps.epssLookup ? deps.epssLookup(cve) : Promise.resolve(null)]);
    const kev: KevInfo | null = kevR.status === 'fulfilled' ? kevR.value.get(cve) ?? null : null;
    if (kevR.status === 'rejected') notes.push(`CISA KEV unavailable: ${(kevR.reason as Error).message}`);
    const nvd: NvdDetails | null = nvdR.status === 'fulfilled' ? nvdR.value : null;
    if (nvdR.status === 'rejected') notes.push(`NVD unavailable: ${(nvdR.reason as Error).message}`);
    const epss: EpssScore | null = epssR.status === 'fulfilled' ? epssR.value : null;
    evidence.cve = { id: cve, nvd, cisaKev: kev ?? 'not listed in CISA KEV', epss: epss ? epssPlain(epss) : 'not available' };
    for (const c of nvd?.cwes ?? []) if (!cweIds.includes(c)) cweIds.push(c);
    const facts: string[] = [];
    if (nvd?.cvss) facts.push(`Severity (CVSS ${nvd.cvss.version ?? ''}): ${nvd.cvss.score} ${nvd.cvss.severity ?? ''}`.replace(/\s+/g, ' ').trim() + '.');
    facts.push(kev ? `Confirmed exploited in the wild — CISA KEV since ${kev.dateAdded}${kev.dueDate ? `, US agencies must fix by ${kev.dueDate}` : ''}.` : 'Not on the CISA exploited list (KEV) as of now.');
    if (kev?.knownRansomwareCampaignUse === 'Known') facts.push('CISA says ransomware gangs are known to use it.');
    if (epss) facts.push(epssPlain(epss));
    if (nvd?.published) facts.push(`Published: ${nvd.published.slice(0, 10)}.`);
    if (nvd?.cwes?.length) facts.push(`Weakness type: ${nvd.cwes.join(', ')}.`);
    refSections.push({ heading: `${cve} at a glance`, bullets: facts });
    addSource(`NVD ${cve}`, `https://nvd.nist.gov/vuln/detail/${cve}`, 'nvd');
    if (kev) addSource('CISA Known Exploited Vulnerabilities', 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog', 'kev');
    if (epss) addSource(`FIRST EPSS: ${cve}`, `https://api.first.org/data/v1/epss?cve=${cve}`, 'epss');
  }

  // 3b. Weakness type (MITRE CWE): what kind of mistake it is and how to prevent it.
  if (cweIds.length && deps.cweLookup) {
    step(`Reading MITRE CWE: ${cweIds.slice(0, 2).join(', ')}`);
    const found = (await Promise.all(cweIds.slice(0, 2).map((id) => deps.cweLookup!(id).catch(() => null)))).filter((x): x is CweInfo => Boolean(x));
    if (found.length) {
      evidence.cwe = found.map((c) => ({ id: c.id, name: c.name, description: c.description, consequences: c.consequences, mitigations: c.mitigations }));
      for (const c of found) {
        addSource(`MITRE ${c.id}: ${c.name}`, c.url, 'cwe');
        refSections.push({ heading: `Weakness type: ${c.id} ${c.name}`, bullets: [c.description.slice(0, 400), ...c.consequences.slice(0, 2).map((x) => `Impact: ${x}`)].filter(Boolean) });
        if (c.mitigations.length) refSections.push({ heading: `How to prevent it (MITRE ${c.id})`, bullets: c.mitigations.slice(0, 4) });
      }
    }
  }

  // 3c. Threat Graph: what this is connected to across everything Siva has read.
  if (deps.threatGraph) {
    const g = await deps.threatGraph().catch(() => null);
    const node = g ? [cve, ...terms.filter((t) => !/^T\d{4}/.test(t)), mainTech?.id ?? '', direct?.term ?? ''].filter(Boolean).map((q) => findNode(g, q)).find(Boolean) : null;
    if (g && node) {
      step(`Connecting the dots: ${node.label} in the Threat Graph`);
      const nb = neighbors(g, node.id).slice(0, 8);
      evidence.threatGraph = { item: node.label, storiesLast90Days: node.stories, thisWeek: node.last7, lastWeek: node.prev7, connectedWith: nb.map((x) => `${x.node.label} (${x.node.type}, ${x.edge.relation}, ${x.edge.weight} stories)`) };
      if (nb.length) refSections.push({ heading: 'Connected in the news (Threat Graph)', bullets: [`${node.label}: ${node.stories} stories in 90 days, ${node.last7} this week (was ${node.prev7}).`, ...nb.slice(0, 5).map((x) => `${x.node.label} — ${x.edge.relation} (${x.edge.weight} stor${x.edge.weight === 1 ? 'y' : 'ies'})`)] });
    }
  }

  // 4. Indicator (IP / domain / URL / hash) reputation.
  const ioc = detectIoc(question);
  let tfHits: ThreatFoxHit[] = [];
  if (ioc) {
    if (env.abuseChKey) {
      step(`Checking ${ioc.kind.toUpperCase()} ${ioc.value} in abuse.ch ThreatFox`);
      try {
        const r = await deps.threatFoxLookup(ioc);
        tfHits = r?.hits ?? [];
        evidence.threatFox = r?.hits.length ? r.hits : `No match in ThreatFox (status: ${r?.status ?? 'unknown'}). This does not prove the indicator is safe.`;
        for (const h of tfHits) if (h.reference) addSource(`ThreatFox reference: ${h.malware || h.ioc}`, h.reference, 'ioc');
        addSource('abuse.ch ThreatFox', 'https://threatfox.abuse.ch/', 'ioc');
      } catch (err) {
        notes.push(`ThreatFox unavailable: ${(err as Error).message}`);
      }
    } else notes.push('Add a free ABUSECH_AUTH_KEY to check indicators in abuse.ch ThreatFox.');
  }

  // 5. Background from Wikipedia (concepts, malware, groups, technologies).
  const conceptTopic = direct?.term ?? (mainTech ? mainTech.name : '') ?? '';
  const wikiTopic =
    terms.find((t) => !/^T\d{4}/.test(t)) ??
    (conceptTopic || (intent.type === 'chat' && keywords(question).length <= 6 ? keywords(question).join(' ') : ''));
  let wiki: WikiSummary | null = null;
  if (wikiTopic && env.enableWikipedia) {
    step(`Reading background on Wikipedia: ${wikiTopic}`);
    wiki = await deps.wikipediaSummary(wikiTopic).catch(() => null);
    if (wiki) {
      evidence.wikipedia = { title: wiki.title, extract: wiki.extract };
      addSource(`Wikipedia: ${wiki.title}`, wiki.url, 'wiki');
    }
  }

  // 6. Ask Gemini — expert knowledge for concepts, sources/search for current facts.
  const convo = history.slice(-4).map((m) => `${m.role}: ${m.text.slice(0, 300)}`).join('\n') || '(none)';
  const dataBlock = `<<<DATA\n${JSON.stringify(evidence).slice(0, 28_000)}\nDATA>>>`;
  const card: AnswerCard = { title: '', summary: '', sections: [], actions: [], sources: [], usedWebSearch: false, steps };
  let aiStatus: AssistantReply['aiStatus'] = 'ok';
  let answer: Sectioned | null = null;
  const system = `${SYSTEM_RULES}\n\n${EXPERT_RULES}\n\nSECURITY GLOSSARY (for plain-English wording):\n${glossaryPrimer()}`;
  const ask = `The user (you call them "${env.userTitle}") asked: "${question.slice(0, 800)}"\nRecent conversation: ${convo}${memoryHits.length ? '\nDATA.recentNews lists news YOU (Siva) read yourself from your live feeds, with dates. For anything recent, "latest" or "today", use these first, give their dates, and put them in LATEST.' : ''}`;

  if (env.enableWebSearch) {
    step('Searching the web with Gemini (Google Search)');
    try {
      const g: GroundedAnswer = await deps.geminiGrounded({
        system: `${system}\nYou may also use Google Search results. Prefer official and reputable security sources (CISA, NIST, MITRE, vendors, CERT-In). If sources disagree or are unclear, say so.`,
        user: `${ask}\nUse your expert knowledge for the explanation, plus the collected evidence in DATA (untrusted) and Google Search for current facts.\n${TEXT_FORMAT}\n${dataBlock}`,
        maxOutputTokens: 8192, // room for the model's thinking + a full sectioned answer
      });
      const p = parseSectioned(g.text);
      if (p.summary) {
        answer = p;
        card.usedWebSearch = true;
        card.searchSuggestionsHtml = g.suggestionsHtml;
        for (const s of g.sources) addSource(s.title, s.url, 'web');
      }
    } catch (err) {
      if (err instanceof AiDisabledError) aiStatus = 'disabled';
      else notes.push(`Web search was not available (${(err as Error).message}); answered from expert knowledge and collected data.`);
    }
  }

  if (!answer && aiStatus !== 'disabled') {
    step('Writing the explanation');
    try {
      const raw = await deps.geminiJson({
        system,
        user: `${ask}\nExplain it using your expert cybersecurity knowledge plus DATA. Time-sensitive facts (dates, numbers, CVEs, recent events) only from DATA; if DATA lacks them, say "Not in my sources yet".\n${JSON_FORMAT}\n${dataBlock}`,
        maxOutputTokens: 8192, // room for the model's thinking + a full sectioned answer
      });
      const p = parseExpertJson(raw);
      if (p.summary) answer = p;
    } catch (err) {
      aiStatus = err instanceof AiDisabledError ? 'disabled' : 'failed';
      if (aiStatus === 'failed') notes.push(`Gemini was not available (${(err as Error).message}).`);
    }
  }

  // Build the card: simple words → explanation key points → source facts → today's stories → related.
  if (termsUsed.length) card.sections.push({ heading: 'In simple words', bullets: termsUsed.map((t) => `${t.term}: ${t.short}${t.example ? ` Example: ${t.example}` : ''}`) });
  if (answer) {
    card.title = answer.title;
    card.summary = answer.summary;
    for (const k of SECTION_ORDER) {
      if (k === 'related') continue;
      const b = answer.sections[k];
      if (b?.length) card.sections.push({ heading: SECTION_HEADING[k], bullets: b });
    }
    card.actions = answer.actions;
  }
  const refRank = (h: string) => (/at a glance$/.test(h) ? 0 : /^MITRE ATT&CK/.test(h) ? 1 : /^MITRE mitigations/.test(h) ? 2 : /^Weakness type/.test(h) ? 3 : /^How to prevent/.test(h) ? 4 : /^From my reading/.test(h) ? 5 : 6);
  card.sections.push(...[...refSections].sort((x, y) => refRank(x.heading) - refRank(y.heading)));
  if (related.length) card.sections.push({ heading: "In today's briefing", bullets: related.map((s) => `${s.title} (${s.source})${s.kev ? ' — exploited (CISA KEV)' : ''}`) });
  if (tfHits.length) card.sections.push({ heading: 'Indicator check (ThreatFox)', bullets: tfHits.map((h) => `${h.ioc}: ${h.threatType || 'malicious'}${h.malware ? `, linked to ${h.malware}` : ''}${h.confidence != null ? ` (confidence ${h.confidence}%)` : ''}${h.firstSeen ? `, first seen ${h.firstSeen}` : ''}`) });
  if (answer?.sections.related?.length) card.sections.push({ heading: 'Related terms', bullets: answer.sections.related });
  else if (termsUsed.length) {
    const rel = GLOSSARY.filter((t) => termsUsed.some((u) => u.category === t.category) && !termsUsed.includes(t)).slice(0, 4);
    if (rel.length) card.sections.push({ heading: 'Related terms', bullets: rel.map((t) => `${t.term} — ${t.short.split(/[.!?]/)[0]}`) });
  }

  if (!answer) {
    // No AI: build a plain answer from the evidence itself.
    const g0 = (evidence.glossary as { term: string; meaning: string; more?: string }[] | undefined)?.[0];
    const first = intelFound[0] as { name?: string; description?: string } | undefined;
    card.title = g0?.term ?? first?.name ?? wiki?.title ?? (cve || question.slice(0, 80));
    card.summary =
      (g0 ? `${g0.meaning}${g0.more ? ` ${g0.more}` : ''}` : '') ||
      first?.description ||
      wiki?.extract ||
      (cve && evidence.cve ? `${cve}: ${(evidence.cve as { nvd?: NvdDetails | null }).nvd?.description ?? 'No NVD description retrieved.'}` : '') ||
      (related.length ? `I found ${related.length} related stories in today's briefing.` : `I could not find information about this in my sources.`);
    if (wiki && card.summary !== wiki.extract && !first) card.sections.push({ heading: 'Background (Wikipedia)', bullets: (wiki.extract.match(/[^.!?]+[.!?]+/g) ?? [wiki.extract]).slice(0, 4).map((x) => x.trim()) });
    if (!card.actions.length && mainTech?.mitigations?.length) card.actions = mainTech.mitigations.slice(0, 4).map((m) => m.name);
    if (aiStatus === 'disabled') notes.push('AI explanations are off (no GEMINI_API_KEY), so this comes straight from the sources.');
  }
  if (!card.title) card.title = question.slice(0, 100);
  card.sources = sources.slice(0, 16);
  if (notes.length) card.note = notes.join(' ');

  const citations: Citation[] = [
    ...related.map((s) => ({ storyId: s.id, title: s.title, url: s.url })),
    ...card.sources.filter((s) => s.kind !== 'story').slice(0, 8).map((s) => ({ storyId: '', title: s.title, url: s.url })),
  ];
  const keyPts = answer?.sections.facts ?? refSections[0]?.bullets ?? [];
  return {
    intent: 'research',
    speech: spokenAnswer(card.summary, card.title, keyPts, env.userTitle),
    display: cardToText(card),
    card,
    citations,
    actions: [],
    aiStatus,
  };
}
