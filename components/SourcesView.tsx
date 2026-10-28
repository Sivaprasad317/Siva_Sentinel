'use client';
// Sources panel: view, enable/disable, add and remove the threat-intel feeds Siva reads.
// Your choices are saved in Siva's data store, so they survive restarts and you can update them any time.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { SourceRow } from '../lib/types';

interface Row extends SourceRow {
  last: { ok: boolean; items: number; error?: string } | null;
}

export default function SourcesView() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState({ total: 0, enabled: 0 });
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [filter, setFilter] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/sources');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setRows(d.sources);
      setCounts(d.counts);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (row: Row) => {
    setRows((rs) => rs?.map((x) => (x.url === row.url ? { ...x, enabled: !x.enabled } : x)) ?? rs);
    await fetch('/api/sources', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: row.url, enabled: !row.enabled }) });
    void load();
  };

  const bulk = async (enableAll: boolean) => {
    setBusy(true);
    await fetch('/api/sources', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(enableAll ? { enableAllSeeds: true } : { disableAllSeeds: true }) });
    setBusy(false);
    setMsg({ ok: true, text: enableAll ? 'All feeds enabled. Refreshes will be slower and some feeds may fail — that is normal.' : 'All seed feeds disabled (the core feeds stay on).' });
    void load();
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const res = await fetch('/api/sources', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, url }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg({ ok: false, text: d.error ?? `HTTP ${res.status}` });
    setName('');
    setUrl('');
    setMsg({ ok: true, text: 'Feed added. It will be read on the next refresh.' });
    void load();
  };

  const remove = async (row: Row) => {
    if (!row.id || !window.confirm(`Remove "${row.name}"?`)) return;
    await fetch(`/api/sources?id=${encodeURIComponent(row.id)}`, { method: 'DELETE' });
    void load();
  };

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (rows ?? []).filter((r) => !q || `${r.name} ${r.url}`.toLowerCase().includes(q));
  }, [rows, filter]);

  return (
    <div className="stack">
      <section className="panel glass">
        <div className="panel-head">
          <h2 className="panel-title">Live sources — {counts.enabled} of {counts.total} feeds on</h2>
          <div className="row">
            <button type="button" className="btn ghost small" onClick={() => bulk(true)} disabled={busy}>Enable all</button>
            <button type="button" className="btn ghost small" onClick={() => bulk(false)} disabled={busy}>Disable seed feeds</button>
          </div>
        </div>
        <p className="hint">Siva reads the enabled feeds on every refresh (your live-mode schedule). More feeds = slower refresh and more failures (shown below). Core feeds cannot be removed, only disabled. Your choices are saved.</p>
        <form className="row" onSubmit={add}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. My Blog)" maxLength={80} style={{ flex: '1 1 160px' }} />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/feed/" maxLength={300} style={{ flex: '2 1 260px' }} />
          <button className="btn primary small" type="submit" disabled={!name.trim() || !url.trim()}>Add feed</button>
        </form>
        {msg && <div className={msg.ok ? 'ok-text small' : 'inline-error'}>{msg.text}</div>}
      </section>

      <section className="panel glass">
        <input className="search wide" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter sources…" />
        {rows === null && <div className="skeleton" style={{ height: 160, marginTop: 10 }} />}
        {rows && (
          <table className="table sources-table">
            <thead><tr><th>On</th><th>Source</th><th>Type</th><th>Last fetch</th><th /></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.url} className={r.enabled ? '' : 'off'}>
                  <td><label className="switch"><input type="checkbox" checked={r.enabled} onChange={() => toggle(r)} /><span /></label></td>
                  <td>
                    <a href={r.url} target="_blank" rel="noopener noreferrer">{r.name}</a>
                    <span className={`tag plain origin-${r.origin}`}>{r.origin}</span>
                    {r.category !== 'core' && <span className="tag plain">{r.category}</span>}
                    <div className="muted small url">{r.url}</div>
                  </td>
                  <td><span className={`tag ${r.kind === 'feed' ? 'conf-confirmed' : 'plain'}`} title={r.kind === 'page' ? 'A web page: Siva finds the RSS feed it advertises' : 'RSS/Atom feed'}>{r.kind === 'feed' ? 'feed' : 'page → auto feed'}</span></td>
                  <td className="small">
                    {r.last ? (r.last.ok ? <span className="ok-text">{r.last.items} items</span> : <span className="warn-text" title={r.last.error}>failed</span>) : <span className="muted">—</span>}
                  </td>
                  <td>{r.origin === 'custom' && <button type="button" className="btn danger small" onClick={() => remove(r)}>Remove</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows && shown.length === 0 && <p className="muted">No sources match the filter.</p>}
      </section>
    </div>
  );
}
