'use client';
// Animated 3D background (three.js): a slowly drifting "threat network" of glowing nodes and
// links above a perspective grid. It sits behind the whole app and pauses when the tab is hidden.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function Background3D({ intensity = 0 }: { intensity?: number }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const intensityRef = useRef(intensity);

  useEffect(() => {
    intensityRef.current = intensity;
  }, [intensity]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' });
    } catch {
      return; // no WebGL: the CSS gradient background is used
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070c1a, 0.045);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 2.2, 12);

    const grid = new THREE.GridHelper(80, 80, 0x2a3f7a, 0x16234a);
    grid.position.y = -4;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    scene.add(grid);

    const N = 140;
    const box = new THREE.Vector3(26, 9, 14);
    const pos = new Float32Array(N * 3);
    const vel: THREE.Vector3[] = [];
    const colors = new Float32Array(N * 3);
    const palette = [new THREE.Color(0x3b82f6), new THREE.Color(0xa855f7), new THREE.Color(0x22d3ee), new THREE.Color(0xef4444)];
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * box.x;
      pos[i * 3 + 1] = (Math.random() - 0.5) * box.y;
      pos[i * 3 + 2] = (Math.random() - 0.5) * box.z;
      vel.push(new THREE.Vector3((Math.random() - 0.5) * 0.01, (Math.random() - 0.5) * 0.006, (Math.random() - 0.5) * 0.01));
      const c = palette[i % 17 === 0 ? 3 : i % 3];
      colors.set([c.r, c.g, c.b], i * 3);
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.9 }));
    scene.add(points);

    const MAX_LINKS = 600;
    const linkPos = new Float32Array(MAX_LINKS * 6);
    const lGeo = new THREE.BufferGeometry();
    lGeo.setAttribute('position', new THREE.BufferAttribute(linkPos, 3));
    const lMat = new THREE.LineBasicMaterial({ color: 0x4f7dff, transparent: true, opacity: 0.18 });
    const links = new THREE.LineSegments(lGeo, lMat);
    scene.add(links);

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    let mouseX = 0;
    let mouseY = 0;
    const onMouse = (e: MouseEvent) => {
      mouseX = e.clientX / window.innerWidth - 0.5;
      mouseY = e.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener('mousemove', onMouse);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clock = new THREE.Clock();
    let raf = 0;
    const frame = () => {
      const t = clock.getElapsedTime();
      const speed = 1 + intensityRef.current * 1.5;
      for (let i = 0; i < N; i++) {
        for (let k = 0; k < 3; k++) {
          const idx = i * 3 + k;
          const v = k === 0 ? vel[i].x : k === 1 ? vel[i].y : vel[i].z;
          pos[idx] += v * speed;
          const half = (k === 0 ? box.x : k === 1 ? box.y : box.z) / 2;
          if (pos[idx] > half || pos[idx] < -half) {
            if (k === 0) vel[i].x *= -1;
            else if (k === 1) vel[i].y *= -1;
            else vel[i].z *= -1;
          }
        }
      }
      pGeo.attributes.position.needsUpdate = true;
      let n = 0;
      for (let i = 0; i < N && n < MAX_LINKS; i++) {
        for (let j = i + 1; j < N && n < MAX_LINKS; j++) {
          const dx = pos[i * 3] - pos[j * 3];
          const dy = pos[i * 3 + 1] - pos[j * 3 + 1];
          const dz = pos[i * 3 + 2] - pos[j * 3 + 2];
          if (dx * dx + dy * dy + dz * dz < 6.5) {
            linkPos.set([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]], n * 6);
            n++;
          }
        }
      }
      lGeo.setDrawRange(0, n * 2);
      lGeo.attributes.position.needsUpdate = true;
      lMat.opacity = 0.14 + intensityRef.current * 0.12 + 0.04 * Math.sin(t * 0.8);
      grid.position.z = (t * 0.6) % 1;
      camera.position.x += (mouseX * 2 - camera.position.x) * 0.02;
      camera.position.y += (2.2 - mouseY * 1.2 - camera.position.y) * 0.02;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!document.hidden) frame();
    };
    if (reduced) frame();
    else loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouse);
      pGeo.dispose();
      lGeo.dispose();
      (points.material as THREE.Material).dispose();
      lMat.dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={mountRef} className="bg3d" aria-hidden="true" />;
}
