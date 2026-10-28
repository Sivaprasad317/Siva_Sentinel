// GET  /api/scan -> recent scans + what is configured
// POST /api/scan {kind, target, confirm: true} -> start an authorised scan (one at a time)
import { readStore } from '../../../lib/store';
import { getEnv } from '../../../lib/config';
import { isScanRunning, startScan, trivyAvailable, validateScanTarget } from '../../../lib/scan';
import { errorJson, json, limited, readJsonBody } from '../../../lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const env = getEnv();
  const store = await readStore();
  return json({
    scans: store.scans,
    running: isScanRunning(),
    config: {
      allowedDomains: env.scanAllowedDomains,
      allowedPathsConfigured: env.scanAllowedPaths.length > 0,
      allowedRepoHosts: env.scanAllowedRepoHosts,
      trivyVersion: await trivyAvailable(),
      trivyServer: Boolean(env.trivyServerUrl),
    },
  });
}

export async function POST(req: Request) {
  const blocked = limited(req, 'scan', 6, 60 * 60_000);
  if (blocked) return blocked;
  const body = await readJsonBody(req);
  if (!body.ok) return body.res;
  const b = body.value as { kind?: unknown; target?: unknown; confirm?: unknown };
  if (b.confirm !== true) return errorJson('Please confirm that you own or are authorised to scan this target.', 400);
  const env = getEnv();
  const v = validateScanTarget(b.kind, b.target, { domains: env.scanAllowedDomains, paths: env.scanAllowedPaths, repoHosts: env.scanAllowedRepoHosts });
  if (!v.ok) return errorJson(v.error, 400);
  const id = await startScan(v.value.kind, v.value.target);
  if (!id) return errorJson('Another scan is still running. Please wait for it to finish.', 409);
  return json({ id }, 202);
}
