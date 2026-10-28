// SAMPLE DATA for trying the interface without any API keys or internet.
// Every item is fictional, is marked [SAMPLE], and links to example.com. It is never mixed
// into real briefings or saved to history.
import type { Briefing, Story } from './types';

const now = Date.now();
const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000).toISOString();

function sample(p: Partial<Story> & Pick<Story, 'id' | 'title' | 'priority' | 'categories'>): Story {
  return {
    url: `https://example.com/sample/${p.id}`,
    source: 'Sample Source',
    sources: [{ name: 'Sample Source', url: `https://example.com/sample/${p.id}`, publishedAt: iso(5), official: false }],
    publishedAt: iso(5),
    retrievedAt: iso(0),
    snippet: 'This is fictional sample text used to preview the dashboard layout.',
    cves: [],
    kev: null,
    cvss: null,
    score: 0,
    reasons: ['Sample ranking reason.'],
    verification: ['SAMPLE DATA: not real news.'],
    confidence: 'single-source',
    summary: 'Fictional sample summary. Run a live refresh to see real intelligence.',
    whyItMatters: 'Sample only.',
    whoIsAffected: 'Nobody: this is sample data.',
    aiGenerated: false,
    ...p,
  };
}

export function sampleBriefing(): Briefing {
  const stories: Story[] = [
    sample({
      id: 'sample-1', title: '[SAMPLE] Example VPN appliance flaw exploited (fictional)', priority: 'critical', score: 85,
      categories: ['exploited', 'vulnerability'], cves: ['CVE-0000-0001'], confidence: 'confirmed',
      kev: { cveID: 'CVE-0000-0001', vendorProject: 'ExampleCorp', product: 'Example VPN', vulnerabilityName: 'Sample auth bypass', dateAdded: iso(30).slice(0, 10), shortDescription: 'Fictional.', requiredAction: 'Fictional: apply vendor update.', dueDate: iso(-72).slice(0, 10), knownRansomwareCampaignUse: 'Unknown' },
      cvss: { cve: 'CVE-0000-0001', score: 9.1, severity: 'CRITICAL', version: '3.1' },
    }),
    sample({ id: 'sample-2', title: '[SAMPLE] Fictional ransomware group claims attack on example retailer', priority: 'high', score: 45, categories: ['ransomware', 'breach'] }),
    sample({ id: 'sample-3', title: '[SAMPLE] Fictional APT campaign uses new loader', priority: 'high', score: 38, categories: ['threat-actor'] }),
    sample({ id: 'sample-4', title: '[SAMPLE] Example cloud storage misconfiguration exposes test data', priority: 'medium', score: 25, categories: ['cloud', 'breach'] }),
    sample({ id: 'sample-5', title: '[SAMPLE] Example vendor monthly security update', priority: 'medium', score: 20, categories: ['vulnerability'], cvss: { cve: 'CVE-0000-0002', score: 9.8, severity: 'CRITICAL', version: '3.1' }, cves: ['CVE-0000-0002'] }),
    sample({ id: 'sample-6', title: '[SAMPLE] Fictional phishing wave targets example bank customers', priority: 'low', score: 12, categories: ['general'] }),
  ];
  return {
    id: 'sample',
    createdAt: iso(0),
    trigger: 'sample',
    isSample: true,
    stories,
    executiveSummary: 'SAMPLE DATA. This is a fictional briefing that shows how the dashboard looks. Nothing here is real. Press "Refresh now" to collect live intelligence.',
    spokenScript: 'This is sample data, not real news. Press Refresh now to collect live intelligence, and then ask me again.',
    recommendations: ['SAMPLE: run a live refresh to get real, source-backed recommendations.'],
    aiStatus: 'disabled',
    sourceStatus: [{ name: 'Sample data', kind: 'rss', ok: true, items: stories.length, fetchedAt: iso(0) }],
  };
}
