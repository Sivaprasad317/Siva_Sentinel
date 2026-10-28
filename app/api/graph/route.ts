// GET /api/graph?days=7|30|90            -> the Threat Graph + weekly outlook
// GET /api/graph?days=30&node=<id|name>  -> one node explained (connections + evidence stories)
import { getThreatGraph } from '../../../lib/graphData';
import { describeNode, findNode, weeklyOutlook } from '../../../lib/threatGraph';
import { errorJson, json } from '../../../lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const days = Number(u.searchParams.get('days') ?? 30);
  const graph = await getThreatGraph(days);
  const q = u.searchParams.get('node');
  if (q) {
    if (q.length > 120) return errorJson('Node name is too long.', 400);
    const node = graph.nodes.find((n) => n.id === q) ?? findNode(graph, q);
    if (!node) return errorJson('Not found in the graph for this period.', 404);
    return json({ node, ...describeNode(graph, node) });
  }
  return json({ graph, outlook: weeklyOutlook(graph) });
}
