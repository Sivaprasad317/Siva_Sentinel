import { AbsoluteFill, Interactive, interpolate, useCurrentFrame } from "remotion";
import { Background } from "../components/Background";
import { Icon } from "../components/Icons";
import { C, CLAMP, EASE_OUT, GRADIENT, INTER, MONO } from "../theme";

const STEPS = [
  { icon: "rss", color: C.cyan, title: "Reads 150+ live sources", sub: "CISA KEV · NVD · vendor advisories · security news · ZeroHour" },
  { icon: "filter", color: C.blue, title: "Cleans & de-duplicates", sub: "Same story from 5 outlets → 1 story, 5 sources" },
  { icon: "link", color: C.purple, title: "Links CVEs to real exploitation", sub: "CISA Known Exploited Vulnerabilities + NVD CVSS" },
  { icon: "rank", color: C.pink, title: "Ranks by real-world risk", sub: "Fixed, testable rules, before any AI is involved" },
  { icon: "spark", color: C.amber, title: "Explains it in plain English", sub: "Google Gemini summaries, every claim linked to evidence" },
  { icon: "mic", color: C.green, title: "Briefs you by voice", sub: "Plus a live 3D dashboard and daily reports" },
];

export const Pipeline: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ isolation: "isolate", fontFamily: INTER, color: C.fg, padding: "110px 80px" }}>
      <Background glow={C.blue} />
      <Interactive.Div name="Eyebrow" style={{ fontFamily: MONO, fontSize: 26, letterSpacing: 4, color: C.cyan, opacity: interpolate(frame, [0, 12], [0, 1], CLAMP) }}>
        HOW SIVA THINKS
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
        From noise to{" "}
        <span style={{ backgroundImage: GRADIENT, backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent" }}>a briefing</span>
      </Interactive.Div>
      <div style={{ position: "relative", marginTop: 56 }}>
        <div
          style={{
            position: "absolute",
            left: 47,
            top: 40,
            width: 4,
            height: interpolate(frame, [20, 20 + STEPS.length * 22], [0, 820], CLAMP),
            backgroundImage: `linear-gradient(${C.cyan}, ${C.purple}, ${C.green})`,
            borderRadius: 2,
          }}
        />
        {STEPS.map((s, i) => {
          const at = 22 + i * 22;
          return (
            <div
              key={s.title}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 34,
                marginBottom: 34,
                opacity: interpolate(frame, [at, at + 10], [0, 1], CLAMP),
                translate: interpolate(frame, [at, at + 16], ["60px 0px", "0px 0px"], { ...CLAMP, easing: EASE_OUT }),
              }}
            >
              <div
                style={{
                  width: 98,
                  height: 98,
                  flexShrink: 0,
                  borderRadius: 26,
                  backgroundColor: C.bg2,
                  border: `2px solid ${s.color}`,
                  boxShadow: `0 0 30px ${s.color}55`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={s.icon} color={s.color} size={50} />
              </div>
              <div>
                <div style={{ fontSize: 44, fontWeight: 700 }}>{s.title}</div>
                <div style={{ fontSize: 28, color: C.muted, marginTop: 6 }}>{s.sub}</div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
