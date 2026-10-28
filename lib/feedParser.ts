// A small, dependency-free RSS 2.0 / Atom parser.
// Feeds are UNTRUSTED input: we only extract a few text fields, strip all HTML,
// and never execute or follow anything inside them.
import type { RawItem } from './types';
import { canonicalUrl, decodeEntities, parseDate, stripHtml } from './normalize';

const MAX_ITEMS_PER_FEED = 50;

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Turn element content into text: CDATA kept raw, everything else entity-decoded. */
function xmlText(inner: string): string {
  let out = '';
  let last = 0;
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner))) {
    out += decodeEntities(inner.slice(last, m.index)) + m[1];
    last = m.index + m[0].length;
  }
  out += decodeEntities(inner.slice(last));
  return out.trim();
}

function firstTag(block: string, names: string[]): string | null {
  for (const name of names) {
    const re = new RegExp(`<${escapeRe(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeRe(name)}>`, 'i');
    const m = re.exec(block);
    if (m) {
      const text = xmlText(m[1]);
      if (text) return text;
    }
  }
  return null;
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? decodeEntities(m[2] ?? m[3] ?? '') : null;
}

function atomLink(block: string): string | null {
  const links = block.match(/<link\b[^>]*\/?>/gi) ?? [];
  let fallback: string | null = null;
  for (const l of links) {
    const href = attr(l, 'href');
    if (!href) continue;
    const rel = attr(l, 'rel');
    if (!rel || rel === 'alternate') return href;
    fallback ??= href;
  }
  return fallback;
}

/** Does this text look like an HTML page rather than an RSS/Atom feed? */
export function looksLikeHtml(text: string): boolean {
  const head = text.slice(0, 2000).toLowerCase();
  return /<!doctype html|<html[\s>]/.test(head) && !/<rss[\s>]|<feed[\s>]|<rdf:rdf/.test(head);
}

/**
 * Feed auto-discovery: an ordinary web page (a blog home page) usually advertises its RSS/Atom feed with
 * <link rel="alternate" type="application/rss+xml" href="…">. Returns the absolute feed URLs found.
 */
export function discoverFeedLinks(html: string, pageUrl: string): string[] {
  const out: string[] = [];
  for (const tag of html.slice(0, 300_000).match(/<link\b[^>]*>/gi) ?? []) {
    const rel = (attr(tag, 'rel') ?? '').toLowerCase();
    const type = (attr(tag, 'type') ?? '').toLowerCase();
    const href = attr(tag, 'href');
    if (!href || !rel.split(/\s+/).includes('alternate')) continue;
    if (!/(rss|atom)\+xml|application\/xml|text\/xml/.test(type)) continue;
    if (/comments?\/feed|\/comments\b/i.test(href)) continue; // skip "comments" feeds
    try {
      const abs = new URL(href, pageUrl).toString();
      if (/^https?:/.test(abs) && !out.includes(abs)) out.push(abs);
    } catch {
      /* bad href */
    }
  }
  return out;
}

export function parseFeed(xml: string, source: string, official: boolean, now: Date = new Date(), aggregator = false): RawItem[] {
  const items: RawItem[] = [];
  const blockRe = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(xml)) && items.length < MAX_ITEMS_PER_FEED) {
    const block = m[2];
    const title = stripHtml(firstTag(block, ['title']) ?? '', 300);
    let link = firstTag(block, ['link']);
    if (!link || !/^https?:/i.test(link)) link = atomLink(block);
    if (!link) {
      const guid = firstTag(block, ['guid', 'id']);
      if (guid && /^https?:/i.test(guid)) link = guid;
    }
    const url = link ? canonicalUrl(link) : null;
    if (!title || !url) continue; // skip items we cannot cite properly
    const rawDate = firstTag(block, ['pubDate', 'dc:date', 'published', 'updated', 'a10:updated']);
    const desc = firstTag(block, ['description', 'summary', 'content:encoded', 'content']) ?? '';
    // News aggregators (Google News) name the real publisher in <source>; credit them, and drop the
    // " - Publisher" suffix from the title so the same story from two feeds de-duplicates.
    let publisher = stripHtml(firstTag(block, ['source']) ?? '', 80);
    if (!publisher && aggregator) {
      const m2 = / - ([^-]{2,60})$/.exec(title); // "Headline - Publisher"
      if (m2) publisher = m2[1].trim();
    }
    let cleanTitle = title;
    if (publisher && title.toLowerCase().endsWith(` - ${publisher.toLowerCase()}`)) cleanTitle = title.slice(0, -(publisher.length + 3)).trim();
    items.push({
      title: cleanTitle,
      url,
      publishedAt: parseDate(rawDate, now),
      snippet: stripHtml(desc, 600).replace(cleanTitle, '').replace(/^\s*[-–]\s*/, '').trim(),
      source: publisher && aggregator ? publisher : source,
      official,
    });
  }
  return items;
}
