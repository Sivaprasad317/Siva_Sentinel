'use client';
// SIVA Sentinel Home: a clean, voice-first assistant screen.
//   "Hey Siva"            -> "Yes boss" (then he listens)
//   3D Siva switch ON     -> a young man walks in from the back, greets you by the time of day and
//                            listens; answers are spoken, not shown — open "Reports" (top-right) to
//                            read or download them.
//   any question           -> "I am checking, boss" + the real research steps, live
//   answer                 -> a clear answer card (simple explanation, key facts, what to do, sources)
// Voice works in Chrome and Edge. Typing works everywhere.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AnswerCard, AssistantAction, AssistantReply, Briefing, Preferences, ScanKind } from '../lib/types';
import { createRecognition, canSpeak, speak, stopSpeaking, type RecognitionLike } from '../lib/voice';
import { detectWake, detectWakeAny, routeIntent } from '../lib/assistantRouter';
import type { OrbState } from './SivaOrb';
import { toCard } from '../lib/answerCard';
import { emitSiva, onSiva } from '../lib/sivaBus';
import { DEFAULT_VOICE_COMMANDS, isOwnEcho, matchVoiceCommand, stripGreeting } from '../lib/voiceCommands';
import { isSecurityTopic } from '../lib/chatRoute';
import { answerReportHtml, fmtWhen, reportFileName } from '../lib/answerReport';

interface Props {
  /** false while another screen is showing; the mic keeps listening, and "Hey Siva" brings you back here. */
  active?: boolean;
  briefing: Briefing | null;
  prefs: Pick<Preferences, 'voiceRate' | 'voiceLang' | 'voiceName' | 'voicePitch' | 'voiceGender' | 'timezone' | 'wakeOnLoad' | 'voiceCommands'>;
  userTitle: string;
  onAction: (a: AssistantAction) => void;
  onShowStory: (id: string) => void;
}

interface Exchange {
  id: string;
  question: string;
  /** when it was asked (ISO) — shown in reports */
  at: string;
  steps: string[];
  status: 'checking' | 'done' | 'error';
  card?: AnswerCard;
  reply?: AssistantReply;
  error?: string;
  pendingScan?: { kind: ScanKind; target: string };
}


const QUICK_INTENTS = new Set(['stop', 'wake', 'navigate', 'voice-rate', 'help', 'export', 'scan', 'about']);


const SECTION_ICON: Record<string, string> = {
  'In simple words': '💡',
  'How it works': '⚙️',
  'Key points': '📌',
  'Real-world example': '🌍',
  'Why it matters': '⚠️',
  'How to spot it': '🔎',
  'Latest from the news': '🗞️',
  'Related terms': '🔗',
  'MITRE mitigations': '🛡️',
};
const iconFor = (h: string) => SECTION_ICON[h] ?? (/^CVE-/.test(h) ? '🧾' : /MITRE|Weakness|prevent/i.test(h) ? '📚' : /briefing/i.test(h) ? '📰' : /ThreatFox/i.test(h) ? '🧪' : '•');

/** Show "Lead: rest" / "Lead — rest" bullets with the lead in bold, so key points scan quickly. */
function KeyBullet({ text }: { text: string }) {
  const m = /^(.{2,48}?)(:|\s—\s|\s-\s)\s*(.+)$/.exec(text);
  if (m && !/https?$/i.test(m[1])) return <li><b>{m[1]}</b>{m[2] === ':' ? ': ' : ' — '}{m[3]}</li>;
  return <li>{text}</li>;
}

export default function HomeView({ active = true, briefing, prefs, userTitle, onAction, onShowStory }: Props) {
  const [orb, setOrb] = useState<OrbState>('idle');
  const [input, setInput] = useState('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [handsFree, setHandsFree] = useState(false);
  const [heard, setHeard] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [authorised, setAuthorised] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [typing, setTyping] = useState(false);
  // 3D presenter mode (ON/OFF switch, remembered in this browser).
  const [reportsOpen, setReportsOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [heardFlash, setHeardFlash] = useState('');
  const [mounted, setMounted] = useState(false);
  // The dashboard gives us a slot (#siva-controls) for the 3D switch + Reports button.
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(active ? document.getElementById('siva-controls') : null);
  }, [active]);
  const avatarRef = useRef(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  // The landing page shows Siva himself; tell it what he is doing.
  useEffect(() => {
    emitSiva({ type: 'state', state: orb });
  }, [orb]);
  useEffect(() => {
    if (!heardFlash) return;
    const t = setTimeout(() => setHeardFlash(''), 5000);
    return () => clearTimeout(t);
  }, [heardFlash]);
  const wakeRef = useRef<RecognitionLike | null>(null);
  const pttRef = useRef<RecognitionLike | null>(null);
  const handsFreeRef = useRef(false);
  const speakingRef = useRef(false);
  const awaitingUntil = useRef(0);
  const awaitingBriefing = useRef<string | null>(null);
  const speechDone = useRef<Promise<void>>(Promise.resolve());
  const handleRef = useRef<(t: string) => void>(() => undefined);
  const startWakeRef = useRef<() => void>(() => undefined);
  // Mic diagnostics, so you can SEE why voice is or is not working.
  const [micNote, setMicNote] = useState<{ tone: 'ok' | 'bad' | 'info'; text: string } | null>(null);
  const [, setLastHeard] = useState<{ text: string; woke: boolean } | null>(null);
  const wakeRunning = useRef(false);
  const blockedRef = useRef(false); // permission refused: wait for a click instead of retrying in a loop
  const failStreak = useRef(0);
  const wakeWait = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearWakeWait = () => {
    if (wakeWait.current) clearTimeout(wakeWait.current);
    wakeWait.current = null;
  };
  /** Stop the wake-word listener and ignore any late callbacks from it. */
  const stopWake = useCallback(() => {
    const r = wakeRef.current;
    wakeRef.current = null;
    wakeRunning.current = false;
    try {
      r?.abort();
    } catch {
      /* already stopped */
    }
  }, []);

  // Has the microphone actually started capturing? (Browsers need one interaction to allow it.)
  const [micArmed, setMicArmed] = useState(false);
  const micArmedRef = useRef(false);
  const setArmed = useCallback((v: boolean) => {
    micArmedRef.current = v;
    setMicArmed(v);
  }, []);

  // "Always listen" preference: arm hands-free with NO mic tap.
  // Browsers forbid starting the microphone with zero interaction on first load, so we also arm on
  // the first click/keypress ANYWHERE on the page. After that it stays hands-free and auto-restarts;
  // on later visits (once the mic is allowed) it starts on its own.
  const autoWakeDone = useRef(false);
  useEffect(() => {
    if (autoWakeDone.current || !prefs.wakeOnLoad) return;
    if (!createRecognition('en-IN')) return; // unsupported browser (Firefox/Safari)
    autoWakeDone.current = true;
    setHandsFree(true);
    handsFreeRef.current = true;
    setOrb('idle');
    // Defer so startWakeRef is wired up; works on its own once the mic is already allowed.
    setTimeout(() => startWakeRef.current(), 0);

    const arm = () => {
      if (!handsFreeRef.current) return;
      if (!micArmedRef.current) {
        blockedRef.current = false;
        startWakeRef.current();
      }
    };
    window.addEventListener('pointerdown', arm, { capture: true });
    window.addEventListener('keydown', arm, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', arm, { capture: true });
      window.removeEventListener('keydown', arm, { capture: true });
    };
  }, [prefs.wakeOnLoad]);

  useEffect(() => {
    setSupported(Boolean(createRecognition('en-IN')));
    return () => {
      handsFreeRef.current = false;
      stopWake();
      pttRef.current?.abort();
      stopSpeaking();
    };
  }, [stopWake]);

  // ---------- Barge-in: say "Cool" (or "stop") while Siva is reading and he stops ----------
  const speakingText = useRef('');
  const speechResolve = useRef<(() => void) | null>(null);
  const bargeRef = useRef<RecognitionLike | null>(null);
  const startBargeRef = useRef<() => void>(() => undefined);
  const stopBarge = useCallback(() => {
    const r = bargeRef.current;
    bargeRef.current = null;
    try {
      r?.abort();
    } catch {
      /* already stopped */
    }
  }, []);
  const interrupt = useCallback(() => {
    stopSpeaking();
    speechResolve.current?.();
  }, []);
  const startBarge = useCallback(() => {
    if (!handsFreeRef.current || !micArmedRef.current || bargeRef.current) return;
    const rec = createRecognition(prefs.voiceLang);
    if (!rec) return;
    rec.continuous = true;
    rec.interimResults = true; // react to "Cool" as soon as it is heard
    bargeRef.current = rec;
    const current = () => bargeRef.current === rec;
    rec.onresult = (e) => {
      if (!current() || !speakingRef.current) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const heardNow: string = e.results[i][0].transcript;
        if (isOwnEcho(heardNow, speakingText.current)) continue; // Siva hearing himself
        const cmd = matchVoiceCommand(heardNow, cmdsRef.current, 'speaking');
        if (cmd?.action === 'stop') {
          interrupt();
          return;
        }
      }
    };
    rec.onerror = () => undefined;
    rec.onend = () => {
      if (!current()) return;
      bargeRef.current = null;
      if (speakingRef.current) setTimeout(() => startBargeRef.current(), 150); // Chrome stops after silence: keep listening while he talks
    };
    try {
      rec.start();
    } catch {
      bargeRef.current = null;
    }
  }, [prefs.voiceLang, interrupt]);
  useEffect(() => {
    startBargeRef.current = startBarge;
  }, [startBarge]);
  const cmdsRef = useRef(prefs.voiceCommands ?? DEFAULT_VOICE_COMMANDS);
  useEffect(() => {
    cmdsRef.current = prefs.voiceCommands ?? DEFAULT_VOICE_COMMANDS;
  }, [prefs.voiceCommands]);

  /** Speak and return a promise that resolves when she has finished talking. */
  const say = useCallback(
    (text: string): Promise<void> => {
      emitSiva({ type: 'said', text });
      if (!canSpeak()) return Promise.resolve();
      speakingRef.current = true;
      stopWake(); // the wake listener pauses; the barge-in listener below only waits for "Cool" / "stop"
      speakingText.current = text;
      const p = new Promise<void>((resolve) => {
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          speakingRef.current = false;
          speechResolve.current = null;
          stopBarge();
          resolve();
        };
        speechResolve.current = finish;
        startBargeRef.current();
        speak(text, {
          rate: prefs.voiceRate,
          lang: prefs.voiceLang,
          pitch: prefs.voicePitch,
          voiceName: prefs.voiceName,
          gender: prefs.voiceGender ?? 'male',
          onStart: () => setOrb((o) => (o === 'thinking' ? o : 'speaking')),
          onEnd: finish,
        });
      });
      speechDone.current = p;
      return p;
    },
    [prefs.voiceRate, prefs.voiceLang, prefs.voicePitch, prefs.voiceName, prefs.voiceGender, stopWake],
  );

  const afterSpeaking = useCallback(() => {
    setOrb((o) => (o === 'thinking' ? o : 'idle'));
    if (!handsFreeRef.current) return;
    // Conversation mode: for 8 seconds after Siva answers, a follow-up question works without
    // saying "Hey Siva" again. After that he goes back to waiting for "Hey Siva".
    if (micArmedRef.current) {
      awaitingUntil.current = Date.now() + 8_000;
      setOrb((o) => (o === 'thinking' ? o : 'listening'));
      setTimeout(() => {
        if (Date.now() >= awaitingUntil.current) setOrb((o) => (o === 'listening' ? 'idle' : o));
      }, 8_300);
    }
    setTimeout(() => startWakeRef.current(), 300);
  }, []);

  const update = (id: string, patch: Partial<Exchange> | ((e: Exchange) => Partial<Exchange>)) =>
    setExchanges((list) => list.map((e) => (e.id === id ? { ...e, ...(typeof patch === 'function' ? patch(e) : patch) } : e)));

  // ---------- Asking ----------
  const ask = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      setError(null);
      setHeard('');
      // 1. Your own phrases first ("Hey Siva, wake up" -> "Good morning boss"). No AI, instant.
      const w = detectWake(text);
      const custom = matchVoiceCommand(w.woke ? w.command : text, cmdsRef.current, 'normal', true);
      if (custom && custom.action === 'say') {
        setHeardFlash(text);
        emitSiva({ type: 'heard', text });
        setOrb('speaking');
        await say(custom.reply);
        setOrb('idle');
        afterSpeaking();
        return;
      }
      const intent = routeIntent(text);
      // Visible "got it": show what was heard next to the mic, and the 3D Siva nods.
      if (intent.type !== 'wake') {
        setHeardFlash(text);
        emitSiva({ type: 'heard', text });
      }
      if (intent.type === 'wake') {
        setOrb('speaking');
        await say(`Yes ${userTitle}.`);
        listenForCommand(10_000);
        return;
      }
      if (intent.type === 'stop') {
        stopSpeaking();
        speakingRef.current = false;
        afterSpeaking();
        return;
      }
      const id = `${Date.now()}`;
      setExchanges((list) => [{ id, question: text, at: new Date().toISOString(), steps: [], status: 'checking' as const }, ...list].slice(0, 12));
      setOrb('thinking');
      // "I am checking" only for real research; a normal conversation just answers (like Gemini / ChatGPT).
      const research = ['briefing', 'cve', 'technique', 'actor', 'graph', 'outlook'].includes(intent.type) || (intent.type === 'chat' && isSecurityTopic(text));
      if (!QUICK_INTENTS.has(intent.type) && research) void say(intent.type === 'briefing' ? `I am checking today's update, ${userTitle}.` : `I am checking, ${userTitle}.`);

      try {
        const res = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: text, briefingId: briefing?.isSample ? undefined : briefing?.id }) });
        if (!res.ok || !res.body) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? `HTTP ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let result: { reply: AssistantReply } | null = null;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const msg = JSON.parse(line) as { type: string; text?: string; reply?: AssistantReply; error?: string };
            if (msg.type === 'step' && msg.text) update(id, (e) => ({ steps: [...e.steps, msg.text!] }));
            else if (msg.type === 'result' && msg.reply) result = { reply: msg.reply };
            else if (msg.type === 'error') throw new Error(msg.error ?? 'Unknown error');
          }
        }
        if (!result) throw new Error('No answer received');
        const reply = result.reply;
        let pendingScan: Exchange['pendingScan'];
        for (const a of reply.actions) {
          if (a.type === 'confirm-scan') pendingScan = { kind: a.kind, target: a.target };
          else if (a.type === 'refresh-started') {
            awaitingBriefing.current = briefing?.id ?? 'none';
            onAction(a);
          } else if (a.type !== 'show-story') onAction(a);
        }
        update(id, { status: 'done', reply, card: toCard(reply, briefing), pendingScan });
        if (avatarRef.current) setUnread((n) => n + 1);
        else if (!QUICK_INTENTS.has(intent.type)) setReportsOpen(true); // no presenter: show the answer card right away
        setAuthorised(false);
        await speechDone.current; // let "I am checking" finish first
        setOrb('speaking');
        await say(reply.speech);
      } catch (err) {
        update(id, { status: 'error', error: (err as Error).message });
        setOrb('speaking');
        await say(`Sorry ${userTitle}, I could not complete that. ${(err as Error).message}`);
      }
      setOrb('idle');
      afterSpeaking();
    },
    [briefing, say, userTitle, onAction, afterSpeaking],
  );
  useEffect(() => {
    handleRef.current = (t: string) => void ask(t);
  }, [ask]);

  // When a refresh she started finishes, read the new briefing.
  useEffect(() => {
    if (!awaitingBriefing.current || !briefing || briefing.isSample || briefing.id === awaitingBriefing.current) return;
    awaitingBriefing.current = null;
    const id = `${Date.now()}`;
    const reply: AssistantReply = { intent: 'briefing', speech: briefing.spokenScript, display: briefing.executiveSummary, citations: briefing.stories.slice(0, 5).map((s) => ({ storyId: s.id, title: s.title, url: s.url })), actions: [], aiStatus: briefing.aiStatus };
    setExchanges((list) => [{ id, question: "Today's update is ready", at: new Date().toISOString(), steps: [], status: 'done' as const, reply, card: toCard(reply, briefing) }, ...list]);
    if (avatarRef.current) setUnread((n) => n + 1);
    setOrb('speaking');
    void say(stripGreeting(briefing.spokenScript)).then(() => {
      setOrb('idle');
      afterSpeaking();
    });
  }, [briefing, say, afterSpeaking]);

  // ---------- Hands-free wake word ----------
  const startWake = useCallback(() => {
    if (!handsFreeRef.current || speakingRef.current || wakeRunning.current) return;
    const rec = createRecognition(prefs.voiceLang);
    if (!rec) return;
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 4; // "hey shiva" is often only the engine's 2nd or 3rd guess
    wakeRef.current = rec;
    wakeRunning.current = true;
    let gotAudio = false;
    const current = () => wakeRef.current === rec; // ignore callbacks from a recogniser we already replaced
    rec.onresult = (e) => {
      if (!current()) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        const alts: string[] = Array.from({ length: e.results[i].length }, (_, k) => String(e.results[i][k].transcript));
        const { woke, command, text: said } = detectWakeAny(alts);
        setLastHeard({ text: said, woke: woke || Date.now() < awaitingUntil.current });
        if (woke && command) {
          clearWakeWait();
          handleRef.current(`Hey Siva ${command}`);
        } else if (woke) {
          // Just "Hey Siva": Chrome often sends the question as the NEXT piece. Keep this same mic
          // session open and wait a moment for it, instead of talking over it (which stops the mic).
          awaitingUntil.current = Date.now() + 10_000;
          setOrb('listening');
          setHeard('Listening…');
          clearWakeWait();
          wakeWait.current = setTimeout(() => {
            wakeWait.current = null;
            if (Date.now() >= awaitingUntil.current) return;
            awaitingUntil.current = 0;
            handleRef.current('Hey Siva'); // nothing followed: answer "Yes boss" and listen
          }, 1_600);
        } else if (Date.now() < awaitingUntil.current) {
          clearWakeWait();
          awaitingUntil.current = 0;
          handleRef.current(said);
        }
      }
    };
    rec.onerror = (e) => {
      if (!current()) return;
      const code: string = e.error;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        blockedRef.current = true;
        setArmed(false);
        setMicNote({ tone: 'bad', text: 'The browser has not allowed the microphone for this site. Click the lock icon in the address bar → Microphone → Allow, then press “Mic check”.' });
      } else if (code === 'audio-capture') {
        blockedRef.current = true;
        setArmed(false);
        setMicNote({ tone: 'bad', text: 'No working microphone was found. Plug one in or pick the right input in Windows sound settings, then press “Mic check”.' });
      } else if (code === 'network') {
        setMicNote({ tone: 'bad', text: 'Chrome’s speech service could not be reached. Voice recognition needs an internet connection (and does not work in Brave unless “Google services for speech” is on).' });
      }
    };
    rec.onaudiostart = () => {
      if (!current()) return;
      gotAudio = true;
      failStreak.current = 0;
      setArmed(true); // the mic is really capturing now
      setMicNote({ tone: 'ok', text: 'Microphone is on — say “Hey Siva”.' });
    };
    rec.onstart = () => {
      if (current()) setArmed(true);
    };
    rec.onend = () => {
      if (!current()) return; // a newer recogniser owns the mic now
      wakeRef.current = null;
      wakeRunning.current = false;
      if (!handsFreeRef.current || speakingRef.current || blockedRef.current) return;
      if (!gotAudio) failStreak.current += 1;
      // Back off if it keeps failing, so we never spin in a restart loop.
      const delay = Math.min(400 * 2 ** Math.max(0, failStreak.current - 1), 10_000);
      setTimeout(() => startWakeRef.current(), delay);
    };
    try {
      rec.start();
    } catch {
      // start() refused (usually: needs a click first). The "click anywhere" arm retries.
      wakeRef.current = null;
      wakeRunning.current = false;
    }
  }, [prefs.voiceLang, setArmed]);
  useEffect(() => {
    startWakeRef.current = startWake;
  }, [startWake]);



  /** After "Yes boss" or the 3D greeting: take the next thing you say as the question (no wake word). */
  const listenForCommand = useCallback((ms: number) => {
    awaitingUntil.current = Date.now() + ms;
    setOrb('listening');
    setHeard('Listening…');
    if (handsFreeRef.current && micArmedRef.current) {
      startWakeRef.current();
      // Nothing said in time: go back to quietly waiting for "Hey Siva".
      setTimeout(() => {
        if (Date.now() >= awaitingUntil.current) setOrb((o) => (o === 'listening' ? 'idle' : o));
      }, ms + 300);
    } else startPttRef.current(false);
  }, []);

  /** "Talk to Siva" / Meet Siva: greet by the time of day and ask how he can help, then listen. */
  const greetAndListen = useCallback(() => {
    stopSpeaking();
    stopWake();
    setOrb('speaking');
    void say(`Yes ${userTitle}?`).then(() => {
      if (!pttRef.current) listenForCommand(12_000);
    });
  }, [say, prefs.timezone, userTitle, listenForCommand, stopWake]);
  const greetRef = useRef(greetAndListen);
  useEffect(() => {
    greetRef.current = greetAndListen;
  }, [greetAndListen]);
  useEffect(
    () =>
      onSiva((e) => {
        if (e.type === 'greet') greetRef.current();
        else if (e.type === 'presenter') avatarRef.current = e.on;
        else if (e.type === 'mic-click') micClickRef.current();
        else if (e.type === 'typing') setTyping((t) => !t);
      }),
    [],
  );

  // ---------- Reports (view + download) ----------
  const reportItems = (list: Exchange[]) => list.filter((e) => e.card).map((e) => ({ question: e.question, askedAt: e.at, card: e.card! }));
  const reportBlobUrl = (list: Exchange[]) => {
    const html = answerReportHtml(reportItems(list), { tz: prefs.timezone, now: new Date(), userTitle });
    return URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  };
  const downloadReport = (list: Exchange[]) => {
    const url = reportBlobUrl(list);
    const a = document.createElement('a');
    a.href = url;
    a.download = reportFileName(new Date(), list.length === 1 ? list[0].question : undefined);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  const openReport = (list: Exchange[]) => {
    const url = reportBlobUrl(list);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  // Voice-only, always: a watchdog makes sure "Hey Siva" is listening whenever it should be (after
  // errors, network drops, the tab coming back to the front, or Chrome silently stopping it).
  useEffect(() => {
    const revive = () => {
      if (!handsFreeRef.current || wakeRunning.current || speakingRef.current || pttRef.current || blockedRef.current || document.hidden) return;
      startWakeRef.current();
    };
    const t = setInterval(revive, 4_000);
    const onVis = () => {
      if (!document.hidden) setTimeout(revive, 300);
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, []);
  useEffect(() => {
    emitSiva({ type: 'mic', listening: handsFree && micArmed, problem: micNote?.tone === 'bad' ? micNote.text : '' });
  }, [handsFree, micArmed, micNote]);

  // ---------- Push to talk ----------
  const startPtt = useCallback(
    (greet: boolean) => {
      const begin = () => {
        const rec = createRecognition(prefs.voiceLang);
        if (!rec) {
          setError('Voice input needs Chrome or Edge. You can type instead.');
          setOrb('idle');
          return;
        }
        pttRef.current = rec;
        let finalText = '';
        rec.onresult = (e) => {
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
            else interim += e.results[i][0].transcript;
          }
          setHeard(interim || finalText);
          emitSiva({ type: 'interim', text: interim || finalText });
        };
        rec.onerror = (e) => {
          if (e.error !== 'no-speech' && e.error !== 'aborted') setError(`Voice error: ${e.error}`);
        };
        rec.onend = () => {
          pttRef.current = null;
          if (finalText.trim()) handleRef.current(finalText);
          else {
            setHeard('');
            setOrb('idle');
          }
        };
        setOrb('listening');
        setHeard('Listening…');
        try {
          rec.start();
        } catch {
          setOrb('idle');
        }
      };
      if (greet) {
        setOrb('speaking');
        void say(`Yes ${userTitle}.`).then(begin);
      } else begin();
    },
    [prefs.voiceLang, say, userTitle],
  );
  const startPttRef = useRef(startPtt);
  useEffect(() => {
    startPttRef.current = startPtt;
  }, [startPtt]);

  const micClickRef = useRef<() => void>(() => undefined);
  const micClick = () => {
    if (pttRef.current) return pttRef.current.stop();
    stopSpeaking();
    speakingRef.current = false;
    stopWake();
    setError(null);
    startPtt(true);
  };
  micClickRef.current = micClick;

  /** Ask the browser for the microphone (needs a click), report the result, then (re)start listening. */
  const micCheck = async () => {
    setMicNote({ tone: 'info', text: 'Checking the microphone…' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      blockedRef.current = false;
      failStreak.current = 0;
      setMicNote({ tone: 'ok', text: 'Microphone permission is granted. Starting “Hey Siva” listening…' });
      setHandsFree(true);
      handsFreeRef.current = true;
      stopWake();
      startWake();
    } catch (err) {
      const name = (err as DOMException).name;
      setMicNote({
        tone: 'bad',
        text:
          name === 'NotAllowedError'
            ? 'Microphone is blocked for this site. Click the lock icon in the address bar → Microphone → Allow, then reload this page.'
            : name === 'NotFoundError'
              ? 'No microphone was found on this computer.'
              : `Could not open the microphone (${name || 'unknown error'}).`,
      });
    }
  };

  const confirmScan = async (ex: Exchange) => {
    if (!ex.pendingScan) return;
    const res = await fetch('/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...ex.pendingScan, confirm: true }) });
    const d = await res.json().catch(() => ({}));
    update(ex.id, { pendingScan: undefined });
    const msg = res.ok ? `Scan started for ${ex.pendingScan.target}. Opening the Scans page.` : `The scan did not start: ${d.error ?? res.status}`;
    void say(msg);
    if (res.ok) onAction({ type: 'navigate', view: 'scans' });
  };

  const idleStatus = !supported
    ? 'Type your question (voice needs Chrome or Edge)'
    : handsFree && micArmed
      ? 'Listening… just say “Hey Siva”'
      : handsFree
        ? 'Click anywhere once to switch on “Hey Siva” — then you never tap again'
        : 'Say “Hey Siva”, tap the mic, or type';
  const latest = exchanges[0];
  const doneCount = exchanges.filter((e) => e.card).length;

  const answersList = latest && (
        <section className="answers">
          {exchanges.map((ex, idx) => (
            <article key={ex.id} className={`answer glass ${idx === 0 ? 'latest' : 'older'}`}>
              <div className="q">“{ex.question}”</div>
              {ex.steps.length > 0 && (idx === 0 || ex.status !== 'done') && (
                <ol className="steps">
                  {ex.steps.map((s, i) => (
                    <li key={i} className={ex.status === 'checking' && i === ex.steps.length - 1 ? 'active' : 'done'}>
                      <span className="tick" aria-hidden>{ex.status === 'checking' && i === ex.steps.length - 1 ? '' : '✓'}</span>
                      {s}
                    </li>
                  ))}
                </ol>
              )}
              {ex.status === 'checking' && !ex.steps.length && <p className="muted"><span className="spinner" /> Thinking…</p>}
              {ex.status === 'error' && <p className="inline-error">{ex.error}</p>}
              {ex.card && (
                <div className="card-body">
                  <h2>{ex.card.title}</h2>
                  <p className="card-summary">{ex.card.summary}</p>
                  {idx !== 0 && !expanded.has(ex.id) && (ex.card.sections.length > 0 || ex.card.actions.length > 0) && (
                    <button type="button" className="link small" onClick={() => setExpanded((e) => new Set(e).add(ex.id))}>Show full answer ↓</button>
                  )}
                  {(idx === 0 || expanded.has(ex.id)) && (
                    <>
                      {(() => {
                        const secs = ex.card!.sections;
                        // "What to do" goes right after the explanation, before the reference material.
                        const cut = Math.max(secs.findIndex((x) => x.heading === 'Why it matters'), secs.findIndex((x) => x.heading === 'Key points'));
                        const head = cut >= 0 ? secs.slice(0, cut + 1) : secs.slice(0, 2);
                        const tail = cut >= 0 ? secs.slice(cut + 1) : secs.slice(2);
                        const render = (sec: (typeof secs)[number]) => (
                          <div key={sec.heading} className={`card-sec ${sec.heading === 'Key points' ? 'keypts' : ''}`}>
                            <h3><span aria-hidden>{iconFor(sec.heading)}</span> {sec.heading}</h3>
                            <ul>{sec.bullets.map((b, i) => <KeyBullet key={i} text={b} />)}</ul>
                          </div>
                        );
                        return (
                          <>
                            {head.map(render)}
                            {ex.card!.actions.length > 0 && (
                              <div className="card-sec todo">
                                <h3><span aria-hidden>✅</span> What to do</h3>
                                <ol>{ex.card!.actions.map((a, i) => <KeyBullet key={i} text={a} />)}</ol>
                              </div>
                            )}
                            {tail.length > 0 && <div className="card-grid">{tail.map(render)}</div>}
                          </>
                        );
                      })()}
                      {ex.card.graphFocus && (
                        <button type="button" className="btn ghost small" style={{ marginTop: 10 }} onClick={() => onAction({ type: 'navigate', view: 'graph', focus: ex.card!.graphFocus })}>🕸️ Open in Threat Graph</button>
                      )}
                      {ex.pendingScan && (
                        <div className="card-sec confirm">
                          <h3>Confirm scan</h3>
                          <p>{ex.pendingScan.kind === 'web' ? 'Passive website check' : `Trivy ${ex.pendingScan.kind.replace('trivy-', '')} scan`}: <code>{ex.pendingScan.target}</code></p>
                          <label className="check small"><input type="checkbox" checked={authorised} onChange={(e) => setAuthorised(e.target.checked)} /> I own this or am authorised to scan it</label>
                          <div className="row">
                            <button type="button" className="btn primary small" disabled={!authorised} onClick={() => confirmScan(ex)}>Start scan</button>
                            <button type="button" className="btn ghost small" onClick={() => update(ex.id, { pendingScan: undefined })}>Cancel</button>
                          </div>
                        </div>
                      )}
                      {ex.card.sources.length > 0 && (
                        <div className="card-sec sources-sec">
                          <h3>Sources{ex.card.usedWebSearch ? ' · includes Google Search' : ''}</h3>
                          <div className="source-chips">
                            {ex.card.sources.map((s, i) =>
                              s.kind === 'story' && ex.reply?.citations.find((c) => c.url === s.url)?.storyId ? (
                                <button key={s.url} type="button" className="source-chip" onClick={() => onShowStory(ex.reply!.citations.find((c) => c.url === s.url)!.storyId)}>
                                  <b>{i + 1}</b> {s.title}
                                </button>
                              ) : (
                                <a key={s.url} className="source-chip" href={s.url} target="_blank" rel="noopener noreferrer">
                                  <b>{i + 1}</b> {s.title} ↗
                                </a>
                              ),
                            )}
                          </div>
                        </div>
                      )}
                      {ex.card.searchSuggestionsHtml && (
                        <iframe className="search-suggest" title="Google Search suggestions" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={ex.card.searchSuggestionsHtml} />
                      )}
                      {ex.card.note && <p className="hint">{ex.card.note}</p>}
                      {ex.reply && ex.reply.aiStatus !== 'ok' && <p className="hint">AI {ex.reply.aiStatus}: this answer comes straight from the sources.</p>}
                      <div className="row report-actions">
                        <span className="muted small">{fmtWhen(ex.at, prefs.timezone)}</span>
                        <span className="spacer" />
                        <button type="button" className="btn ghost small" onClick={() => openReport([ex])}>👁 View report</button>
                        <button type="button" className="btn ghost small" onClick={() => downloadReport([ex])}>⬇ Download</button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </article>
          ))}
        </section>
  );

  const micState = orb === 'idle' ? (handsFree && micArmed ? 'armed' : 'idle') : orb;
  const dock = (
      <section className={`home-dock mini ${active ? '' : 'away'}`}>
        {/* Tiny mic + keyboard in the bottom-left corner, on every screen. The mic animates:
            green ripples while listening, bouncing sound bars while Siva talks, a spinner while he thinks. */}
        <div className={`mic-dock st-${micState}`}>
          <button
            type="button"
            className={`mic-hero ${orb === 'listening' ? 'on' : ''} ${handsFree && micArmed ? 'armed' : ''}`}
            onClick={micClick}
            aria-label="Talk to Siva"
            title={!supported ? 'Voice needs Chrome or Edge' : handsFree && micArmed ? 'Listening for “Hey Siva” — or tap to talk' : 'Tap to talk'}
          >
            <span className="mic-ico" aria-hidden>🎙</span>
          </button>
          <span className="mic-eq" aria-hidden><i /><i /><i /><i /></span>
          <button type="button" className={`kbd-toggle ${typing ? 'on' : ''}`} onClick={() => setTyping((t) => !t)} aria-label="Type instead" title="Type instead" aria-pressed={typing}>⌨</button>
          <button type="button" className={`kbd-toggle rep ${unread ? 'new' : ''}`} onClick={() => { setReportsOpen((o) => !o); setUnread(0); }} aria-label="Reports" title="Reports: Siva's answers, view and download">📄{unread > 0 && <b>{unread}</b>}</button>
          {micNote?.tone === 'bad' && <span className="mic-heard bad">{micNote.text} <button type="button" className="link" onClick={() => void micCheck()}>Mic check</button></span>}
          {error && <span className="mic-heard bad">{error}</span>}
          {(heardFlash || (orb === 'listening' && heard && heard !== 'Listening…')) && (
            <span className={`mic-heard ${heardFlash ? 'got' : ''}`} aria-live="polite">{heardFlash ? <>✓ Got it: “{heardFlash.length > 70 ? heardFlash.slice(0, 69) + '…' : heardFlash}”</> : heard}</span>
          )}
          {!heardFlash && orb !== 'listening' && orb !== 'idle' && <span className="mic-heard soft">{orb === 'thinking' ? `Checking, ${userTitle}…` : 'Speaking…'}</span>}
        </div>
        {(typing || !supported) && (
          <form
            className="ask-bar glass"
            onSubmit={(e) => {
              e.preventDefault();
              const v = input;
              setInput('');
              void ask(v);
            }}
          >
            <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} aria-label="Ask Siva" placeholder="Type to Siva…" />
            <button type="submit" className="send" disabled={!input.trim() || orb === 'thinking'} aria-label="Send">➤</button>
          </form>
        )}
      </section>
  );

  const controls = (
    <div className="siva-controls">
      <button type="button" className="meet-siva" onClick={() => emitSiva({ type: 'open' })} title="Siva comes in front of you and asks how he can help">
        <span aria-hidden>🎙</span> Talk to Siva
      </button>
      <button type="button" className={`report-corner inline ${unread ? 'new' : ''}`} onClick={() => { setReportsOpen((o) => !o); setUnread(0); }} aria-expanded={reportsOpen}>
        📄 Reports{doneCount ? ` (${doneCount})` : ''}{unread > 0 && <b>{unread}</b>}
      </button>
    </div>
  );

  const drawer = (
    <aside className={`report-drawer glass ${reportsOpen ? 'open' : ''}`} aria-hidden={!reportsOpen} aria-label="Siva reports">
      <div className="report-head">
        <h2>📄 Reports</h2>
        <span className="spacer" />
        {doneCount > 0 && <button type="button" className="btn ghost small" onClick={() => openReport(exchanges)}>👁 View all</button>}
        {doneCount > 0 && <button type="button" className="btn primary small" onClick={() => downloadReport(exchanges)}>⬇ Download all</button>}
        <button type="button" className="btn ghost small" onClick={() => setReportsOpen(false)} aria-label="Close">✕</button>
      </div>
      {!latest && <p className="muted pad">Nothing yet. Ask Siva anything — every answer lands here with its sources, ready to view or download.</p>}
      {answersList}
    </aside>
  );

  if (!mounted) return null;
  return (
    <>
      {slot && createPortal(controls, slot)}
      {createPortal(<>{drawer}{dock}</>, document.body)}
    </>
  );
}
