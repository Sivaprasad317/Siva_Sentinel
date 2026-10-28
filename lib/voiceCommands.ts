// Your own voice phrases. Siva follows them exactly, before anything else, without asking the AI:
//   "Hey Siva, wake up"           -> "Good morning boss"
//   "Hey Siva, how was the day"   -> "Good evening boss, day was good"
//   "Cool" (while he is reading)  -> he stops talking
// Editable in Settings → My voice commands. Pure functions (tested).

export interface VoiceCommand {
  /** what you say (after "Hey Siva" when needsWake is true) */
  phrase: string;
  /** what Siva says back (empty for "stop") */
  reply: string;
  /** 'say' = speak the reply; 'stop' = stop talking */
  action: 'say' | 'stop';
  /** true = only after "Hey Siva" (or within the follow-up window) */
  needsWake: boolean;
  /** true = works while Siva is talking (barge-in), e.g. "Cool" to stop reading */
  whileSpeaking: boolean;
}

export const DEFAULT_VOICE_COMMANDS: VoiceCommand[] = [
  { phrase: 'wake up', reply: 'Good morning boss', action: 'say', needsWake: true, whileSpeaking: false },
  { phrase: 'how was the day', reply: 'Good evening boss, day was good', action: 'say', needsWake: true, whileSpeaking: false },
  { phrase: 'cool', reply: '', action: 'stop', needsWake: false, whileSpeaking: true },
];

/** Always-on ways to stop him mid-sentence, in addition to your own "stop" phrases. */
export const BUILTIN_STOP_WORDS = ['stop', 'siva stop', 'stop it', 'enough', 'ok stop', 'okay stop', 'be quiet', 'quiet'];

const FILLER = new Set(['please', 'siva', 'shiva', 'boss', 'hey', 'hi', 'ok', 'okay', 'now', 'just', 'so', 'the', 'a', 'an', 'yaar', 'na']);

export function normalizePhrase(s: string): string {
  return s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const content = (s: string) => normalizePhrase(s).split(' ').filter((w) => w && !FILLER.has(w));

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** Does what was heard mean this phrase? Tolerates fillers ("please", "boss") and small mis-hearings. */
export function phraseMatches(heard: string, phrase: string): boolean {
  const h = content(heard);
  const p = content(phrase);
  if (!p.length || !h.length) return false;
  const hs = h.join(' ');
  const ps = p.join(' ');
  if (hs === ps) return true;
  // Close spelling overall ("how was the day" ~ "how was your day", "cool" ~ "kool").
  const d = editDistance(hs, ps);
  if (d <= Math.max(1, Math.floor(ps.length * 0.2))) return true;
  // Word overlap (phrases of 3+ words): nearly all phrase words heard, and at most one extra word.
  if (p.length < 3) return false;
  const hit = p.filter((w) => h.some((x) => x === w || (w.length > 3 && editDistance(x, w) <= 1))).length;
  return hit / p.length >= 0.75 && h.length - p.length <= 1;
}

/**
 * Find the command for something you said.
 * mode 'normal'  = Siva is not talking: commands that need the wake word only count if woke is true.
 * mode 'speaking' = Siva is talking: only barge-in commands (and the built-in stop words) count.
 */
export function matchVoiceCommand(heard: string, cmds: VoiceCommand[], mode: 'normal' | 'speaking', woke = false): VoiceCommand | null {
  if (mode === 'speaking') {
    const words = content(heard);
    if (!words.length || words.length > 4) return null; // a stop word is short; long text is probably Siva's own voice
    for (const c of cmds) if (c.whileSpeaking && phraseMatches(heard, c.phrase)) return c;
    for (const w of BUILTIN_STOP_WORDS) if (phraseMatches(heard, w)) return { phrase: w, reply: '', action: 'stop', needsWake: false, whileSpeaking: true };
    return null;
  }
  for (const c of cmds) {
    if (c.action === 'stop') continue; // stop phrases only matter while he is talking
    if (c.needsWake && !woke) continue;
    if (phraseMatches(heard, c.phrase)) return c;
  }
  return null;
}

/** Ignore Siva hearing himself: a "stop word" that is part of the sentence he is saying right now. */
export function isOwnEcho(heard: string, speakingText: string): boolean {
  const h = normalizePhrase(heard);
  if (!h) return false;
  return ` ${normalizePhrase(speakingText)} `.includes(` ${h} `);
}

/** Validate commands sent from Settings. */
export function validateVoiceCommands(v: unknown): VoiceCommand[] | null {
  if (!Array.isArray(v) || v.length > 30) return null;
  const out: VoiceCommand[] = [];
  for (const x of v) {
    const c = x as Partial<VoiceCommand>;
    if (typeof c.phrase !== 'string' || !normalizePhrase(c.phrase) || c.phrase.length > 80) return null;
    if (typeof c.reply !== 'string' || c.reply.length > 300) return null;
    if (c.action !== 'say' && c.action !== 'stop') return null;
    if (c.action === 'say' && !c.reply.trim()) return null;
    out.push({ phrase: c.phrase.trim(), reply: c.reply.trim(), action: c.action, needsWake: Boolean(c.needsWake), whileSpeaking: Boolean(c.whileSpeaking) });
  }
  return out;
}

/** Siva only greets when YOU ask him to (your phrases). Remove automatic greetings from spoken text. */
export function stripGreeting(text: string): string {
  return text.replace(/^\s*(?:(?:good\s+(?:morning|afternoon|evening|night)|hello|hi|hey|namaste(?:ji)?)\b[\s,]*(?:boss|sir|siva|there|friend)?[\s,.!:;-]*)+/i, '').replace(/^\s+/, '');
}
