// GET /api/export/notebooklm?id=<briefingId>[&format=urls]
// Downloads a Markdown "source pack" for Google NotebookLM (or just the URL list).
import { readStore } from '../../../../lib/store';
import { buildSourcePack, sourceUrls } from '../../../../lib/notebooklm';
import { errorJson } from '../../../../lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const id = params.get('id');
  if (id && !/^[a-z0-9-]{1,64}$/i.test(id)) return errorJson('Invalid id', 400);
  const store = await readStore();
  const b = id ? store.briefings.find((x) => x.id === id) : store.briefings[0];
  if (!b) return errorJson('Briefing not found', 404);
  const day = b.createdAt.slice(0, 10);
  const urlsOnly = params.get('format') === 'urls';
  const body = urlsOnly ? sourceUrls(b).join('\n') + '\n' : buildSourcePack(b, store.preferences.timezone);
  return new Response(body, {
    headers: {
      'content-type': `${urlsOnly ? 'text/plain' : 'text/markdown'}; charset=utf-8`,
      'content-disposition': `attachment; filename="siva-${urlsOnly ? 'urls' : 'briefing'}-${day}.${urlsOnly ? 'txt' : 'md'}"`,
      'cache-control': 'no-store',
    },
  });
}
