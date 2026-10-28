// Turn Siva's answers into a downloadable report (a self-contained HTML file you can open, print or
// "Save as PDF"). Pure: no browser APIs, so it can be tested. Everything is HTML-escaped.
import type { AnswerCard } from './types';

export interface ReportItem {
  question: string;
  askedAt: string; // ISO
  card: Pick<AnswerCard, 'title' | 'summary' | 'sections' | 'actions' | 'sources'> & { note?: string };
}

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : '#');

export function fmtWhen(iso: string, tz: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString('en-IN', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return d.toISOString();
  }
}

export function reportFileName(now: Date, single?: string): string {
  const day = now.toISOString().slice(0, 10);
  const slug = single ? '-' + single.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) : '';
  return `siva-report-${day}${slug || ''}.html`;
}

function itemHtml(it: ReportItem, tz: string, n: number): string {
  const c = it.card;
  const secs = c.sections
    .map((s) => `<section><h3>${esc(s.heading)}</h3><ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></section>`)
    .join('');
  const todo = c.actions.length ? `<section class="todo"><h3>What to do</h3><ol>${c.actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ol></section>` : '';
  const src = c.sources.length
    ? `<section><h3>Sources</h3><ol class="src">${c.sources.map((s) => `<li><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a></li>`).join('')}</ol></section>`
    : '';
  const note = c.note ? `<p class="note">${esc(c.note)}</p>` : '';
  return `<article><div class="q">${n}. “${esc(it.question)}”<span>${esc(fmtWhen(it.askedAt, tz))}</span></div><h2>${esc(c.title)}</h2><p class="sum">${esc(c.summary)}</p>${secs}${todo}${src}${note}</article>`;
}

/** A complete HTML document with every answer, newest first. */
export function answerReportHtml(items: ReportItem[], opts: { tz: string; now: Date; userTitle: string }): string {
  const when = fmtWhen(opts.now.toISOString(), opts.tz);
  const body = items.length ? items.map((it, i) => itemHtml(it, opts.tz, i + 1)).join('') : '<p>No answers yet.</p>';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SIVA Sentinel report — ${esc(when)}</title>
<style>
body{font:15px/1.55 system-ui,Segoe UI,Roboto,sans-serif;color:#0f172a;background:#f8fafc;margin:0;padding:28px 16px}
main{max-width:860px;margin:0 auto}
header{border-bottom:3px solid #7c3aed;padding-bottom:10px;margin-bottom:18px}
header h1{margin:0;font-size:24px}header p{margin:4px 0 0;color:#475569}
article{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;margin:0 0 16px;break-inside:avoid}
.q{color:#6d28d9;font-weight:600;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.q span{color:#64748b;font-weight:400;font-size:13px}
h2{margin:8px 0 6px;font-size:19px}h3{margin:12px 0 4px;font-size:15px;color:#334155}
.sum{margin:0 0 6px}ul,ol{margin:4px 0 0 20px;padding:0}li{margin:2px 0}
.todo{background:#f0fdf4;border-radius:8px;padding:6px 12px}.src a{color:#1d4ed8;word-break:break-word}
.note{color:#64748b;font-size:13px}footer{color:#64748b;font-size:12px;margin-top:20px}
@media print{body{background:#fff;padding:0}article{border-color:#cbd5e1}}
</style></head><body><main>
<header><h1>SIVA Sentinel — security report</h1><p>Prepared for ${esc(opts.userTitle)} · ${esc(when)} · ${items.length} answer${items.length === 1 ? '' : 's'}</p></header>
${body}
<footer>Made by SIVA Sentinel (read-only). Facts come from the sources listed with each answer — check them before acting. Print this page or “Save as PDF” to keep a copy.</footer>
</main></body></html>`;
}
