// Reads the full text of news/blog articles so summaries are based on more than a feed snippet.
// Polite by design: respects robots.txt, identifies itself, reads only article URLs that came
// from feeds (no crawling), limits how many pages per refresh, and treats page text as untrusted.
// Optional: SCRAPERAPI_KEY routes requests through ScraperAPI (https://docs.scraperapi.com) for
// sites that block simple requests. The key stays on the server.
import { getEnv } from './config';
import { fetchWithRetry, readTextLimited } from './http';
import { decodeEntities, stripHtml } from './normalize';

const g = globalThis as unknown as { __sivaRobots?: Map<string, { rules: RobotsRule[]; at: number }> };

export interface RobotsRule {
  allow: boolean;
  path: string;
}

/** Parse robots.txt and return the rules that apply to us (our agent group, else the "*" group). */
export function parseRobots(text: string, agentToken = 'siva'): RobotsRule[] {
  const groups: { agents: string[]; rules: RobotsRule[] }[] = [];
  let current: { agents: string[]; rules: RobotsRule[] } | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && current) {
      lastWasAgent = false;
      if (key === 'disallow' && value === '') continue; // empty Disallow = allow all
      current.rules.push({ allow: key === 'allow', path: value });
    } else {
      lastWasAgent = false;
    }
  }
  const mine = groups.find((gr) => gr.agents.some((a) => a !== '*' && agentToken.includes(a)));
  return (mine ?? groups.find((gr) => gr.agents.includes('*')))?.rules ?? [];
}

function ruleMatches(rulePath: string, path: string): boolean {
  if (!rulePath) return false;
  const anchored = rulePath.endsWith('$');
  const pattern = rulePath.replace(/\$$/, '').split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${pattern}${anchored ? '$' : ''}`).test(path);
}

/** Longest matching rule wins; ties go to Allow (Google's documented behaviour). */
export function isAllowedByRobots(rules: RobotsRule[], path: string): boolean {
  let best: RobotsRule | null = null;
  for (const r of rules) {
    if (!ruleMatches(r.path, path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}

async function robotsRulesFor(origin: string): Promise<RobotsRule[]> {
  g.__sivaRobots ??= new Map();
  const cached = g.__sivaRobots.get(origin);
  if (cached && Date.now() - cached.at < 12 * 3_600_000) return cached.rules;
  let rules: RobotsRule[] = [];
  try {
    const res = await fetchWithRetry(`${origin}/robots.txt`, { headers: { 'user-agent': getEnv().userAgent }, retries: 1, timeoutMs: 8_000, publicOnly: true });
    rules = parseRobots(await readTextLimited(res, 500_000));
  } catch {
    rules = []; // no robots.txt (or unreachable) = no restrictions
  }
  g.__sivaRobots.set(origin, { rules, at: Date.now() });
  return rules;
}

/** Extract readable article text from HTML. Prefers <article>, falls back to paragraphs. */
export function extractMainText(html: string, maxLen = 4000): string {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|iframe|template)\b[\s\S]*?<\/\1>/gi, ' ');
  const article = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(cleaned)?.[1];
  const scope = article && stripHtml(article, 100_000).length > 300 ? article : cleaned;
  const paragraphs = [...scope.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripHtml(m[1], 2000))
    .filter((p) => p.length > 40 && !/cookie|subscribe|newsletter|sign up|all rights reserved/i.test(p));
  const text = paragraphs.length >= 2 ? paragraphs.join('\n\n') : stripHtml(scope, maxLen * 2);
  const out = decodeEntities(text).replace(/[ \t]+/g, ' ').trim();
  return out.length > maxLen ? out.slice(0, maxLen - 1).trimEnd() + '…' : out;
}

const SKIP_HOSTS = /(^|\.)(news\.ycombinator\.com|ransomware\.live|nvd\.nist\.gov|cisa\.gov|example\.com)$/i;

export type ArticleResult = { status: 'read'; text: string } | { status: 'blocked-by-robots' | 'failed' | 'skipped'; error?: string };

export async function readArticle(url: string): Promise<ArticleResult> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { status: 'skipped' };
  }
  if (!/^https?:$/.test(u.protocol) || SKIP_HOSTS.test(u.hostname)) return { status: 'skipped' };
  const rules = await robotsRulesFor(u.origin);
  if (!isAllowedByRobots(rules, u.pathname + u.search)) return { status: 'blocked-by-robots' };

  const { scraperApiKey, userAgent } = getEnv();
  const target = scraperApiKey
    ? `https://api.scraperapi.com/?api_key=${encodeURIComponent(scraperApiKey)}&url=${encodeURIComponent(url)}`
    : url;
  try {
    const res = await fetchWithRetry(target, {
      headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml' },
      retries: 1,
      publicOnly: !scraperApiKey, // with ScraperAPI the request goes to their server, not ours
      timeoutMs: scraperApiKey ? 70_000 : 15_000,
    });
    const type = res.headers.get('content-type') ?? '';
    if (type && !/html|xml|text/i.test(type)) return { status: 'skipped', error: `not an HTML page (${type})` };
    const text = extractMainText(await readTextLimited(res, 4_000_000));
    if (text.length < 200) return { status: 'failed', error: 'could not find article text' };
    return { status: 'read', text };
  } catch (err) {
    return { status: 'failed', error: (err as Error).message };
  }
}

/** Run async jobs with limited concurrency (polite to websites). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
