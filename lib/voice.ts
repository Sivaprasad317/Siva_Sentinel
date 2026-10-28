// Browser-only voice helpers (Web Speech API).
// Speech RECOGNITION works in Chrome and Edge (desktop and Android). Safari has partial support.
// Firefox does not support it, so the text box is always available as a fallback.
// Speech SYNTHESIS (reading aloud) works in all modern browsers. Which voices exist depends on
// the browser and operating system. Siva speaks with an Indian MAN's voice by default. The most
// natural one is in Microsoft Edge: "Microsoft Prabhat Online (Natural) - English (India)".
// On Windows, the English (India) speech pack adds "Microsoft Ravi".

/* eslint-disable @typescript-eslint/no-explicit-any */
export type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  onstart?: (() => void) | null;
  onaudiostart?: (() => void) | null;
};

export function createRecognition(lang: string): RecognitionLike | null {
  if (typeof window === 'undefined') return null;
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) return null;
  const r: RecognitionLike = new Ctor();
  r.lang = lang;
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  return r;
}

/** A short two-note chime: instant "I heard you" feedback that does not need the mic to pause. */
export function chime() {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx: AudioContext = new AC();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime + i * 0.09;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.13);
    });
    setTimeout(() => void ctx.close(), 400);
  } catch {
    /* audio blocked: the visual "Listening…" still shows */
  }
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Minimal voice shape so the picker can be unit-tested without a browser. */
export interface VoiceLike {
  name: string;
  lang: string;
  localService?: boolean;
}

export type VoiceGender = 'male' | 'female';

// Known voices, best first: Indian English first, then other clear English voices.
const PREFERRED_MALE = [
  /prabhat/i, // Microsoft Prabhat Online (Natural) - English (India), Edge
  /\bravi\b/i, // Microsoft Ravi - English (India), Windows
  /\brishi\b/i, // Rishi - English (India), macOS/iOS
  /\b(hemant|madhur|kunal|aarav|arjun)\b/i, // other Indian male voices on some systems
  /google uk english male/i,
  /\b(guy|ryan|andrew|brian|christopher|eric|davis|thomas|george|daniel|david|mark|james|alex|fred|aaron|arthur|oliver|william|liam)\b/i,
  /\bmale\b/i,
];
const PREFERRED_FEMALE = [
  /neerja/i, // Microsoft Neerja (Natural) - English (India), Edge online voice
  /heera/i, // Microsoft Heera - English (India), Windows
  /veena/i, // Veena - English (India), macOS/iOS
  /\b(isha|kavya|ananya|aditi|raveena|swara)\b/i, // other en-IN female voices on some systems
  /google.*(india|हिन्दी)/i,
  /(aria|jenny|sonia|libby|natasha|samantha|karen|moira|tessa|serena|zira|hazel|susan)/i,
  /female|woman/i,
];
const MALE_HINT = /\b(male|ravi|prabhat|hemant|madhur|kunal|david|mark|guy|ryan|andrew|brian|eric|daniel|george|james|alex|fred|rishi|thomas|william|liam|oliver)\b/i;
const FEMALE_HINT = /\b(female|woman|neerja|heera|veena|isha|kavya|ananya|aditi|raveena|swara|aria|jenny|sonia|libby|natasha|samantha|karen|moira|tessa|serena|zira|hazel|susan|kalpana)\b|google.*(india|हिन्दी)/i;

/** Best guess of a voice's gender from its name ('unknown' when the name gives no hint). */
export function voiceGender(name: string): VoiceGender | 'unknown' {
  if (/\bfemale\b/i.test(name)) return 'female';
  if (MALE_HINT.test(name)) return 'male';
  if (FEMALE_HINT.test(name)) return 'female';
  return 'unknown';
}

/**
 * Choose the voice to use. A saved voice wins unless it is clearly the other gender (so an old saved
 * female voice does not override the new man's voice). Otherwise: the best Indian-English voice of
 * the wanted gender, then any English voice that is not clearly the other gender.
 */
export function pickVoice<V extends VoiceLike>(voices: V[], preferredName: string, lang: string, gender: VoiceGender = 'male'): V | null {
  if (!voices.length) return null;
  const other = (v: V) => {
    const g = voiceGender(v.name);
    return g !== 'unknown' && g !== gender;
  };
  if (preferredName) {
    const exact = voices.find((v) => v.name === preferredName);
    if (exact && !other(exact)) return exact;
  }
  for (const re of gender === 'male' ? PREFERRED_MALE : PREFERRED_FEMALE) {
    const hit = voices.find((v) => re.test(v.name) && !other(v) && /^(en|hi)/i.test(v.lang));
    if (hit) return hit;
  }
  return (
    voices.find((v) => v.lang === lang && !other(v)) ??
    voices.find((v) => v.lang.startsWith(lang.slice(0, 2)) && !other(v)) ??
    voices.find((v) => v.lang.startsWith('en')) ??
    voices[0]
  );
}

/**
 * Pitch to use. For a man's voice the pitch is capped at 1.0, and when no male voice exists on this
 * computer the nearest voice is lowered so it still sounds like a man.
 */
export function pitchFor(voiceName: string | undefined, wanted: number, gender: VoiceGender): number {
  if (gender !== 'male') return wanted;
  const g = voiceName ? voiceGender(voiceName) : 'unknown';
  if (g === 'male') return Math.min(wanted, 1);
  return Math.min(wanted, 0.72);
}

/** Voices load asynchronously in Chrome; this resolves once they are available (or after 1.5 s). */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!canSpeak()) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(synth.getVoices());
    synth.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
}

/** Chrome stops long utterances, so we speak in sentence-sized chunks. */
export function chunkText(text: string, max = 220): string[] {
  const sentences = text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*/g) ?? [text];
  const chunks: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > max && cur) {
      chunks.push(cur.trim());
      cur = '';
    }
    cur += s;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

export interface SpeakOptions {
  rate: number;
  lang: string;
  pitch?: number;
  voiceName?: string;
  /** 'male' (default) or 'female'. */
  gender?: VoiceGender;
  onStart?: () => void;
  onEnd?: () => void;
  /** Called on every spoken word (when the voice reports it) — drives the 3D lip movement. */
  onBoundary?: () => void;
}

/** Siva never says "Namaste" (older saved briefings may still contain it). */
export function stripNamaste(text: string): string {
  return text.replace(/\bnamaste(ji)?\b[\s,!.;:-]*/gi, '').replace(/^\s+/, '');
}

export function speak(text: string, opts: SpeakOptions) {
  if (!canSpeak()) {
    opts.onEnd?.();
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const clean = stripNamaste(text).replace(/https?:\/\/\S+/g, '').replace(/[*_#`>]/g, '');
  void loadVoices().then((voices) => {
    const gender = opts.gender ?? 'male';
    const voice = pickVoice(voices, opts.voiceName ?? '', opts.lang, gender);
    const pitch = pitchFor(voice?.name, opts.pitch ?? 1, gender);
    const parts = chunkText(clean);
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part);
      u.rate = opts.rate;
      u.pitch = pitch;
      u.lang = voice?.lang ?? opts.lang;
      if (voice) u.voice = voice;
      if (i === 0) u.onstart = () => opts.onStart?.();
      if (opts.onBoundary) u.onboundary = () => opts.onBoundary?.();
      if (i === parts.length - 1) {
        u.onend = () => opts.onEnd?.();
        u.onerror = () => opts.onEnd?.();
      }
      synth.speak(u);
    });
  });
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}
