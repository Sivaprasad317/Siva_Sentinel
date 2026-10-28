'use client';
// SIVA Sentinel: ONE main dashboard (cinematic, ember-lit).
// Layout: navigation · top bar (LIVE, IST clock, report, refresh) · critical ticker · greeting hero
// with the "Siva in 3D" switch + Reports · stat cards · charts (activity, severity, sources, CVEs) ·
// AI brief + 3D threat globe · filters · day-grouped feed · detail panel.
// Voice (tiny mic, bottom-left) and the 3D presenter come from HomeView, which is always mounted.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssistantAction, Briefing, Preferences, RefreshState, Story } from '../lib/types';
import { DEFAULT_PREFERENCES_CLIENT } from './defaults';
import { formatInZone, isStale, timeAgo } from '../lib/format';
import { zonedParts } from '../lib/schedule';
import { BRAND } from '../lib/brand';
import ThreatGlobe from './ThreatGlobe';
import StoryDetail from './StoryDetail';
import HistoryView from './HistoryView';
import SettingsView, { type StatusInfo } from './SettingsView';
import ScanView from './ScanView';
import IntelView from './IntelView';
import SourcesView from './SourcesView';
import FeedLogView from './FeedLogView';
import ThreatGraphView from './ThreatGraphView';
import AlertsBell from './AlertsBell';
import Background3D from './Background3D';
import Tilt from './Tilt';
import HomeView from './HomeView';
import DashboardCharts from './DashboardCharts';
import OrbHome from './OrbHome';
import { emitSiva, onSiva } from '../lib/sivaBus';
import { stripNamaste } from '../lib/voice';
import { greetingFor, hourIn } from '../lib/avatarMotion';

type View = 'home' | 'overview' | 'history' | 'settings' | 'scans' | 'intel' | 'sources' | 'feedlog' | 'graph';
type Range = '1h' | '1d' | '3d' | '7d' | 'all';
type Tab = 'all' | 'cyber' | 'general' | 'cves' | 'exploited' | 'ransomware';

interface Status extends StatusInfo {
  refresh: RefreshState;
  latestBriefingAt: string | null;
  lastError: string | null;
  liveRefreshMinutes?: number;
  nextLiveInMinutes?: number | null;
  userTitle?: string;
  alertsUnseen?: number;
  feedLog?: { total: number; kev: number; cyber: number; today: number; lastNew: number; checks: number; lastPool: number };
}

const RANGES: { id: Range; hours: number }[] = [
  { id: '1h', hours: 1 },
  { id: '1d', hours: 24 },
  { id: '3d', hours: 72 },
  { id: '7d', hours: 168 },
  { id: 'all', hours: Infinity },
];
const TABS: { id: Tab; label: string; test: (s: Story) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'cyber', label: 'Cyber', test: (s) => !s.categories.includes('general') },
  { id: 'general', label: 'General', test: (s) => s.categories.includes('general') },
  { id: 'cves', label: 'CVEs', test: (s) => s.cves.length > 0 },
  { id: 'exploited', label: 'Exploited', test: (s) => Boolean(s.kev) || s.categories.includes('exploited') },
  { id: 'ransomware', label: 'Ransomware', test: (s) => s.categories.includes('ransomware') },
];
const NAV: { section: string; items: [View, string, string][] }[] = [
  { section: 'Assistant', items: [['home', '◉', 'Siva (Home)']] },
  { section: 'Main', items: [['overview', '◈', 'Dashboard']] },
  { section: 'Intelligence', items: [['graph', '🕸️', 'Threat graph'], ['intel', '⌖', 'Threat intel & OSINT'], ['sources', '📡', 'Live sources'], ['feedlog', '📋', 'Live feed log']] },
  { section: 'Operations', items: [['scans', '⛨', 'Scans']] },
  { section: 'Archive', items: [['history', '◷', 'History & reports']] },
  { section: 'System', items: [['settings', '⚙', 'Settings']] },
];
const TITLES: Record<View, [string, string]> = {
  home: ['Siva', 'Your voice-first security assistant'],
  overview: ['Dashboard', 'Live cyber news from trusted sources, explained by AI in simple English'],
  intel: ['Threat intel & OSINT', 'Actors, ATT&CK techniques and investigation tools'],
  scans: ['Scans', 'Passive website checks and Trivy scans on targets you authorise'],
  history: ['History & reports', 'Every saved briefing, in 3D, with search, reports and delete options'],
  settings: ['Settings', 'Schedule, live mode, topics and Siva’s voice'],
  sources: ['Live sources', 'The blogs and feeds Siva reads — add, remove and enable your own'],
  graph: ['Threat graph', 'How hacker groups, malware, CVEs, vendors and techniques connect in the news — with this week’s outlook'],
  feedlog: ['Live feed log', 'Every item Siva has read from your feeds — date, day, what matters, source and link'],
};
const AVATAR_COLORS = ['#3b82f6', '#a855f7', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

export function isNewStory(s: Story, b: Briefing): boolean {
  if (!s.firstSeenAt) return false;
  return Date.parse(b.createdAt) - Date.parse(s.firstSeenAt) < 30 * 60_000;
}

function initials(name: string) {
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '?') + (words[1]?.[0] ?? words[0]?.[1] ?? '')).toUpperCase();
}
function colorFor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function LiveClock({ tz }: { tz: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <span className="clock">--:--:--</span>;
  const time = now.toLocaleTimeString('en-IN', { timeZone: tz, hour12: false });
  const zone = tz === 'Asia/Kolkata' ? 'Kolkata (IST)' : tz;
  return <span className="clock" title={zone}>🕒 {time} <span className="muted">{zone}</span></span>;
}

export default function Dashboard() {
  // Home (◉) is the voice landing page with the orb; Dashboard (◈) has all the charts and stories.
  const [view, setView] = useState<View>('home');
  // "Meet Siva" from anywhere: show the presenter, then he greets you and listens.
  useEffect(
    () =>
      onSiva((e) => {
        if (e.type === 'open') emitSiva({ type: 'greet' }); // "Talk to Siva": he greets you and listens
      }),
    [],
  );
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [range, setRange] = useState<Range>('all');
  const [source, setSource] = useState('all');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [briefExpanded, setBriefExpanded] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const wasRunning = useRef(false);
  const lastBriefingId = useRef<string | null>(null);
  const briefingCreatedAt = useRef<string | null>(null);
  const viewingLatest = useRef(true);
  const tz = prefs?.timezone ?? 'Asia/Kolkata';

  const loadBriefing = useCallback(async (id?: string) => {
    setLoading(true);
    setLoadError(null);
    viewingLatest.current = !id;
    try {
      const res = await fetch(`/api/briefing${id ? `?id=${encodeURIComponent(id)}` : ''}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      const b: Briefing | null = d.briefing;
      if (b && lastBriefingId.current && b.id !== lastBriefingId.current && !id) {
        const fresh = b.stories.filter((s) => isNewStory(s, b)).length;
        setNotice(fresh ? `✨ ${fresh} new ${fresh === 1 ? 'story' : 'stories'} since the last update.` : 'Dashboard updated. No new stories.');
      }
      lastBriefingId.current = b?.id ?? null;
      setBriefing(b);
      setSelectedId((cur) => (b?.stories.some((s) => s.id === cur) ? cur : b?.stories[0]?.id ?? null));
    } catch (err) {
      setLoadError(`Could not load the briefing: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) return;
      const s: Status = await res.json();
      setStatus(s);
      if (wasRunning.current && !s.refresh.running) {
        if (s.refresh.lastError) setNotice(`Refresh failed: ${s.refresh.lastError}`);
        else void loadBriefing();
      }
      // A live/scheduled refresh finished in the background: pick up the new briefing.
      if (viewingLatest.current && !s.refresh.running && s.latestBriefingAt && briefingCreatedAt.current && s.latestBriefingAt !== briefingCreatedAt.current) void loadBriefing();
      wasRunning.current = s.refresh.running;
    } catch {
      /* status is best-effort */
    }
  }, [loadBriefing]);

  useEffect(() => {
    briefingCreatedAt.current = briefing && !briefing.isSample ? briefing.createdAt : briefingCreatedAt.current;
  }, [briefing]);

  useEffect(() => {
    void loadBriefing();
    void loadStatus();
    fetch('/api/preferences')
      .then((r) => r.json())
      .then((d) => setPrefs({ ...DEFAULT_PREFERENCES_CLIENT, ...d.preferences }))
      .catch(() => setPrefs(DEFAULT_PREFERENCES_CLIENT));
  }, [loadBriefing, loadStatus]);

  const running = Boolean(status?.refresh.running);
  useEffect(() => {
    const t = setInterval(loadStatus, running ? 3000 : 20000);
    return () => clearInterval(t);
  }, [running, loadStatus]);

  const refresh = async () => {
    setNotice(null);
    const res = await fetch('/api/briefing/refresh', { method: 'POST' });
    const d = await res.json().catch(() => ({}));
    if (res.status === 202 || res.status === 409) {
      wasRunning.current = true;
      if (res.status === 409) setNotice('A refresh is already running.');
      void loadStatus();
    } else setNotice(d.error ?? `Refresh could not start (HTTP ${res.status}).`);
  };

  const loadSample = async () => {
    viewingLatest.current = false;
    const d = await fetch('/api/briefing?sample=1').then((r) => r.json());
    setBriefing(d.briefing);
    setSelectedId(d.briefing.stories[0].id);
    setView('overview');
  };

  const stories = useMemo(() => briefing?.stories ?? [], [briefing]);
  const sources = useMemo(() => [...new Set(stories.map((s) => s.source))].sort(), [stories]);
  const filtered = useMemo(() => {
    const hours = RANGES.find((r) => r.id === range)!.hours;
    const t = TABS.find((x) => x.id === tab)!;
    const q = query.trim().toLowerCase();
    return stories.filter((s) => {
      if (!t.test(s)) return false;
      if (source !== 'all' && s.source !== source) return false;
      if (hours !== Infinity && (!s.publishedAt || Date.now() - Date.parse(s.publishedAt) > hours * 3_600_000)) return false;
      if (q && !`${s.title} ${s.summary} ${s.source} ${s.cves.join(' ')} ${s.intel?.actors.map((a) => a.name).join(' ') ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [stories, tab, range, source, query]);

  // Group the feed by calendar day in the user's timezone.
  const groups = useMemo(() => {
    const today = zonedParts(new Date(), tz).dateKey;
    const yesterday = zonedParts(new Date(Date.now() - 86_400_000), tz).dateKey;
    const map = new Map<string, Story[]>();
    for (const s of filtered) {
      const key = s.publishedAt ? zonedParts(new Date(s.publishedAt), tz).dateKey : 'unknown';
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] === 'unknown' ? 1 : b[0] === 'unknown' ? -1 : b[0].localeCompare(a[0])))
      .map(([key, list]) => ({ key, label: key === today ? 'Today' : key === yesterday ? 'Yesterday' : key === 'unknown' ? 'Date not provided' : formatInZone(`${key}T12:00:00Z`, tz, false), list }));
  }, [filtered, tz]);

  const selected = stories.find((s) => s.id === selectedId) ?? null;
  const [graphFocus, setGraphFocus] = useState<string | null>(null);
  const showStory = useCallback((id: string) => {
    setView('overview');
    setTab('all');
    setRange('all');
    setSource('all');
    setQuery('');
    setSelectedId(id);
    setTimeout(() => document.getElementById(`row-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  }, [setView]);

  const onAssistantAction = useCallback(
    (a: AssistantAction) => {
      if (a.type === 'navigate') {
        if (a.view === 'graph') setGraphFocus(a.focus ?? null);
        setView(a.view);
      }
      else if (a.type === 'show-story') showStory(a.storyId);
      else if (a.type === 'download') window.location.href = a.url;
      else if (a.type === 'refresh-started') {
        wasRunning.current = true;
        void loadStatus();
      }
    },
    [showStory, loadStatus, setView],
  );

  const copyUrls = async () => {
    if (!briefing) return;
    const urls = [...new Set(briefing.stories.flatMap((s) => s.sources.map((r) => r.url)))].join('\n');
    try {
      await navigator.clipboard.writeText(urls);
      setNotice('Source URLs copied. In NotebookLM choose Add source → Website and paste them.');
    } catch {
      setNotice('Copy failed. Use “Export for NotebookLM” instead.');
    }
    setReportOpen(false);
  };

  const todayKey = zonedParts(new Date(), tz).dateKey;
  const stats = {
    // Cards count EVERYTHING Siva has read (the live feed log), so they move as feeds are checked.
    total: status?.feedLog?.total || stories.length,
    cyber: status?.feedLog?.total ? status.feedLog.cyber : stories.filter((s) => !s.categories.includes('general')).length,
    kev: status?.feedLog?.total ? status.feedLog.kev : stories.filter((s) => s.kev).length,
    critical: stories.filter((s) => s.priority === 'critical').length,
    newToday: status?.feedLog?.today ?? stories.filter((s) => (s.firstSeenAt ?? s.retrievedAt) && zonedParts(new Date(s.firstSeenAt ?? s.retrievedAt), tz).dateKey === todayKey).length,
    sources: new Set(stories.flatMap((s) => s.sources.map((r) => r.name))).size,
    sourcesOk: briefing ? briefing.sourceStatus.filter((s) => s.ok && s.kind !== 'gemini').length : 0,
    sourcesAll: briefing ? briefing.sourceStatus.filter((s) => s.kind !== 'gemini').length : 0,
  };
  const risk = stats.kev && stats.critical ? 'critical' : stats.critical ? 'high' : stats.kev ? 'elevated' : 'moderate';
  const topStory = stories[0];
  const chips = useMemo(() => {
    const out: string[] = [];
    const actors = new Map<string, number>();
    for (const s of stories) for (const a of s.intel?.actors ?? []) actors.set(a.name, (actors.get(a.name) ?? 0) + 1);
    [...actors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([n]) => out.push(n));
    stories.filter((s) => s.kev).slice(0, 3).forEach((s) => out.push(`${s.kev!.vendorProject} ${s.kev!.product}`));
    if (stories.some((s) => s.categories.includes('ransomware'))) out.push('Ransomware activity');
    if (stories.some((s) => s.categories.includes('cloud'))) out.push('Cloud security');
    return [...new Set(out)].slice(0, 7);
  }, [stories]);
  const ticker = stories.filter((s) => s.priority === 'critical' || s.priority === 'high').slice(0, 12);
  const stale = briefing && !briefing.isSample && isStale(briefing.createdAt);
  const reportId = briefing ? (briefing.isSample ? 'sample' : briefing.id) : null;
  const liveOn = (status?.liveRefreshMinutes ?? prefs?.liveRefreshMinutes ?? 0) > 0;

  return (
    <div className={`app ${view === 'home' ? 'is-home' : ''}`}>
      <Background3D intensity={running ? 1 : stats.total ? Math.min(1, stats.critical / 10) : 0} />

      <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
        <div className="brand" role="button" tabIndex={0} title="Siva home" style={{ cursor: 'pointer' }} onClick={() => setView('home')} onKeyDown={(e) => { if (e.key === 'Enter') setView('home'); }}>
          <span className="brand-mark" aria-hidden>◉</span>
          <div>
            <div className="brand-name">{BRAND.name.toUpperCase()}</div>
            <div className="brand-sub">{BRAND.tagline}</div>
          </div>
        </div>
        <nav>
          {NAV.map((group) => (
            <div key={group.section} className="nav-group">
              <div className="nav-section">{group.section}</div>
              {group.items.map(([id, icon, label]) => (
                <button key={id} type="button" title={label} className={`nav ${view === id ? 'active' : ''}`} onClick={() => { setView(id); setNavOpen(false); }}>
                  <span className="nav-icon" aria-hidden>{icon}</span>
                  {label}
                  {id === 'overview' && stats.critical > 0 && <span className="nav-badge">{stats.critical}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-status">
          <div><span className={`dot ${status?.aiConfigured ? 'ok' : 'warn'}`} /> Gemini {status?.aiConfigured ? 'connected' : 'not configured'}</div>
          <div><span className={`dot ${liveOn ? 'ok pulse' : 'warn'}`} /> Live mode {liveOn ? `every ${status?.liveRefreshMinutes ?? prefs?.liveRefreshMinutes} min` : 'off'}</div>
          <div className="muted small">Daily briefing: {status?.schedulerDisabled ? 'scheduler off' : status?.nextScheduledRun ?? '…'}</div>
          <div className="muted small">Read-only assistant. It never changes your systems.</div>
        </div>
      </aside>

      <div className="main">
        {/* Always mounted so "Hey Siva" keeps listening on every screen. It draws the tiny mic, the
            Reports drawer and (when switched on) Siva in 3D; its switch appears in the hero below. */}
        <HomeView
          active={view === 'overview'}
          briefing={briefing}
          prefs={prefs ?? DEFAULT_PREFERENCES_CLIENT}
          userTitle={status?.userTitle ?? 'boss'}
          onAction={onAssistantAction}
          onShowStory={showStory}
        />
        {view === 'home' && (
          <OrbHome
            userTitle={status?.userTitle ?? 'boss'}
            tz={tz}
            stats={{ critical: stats.critical, kev: stats.kev, newToday: stats.newToday }}
            live={{ on: liveOn, running, label: liveOn ? `LIVE · updated ${briefing ? timeAgo(briefing.createdAt) : 'never'}` : 'Live mode off' }}
            showAlerts={Boolean(briefing && !briefing.isSample)}
            onOpenDashboard={() => setView('overview')}
          />
        )}
        {view !== 'home' && (
          <>
        <header className="topbar glass">
          <button type="button" className="btn ghost menu" onClick={() => setNavOpen((o) => !o)} aria-label="Menu">☰</button>
          <span className="ver">{BRAND.short} v{BRAND.version}</span>
          <span className={`live-pill ${running ? 'busy' : liveOn ? 'on' : 'off'}`} title="Live status">
            <i /> {running ? 'UPDATING' : liveOn ? 'LIVE' : 'PAUSED'}
          </span>
          <span className="muted small topbar-meta">
            {briefing ? <>Updated {timeAgo(briefing.createdAt)}{liveOn && status?.nextLiveInMinutes != null && !running ? ` · next in ${status.nextLiveInMinutes} min` : ''}{status?.feedLog && status.feedLog.checks > 0 ? ` · checked ${status.feedLog.checks}× · +${status.feedLog.lastNew} new` : ''}</> : loading ? 'Loading…' : 'No briefing yet'}
          </span>
          <input className="search grow" type="search" value={query} onChange={(e) => { setQuery(e.target.value); setView('overview'); }} placeholder="Search threats, CVEs, actors, vendors…" aria-label="Search stories" />
          <AlertsBell onOpenStory={showStory} />
          <LiveClock tz={tz} />
          {reportId && (
            <div className="menu-wrap">
              <button type="button" className="btn small" onClick={() => setReportOpen((o) => !o)} aria-expanded={reportOpen}>⬇ Report</button>
              {reportOpen && (
                <div className="dropdown glass" role="menu">
                  <a role="menuitem" href={`/api/report?id=${encodeURIComponent(reportId)}`} onClick={() => setReportOpen(false)}>Download full report (HTML)</a>
                  <a role="menuitem" href={`/api/report?id=${encodeURIComponent(reportId)}&print=1`} target="_blank" rel="noopener" onClick={() => setReportOpen(false)}>Save as PDF (print)</a>
                  {!briefing?.isSample && <a role="menuitem" href={`/api/export/notebooklm?id=${encodeURIComponent(reportId)}`} onClick={() => setReportOpen(false)}>Export for NotebookLM (.md)</a>}
                  {!briefing?.isSample && <button type="button" role="menuitem" onClick={copyUrls}>Copy all source URLs</button>}
                </div>
              )}
            </div>
          )}
          <button type="button" className="btn primary" onClick={refresh} disabled={running}>{running ? 'Refreshing…' : '↻ Refresh'}</button>
        </header>

        {ticker.length > 0 && (
          <div className="ticker glass" aria-label="Critical headlines">
            <span className="ticker-label">● CRITICAL FEED</span>
            <div className="ticker-track">
              <div className="ticker-move">
                {[...ticker, ...ticker].map((s, i) => (
                  <button key={`${s.id}-${i}`} type="button" className="ticker-item" onClick={() => showStory(s.id)}>
                    <span className={`tag p-${s.priority}`}>{s.kev ? 'KEV' : s.priority}</span> {s.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === 'overview' ? (
          <section className="hero-k">
            <div className="hero-text">
              <span className="eyebrow">SIVA Sentinel · {new Date().toLocaleDateString('en-IN', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' })}</span>
              <h1>{greetingFor(hourIn(tz))}, <em>{status?.userTitle ?? 'boss'}</em>.</h1>
              <p>{briefing ? `${stats.critical} critical, ${stats.kev} exploited and ${stats.newToday} new today. Just say “Hey Siva” and ask.` : 'Just say “Hey Siva” and ask — or press Refresh to read the latest news.'}</p>
            </div>
            <div id="siva-controls" className="hero-controls" />
          </section>
        ) : (
        <div className="page-head">
          <div className="page-icon" aria-hidden>{view === 'intel' ? '⌖' : view === 'sources' ? '📡' : view === 'feedlog' ? '📋' : view === 'graph' ? '🕸️' : view === 'scans' ? '⛨' : view === 'history' ? '◷' : '⚙'}</div>
          <div>
            <h1>{TITLES[view][0]}</h1>
            <p className="muted small">{TITLES[view][1]}</p>
          </div>
        </div>
        )}

        {running && (
          <div className="banner info" role="status">
            <span className="spinner" aria-hidden /> Collecting live intelligence: {status?.refresh.progress || 'working'}… (1–3 minutes)
          </div>
        )}
        {notice && <div className={`banner ${/fail|could not/i.test(notice) ? 'warn' : 'ok'}`} role="status">{notice} <button type="button" className="link" onClick={() => setNotice(null)}>Dismiss</button></div>}
        {loadError && <div className="banner error" role="alert">{loadError} <button type="button" className="link" onClick={() => loadBriefing()}>Retry</button></div>}
        {briefing?.isSample && <div className="banner sample">SAMPLE DATA: everything shown is fictional. Press “Refresh” for live intelligence.</div>}
        {stale && <div className="banner warn">This briefing is more than 24 hours old ({timeAgo(briefing!.createdAt)}). Refresh for current data.</div>}
        {briefing && briefing.aiStatus !== 'ok' && !briefing.isSample && (
          <div className="banner warn">AI summaries {briefing.aiStatus === 'disabled' ? 'are off (no GEMINI_API_KEY)' : `failed: ${briefing.aiError ?? 'unknown error'}`}. Summaries come directly from source text.</div>
        )}

          </>
        )}

        {view === 'history' && (
          <HistoryView
            timezone={tz}
            currentId={briefing?.id}
            onOpen={(id, storyId) => { setView('overview'); void loadBriefing(id).then(() => storyId && setSelectedId(storyId)); }}
            onDeleted={(ids) => { if (ids === 'all' || (briefing && ids.includes(briefing.id))) void loadBriefing(); }}
          />
        )}
        {view === 'settings' && <SettingsView prefs={prefs} status={status} onSaved={setPrefs} />}
        {view === 'scans' && <ScanView timezone={tz} />}
        {view === 'intel' && <IntelView onShowStory={showStory} />}
        {view === 'sources' && <SourcesView />}
        {view === 'feedlog' && <FeedLogView />}
        {view === 'graph' && <ThreatGraphView focus={graphFocus} />}

        {view === 'overview' && (
          <>
            {loading && !briefing && (
              <div className="stack">
                <div className="skeleton" style={{ height: 110 }} />
                <div className="skeleton" style={{ height: 300 }} />
                <div className="skeleton" style={{ height: 300 }} />
              </div>
            )}

            {!loading && !briefing && !loadError && (
              <section className="panel glass empty">
                <h2>No briefing yet</h2>
                <p className="muted">Press <b>Refresh</b>, or open Siva and say “What’s the update today?”. The first refresh takes a few minutes.</p>
                <div className="row">
                  <button type="button" className="btn primary" onClick={refresh} disabled={running}>↻ Refresh now</button>
                  <button type="button" className="btn ghost" onClick={loadSample}>Preview with sample data</button>
                </div>
              </section>
            )}

            {briefing && (
              <>
                <section className="stats">
                  <Tilt className="stat blue"><div className="stat-icon">▤</div><div><div className="stat-label">Total stories</div><div className="stat-value">{stats.total}</div>{status?.feedLog && status.feedLog.total > 0 && <div className="stat-sub live">+{status.feedLog.lastNew} at last check · {stories.length} in briefing</div>}</div></Tilt>
                  <Tilt className="stat red"><div className="stat-icon">⚠</div><div><div className="stat-label">Exploited (CISA KEV)</div><div className="stat-value">{stats.kev}</div></div></Tilt>
                  <Tilt className="stat purple"><div className="stat-icon">⛨</div><div><div className="stat-label">Cyber news</div><div className="stat-value">{stats.cyber}</div></div></Tilt>
                  <Tilt className="stat green"><div className="stat-icon">✦</div><div><div className="stat-label">New today</div><div className="stat-value">{stats.newToday}</div>{status?.feedLog && <div className="stat-sub live">checked {status.feedLog.checks}×</div>}</div></Tilt>
                  <Tilt className="stat amber"><div className="stat-icon">◎</div><div><div className="stat-label">Sources</div><div className="stat-value">{stats.sources}</div><div className="stat-sub">{stats.sourcesOk}/{stats.sourcesAll} feeds OK</div></div></Tilt>
                </section>

                <DashboardCharts tz={tz} version={`${status?.feedLog?.total ?? 0}-${briefing.id}`} onPickCve={(c) => setQuery(c)} />

                <section className="brief-row">
                  <Tilt className="panel glass brief" max={3}>
                    <div className="panel-head">
                      <span className="eyebrow">AI Intelligence Brief · {briefing.aiStatus === 'ok' && !briefing.isSample ? 'Gemini' : 'source text'}</span>
                      <span className={`risk risk-${risk}`}>{risk} risk</span>
                    </div>
                    {topStory && (
                      <h2 className="brief-headline">
                        <button type="button" className="link plain" onClick={() => showStory(topStory.id)}>{topStory.title}</button>
                      </h2>
                    )}
                    <p className="exec-text">{stripNamaste(briefing.executiveSummary)}</p>
                    {chips.length > 0 && <div className="chips">{chips.map((c) => <button key={c} type="button" className="chip small" onClick={() => setQuery(c.split(' ')[0])}>{c}</button>)}</div>}
                    <div className="row brief-foot">
                      <span className="muted small">Generated from {stories.length} news items · {formatInZone(briefing.createdAt, tz)}</span>
                      <span className="spacer" />
                      {briefing.recommendations.length > 0 && (
                        <button type="button" className="btn ghost small" onClick={() => setBriefExpanded((e) => !e)} aria-expanded={briefExpanded}>
                          {briefExpanded ? 'Hide actions' : `Actions (${briefing.recommendations.length})`}
                        </button>
                      )}
                    </div>
                    {briefExpanded && <ol className="recs">{briefing.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ol>}
                  </Tilt>
                  <div className="panel glass globe-panel">
                    <div className="panel-head">
                      <span className="eyebrow">3D threat globe</span>
                      <span className="muted small">drag · zoom · click</span>
                    </div>
                    <ThreatGlobe stories={filtered} selectedId={selectedId} onSelect={showStory} />
                  </div>
                </section>

                <div className="filters glass" role="group" aria-label="Filters">
                  <div className="chips">
                    {RANGES.map((r) => (
                      <button key={r.id} type="button" className="chip" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.id === 'all' ? 'All' : r.id}</button>
                    ))}
                  </div>
                  <div className="chips tabs">
                    {TABS.map((t) => (
                      <button key={t.id} type="button" className="chip" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
                        {t.label}<span className="n">{stories.filter(t.test).length}</span>
                      </button>
                    ))}
                  </div>
                  <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source">
                    <option value="all">All sources</option>
                    {sources.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {(tab !== 'all' || range !== 'all' || source !== 'all' || query) && (
                    <button type="button" className="link" onClick={() => { setTab('all'); setRange('all'); setSource('all'); setQuery(''); }}>✕ Clear</button>
                  )}
                  <span className="muted small">{filtered.length} stories</span>
                </div>

                <section className="feed-split">
                  <div className="feed" aria-label="Stories">
                    {filtered.length === 0 && <p className="muted pad">No stories match these filters.</p>}
                    {groups.map((g) => (
                      <div key={g.key} className="day">
                        <div className="day-head"><span>{g.label.toUpperCase()}</span><span className="n">{g.list.length}</span></div>
                        {g.list.map((s) => {
                          const fresh = isNewStory(s, briefing);
                          return (
                            <button key={s.id} id={`row-${s.id}`} type="button" className={`feed-item glass ${s.id === selectedId ? 'sel' : ''} p-${s.priority}`} onClick={() => setSelectedId(s.id)}>
                              <span className="avatar" style={{ background: colorFor(s.source) }} aria-hidden>{initials(s.source)}</span>
                              <span className="fi-main">
                                <span className="fi-meta">
                                  <span className="fi-source">{s.source}{s.sources.length > 1 ? ` +${s.sources.length - 1}` : ''}</span>
                                  <span className={`tag p-${s.priority}`}>{s.priority}</span>
                                  {s.kev && <span className="tag hot">KEV</span>}
                                  {s.origin === 'leak-site' && <span className="tag warn">claim</span>}
                                  {fresh && <span className="tag new">new</span>}
                                  {s.aiGenerated && <span className="tag ai">AI</span>}
                                  <span className="spacer" />
                                  <span className="muted small">{s.publishedAt ? timeAgo(s.publishedAt) : 'time n/a'}</span>
                                </span>
                                <span className="fi-title">{s.title}</span>
                                <span className="fi-sum">{s.summary}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <StoryDetail story={selected} timezone={tz} />
                </section>

                <details className="panel glass">
                  <summary className="panel-title">Source status ({stats.sourcesOk}/{stats.sourcesAll} OK)</summary>
                  <table className="table">
                    <thead><tr><th>Source</th><th>Type</th><th>Status</th><th>Items</th></tr></thead>
                    <tbody>
                      {briefing.sourceStatus.map((s, i) => (
                        <tr key={`${s.kind}-${s.name}-${i}`}>
                          <td>{s.name}</td>
                          <td>{s.kind}</td>
                          <td>{s.ok ? <span className="ok-text">OK</span> : <span className="warn-text" title={s.error}>Failed: {s.error}</span>}</td>
                          <td>{s.items}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </>
            )}
          </>
        )}
      </div>

    </div>
  );
}
