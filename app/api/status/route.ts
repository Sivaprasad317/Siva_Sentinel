// GET /api/status -> refresh progress, schedule and configuration status (never the keys themselves).
import { readStore } from '../../../lib/store';
import { getRefreshState } from '../../../lib/refresh';
import { minutesToNextLive, nextRunLabel } from '../../../lib/schedule';
import { getEnv } from '../../../lib/config';
import { json } from '../../../lib/api';
import { zonedParts } from '../../../lib/schedule';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const store = await readStore();
  const env = getEnv();
  const tz = store.preferences.timezone;
  const todayKey = zonedParts(new Date(), tz).dateKey;
  return json({
    refresh: getRefreshState(),
    latestBriefingAt: store.briefings[0]?.createdAt ?? null,
    lastRunAt: store.meta.lastRunAt ?? null,
    lastError: store.meta.lastError ?? null,
    nextScheduledRun: env.schedulerDisabled ? null : nextRunLabel(new Date(), store.preferences, store.meta.lastScheduledDateKey),
    schedulerDisabled: env.schedulerDisabled,
    aiConfigured: Boolean(env.geminiKey),
    aiModel: env.geminiModel,
    nvdKeyConfigured: Boolean(env.nvdKey),
    scraperApiConfigured: Boolean(env.scraperApiKey),
    intelEnabled: env.enableIntel,
    hackerNewsEnabled: env.enableHackerNews,
    ransomwareLiveEnabled: env.enableRansomwareLive,
    scanDomains: env.scanAllowedDomains.length,
    userTitle: env.userTitle,
    abuseChConfigured: Boolean(env.abuseChKey),
    webSearchEnabled: env.enableWebSearch,
    liveRefreshMinutes: store.preferences.liveRefreshMinutes,
    nextLiveInMinutes: minutesToNextLive(new Date(), store.preferences.liveRefreshMinutes, store.meta.lastRunAt ?? null),
    feedLog: {
      total: store.feedLog.length,
      today: store.feedLog.filter((e) => zonedParts(new Date(e.firstSeenAt), tz).dateKey === todayKey).length,
      kev: store.feedLog.filter((e) => e.kev).length,
      cyber: store.feedLog.filter((e) => e.cyber !== false).length,
      lastNew: store.meta.lastNewItems ?? 0,
      checks: store.meta.checks ?? 0,
      lastPool: store.meta.lastPoolSize ?? 0,
    },
    alertsUnseen: store.alerts.filter((a) => !a.seen).length,
  });
}
