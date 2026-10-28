// Deterministic 3D force-directed layout for the Threat Graph (pure; same input → same picture).
// Linked nodes pull together, all nodes push apart, and each type gets a loose "home" region so
// groups, malware, CVEs, vendors and techniques form readable clusters.
import type { NodeType } from './threatGraph';

export interface LayoutNode {
  id: string;
  type: NodeType;
  stories: number;
}
export interface LayoutEdge {
  a: string;
  b: string;
  weight: number;
}
export type Vec3 = [number, number, number];

function seeded(id: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const HOME: Record<NodeType, Vec3> = {
  actor: [0, 1.2, 0],
  malware: [-1.2, 0.2, 0.6],
  cve: [1.2, 0, 0.4],
  vendor: [0.6, -1.1, -0.6],
  technique: [-0.6, -0.8, -1],
};

export function layoutGraph(nodes: LayoutNode[], edges: LayoutEdge[], opts: { iterations?: number; radius?: number } = {}): Map<string, Vec3> {
  const n = nodes.length;
  const out = new Map<string, Vec3>();
  if (!n) return out;
  const R = opts.radius ?? Math.max(6, Math.cbrt(n) * 3.2);
  const iters = opts.iterations ?? (n > 120 ? 180 : 260);
  const idx = new Map(nodes.map((x, i) => [x.id, i]));
  const P = nodes.map((x) => {
    const r = seeded(x.id);
    const h = HOME[x.type];
    return [h[0] * R * 0.5 + (r() - 0.5) * R, h[1] * R * 0.5 + (r() - 0.5) * R, h[2] * R * 0.5 + (r() - 0.5) * R] as Vec3;
  });
  const E = edges.map((e) => [idx.get(e.a), idx.get(e.b), e.weight] as const).filter((e): e is readonly [number, number, number] => e[0] !== undefined && e[1] !== undefined);
  const k = R / Math.cbrt(n + 1);
  const D: Vec3[] = nodes.map(() => [0, 0, 0]);
  const cut2 = (k * 3.5) ** 2;
  let temp = R * 0.25;
  for (let it = 0; it < iters; it++) {
    for (const d of D) d[0] = d[1] = d[2] = 0;
    // repulsion
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = P[i][0] - P[j][0];
        const dy = P[i][1] - P[j][1];
        const dz = P[i][2] - P[j][2];
        const d2 = dx * dx + dy * dy + dz * dz + 0.01;
        if (d2 > cut2) continue; // far-away nodes don't push (keeps loose items from drifting off)
        const f = (k * k) / d2;
        D[i][0] += dx * f; D[i][1] += dy * f; D[i][2] += dz * f;
        D[j][0] -= dx * f; D[j][1] -= dy * f; D[j][2] -= dz * f;
      }
    }
    // attraction along links (stronger for links seen in more stories)
    for (const [a, b, w] of E) {
      const dx = P[a][0] - P[b][0];
      const dy = P[a][1] - P[b][1];
      const dz = P[a][2] - P[b][2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
      const f = (d / k) * (0.6 + Math.min(w, 6) * 0.15);
      D[a][0] -= dx * f; D[a][1] -= dy * f; D[a][2] -= dz * f;
      D[b][0] += dx * f; D[b][1] += dy * f; D[b][2] += dz * f;
    }
    // gentle pull to each type's home region + to the centre
    for (let i = 0; i < n; i++) {
      const h = HOME[nodes[i].type];
      for (let c = 0; c < 3; c++) D[i][c] += (h[c] * R * 0.45 - P[i][c]) * 0.06 * k;
    }
    for (let i = 0; i < n; i++) {
      const len = Math.hypot(D[i][0], D[i][1], D[i][2]) || 1;
      const step = Math.min(len, temp) / len;
      for (let c = 0; c < 3; c++) P[i][c] += D[i][c] * step;
    }
    temp *= 0.985;
  }
  // centre the cloud
  const cx = P.reduce((s, p) => s + p[0], 0) / n;
  const cy = P.reduce((s, p) => s + p[1], 0) / n;
  const cz = P.reduce((s, p) => s + p[2], 0) / n;
  nodes.forEach((x, i) => out.set(x.id, [P[i][0] - cx, P[i][1] - cy, P[i][2] - cz]));
  return out;
}
