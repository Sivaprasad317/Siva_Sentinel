// Tests for patch 9: expert answers with key-point sections, ATT&CK mitigations, CWE, EPSS, more glossary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSectioned, parseExpertJson, spokenAnswer, research, EXPERT_RULES, type ResearchDeps } from '../lib/research';
import { buildMatchers, findTechniquesInText, parseAttackStix, type IntelIndex } from '../lib/intel';
import { parseEpss, epssPlain, parseCwe, findCwesInText } from '../lib/knowledge';
import { parseNvdDetails } from '../lib/sources';
import { lookupTerm, findTermsInText, GLOSSARY } from '../lib/glossary';
import { cardToText } from '../lib/answerCard';
import { routeIntent } from '../lib/assistantRouter';
import { AiDisabledError } from '../lib/gemini';

const STIX = {
  objects: [
    { id: 'attack-pattern--1', type: 'attack-pattern', name: 'Phishing', description: 'Adversaries may send phishing messages (Citation: X).', x_mitre_detection: 'Monitor email gateways for [suspicious links](https://x).', x_mitre_platforms: ['Windows', 'Office Suite'], kill_chain_phases: [{ phase_name: 'initial-access' }], external_references: [{ source_name: 'mitre-attack', external_id: 'T1566', url: 'https://attack.mitre.org/techniques/T1566/' }] },
    { id: 'attack-pattern--2', type: 'attack-pattern', name: 'OS Credential Dumping', description: 'Dump credentials.', kill_chain_phases: [{ phase_name: 'credential-access' }], external_references: [{ source_name: 'mitre-attack', external_id: 'T1003' }] },
    { id: 'course-of-action--a', type: 'course-of-action', name: 'User Training', description: 'Train users to spot phishing.', external_references: [{ source_name: 'mitre-attack', external_id: 'M1017' }] },
    { id: 'course-of-action--b', type: 'course-of-action', name: 'Antivirus/Antimalware', description: 'Scan attachments.', external_references: [{ source_name: 'mitre-attack', external_id: 'M1049' }] },
    { id: 'relationship--1', type: 'relationship', relationship_type: 'mitigates', source_ref: 'course-of-action--a', target_ref: 'attack-pattern--1' },
    { id: 'relationship--2', type: 'relationship', relationship_type: 'mitigates', source_ref: 'course-of-action--b', target_ref: 'attack-pattern--1' },
    { id: 'relationship--3', type: 'relationship', relationship_type: 'uses', source_ref: 'course-of-action--b', target_ref: 'attack-pattern--2' },
  ],
};

function index(): { index: IntelIndex; matchers: ReturnType<typeof buildMatchers> } {
  const a = parseAttackStix(STIX);
  const idx: IntelIndex = { builtAt: '2026-10-18T00:00:00Z', version: 3, groups: a.groups, techniques: a.techniques, software: a.software, profiles: {}, status: { attack: 'ok', misp: 'ok', profiles: 'ok' } };
  return { index: idx, matchers: buildMatchers(idx.groups) };
}

test('ATT&CK parsing keeps mitigations (only "mitigates" links), detection and platforms', () => {
  const t = index().index.techniques.find((x) => x.id === 'T1566')!;
  assert.deepEqual(t.mitigations?.map((m) => m.id), ['M1017', 'M1049']);
  assert.match(t.detection ?? '', /Monitor email gateways for suspicious links/);
  assert.deepEqual(t.platforms, ['Windows', 'Office Suite']);
  assert.equal(index().index.techniques.find((x) => x.id === 'T1003')!.mitigations, undefined);
});

test('techniques are found by plain-English name in a question', () => {
  const { index: idx } = index();
  assert.deepEqual(findTechniquesInText('what is phishing?', idx).map((t) => t.id), ['T1566']);
  assert.deepEqual(findTechniquesInText('explain os credential dumping please', idx).map((t) => t.id), ['T1003']);
  assert.deepEqual(findTechniquesInText('hello there', idx), []);
});

test('sectioned answers parse every key-point section', () => {
  const p = parseSectioned(`TITLE: SQL injection
SUMMARY: A bug where input becomes part of a database query.
HOW IT WORKS:
- App builds a query from user text
- Attacker adds SQL
KEY POINTS:
- Top web risk for 20 years
REAL-WORLD EXAMPLE:
- 2008 Heartland breach
WHY IT MATTERS:
- Data theft
HOW TO SPOT IT:
- Odd quotes in logs
WHAT TO DO:
- Use parameterised queries
LATEST:
- Not in my sources yet
RELATED TERMS:
- XSS — script injection`);
  assert.equal(p.title, 'SQL injection');
  assert.deepEqual(p.sections.how, ['App builds a query from user text', 'Attacker adds SQL']);
  assert.deepEqual(p.facts, ['Top web risk for 20 years']);
  assert.deepEqual(p.sections.example, ['2008 Heartland breach']);
  assert.deepEqual(p.sections.detect, ['Odd quotes in logs']);
  assert.deepEqual(p.actions, ['Use parameterised queries']);
  assert.deepEqual(p.sections.related, ['XSS — script injection']);
});

test('JSON answers parse, and the old {facts} shape still works', () => {
  const p = parseExpertJson({ title: 'T', summary: 'S', howItWorks: ['h'], keyPoints: ['k1', 'k2'], howToSpot: ['d'], actions: ['a'], relatedTerms: ['r'], example: [1, 'e'] });
  assert.deepEqual(p.sections.how, ['h']);
  assert.deepEqual(p.facts, ['k1', 'k2']);
  assert.deepEqual(p.sections.example, ['e']);
  assert.deepEqual(parseExpertJson({ title: 'x', summary: 'y', facts: ['f'] }).facts, ['f']);
});

test('spoken answer = simple explanation + top 3 key points', () => {
  const s = spokenAnswer('It is a trick. It steals passwords.', 'Phishing', ['Most common attack', 'Uses fake links', 'Stop it with MFA', 'Fourth'], 'boss');
  assert.match(s, /^It is a trick\. It steals passwords\. Key points: Most common attack\. Uses fake links\. Stop it with MFA\./);
  assert.ok(!s.includes('Fourth'));
  assert.match(s, /details on your screen, boss\.$/);
});

test('expert rules allow textbook knowledge but keep current facts source-only and defensive', () => {
  assert.match(EXPERT_RULES, /own expert knowledge/);
  assert.match(EXPERT_RULES, /ONLY DATA or Google Search/);
  assert.match(EXPERT_RULES, /never give attack instructions/i);
});

test('EPSS parsing and plain wording', () => {
  const e = parseEpss({ status: 'OK', data: [{ cve: 'CVE-2024-3400', epss: '0.94321', percentile: '0.99912', date: '2026-10-17' }] }, 'cve-2024-3400')!;
  assert.equal(e.cve, 'CVE-2024-3400');
  assert.ok(Math.abs(e.epss - 0.94321) < 1e-9);
  assert.match(epssPlain(e), /^EPSS 94\.3% chance of being exploited in the next 30 days \(very high; in the top 0\.1% of all CVEs\), as of 2026-10-17\.$/);
  assert.match(epssPlain({ cve: 'CVE-2', epss: 0.004, percentile: 0.6, date: null }), /0\.40% chance .*\(low; higher than 60% of all CVEs\)\.$/);
  assert.equal(parseEpss({ data: [] }, 'CVE-1'), null);
  assert.equal(parseEpss({ data: [{ cve: 'CVE-1', epss: 'abc' }] }, 'CVE-1'), null);
});

test('CWE parsing is tolerant of both response shapes', () => {
  const a = parseCwe({ Weaknesses: [{ ID: '89', Name: 'Improper Neutralization of Special Elements used in an SQL Command', Description: 'The product builds SQL from input.', ExtendedDescription: 'Can read or modify data.', CommonConsequences: [{ Scope: ['Confidentiality'], Impact: ['Read Application Data'], Note: 'Attackers read data.' }], PotentialMitigations: [{ Phase: ['Implementation'], Description: 'Use prepared statements.' }] }] }, 'CWE-89')!;
  assert.equal(a.id, 'CWE-89');
  assert.match(a.description, /builds SQL.*modify data/);
  assert.deepEqual(a.consequences, ['Read Application Data: Attackers read data.']);
  assert.deepEqual(a.mitigations, ['Implementation: Use prepared statements.']);
  assert.equal(a.url, 'https://cwe.mitre.org/data/definitions/89.html');
  const b = parseCwe({ Name: 'Cross-site Scripting', Description: 'x', Potential_Mitigations: { Mitigation: [{ Description: 'Encode output.' }] } }, '79')!;
  assert.equal(b.id, 'CWE-79');
  assert.deepEqual(b.mitigations, ['Encode output.']);
  assert.equal(parseCwe({}, 'CWE-1'), null);
});

test('weakness names and NVD CWE ids are detected', () => {
  assert.deepEqual(findCwesInText('what is SQL injection'), ['CWE-89']);
  assert.deepEqual(findCwesInText('explain CWE-79 and ssrf'), ['CWE-79', 'CWE-918']);
  const d = parseNvdDetails({ vulnerabilities: [{ cve: { id: 'CVE-2026-1', descriptions: [{ lang: 'en', value: 'x' }], weaknesses: [{ description: [{ value: 'CWE-787' }, { value: 'NVD-CWE-noinfo' }] }] } }] }, 'CVE-2026-1');
  assert.deepEqual(d?.cwes, ['CWE-787']);
});

test('glossary has much more knowledge and no clashing names', () => {
  assert.ok(GLOSSARY.length >= 120);
  for (const q of ['kerberoasting', 'ssrf', 'business email compromise', 'mfa fatigue', 'epss', 'passkey', 'web shell', 'living off the land', 'cert-in']) assert.ok(lookupTerm(q), q);
  assert.equal(lookupTerm('bec')?.term, 'Business email compromise');
  assert.equal(lookupTerm('ddos')?.term, 'DDoS');
  assert.deepEqual(findTermsInText('is exposed rdp risky').map((t) => t.term), ['RDP']);
});

function deps(over: Partial<ResearchDeps> = {}): ResearchDeps {
  const intel = index();
  return {
    getIntel: async () => intel,
    getKevMap: async () => new Map([['CVE-2024-3400', { cveID: 'CVE-2024-3400', vendorProject: 'Palo Alto Networks', product: 'PAN-OS', vulnerabilityName: 'n', dateAdded: '2024-04-12', shortDescription: 'd', requiredAction: 'a', dueDate: '2024-04-19', knownRansomwareCampaignUse: 'Unknown' }]]),
    fetchNvdDetails: async (cve) => ({ cve, description: 'Command injection in GlobalProtect.', published: '2024-04-12T08:15:00', cvss: { score: 10, severity: 'CRITICAL', version: '3.1', vector: '' } as never, references: [], cwes: ['CWE-77'] }),
    wikipediaSummary: async () => null,
    threatFoxLookup: async () => null,
    geminiGrounded: async () => {
      throw new AiDisabledError();
    },
    geminiJson: async () => {
      throw new AiDisabledError();
    },
    epssLookup: async (cve) => ({ cve, epss: 0.95, percentile: 0.999, date: '2026-10-17' }),
    cweLookup: async (id) => ({ id, name: 'Command Injection', description: 'Input reaches a command.', consequences: ['Execute code'], mitigations: ['Avoid shell calls.'], url: 'https://cwe.mitre.org/data/definitions/77.html' }),
    ...over,
  };
}

test('CVE questions show an at-a-glance box (CVSS, KEV, EPSS, CWE) and CWE prevention, even without AI', async () => {
  process.env.ENABLE_WEB_SEARCH = '1';
  const steps: string[] = [];
  const r = await research('Explain CVE-2024-3400', routeIntent('Explain CVE-2024-3400'), null, [], (s) => steps.push(s), deps());
  assert.ok(steps.some((s) => s.includes('FIRST EPSS')));
  assert.ok(steps.some((s) => s.includes('MITRE CWE')));
  const glance = r.card!.sections.find((s) => s.heading === 'CVE-2024-3400 at a glance')!;
  assert.ok(glance.bullets.some((b) => /CVSS 3\.1\): 10 CRITICAL/.test(b)));
  assert.ok(glance.bullets.some((b) => /Confirmed exploited in the wild — CISA KEV since 2024-04-12/.test(b)));
  assert.ok(glance.bullets.some((b) => /EPSS 95\.0%/.test(b)));
  assert.ok(r.card!.sections.some((s) => s.heading === 'How to prevent it (MITRE CWE-77)'));
  assert.ok(r.card!.sources.some((s) => s.kind === 'epss'));
});

test('concept questions use the expert explanation and show MITRE mitigations', async () => {
  const text = 'TITLE: Phishing\nSUMMARY: Fake messages that trick you.\nHOW IT WORKS:\n- Attacker sends a fake email\nKEY POINTS:\n- Most common way in\n- Often leads to ransomware\nWHY IT MATTERS:\n- Anyone can be targeted\nWHAT TO DO:\n- Turn on MFA\nRELATED TERMS:\n- Smishing — SMS phishing';
  let userPrompt = '';
  const r = await research('what is phishing', routeIntent('what is phishing'), null, [], undefined, deps({
    geminiGrounded: async (req) => {
      userPrompt = req.user;
      return { text, sources: [], queries: [], suggestionsHtml: undefined } as never;
    },
  }));
  assert.match(userPrompt, /HOW IT WORKS:/);
  assert.match(userPrompt, /T1566/, 'ATT&CK technique was found from the plain word "phishing"');
  const heads = r.card!.sections.map((s) => s.heading);
  assert.deepEqual(heads.slice(0, 4), ['In simple words', 'How it works', 'Key points', 'Why it matters']);
  assert.ok(heads.includes('MITRE mitigations'));
  assert.equal(heads.at(-1), 'Related terms');
  assert.deepEqual(r.card!.actions, ['Turn on MFA']);
  assert.match(r.speech, /Key points: Most common way in\. Often leads to ransomware\./);
  assert.match(r.display ?? '', /Key points:\n• Most common way in/);
});

test('without AI, concept answers still get MITRE mitigations as actions', async () => {
  const r = await research('what is phishing', routeIntent('what is phishing'), null, [], undefined, deps());
  assert.equal(r.card!.title, 'Phishing');
  assert.deepEqual(r.card!.actions, ['User Training', 'Antivirus/Antimalware']);
  assert.ok(r.card!.sections.some((s) => s.heading === 'MITRE ATT&CK: Phishing'));
});

test('cardToText gives the chat drawer key points, not just a title', () => {
  const t = cardToText({ title: 'X', summary: 'S', sections: [{ heading: 'Key points', bullets: ['a', 'b'] }, { heading: 'Other', bullets: ['z'] }], actions: ['do'] });
  assert.equal(t, 'X\n\nS\n\nKey points:\n• a\n• b\n\nWhat to do:\n1. do');
});
