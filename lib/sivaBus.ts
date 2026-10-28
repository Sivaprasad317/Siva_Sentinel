// A tiny in-page event bus so the landing page (Siva's presenter) and the voice engine (HomeView)
// can talk without being nested: who is speaking, what was heard, what Siva said, "greet now".
export type SivaEvent =
  | { type: 'state'; state: 'idle' | 'listening' | 'thinking' | 'speaking' }
  | { type: 'said'; text: string }
  | { type: 'heard'; text: string }
  | { type: 'greet' }
  /** ask the app to show the landing presenter (then greet) */
  | { type: 'open' }
  /** the landing presenter is (not) on screen */
  | { type: 'presenter'; on: boolean }
  /** microphone status: is "Hey Siva" really listening, and why not */
  | { type: 'mic'; listening: boolean; problem: string }
  /** the big mic on Home was pressed (talk now) / the keyboard button was pressed */
  | { type: 'mic-click' }
  | { type: 'typing' }
  /** live text while you speak (interim speech-to-text) */
  | { type: 'interim'; text: string };

const NAME = 'siva-bus';

// The latest status events are remembered, so a page that appears later still knows
// whether the microphone is listening right now.
const last: Partial<Record<SivaEvent['type'], SivaEvent>> = {};

export function emitSiva(e: SivaEvent) {
  if (e.type === 'mic' || e.type === 'state') last[e.type] = e;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<SivaEvent>(NAME, { detail: e }));
}

export function onSiva(fn: (e: SivaEvent) => void, replay: SivaEvent['type'][] = ['mic', 'state']): () => void {
  if (typeof window === 'undefined') return () => undefined;
  for (const k of replay) if (last[k]) fn(last[k]!);
  const h = (ev: Event) => fn((ev as CustomEvent<SivaEvent>).detail);
  window.addEventListener(NAME, h);
  return () => window.removeEventListener(NAME, h);
}

/** 0-100 threat level for the gauge, with a plain-English label. */
export function threatLevel(s: { critical: number; kev: number; high?: number }): { value: number; label: string } {
  const v = Math.max(0, Math.min(100, Math.round(12 + s.critical * 9 + s.kev * 7 + (s.high ?? 0) * 1.5)));
  const label = v >= 85 ? 'Severe' : v >= 65 ? 'High' : v >= 45 ? 'Elevated' : v >= 25 ? 'Guarded' : 'Low';
  return { value: v, label };
}
