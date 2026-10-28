import { Audio } from "@remotion/media";
import { AbsoluteFill, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Background } from "../components/Background";
import { Icon } from "../components/Icons";
import { Orb } from "../components/Orb";
import { Waveform } from "../components/Waveform";
import { SIVA_LINE, USER_LINE, VOICE } from "../script";
import { C, CLAMP, EASE_OUT, GRADIENT, INTER, MONO } from "../theme";

const WORDS = SIVA_LINE.split(" ");
const TOTAL_CHARS = WORDS.reduce((n, w) => n + w.length + 1, 0);
/** Frame at which each word of Siva's reply starts (spread by word length). */
const WORD_AT = (() => {
  let chars = 0;
  return WORDS.map((w) => {
    const at = VOICE.sivaStart + (chars / TOTAL_CHARS) * (VOICE.sivaEnd - VOICE.sivaStart);
    chars += w.length + 1;
    return at;
  });
})();

const CARDS: { at: number; tag: string; color: string; text: string }[] = [
  { at: 0.12, tag: "CRITICAL · CISA KEV", color: C.red, text: "Flaw actively exploited in the wild" },
  { at: 0.5, tag: "HIGH · RANSOMWARE", color: C.amber, text: "Group claims new victims" },
  { at: 0.68, tag: "MEDIUM · PHISHING", color: C.yellow, text: "Wave targeting banks" },
  { at: 0.86, tag: "DO THIS FIRST", color: C.green, text: "Patch the exploited VPN flaw" },
];

export const VoiceDemo: React.FC<{ withVoice?: boolean }> = ({ withVoice = false }) => {
  const frame = useCurrentFrame();
  const listening = frame >= VOICE.userStart - 10 && frame < VOICE.userEnd + 5;
  const thinking = frame >= VOICE.userEnd + 5 && frame < VOICE.sivaStart;
  const speaking = frame >= VOICE.sivaStart && frame < VOICE.sivaEnd;
  const userLevel = frame >= VOICE.userStart && frame < VOICE.userEnd ? 0.55 + 0.45 * Math.abs(Math.sin(frame * 0.4)) : 0;
  const sivaLevel = speaking ? 0.45 + 0.4 * Math.abs(Math.sin(frame * 0.33)) * Math.abs(Math.sin(frame * 0.11 + 1)) : 0;
  const orbColor = listening ? C.pink : thinking ? C.cyan : C.purple;
  const status = listening ? "Listening…" : thinking ? "Thinking…" : speaking ? "Speaking" : frame < VOICE.userStart ? "Say “Hey Siva”" : "Briefing ready";
  const userWords = USER_LINE.split(" ");
  const progress = (frame - VOICE.sivaStart) / (VOICE.sivaEnd - VOICE.sivaStart);

  return (
    <AbsoluteFill style={{ isolation: "isolate", fontFamily: INTER, color: C.fg }}>
      <Background glow={orbColor} />
      {withVoice && (
        <>
          <Audio src={staticFile("voice/user.wav")} from={VOICE.userStart} name="User voice" />
          <Audio src={staticFile("voice/siva.wav")} from={VOICE.sivaStart} name="Siva voice" />
        </>
      )}
      <Sequence from={VOICE.chime} durationInFrames={30} layout="none">
        <Audio src={staticFile("sfx/chime.wav")} volume={0.7} />
      </Sequence>

      {/* Top bar: mimics the app's home screen */}
      <div style={{ position: "absolute", top: 70, left: 80, right: 80, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 22px", borderRadius: 40, border: `1.5px solid ${C.line2}`, fontSize: 26, color: C.green }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: C.green }} />
          LIVE
        </div>
        <div style={{ fontFamily: MONO, fontSize: 26, color: C.muted }}>07:30 · Daily briefing</div>
      </div>

      <div style={{ position: "absolute", top: 110, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Orb size={480} level={Math.max(userLevel * 0.7, sivaLevel, thinking ? 0.25 : 0.05)} spin={thinking ? 4 : speaking ? 1.6 : 1} color={orbColor} />
      </div>

      <div style={{ position: "absolute", top: 600, left: 0, right: 0, textAlign: "center" }}>
        <div style={{ fontSize: 72, fontWeight: 800, letterSpacing: -1 }}>
          Good morning,{" "}
          <span style={{ backgroundImage: GRADIENT, backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent" }}>Boss</span>
        </div>
        <div style={{ fontSize: 34, color: listening ? C.pink : thinking ? C.cyan : C.muted, marginTop: 10, fontWeight: 600 }}>{status}</div>
      </div>

      {/* User question bubble */}
      <div
        style={{
          position: "absolute",
          top: 790,
          right: 80,
          maxWidth: 820,
          padding: "26px 34px",
          borderRadius: "34px 34px 8px 34px",
          backgroundImage: `linear-gradient(135deg, ${C.pink}, ${C.purple})`,
          fontSize: 46,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          gap: 20,
          opacity: interpolate(frame, [VOICE.userStart - 8, VOICE.userStart, VOICE.sivaStart + 30, VOICE.sivaStart + 45], [0, 1, 1, 0], CLAMP),
          translate: interpolate(frame, [VOICE.userStart - 8, VOICE.userStart + 6], ["0px 40px", "0px 0px"], { ...CLAMP, easing: EASE_OUT }),
        }}
      >
        <Icon name="mic" color="#fff" size={46} />
        <span>
          {userWords.map((w, i) => {
            const at = VOICE.userStart + (i / userWords.length) * (VOICE.userEnd - VOICE.userStart);
            return (
              <span key={i} style={{ opacity: frame >= at ? 1 : 0.25 }}>
                {w}{" "}
              </span>
            );
          })}
        </span>
      </div>
      <div style={{ position: "absolute", top: 940, right: 100, opacity: listening ? 1 : 0 }}>
        <Waveform active={userLevel} color={C.pink} />
      </div>

      {/* Siva's reply: karaoke captions + priority cards */}
      <div
        style={{
          position: "absolute",
          top: 770,
          left: 80,
          right: 80,
          opacity: interpolate(frame, [VOICE.sivaStart + 30, VOICE.sivaStart + 45], [0, 1], CLAMP),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: MONO, fontSize: 24, color: C.purple, letterSpacing: 2, marginBottom: 14 }}>
          <Waveform active={sivaLevel} color={C.purple} bars={10} height={34} />
          SIVA
        </div>
        <div style={{ fontSize: 40, lineHeight: 1.35, fontWeight: 600, height: 112, overflow: "hidden" }}>
          {(() => {
            // Show the reply 10 words at a time, highlighting each word as it is spoken.
            const current = Math.max(0, WORD_AT.filter((t) => frame >= t).length - 1);
            const startIdx = Math.floor(current / 10) * 10;
            return WORDS.slice(startIdx, startIdx + 10).map((w, j) => {
              const i = startIdx + j;
              return (
                <span key={i} style={{ color: frame >= WORD_AT[i] ? C.fg : C.line2 }}>
                  {w}{" "}
                </span>
              );
            });
          })()}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 20 }}>
          {CARDS.map((c) => {
            const at = VOICE.sivaStart + c.at * (VOICE.sivaEnd - VOICE.sivaStart);
            return (
              <div
                key={c.tag}
                style={{
                  padding: "20px 24px",
                  borderRadius: 18,
                  backgroundColor: C.panel,
                  border: `1.5px solid ${c.color}66`,
                  borderLeft: `8px solid ${c.color}`,
                  opacity: interpolate(frame, [at, at + 10], [0, 1], CLAMP),
                  scale: interpolate(frame, [at, at + 14], [0.85, 1], { ...CLAMP, easing: EASE_OUT }),
                }}
              >
                <div style={{ fontFamily: MONO, fontSize: 21, color: c.color, letterSpacing: 1, marginBottom: 8 }}>{c.tag}</div>
                <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.2 }}>{c.text}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 40, left: 0, right: 0, textAlign: "center", fontSize: 22, color: C.muted, opacity: progress > 0 ? 0.8 : 0 }}>
        Illustration of a briefing · real briefings come from live sources
      </div>
    </AbsoluteFill>
  );
};
