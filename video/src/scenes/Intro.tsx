import { AbsoluteFill, Interactive, interpolate, useCurrentFrame } from "remotion";
import { Background } from "../components/Background";
import { Orb } from "../components/Orb";
import { C, CLAMP, EASE_OUT, GRADIENT, INTER, MONO } from "../theme";

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ isolation: "isolate", fontFamily: INTER, color: C.fg, alignItems: "center", justifyContent: "center" }}>
      <Background />
      <div
        style={{
          opacity: interpolate(frame, [0, 15], [0, 1], CLAMP),
          scale: interpolate(frame, [0, 30], [0.6, 1], { ...CLAMP, easing: EASE_OUT }),
        }}
      >
        <Orb size={560} level={interpolate(frame, [0, 20, 40], [0.8, 0.4, 0.1], CLAMP)} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 10 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            backgroundColor: C.green,
            boxShadow: `0 0 30px ${C.green}`,
            opacity: interpolate(frame, [12, 20], [0, 1], CLAMP),
          }}
        />
        <Interactive.Div
          name="Brand"
          style={{
            fontSize: 96,
            fontWeight: 800,
            letterSpacing: 8,
            opacity: interpolate(frame, [12, 26], [0, 1], CLAMP),
            translate: interpolate(frame, [12, 32], ["0px 30px", "0px 0px"], { ...CLAMP, easing: EASE_OUT }),
          }}
        >
          SIVA{" "}
          <span style={{ backgroundImage: GRADIENT, backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent" }}>SENTINEL</span>
        </Interactive.Div>
      </div>
      <Interactive.Div
        name="Expansion"
        style={{
          fontFamily: MONO,
          fontSize: 28,
          letterSpacing: 3,
          color: C.muted,
          marginTop: 18,
          opacity: interpolate(frame, [26, 40], [0, 1], CLAMP),
        }}
      >
        SECURITY INTELLIGENCE & VIGILANCE ASSISTANT
      </Interactive.Div>
      <Interactive.Div
        name="Tagline"
        style={{
          fontSize: 54,
          fontWeight: 600,
          marginTop: 56,
          opacity: interpolate(frame, [42, 56], [0, 1], CLAMP),
          translate: interpolate(frame, [42, 60], ["0px 24px", "0px 0px"], { ...CLAMP, easing: EASE_OUT }),
        }}
      >
        Your voice-first cyber threat analyst.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
