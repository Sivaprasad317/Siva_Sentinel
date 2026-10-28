'use client';
// Home: the voice landing page — Siva's 3D orb, a time-of-day greeting, the date, what Siva is doing
// right now, and one big mic (+ keyboard). "Hey Siva" works hands-free; the mic is only a backup.
// The voice engine itself lives in HomeView; this page shows its state via the Siva bus.
import { useEffect, useState } from 'react';
import SivaOrb, { type OrbState } from './SivaOrb';
import { emitSiva, onSiva } from '../lib/sivaBus';
import { greetingFor, hourIn } from '../lib/avatarMotion';

interface Props {
  userTitle: string;
  tz: string;
  stats: { critical: number; kev: number; newToday: number };
  live: { on: boolean; running: boolean; label: string };
  showAlerts: boolean;
  onOpenDashboard: () => void;
}

export default function OrbHome({ userTitle, tz, stats, live, showAlerts, onOpenDashboard }: Props) {
  const [orb, setOrb] = useState<OrbState>('idle');
  const [mic, setMic] = useState<{ listening: boolean; problem: string }>({ listening: false, problem: '' });
  const [interim, setInterim] = useState('');
  const [clock, setClock] = useState('');
  const [compact, setCompact] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    const mq = window.matchMedia('(max-width: 860px)');
    const onMq = () => setCompact(mq.matches);
    onMq();
    mq.addEventListener('change', onMq);
    const tick = () => setClock(new Date().toLocaleString('en-IN', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: true }));
    tick();
    const t = setInterval(tick, 15_000);
    const off = onSiva((e) => {
      if (e.type === 'state') {
        setOrb(e.state);
        if (e.state !== 'listening') setInterim('');
      } else if (e.type === 'mic') setMic({ listening: e.listening, problem: e.problem });
      else if (e.type === 'interim') setInterim(e.text);
    });
    return () => {
      clearInterval(t);
      mq.removeEventListener('change', onMq);
      off();
    };
  }, [tz]);

  const idle = !supported
    ? 'Type your question (voice needs Chrome or Edge)'
    : mic.listening
      ? 'Listening… just say “Hey Siva”'
      : 'Starting the microphone… allow it once if Chrome asks';
  const status = { idle, listening: interim && interim !== 'Listening…' ? interim : 'Listening…', thinking: `I am checking, ${userTitle}…`, speaking: 'Speaking…' }[orb];
  const armed = orb === 'idle' && mic.listening;

  return (
    <div className="home orb-home">
      <div className="home-top">
        <button type="button" className={`home-pill ${live.running ? 'busy' : live.on ? 'on' : ''}`} onClick={onOpenDashboard} title="Open the dashboard">
          <i /> {live.running ? 'Updating intelligence…' : live.label}
        </button>
        {showAlerts && (
          <button type="button" className="home-alerts" onClick={onOpenDashboard}>
            <span className="crit">{stats.critical} critical</span>
            <span className="kev">{stats.kev} exploited</span>
            <span className="new">{stats.newToday} new today</span>
          </button>
        )}
      </div>

      <section className="stage">
        <div className={`orb-wrap ${armed ? 'armed' : orb}`}>
          <span className="ring r1" />
          <span className="ring r2" />
          <span className="ring r3" />
          <SivaOrb state={orb} size={compact ? 170 : 260} />
        </div>
        <h1 className="home-greet">{greetingFor(hourIn(tz))}, <span>{userTitle}</span></h1>
        <p className="home-date">{clock}</p>
        <p className={`home-status ${orb}`} aria-live="polite">{status}</p>
        {mic.problem && orb === 'idle' && <div className="mic-diag"><div className="bad">{mic.problem}</div></div>}
        <div className="oh-mic">
          <button
            type="button"
            className={`oh-mic-btn ${orb === 'listening' ? 'on' : ''} ${armed ? 'armed' : ''} st-${orb}`}
            onClick={() => emitSiva({ type: 'mic-click' })}
            aria-label="Talk to Siva"
            title={mic.listening ? 'Listening for “Hey Siva” — or tap to talk' : 'Tap to talk'}
          >
            🎙
          </button>
          <button type="button" className="oh-kbd" onClick={() => emitSiva({ type: 'typing' })} aria-label="Type instead" title="Type instead">⌨</button>
        </div>
      </section>
    </div>
  );
}
