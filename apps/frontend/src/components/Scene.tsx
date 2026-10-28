'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CityResponse } from './city-types';
import { createRoadMesh } from './create-road-mesh';
import { createDistrictLayer } from './create-district-layer';

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
            layout: 'district',
            config: {
              widthInMeters: 500,
              heightInMeters: 500,
              streetSpacingInMeters: 50,
              seed: 123,
            },
            terrain: { kind: 'flat', elevationInMeters: 25 },
            minBuildingHeightInMeters: 4,
            maxBuildingHeightInMeters: 40,
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
    scene.background = new THREE.Color(0xcbd5df);
    const extent = Math.max(
      city.config.widthInMeters,
      city.config.heightInMeters,
    );

    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      2,
      extent * 10,
    );
    camera.position.set(
      city.config.widthInMeters / 2 + extent * 0.8,
      city.terrain.elevationInMeters + extent * 0.9,
      city.config.heightInMeters / 2 + extent * 0.8,
    );
    camera.lookAt(
      city.config.widthInMeters / 2,
      city.terrain.elevationInMeters,
      city.config.heightInMeters / 2,
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
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
    controls.maxDistance = extent * 5;
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
      const material = new THREE.MeshStandardMaterial({
        color:
          b.use === 'commercial' ? 0x7294a7 : height > 15 ? 0xb6c4c7 : 0xd5c3a4,
        roughness: 0.85,
      });
      const mesh = new THREE.Mesh(geometry, material);

      mesh.position.set(
        (b.minCorner.x + b.maxCorner.x) / 2,
        city.terrain.elevationInMeters + height / 2,
        (b.minCorner.y + b.maxCorner.y) / 2,
      );
      scene.add(mesh);
    }

    // Calles
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 1,
    });
    const roadMeshes = city.roads.map((road) =>
      createRoadMesh(road, city.terrain.elevationInMeters, roadMaterial),
    );
    for (const mesh of roadMeshes) scene.add(mesh);
    scene.add(createDistrictLayer(city));

    // Suelo
    const groundGeometry = new THREE.PlaneGeometry(
      city.config.widthInMeters,
      city.config.heightInMeters,
    );
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xa6b09a });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(
      city.config.widthInMeters / 2,
      city.terrain.elevationInMeters,
      city.config.heightInMeters / 2,
    );
    scene.add(ground);
    const resize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', resize);

    let frameId: number;
    function animate() {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            materials.add(material);
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
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

  return (
    <main style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      <aside
        aria-label="Información del distrito"
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          maxWidth: 300,
          padding: 16,
          borderRadius: 12,
          background: 'rgba(255,255,255,0.94)',
          color: '#17252a',
          fontFamily: 'sans-serif',
          boxShadow: '0 4px 24px #0002',
        }}
      >
        <strong>Simucity IA · Distrito sintético</strong>
        <p style={{ margin: '8px 0' }}>
          {city.config.widthInMeters} × {city.config.heightInMeters} m ·{' '}
          {city.buildings.length} edificios · Semilla {city.config.seed}
        </p>
        <p style={{ margin: '8px 0' }}>
          Plazas: {city.district?.parks.length ?? 0} · Refugios:{' '}
          {city.shelters?.length ?? 0}
        </p>
        <small>
          Azul: comercios · Beige: viviendas · Verde: plazas · Amarillo:
          refugios
        </small>
        <p style={{ margin: '8px 0 0', fontSize: 12 }}>
          Arrastra para girar · Rueda para acercar. Terreno plano y población
          sintética; sin simulación activa.
        </p>
      </aside>
    </main>
  );
}
