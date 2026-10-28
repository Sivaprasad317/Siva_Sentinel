// The spoken lines and when they happen inside the VoiceDemo scene (frames at 30 fps).
// If you record or generate new audio, put it in public/voice/ and adjust the timings here.
export const USER_LINE = "Hey Siva, what's today's updates?";
export const SIVA_LINE =
  "Good morning, Boss. Today, one critical flaw is being actively exploited, and it's on the CISA KEV list. A ransomware group claimed new victims, and a phishing wave is targeting banks. Patch the VPN flaw first.";

export const VOICE = {
  userStart: 45,
  userEnd: 120,
  chime: 128,
  sivaStart: 165,
  sivaEnd: 585,
  duration: 615,
};
