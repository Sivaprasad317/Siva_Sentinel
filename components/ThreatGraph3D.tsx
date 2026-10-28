'use client';
// 3D Threat Graph (three.js). Each glowing ball is a real thing from the news — hacker group, malware,
// CVE, vendor or ATT&CK technique. Lines join things named in the same stories (thicker = more stories).
// Drag to rotate, scroll to zoom, click a ball to see its connections and sources.
// If WebGL is not available, a flat 2D map of the same layout is shown instead.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GraphEdge, GraphNode, NodeType } from '../lib/threatGraph';
import { layoutGraph, type Vec3 } from '../lib/graphLayout';

export const TYPE_COLOR: Record<NodeType, string> = {
  actor: '#ef4444',
  malware: '#f59e0b',
  cve: '#a855f7',
  vendor: '#3b82f6',
  technique: '#22c55e',
};

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** search text: matching nodes are highlighted */
  highlight?: string;
}

const radiusOf = (n: GraphNode) => 0.22 + Math.sqrt(n.stories) * 0.13;

function makeLabel(text: string, color: string): { sprite: THREE.Sprite; dispose: () => void } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = '600 44px Inter, system-ui, sans-serif';
  ctx.font = font;
  const w = Math.min(900, Math.ceil(ctx.measureText(text).width) + 36);
  canvas.width = w;
  canvas.height = 72;
  ctx.font = font;
  ctx.fillStyle = 'rgba(8,12,28,0.72)';
  ctx.beginPath();
  ctx.roundRect?.(0, 6, w, 60, 18);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 18, 37);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set((w / 72) * 0.42, 0.42, 1);
  return { sprite, dispose: () => { tex.dispose(); mat.dispose(); } };
}

export default function ThreatGraph3D({ nodes, edges, selectedId, onSelect, highlight = '' }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const positions = useMemo(() => layoutGraph(nodes, edges), [nodes, edges]);
  // Mutable view state the render loop reads (so selection changes don't rebuild the scene).
  const focusRef = useRef<{ selected: string | null; highlight: string }>({ selected: selectedId, highlight });
  const applyRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    focusRef.current = { selected: selectedId, highlight };
    applyRef.current();
  }, [selectedId, highlight]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !nodes.length || failed) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x060a1a, 0.018);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    const span = Math.max(...[...positions.values()].map((p) => Math.hypot(p[0], p[1], p[2])), 6);
    camera.position.set(0, span * 0.35, span * 2.1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.45;
    controls.minDistance = 3;
    controls.maxDistance = span * 5;
    scene.add(new THREE.AmbientLight(0x8899cc, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(6, 10, 8);
    scene.add(dir);

    const disposables: { dispose(): void }[] = [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const meshes = new Map<string, THREE.Mesh>();
    const pickables: THREE.Mesh[] = [];
    const sphere = new THREE.SphereGeometry(1, 20, 14);
    disposables.push(sphere);
    for (const n of nodes) {
      const p = positions.get(n.id) as Vec3;
      const mat = new THREE.MeshStandardMaterial({ color: TYPE_COLOR[n.type], emissive: TYPE_COLOR[n.type], emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.2, transparent: true, opacity: 0.95 });
      const m = new THREE.Mesh(sphere, mat);
      const r = radiusOf(n);
      m.scale.setScalar(r);
      m.position.set(p[0], p[1], p[2]);
      m.userData = { id: n.id };
      scene.add(m);
      meshes.set(n.id, m);
      pickables.push(m);
      disposables.push(mat);
      if (n.kev) {
        const rg = new THREE.TorusGeometry(r * 1.45, 0.035, 8, 40);
        const rm = new THREE.MeshBasicMaterial({ color: 0xff3b5c, transparent: true, opacity: 0.9 });
        const ring = new THREE.Mesh(rg, rm);
        ring.position.copy(m.position);
        ring.lookAt(camera.position);
        scene.add(ring);
        disposables.push(rg, rm);
      }
    }

    // Links as one line-segments object with per-vertex colours (fast).
    const linkPos = new Float32Array(edges.length * 6);
    const linkCol = new Float32Array(edges.length * 6);
    const base = new THREE.Color();
    edges.forEach((e, i) => {
      const a = positions.get(e.a);
      const b = positions.get(e.b);
      if (!a || !b) return;
      linkPos.set([...a, ...b], i * 6);
      base.set(0x5b7bd6).multiplyScalar(0.35 + Math.min(e.weight, 6) * 0.11);
      linkCol.set([base.r, base.g, base.b, base.r, base.g, base.b], i * 6);
    });
    const linkGeo = new THREE.BufferGeometry();
    linkGeo.setAttribute('position', new THREE.BufferAttribute(linkPos, 3));
    const colAttr = new THREE.BufferAttribute(linkCol, 3);
    linkGeo.setAttribute('color', colAttr);
    const linkMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75 });
    const links = new THREE.LineSegments(linkGeo, linkMat);
    scene.add(links);
    disposables.push(linkGeo, linkMat);

    // Labels for the most important nodes (plus whichever is selected).
    const labels = new Map<string, THREE.Sprite>();
    const labelFor = (n: GraphNode) => {
      if (labels.has(n.id)) return labels.get(n.id)!;
      const { sprite, dispose } = makeLabel(n.label, TYPE_COLOR[n.type]);
      const p = positions.get(n.id)!;
      sprite.position.set(p[0], p[1] + radiusOf(n) + 0.35, p[2]);
      scene.add(sprite);
      labels.set(n.id, sprite);
      disposables.push({ dispose });
      return sprite;
    };
    nodes.slice(0, 22).forEach(labelFor);

    // Highlight the selected node + its neighbours, dim the rest.
    applyRef.current = () => {
      const { selected, highlight: hl } = focusRef.current;
      const q = hl.trim().toLowerCase();
      const near = new Set<string>();
      if (selected) {
        near.add(selected);
        for (const e of edges) {
          if (e.a === selected) near.add(e.b);
          if (e.b === selected) near.add(e.a);
        }
      }
      for (const [id, m] of meshes) {
        const n = byId.get(id)!;
        const match = q && n.label.toLowerCase().includes(q);
        const on = (!selected && !q) || near.has(id) || Boolean(match);
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.opacity = on ? 0.95 : 0.12;
        mat.emissiveIntensity = id === selected || match ? 0.9 : 0.35;
        m.scale.setScalar(radiusOf(n) * (id === selected ? 1.35 : 1));
        if ((id === selected || match) && !labels.has(id)) labelFor(n);
        const lab = labels.get(id);
        if (lab) lab.visible = on;
      }
      edges.forEach((e, i) => {
        const on = !selected || e.a === selected || e.b === selected;
        const f = on ? (selected ? 2.2 : 1) : 0.08;
        base.set(selected && on ? 0x9ab4ff : 0x5b7bd6).multiplyScalar((0.35 + Math.min(e.weight, 6) * 0.11) * f);
        colAttr.array.set([base.r, base.g, base.b, base.r, base.g, base.b], i * 6);
      });
      colAttr.needsUpdate = true;
      if (selected) controls.autoRotate = false;
    };
    applyRef.current();

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pick = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(pickables, false).find((h) => ((h.object as THREE.Mesh).material as THREE.Material).opacity > 0.5);
      return hit ? byId.get((hit.object.userData as { id: string }).id) : undefined;
    };
    let down: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      const n = pick(e);
      renderer.domElement.style.cursor = n ? 'pointer' : 'grab';
      const tip = tipRef.current;
      if (!tip) return;
      if (n) {
        const r = mount.getBoundingClientRect();
        tip.textContent = `${n.label} · ${n.stories} stories · ${n.degree} links${n.kev ? ' · exploited (KEV)' : ''}`;
        tip.style.left = `${e.clientX - r.left + 12}px`;
        tip.style.top = `${e.clientY - r.top + 12}px`;
        tip.hidden = false;
      } else tip.hidden = true;
    };
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
      controls.autoRotate = false;
    };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      down = null;
      const n = pick(e);
      onSelectRef.current(n ? n.id : null);
    };
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    const resize = () => {
      const w = Math.max(1, mount.clientWidth);
      const h = Math.max(1, mount.clientHeight);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || !mount.isConnected || mount.clientWidth === 0) return;
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      applyRef.current = () => undefined;
      controls.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [nodes, edges, positions, failed]);

  if (!nodes.length) return null;
  return (
    <div className="tgraph">
      {failed ? <FlatGraph nodes={nodes} edges={edges} positions={positions} selectedId={selectedId} onSelect={onSelect} highlight={highlight} /> : <div ref={mountRef} className="tgraph-canvas" />}
      <div ref={tipRef} className="globe-tip" hidden />
      <div className="globe-legend">
        {(Object.keys(TYPE_COLOR) as NodeType[]).map((t) => (
          <span key={t}><i style={{ background: TYPE_COLOR[t] }} />{{ actor: 'Hacker group', malware: 'Malware / tool', cve: 'CVE', vendor: 'Vendor', technique: 'ATT&CK technique' }[t]}</span>
        ))}
        <span><i style={{ background: 'transparent', border: '2px solid #ff3b5c' }} />Exploited (KEV)</span>
        <span className="muted">{failed ? 'Flat view (3D needs WebGL)' : 'Drag to rotate · scroll to zoom · click a ball'}</span>
      </div>
    </div>
  );
}

/** Flat SVG version of the same layout (no WebGL needed). */
function FlatGraph({ nodes, edges, positions, selectedId, onSelect, highlight = '' }: Props & { positions: Map<string, Vec3> }) {
  const pts = nodes.map((n) => positions.get(n.id)!);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1] - p[2] * 0.35);
  // Robust bounds (5th–95th percentile) so one far-off item doesn't squash the rest into a corner.
  const pct = (a: number[], f: number) => [...a].sort((p, q) => p - q)[Math.floor(f * (a.length - 1))];
  const minX = pct(xs, 0.05), maxX = pct(xs, 0.95), minY = pct(ys, 0.05), maxY = pct(ys, 0.95);
  const W = 1000, H = 560, pad = 40;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const sx = (x: number) => pad + clamp((x - minX) / (maxX - minX || 1)) * (W - pad * 2 - 120);
  const sy = (y: number) => H - pad - clamp((y - minY) / (maxY - minY || 1)) * (H - pad * 2);
  const at = new Map(nodes.map((n, i) => [n.id, [sx(xs[i]), sy(ys[i])] as const]));
  const near = new Set<string>();
  if (selectedId) {
    near.add(selectedId);
    for (const e of edges) {
      if (e.a === selectedId) near.add(e.b);
      if (e.b === selectedId) near.add(e.a);
    }
  }
  const q = highlight.trim().toLowerCase();
  return (
    <svg className="tgraph-canvas flat" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Threat graph">
      {edges.map((e) => {
        const a = at.get(e.a), b = at.get(e.b);
        if (!a || !b) return null;
        const on = !selectedId || e.a === selectedId || e.b === selectedId;
        return <line key={e.id} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={on && selectedId ? '#9ab4ff' : '#5b7bd6'} strokeOpacity={on ? 0.25 + Math.min(e.weight, 6) * 0.1 : 0.05} strokeWidth={0.6 + Math.min(e.weight, 6) * 0.35} />;
      })}
      {nodes.map((n, i) => {
        const [x, y] = at.get(n.id)!;
        const match = q && n.label.toLowerCase().includes(q);
        const on = (!selectedId && !q) || near.has(n.id) || Boolean(match);
        const r = 4 + Math.sqrt(n.stories) * 3.2;
        return (
          <g key={n.id} opacity={on ? 1 : 0.15} style={{ cursor: 'pointer' }} onClick={() => onSelect(n.id === selectedId ? null : n.id)}>
            {n.kev && <circle cx={x} cy={y} r={r + 4} fill="none" stroke="#ff3b5c" strokeWidth={2} />}
            <circle cx={x} cy={y} r={r * (n.id === selectedId ? 1.3 : 1)} fill={TYPE_COLOR[n.type]} />
            {(i < 22 || n.id === selectedId || match) && <text x={x + r + 4} y={y + 4} fontSize={13} fill="#dbe4ff">{n.label}</text>}
            <title>{`${n.label} · ${n.stories} stories · ${n.degree} links`}</title>
          </g>
        );
      })}
    </svg>
  );
}
