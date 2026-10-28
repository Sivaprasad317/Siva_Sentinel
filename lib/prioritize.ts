// Deterministic ranking. This runs BEFORE any AI, so the order never depends on Gemini.
// Principle: evidence of exploitation outranks severity. A CVSS 9.8 bug nobody is
// exploiting ranks below a CVSS 7.5 bug that CISA confirms is exploited.
import type { Category, Confidence, Preferences, Priority, Story } from './types';

const RULES: [Category, RegExp][] = [
  ['exploited', /actively exploited|exploited in the wild|in-the-wild|zero-day|0-day|under active attack|known exploited|exploitation (?:attempts|activity)/i],
  ['vulnerability', /CVE-\d{4}-\d+|vulnerabilit|security update|patch(?:es|ed)?\b|\bflaw|advisory|remote code execution|\bRCE\b|privilege escalation|authentication bypass/i],
  ['ransomware', /ransomware|extortion|leak site|data leak site|lockbit|akira|qilin|clop|black ?basta|play ransomware|rhysida|medusa/i],
  ['threat-actor', /\bAPT\s?\d+|threat actor|state[- ]sponsored|nation[- ]state|espionage|lazarus|typhoon|scattered spider|backdoor|malware|botnet|trojan|\bRAT\b|stealer|loader|phishing campaign|supply[- ]chain attack/i],
  ['breach', /breach|data leak|leaked|stolen data|records exposed|exposed data|hacked|unauthori[sz]ed access|cyberattack on/i],
  ['cloud', /\b(aws|azure|gcp|google cloud|kubernetes|k8s|s3 bucket|cloud|saas|okta|entra|microsoft 365|m365|oauth|identity provider)\b/i],
];

export function categorize(text: string): Category[] {
  const cats = RULES.filter(([, re]) => re.test(text)).map(([c]) => c);
  return cats.length ? cats : ['general'];
}

function storyText(s: Pick<Story, 'title' | 'snippet'>) {
  return `${s.title} ${s.snippet}`;
}

export interface ScoreResult {
  score: number;
  priority: Priority;
  reasons: string[];
  verification: string[];
  confidence: Confidence;
}

export function priorityFromScore(score: number): Priority {
  if (score >= 60) return 'critical';
  if (score >= 35) return 'high';
  if (score >= 18) return 'medium';
  return 'low';
}

export function scoreStory(
  s: Pick<Story, 'title' | 'snippet' | 'categories' | 'kev' | 'cvss' | 'sources' | 'publishedAt' | 'cves'> & Partial<Pick<Story, 'intel' | 'origin'>>,
  prefs: Pick<Preferences, 'topics'>,
  now: Date = new Date(),
): ScoreResult {
  let score = 0;
  const reasons: string[] = [];
  const verification: string[] = [];
  const text = storyText(s);

  if (s.kev) {
    score += 50;
    reasons.push(`Listed in CISA KEV on ${s.kev.dateAdded}: exploitation in the wild is confirmed by CISA.`);
    const due = Date.parse(`${s.kev.dueDate}T23:59:59Z`);
    if (Number.isFinite(due) && due - now.getTime() < 7 * 86_400_000) {
      score += 10;
      reasons.push(`CISA remediation due date for US federal agencies is ${s.kev.dueDate}.`);
    }
    if (s.kev.knownRansomwareCampaignUse === 'Known') {
      score += 10;
      reasons.push('CISA reports this flaw is used in ransomware campaigns.');
    }
  } else if (s.categories.includes('exploited')) {
    score += 25;
    reasons.push('News reporting says this is being exploited (not yet in CISA KEV).');
  }

  if (s.categories.includes('ransomware')) {
    score += 12;
    reasons.push('Ransomware-related.');
  }
  if (s.categories.includes('threat-actor')) score += 8;
  if (s.categories.includes('breach')) score += 8;
  if (s.categories.includes('cloud')) score += 5;

  if (s.cvss) {
    if (s.cvss.score >= 9) score += 10;
    else if (s.cvss.score >= 7) score += 5;
    reasons.push(`NVD CVSS ${s.cvss.version} score ${s.cvss.score} (${s.cvss.severity}) for ${s.cvss.cve}. Severity alone is not evidence of exploitation.`);
  }

  const outlets = new Set(s.sources.map((r) => r.name)).size;
  if (outlets > 1) {
    score += Math.min(15, (outlets - 1) * 5);
    reasons.push(`Reported by ${outlets} sources.`);
  }

  if (s.intel?.actors.length) {
    score += 5;
    reasons.push(`Mentions known threat actor(s): ${s.intel.actors.map((a) => a.name).join(', ')} (auto-detected).`);
  }

  const lower = text.toLowerCase();
  const matched = prefs.topics.filter((t) => t.trim() && lower.includes(t.trim().toLowerCase()));
  if (matched.length) {
    score += 10;
    reasons.push(`Matches your topics: ${matched.join(', ')}.`);
  }

  if (s.publishedAt) {
    const ageH = (now.getTime() - Date.parse(s.publishedAt)) / 3_600_000;
    if (ageH <= 24) score += 10;
    else if (ageH <= 72) score += 5;
    else if (ageH > 168) score -= 10;
  } else {
    score -= 5;
  }

  // Verification / confidence notes shown to the user.
  const official = s.sources.some((r) => r.official);
  let confidence: Confidence;
  if (s.kev) {
    confidence = 'confirmed';
    verification.push('Exploitation confirmed by the CISA Known Exploited Vulnerabilities catalog.');
  } else if (official) {
    confidence = 'confirmed';
    verification.push('Published by an official government or vendor source.');
  } else if (outlets > 1) {
    confidence = 'corroborated';
    verification.push(`Corroborated by ${outlets} independent outlets.`);
  } else {
    confidence = 'single-source';
    verification.push('Single source so far; not independently verified.');
  }
  if (!s.kev && s.categories.includes('exploited')) {
    verification.push('Exploitation claim comes from news reporting. Check the vendor advisory before acting.');
  }
  if (s.origin !== 'leak-site' && (s.categories.includes('ransomware') || s.categories.includes('breach')) && /\bclaim/i.test(text)) {
    verification.push('Involves an attacker or leak-site claim that the victim may not have confirmed.');
  }
  if (s.origin === 'community') verification.push('Community discussion link from Hacker News; read the linked article for facts.');
  if (s.origin === 'leak-site') verification.push('From a ransomware leak-site tracker: attacker claims, not confirmed by the victim.');
  if (!s.publishedAt) verification.push('Publication time was not provided (or was invalid) in the source feed.');
  if (s.cves.length && !s.cvss) verification.push('NVD CVSS score was not retrieved for this story.');

  return { score, priority: priorityFromScore(score), reasons, verification, confidence };
}
