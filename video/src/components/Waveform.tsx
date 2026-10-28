import { useCurrentFrame } from "remotion";

/** Simple animated voice bars. `active` 0..1 controls how loud they look. */
export const Waveform: React.FC<{ active: number; color: string; bars?: number; height?: number }> = ({
  active,
  color,
  bars = 28,
  height = 70,
}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, height }}>
      {new Array(bars).fill(0).map((_, i) => {
        const v =
          Math.abs(Math.sin(frame * 0.45 + i * 0.9)) * 0.6 +
          Math.abs(Math.sin(frame * 0.21 + i * 1.7)) * 0.4;
        const envelope = Math.sin((i / (bars - 1)) * Math.PI);
        const h = 6 + v * envelope * active * (height - 6);
        return <div key={i} style={{ width: 7, height: h, borderRadius: 4, backgroundColor: color, opacity: 0.5 + active * 0.5 }} />;
      })}
    </div>
  );
};
