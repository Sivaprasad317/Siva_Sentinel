'use client';
// Defensive scans: passive website check (authorised domains only) and Trivy scans.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { ScanKind, ScanRecord } from '../lib/types';
import { formatInZone } from '../lib/format';

interface ScanConfig {
  allowedDomains: string[];
  allowedPathsConfigured: boolean;
  allowedRepoHosts: string[];
  trivyVersion: string | null;
  trivyServer: boolean;
}

const KINDS: { id: ScanKind; label: string; placeholder: string }[] = [
  { id: 'web', label: 'Website check (passive)', placeholder: 'example.com' },
  { id: 'trivy-image', label: 'Trivy: container image', placeholder: 'nginx:1.27' },
  { id: 'trivy-repo', label: 'Trivy: git repository', placeholder: 'https://github.com/org/repo' },
  { id: 'trivy-fs', label: 'Trivy: local folder', placeholder: 'C:\\Users\\you\\code\\project' },
];

export default function ScanView({ timezone }: { timezone: string }) {
  const [scans, setScans] = useState<ScanRecord[] | null>(null);
  const [config, setConfig] = useState<ScanConfig | null>(null);
  const [running, setRunning] = useState(false);
  const [kind, setKind] = useState<ScanKind>('web');
  const [target, setTarget] = useState('');
  const [authorised, setAuthorised] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/scan');
      const d = await r.json();
      setScans(d.scans);
      setConfig(d.config);
      setRunning(d.running);
      setOpen((o) => o ?? d.scans[0]?.id ?? null);
    } catch {
      setMsg({ ok: false, text: 'Could not load scans.' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [running, load]);

  const start = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const res = await fetch('/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, target, confirm: authorised }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg({ ok: false, text: d.error ?? `HTTP ${res.status}` });
    setMsg({ ok: true, text: 'Scan started.' });
    setOpen(d.id);
    setRunning(true);
    void load();
  };

  return (
    <div className="stack">
      <form className="panel form" onSubmit={start}>
        <h2 className="panel-title">New scan</h2>
        <p className="hint">
          Only scan things you own or have written permission to test. Website checks are passive (TLS, redirects, headers, cookies, security.txt) and only work on domains listed in SCAN_ALLOWED_DOMAINS.
          Trivy runs on your computer and must be installed (https://trivy.dev).
        </p>
        <div className="grid2">
          <label>Type
            <select value={kind} onChange={(e) => setKind(e.target.value as ScanKind)}>
              {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </label>
          <label>Target
            <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={KINDS.find((k) => k.id === kind)?.placeholder} maxLength={300} required />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={authorised} onChange={(e) => setAuthorised(e.target.checked)} /> I own this target or am authorised to scan it
        </label>
        <div className="row">
          <button className="btn primary" type="submit" disabled={!authorised || running || !target.trim()}>{running ? 'A scan is running…' : 'Start scan'}</button>
          {msg && <span className={msg.ok ? 'ok-text' : 'inline-error'}>{msg.text}</span>}
        </div>
        {config && (
          <ul className="bullets small muted">
            <li>Authorised domains: {config.allowedDomains.length ? config.allowedDomains.join(', ') : 'none (set SCAN_ALLOWED_DOMAINS)'}</li>
            <li>Trivy: {config.trivyVersion ?? 'not found (install it or set TRIVY_PATH)'}{config.trivyServer ? ' · using Trivy server' : ''}</li>
            <li>Local folders: {config.allowedPathsConfigured ? 'configured' : 'none (set SCAN_ALLOWED_PATHS)'} · Repo hosts: {config.allowedRepoHosts.join(', ')}</li>
          </ul>
        )}
      </form>

      <section className="panel">
        <h2 className="panel-title">Scan results</h2>
        {scans === null && <div className="skeleton" style={{ height: 120 }} />}
        {scans && scans.length === 0 && <p className="muted">No scans yet.</p>}
        {scans?.map((s) => (
          <div key={s.id} className="scan">
            <button type="button" className="scan-head" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
              <span className={`tag ${s.status === 'failed' ? 'p-critical' : s.status === 'running' ? 'warn' : 'conf-confirmed'}`}>{s.status}</span>
              <b>{s.target}</b>
              <span className="muted small">{s.kind} · {formatInZone(s.startedAt, timezone)}</span>
              <span className="counts">
                {(['critical', 'high', 'medium', 'low'] as const).map((k) => (s.counts[k] ? <span key={k} className={`tag p-${k === 'low' ? 'low' : k}`}>{s.counts[k]} {k}</span> : null))}
              </span>
            </button>
            {open === s.id && (
              <div className="scan-body">
                {s.status === 'running' && <p className="muted"><span className="spinner" /> Running… Trivy image scans can take several minutes the first time (it downloads its database).</p>}
                {s.error && <p className="inline-error">{s.error}</p>}
                {s.explanation && <p className="exec-text">{s.explanation}</p>}
                {s.findings.length > 0 && (
                  <table className="table">
                    <thead><tr><th>Severity</th><th>Finding</th><th>Evidence</th><th>What to do</th></tr></thead>
                    <tbody>
                      {s.findings.slice(0, 150).map((f, i) => (
                        <tr key={`${f.id}-${i}`}>
                          <td><span className={`tag ${f.severity === 'pass' ? 'conf-confirmed' : f.severity === 'info' ? 'plain' : `p-${f.severity}`}`}>{f.severity}</span>{f.inKev && <span className="tag hot">KEV</span>}</td>
                          <td>{f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer">{f.title}</a> : f.title}</td>
                          <td className="small">{f.evidence}</td>
                          <td className="small">{f.fix ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
