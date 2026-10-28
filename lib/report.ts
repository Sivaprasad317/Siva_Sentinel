// Full report of a briefing as ONE self-contained HTML file (no external files or scripts).
// Open it in any browser, or choose Print -> "Save as PDF" to get a PDF.
// All text from feeds is UNTRUSTED, so everything is HTML-escaped and only http(s) links are kept.
import type { Briefing, ScanRecord, Story } from './types';
import { formatInZone } from './format';
import { BRAND } from './brand';

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function safeUrl(u: string): string | null {
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

const link = (u: string, text: string) => {
  const s = safeUrl(u);
  return s ? `<a href="${esc(s)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>` : esc(text);
};

function storyBlock(s: Story, i: number, tz: string): string {
  const facts: string[] = [
    `<b>Source:</b> ${link(s.url, s.source)}`,
    `<b>Published:</b> ${esc(s.publishedAt ? formatInZone(s.publishedAt, tz) : 'not provided')}`,
    `<b>Retrieved:</b> ${esc(formatInZone(s.retrievedAt, tz))}`,
    `<b>Confidence:</b> ${esc(s.confidence)}`,
  ];
  if (s.cves.length) facts.push(`<b>CVEs:</b> ${s.cves.map((c) => link(`https://nvd.nist.gov/vuln/detail/${c}`, c)).join(', ')}`);
  if (s.cvss) facts.push(`<b>CVSS:</b> ${esc(`${s.cvss.score} ${s.cvss.severity} (${s.cvss.cve})`)}`);
  if (s.kev) facts.push(`<b>CISA KEV:</b> added ${esc(s.kev.dateAdded)}, due ${esc(s.kev.dueDate)}, ransomware use: ${esc(s.kev.knownRansomwareCampaignUse)}`);
  const intel = [
    ...(s.intel?.actors ?? []).map((a) => (a.url ? link(a.url, `${a.name}${a.id ? ` ${a.id}` : ''}`) : esc(a.name))),
    ...(s.intel?.techniques ?? []).map((t) => link(t.url, `${t.id} ${t.name}`)),
  ];
  return `<article class="story p-${esc(s.priority)}">
  <h3><span class="num">${i + 1}</span> ${esc(s.title)}</h3>
  <div class="tags"><span class="tag ${esc(s.priority)}">${esc(s.priority)}</span>${s.kev ? '<span class="tag hot">Exploited · CISA KEV</span>' : ''}${s.categories.map((c) => `<span class="tag plain">${esc(c)}</span>`).join('')}</div>
  <p class="facts">${facts.join(' · ')}</p>
  <p><b>Summary${s.aiGenerated ? ' (AI)' : ' (source text)'}:</b> ${esc(s.summary)}</p>
  ${s.whyItMatters ? `<p><b>Why it matters:</b> ${esc(s.whyItMatters)}</p>` : ''}
  ${s.whoIsAffected ? `<p><b>Who is affected:</b> ${esc(s.whoIsAffected)}</p>` : ''}
  ${s.kev ? `<p><b>Required action (CISA):</b> ${esc(s.kev.requiredAction)}</p>` : ''}
  ${intel.length ? `<p><b>Threat intel (auto-detected):</b> ${intel.join(', ')}</p>` : ''}
  <p class="muted"><b>Verification:</b> ${esc(s.verification.join(' '))}</p>
  <p class="muted"><b>Evidence:</b> ${s.sources.map((r) => link(r.url, r.name)).join(' · ')}</p>
</article>`;
}

export function buildReportHtml(b: Briefing, opts: { timezone?: string; scans?: ScanRecord[]; autoPrint?: boolean } = {}): string {
  const tz = opts.timezone ?? 'Asia/Kolkata';
  const st = b.stories;
  const count = (f: (s: Story) => boolean) => st.filter(f).length;
  const critical = st.filter((s) => s.priority === 'critical' || s.priority === 'high');
  const scans = (opts.scans ?? []).filter((s) => s.status === 'done').slice(0, 5);
  const title = `${BRAND.name} report · ${formatInZone(b.createdAt, tz)}`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#0b1020;--panel:#111a30;--line:#22304f;--fg:#e8eefb;--muted:#93a1bd;--blue:#3b82f6;--red:#ef4444;--amber:#f59e0b;--green:#22c55e;--purple:#a855f7}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 'Segoe UI',system-ui,sans-serif;padding:28px}
.wrap{max-width:1000px;margin:0 auto}a{color:#7fb0ff}h1{margin:0;font-size:26px}h2{font-size:15px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin:28px 0 10px}
.brand{color:var(--green);font-weight:800;letter-spacing:.16em;font-size:12px}.muted{color:var(--muted)}
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:16px}.stat{background:var(--panel);border:1px solid var(--line);border-top:3px solid var(--blue);border-radius:10px;padding:10px 12px}
.stat b{display:block;font-size:24px}.stat.r{border-top-color:var(--red)}.stat.a{border-top-color:var(--amber)}.stat.g{border-top-color:var(--green)}.stat.p{border-top-color:var(--purple)}
.box{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{border-bottom:1px solid var(--line);padding:6px;text-align:left;vertical-align:top}th{color:var(--muted);font-weight:500}
.story{background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--blue);border-radius:10px;padding:12px 16px;margin:10px 0;break-inside:avoid}
.story.p-critical{border-left-color:var(--red)}.story.p-high{border-left-color:var(--amber)}.story.p-low{border-left-color:var(--muted)}
.story h3{margin:0 0 6px;font-size:16px}.num{display:inline-block;min-width:26px;color:var(--muted)}.story p{margin:6px 0}.facts{font-size:12.5px;color:var(--muted)}
.tag{display:inline-block;font:600 10.5px/1 monospace;text-transform:uppercase;padding:4px 6px;border-radius:4px;border:1px solid currentColor;margin-right:5px}
.tag.critical{color:var(--red)}.tag.high{color:var(--amber)}.tag.medium{color:#eab308}.tag.low{color:var(--muted)}.tag.hot{background:var(--red);color:#fff;border-color:var(--red)}.tag.plain{color:var(--muted)}
.foot{margin-top:30px;font-size:12px;color:var(--muted)}
@media print{body{background:#fff;color:#111;padding:0}.box,.story,.stat{background:#fff;border-color:#ccc}a{color:#1a4fd6}.muted,.facts,h2,.foot{color:#555}.noprint{display:none}}
</style></head><body><div class="wrap">
<div class="brand">${esc(BRAND.name.toUpperCase())} · ${esc(BRAND.tagline)}</div>
<h1>Cybersecurity intelligence report</h1>
<p class="muted">Briefing created ${esc(formatInZone(b.createdAt, tz))} (${esc(b.trigger)}) · ${st.length} stories · AI status: ${esc(b.aiStatus)}${b.isSample ? ' · SAMPLE DATA (fictional)' : ''}</p>
<p class="noprint"><button onclick="window.print()">Print / Save as PDF</button></p>
<div class="stats">
<div class="stat"><span class="muted">Stories</span><b>${st.length}</b></div>
<div class="stat r"><span class="muted">Exploited (KEV)</span><b>${count((s) => Boolean(s.kev))}</b></div>
<div class="stat r"><span class="muted">Critical</span><b>${count((s) => s.priority === 'critical')}</b></div>
<div class="stat a"><span class="muted">Ransomware</span><b>${count((s) => s.categories.includes('ransomware'))}</b></div>
<div class="stat g"><span class="muted">Sources OK</span><b>${b.sourceStatus.filter((s) => s.ok).length}/${b.sourceStatus.length}</b></div>
</div>
<h2>Executive summary</h2><div class="box"><p>${esc(b.executiveSummary)}</p></div>
${b.recommendations.length ? `<h2>Recommended defensive actions</h2><div class="box"><ol>${b.recommendations.map((r) => `<li>${esc(r)}</li>`).join('')}</ol></div>` : ''}
${critical.length ? `<h2>Act first (critical and high)</h2><div class="box"><table><tr><th>#</th><th>Story</th><th>Why</th><th>Source</th></tr>${critical
    .slice(0, 15)
    .map((s) => `<tr><td>${st.indexOf(s) + 1}</td><td>${esc(s.title)}${s.kev ? ' <span class="tag hot">KEV</span>' : ''}</td><td>${esc(s.reasons[0] ?? '')}</td><td>${link(s.url, s.source)}</td></tr>`)
    .join('')}</table></div>` : ''}
<h2>All stories (most important first)</h2>
${st.map((s, i) => storyBlock(s, i, tz)).join('\n')}
${scans.length ? `<h2>Recent scans</h2>${scans
    .map((sc) => `<div class="box" style="margin-bottom:10px"><b>${esc(sc.target)}</b> <span class="muted">(${esc(sc.kind)}, ${esc(formatInZone(sc.startedAt, tz))})</span><p>${esc(sc.explanation ?? '')}</p><p class="muted">Critical ${sc.counts.critical ?? 0} · High ${sc.counts.high ?? 0} · Medium ${sc.counts.medium ?? 0} · Low ${sc.counts.low ?? 0}</p></div>`)
    .join('')}` : ''}
<h2>Source status</h2><div class="box"><table><tr><th>Source</th><th>Status</th><th>Items</th></tr>${b.sourceStatus
    .map((s) => `<tr><td>${esc(s.name)}</td><td>${s.ok ? 'OK' : `Failed: ${esc(s.error ?? '')}`}</td><td>${s.items}</td></tr>`)
    .join('')}</table></div>
<p class="foot">Generated by ${esc(BRAND.name)} from public sources. Leak-site items are claims by criminal groups and are not confirmed. Threat-actor links are auto-detected and may be wrong. Check each linked source before acting.</p>
</div>${opts.autoPrint ? '<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},400)})</script>' : ''}</body></html>`;
}
