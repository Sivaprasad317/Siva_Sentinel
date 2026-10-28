// Date formatting used by the dashboard. Defaults to India Standard Time.

// Building an Intl.DateTimeFormat costs ~1 ms (toLocaleString builds one on every call). Formatting
// thousands of feed-log rows that way blocked the server for seconds, so formatters are reused.
const formatters = new Map<string, Intl.DateTimeFormat>();

/** A cached Intl.DateTimeFormat. Throws (like the constructor) for an invalid time zone. */
export function dtf(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, f);
  }
  return f;
}

export function formatInZone(iso: string | null | undefined, tz = 'Asia/Kolkata', withTime = true): string {
  if (!iso) return 'Not provided';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Invalid date';
  try {
    const s = dtf('en-IN', {
      timeZone: tz,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : {}),
    }).format(d);
    return tz === 'Asia/Kolkata' && withTime ? `${s} IST` : s;
  } catch {
    return d.toISOString();
  }
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'unknown';
  const diff = now - Date.parse(iso);
  if (!Number.isFinite(diff)) return 'unknown';
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function isStale(iso: string | null | undefined, now = Date.now()): boolean {
  if (!iso) return true;
  return now - Date.parse(iso) > STALE_AFTER_MS;
}
