import { AbsoluteFill, Interactive, interpolate, useCurrentFrame } from "remotion";
import { Background } from "../components/Background";
import { Orb } from "../components/Orb";
import { C, CLAMP, EASE_OUT, GRADIENT, INTER, MONO } from "../theme";

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ isolation: "isolate", fontFamily: INTER, color: C.fg, alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <Background />
      <div style={{ opacity: interpolate(frame, [0, 15], [0, 1], CLAMP) }}>
        <Orb size={420} level={0.15 + 0.1 * Math.sin(frame / 8)} />
      </div>
      <Interactive.Div
        name="Brand"
        style={{
          fontSize: 92,
          fontWeight: 800,
          letterSpacing: 6,
          marginTop: 10,
          opacity: interpolate(frame, [8, 22], [0, 1], CLAMP),
          translate: interpolate(frame, [8, 28], ["0px 30px", "0px 0px"], { ...CLAMP, easing: EASE_OUT }),
        }}
      >
        SIVA <span style={{ backgroundImage: GRADIENT, backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent" }}>SENTINEL</span>
      </Interactive.Div>
      <Interactive.Div name="Line" style={{ fontSize: 50, fontWeight: 600, marginTop: 26, opacity: interpolate(frame, [22, 36], [0, 1], CLAMP) }}>
        Less noise. Faster decisions.
      </Interactive.Div>
      <Interactive.Div name="Stack" style={{ fontSize: 30, color: C.muted, marginTop: 24, opacity: interpolate(frame, [32, 46], [0, 1], CLAMP) }}>
        Next.js · three.js · Google Gemini · CISA KEV · NVD
      </Interactive.Div>
      <Interactive.Div
        name="Repo"
        style={{
          marginTop: 60,
          padding: "22px 40px",
          borderRadius: 60,
          border: `2px solid ${C.purple}`,
          backgroundColor: C.panel,
          fontFamily: MONO,
          fontSize: 32,
          boxShadow: `0 0 40px ${C.purple}55`,
          opacity: interpolate(frame, [44, 58], [0, 1], CLAMP),
          scale: interpolate(frame, [44, 64], [0.85, 1], { ...CLAMP, easing: EASE_OUT }),
        }}
      >
        github.com/Sivaprasad317/Siva_Sentinel
      </Interactive.Div>
    </AbsoluteFill>
  );
};
