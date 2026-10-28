import { useCurrentFrame } from "remotion";
import { C } from "../theme";

const N = 650;
const POINTS = new Array(N).fill(0).map((_, i) => {
  const y = 1 - (i / (N - 1)) * 2;
  const r = Math.sqrt(1 - y * y);
  const t = i * Math.PI * (3 - Math.sqrt(5));
  return { x: Math.cos(t) * r, y, z: Math.sin(t) * r };
});

/**
 * Siva's particle orb. `level` (0..1) makes it swell and ripple while speaking or listening,
 * `hue` shifts it from violet (idle) to pink (listening) or cyan (thinking).
 */
export const Orb: React.FC<{ size: number; level?: number; spin?: number; color?: string }> = ({
  size,
  level = 0,
  spin = 1,
  color = C.purple,
}) => {
  const frame = useCurrentFrame();
  const a = frame * 0.012 * spin;
  const b = 0.35;
  const R = size * 0.32 * (1 + level * 0.12);
  const cx = size / 2;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {[0.47, 0.42, 0.37].map((r, i) => (
        <div
          key={r}
          style={{
            position: "absolute",
            left: cx - size * r,
            top: cx - size * r,
            width: size * r * 2,
            height: size * r * 2,
            borderRadius: "50%",
            border: `${i === 1 ? 2 : 1.5}px ${i === 1 ? "dashed" : "solid"} ${color}${i === 2 ? "88" : "44"}`,
            scale: String(1 + level * 0.05 * (i + 1)),
            rotate: `${frame * (i % 2 ? -0.3 : 0.2)}deg`,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          left: cx - R * 0.85,
          top: cx - R * 0.85,
          width: R * 1.7,
          height: R * 1.7,
          borderRadius: "50%",
          background: `radial-gradient(circle at 40% 35%, ${color}66, ${color}22 60%, transparent 72%)`,
          boxShadow: `0 0 ${80 + level * 120}px ${color}55`,
        }}
      />
      <svg width={size} height={size} style={{ position: "absolute", inset: 0 }}>
        {POINTS.map((p, i) => {
          const wobble = 1 + level * 0.18 * Math.sin(frame * 0.35 + p.y * 6 + p.x * 4);
          const x1 = p.x * Math.cos(a) - p.z * Math.sin(a);
          const z1 = p.x * Math.sin(a) + p.z * Math.cos(a);
          const y1 = p.y * Math.cos(b) - z1 * Math.sin(b);
          const z2 = p.y * Math.sin(b) + z1 * Math.cos(b);
          const depth = (z2 + 1) / 2;
          return (
            <circle
              key={i}
              cx={cx + x1 * R * wobble}
              cy={cx + y1 * R * wobble}
              r={1.2 + depth * 2}
              fill={depth > 0.55 ? "#e9d5ff" : color}
              opacity={0.15 + depth * 0.85}
            />
          );
        })}
      </svg>
    </div>
  );
};
