'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CityResponse } from './city-types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

export default function Scene() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [city, setCity] = useState<CityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 1. Pedir la ciudad al backend
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/cities/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config: {
              widthInMeters: 100,
              heightInMeters: 100,
              streetSpacingInMeters: 50,
              seed: 123,
            },
            terrain: { kind: 'flat', elevationInMeters: 25 },
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
        }
        const data = (await res.json()) as CityResponse;
        if (!cancelled) setCity(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Dibujar cuando llega la ciudad
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !city) return;

    if (mount.querySelector('canvas')) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111122);

    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      2000,
    );
    camera.position.set(120, 100, 160);
    camera.lookAt(
      city.config.widthInMeters / 2,
      city.terrain.elevationInMeters,
      city.config.heightInMeters / 2,
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(
      city.config.widthInMeters / 2,
      city.terrain.elevationInMeters,
      city.config.heightInMeters / 2,
    );
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 20;
    controls.maxDistance = 500;
    controls.maxPolarAngle = Math.PI / 2;
    controls.update();

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(100, 200, 100);
    scene.add(dirLight);
    scene.add(new THREE.AmbientLight(0x606060));

    // Edificios
    for (const b of city.buildings) {
      const width = b.maxCorner.x - b.minCorner.x;
      const depth = b.maxCorner.y - b.minCorner.y;
      const height = b.heightInMeters;

      const geometry = new THREE.BoxGeometry(width, height, depth);
      const material = new THREE.MeshStandardMaterial({ color: 0x88aaff });
      const mesh = new THREE.Mesh(geometry, material);

      mesh.position.set(
        (b.minCorner.x + b.maxCorner.x) / 2,
        city.terrain.elevationInMeters + height / 2,
        (b.minCorner.y + b.maxCorner.y) / 2,
      );
      scene.add(mesh);
    }

    // Calles
    const roadMaterial = new THREE.LineBasicMaterial({ color: 0x888888 });
    for (const road of city.roads) {
      const points = [
        new THREE.Vector3(
          road.start.x,
          city.terrain.elevationInMeters + 0.1,
          road.start.y,
        ),
        new THREE.Vector3(
          road.end.x,
          city.terrain.elevationInMeters + 0.1,
          road.end.y,
        ),
      ];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      scene.add(new THREE.Line(geometry, roadMaterial));
    }

    // Suelo
    const groundGeometry = new THREE.PlaneGeometry(
      city.config.widthInMeters,
      city.config.heightInMeters,
    );
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(
      city.config.widthInMeters / 2,
      city.terrain.elevationInMeters,
      city.config.heightInMeters / 2,
    );
    scene.add(ground);

    let frameId: number;
    function animate() {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      controls.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [city]);

  if (error) {
    return (
      <div style={{ padding: 20, color: 'salmon', fontFamily: 'monospace' }}>
        Error al cargar la ciudad: {error}
      </div>
    );
  }
  if (!city) return <div style={{ padding: 20 }}>Cargando ciudad...</div>;

  return <div ref={mountRef} style={{ width: '100vw', height: '100vh' }} />;
}