// Daily scheduled briefing. Started once when the Next.js server boots (see instrumentation.ts).
// Every minute it checks whether the configured time (in your timezone) has arrived.
// Because it lives in the server process, it only runs while `npm run dev` / `npm start` is running.
import { getEnv } from './config';
import { isDue, isLiveDue, zonedParts } from './schedule';
import { readStore, updateStore } from './store';
import { getRefreshState, startRefresh } from './refresh';

const g = globalThis as unknown as { __sivaSchedulerStarted?: boolean };

async function tick() {
  try {
    const { preferences, meta } = await readStore();
    const now = new Date();
    if (getRefreshState().running) return;
    if (!isDue(now, preferences, meta.lastScheduledDateKey)) {
      // Live mode: refresh every N minutes while the server is running.
      if (isLiveDue(now, preferences.liveRefreshMinutes, meta.lastRunAt ?? null, getRefreshState().lastFinishedAt)) {
        console.log(`[siva] Live refresh (every ${preferences.liveRefreshMinutes} min)`);
        startRefresh('live');
      }
      return;
    }
    const { dateKey } = zonedParts(now, preferences.timezone);
    // Record the run date first so a failing refresh is not retried every minute.
    await updateStore((d) => {
      d.meta.lastScheduledDateKey = dateKey;
    });
    console.log(`[siva] Scheduled briefing starting for ${dateKey} (${preferences.timezone})`);
    startRefresh('scheduled');
  } catch (err) {
    console.error('[siva] scheduler tick failed:', (err as Error).message);
  }
}

export function startScheduler() {
  if (g.__sivaSchedulerStarted || getEnv().schedulerDisabled) return;
  g.__sivaSchedulerStarted = true;
  setTimeout(tick, 15_000);
  setInterval(tick, 60_000).unref?.();
  console.log('[siva] Scheduler started (checks every minute).');
}
