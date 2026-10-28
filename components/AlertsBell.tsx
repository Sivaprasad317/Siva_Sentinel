'use client';
// Critical-alert bell in the top bar. Polls /api/alerts, shows a badge, lists recent alerts,
// and (if you allow it) raises a desktop notification when a NEW critical item appears — so you
// don't have to be watching the screen.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AlertEntry } from '../lib/types';
import { timeAgo } from '../lib/format';

export default function AlertsBell({ onOpenStory }: { onOpenStory: (storyId: string) => void }) {
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [unseen, setUnseen] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifyOn, setNotifyOn] = useState(false);
  const knownIds = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  useEffect(() => {
    try {
      setNotifyOn(typeof Notification !== 'undefined' && Notification.permission === 'granted' && localStorage.getItem('siva-notify') === '1');
    } catch {
      /* storage blocked */
    }
  }, []);

  const notify = useCallback((fresh: AlertEntry[]) => {
    if (!notifyOn || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const top = fresh.slice(0, 3);
    for (const a of top) {
      try {
        const n = new Notification(`🔴 ${a.kev ? 'Exploited' : a.severity} · SIVA Sentinel`, { body: a.title, tag: a.id });
        n.onclick = () => {
          window.focus();
          if (a.storyId) onOpenStory(a.storyId);
        };
      } catch {
        /* ignore */
      }
    }
  }, [notifyOn, onOpenStory]);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/alerts');
      if (!r.ok) return;
      const d = await r.json();
      const list: AlertEntry[] = d.alerts ?? [];
      const fresh = list.filter((a) => !knownIds.current.has(a.id) && !a.seen);
      list.forEach((a) => knownIds.current.add(a.id));
      if (!firstLoad.current && fresh.length) notify(fresh); // don't notify for the backlog on first load
      firstLoad.current = false;
      setAlerts(list);
      setUnseen(d.unseen ?? 0);
    } catch {
      /* best effort */
    }
  }, [notify]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 25_000);
    return () => clearInterval(t);
  }, [load]);

  const markSeen = async () => {
    setUnseen(0);
    await fetch('/api/alerts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ seen: 'all' }) });
    setAlerts((a) => a.map((x) => ({ ...x, seen: true })));
  };

  const toggleNotify = async () => {
    if (notifyOn) {
      setNotifyOn(false);
      try {
        localStorage.setItem('siva-notify', '0');
      } catch {
        /* ignore */
      }
      return;
    }
    if (typeof Notification === 'undefined') return;
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm === 'granted') {
      setNotifyOn(true);
      try {
        localStorage.setItem('siva-notify', '1');
      } catch {
        /* ignore */
      }
    }
  };

  const openPanel = () => {
    const next = !open;
    setOpen(next);
    if (next && unseen) void markSeen();
  };

  return (
    <div className="menu-wrap">
      <button type="button" className={`bell ${unseen ? 'has' : ''}`} onClick={openPanel} aria-expanded={open} aria-label={`Alerts${unseen ? `, ${unseen} new` : ''}`}>
        🔔{unseen > 0 && <span className="bell-badge">{unseen > 9 ? '9+' : unseen}</span>}
      </button>
      {open && (
        <div className="dropdown glass alerts-drop" role="menu">
          <div className="alerts-head">
            <b>Critical alerts</b>
            <label className="check small" title="Desktop notifications for new critical items">
              <input type="checkbox" checked={notifyOn} onChange={toggleNotify} /> Notify
            </label>
          </div>
          {alerts.length === 0 && <p className="muted small pad">No critical alerts yet. Siva raises one when a new exploited or critical item appears.</p>}
          {alerts.slice(0, 20).map((a) => (
            <button
              key={a.id}
              type="button"
              className={`alert-item ${a.seen ? '' : 'new'}`}
              onClick={() => {
                setOpen(false);
                if (a.storyId) onOpenStory(a.storyId);
              }}
            >
              <span className="row">
                <span className={`tag ${a.kev ? 'hot' : `p-${a.severity}`}`}>{a.kev ? 'KEV' : a.severity}</span>
                {a.cve && <span className="cve small">{a.cve}</span>}
                <span className="spacer" />
                <span className="muted small">{timeAgo(a.createdAt)}</span>
              </span>
              <span className="alert-title">{a.title}</span>
              <span className="muted small">{a.source}</span>
            </button>
          ))}
          {alerts.length > 0 && (
            <div className="alerts-foot">
              <button type="button" className="link small" onClick={markSeen}>Mark all seen</button>
              <button type="button" className="link small" onClick={async () => { await fetch('/api/alerts', { method: 'DELETE' }); setAlerts([]); setUnseen(0); }}>Clear</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
