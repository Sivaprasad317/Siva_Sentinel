'use client';
// Siva, the Jarvis-style assistant panel.
//  - Push to talk: press the mic, speak, and Siva answers out loud.
//  - Hands-free: say "Hey Siva …" or "Jarvis …" at any time (Chrome/Edge). The mic stays on
//    while this mode is enabled, and it pauses while Siva is speaking so it does not hear itself.
//  - Typed questions always work.
// Commands go to /api/assistant, which returns speech, evidence links and UI actions.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistantAction, AssistantReply, Briefing, ChatMessage, Preferences, ScanKind } from '../lib/types';
import { createRecognition, canSpeak, speak, stopSpeaking, type RecognitionLike } from '../lib/voice';
import { detectWake } from '../lib/assistantRouter';
import SivaOrb, { type OrbState } from './SivaOrb';

interface Props {
  briefing: Briefing | null;
  prefs: Pick<Preferences, 'voiceRate' | 'voiceLang' | 'voiceName' | 'voicePitch' | 'voiceGender'>;
  onShowStory: (id: string) => void;
  onAction: (action: AssistantAction) => void;
  userTitle?: string;
}

const MIC_ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone permission was denied. Allow the microphone for this site in your browser settings.',
  'service-not-allowed': 'Speech recognition is blocked in this browser.',
  'audio-capture': 'No microphone was found.',
  network: 'Speech recognition needs an internet connection in this browser.',
};

interface PendingScan {
  kind: ScanKind;
  target: string;
}

export default function AskSiva({ briefing, prefs, onShowStory, onAction, userTitle = 'boss' }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [orb, setOrb] = useState<OrbState>('idle');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [voiceReplies, setVoiceReplies] = useState(true);
  const [handsFree, setHandsFree] = useState(false);
  const [rate, setRate] = useState(prefs.voiceRate);
  const [support, setSupport] = useState({ recognition: false, synthesis: false });
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null);
  const [authorised, setAuthorised] = useState(false);
  const pttRef = useRef<RecognitionLike | null>(null);
  const wakeRef = useRef<RecognitionLike | null>(null);
  const handsFreeRef = useRef(false);
  const speakingRef = useRef(false);
  const awaitingUntil = useRef(0);
  const awaitingBriefing = useRef<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const busy = orb === 'thinking';

  useEffect(() => setRate(prefs.voiceRate), [prefs.voiceRate]);

  useEffect(() => {
    setSupport({ recognition: Boolean(createRecognition('en-IN')), synthesis: canSpeak() });
    fetch('/api/chat')
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => setMessages(d.messages ?? []))
      .catch(() => undefined);
    return () => {
      handsFreeRef.current = false;
      pttRef.current?.abort();
      wakeRef.current?.abort();
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, interim, pendingScan]);

  // ---------- Hands-free wake word ----------
  const startWakeLoop = useCallback(() => {
    if (!handsFreeRef.current || speakingRef.current) return;
    const rec = createRecognition(prefs.voiceLang);
    if (!rec) return;
    rec.continuous = true;
    rec.interimResults = false;
    wakeRef.current = rec;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        const heard: string = e.results[i][0].transcript;
        const { woke, command } = detectWake(heard);
        if (woke && command) void handleRef.current(command);
        else if (woke) {
          awaitingUntil.current = Date.now() + 12000;
          setInterim(`Yes ${userTitle}, I am listening…`);
          sayRef.current(`Yes ${userTitle}.`);
        } else if (Date.now() < awaitingUntil.current) {
          awaitingUntil.current = 0;
          setInterim('');
          void handleRef.current(heard);
        }
      }
    };
    rec.onerror = (e) => {
      if (MIC_ERRORS[e.error]) {
        setError(MIC_ERRORS[e.error]);
        handsFreeRef.current = false;
        setHandsFree(false);
      }
    };
    rec.onend = () => {
      // Chrome stops continuous recognition after a while; restart while hands-free is on.
      if (handsFreeRef.current && !speakingRef.current) setTimeout(startWakeLoop, 400);
    };
    try {
      rec.start();
    } catch {
      /* already started */
    }
  }, [prefs.voiceLang]);

  const toggleHandsFree = () => {
    const next = !handsFree;
    setHandsFree(next);
    handsFreeRef.current = next;
    setError(null);
    if (next) {
      if (!support.recognition) {
        setError('Hands-free mode needs Chrome or Edge.');
        setHandsFree(false);
        handsFreeRef.current = false;
        return;
      }
      startWakeLoop();
    } else {
      wakeRef.current?.abort();
      setInterim('');
    }
  };

  // ---------- Speaking ----------
  const say = useCallback(
    (text: string) => {
      if (!voiceReplies || !canSpeak()) {
        setOrb('idle');
        return;
      }
      speakingRef.current = true;
      wakeRef.current?.abort(); // do not listen to ourselves
      speak(text, {
        rate,
        lang: prefs.voiceLang,
        pitch: prefs.voicePitch,
        voiceName: prefs.voiceName,
        gender: prefs.voiceGender ?? 'male',
        onStart: () => setOrb('speaking'),
        onEnd: () => {
          speakingRef.current = false;
          setOrb('idle');
          if (handsFreeRef.current) setTimeout(startWakeLoop, 300);
        },
      });
    },
    [voiceReplies, rate, prefs.voiceLang, prefs.voicePitch, prefs.voiceName, prefs.voiceGender, startWakeLoop],
  );

  const sayRef = useRef(say);
  useEffect(() => {
    sayRef.current = say;
  }, [say]);

  const stopAll = () => {
    stopSpeaking();
    speakingRef.current = false;
    setOrb('idle');
    if (handsFreeRef.current) setTimeout(startWakeLoop, 300);
  };

  const local = (role: ChatMessage['role'], text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    text,
    createdAt: new Date().toISOString(),
    ...extra,
  });

  // ---------- Handling a request ----------
  const handle = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      setError(null);
      setInterim('');
      setMessages((m) => [...m, local('user', text)]);
      if (briefing?.isSample) {
        const r = 'You are viewing sample data. Run a live refresh first so I can answer from real sources.';
        setMessages((m) => [...m, local('assistant', r)]);
        say(r);
        return;
      }
      setOrb('thinking');
      if (!/^(stop|cancel|open|show|go to|scan|export|speak|talk)\b/i.test(text.replace(/^(hey |ok |hi )?(siva|jarvis)[,\s]*/i, ''))) setInterim(`I am checking, ${userTitle}…`);
      try {
        const res = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: text, briefingId: briefing?.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        const reply = data.reply as AssistantReply;
        setInterim('');
        setMessages((m) => [...m, data.message as ChatMessage]);
        for (const a of reply.actions) {
          if (a.type === 'stop') stopAll();
          else if (a.type === 'confirm-scan') {
            setPendingScan({ kind: a.kind, target: a.target });
            setAuthorised(false);
          } else if (a.type === 'set-voice-rate') setRate((r) => Math.min(2, Math.max(0.5, Math.round((r + a.delta) * 100) / 100)));
          else onAction(a);
        }
        if (reply.intent === 'briefing-refresh') awaitingBriefing.current = briefing?.id ?? 'none';
        if (reply.intent === 'stop') setOrb('idle');
        else say(reply.speech);
      } catch (err) {
        setError(`Could not get an answer: ${(err as Error).message}`);
        setOrb('idle');
      }
    },
    [briefing, say, onAction],
  );

  // Microphone callbacks fire later, so they read the latest handler from a ref.
  const handleRef = useRef(handle);
  useEffect(() => {
    handleRef.current = handle;
  }, [handle]);

  // When a refresh that the user asked for finishes, read the new briefing aloud.
  useEffect(() => {
    if (!awaitingBriefing.current || !briefing || briefing.isSample || briefing.id === awaitingBriefing.current) return;
    awaitingBriefing.current = null;
    const cites = briefing.stories.slice(0, 5).map((st) => ({ storyId: st.id, title: st.title, url: st.url }));
    setMessages((m) => [...m, local('assistant', briefing.spokenScript, { citations: cites, aiStatus: briefing.aiStatus })]);
    say(briefing.spokenScript);
    // eslint-disable-next-line
  }, [briefing]);

  // ---------- Push to talk ----------
  const toggleMic = () => {
    if (orb === 'listening' && pttRef.current) {
      pttRef.current.stop();
      return;
    }
    stopSpeaking();
    speakingRef.current = false;
    wakeRef.current?.abort();
    const rec = createRecognition(prefs.voiceLang);
    if (!rec) {
      setError('Voice input is not supported in this browser. Use Chrome or Edge, or type your question below.');
      return;
    }
    pttRef.current = rec;
    let finalText = '';
    rec.onresult = (e) => {
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interimText += t;
      }
      setInterim(interimText || finalText);
    };
    rec.onerror = (e) => setError(MIC_ERRORS[e.error] ?? (e.error === 'no-speech' ? 'I did not hear anything. Try again.' : `Voice error: ${e.error}`));
    rec.onend = () => {
      pttRef.current = null;
      setInterim('');
      setOrb((o) => (o === 'listening' ? 'idle' : o));
      if (finalText.trim()) void handleRef.current(finalText);
      else if (handsFreeRef.current) setTimeout(startWakeLoop, 300);
    };
    setError(null);
    setOrb('listening');
    try {
      rec.start();
    } catch {
      setOrb('idle');
    }
  };

  const confirmScan = async () => {
    if (!pendingScan) return;
    const scan = pendingScan;
    setPendingScan(null);
    try {
      const res = await fetch('/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...scan, confirm: true }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      const r = `Scan started for ${scan.target}. I will show the results on the Scans page.`;
      setMessages((m) => [...m, local('assistant', r)]);
      say(r);
      onAction({ type: 'navigate', view: 'scans' });
    } catch (err) {
      const r = `The scan did not start: ${(err as Error).message}`;
      setMessages((m) => [...m, local('assistant', r)]);
      say(r);
    }
  };

  const stateLabel = { idle: handsFree ? 'Say "Hey Siva…"' : 'Ready', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…' }[orb];

  return (
    <section className="panel ask" aria-label="Ask Siva">
      <div className="ask-head">
        <SivaOrb state={orb} size={140} />
        <div className="ask-controls">
          <div className="ask-title">Siva <span className="muted">· {stateLabel}</span></div>
          <button type="button" className={`mic ${orb === 'listening' && !handsFree ? 'on' : ''}`} onClick={toggleMic} disabled={busy} aria-pressed={orb === 'listening'}>
            {orb === 'listening' && pttRef.current ? '■ Stop' : '🎙 Push to talk'}
          </button>
          <div className="row">
            <button type="button" className={`btn small ${handsFree ? 'primary' : 'ghost'}`} onClick={toggleHandsFree} aria-pressed={handsFree} title="Listen for 'Hey Siva' or 'Jarvis'">
              {handsFree ? '● Hands-free ON' : 'Hands-free'}
            </button>
            {orb === 'speaking' ? (
              <button type="button" className="btn ghost small" onClick={stopAll}>Stop</button>
            ) : (
              <button type="button" className="btn ghost small" onClick={() => void handle("What's the update today?")} disabled={busy}>▶ Briefing</button>
            )}
          </div>
          <button type="button" className="link small" onClick={async () => { if (window.confirm('Clear the conversation?')) { await fetch('/api/chat', { method: 'DELETE' }); setMessages([]); } }}>Clear conversation</button>
          <label className="check small">
            <input type="checkbox" checked={voiceReplies} onChange={(e) => setVoiceReplies(e.target.checked)} /> Speak replies ({rate.toFixed(2)}×)
          </label>
          {handsFree && <div className="hint live">● Microphone is on (Chrome sends audio to Google speech recognition).</div>}
          {!support.recognition && <div className="hint">Voice input needs Chrome or Edge. Typing always works.</div>}
        </div>
      </div>

      <div className="chat-log" ref={logRef} aria-live="polite">
        {messages.length === 0 && (
          <p className="muted small">
            Try: “Hey Siva, what&apos;s the update today?”, “Top threats”, “Read story 2”, “Explain CVE-2026-0322”, “Who is APT29?”, “What is T1059?”, “Scan my website example.com”, “Export to NotebookLM”.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <div className="bubble">{m.text}</div>
            {m.aiStatus && m.aiStatus !== 'ok' && m.role === 'assistant' && <div className="hint">AI {m.aiStatus}: answer built from source data.</div>}
            {m.citations && m.citations.length > 0 && (
              <div className="cites">
                {m.citations.map((c, i) => (
                  <span key={`${c.url}-${i}`} className="cite">
                    {c.storyId ? (
                      <button type="button" className="link" onClick={() => onShowStory(c.storyId)}>[{i + 1}] {c.title}</button>
                    ) : (
                      <span>[{i + 1}] {c.title}</span>
                    )}
                    <a href={c.url} target="_blank" rel="noopener noreferrer" aria-label="Open source">↗</a>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {pendingScan && (
          <div className="msg assistant">
            <div className="bubble confirm">
              <b>Confirm scan</b>
              <div>
                {pendingScan.kind === 'web' ? 'Passive website check' : `Trivy (${pendingScan.kind.replace('trivy-', '')})`}: <code>{pendingScan.target}</code>
              </div>
              <label className="check small">
                <input type="checkbox" checked={authorised} onChange={(e) => setAuthorised(e.target.checked)} /> I own this or am authorised to scan it
              </label>
              <div className="row">
                <button type="button" className="btn primary small" disabled={!authorised} onClick={confirmScan}>Start scan</button>
                <button type="button" className="btn ghost small" onClick={() => setPendingScan(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        {interim && <div className="msg user"><div className="bubble interim">{interim}</div></div>}
      </div>

      {error && <div className="inline-error" role="alert">{error}</div>}

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          const v = input;
          setInput('');
          void handle(v);
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask or command Siva…" maxLength={1000} aria-label="Message Siva" />
        <button className="btn" type="submit" disabled={busy || !input.trim()}>Send</button>
      </form>
    </section>
  );
}
