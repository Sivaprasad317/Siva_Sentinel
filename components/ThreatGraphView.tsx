'use client';
// Threat Graph page: weekly outlook (real trends) + 3D map of how groups, malware, CVEs, vendors and
// ATT&CK techniques are connected in the news. Click anything to see its links and the stories behind them.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GraphEvidence, GraphNode, NodeType, Outlook, ThreatGraph } from '../lib/threatGraph';
import ThreatGraph3D, { TYPE_COLOR } from './ThreatGraph3D';
import { timeAgo } from '../lib/format';

interface NodeDetail {
  node: GraphNode;
  summary: string;
  sections: { heading: string; bullets: string[] }[];
  evidence: GraphEvidence[];
}

const TYPES: { id: NodeType; label: string }[] = [
  { id: 'actor', label: 'Hacker groups' },
  { id: 'malware', label: 'Malware & tools' },
  { id: 'cve', label: 'CVEs' },
  { id: 'vendor', label: 'Vendors' },
  { id: 'technique', label: 'ATT&CK techniques' },
];
const TREND_ICON: Record<GraphNode['trend'], string> = { new: '✦', rising: '▲', steady: '•', falling: '▼' };

export default function ThreatGraphView({ focus }: { focus?: string | null }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{ graph: ThreatGraph; outlook: Outlook } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [types, setTypes] = useState<Set<NodeType>>(new Set(TYPES.map((t) => t.id)));
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [minLinks, setMinLinks] = useState(1);

  const load = useCallback(async (d: number) => {
    setErr(null);
    try {
      const r = await fetch(`/api/graph?days=${d}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setData(j);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load(days);
  }, [days, load]);

  // A voice/chat answer can ask the page to focus on a node.
  useEffect(() => {
    if (focus && focus.includes(':')) setSelected(focus);
  }, [focus]);

  useEffect(() => {
    if (!selected) return setDetail(null);
    let live = true;
    fetch(`/api/graph?days=${days}&node=${encodeURIComponent(selected)}`)
      .then((r) => r.json())
      .then((j) => live && setDetail(j.node ? j : null))
      .catch(() => live && setDetail(null));
    return () => {
      live = false;
    };
  }, [selected, days, data]);

  const view = useMemo(() => {
    if (!data) return { nodes: [] as GraphNode[], edges: [] as ThreatGraph['edges'] };
    const keep = new Set(data.graph.nodes.filter((n) => types.has(n.type) && (n.degree >= minLinks || n.id === selected)).map((n) => n.id));
    const nodes = data.graph.nodes.filter((n) => keep.has(n.id));
    const edges = data.graph.edges.filter((e) => keep.has(e.a) && keep.has(e.b));
    return { nodes, edges };
  }, [data, types, minLinks, selected]);

  const toggle = (t: NodeType) =>
    setTypes((s) => {
      const n = new Set(s);
      if (n.has(t)) {
        if (n.size > 1) n.delete(t);
      } else n.add(t);
      return n;
    });

  const searchHit = q.trim() ? data?.graph.nodes.find((n) => n.label.toLowerCase().includes(q.trim().toLowerCase())) : undefined;
  const o = data?.outlook;

  return (
    <div className="stack">
      <section className="panel glass">
        <div className="panel-head">
          <h2 className="panel-title">🔮 Threat outlook — this week vs last week</h2>
          <span className="muted small">{data ? `${data.graph.storyCount} stories · ${data.graph.nodes.length} items · built ${timeAgo(data.graph.builtAt)}` : 'Loading…'}</span>
        </div>
        {o && <p className="hint">{o.headline}</p>}
        {o && o.bullets.length > 0 && <ul className="outlook-list">{o.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
        {o && o.rising.length > 0 && (
          <div className="outlook-rising">
            {o.rising.map((r) => (
              <div key={r.type}>
                <div className="muted small" style={{ color: TYPE_COLOR[r.type] }}>Rising {TYPES.find((t) => t.id === r.type)?.label.toLowerCase()}</div>
                <div className="row wrap">
                  {r.items.map((n) => (
                    <button key={n.id} type="button" className="chip" onClick={() => setSelected(n.id)} title={`${n.last7} this week, ${n.prev7} the week before`}>
                      {TREND_ICON[n.trend]} {n.label} <b>{n.last7}</b>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {err && <div className="inline-error">{err}</div>}
      </section>

      <section className="panel glass">
        <div className="row wrap" style={{ gap: 8, marginBottom: 8 }}>
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" className={`btn small ${days === d ? 'primary' : 'ghost'}`} onClick={() => setDays(d)}>{d} days</button>
          ))}
          <span className="spacer" />
          {TYPES.map((t) => (
            <button key={t.id} type="button" className={`chip type-chip ${types.has(t.id) ? 'on' : ''}`} onClick={() => toggle(t.id)}>
              <i style={{ background: TYPE_COLOR[t.id] }} /> {t.label}
            </button>
          ))}
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <input className="search grow" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && searchHit) setSelected(searchHit.id); }} placeholder="Find: LockBit, CVE-2024-3400, Fortinet, phishing…" style={{ flex: '2 1 240px' }} />
          <label className="small muted">Hide items with fewer than
            <select value={minLinks} onChange={(e) => setMinLinks(Number(e.target.value))} style={{ marginLeft: 6 }}>
              <option value={0}>0</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
            </select> links
          </label>
          {selected && <button type="button" className="btn ghost small" onClick={() => setSelected(null)}>Clear selection</button>}
        </div>

        <div className="tgraph-layout">
          <div className="tgraph-main">
            {!data && !err && <div className="skeleton" style={{ height: 520 }} />}
            {data && view.nodes.length === 0 && <p className="muted pad">Nothing to connect yet for this period. The graph fills in as Siva reads more news (press Refresh on the dashboard).</p>}
            {data && view.nodes.length > 0 && <ThreatGraph3D nodes={view.nodes} edges={view.edges} selectedId={selected} onSelect={setSelected} highlight={q} />}
          </div>
          <aside className="tgraph-side glass">
            {!detail && (
              <div className="muted small">
                <p><b>How to read this</b></p>
                <p>Each ball is a real thing named in the news. A line means the same stories mention both — thicker lines mean more stories. A red ring means CISA confirms the CVE is exploited.</p>
                <p>Click any ball (or a rising chip above) to see what it is connected to and the stories that prove each link.</p>
                <p>A shared story is evidence of a link, not proof of an attack — always check the sources.</p>
              </div>
            )}
            {detail && (
              <div className="tnode">
                <div className="row"><span className="tag plain" style={{ borderColor: TYPE_COLOR[detail.node.type], color: TYPE_COLOR[detail.node.type] }}>{TYPES.find((t) => t.id === detail.node.type)?.label}</span>{detail.node.kev && <span className="tag hot">KEV</span>}<span className="spacer" /><span className="muted small">{TREND_ICON[detail.node.trend]} {detail.node.trend}</span></div>
                <h3>{detail.node.label}</h3>
                <p className="small">{detail.summary}</p>
                <div className="tnode-stats">
                  <div><b>{detail.node.stories}</b><span>stories</span></div>
                  <div><b>{detail.node.last7}</b><span>this week</span></div>
                  <div><b>{detail.node.prev7}</b><span>last week</span></div>
                  <div><b>{detail.node.degree}</b><span>links</span></div>
                </div>
                {detail.sections.map((s) => (
                  <div key={s.heading} className="card-sec">
                    <h3>{s.heading}</h3>
                    <ul>
                      {s.bullets.map((b, i) => {
                        const label = b.split(' — ')[0];
                        const target = data?.graph.nodes.find((n) => n.label === label);
                        return <li key={i}>{target ? <button type="button" className="link" onClick={() => setSelected(target.id)}>{label}</button> : label}{b.slice(label.length)}</li>;
                      })}
                    </ul>
                  </div>
                ))}
                {detail.evidence.length > 0 && (
                  <div className="card-sec">
                    <h3>Evidence — the stories</h3>
                    <ul className="evidence">
                      {detail.evidence.map((e) => (
                        <li key={e.url}>
                          <a href={e.url} target="_blank" rel="noopener noreferrer">{e.title} ↗</a>
                          <div className="muted small">{e.source} · {e.date.slice(0, 10)}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {detail.node.url && <a className="btn ghost small" href={detail.node.url} target="_blank" rel="noopener noreferrer">Open reference ↗</a>}
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
