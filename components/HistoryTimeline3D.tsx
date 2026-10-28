'use client';
// 3D timeline of saved briefings (three.js). Each briefing is a glowing column:
// height = number of stories, red cap = critical stories, purple ring = KEV items.
// Hover for details, click to open that briefing. Drag to rotate, scroll to zoom.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface TimelineItem {
  id: string;
  label: string;
  storyCount: number;
  criticalCount: number;
  kevCount: number;
}

export default function HistoryTimeline3D({ items, onOpen }: { items: TimelineItem[]; onOpen: (id: string) => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const onOpenRef = useRef(onOpen);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !items.length) return;
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
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    const list = [...items].reverse().slice(-40); // oldest on the left
    const width = list.length * 1.4;
    camera.position.set(width * 0.15, 6, Math.max(9, width * 0.6));
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.target.set(0, 1.5, 0);

    scene.add(new THREE.AmbientLight(0x8899cc, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(5, 10, 7);
    scene.add(dir);
    const grid = new THREE.GridHelper(Math.max(20, width + 6), Math.max(20, Math.round(width + 6)), 0x2a3f7a, 0x16234a);
    scene.add(grid);

    const maxStories = Math.max(...list.map((i) => i.storyCount), 1);
    const pickables: THREE.Mesh[] = [];
    const disposables: { dispose(): void }[] = [];
    list.forEach((it, idx) => {
      const x = idx * 1.4 - width / 2 + 0.7;
      const h = 0.3 + (it.storyCount / maxStories) * 5;
      const critH = it.storyCount ? (it.criticalCount / it.storyCount) * h : 0;
      const baseGeo = new THREE.BoxGeometry(0.8, h - critH || 0.01, 0.8);
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, emissive: 0x10265a, metalness: 0.3, roughness: 0.4, transparent: true, opacity: 0.92 });
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.set(x, (h - critH) / 2, 0);
      base.userData = it;
      scene.add(base);
      pickables.push(base);
      disposables.push(baseGeo, baseMat);
      if (critH > 0) {
        const cGeo = new THREE.BoxGeometry(0.8, critH, 0.8);
        const cMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x5a1010, metalness: 0.3, roughness: 0.4 });
        const cap = new THREE.Mesh(cGeo, cMat);
        cap.position.set(x, h - critH / 2, 0);
        cap.userData = it;
        scene.add(cap);
        pickables.push(cap);
        disposables.push(cGeo, cMat);
      }
      if (it.kevCount > 0) {
        const rGeo = new THREE.TorusGeometry(0.62, 0.04, 8, 32);
        const rMat = new THREE.MeshBasicMaterial({ color: 0xa855f7 });
        const ring = new THREE.Mesh(rGeo, rMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(x, h + 0.2, 0);
        scene.add(ring);
        disposables.push(rGeo, rMat);
      }
    });

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pick = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObjects(pickables, false)[0]?.object as THREE.Mesh | undefined;
    };
    let down: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      const hit = pick(e);
      const tip = tipRef.current;
      renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
      if (!tip) return;
      if (hit) {
        const d = hit.userData as TimelineItem;
        const r = mount.getBoundingClientRect();
        tip.textContent = `${d.label} · ${d.storyCount} stories · ${d.criticalCount} critical · ${d.kevCount} KEV`;
        tip.style.left = `${e.clientX - r.left + 12}px`;
        tip.style.top = `${e.clientY - r.top + 12}px`;
        tip.hidden = false;
      } else tip.hidden = true;
    };
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      down = null;
      const hit = pick(e);
      if (hit) onOpenRef.current((hit.userData as TimelineItem).id);
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
      controls.dispose();
      disposables.forEach((d) => d.dispose());
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [items]);

  if (!items.length) return null;
  return (
    <div className="timeline3d">
      <div ref={mountRef} className="timeline3d-canvas" />
      <div ref={tipRef} className="globe-tip" hidden />
      {failed && <div className="globe-fallback">3D view needs WebGL. The table below still works.</div>}
      <div className="globe-legend">
        <span><i style={{ background: '#3b82f6' }} />Stories</span>
        <span><i style={{ background: '#ef4444' }} />Critical share</span>
        <span><i style={{ background: '#a855f7' }} />Has KEV items</span>
        <span className="muted">Click a column to open it</span>
      </div>
    </div>
  );
}
