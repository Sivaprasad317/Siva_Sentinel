'use client';
// Live feed log: every item Siva has read, in one table — S.No, Date, Day, Title, What matters,
// Source, Link. Newest first. Refreshes itself every minute, so you can watch it grow.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FeedLogEntry } from '../lib/types';
import { sortKey } from '../lib/feedLog';
import { timeAgo } from '../lib/format';

interface Payload {
  items: FeedLogEntry[];
  total: number;
  checks: number;
  lastNew: number;
  lastCheckedAt: string | null;
  timezone: string;
}

const PAGE = 100;

function when(iso: string, tz: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '—', day: '—' };
  return {
    date: d.toLocaleString('en-GB', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
    day: d.toLocaleString('en-GB', { timeZone: tz, weekday: 'long' }),
  };
}

function csvCell(v: string) {
  return `"${v.replace(/"/g, '""')}"`;
}

export default function FeedLogView({ onOpenUrl }: { onOpenUrl?: (url: string) => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [source, setSource] = useState('');
  const [level, setLevel] = useState('');
  const [page, setPage] = useState(0);
  const [loadedAt, setLoadedAt] = useState<number>(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/feed-log', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setData(d);
      setErr(null);
      setLoadedAt(Date.now());
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const tz = data?.timezone ?? 'Asia/Kolkata';
  const sources = useMemo(() => [...new Set((data?.items ?? []).map((i) => i.source))].sort(), [data]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.items ?? []).filter((i) => {
      if (source && i.source !== source) return false;
      if (level === 'kev' && !i.kev) return false;
      if ((level === 'critical' || level === 'high') && i.priority !== level) return false;
      if (needle && !`${i.title} ${i.matter} ${i.source} ${i.cves.join(' ')}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [data, q, source, level]);

  useEffect(() => setPage(0), [q, source, level]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);

  const exportCsv = () => {
    const head = ['S.No', 'Date', 'Day', 'Title', 'What matters', 'Source', 'Link'];
    const lines = [head.join(',')].concat(
      rows.map((r, i) => {
        const w = when(sortKey(r), tz);
        return [String(i + 1), csvCell(w.date), w.day, csvCell(r.title), csvCell(r.matter), csvCell(r.source), csvCell(r.url)].join(',');
      }),
    );
    const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `siva-feed-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="stack">
      <section className="panel glass">
        <div className="panel-head">
          <h2 className="panel-title">Live feed log — {data ? data.total : '…'} items read</h2>
          <div className="row">
            <button type="button" className="btn ghost small" onClick={() => void load()}>↻ Reload</button>
            <button type="button" className="btn ghost small" onClick={exportCsv} disabled={!rows.length}>⬇ CSV</button>
          </div>
        </div>
        <p className="hint">
          Every item Siva reads from your feeds is kept here, newest first — not only the top 60 of the briefing.
          {data && <> Feeds checked <b>{data.checks}</b> time{data.checks === 1 ? '' : 's'}{data.lastCheckedAt ? <> · last check {timeAgo(data.lastCheckedAt)}</> : null} · <b>+{data.lastNew}</b> new at the last check.</>}
          {loadedAt > 0 && <> This table reloads itself every minute.</>}
        </p>
        <div className="row">
          <input className="search grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, what matters, CVE…" style={{ flex: '2 1 220px' }} />
          <select value={source} onChange={(e) => setSource(e.target.value)} style={{ flex: '1 1 160px' }} aria-label="Source">
            <option value="">All sources</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Severity">
            <option value="">All severities</option>
            <option value="kev">Exploited (KEV)</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
          </select>
        </div>
        {err && <div className="inline-error">{err}</div>}
      </section>

      <section className="panel glass">
        {!data && !err && <div className="skeleton" style={{ height: 200 }} />}
        {data && data.total === 0 && <p className="muted">Nothing has been read yet. Press Refresh on the dashboard — items will appear here.</p>}
        {data && rows.length > 0 && (
          <div className="table-scroll">
            <table className="table feedlog-table">
              <thead>
                <tr><th>S.No</th><th>Date</th><th>Day</th><th>Title</th><th>What matters</th><th>Source</th><th>Link</th></tr>
              </thead>
              <tbody>
                {shown.map((r, i) => {
                  const w = when(sortKey(r), tz);
                  return (
                    <tr key={r.url}>
                      <td className="num">{page * PAGE + i + 1}</td>
                      <td className="nowrap">{w.date}</td>
                      <td className="nowrap">{w.day}</td>
                      <td className="fl-title">
                        {r.kev && <span className="tag hot">KEV</span>}
                        {!r.kev && (r.priority === 'critical' || r.priority === 'high') && <span className={`tag p-${r.priority}`}>{r.priority}</span>}{' '}
                        {r.title}
                      </td>
                      <td className="fl-matter small">{r.matter || <span className="muted">—</span>}</td>
                      <td className="nowrap small">{r.source}</td>
                      <td><a href={r.url} target="_blank" rel="noopener noreferrer" onClick={() => onOpenUrl?.(r.url)}>Open ↗</a></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 && rows.length === 0 && <p className="muted">No items match the filters.</p>}
        {rows.length > PAGE && (
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
            <button type="button" className="btn ghost small" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Newer</button>
            <span className="muted small">Page {page + 1} of {pages} · {rows.length} items</span>
            <button type="button" className="btn ghost small" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Older →</button>
          </div>
        )}
      </section>
    </div>
  );
}
