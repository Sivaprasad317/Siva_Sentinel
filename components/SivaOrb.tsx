'use client';
// Siva's animated "voice orb" (three.js). It changes colour and motion to show
// what Siva is doing: idle, listening to you, thinking, or speaking.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

const STYLE: Record<OrbState, { color: number; amp: number; speed: number }> = {
  idle: { color: 0xa855f7, amp: 0.04, speed: 0.8 },
  listening: { color: 0x22c55e, amp: 0.13, speed: 1.6 },
  thinking: { color: 0x60a5fa, amp: 0.08, speed: 3.2 },
  speaking: { color: 0xec4899, amp: 0.17, speed: 2.2 },
};

export default function SivaOrb({ state, size = 150, paused = false }: { state: OrbState; size?: number; paused?: boolean }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<OrbState>(state);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // the CSS fallback circle stays visible
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(size, size);
    mount.appendChild(renderer.domElement);
    mount.classList.add('has-webgl');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 20);
    camera.position.z = 3.4;

    const geo = new THREE.IcosahedronGeometry(1, 12);
    const original = (geo.attributes.position.array as Float32Array).slice();
    const pointsMat = new THREE.PointsMaterial({ color: STYLE.idle.color, size: 0.028, transparent: true, opacity: 0.9 });
    const points = new THREE.Points(geo, pointsMat);
    scene.add(points);

    const innerMat = new THREE.MeshBasicMaterial({ color: STYLE.idle.color, transparent: true, opacity: 0.18 });
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.82, 32, 32), innerMat);
    scene.add(inner);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const current = new THREE.Color(STYLE.idle.color);
    const target = new THREE.Color();
    let amp = STYLE.idle.amp;
    const clock = new THREE.Clock();
    let raf = 0;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (pausedRef.current) return; // hidden screen: skip drawing
      const t = clock.getElapsedTime();
      const style = STYLE[stateRef.current];
      target.setHex(style.color);
      current.lerp(target, 0.08);
      pointsMat.color.copy(current);
      innerMat.color.copy(current);
      let wantAmp = reduced ? 0.02 : style.amp;
      if (stateRef.current === 'speaking' && !reduced) wantAmp *= 0.6 + 0.4 * Math.abs(Math.sin(t * 9));
      amp += (wantAmp - amp) * 0.1;

      const pos = geo.attributes.position.array as Float32Array;
      const sp = style.speed;
      for (let i = 0; i < pos.length; i += 3) {
        const x = original[i];
        const y = original[i + 1];
        const z = original[i + 2];
        const d = 1 + amp * Math.sin(x * 3 + t * sp) * Math.sin(y * 4 + t * sp * 0.8) * Math.sin(z * 3.5 + t * sp * 1.2) * 2;
        pos[i] = x * d;
        pos[i + 1] = y * d;
        pos[i + 2] = z * d;
      }
      geo.attributes.position.needsUpdate = true;
      points.rotation.y += reduced ? 0 : 0.003;
      points.rotation.x = Math.sin(t * 0.3) * 0.2;
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      geo.dispose();
      pointsMat.dispose();
      inner.geometry.dispose();
      innerMat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      mount.classList.remove('has-webgl');
    };
  }, [size]);

  return <div ref={mountRef} className={`orb orb-${state}`} style={{ width: size, height: size }} aria-hidden="true" />;
}
