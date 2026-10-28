'use client';
// Preferences: schedule time + timezone, topics, lookback window and voice.
import { useEffect, useState, type FormEvent } from 'react';
import type { Preferences } from '../lib/types';
import { canSpeak, loadVoices, pickVoice, speak } from '../lib/voice';
import { DEFAULT_VOICE_COMMANDS, type VoiceCommand } from '../lib/voiceCommands';

export interface StatusInfo {
  aiConfigured: boolean;
  aiModel: string;
  nvdKeyConfigured: boolean;
  nextScheduledRun: string | null;
  schedulerDisabled: boolean;
  scraperApiConfigured?: boolean;
  intelEnabled?: boolean;
  hackerNewsEnabled?: boolean;
  ransomwareLiveEnabled?: boolean;
  scanDomains?: number;
}

export default function SettingsView({ prefs, status, onSaved }: { prefs: Preferences | null; status: StatusInfo | null; onSaved: (p: Preferences) => void }) {
  const [form, setForm] = useState<Preferences | null>(prefs);
  const [topics, setTopics] = useState(prefs?.topics.join(', ') ?? '');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [voices, setVoices] = useState<{ name: string; lang: string }[]>([]);

  useEffect(() => {
    setForm(prefs);
    setTopics(prefs?.topics.join(', ') ?? '');
  }, [prefs]);

  useEffect(() => {
    void loadVoices().then((v) => setVoices(v.map((x) => ({ name: x.name, lang: x.lang })).filter((x) => /^(en|hi)/i.test(x.lang))));
  }, []);

  if (!form) return <div className="panel"><div className="skeleton" style={{ height: 200 }} /></div>;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const body = { ...form, topics: topics.split(',').map((t) => t.trim()).filter(Boolean), voiceCommands: (form.voiceCommands ?? DEFAULT_VOICE_COMMANDS).filter((c) => c.phrase.trim() && (c.action === 'stop' || c.reply.trim())) };
      const res = await fetch('/api/preferences', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      onSaved(d.preferences);
      setMsg({ ok: true, text: 'Saved. Topic changes apply from the next refresh.' });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof Preferences>(k: K, v: Preferences[K]) => setForm({ ...form, [k]: v });

  return (
    <div className="stack">
      <form className="panel form" onSubmit={save}>
        <h2 className="panel-title">Daily briefing</h2>
        <label className="check">
          <input type="checkbox" checked={form.scheduleEnabled} onChange={(e) => set('scheduleEnabled', e.target.checked)} /> Run a briefing automatically every day
        </label>
        <div className="grid2">
          <label>Time (24-hour)
            <input type="time" value={form.briefingTime} onChange={(e) => set('briefingTime', e.target.value)} required />
          </label>
          <label>Timezone
            <input value={form.timezone} onChange={(e) => set('timezone', e.target.value)} placeholder="Asia/Kolkata" required />
          </label>
        </div>
        <p className="hint">The schedule runs while the Siva server is running on your computer. Next run: {status?.schedulerDisabled ? 'scheduler disabled in .env.local' : status?.nextScheduledRun ?? 'not scheduled'}.</p>

        <h2 className="panel-title">Topics and sources</h2>
        <label>Topics you care about (comma separated; matching stories rank higher)
          <input value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="ransomware, india, aws, microsoft" />
        </label>
        <label>Look back (days)
          <input type="number" min={1} max={14} value={form.lookbackDays} onChange={(e) => set('lookbackDays', Number(e.target.value))} />
        </label>

        <h2 className="panel-title">Live mode</h2>
        <label>Refresh the dashboard automatically
          <select value={form.liveRefreshMinutes} onChange={(e) => set('liveRefreshMinutes', Number(e.target.value))}>
            <option value={0}>Off</option>
            <option value={5}>Every 5 minutes (fastest, uses more Gemini quota)</option>
            <option value={10}>Every 10 minutes</option>
            <option value={15}>Every 15 minutes</option>
            <option value={30}>Every 30 minutes</option>
            <option value={60}>Every hour (recommended)</option>
            <option value={120}>Every 2 hours</option>
            <option value={180}>Every 3 hours</option>
            <option value={360}>Every 6 hours</option>
          </select>
        </label>
        <p className="hint">Each live refresh uses one Gemini request and polite requests to the sources. Live refreshes replace the same day&apos;s live snapshot, so History stays tidy.</p>

        <h2 className="panel-title">Siva&apos;s voice</h2>
        <label className="check">
          <input type="checkbox" checked={form.wakeOnLoad} onChange={(e) => set('wakeOnLoad', e.target.checked)} /> Always listen for “Hey Siva” (on by default)
        </label>
        <p className="hint">When on, you never press the mic. Browsers require one interaction before they allow the microphone, so the first time you open Home, click anywhere once (or press a key) and “Hey Siva” switches on for good; on later visits it starts on its own. A red dot shows while the mic is live. Chrome and Edge only; Chrome sends audio to Google&apos;s speech service.</p>
        <div className="grid2">
          <label>Voice
            <select value={form.voiceName} onChange={(e) => set('voiceName', e.target.value)}>
              <option value="">Automatic: Indian English {(form.voiceGender ?? 'male') === 'male' ? 'man' : 'woman'} ({pickVoice(voices, '', form.voiceLang, form.voiceGender ?? 'male')?.name ?? 'loading…'})</option>
              {voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
            </select>
          </label>
          <label>Siva&apos;s voice is a…
            <select value={form.voiceGender ?? 'male'} onChange={(e) => set('voiceGender', e.target.value as 'male' | 'female')}>
              <option value="male">Man (Indian English) — default</option>
              <option value="female">Woman (Indian English)</option>
            </select>
          </label>
          <label>Voice language
            <select value={form.voiceLang} onChange={(e) => set('voiceLang', e.target.value)}>
              <option value="en-IN">English (India)</option>
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
            </select>
          </label>
          <label>Speaking speed ({form.voiceRate.toFixed(2)}×)
            <input type="range" min={0.5} max={2} step={0.05} value={form.voiceRate} onChange={(e) => set('voiceRate', Number(e.target.value))} />
          </label>
          <label>Pitch ({form.voicePitch.toFixed(2)}; lower sounds deeper)
            <input type="range" min={0.5} max={2} step={0.05} value={form.voicePitch} onChange={(e) => set('voicePitch', Number(e.target.value))} />
          </label>
        </div>
        <div className="row">
          <button
            type="button"
            className="btn ghost small"
            disabled={!canSpeak()}
            onClick={() => speak('Hello boss! I am Siva, your security buddy. Tell me what to check, and I will explain everything clearly. No tension.', { rate: form.voiceRate, pitch: form.voicePitch, lang: form.voiceLang, voiceName: form.voiceName, gender: form.voiceGender ?? 'male' })}
          >
            ▶ Test voice
          </button>
          <span className="hint">Best man&apos;s voice: open Siva in Microsoft Edge — it picks “Microsoft Prabhat Online (Natural) - English (India)” automatically. On Windows you can also add the English (India) speech pack (Settings → Time &amp; language → Speech) to get “Microsoft Ravi”. If no male voice exists, Siva lowers the nearest voice so it still sounds like a man.</span>
        </div>

        <h2 className="panel-title">My voice commands</h2>
        <p className="hint">Siva follows these exactly, before anything else. “After Hey Siva” phrases work as “Hey Siva, wake up”. “Stop reading” phrases work while he is talking — say them and he stops. He never greets you on his own; greetings come only from here.</p>
        <div className="vc-list">
          {(form.voiceCommands ?? DEFAULT_VOICE_COMMANDS).map((c, i) => {
            const list = form.voiceCommands ?? DEFAULT_VOICE_COMMANDS;
            const upd = (patch: Partial<VoiceCommand>) => set('voiceCommands', list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            return (
              <div key={i} className="vc-row">
                <label>When I say
                  <input value={c.phrase} maxLength={80} onChange={(e) => upd({ phrase: e.target.value })} placeholder="wake up" />
                </label>
                <label>Type
                  <select value={c.action === 'stop' ? 'stop' : c.needsWake ? 'wake' : 'any'} onChange={(e) => upd(e.target.value === 'stop' ? { action: 'stop', reply: '', needsWake: false, whileSpeaking: true } : { action: 'say', needsWake: e.target.value === 'wake', whileSpeaking: false, reply: c.reply || 'Okay boss' })}>
                    <option value="wake">Reply (after “Hey Siva”)</option>
                    <option value="any">Reply (anytime I talk to him)</option>
                    <option value="stop">Stop reading</option>
                  </select>
                </label>
                <label>Siva says
                  <input value={c.reply} maxLength={300} disabled={c.action === 'stop'} onChange={(e) => upd({ reply: e.target.value })} placeholder={c.action === 'stop' ? '(stops talking)' : 'Good morning boss'} />
                </label>
                <button type="button" className="btn ghost small" onClick={() => set('voiceCommands', list.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
              </div>
            );
          })}
        </div>
        <div className="row">
          <button type="button" className="btn ghost small" onClick={() => set('voiceCommands', [...(form.voiceCommands ?? DEFAULT_VOICE_COMMANDS), { phrase: '', reply: '', action: 'say', needsWake: true, whileSpeaking: false }])}>＋ Add a phrase</button>
          <button type="button" className="btn ghost small" onClick={() => set('voiceCommands', DEFAULT_VOICE_COMMANDS)}>Reset to my defaults</button>
        </div>

        <div className="row">
          <button className="btn primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
          {msg && <span className={msg.ok ? 'ok-text' : 'inline-error'}>{msg.text}</span>}
        </div>
      </form>

      <section className="panel">
        <h2 className="panel-title">Connections</h2>
        <ul className="bullets">
          <li>Gemini API: {status?.aiConfigured ? <b className="ok-text">configured ({status.aiModel})</b> : <b className="warn-text">not configured. Add GEMINI_API_KEY to .env.local and restart.</b>}</li>
          <li>NVD API key: {status?.nvdKeyConfigured ? <b className="ok-text">configured</b> : <span className="muted">not set (optional; CVSS lookups are slower)</span>}</li>
          <li>CISA KEV, RSS feeds, Hacker News, ransomware.live, MITRE ATT&amp;CK and MISP galaxy: no key needed.</li>
          <li>Article reader: {status?.scraperApiConfigured ? <b className="ok-text">via ScraperAPI</b> : <span className="muted">direct (optional SCRAPERAPI_KEY for sites that block simple requests)</span>}</li>
          <li>Hacker News: {status?.hackerNewsEnabled === false ? 'off' : 'on'} · ransomware.live: {status?.ransomwareLiveEnabled === false ? 'off' : 'on'} · Threat intel matching: {status?.intelEnabled === false ? 'off' : 'on'}</li>
          <li>Website scans: {status?.scanDomains ? `${status.scanDomains} authorised domain(s)` : <span className="muted">no domains authorised (SCAN_ALLOWED_DOMAINS)</span>}</li>
        </ul>
        <p className="hint">Keys live only in .env.local on your computer and are never sent to the browser.</p>
      </section>

      <section className="panel">
        <h2 className="panel-title">Voice compatibility</h2>
        <ul className="bullets">
          <li>Voice input (speech recognition) works in Chrome and Edge. Safari support is partial. Firefox does not support it.</li>
          <li>In Chrome, speech recognition sends audio to Google&apos;s speech service, so it needs internet access.</li>
          <li>Reading aloud (speech synthesis) works in all modern browsers. Available voices depend on your operating system.</li>
          <li>The microphone only works on http://localhost / 127.0.0.1 or on HTTPS sites.</li>
        </ul>
      </section>
    </div>
  );
}
