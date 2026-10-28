'use client';
// 3D "threat globe" built with plain three.js.
// Each story is a glowing node. Colour = priority. Exploited items pulse.
// Nodes are grouped by CATEGORY around the globe. Positions are symbolic, not geographic,
// because feeds rarely give reliable locations and we refuse to invent them.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Category, Priority, Story } from '../lib/types';

const PRIORITY_COLOR: Record<Priority, number> = { critical: 0xff4d5e, high: 0xff9f43, medium: 0xf2d04b, low: 0x4cc9f0 };
const PRIORITY_SIZE: Record<Priority, number> = { critical: 0.045, high: 0.036, medium: 0.028, low: 0.021 };
const CATEGORY_LON: Record<Category, number> = { exploited: 0, vulnerability: 50, ransomware: 110, 'threat-actor': 170, breach: 230, cloud: 290, general: 330 };

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function positionFor(story: Story, radius: number): THREE.Vector3 {
  const cat = story.categories[0] ?? 'general';
  const lon = ((CATEGORY_LON[cat] + (hash01(story.id) - 0.5) * 44) * Math.PI) / 180;
  const lat = (((hash01(story.id + ':lat') - 0.5) * 120) * Math.PI) / 180;
  return new THREE.Vector3(radius * Math.cos(lat) * Math.cos(lon), radius * Math.sin(lat), radius * Math.cos(lat) * Math.sin(lon));
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose?.();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose?.();
  });
}

interface GlobeApi {
  setStories(list: Story[]): void;
  setSelected(id: string | null): void;
}

export default function ThreatGlobe({ stories, selectedId, onSelect }: { stories: Story[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<GlobeApi | null>(null);
  const onSelectRef = useRef(onSelect);
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setWebglFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D threat globe. Click a node to open a story.');
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0.7, 3.3);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 1.8;
    controls.maxDistance = 6;
    controls.autoRotate = !reducedMotion;
    controls.autoRotateSpeed = 0.55;

    const globe = new THREE.Group();
    scene.add(globe);

    // Dark core so nodes on the far side are hidden.
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.985, 48, 48), new THREE.MeshBasicMaterial({ color: 0x07122a }));
    globe.add(core);

    // Faint geodesic grid.
    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1, 3)),
      new THREE.LineBasicMaterial({ color: 0x2b6cff, transparent: true, opacity: 0.1 }),
    );
    globe.add(wire);

    // Evenly spread surface dots (Fibonacci sphere).
    const N = 1800;
    const dotPos = new Float32Array(N * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = golden * i;
      dotPos.set([Math.cos(th) * r * 1.003, y * 1.003, Math.sin(th) * r * 1.003], i * 3);
    }
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPos, 3));
    globe.add(new THREE.Points(dotGeo, new THREE.PointsMaterial({ color: 0x5aa9ff, size: 0.011, transparent: true, opacity: 0.5 })));

    // Atmosphere glow.
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.14, 48, 48),
      new THREE.ShaderMaterial({
        vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'varying vec3 vN; void main(){ float i = pow(0.62 - dot(vN, vec3(0.0,0.0,1.0)), 3.0); gl_FragColor = vec4(0.25,0.55,1.0,1.0) * i; }',
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
      }),
    );
    scene.add(atmosphere);

    // Star field.
    const S = 900;
    const starPos = new Float32Array(S * 3);
    for (let i = 0; i < S; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(8 + Math.random() * 10);
      starPos.set([v.x, v.y, v.z], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x8fb4ff, size: 0.035, transparent: true, opacity: 0.6 })));

    const nodes = new THREE.Group();
    const arcs = new THREE.Group();
    globe.add(nodes, arcs);
    let pickables: THREE.Mesh[] = [];
    let pulses: THREE.Mesh[] = [];
    let selected: string | null = null;

    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.075, 0.09, 48),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, side: THREE.DoubleSide }),
    );
    marker.visible = false;
    globe.add(marker);

    const clearGroup = (g: THREE.Group) => {
      for (const child of [...g.children]) {
        g.remove(child);
        disposeObject(child);
      }
    };

    const applySelection = () => {
      let found: THREE.Mesh | undefined;
      for (const m of pickables) {
        const isSel = m.userData.id === selected;
        m.scale.setScalar(isSel ? 1.8 : 1);
        if (isSel) found = m;
      }
      marker.visible = Boolean(found);
      if (found) {
        marker.position.copy(found.position).multiplyScalar(1.01);
        marker.lookAt(found.position.clone().multiplyScalar(2));
      }
    };

    const setStories = (list: Story[]) => {
      clearGroup(nodes);
      clearGroup(arcs);
      pickables = [];
      pulses = [];
      const shown = list.slice(0, 60);
      shown.forEach((s) => {
        const p = positionFor(s, 1.02);
        const color = PRIORITY_COLOR[s.priority];
        const size = PRIORITY_SIZE[s.priority];
        const node = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 16), new THREE.MeshBasicMaterial({ color }));
        node.position.copy(p);
        node.userData = { id: s.id, title: s.title, priority: s.priority, source: s.source };
        nodes.add(node);
        pickables.push(node);

        // Spike: taller = higher score.
        const len = 0.05 + Math.max(0, Math.min(100, s.score)) / 100 * 0.3;
        const spikeGeo = new THREE.BufferGeometry().setFromPoints([p, p.clone().multiplyScalar(1 + len)]);
        nodes.add(new THREE.Line(spikeGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 })));

        if (s.kev || s.categories.includes('exploited')) {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(size * 1.5, size * 2.0, 32),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
          );
          ring.position.copy(p);
          ring.lookAt(p.clone().multiplyScalar(2));
          nodes.add(ring);
          pulses.push(ring);
        }
      });

      // Arcs link the top stories that share a category.
      const top = shown.slice(0, 14);
      for (let i = 0; i < top.length; i++) {
        for (let j = i + 1; j < top.length; j++) {
          if (top[i].categories[0] !== top[j].categories[0]) continue;
          const a = positionFor(top[i], 1.02);
          const b = positionFor(top[j], 1.02);
          const mid = a.clone().add(b).multiplyScalar(0.5);
          if (mid.length() < 0.01) continue;
          mid.normalize().multiplyScalar(1.25 + a.distanceTo(b) * 0.25);
          const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
          const g = new THREE.BufferGeometry().setFromPoints(curve.getPoints(40));
          arcs.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x7aa2ff, transparent: true, opacity: 0.3 })));
        }
      }
      applySelection();
    };

    apiRef.current = {
      setStories,
      setSelected(id) {
        selected = id;
        applySelection();
      },
    };

    // Picking (hover tooltip + click to select).
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pick = (ev: PointerEvent): THREE.Mesh | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects([core, ...pickables], false)[0];
      return hit && hit.object !== core ? (hit.object as THREE.Mesh) : null;
    };
    let downAt: { x: number; y: number } | null = null;
    const onMove = (ev: PointerEvent) => {
      const hit = pick(ev);
      const tip = tipRef.current;
      renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
      controls.autoRotate = !reducedMotion && !hit;
      if (!tip) return;
      if (hit) {
        const rect = mount.getBoundingClientRect();
        tip.textContent = `${String(hit.userData.priority).toUpperCase()} · ${hit.userData.title}`;
        tip.style.left = `${ev.clientX - rect.left + 12}px`;
        tip.style.top = `${ev.clientY - rect.top + 12}px`;
        tip.hidden = false;
      } else tip.hidden = true;
    };
    const onDown = (ev: PointerEvent) => {
      downAt = { x: ev.clientX, y: ev.clientY };
    };
    const onUp = (ev: PointerEvent) => {
      if (!downAt) return;
      const moved = Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y);
      downAt = null;
      if (moved > 5) return; // it was a drag, not a click
      const hit = pick(ev);
      if (hit) onSelectRef.current(String(hit.userData.id));
    };
    const onLeave = () => {
      if (tipRef.current) tipRef.current.hidden = true;
      controls.autoRotate = !reducedMotion;
    };
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointerleave', onLeave);

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

    const clock = new THREE.Clock();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = clock.getElapsedTime();
      pulses.forEach((r, i) => {
        const k = reducedMotion ? 0 : Math.sin(t * 3 + i);
        r.scale.setScalar(1 + 0.35 * k);
        (r.material as THREE.MeshBasicMaterial).opacity = 0.6 - 0.3 * k;
      });
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
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    apiRef.current?.setStories(stories);
  }, [stories]);

  useEffect(() => {
    apiRef.current?.setSelected(selectedId);
  }, [selectedId]);

  return (
    <div className="globe-wrap">
      <div ref={mountRef} className="globe-canvas" />
      <div ref={tipRef} className="globe-tip" hidden />
      {webglFailed && <div className="globe-fallback">3D view unavailable: your browser or device does not support WebGL. The story list below still works.</div>}
      <div className="globe-legend">
        <span><i style={{ background: '#ff4d5e' }} />Critical</span>
        <span><i style={{ background: '#ff9f43' }} />High</span>
        <span><i style={{ background: '#f2d04b' }} />Medium</span>
        <span><i style={{ background: '#4cc9f0' }} />Low</span>
        <span className="muted">Rings = exploited · grouped by category, not geography</span>
      </div>
    </div>
  );
}
