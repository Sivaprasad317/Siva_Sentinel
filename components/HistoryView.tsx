'use client';
// Saved briefings: 3D timeline, search across all of them, and delete options.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatInZone } from '../lib/format';
import HistoryTimeline3D from './HistoryTimeline3D';
import Tilt from './Tilt';

interface Summary { id: string; createdAt: string; trigger: string; storyCount: number; criticalCount: number; kevCount?: number; ransomwareCount?: number; aiStatus: string }
interface Result { briefingId: string; briefingAt: string; story: { id: string; title: string; url: string; source: string; publishedAt: string | null; priority: string } }

export default function HistoryView({ timezone, currentId, onOpen, onDeleted }: { timezone: string; currentId?: string | null; onOpen: (briefingId: string, storyId?: string) => void; onDeleted: (removedIds: string[] | 'all') => void }) {
  const [list, setList] = useState<Summary[] | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (query: string) => {
    try {
      const r = await fetch(`/api/history${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setList(d.briefings);
      setResults(d.results);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(q), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  const remove = async (id: string) => {
    if (!window.confirm('Delete this briefing from history? This cannot be undone.')) return;
    setBusy(true);
    const r = await fetch(`/api/history?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    setBusy(false);
    if (!r.ok) return setError((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
    setNotice('Briefing deleted.');
    onDeleted([id]);
    void load(q);
  };

  const clearAll = async () => {
    if (!list?.length) return;
    if (!window.confirm(`Delete ALL ${list.length} saved briefings? This cannot be undone.`)) return;
    setBusy(true);
    const r = await fetch('/api/history?all=1', { method: 'DELETE' });
    setBusy(false);
    if (!r.ok) return setError((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
    setNotice('All briefings deleted. Press Refresh to collect a new one.');
    onDeleted('all');
    void load(q);
  };

  const clearChat = async () => {
    if (!window.confirm('Clear the whole conversation with Siva?')) return;
    const r = await fetch('/api/chat', { method: 'DELETE' });
    setNotice(r.ok ? 'Conversation cleared. Reload the page to empty the chat panel.' : 'Could not clear the conversation.');
  };

  const timeline = useMemo(
    () => (list ?? []).map((b) => ({ id: b.id, label: formatInZone(b.createdAt, timezone), storyCount: b.storyCount, criticalCount: b.criticalCount, kevCount: b.kevCount ?? 0 })),
    [list, timezone],
  );

  return (
    <div className="stack">
      <section className="panel glass">
        <div className="panel-head">
          <h2 className="panel-title">Briefing timeline (3D)</h2>
          <span className="muted small">{list?.length ?? 0} saved · live refreshes keep one snapshot per day</span>
        </div>
        {list && list.length > 0 ? <HistoryTimeline3D items={timeline} onOpen={(id) => onOpen(id)} /> : <p className="muted">No saved briefings yet.</p>}
      </section>

      <section className="panel glass">
        <h2 className="panel-title">Search all saved briefings</h2>
        <input className="search wide" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. FortiMail, CVE-2026-, ransomware, India" maxLength={100} />
        {q.trim() && (
          <ul className="results">
            {results.length === 0 && <li className="muted">No matches.</li>}
            {results.map((r) => (
              <li key={r.story.url}>
                <span className={`tag p-${r.story.priority}`}>{r.story.priority}</span>{' '}
                <button type="button" className="link" onClick={() => onOpen(r.briefingId, r.story.id)}>{r.story.title}</button>
                <span className="muted"> · {r.story.source} · briefing {formatInZone(r.briefingAt, timezone)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel glass">
        <div className="panel-head">
          <h2 className="panel-title">Briefing history</h2>
          <div className="row">
            <button type="button" className="btn ghost small" onClick={clearChat}>Clear conversation</button>
            <button type="button" className="btn danger small" onClick={clearAll} disabled={busy || !list?.length}>🗑 Clear all history</button>
          </div>
        </div>
        {error && <div className="inline-error">{error}</div>}
        {notice && <div className="ok-text small">{notice}</div>}
        {list === null && !error && <div className="skeleton" style={{ height: 120 }} />}
        {list && list.length > 0 && (
          <div className="history-cards">
            {list.map((b) => (
              <Tilt key={b.id} className={`history-card ${b.id === currentId ? 'current' : ''}`} max={6}>
                <div className="hc-top">
                  <span className="hc-date">{formatInZone(b.createdAt, timezone)}</span>
                  <span className={`tag ${b.trigger === 'live' ? 'live-tag' : 'plain'}`}>{b.trigger}</span>
                </div>
                <div className="hc-stats">
                  <span><b>{b.storyCount}</b> stories</span>
                  <span className="crit"><b>{b.criticalCount}</b> critical</span>
                  <span className="purple"><b>{b.kevCount ?? 0}</b> KEV</span>
                  <span className="amber"><b>{b.ransomwareCount ?? 0}</b> ransomware</span>
                </div>
                <div className="row">
                  <span className="muted small">AI: {b.aiStatus}</span>
                  <span className="spacer" />
                  <a className="btn ghost small" href={`/api/report?id=${encodeURIComponent(b.id)}`}>⬇ Report</a>
                  <button type="button" className="btn small" onClick={() => onOpen(b.id)}>Open</button>
                  <button type="button" className="btn danger small" onClick={() => remove(b.id)} disabled={busy} aria-label={`Delete briefing from ${formatInZone(b.createdAt, timezone)}`}>Delete</button>
                </div>
              </Tilt>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
