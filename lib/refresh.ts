// The refresh pipeline: collect -> clean -> deduplicate -> link to KEV -> enrich with NVD
// -> rank -> summarise with Gemini -> save. Runs in the background; the UI polls /api/status.
import { createHash, randomUUID } from 'node:crypto';
import type { Briefing, KevInfo, RawItem, RefreshState, SourceStatus, Story } from './types';
import { KEV_CATALOG_PAGE, getEnv } from './config';
import { resolveFeeds } from './feedResolve';
import { diffNewAlerts } from './alerts';
import { mergeFeedLog } from './feedLog';
import { fetchFeed, fetchKev, fetchNvdCvss, recentKev } from './sources';
import { fetchHackerNews, fetchRansomwareLive } from './extraSources';
import { mapLimit, readArticle } from './article';
import { getIntel, matchIntel } from './intel';
import { dedupeStories, extractCves, urlKey } from './normalize';
import { categorize, scoreStory } from './prioritize';
import { summarizeBriefing } from './ai';
import { readStore, updateStore } from './store';
import { zonedParts } from './schedule';

const g = globalThis as unknown as { __sivaRefresh?: RefreshState };

export function getRefreshState(): RefreshState {
  g.__sivaRefresh ??= { running: false, startedAt: null, progress: '', lastError: null, lastFinishedAt: null };
  return g.__sivaRefresh;
}

function setProgress(p: string) {
  getRefreshState().progress = p;
}

const MAX_STORIES = 60;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function idFor(url: string) {
  return createHash('sha1').update(url).digest('hex').slice(0, 12);
}

export function storyFromRaw(item: RawItem, retrievedAt: string): Story {
  const text = `${item.title} ${item.snippet}`;
  return {
    id: idFor(item.url),
    title: item.title,
    url: item.url,
    source: item.source,
    sources: [{ name: item.source, url: item.url, publishedAt: item.publishedAt, official: item.official }],
    publishedAt: item.publishedAt,
    retrievedAt,
    snippet: item.snippet,
    categories: categorize(text),
    cves: extractCves(text),
    kev: null,
    cvss: null,
    score: 0,
    priority: 'low',
    reasons: [],
    verification: [],
    confidence: 'single-source',
    summary: '',
    whyItMatters: '',
    whoIsAffected: '',
    aiGenerated: false,
    origin: item.origin ?? 'feed',
  };
}

export function storyFromKev(k: KevInfo, retrievedAt: string): Story {
  const nvdUrl = `https://nvd.nist.gov/vuln/detail/${k.cveID}`;
  const text = `${k.vulnerabilityName} ${k.shortDescription} known exploited`;
  return {
    ...storyFromRaw(
      {
        title: `${k.vendorProject} ${k.product}: ${k.vulnerabilityName} (${k.cveID})`,
        url: nvdUrl,
        publishedAt: `${k.dateAdded}T00:00:00.000Z`,
        snippet: k.shortDescription,
        source: 'CISA KEV catalog',
        official: true,
      },
      retrievedAt,
    ),
    id: `kev-${k.cveID.toLowerCase()}`,
    categories: [...new Set(['exploited', 'vulnerability', ...categorize(text)])] as Story['categories'],
    cves: [k.cveID],
    kev: k,
    origin: 'kev',
    sources: [
      { name: 'CISA KEV catalog', url: KEV_CATALOG_PAGE, publishedAt: `${k.dateAdded}T00:00:00.000Z`, official: true },
      { name: 'NVD', url: nvdUrl, publishedAt: null, official: true },
    ],
  };
}

/** Attach KEV data to news stories that mention a KEV CVE; add KEV-only stories for the rest. */
export function linkKev(stories: Story[], kevRecent: KevInfo[], allKev: Map<string, KevInfo>, retrievedAt: string): Story[] {
  const covered = new Set<string>();
  for (const s of stories) {
    const hit = s.cves.map((c) => allKev.get(c)).find(Boolean);
    if (hit) {
      s.kev = hit;
      if (!s.categories.includes('exploited')) s.categories = ['exploited', ...s.categories.filter((c) => c !== 'general')];
      if (!s.sources.some((r) => r.url === KEV_CATALOG_PAGE)) {
        s.sources.push({ name: 'CISA KEV catalog', url: KEV_CATALOG_PAGE, publishedAt: `${hit.dateAdded}T00:00:00.000Z`, official: true });
      }
      for (const c of s.cves) covered.add(c);
    }
  }
  const kevStories = kevRecent.filter((k) => !covered.has(k.cveID)).map((k) => storyFromKev(k, retrievedAt));
  return [...stories, ...kevStories];
}

async function enrichWithNvd(stories: Story[], statuses: SourceStatus[]) {
  const { nvdKey, nvdMaxLookups } = getEnv();
  const store = await readStore();
  const cache = { ...store.nvdCache };
  const weekAgo = Date.now() - 7 * 86_400_000;
  const wanted: string[] = [];
  for (const s of stories.slice(0, 30)) for (const c of s.cves.slice(0, 2)) if (!wanted.includes(c)) wanted.push(c);

  let looked = 0;
  let failed = 0;
  let lastError = '';
  for (const cve of wanted) {
    const cached = cache[cve];
    if (cached && Date.parse(cached.fetchedAt) > weekAgo) continue;
    if (looked >= nvdMaxLookups) break;
    setProgress(`Looking up CVSS for ${cve} on NVD`);
    try {
      cache[cve] = { cvss: await fetchNvdCvss(cve), fetchedAt: new Date().toISOString() };
    } catch (err) {
      failed++;
      lastError = (err as Error).message;
    }
    looked++;
    // NVD public rate limit: 5 requests / 30 s without a key, 50 / 30 s with a key.
    await sleep(nvdKey ? 700 : 6_500);
  }
  for (const s of stories) {
    for (const c of s.cves) {
      const hit = cache[c]?.cvss;
      if (hit && (!s.cvss || hit.score > s.cvss.score)) s.cvss = hit;
    }
  }
  await updateStore((d) => {
    d.nvdCache = { ...d.nvdCache, ...cache };
  });
  statuses.push({
    name: 'NVD CVE API',
    kind: 'nvd',
    ok: failed === 0,
    items: looked - failed,
    error: failed ? `${failed} lookup(s) failed: ${lastError}` : undefined,
    fetchedAt: new Date().toISOString(),
  });
}

/**
 * After reading full articles we may discover CVEs that already have a KEV-only story.
 * Fold those KEV-only stories into the news story instead of showing the same CVE twice.
 */
export function foldKevIntoNews(stories: Story[]): Story[] {
  const kevOnly = new Map(stories.filter((s) => s.origin === 'kev').map((s) => [s.cves[0], s]));
  const dropped = new Set<Story>();
  for (const s of stories) {
    if (s.origin === 'kev' || s.kev) continue;
    const hit = s.cves.map((c) => kevOnly.get(c)).find((k) => k && !dropped.has(k));
    if (!hit || !hit.kev) continue;
    s.kev = hit.kev;
    if (!s.categories.includes('exploited')) s.categories = ['exploited', ...s.categories.filter((c) => c !== 'general')];
    for (const ref of hit.sources) if (!s.sources.some((r) => r.url === ref.url)) s.sources.push(ref);
    dropped.add(hit);
  }
  return stories.filter((s) => !dropped.has(s));
}

export async function runRefresh(trigger: Briefing['trigger']): Promise<Briefing> {
  const now = new Date();
  const retrievedAt = now.toISOString();
  const env = getEnv();
  const store0 = await readStore();
  const { preferences: prefs, briefings: previous } = store0;
  const feeds = resolveFeeds(store0);
  // Remember when each URL was first seen, so the dashboard can mark genuinely NEW stories.
  const firstSeen = new Map<string, string>();
  for (const b of previous.slice(0, 5)) for (const st of b.stories) if (st.firstSeenAt && !firstSeen.has(urlKey(st.url))) firstSeen.set(urlKey(st.url), st.firstSeenAt);
  const statuses: SourceStatus[] = [];
  const noItems: { items: RawItem[]; status: SourceStatus | null } = { items: [], status: null };

  setProgress(`Fetching ${feeds.length} feeds, Hacker News, leak-site trackers and the CISA KEV catalog`);
  let feedsDone = 0;
  const [feedResults, kev, hn, leaks] = await Promise.all([
    // Limit concurrency so many feeds don't hammer the network or the sites.
    mapLimit(feeds, 8, async (f) => {
      const r = await fetchFeed(f, now);
      setProgress(`Fetching feeds (${++feedsDone}/${feeds.length})`);
      return r;
    }),
    fetchKev(now),
    env.enableHackerNews ? fetchHackerNews(now, prefs.lookbackDays) : Promise.resolve(noItems),
    env.enableRansomwareLive ? fetchRansomwareLive(now, prefs.lookbackDays) : Promise.resolve(noItems),
  ]);
  statuses.push(...feedResults.map((r) => r.status), kev.status);
  if (hn.status) statuses.push(hn.status);
  if (leaks.status) statuses.push(leaks.status);

  const cutoff = now.getTime() - prefs.lookbackDays * 86_400_000;
  const raw = [...feedResults.flatMap((r) => r.items), ...hn.items, ...leaks.items].filter(
    (i) => !i.publishedAt || Date.parse(i.publishedAt) >= cutoff,
  );

  setProgress('Cleaning and de-duplicating stories');
  // Oldest first so the earliest report becomes the primary source of a merged story.
  raw.sort((a, b) => (a.publishedAt ?? '9').localeCompare(b.publishedAt ?? '9'));
  let stories = dedupeStories(raw.map((i) => storyFromRaw(i, retrievedAt)));

  const kevMap = new Map(kev.entries.map((k) => [k.cveID, k]));
  stories = linkKev(stories, recentKev(kev.entries, now, Math.max(prefs.lookbackDays, 7)), kevMap, retrievedAt);

  // First ranking pass decides which articles to read and which CVEs to look up.
  for (const s of stories) Object.assign(s, scoreStory(s, prefs, now));
  stories.sort((a, b) => b.score - a.score);

  // Read the full text of the most important articles.
  const toRead = stories.filter((s) => s.origin === 'feed' || s.origin === 'community').slice(0, env.articleReadLimit);
  let read = 0;
  await mapLimit(toRead, 3, async (s) => {
    setProgress(`Reading articles (${++read}/${toRead.length})`);
    const r = await readArticle(s.url);
    s.articleStatus = r.status;
    if (r.status === 'read') {
      s.articleText = r.text.slice(0, 3000);
      s.cves = [...new Set([...s.cves, ...extractCves(r.text)])].slice(0, 15);
      const hit = s.kev ?? s.cves.map((c) => kevMap.get(c)).find(Boolean) ?? null;
      if (hit && !s.kev) {
        s.kev = hit;
        if (!s.categories.includes('exploited')) s.categories = ['exploited', ...s.categories.filter((c) => c !== 'general')];
        if (!s.sources.some((x) => x.url === KEV_CATALOG_PAGE)) {
          s.sources.push({ name: 'CISA KEV catalog', url: KEV_CATALOG_PAGE, publishedAt: `${hit.dateAdded}T00:00:00.000Z`, official: true });
        }
      }
    }
  });
  const readOk = toRead.filter((s) => s.articleStatus === 'read').length;
  statuses.push({
    name: env.scraperApiKey ? 'Article reader (via ScraperAPI)' : 'Article reader',
    kind: 'web',
    ok: toRead.length === 0 || readOk > 0,
    items: readOk,
    error: toRead.length - readOk ? `${toRead.length - readOk} of ${toRead.length} articles not read (blocked by robots.txt, paywall or error)` : undefined,
    fetchedAt: new Date().toISOString(),
  });
  stories = foldKevIntoNews(stories);

  // Threat-intel enrichment (MITRE ATT&CK, MISP galaxy, TTP profiles).
  if (env.enableIntel) {
    setProgress('Matching stories to MITRE ATT&CK and MISP threat-actor data');
    try {
      const intel = await getIntel();
      if (intel) {
        for (const s of stories) {
          const found = matchIntel(`${s.title}\n${s.snippet}\n${s.articleText ?? ''}`, intel.index, intel.matchers);
          if (found.actors.length || found.techniques.length) s.intel = found;
        }
        const st = intel.index.status;
        statuses.push({
          name: 'Threat intel (ATT&CK, MISP, TTP profiles)',
          kind: 'intel',
          ok: intel.index.groups.length > 0,
          items: stories.filter((s) => s.intel).length,
          error: [st.attack, st.misp, st.profiles].some((x) => x.startsWith('failed')) ? `ATT&CK ${st.attack}; MISP ${st.misp}; profiles ${st.profiles}` : undefined,
          fetchedAt: intel.index.builtAt,
        });
      }
    } catch (err) {
      statuses.push({ name: 'Threat intel (ATT&CK, MISP, TTP profiles)', kind: 'intel', ok: false, items: 0, error: (err as Error).message, fetchedAt: new Date().toISOString() });
    }
  }

  for (const s of stories) Object.assign(s, scoreStory(s, prefs, now));
  stories.sort((a, b) => b.score - a.score);
  await enrichWithNvd(stories, statuses);

  setProgress('Ranking stories');
  for (const s of stories) Object.assign(s, scoreStory(s, prefs, now));
  stories.sort((a, b) => b.score - a.score || (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  // Keep EVERYTHING we read in the live feed log, not just the top-60 briefing.
  const pool = stories.slice();
  stories = stories.slice(0, MAX_STORIES);
  for (const s of stories) s.firstSeenAt = firstSeen.get(urlKey(s.url)) ?? retrievedAt;

  setProgress('Asking Gemini to explain the briefing in simple English');
  const ai = await summarizeBriefing(stories);
  statuses.push({
    name: 'Gemini summarisation',
    kind: 'gemini',
    ok: ai.aiStatus === 'ok',
    items: ai.stories.filter((s) => s.aiGenerated).length,
    error: ai.aiError,
    fetchedAt: new Date().toISOString(),
  });

  const briefing: Briefing = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    trigger,
    stories: ai.stories,
    executiveSummary: ai.executiveSummary,
    spokenScript: ai.spokenScript,
    recommendations: ai.recommendations,
    aiStatus: ai.aiStatus,
    aiError: ai.aiError,
    sourceStatus: statuses,
  };

  const okSources = statuses.filter((s) => (s.kind === 'rss' || s.kind === 'kev') && s.ok).length;
  if (okSources === 0) throw new Error('Every source failed. Check your internet connection. Nothing was saved.');

  await updateStore((d) => {
    // Live mode replaces today's previous live snapshot instead of filling up History.
    const top = d.briefings[0];
    const sameDay = top && zonedParts(new Date(top.createdAt), prefs.timezone).dateKey === zonedParts(new Date(), prefs.timezone).dateKey;
    if (trigger === 'live' && top?.trigger === 'live' && sameDay) d.briefings[0] = briefing;
    else d.briefings.unshift(briefing);
    // Raise alerts for NEW critical/exploited stories we have not alerted on before.
    // On the very first refresh there is no history, so we only baseline (no alert flood).
    const firstEver = previous.length === 0 && d.alertedUrls.length === 0;
    const { alerts, alertedUrls } = diffNewAlerts(briefing.stories, d.alertedUrls, new Date());
    if (!firstEver && alerts.length) d.alerts = [...alerts, ...d.alerts].slice(0, 100);
    d.alertedUrls = alertedUrls;
    // Live feed log + live counters (so the dashboard visibly changes as feeds are checked).
    const aiByUrl = new Map(briefing.stories.map((st) => [st.url, st]));
    if (!d.feedLog.length) for (const b of [...previous].reverse()) d.feedLog = mergeFeedLog(d.feedLog, b.stories, b.createdAt).log; // first time: keep what we already had
    const merged = mergeFeedLog(d.feedLog, pool.map((p) => aiByUrl.get(p.url) ?? p), retrievedAt);
    d.feedLog = merged.log;
    d.meta.checks = (d.meta.checks ?? 0) + 1;
    d.meta.lastNewItems = merged.added;
    d.meta.lastPoolSize = pool.length;
    d.meta.lastRunAt = briefing.createdAt;
    d.meta.lastError = null;
  });
  return briefing;
}

/** Start a refresh in the background. Returns false if one is already running. */
export function startRefresh(trigger: Briefing['trigger']): boolean {
  const state = getRefreshState();
  if (state.running) return false;
  state.running = true;
  state.startedAt = new Date().toISOString();
  state.lastError = null;
  setProgress('Starting');
  runRefresh(trigger)
    .catch(async (err: Error) => {
      state.lastError = err.message;
      await updateStore((d) => {
        d.meta.lastError = err.message;
      }).catch(() => undefined);
    })
    .finally(() => {
      state.running = false;
      state.progress = '';
      state.lastFinishedAt = new Date().toISOString();
    });
  return true;
}
