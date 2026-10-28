// GET /api/report?id=<briefingId>           -> download the full report as a self-contained HTML file
// GET /api/report?id=<briefingId>&print=1   -> open the report in the browser and show the Print / Save as PDF dialog
import { readStore } from '../../../lib/store';
import { buildReportHtml } from '../../../lib/report';
import { sampleBriefing } from '../../../lib/sample';
import { errorJson } from '../../../lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const id = params.get('id');
  if (id && !/^[a-z0-9-]{1,64}$/i.test(id)) return errorJson('Invalid id', 400);
  const store = await readStore();
  const b = id === 'sample' ? sampleBriefing() : id ? store.briefings.find((x) => x.id === id) : store.briefings[0];
  if (!b) return errorJson('Briefing not found', 404);
  const print = params.get('print') === '1';
  const html = buildReportHtml(b, { timezone: store.preferences.timezone, scans: store.scans, autoPrint: print });
  const headers: Record<string, string> = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' };
  if (!print) headers['content-disposition'] = `attachment; filename="siva-sentinel-report-${b.createdAt.slice(0, 16).replace(/[:T]/g, '-')}.html"`;
  return new Response(html, { headers });
}
