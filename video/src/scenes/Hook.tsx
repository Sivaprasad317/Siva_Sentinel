import { AbsoluteFill, Interactive, interpolate, random, useCurrentFrame } from "remotion";
import { Background } from "../components/Background";
import { C, CLAMP, EASE_OUT, GRADIENT, INTER, MONO } from "../theme";

const HEADLINES = [
  ["CISA", "Zero-day under active attack"],
  ["NVD", "Critical CVE · CVSS 9.8"],
  ["BleepingComputer", "Ransomware gang claims new victim"],
  ["The Hacker News", "New phishing kit targets banks"],
  ["SecurityWeek", "Patch now: VPN appliance flaw"],
  ["Krebs on Security", "Data breach exposes millions"],
  ["Microsoft", "Out-of-band security update"],
  ["Cisco PSIRT", "Firewall advisory published"],
  ["Dark Reading", "APT campaign uses new loader"],
  ["AWS", "Cloud misconfiguration warning"],
];

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ isolation: "isolate", fontFamily: INTER, color: C.fg }}>
      <Background glow={C.red} />
      {HEADLINES.map(([src, title], i) => {
        const start = i * 5;
        const x = 60 + random(`hx${i}`) * 380;
        const y = 120 + i * 108;
        return (
          <div
            key={title}
            style={{
              position: "absolute",
              left: x,
              top: y,
              padding: "16px 24px",
              borderRadius: 14,
              backgroundColor: C.panel,
              border: `1.5px solid ${i % 3 === 0 ? C.red : C.line2}`,
              fontSize: 30,
              whiteSpace: "nowrap",
              opacity: interpolate(frame, [start, start + 8, 60, 80], [0, 1, 1, 0.12], CLAMP),
              translate: interpolate(frame, [start, start + 12], ["80px 0px", "0px 0px"], { ...CLAMP, easing: EASE_OUT }),
              filter: `blur(${interpolate(frame, [60, 80], [0, 6], CLAMP)}px)`,
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: 22, color: i % 3 === 0 ? C.red : C.amber, marginRight: 14 }}>{src.toUpperCase()}</span>
            {title}
          </div>
        );
      })}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 90, textAlign: "center" }}>
        <Interactive.Div
          name="Hook line 1"
          style={{
            fontSize: 62,
            fontWeight: 600,
            color: C.muted,
            opacity: interpolate(frame, [62, 74], [0, 1], CLAMP),
            translate: interpolate(frame, [62, 78], ["0px 30px", "0px 0px"], { ...CLAMP, easing: EASE_OUT }),
          }}
        >
          Hundreds of security headlines every day.
        </Interactive.Div>
        <Interactive.Div
          name="Hook line 2"
          style={{
            marginTop: 30,
            fontSize: 104,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: -2,
            opacity: interpolate(frame, [76, 88], [0, 1], CLAMP),
            scale: interpolate(frame, [76, 96], [0.85, 1], { ...CLAMP, easing: EASE_OUT }),
          }}
        >
          Which ones{" "}
          <span style={{ backgroundImage: GRADIENT, backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent" }}>actually matter?</span>
        </Interactive.Div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
