import { loadFont } from "@remotion/fonts";
import { Easing, staticFile } from "remotion";

// Fonts are bundled in public/fonts (Inter + JetBrains Mono, OFL), so rendering works offline.
for (const w of ["400", "500", "600", "700", "800"]) {
  loadFont({ family: "Inter", url: staticFile(`fonts/inter-latin-${w}-normal.woff2`), weight: w });
}
for (const w of ["500", "700"]) {
  loadFont({ family: "JetBrains Mono", url: staticFile(`fonts/jetbrains-mono-latin-${w}-normal.woff2`), weight: w });
}
export const INTER = "Inter, sans-serif";
export const MONO = "'JetBrains Mono', monospace";

// Same palette as the app (app/globals.css).
export const C = {
  bg: "#070c1a",
  bg2: "#0b1224",
  panel: "rgba(15, 22, 41, 0.85)",
  line: "#1e2a45",
  line2: "#2a3a5e",
  fg: "#e5e9f2",
  muted: "#8a94ad",
  blue: "#3b82f6",
  purple: "#a855f7",
  pink: "#ec4899",
  red: "#ef4444",
  amber: "#f59e0b",
  yellow: "#eab308",
  green: "#22c55e",
  cyan: "#22d3ee",
};

export const GRADIENT = `linear-gradient(90deg, ${C.pink}, ${C.purple} 50%, ${C.blue})`;

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1350;

export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
