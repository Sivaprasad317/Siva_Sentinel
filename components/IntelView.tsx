'use client';
// Threat intel: who is in today's news (auto-detected), actor/technique lookup, and the OSINT toolbox.
import { useEffect, useState } from 'react';

interface Group { id?: string; name: string; aliases: string[]; url?: string; description: string; country?: string; source: string }
interface IntelResponse {
  loaded: boolean;
  builtAt: string | null;
  status: { attack: string; misp: string; profiles: string } | null;
  counts: { groups: number; techniques: number; profiles: number } | null;
  actorsToday: { name: string; source: string; id?: string; url?: string; ttpProfileUrl?: string; stories: { id: string; title: string }[] }[];
  techniquesToday: { id: string; name: string; url: string; stories: number }[];
  toolbox: { name: string; url: string; note: string }[];
  result:
    | null
    | ({ related: { id: string; title: string; url: string }[] } & (
        | { kind: 'actor'; groups: Group[]; ttpProfileUrl?: string }
        | { kind: 'technique'; technique: { id: string; name: string; url: string; tactics: string[]; description: string } }
        | { kind: 'software'; software: { id?: string; name: string; aliases: string[]; url?: string; description: string; kind: string; source: string }[] }
      ));
}

export default function IntelView({ onShowStory }: { onShowStory: (id: string) => void }) {
  const [data, setData] = useState<IntelResponse | null>(null);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/intel${query ? `?q=${encodeURIComponent(query)}` : ''}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [query]);

  return (
    <div className="stack">
      <section className="panel">
        <h2 className="panel-title">Look up a threat actor, malware, tool or ATT&amp;CK technique</h2>
        <form className="row" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
          <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="APT29, Lazarus, LockBit, Cobalt Strike, Emotet, G0016, T1059.001…" maxLength={80} />
          <button className="btn primary" type="submit">Look up</button>
        </form>
        {error && <p className="inline-error">{error}</p>}
        {data && !data.loaded && <p className="hint">Threat-intel data downloads during the next refresh (MITRE ATT&amp;CK ≈ 50 MB, MISP galaxy). Press Refresh now on the dashboard.</p>}
        {query && data?.loaded && !data.result && <p className="muted">No exact match for “{query}”. Try another name or alias.</p>}
        {data?.result?.kind === 'technique' && (
          <div className="intel-card">
            <h3><a href={data.result.technique.url} target="_blank" rel="noopener noreferrer">{data.result.technique.id} · {data.result.technique.name} ↗</a></h3>
            <p className="muted small">Tactics: {data.result.technique.tactics.join(', ') || 'n/a'}</p>
            <p>{data.result.technique.description}</p>
          </div>
        )}
        {data?.result?.kind === 'software' && (
          <div className="stack">
            {data.result.software.map((sw) => (
              <div key={`${sw.source}-${sw.name}`} className="intel-card">
                <h3>{sw.url ? <a href={sw.url} target="_blank" rel="noopener noreferrer">{sw.name} ↗</a> : sw.name} <span className="tag plain">{sw.kind}</span><span className="tag plain">{sw.source}{sw.id ? ` ${sw.id}` : ''}</span></h3>
                <p className="muted small">Also known as: {sw.aliases.slice(0, 15).join(', ')}</p>
                <p>{sw.description || 'No description in this source.'}</p>
              </div>
            ))}
          </div>
        )}
        {data?.result?.kind === 'actor' && (
          <div className="stack">
            {data.result.groups.map((gr) => (
              <div key={`${gr.source}-${gr.name}`} className="intel-card">
                <h3>{gr.url ? <a href={gr.url} target="_blank" rel="noopener noreferrer">{gr.name} ↗</a> : gr.name} <span className="tag plain">{gr.source}{gr.id ? ` ${gr.id}` : ''}</span>{gr.country && <span className="tag plain">{gr.country}</span>}</h3>
                <p className="muted small">Also known as: {gr.aliases.slice(0, 15).join(', ')}</p>
                <p>{gr.description || 'No description in this source.'}</p>
              </div>
            ))}
            {data.result.ttpProfileUrl && <a href={data.result.ttpProfileUrl} target="_blank" rel="noopener noreferrer">Open TTP profile in crocodyli/ThreatActors-TTPs ↗</a>}
          </div>
        )}
        {data?.result && data.result.related.length > 0 && (
          <>
            <h3 className="sub">In today&apos;s briefing</h3>
            <ul className="bullets">{data.result.related.map((s) => <li key={s.id}><button type="button" className="link" onClick={() => onShowStory(s.id)}>{s.title}</button></li>)}</ul>
          </>
        )}
      </section>

      <section className="panel">
        <h2 className="panel-title">Actors and techniques in today&apos;s news <span className="label">auto-detected · may be wrong</span></h2>
        {!data && <div className="skeleton" style={{ height: 100 }} />}
        {data && data.actorsToday.length === 0 && data.techniquesToday.length === 0 && <p className="muted">None detected in the latest briefing.</p>}
        <div className="chips">
          {data?.actorsToday.map((a, i) => (
            <button key={`${a.name}-${i}`} type="button" className="chip" onClick={() => { setQ(a.name); setQuery(a.name); }}>
              {a.name}{a.id ? ` (${a.id})` : ''}<span className="n">{a.stories.length}</span>
            </button>
          ))}
          {data?.techniquesToday.map((t) => (
            <button key={t.id} type="button" className="chip" onClick={() => { setQ(t.id); setQuery(t.id); }}>
              {t.id} {t.name}<span className="n">{t.stories}</span>
            </button>
          ))}
        </div>
        {data?.status && (
          <p className="hint">
            Data built {data.builtAt ? new Date(data.builtAt).toLocaleString() : 'never'} · ATT&amp;CK: {data.status.attack} · MISP: {data.status.misp} · TTP profiles: {data.status.profiles}
          </p>
        )}
      </section>

      <section className="panel">
        <h2 className="panel-title">OSINT &amp; CTI toolbox</h2>
        <ul className="toolbox">
          {data?.toolbox.map((t) => (
            <li key={t.url}>
              <a href={t.url} target="_blank" rel="noopener noreferrer">{t.name} ↗</a>
              <span className="muted small">{t.note}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
