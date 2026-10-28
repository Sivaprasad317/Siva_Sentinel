// The spoken lines and when they happen inside the VoiceDemo scene (frames at 30 fps).
// After changing a line, run scripts/make-voice.sh to regenerate the audio and the timings.
import timing from "./voice-timing.json";

export const USER_LINE = "Hey Siva, what's today's updates?";
export const SIVA_LINE =
  "Good morning, Boss. Today, one critical flaw is being actively exploited, and it's on the CISA KEV list. A ransomware group claimed new victims, and a phishing wave is targeting banks. Patch the VPN flaw first.";

// Measured from the audio by scripts/align-voice.mjs (run by scripts/make-voice.sh).
const FPS = 30;
const userStart = 45;
const userEnd = userStart + Math.ceil(timing.userDuration * FPS);
const sivaStart = userEnd + 40;
const sivaEnd = sivaStart + Math.ceil(timing.sivaDuration * FPS);

export const VOICE = {
  userStart,
  userEnd,
  chime: userEnd + 8,
  sivaStart,
  sivaEnd,
  duration: sivaEnd + 35,
};

/** Frame (inside the VoiceDemo scene) at which each word of SIVA_LINE starts. */
export const WORD_FRAMES = timing.words.map((w) => sivaStart + Math.round(w.start * FPS));
