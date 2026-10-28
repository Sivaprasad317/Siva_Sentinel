// NotebookLM support.
// Google NotebookLM has no public API for asking questions or creating summaries (the
// NotebookLM Enterprise API only manages notebooks and needs a Google Cloud licence).
// So Siva builds a "source pack": one Markdown file with the briefing, every story and its
// links. Upload it to NotebookLM (or paste the URL list as website sources) to get audio
// overviews, mind maps and Q&A over the same evidence.
import type { Briefing } from './types';
import { formatInZone } from './format';

export function buildSourcePack(b: Briefing, tz = 'Asia/Kolkata'): string {
  const lines: string[] = [];
  lines.push(`# Siva cybersecurity briefing: ${formatInZone(b.createdAt, tz)}`);
  lines.push('');
  if (b.isSample) lines.push('> SAMPLE DATA: fictional, for testing only.', '');
  lines.push('This file was exported by Siva, a personal read-only threat-intelligence assistant. Every story lists its original source links. Leak-site items are claims made by criminal groups and are not confirmed.');
  lines.push('');
  lines.push('## Executive summary', '', b.executiveSummary, '');
  if (b.recommendations.length) {
    lines.push('## Recommended defensive actions', '');
    b.recommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
    lines.push('');
  }
  lines.push('## Stories (most important first)', '');
  b.stories.forEach((s, i) => {
    lines.push(`### ${i + 1}. ${s.title}`, '');
    lines.push(`- Priority: ${s.priority} (score ${s.score}); confidence: ${s.confidence}`);
    lines.push(`- Source: ${s.source}: ${s.url}`);
    lines.push(`- Published: ${s.publishedAt ? formatInZone(s.publishedAt, tz) : 'not provided'}`);
    if (s.cves.length) lines.push(`- CVEs: ${s.cves.join(', ')}`);
    if (s.kev) lines.push(`- CISA KEV: added ${s.kev.dateAdded}, due ${s.kev.dueDate}. Required action: ${s.kev.requiredAction}`);
    if (s.cvss) lines.push(`- CVSS: ${s.cvss.score} ${s.cvss.severity} (${s.cvss.cve})`);
    if (s.intel?.actors.length) lines.push(`- Threat actors (auto-detected): ${s.intel.actors.map((a) => `${a.name}${a.id ? ` ${a.id}` : ''}`).join(', ')}`);
    if (s.intel?.techniques.length) lines.push(`- ATT&CK techniques: ${s.intel.techniques.map((t) => `${t.id} ${t.name}`).join(', ')}`);
    lines.push('', `**Summary${s.aiGenerated ? ' (AI)' : ' (source text)'}:** ${s.summary}`);
    if (s.whyItMatters) lines.push('', `**Why it matters:** ${s.whyItMatters}`);
    if (s.whoIsAffected) lines.push('', `**Who is affected:** ${s.whoIsAffected}`);
    if (s.verification.length) lines.push('', `**Verification notes:** ${s.verification.join(' ')}`);
    if (s.sources.length > 1) {
      lines.push('', 'Other sources:');
      for (const r of s.sources.slice(1)) lines.push(`- ${r.name}: ${r.url}`);
    }
    lines.push('');
  });
  lines.push('## All source URLs (paste these into NotebookLM as website sources)', '');
  for (const u of sourceUrls(b)) lines.push(u);
  lines.push('');
  return lines.join('\n');
}

/** Unique article URLs, excluding generic catalog pages. */
export function sourceUrls(b: Briefing): string[] {
  const out = new Set<string>();
  for (const s of b.stories) for (const r of s.sources) if (/^https?:\/\//.test(r.url) && !/example\.com/.test(r.url)) out.add(r.url);
  return [...out];
}
