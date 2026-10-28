import { AbsoluteFill, Interactive, interpolate, useCurrentFrame } from "remotion";
import { Background } from "../components/Background";
import { Icon } from "../components/Icons";
import { C, CLAMP, EASE_OUT, GRADIENT, INTER, MONO } from "../theme";

const FEATURES = [
  { icon: "mic", color: C.pink, title: "Hands-free “Hey Siva”", sub: "Ask follow-ups by voice or text" },
  { icon: "globe", color: C.cyan, title: "3D threat globe & graph", sub: "Actors, malware, CVEs, vendors" },
  { icon: "brain", color: C.purple, title: "MITRE ATT&CK + MISP", sub: "Auto-links actors & techniques" },
  { icon: "clock", color: C.amber, title: "Daily 07:30 briefing", sub: "Plus live mode every hour" },
  { icon: "shield", color: C.green, title: "Read-only by design", sub: "Never scans or changes your systems" },
  { icon: "check", color: C.blue, title: "174 automated tests", sub: "Ranking rules you can verify" },
];

export const Features: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ isolation: "isolate", fontFamily: INTER, color: C.fg, padding: "120px 80px" }}>
      <Background glow={C.purple} />
      <Interactive.Div name="Eyebrow" style={{ fontFamily: MONO, fontSize: 26, letterSpacing: 4, color: C.purple, opacity: interpolate(frame, [0, 12], [0, 1], CLAMP) }}>
        WHAT'S INSIDE
      </Interactive.Div>
      <Interactive.Div
        name="Title"
        style={{
          fontSize: 84,
          fontWeight: 800,
          letterSpacing: -2,
          marginTop: 14,
          opacity: interpolate(frame, [4, 18], [0, 1], CLAMP),
          translate: interpolate(frame, [4, 24], ["0px 30px", "0px 0px"], { ...CLAMP, easing: EASE_OUT }),
        }}
      >
        Built for{" "}
        <span style={{ backgroundImage: GRADIENT, backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent" }}>defenders</span>
      </Interactive.Div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26, marginTop: 60 }}>
        {FEATURES.map((f, i) => {
          const at = 18 + i * 8;
          return (
            <div
              key={f.title}
              style={{
                padding: "34px 30px",
                borderRadius: 26,
                backgroundColor: C.panel,
                border: `1.5px solid ${C.line2}`,
                borderTop: `5px solid ${f.color}`,
                minHeight: 250,
                opacity: interpolate(frame, [at, at + 10], [0, 1], CLAMP),
                scale: interpolate(frame, [at, at + 16], [0.85, 1], { ...CLAMP, easing: EASE_OUT }),
              }}
            >
              <Icon name={f.icon} color={f.color} size={58} />
              <div style={{ fontSize: 38, fontWeight: 700, marginTop: 20, lineHeight: 1.15 }}>{f.title}</div>
              <div style={{ fontSize: 27, color: C.muted, marginTop: 10, lineHeight: 1.3 }}>{f.sub}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
