// Timezone-aware scheduling maths. Pure functions, so they are easy to test.
import type { Preferences } from './types';

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isValidHHMM(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** Calendar date and wall-clock time of `date` in timezone `tz`. */
export function zonedParts(date: Date, tz: string): { dateKey: string; hhmm: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { dateKey: `${get('year')}-${get('month')}-${get('day')}`, hhmm: `${get('hour')}:${get('minute')}` };
}

/**
 * Should the scheduled briefing run now?
 * True when the schedule is on, the local time in the user's timezone has reached the
 * configured time, and it has not already run for that local date. If the computer was
 * asleep at the scheduled time, it catches up once later the same day.
 */
export function isDue(now: Date, prefs: Pick<Preferences, 'scheduleEnabled' | 'briefingTime' | 'timezone'>, lastRunDateKey: string | undefined): boolean {
  if (!prefs.scheduleEnabled || !isValidHHMM(prefs.briefingTime) || !isValidTimezone(prefs.timezone)) return false;
  const { dateKey, hhmm } = zonedParts(now, prefs.timezone);
  return hhmm >= prefs.briefingTime && lastRunDateKey !== dateKey;
}

/** Human-friendly description of the next scheduled run. */
export function nextRunLabel(now: Date, prefs: Pick<Preferences, 'scheduleEnabled' | 'briefingTime' | 'timezone'>, lastRunDateKey: string | undefined): string | null {
  if (!prefs.scheduleEnabled || !isValidHHMM(prefs.briefingTime) || !isValidTimezone(prefs.timezone)) return null;
  const { dateKey, hhmm } = zonedParts(now, prefs.timezone);
  if (lastRunDateKey !== dateKey && hhmm < prefs.briefingTime) return `Today ${prefs.briefingTime} (${prefs.timezone})`;
  if (lastRunDateKey !== dateKey) return `Due now (${prefs.timezone})`;
  return `Tomorrow ${prefs.briefingTime} (${prefs.timezone})`;
}

/**
 * Live mode: is it time for another automatic refresh?
 * Uses the later of the last successful run and the last attempt, so a failing source
 * does not cause a retry every minute.
 */
export function isLiveDue(now: Date, minutes: number, lastRunAt: string | null, lastAttemptAt: string | null): boolean {
  if (!minutes || minutes < 5) return false;
  const last = Math.max(lastRunAt ? Date.parse(lastRunAt) : 0, lastAttemptAt ? Date.parse(lastAttemptAt) : 0);
  if (!last) return false; // never refreshed yet: wait for the user or the daily schedule
  return now.getTime() - last >= minutes * 60_000;
}

/** Minutes until the next live refresh (null when live mode is off or nothing has run yet). */
export function minutesToNextLive(now: Date, minutes: number, lastRunAt: string | null): number | null {
  if (!minutes || !lastRunAt) return null;
  return Math.max(0, Math.ceil((Date.parse(lastRunAt) + minutes * 60_000 - now.getTime()) / 60_000));
}
