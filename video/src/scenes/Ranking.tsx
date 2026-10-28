import { AbsoluteFill, Interactive, interpolate, useCurrentFrame } from "remotion";
import { Background } from "../components/Background";
import { C, CLAMP, EASE_OUT, GRADIENT, INTER, MONO } from "../theme";

// The real scoring rules from lib/prioritize.ts.
const RULES = [
  { label: "Confirmed exploited (CISA KEV)", points: 50, color: C.red },
  { label: "Exploitation reported in the news", points: 25, color: C.pink },
  { label: "Reported by several outlets", points: 15, color: C.purple },
  { label: "Ransomware involved", points: 12, color: C.amber },
  { label: "CVSS 9 or higher", points: 10, color: C.blue },
];

export const Ranking: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ isolation: "isolate", fontFamily: INTER, color: C.fg, padding: "120px 80px" }}>
      <Background glow={C.red} />
      <Interactive.Div name="Eyebrow" style={{ fontFamily: MONO, fontSize: 26, letterSpacing: 4, color: C.red, opacity: interpolate(frame, [0, 12], [0, 1], CLAMP) }}>
        PRIORITY SCORE
      </Interactive.Div>
      <Interactive.Div
        name="Title"
        style={{
          fontSize: 84,
          fontWeight: 800,
          letterSpacing: -2,
          lineHeight: 1.05,
          marginTop: 14,
          opacity: interpolate(frame, [4, 18], [0, 1], CLAMP),
          translate: interpolate(frame, [4, 24], ["0px 30px", "0px 0px"], { ...CLAMP, easing: EASE_OUT }),
        }}
      >
        Exploitation first.{" "}
        <span style={{ backgroundImage: GRADIENT, backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent" }}>Not just CVSS.</span>
      </Interactive.Div>
      <div style={{ marginTop: 70 }}>
        {RULES.map((r, i) => {
          const at = 26 + i * 14;
          const grow = interpolate(frame, [at, at + 30], [0, 1], { ...CLAMP, easing: EASE_OUT });
          return (
            <div key={r.label} style={{ marginBottom: 40, opacity: interpolate(frame, [at, at + 8], [0, 1], CLAMP) }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 38, fontWeight: 600, marginBottom: 14 }}>
                <span>{r.label}</span>
                <span style={{ fontFamily: MONO, color: r.color, fontWeight: 700 }}>+{Math.round(r.points * grow)}</span>
              </div>
              <div style={{ height: 22, borderRadius: 11, backgroundColor: C.line }}>
                <div style={{ height: 22, borderRadius: 11, width: `${(r.points / 50) * 100 * grow}%`, backgroundColor: r.color, boxShadow: `0 0 24px ${r.color}88` }} />
              </div>
            </div>
          );
        })}
      </div>
      <Interactive.Div
        name="Footnote"
        style={{ fontSize: 34, color: C.muted, marginTop: 20, lineHeight: 1.35, opacity: interpolate(frame, [110, 125], [0, 1], CLAMP) }}
      >
        A high CVSS score alone can never make a story “critical”.{" "}
        <span style={{ color: C.fg, fontWeight: 600 }}>Real-world attacks do.</span>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
