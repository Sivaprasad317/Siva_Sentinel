// Tests for patch 2: Hacker News, ransomware.live, article reader, threat intel, scans, assistant, NotebookLM export.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimsToItems, parseHnHits, parseRansomwareLive } from '../lib/extraSources';
import { extractMainText, isAllowedByRobots, mapLimit, parseRobots } from '../lib/article';
import { buildMatchers, lookupIntel, matchIntel, parseAttackStix, parseMispCluster, parseProfileListing, type IntelIndex } from '../lib/intel';
import { analyzeHeaders, certFinding, hostAllowed, parseTrivyReport, ruleBasedExplanation, countBySeverity, trivyArgs, validateScanTarget } from '../lib/scan';
import { detectWake, routeIntent } from '../lib/assistantRouter';
import { buildSourcePack, sourceUrls } from '../lib/notebooklm';
import { foldKevIntoNews, storyFromKev, storyFromRaw } from '../lib/refresh';
import { parseNvdDetails } from '../lib/sources';
import type { Briefing, KevInfo } from '../lib/types';

const NOW = new Date('2026-10-17T12:00:00Z');

test('Hacker News: keeps security stories with traction, drops off-topic and low-score ones', () => {
  const items = parseHnHits(
    {
      hits: [
        { objectID: '1', title: 'New zero-day exploited in VPN appliances', url: 'https://ex.com/a?utm_source=hn', created_at: '2026-10-17T08:00:00Z', points: 120, num_comments: 40 },
        { objectID: '2', title: 'Show HN: my cooking app', url: 'https://ex.com/b', created_at: '2026-10-17T08:00:00Z', points: 300 },
        { objectID: '3', title: 'Ransomware hits hospital', url: 'https://ex.com/c', created_at: '2026-10-17T08:00:00Z', points: 3 },
        { objectID: '4', title: 'Data breach at retailer exposes records', created_at: '2026-10-17T08:00:00Z', points: 50, num_comments: 9 },
      ],
    },
    NOW,
  );
  assert.equal(items.length, 2);
  assert.equal(items[0].url, 'https://ex.com/a');
  assert.equal(items[0].origin, 'community');
  assert.equal(items[1].url, 'https://news.ycombinator.com/item?id=4', 'no URL -> discussion link');
  assert.throws(() => parseHnHits({}, NOW));
});

test('ransomware.live: claims are summarised, India claims listed, wording says "claim"', () => {
  const claims = parseRansomwareLive(
    [
      { victim: 'Acme Ltd', group: 'akira', attackdate: '2026-10-16 10:00:00', country: 'US' },
      { post_title: 'Bharat Foods', group_name: 'qilin', discovered: '2026-10-16T09:00:00Z', country: 'in' },
      { victim: 'Old Co', group: 'lockbit3', attackdate: '2026-09-01', country: 'IN' },
      { nothing: true },
    ],
    NOW,
  );
  assert.equal(claims.length, 3);
  const items = claimsToItems(claims, NOW, 3);
  assert.equal(items.length, 2, 'one summary + one recent India claim');
  assert.match(items[0].title, /2 new victim posts/);
  assert.match(items[1].title, /qilin ransomware claims attack on Bharat Foods \(IN\)/);
  assert.match(items[1].snippet, /not confirmed/);
});

test('robots.txt rules: longest match wins, our agent group preferred', () => {
  const rules = parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/public\n\nUser-agent: GPTBot\nDisallow: /');
  assert.equal(isAllowedByRobots(rules, '/news/1'), true);
  assert.equal(isAllowedByRobots(rules, '/private/x'), false);
  assert.equal(isAllowedByRobots(rules, '/private/public/y'), true);
  const mine = parseRobots('User-agent: *\nAllow: /\n\nUser-agent: siva\nDisallow: /');
  assert.equal(isAllowedByRobots(mine, '/anything'), false);
  assert.equal(isAllowedByRobots(parseRobots('User-agent: *\nDisallow:'), '/x'), true, 'empty Disallow allows all');
  assert.equal(isAllowedByRobots(parseRobots('User-agent: *\nDisallow: /*.pdf$'), '/a/b.pdf'), false);
});

test('article extraction prefers <article> paragraphs and drops scripts/nav', () => {
  const p = (t: string) => `<p>${t} ${'word '.repeat(30)}</p>`;
  const html = `<html><nav>${p('Menu nav text')}</nav><script>var x=1</script><article>${p('First real paragraph about the attack.')}${p('Second paragraph with &amp; details.')}<p>Subscribe to our newsletter for more updates and offers today now</p></article>${p('Footer outside article')}</html>`;
  const text = extractMainText(html);
  assert.match(text, /First real paragraph/);
  assert.match(text, /Second paragraph with & details/);
  assert.doesNotMatch(text, /Menu nav|var x|newsletter|Footer outside/);
});

test('mapLimit runs every job and keeps order', async () => {
  const out = await mapLimit([3, 1, 2], 2, async (n) => n * 10);
  assert.deepEqual(out, [30, 10, 20]);
});

const stix = {
  objects: [
    { type: 'intrusion-set', name: 'APT29', aliases: ['APT29', 'Cozy Bear', 'Midnight Blizzard'], description: 'Russian group. (Citation: X)', external_references: [{ source_name: 'mitre-attack', external_id: 'G0016', url: 'https://attack.mitre.org/groups/G0016' }] },
    { type: 'intrusion-set', name: 'Old', revoked: true, external_references: [{ source_name: 'mitre-attack', external_id: 'G9999' }] },
    { type: 'attack-pattern', name: 'PowerShell', external_references: [{ source_name: 'mitre-attack', external_id: 'T1059.001', url: 'https://attack.mitre.org/techniques/T1059/001' }], kill_chain_phases: [{ phase_name: 'execution' }] },
  ],
};

function index(): IntelIndex {
  const a = parseAttackStix(stix);
  const misp = parseMispCluster({
    values: [
      { value: 'Play', description: 'Play ransomware group', meta: { synonyms: ['PlayCrypt'], refs: ['https://example.org/play'] } },
      { value: 'Cozy Bear', meta: { synonyms: ['APT29'], country: 'RU' } },
      { value: 'Scattered Spider', meta: { synonyms: ['UNC3944', 'Octo Tempest'] } },
    ],
  });
  return { builtAt: NOW.toISOString(), groups: [...a.groups, ...misp], techniques: a.techniques, profiles: parseProfileListing([{ type: 'dir', name: 'Play' }, { type: 'dir', name: 'ALPHV-BlackCat' }, { type: 'file', name: 'README.md' }, { type: 'dir', name: 'Commands' }]), status: { attack: 'ok', misp: 'ok', profiles: 'ok' } };
}

test('ATT&CK STIX parsing skips revoked objects and strips citations', () => {
  const a = parseAttackStix(stix);
  assert.equal(a.groups.length, 1);
  assert.equal(a.groups[0].id, 'G0016');
  assert.doesNotMatch(a.groups[0].description, /Citation/);
  assert.equal(a.techniques[0].id, 'T1059.001');
});

test('intel matching: aliases, MITRE/MISP de-dup, ambiguous names need context, techniques by ID', () => {
  const idx = index();
  const m = buildMatchers(idx.groups);
  const r1 = matchIntel('Midnight Blizzard (Cozy Bear) used T1059.001 in the campaign.', idx, m);
  assert.equal(r1.actors.length, 1, 'MITRE and MISP entries for the same actor are merged');
  assert.equal(r1.actors[0].id, 'G0016');
  assert.deepEqual(r1.techniques.map((t) => t.id), ['T1059.001']);
  assert.equal(matchIntel('Press play to watch the video about security.', idx, m).actors.length, 0, '"play" alone is not an actor');
  const r3 = matchIntel('The Play ransomware gang leaked data.', idx, m);
  assert.equal(r3.actors[0]?.name, 'Play');
  assert.equal(r3.actors[0]?.ttpProfileUrl, 'https://github.com/crocodyli/ThreatActors-TTPs/tree/main/Play');
  assert.equal(matchIntel('UNC3944 targeted help desks', idx, m).actors[0]?.name, 'Scattered Spider');
});

test('intel lookup by alias, G-id and T-id', () => {
  const idx = index();
  assert.equal(lookupIntel('cozy bear', idx)?.kind, 'actor');
  assert.equal(lookupIntel('G0016', idx)?.kind, 'actor');
  const t = lookupIntel('t1059.001', idx);
  assert.equal(t?.kind, 'technique');
  assert.equal(lookupIntel('blackcat', idx), null, 'profiles alone are not actors');
});

const cfg = { domains: ['example.com', '*.mysite.in'], paths: [process.platform === 'win32' ? 'C:\\code' : '/home/me/code'], repoHosts: ['github.com'] };

test('scan targets: only authorised domains, safe images, https repos, allowed folders', () => {
  assert.equal(hostAllowed('www.example.com', cfg.domains), true);
  assert.equal(hostAllowed('evil-example.com', cfg.domains), false);
  const ok = validateScanTarget('web', 'https://WWW.Example.com/path?x=1', cfg);
  assert.ok(ok.ok && ok.value.target === 'www.example.com');
  assert.equal(validateScanTarget('web', 'google.com', cfg).ok, false);
  assert.equal(validateScanTarget('web', 'example.com', { ...cfg, domains: [] }).ok, false);
  assert.equal(validateScanTarget('trivy-image', 'nginx:1.27', cfg).ok, true);
  assert.equal(validateScanTarget('trivy-image', '--help', cfg).ok, false, 'no flag injection');
  assert.equal(validateScanTarget('trivy-image', 'nginx; rm -rf /', cfg).ok, false);
  assert.equal(validateScanTarget('trivy-repo', 'https://github.com/org/repo', cfg).ok, true);
  assert.equal(validateScanTarget('trivy-repo', 'https://user:pw@github.com/org/repo', cfg).ok, false);
  assert.equal(validateScanTarget('trivy-repo', 'http://github.com/org/repo', cfg).ok, false);
  const base = cfg.paths[0];
  assert.equal(validateScanTarget('trivy-fs', `${base}/app`, cfg).ok, true);
  assert.equal(validateScanTarget('trivy-fs', `${base}/../secret`, cfg).ok, false, 'no path traversal');
  assert.equal(validateScanTarget('nmap', 'x', cfg).ok, false);
  assert.deepEqual(trivyArgs('trivy-image', 'nginx:1.27', ''), ['image', '--format', 'json', '--quiet', '--timeout', '15m', '--scanners', 'vuln,secret', 'nginx:1.27']);
});

test('header analysis flags missing protections and insecure cookies', () => {
  const f = analyzeHeaders({ Server: 'Apache/2.4.49', 'X-Content-Type-Options': 'nosniff' }, ['sid=abc; Path=/; HttpOnly']);
  const ids = Object.fromEntries(f.map((x) => [x.id, x.severity]));
  assert.equal(ids.hsts, 'medium');
  assert.equal(ids.csp, 'medium');
  assert.equal(ids.xcto, 'pass');
  assert.equal(ids.framing, 'medium');
  assert.equal(ids['disclose-server'], 'low');
  assert.equal(ids['cookie-0'], 'medium');
  assert.ok(!JSON.stringify(f).includes('abc'), 'cookie values are never stored');
  const good = analyzeHeaders({ 'strict-transport-security': 'max-age=31536000', 'content-security-policy': "default-src 'self'; frame-ancestors 'none'", 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'permissions-policy': 'camera=()' }, []);
  assert.ok(good.every((x) => x.severity === 'pass'));
});

test('certificate expiry findings', () => {
  const now = Date.parse('2026-10-17T00:00:00Z');
  assert.equal(certFinding('Oct 10 00:00:00 2026 GMT', true, null, now).severity, 'critical');
  assert.equal(certFinding('Oct 25 00:00:00 2026 GMT', true, null, now).severity, 'high');
  assert.equal(certFinding('Dec 25 00:00:00 2026 GMT', true, null, now).severity, 'pass');
  assert.equal(certFinding('Dec 25 00:00:00 2026 GMT', false, 'SELF_SIGNED', now).severity, 'high');
});

test('Trivy report parsing: KEV findings first, secrets without values', () => {
  const report = {
    SchemaVersion: 2,
    Results: [
      {
        Target: 'app (alpine 3.20)',
        Vulnerabilities: [
          { VulnerabilityID: 'CVE-2024-1', PkgName: 'libx', InstalledVersion: '1.0', FixedVersion: '1.1', Severity: 'CRITICAL', Title: 'bad', PrimaryURL: 'https://avd.aquasec.com/nvd/cve-2024-1' },
          { VulnerabilityID: 'CVE-2024-2', PkgName: 'liby', InstalledVersion: '2.0', Severity: 'MEDIUM' },
        ],
        Secrets: [{ RuleID: 'aws-access-key-id', Title: 'AWS Access Key ID', Severity: 'CRITICAL', StartLine: 3, Match: 'AKIAXXXXXXXX' }],
        Misconfigurations: [{ AVDID: 'AVD-DS-0002', Title: 'Image user should not be root', Severity: 'HIGH', Status: 'FAIL', Resolution: 'Add USER' }, { AVDID: 'AVD-OK', Status: 'PASS' }],
      },
    ],
  };
  const f = parseTrivyReport(report, new Set(['CVE-2024-2']));
  assert.equal(f.length, 4);
  assert.equal(f[0].id, 'CVE-2024-2', 'KEV-listed first even if medium');
  assert.equal(f[0].inKev, true);
  assert.ok(!JSON.stringify(f).includes('AKIA'), 'secret values never stored');
  const counts = countBySeverity(f);
  assert.equal(counts.critical, 2);
  assert.match(ruleBasedExplanation({ kind: 'trivy-image', target: 'app', counts, findings: f }), /Known Exploited/);
  assert.deepEqual(parseTrivyReport({ SchemaVersion: 2 }, new Set()), [], 'no Results = no findings');
});

test('assistant routing understands Jarvis-style commands', () => {
  assert.equal(routeIntent("Hey Siva, what's the update today?").type, 'briefing');
  assert.deepEqual(routeIntent('Jarvis, explain cve-2026-12345'), { type: 'cve', cve: 'CVE-2026-12345' });
  assert.deepEqual(routeIntent('What is T1059.001?'), { type: 'technique', id: 'T1059.001' });
  assert.deepEqual(routeIntent('Who is APT29?'), { type: 'actor', name: 'APT29' });
  assert.deepEqual(routeIntent('Tell me about Akira ransomware'), { type: 'actor', name: 'Akira' });
  assert.deepEqual(routeIntent('read story 3'), { type: 'story', index: 3 });
  assert.deepEqual(routeIntent('explain the second one'), { type: 'story', index: 2 });
  assert.equal(routeIntent('What are the top threats?').type, 'top');
  assert.deepEqual(routeIntent('scan my website example.com'), { type: 'scan', kind: 'web', target: 'example.com' });
  assert.deepEqual(routeIntent('scan image nginx:1.27'), { type: 'scan', kind: 'trivy-image', target: 'nginx:1.27' });
  assert.deepEqual(routeIntent('open settings'), { type: 'navigate', view: 'settings' });
  assert.equal(routeIntent('export to NotebookLM').type, 'export');
  assert.equal(routeIntent('stop').type, 'stop');
  assert.deepEqual(routeIntent('Which bugs affect Cisco gear this week?'), { type: 'graph', mode: 'targets', query: 'cisco gear', nodeType: 'cve' });
});

test('wake word detection', () => {
  assert.deepEqual(detectWake('hey siva what is the update today'), { woke: true, command: 'what is the update today' });
  assert.deepEqual(detectWake('Jarvis'), { woke: true, command: '' });
  assert.equal(detectWake('the weather is nice').woke, false);
});

test('NotebookLM source pack contains summary, stories and unique URLs', () => {
  const s = storyFromRaw({ title: 'Story A', url: 'https://news.example.org/a', publishedAt: null, snippet: 'x', source: 'A', official: false }, NOW.toISOString());
  const b = { id: 'b1', createdAt: NOW.toISOString(), trigger: 'manual', stories: [{ ...s, summary: 'Sum A', verification: ['Single source'] }], executiveSummary: 'Exec', spokenScript: 'x', recommendations: ['Patch'], aiStatus: 'ok', sourceStatus: [] } as Briefing;
  const md = buildSourcePack(b);
  assert.match(md, /## Executive summary/);
  assert.match(md, /### 1\. Story A/);
  assert.match(md, /Published: not provided/);
  assert.deepEqual(sourceUrls(b), ['https://news.example.org/a']);
});

test('KEV-only story is folded into a news story that later mentions the same CVE', () => {
  const kev: KevInfo = { cveID: 'CVE-2026-5', vendorProject: 'V', product: 'P', vulnerabilityName: 'n', dateAdded: '2026-10-16', shortDescription: 'd', requiredAction: 'a', dueDate: '2026-11-01', knownRansomwareCampaignUse: 'Unknown' };
  const news = storyFromRaw({ title: 'News', url: 'https://n.example.org/1', publishedAt: null, snippet: '', source: 'N', official: false }, NOW.toISOString());
  news.cves = ['CVE-2026-5'];
  const out = foldKevIntoNews([news, storyFromKev(kev, NOW.toISOString())]);
  assert.equal(out.length, 1);
  assert.equal(out[0].kev?.cveID, 'CVE-2026-5');
  assert.ok(out[0].categories.includes('exploited'));
});

test('NVD details parsing', () => {
  const d = parseNvdDetails({ vulnerabilities: [{ cve: { id: 'CVE-2026-5', published: '2026-10-01T00:00:00', descriptions: [{ lang: 'es', value: 'x' }, { lang: 'en', value: 'English text' }], references: [{ url: 'https://a.example' }, { url: 'ftp://no' }] } }] }, 'CVE-2026-5');
  assert.equal(d?.description, 'English text');
  assert.deepEqual(d?.references, ['https://a.example']);
});
