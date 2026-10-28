// Date formatting used by the dashboard. Defaults to India Standard Time.

export function formatInZone(iso: string | null | undefined, tz = 'Asia/Kolkata', withTime = true): string {
  if (!iso) return 'Not provided';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Invalid date';
  try {
    const s = d.toLocaleString('en-IN', {
      timeZone: tz,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : {}),
    });
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
