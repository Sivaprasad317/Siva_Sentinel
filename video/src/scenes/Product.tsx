import { AbsoluteFill, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Background } from "../components/Background";
import { C, CLAMP, EASE_OUT, INTER, MONO } from "../theme";

// Real screenshots of the app (captured with Playwright at 1600x1000, 2x).
const SHOTS = [
  { file: "shots/home.png", eyebrow: "VOICE-FIRST", title: "Just say “Hey Siva”", fx: 0.52, fy: 0.4, zoom: 1.45 },
  { file: "shots/dashboard.png", eyebrow: "DASHBOARD", title: "Live, ranked by risk", fx: 0.6, fy: 0.3, zoom: 1.6 },
  { file: "shots/sources.png", eyebrow: "158 SOURCES", title: "Feeds you control", fx: 0.5, fy: 0.62, zoom: 1.9 },
  { file: "shots/intel.png", eyebrow: "THREAT INTEL", title: "ATT&CK · MISP · OSINT", fx: 0.42, fy: 0.62, zoom: 1.8 },
];
export const SHOT_FRAMES = 78;

const Shot: React.FC<{ s: (typeof SHOTS)[number]; index: number }> = ({ s, index }) => {
  const frame = useCurrentFrame();
  const W = 940;
  const H = W * 0.625;
  const zoom = interpolate(frame, [8, SHOT_FRAMES], [1, s.zoom], { ...CLAMP, easing: EASE_OUT });
  return (
    <AbsoluteFill style={{ alignItems: "center", fontFamily: INTER, color: C.fg }}>
      <div style={{ position: "absolute", top: 150, left: 80, right: 80 }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 28,
            letterSpacing: 4,
            color: [C.pink, C.blue, C.cyan, C.purple][index],
            opacity: interpolate(frame, [0, 10], [0, 1], CLAMP),
          }}
        >
          {s.eyebrow}
        </div>
        <div
          style={{
            fontSize: 92,
            fontWeight: 800,
            letterSpacing: -2,
            marginTop: 10,
            opacity: interpolate(frame, [2, 14], [0, 1], CLAMP),
            translate: interpolate(frame, [2, 20], ["0px 30px", "0px 0px"], { ...CLAMP, easing: EASE_OUT }),
          }}
        >
          {s.title}
        </div>
      </div>
      <div style={{ position: "absolute", top: 500, perspective: 1600 }}>
        <div
          style={{
            width: W,
            borderRadius: 22,
            overflow: "hidden",
            border: `2px solid ${C.line2}`,
            backgroundColor: C.bg2,
            boxShadow: `0 40px 120px #000c, 0 0 80px ${C.purple}33`,
            transform: `rotateX(${interpolate(frame, [0, SHOT_FRAMES], [14, 4], CLAMP)}deg) rotateY(${interpolate(frame, [0, SHOT_FRAMES], [index % 2 ? 10 : -10, 0], CLAMP)}deg)`,
            opacity: interpolate(frame, [0, 10], [0, 1], CLAMP),
            translate: interpolate(frame, [0, 18], ["0px 120px", "0px 0px"], { ...CLAMP, easing: EASE_OUT }),
          }}
        >
          <div style={{ height: 44, display: "flex", alignItems: "center", gap: 10, padding: "0 18px", borderBottom: `1.5px solid ${C.line}` }}>
            {[C.red, C.amber, C.green].map((c) => (
              <div key={c} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: c }} />
            ))}
            <div style={{ marginLeft: 16, fontFamily: MONO, fontSize: 18, color: C.muted }}>127.0.0.1:3000</div>
          </div>
          <div style={{ width: W, height: H, overflow: "hidden" }}>
            <Img
              src={staticFile(s.file)}
              style={{ width: W, height: H, transformOrigin: `${s.fx * 100}% ${s.fy * 100}%`, scale: String(zoom) }}
            />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Product: React.FC = () => (
  <AbsoluteFill style={{ isolation: "isolate" }}>
    <Background />
    {SHOTS.map((s, i) => (
      <Sequence key={s.file} from={i * SHOT_FRAMES} durationInFrames={SHOT_FRAMES} name={s.eyebrow}>
        <Shot s={s} index={i} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
