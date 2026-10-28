// Understand what the user asked the Jarvis-style assistant. Pure functions, no network.
import type { ScanKind } from './types';
import { isBriefingIntent, stripWakePhrase } from './intent';
import { soundsLike } from './fuzzy';

export type Intent =
  | { type: 'wake' }
  | { type: 'stop' }
  | { type: 'help' }
  | { type: 'about' }
  | { type: 'briefing' }
  | { type: 'top' }
  | { type: 'story'; index: number }
  | { type: 'cve'; cve: string }
  | { type: 'technique'; id: string }
  | { type: 'actor'; name: string }
  | { type: 'navigate'; view: 'home' | 'overview' | 'history' | 'settings' | 'scans' | 'intel' | 'sources' | 'feedlog' | 'graph' }
  | { type: 'export' }
  | { type: 'scan'; kind: ScanKind; target: string }
  | { type: 'voice-rate'; delta: number }
  | { type: 'outlook' }
  | { type: 'graph'; mode: 'targets' | 'connected'; query: string; nodeType: 'actor' | 'malware' | 'cve' }
  | { type: 'chat'; text: string };

const ORDINALS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, one: 1, two: 2, three: 3, four: 4, five: 5 };

export function routeIntent(input: string): Intent {
  const text = stripWakePhrase(input).replace(/\s+/g, ' ').trim();
  const t = text.toLowerCase();
  if (!t) return detectWake(input).woke ? { type: 'wake' } : { type: 'briefing' };
  if (/^(stop|quiet|silence|cancel|enough|shut up|pause)\b/.test(t)) return { type: 'stop' };
  if (/\b(who are you|who r you|who is siva|what is siva|what are you|introduce yourself|tell me about yourself|about yourself|your name|what can you do|what are you capable|how capable|your (capabilities|abilities|features)|why should i use you)\b/.test(t)) return { type: 'about' };
  if (/\b(help me use|how do i use you|^help$)/.test(t)) return { type: 'help' };
  if (/\b(speak|talk|read)\s+(slower|more slowly)/.test(t)) return { type: 'voice-rate', delta: -0.15 };
  if (/\b(speak|talk|read)\s+(faster|quicker)/.test(t)) return { type: 'voice-rate', delta: 0.15 };

  const nav = /\b(open|show|go to|take me to)\s+(the\s+)?(threat graph|graph|connections|settings|history|scans?|scanner|intel|threat intel|toolbox|intelligence dashboard|intelligence|dashboard|home|live sources|sources|feed log|live feed log|feed)\b/.exec(t);
  if (nav) {
    const w = nav[3];
    const view = w.includes('graph') || w === 'connections' ? 'graph' : w.endsWith('sources') ? 'sources' : w.includes('feed') ? 'feedlog' : w.startsWith('scan') ? 'scans' : w === 'intel' || w === 'threat intel' || w === 'toolbox' ? 'intel' : w === 'home' ? 'home' : w.includes('dashboard') || w === 'intelligence' ? 'overview' : (w as 'settings' | 'history');
    return { type: 'navigate', view };
  }
  if (/\b(export|notebook ?lm|notebook)\b/.test(t)) return { type: 'export' };

  const scan = /\bscan\s+(?:my\s+|the\s+)?(website|web ?site|site|domain|image|container|docker image|repo|repository|folder|directory|path)\s+(.+)$/i.exec(text);
  if (scan) {
    const what = scan[1].toLowerCase();
    const target = scan[2].trim().replace(/[.?!]+$/, '');
    const kind: ScanKind = /image|container/.test(what) ? 'trivy-image' : /repo/.test(what) ? 'trivy-repo' : /folder|directory|path/.test(what) ? 'trivy-fs' : 'web';
    return { type: 'scan', kind, target };
  }
  const bareScan = /\bscan\s+([a-z0-9.-]+\.[a-z]{2,})\b/i.exec(text);
  if (bareScan) return { type: 'scan', kind: 'web', target: bareScan[1] };

  // Threat Graph questions (connect the dots across all stories).
  if (/\b(threat outlook|weekly outlook|security outlook|outlook for (this|the) week|what'?s (rising|trending)|trending (threats|attacks)|what changed this week|this week'?s (trends|threats))\b/.test(t) || /^outlook$/.test(t)) return { type: 'outlook' };
  const targets = /\bwhich\s+(?:hacker\s+)?(groups?|actors?|gangs?|hackers|attackers|apts?|ransomware(?: gangs| groups)?|malware|cves?|vulnerabilities|bugs)\b.*?\b(?:are\s+|is\s+)?(?:targeting|target|attacking|attack|exploiting|exploit|going after|hitting|affecting|affect|in)\s+(.+?)\s*\??$/.exec(t);
  if (targets) {
    const w = targets[1];
    const nodeType = /malware/.test(w) ? 'malware' : /cve|vulnerab|bug/.test(w) ? 'cve' : 'actor';
    return { type: 'graph', mode: 'targets', query: targets[2].replace(/^(the|my)\s+/, '').replace(/\s+(this|last)\s+(week|month)$/, ''), nodeType };
  }
  const conn = /\b(?:connected|linked|related|connections?|links?)\s+(?:to|with|for|of)\s+(.+?)\s*\??$/.exec(t) ?? /\bconnect the dots (?:on|for|about)\s+(.+?)\s*\??$/.exec(t);
  if (conn) return { type: 'graph', mode: 'connected', query: conn[1].replace(/^(the)\s+/, ''), nodeType: 'actor' };

  const cve = /CVE-\d{4}-\d{4,7}/i.exec(text);
  if (cve) return { type: 'cve', cve: cve[0].toUpperCase() };
  const tech = /\bT\d{4}(?:\.\d{3})?\b/.exec(text);
  if (tech) return { type: 'technique', id: tech[0] };

  const story = /\b(?:story|item|number|news)\s*(?:number\s*)?(\d{1,2})\b/.exec(t) ?? /\b(?:read|open|explain|tell me about)\s+(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/.exec(t);
  if (story) {
    const n = /^\d+$/.test(story[1]) ? Number(story[1]) : ORDINALS[story[1]];
    if (n >= 1) return { type: 'story', index: n };
  }

  if (isBriefingIntent(text)) return { type: 'briefing' };
  if (/\b(top|most (important|urgent|critical)|critical (ones|items|threats)|what should i (patch|fix|do) first|priorit)/.test(t)) return { type: 'top' };

  const actor = /^(?:who (?:is|are)|tell me about|what do (?:we|you) know about|explain|profile(?: of)?)\s+(?:the\s+)?(.+?)(?:\s+(?:group|gang|ransomware|apt|hackers))?\s*\??$/i.exec(text);
  if (actor && actor[1].length >= 3 && actor[1].split(' ').length <= 5) return { type: 'actor', name: actor[1] };

  return { type: 'chat', text };
}

/** Hands-free mode: detect "Hey Siva" / "Jarvis" and return the command spoken after it. */
const WAKE_NAMES = ['siva', 'shiva', 'jarvis'];

/**
 * Detect "Hey Siva" even when speech-to-text mis-hears the name ("shiva", "saiva", "civa",
 * "sheeva", "jarvis", "driver"...). Returns whatever was said after the wake word as the command.
 */
export function detectWake(heard: string): { woke: boolean; command: string } {
  const text = heard.trim();
  if (!text) return { woke: false, command: '' };
  // Fast path: exact-ish match with an optional greeting.
  const m = /^\s*(?:(?:hey|hi|ok|okay|hello|a|ay)\s+)?(siva|shiva|jarvis)\b[\s,.:!?-]*(.*)$/i.exec(text);
  if (m) return { woke: true, command: m[2].trim() };
  // Fuzzy path: look at the first few words for something that sounds like the name.
  const words = text.split(/\s+/);
  const skip = new Set(['hey', 'hi', 'ok', 'okay', 'hello', 'a', 'ay', 'yo', 'hay']);
  for (let i = 0; i < Math.min(words.length, 3); i++) {
    const bare = words[i].replace(/[^a-z0-9]/gi, '');
    if (!bare) continue;
    if (skip.has(bare.toLowerCase())) continue;
    if (soundsLike(bare, WAKE_NAMES)) return { woke: true, command: words.slice(i + 1).join(' ').trim() };
    break; // only the first real word can be the name
  }
  // Mid-sentence ("okay so hey siva what is…"): only with a greeting right before the name, so
  // just mentioning Shiva in conversation does not wake her.
  const greet = new Set(['hey', 'hi', 'ok', 'okay', 'hello', 'hay']);
  for (let i = 1; i < words.length - 1; i++) {
    if (!greet.has(words[i].replace(/[^a-z]/gi, '').toLowerCase())) continue;
    const name = words[i + 1].replace(/[^a-z0-9]/gi, '');
    if (name && soundsLike(name, WAKE_NAMES)) return { woke: true, command: words.slice(i + 2).join(' ').replace(/^[\s,.:!?-]+/, '').trim() };
  }
  return { woke: false, command: '' };
}

/**
 * Check every alternative the speech engine offered (it often has "hey shiva" as its 2nd guess).
 * Returns the first alternative that contains the wake word, else the top guess with woke=false.
 */
export function detectWakeAny(alternatives: string[]): { woke: boolean; command: string; text: string } {
  for (const alt of alternatives) {
    const w = detectWake(alt);
    if (w.woke) return { ...w, text: alt.trim() };
  }
  return { woke: false, command: '', text: (alternatives[0] ?? '').trim() };
}
