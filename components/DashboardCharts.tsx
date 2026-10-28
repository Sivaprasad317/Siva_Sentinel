'use client';
// Main-dashboard charts, drawn from everything Siva has read (the live feed log):
//   1. Activity — stories per day for 14 days, stacked by severity (hover a day for the numbers)
//   2. Severity mix — this week's critical / high / medium / low split
//   3. Top sources — who reported the most this week
//   4. Most-mentioned CVEs this week
// Plain SVG, no chart library. Severity is ordinal: dim navy (low) to bright pink (critical), matching the
// app's blue-violet-pink palette; every colour also has a text label.
import { useEffect, useMemo, useState } from 'react';
import type { FeedLogEntry, Priority } from '../lib/types';
import { dashboardStats, niceScale, SEVERITIES, weekChange, type DayBucket } from '../lib/dashboardStats';

const SEV_COLOR: Record<Priority, string> = { critical: '#f472b6', high: '#a78bfa', medium: '#6d83f2', low: '#3b4f86' };
const SEV_LABEL: Record<Priority, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

interface Props {
  tz: string;
  /** Changes when Siva has read more (re-fetches the log). */
  version: number | string;
  onPickCve?: (cve: string) => void;
}

export default function DashboardCharts({ tz, version, onPickCve }: Props) {
  const [log, setLog] = useState<FeedLogEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/feed-log', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { items: FeedLogEntry[] }) => live && setLog(d.items ?? []))
      .catch((e: Error) => live && setErr(e.message));
    return () => {
      live = false;
    };
  }, [version]);

  const st = useMemo(() => (log ? dashboardStats(log, new Date(), tz) : null), [log, tz]);
  if (err && !log) return <div className="banner warn">Charts could not load the feed log: {err}</div>;
  if (!st) return <section className="charts"><div className="skeleton" style={{ height: 260 }} /><div className="skeleton" style={{ height: 260 }} /></section>;

  const change = weekChange(st.weekTotal, st.prevWeekTotal);
  return (
    <section className="charts" aria-label="Threat activity charts">
      <div className="panel glass chart-card wide">
        <div className="chart-head">
          <div>
            <span className="eyebrow">Activity · last 14 days</span>
            <h3 className="chart-title">{st.weekTotal} stories this week{change !== null && <span className={`delta ${change >= 0 ? 'up' : 'down'}`}>{change >= 0 ? '▲' : '▼'} {Math.abs(change)}% vs last week</span>}</h3>
          </div>
          <Legend />
        </div>
        <ActivityChart days={st.days} />
      </div>

      <div className="panel glass chart-card">
        <span className="eyebrow">Severity mix · 7 days</span>
        <h3 className="chart-title">{st.severity.critical} critical · {st.kevWeek} exploited</h3>
        <SeverityMeter sev={st.severity} total={st.severityTotal} />
      </div>

      <div className="panel glass chart-card">
        <span className="eyebrow">Top sources · 7 days</span>
        <h3 className="chart-title">Who is reporting</h3>
        <Bars rows={st.topSources.map((s) => ({ label: s.name, value: s.count }))} empty="No stories this week yet." />
      </div>

      <div className="panel glass chart-card">
        <span className="eyebrow">Most-mentioned CVEs · 7 days</span>
        <h3 className="chart-title">Weaknesses in the news</h3>
        <Bars rows={st.topCves.map((c) => ({ label: c.id, value: c.count, onClick: onPickCve ? () => onPickCve(c.id) : undefined }))} empty="No CVE IDs mentioned this week." mono />
      </div>
    </section>
  );
}

function Legend() {
  return (
    <div className="chart-legend" aria-hidden>
      {SEVERITIES.map((s) => (
        <span key={s}><i style={{ background: SEV_COLOR[s] }} />{SEV_LABEL[s]}</span>
      ))}
    </div>
  );
}

function ActivityChart({ days }: { days: DayBucket[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1100;
  const H = 250;
  const pad = { l: 34, r: 8, t: 10, b: 26 };
  const max = Math.max(1, ...days.map((d) => d.total));
  const { max: top, ticks } = niceScale(max);
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const slot = iw / days.length;
  const bw = Math.max(6, Math.min(30, slot * 0.62));
  const y = (v: number) => pad.t + ih - (v / top) * ih;
  const h = hover !== null ? days[hover] : null;
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label="Stories per day by severity">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 6} y={y(t) + 4} className="axis" textAnchor="end">{t}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = pad.l + i * slot + (slot - bw) / 2;
          let acc = 0;
          const segs = SEVERITIES.filter((s) => d.counts[s] > 0);
          return (
            <g key={d.key} className={hover === i ? 'hov' : ''}>
              {segs.map((s, j) => {
                const v = d.counts[s];
                const y1 = y(acc + v);
                const hh = Math.max(1, y(acc) - y1 - (j < segs.length - 1 ? 2 : 0)); // 2px gap between segments
                acc += v;
                const isTop = j === segs.length - 1;
                return isTop ? (
                  <path key={s} d={roundTop(x, y1, bw, hh, Math.min(4, hh))} fill={SEV_COLOR[s]} />
                ) : (
                  <rect key={s} x={x} y={y1} width={bw} height={hh} fill={SEV_COLOR[s]} />
                );
              })}
              {(i % 2 === days.length % 2 || days.length <= 8) && (
                <text x={x + bw / 2} y={H - 8} className="axis" textAnchor="middle">{d.label}</text>
              )}
              <rect x={pad.l + i * slot} y={pad.t} width={slot} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${d.weekday} ${d.label}: ${d.total} stories`} />
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className="baseline" />
      </svg>
      {h && (
        <div className="chart-tip" style={{ left: `${((pad.l + (hover! + 0.5) * slot) / W) * 100}%` }}>
          <b>{h.weekday} {h.label}</b>
          <span>{h.total} stories{h.kev ? ` · ${h.kev} exploited` : ''}</span>
          {SEVERITIES.map((s) => (
            <span key={s} className="tip-row"><i style={{ background: SEV_COLOR[s] }} />{SEV_LABEL[s]} <em>{h.counts[s]}</em></span>
          ))}
        </div>
      )}
    </div>
  );
}

function roundTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

function SeverityMeter({ sev, total }: { sev: Record<Priority, number>; total: number }) {
  if (!total) return <p className="muted small">No stories in the last 7 days yet.</p>;
  return (
    <div>
      <div className="sev-meter" role="img" aria-label={SEVERITIES.map((s) => `${SEV_LABEL[s]} ${sev[s]}`).join(', ')}>
        {SEVERITIES.filter((s) => sev[s] > 0).map((s) => (
          <span key={s} style={{ flexGrow: sev[s], background: SEV_COLOR[s] }} title={`${SEV_LABEL[s]}: ${sev[s]}`} />
        ))}
      </div>
      <ul className="sev-list">
        {SEVERITIES.map((s) => (
          <li key={s}>
            <i style={{ background: SEV_COLOR[s] }} />
            <span>{SEV_LABEL[s]}</span>
            <b>{sev[s]}</b>
            <em>{Math.round((sev[s] / total) * 100)}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bars({ rows, empty, mono }: { rows: { label: string; value: number; onClick?: () => void }[]; empty: string; mono?: boolean }) {
  if (!rows.length) return <p className="muted small">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${r.value}`}>
          {r.onClick ? (
            <button type="button" className={`hb-label link ${mono ? 'mono' : ''}`} onClick={r.onClick}>{r.label}</button>
          ) : (
            <span className={`hb-label ${mono ? 'mono' : ''}`}>{r.label}</span>
          )}
          <span className="hb-track"><span className="hb-fill" style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }} /></span>
          <b className="hb-val">{r.value}</b>
        </li>
      ))}
    </ul>
  );
}
