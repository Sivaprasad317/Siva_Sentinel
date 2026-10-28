import { AbsoluteFill, random, useCurrentFrame } from "remotion";
import { C } from "../theme";

const DOTS = new Array(70).fill(0).map((_, i) => ({
  x: random(`x${i}`) * 1080,
  y: random(`y${i}`) * 1350,
  size: 3 + random(`s${i}`) * 5,
  speed: 0.15 + random(`v${i}`) * 0.4,
  color: [C.purple, C.blue, C.cyan, C.pink][Math.floor(random(`c${i}`) * 4)],
  phase: random(`p${i}`) * Math.PI * 2,
}));

/** Dark navy backdrop with drifting particles, like the app's Background3D. */
export const Background: React.FC<{ glow?: string }> = ({ glow = C.purple }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, overflow: "hidden", zIndex: -1 }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 700px at 50% 30%, ${glow}22, transparent 70%), radial-gradient(700px 500px at 85% 95%, ${C.blue}1c, transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${C.line}55 1px, transparent 1px), linear-gradient(90deg, ${C.line}55 1px, transparent 1px)`,
          backgroundSize: "90px 90px",
          backgroundPosition: `0px ${(frame * 0.4) % 90}px`,
          maskImage: "radial-gradient(circle at 50% 45%, black 20%, transparent 75%)",
        }}
      />
      {DOTS.map((d, i) => {
        const y = (d.y - frame * d.speed + 1350) % 1350;
        const tw = 0.35 + 0.45 * Math.sin(frame / 25 + d.phase);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: d.x,
              top: y,
              width: d.size,
              height: d.size,
              backgroundColor: d.color,
              opacity: tw,
              boxShadow: `0 0 ${d.size * 2}px ${d.color}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
