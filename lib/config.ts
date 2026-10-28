// Central configuration: which sources Siva reads, and settings from environment variables.
// Secrets (API keys) are ONLY read here, on the server. They are never sent to the browser.
import { DEFAULT_VOICE_COMMANDS } from './voiceCommands';
import path from 'node:path';
import type { FeedConfig, Preferences } from './types';

/**
 * RSS/Atom feeds. These are public feeds the publishers offer for exactly this purpose.
 * If a feed URL changes or fails, the dashboard shows it in "Source status" and the
 * rest of the briefing still works. Add or remove feeds here.
 */
export const FEEDS: FeedConfig[] = [
  { name: 'CISA Advisories', url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml', official: true },
  { name: 'Microsoft Security Update Guide', url: 'https://api.msrc.microsoft.com/update-guide/rss', official: true },
  { name: 'Cisco PSIRT', url: 'https://sec.cloudapps.cisco.com/security/center/psirtrss20/CiscoSecurityAdvisory.xml', official: true },
  { name: 'AWS Security Bulletins', url: 'https://aws.amazon.com/security/security-bulletins/rss/feed/', official: true },
  { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', official: false },
  { name: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/', official: false },
  { name: 'SecurityWeek', url: 'https://www.securityweek.com/feed/', official: false },
  { name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/', official: false },
  { name: 'Dark Reading', url: 'https://www.darkreading.com/rss.xml', official: false },
  // ZeroHour (zerohour.day): AI-classified security news from ~117 sources; importance >= 30, cyber only.
  { name: 'ZeroHour', url: 'https://zerohour.day/feed.xml?domain=cyber', official: false },
  // More cybersecurity news
  { name: 'The Record', url: 'https://therecord.media/feed', official: false },
  { name: 'Security Affairs', url: 'https://securityaffairs.com/feed', official: false },
  { name: 'Help Net Security', url: 'https://www.helpnetsecurity.com/feed/', official: false },
  { name: 'CyberScoop', url: 'https://cyberscoop.com/feed/', official: false },
  { name: 'Infosecurity Magazine', url: 'https://www.infosecurity-magazine.com/rss/news/', official: false },
  { name: 'The Register Security', url: 'https://www.theregister.com/security/headlines.atom', official: false },
  { name: 'Cybernews', url: 'https://cybernews.com/feed/', official: false },
  { name: 'ETCISO (India)', url: 'https://ciso.economictimes.indiatimes.com/rss/topstories', official: false },
  // Research blogs (often include MITRE technique IDs)
  { name: 'SANS Internet Storm Center', url: 'https://isc.sans.edu/rssfeed_full.xml', official: false },
  { name: 'Cisco Talos', url: 'https://blog.talosintelligence.com/rss/', official: false },
  { name: 'Unit 42', url: 'https://unit42.paloaltonetworks.com/feed/', official: false },
  { name: 'Microsoft Security Blog', url: 'https://www.microsoft.com/en-us/security/blog/feed/', official: true },
  { name: 'Schneier on Security', url: 'https://www.schneier.com/feed/atom/', official: false },
];

/** Hacker News (Y Combinator) official search API by Algolia. Free, no key. */
export const HN_SEARCH_URL = 'https://hn.algolia.com/api/v1/search_by_date';
export const HN_QUERIES = ['security vulnerability', 'zero-day', 'ransomware', 'data breach', 'malware', 'CVE', 'exploit', 'supply chain attack'];

/** ransomware.live public API v2 (leak-site posts = CLAIMS, not confirmed breaches). */
export const RANSOMWARE_LIVE_URL = 'https://api.ransomware.live/v2/recentvictims';

/** Threat-intel reference data (downloaded at most once a week and cached in data/). */
export const ATTACK_STIX_URL = 'https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json';
export const MISP_THREAT_ACTOR_URL = 'https://raw.githubusercontent.com/MISP/misp-galaxy/main/clusters/threat-actor.json';
export const MISP_RANSOMWARE_URL = 'https://raw.githubusercontent.com/MISP/misp-galaxy/main/clusters/ransomware.json';
export const MISP_MALPEDIA_URL = 'https://raw.githubusercontent.com/MISP/misp-galaxy/main/clusters/malpedia.json';
/** abuse.ch ThreatFox IOC database (needs a free Auth-Key from https://auth.abuse.ch/). */
export const THREATFOX_URL = 'https://threatfox-api.abuse.ch/api/v1/';
/** Wikipedia REST API for short background summaries. */
export const WIKIPEDIA_SEARCH = 'https://en.wikipedia.org/w/api.php';
export const WIKIPEDIA_SUMMARY = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
export const TTP_PROFILES_API = 'https://api.github.com/repos/crocodyli/ThreatActors-TTPs/contents';
export const TTP_PROFILES_WEB = 'https://github.com/crocodyli/ThreatActors-TTPs/tree/main';

/** Curated OSINT / CTI toolbox shown in the Intel view (links only; these sites have no API). */
export const TOOLBOX_LINKS: { name: string; url: string; note: string }[] = [
  { name: 'MITRE ATT&CK', url: 'https://attack.mitre.org/', note: 'Adversary tactics, techniques and groups. Siva downloads its official STIX data weekly.' },
  { name: 'MISP Galaxy', url: 'https://github.com/MISP/misp-galaxy', note: 'Open (CC0) catalogue of threat actors and ransomware groups. Used for actor matching.' },
  { name: 'ThreatActors-TTPs (crocodyli)', url: 'https://github.com/crocodyli/ThreatActors-TTPs', note: 'Ransomware/actor TTP profiles, CVEs and DFIR commands. Siva links to matching profiles.' },
  { name: 'CTI start page (start.me)', url: 'https://start.me/p/wMrA5z/cyber-threat-intelligence', note: 'Large curated list of CTI resources. Open manually; it has no API.' },
  { name: 'OSINT Jet search tools', url: 'https://osintjet.com/en/osint-search-tools/', note: 'Launchers for public-source searches. Use only for lawful, authorised research.' },
  { name: 'ransomware.live', url: 'https://www.ransomware.live/', note: 'Leak-site tracker. Siva reads its API; posts are claims until the victim confirms.' },
  { name: 'CISA KEV catalog', url: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog', note: 'Confirmed exploited vulnerabilities.' },
  { name: 'CERT-In advisories', url: 'https://www.cert-in.org.in/', note: "India's national CERT. Check manually; no official feed is used." },
  { name: 'Hacking-Tools (yogsec)', url: 'https://github.com/yogsec/Hacking-Tools', note: 'Curated link list of pentest/ethical-hacking tools by category (MIT). Reference only — use any tool strictly on systems you own or are authorised to test.' },
];

/** Official CISA KEV catalog (JSON). Free, no key. */
export const KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
export const KEV_CATALOG_PAGE = 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog';

/** NVD CVE API 2.0. Free; an API key raises the rate limit. */
export const EPSS_URL = 'https://api.first.org/data/v1/epss';
export const CWE_API_URL = 'https://cwe-api.mitre.org/api/v1/cwe/weakness/';
export const NVD_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0';

export const DEFAULT_PREFERENCES: Preferences = {
  briefingTime: '07:30',
  timezone: 'Asia/Kolkata',
  scheduleEnabled: true,
  topics: ['ransomware', 'india', 'cloud', 'microsoft'],
  lookbackDays: 3,
  voiceRate: 0.95,
  voiceLang: 'en-IN',
  voiceName: '',
  voicePitch: 1,
  voiceGender: 'male',
  voiceCommands: DEFAULT_VOICE_COMMANDS,
  liveRefreshMinutes: 60,
  wakeOnLoad: true,
};

function intFromEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function getEnv() {
  return {
    geminiKey: (process.env.GEMINI_API_KEY ?? '').trim(),
    geminiModel: (process.env.GEMINI_MODEL ?? '').trim() || 'gemini-3.5-flash-lite',
    nvdKey: (process.env.NVD_API_KEY ?? '').trim(),
    nvdMaxLookups: intFromEnv(process.env.NVD_MAX_LOOKUPS, 8, 0, 40),
    dataDir: (process.env.DATA_DIR ?? '').trim() || path.join(process.cwd(), 'data'),
    schedulerDisabled: process.env.SIVA_DISABLE_SCHEDULER === '1',
    userAgent: 'Siva-Personal-Threat-Desk/1.0 (local, read-only)',
    // --- Patch 2 settings ---
    scraperApiKey: (process.env.SCRAPERAPI_KEY ?? '').trim(),
    articleReadLimit: intFromEnv(process.env.ARTICLE_READ_LIMIT, 15, 0, 40),
    enableHackerNews: process.env.ENABLE_HACKER_NEWS !== '0',
    enableRansomwareLive: process.env.ENABLE_RANSOMWARE_LIVE !== '0',
    enableIntel: process.env.ENABLE_THREAT_INTEL !== '0',
    scanAllowedDomains: listFromEnv(process.env.SCAN_ALLOWED_DOMAINS),
    scanAllowedPaths: listFromEnv(process.env.SCAN_ALLOWED_PATHS),
    scanAllowedRepoHosts: listFromEnv(process.env.SCAN_ALLOWED_REPO_HOSTS ?? 'github.com,gitlab.com,bitbucket.org'),
    trivyPath: (process.env.TRIVY_PATH ?? '').trim() || 'trivy',
    trivyServerUrl: (process.env.TRIVY_SERVER_URL ?? '').trim(),
    // --- Patch 4 settings ---
    abuseChKey: (process.env.ABUSECH_AUTH_KEY ?? '').trim(),
    enableWebSearch: process.env.ENABLE_WEB_SEARCH !== '0',
    enableWikipedia: process.env.ENABLE_WIKIPEDIA !== '0',
    userTitle: (process.env.SIVA_USER_TITLE ?? '').trim() || 'boss',
  };
}

function listFromEnv(value: string | undefined): string[] {
  return (value ?? '')
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
