// Critical alerting: when a refresh produces NEW critical/exploited stories, raise alerts.
// Pure function so it is easy to test. "Alertable" = exploited (CISA KEV) or critical priority.
import { randomUUID } from 'node:crypto';
import type { AlertEntry, Story } from './types';

export function isAlertable(s: Story): boolean {
  return Boolean(s.kev) || s.priority === 'critical' || Boolean(s.priority === 'high' && s.kev);
}

/**
 * Compare this refresh's stories against the URLs we have already alerted on.
 * Returns the new alerts and the full updated set of alerted URLs (capped).
 */
export function diffNewAlerts(stories: Story[], alertedUrls: string[], now: Date = new Date(), maxUrls = 3000): { alerts: AlertEntry[]; alertedUrls: string[] } {
  const known = new Set(alertedUrls);
  const alerts: AlertEntry[] = [];
  const addedUrls: string[] = [];
  for (const s of stories) {
    if (!isAlertable(s) || known.has(s.url)) continue;
    known.add(s.url);
    addedUrls.push(s.url);
    alerts.push({
      id: randomUUID(),
      storyId: s.id,
      title: s.title,
      url: s.url,
      severity: s.priority,
      source: s.source,
      cve: s.cves[0],
      kev: Boolean(s.kev),
      createdAt: now.toISOString(),
      seen: false,
    });
  }
  // Keep the alerted-URL history bounded (newest kept).
  const merged = [...addedUrls, ...alertedUrls].slice(0, maxUrls);
  return { alerts, alertedUrls: merged };
}
