'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CityResponse } from './city-types';
import { createRoadMesh } from './create-road-mesh';
import { createDistrictLayer } from './create-district-layer';
import { createBuildingLayer } from './urban-building-layer';
import { createUrbanDetailLayer } from './urban-detail-layer';
import { createUrbanTextures } from './urban-materials';

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
            detailLevel: 'urban',
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
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
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

    const dirLight = new THREE.DirectionalLight(0xfff1dc, 2.5);
    dirLight.position.set(
      city.config.widthInMeters / 2 + extent * 0.6,
      city.terrain.elevationInMeters + extent * 0.8,
      -extent * 0.3,
    );
    dirLight.target.position.set(
      city.config.widthInMeters / 2,
      city.terrain.elevationInMeters,
      city.config.heightInMeters / 2,
    );
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.left = dirLight.shadow.camera.bottom = -extent * 0.8;
    dirLight.shadow.camera.right = dirLight.shadow.camera.top = extent * 0.8;
    dirLight.shadow.camera.far = extent * 4;
    dirLight.shadow.normalBias = 0.08;
    dirLight.shadow.bias = -0.0001;
    dirLight.shadow.camera.updateProjectionMatrix();
    scene.add(dirLight);
    scene.add(dirLight.target);
    scene.add(new THREE.HemisphereLight(0xe4f2ff, 0x8c8869, 2));

    // Edificios
    scene.add(createBuildingLayer(city));
    const textures = createUrbanTextures(false);
    if (textures.asphalt) textures.asphalt.repeat.set(70, 2);
    if (textures.grass) textures.grass.repeat.set(64, 64);

    // Calles
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: textures.asphalt ? 0xffffff : 0x555555,
      roughness: 1,
      ...(textures.asphalt ? { map: textures.asphalt } : {}),
    });
    const roadMeshes = city.roads.map((road) =>
      createRoadMesh(road, city.terrain.elevationInMeters, roadMaterial),
    );
    for (const mesh of roadMeshes) scene.add(mesh);
    scene.add(createDistrictLayer(city));
    scene.add(createUrbanDetailLayer(city, textures.concrete));

    // Suelo
    const groundGeometry = new THREE.PlaneGeometry(
      city.config.widthInMeters,
      city.config.heightInMeters,
    );
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: textures.grass ? 0xffffff : 0xa6b09a,
      roughness: 1,
      ...(textures.grass ? { map: textures.grass } : {}),
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(
      city.config.widthInMeters / 2,
      city.terrain.elevationInMeters,
      city.config.heightInMeters / 2,
    );
    scene.add(ground);
    ground.receiveShadow = true;
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
      const maps = new Set<THREE.Texture>();
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
      for (const material of materials) {
        if (material instanceof THREE.MeshStandardMaterial && material.map)
          maps.add(material.map);
        material.dispose();
      }
      for (const texture of maps) texture.dispose();
      dirLight.shadow.map?.dispose();
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
          Casas con techo · Departamentos con balcones · Comercios con vidriera
        </small>
        <p style={{ margin: '8px 0 0', fontSize: 12 }}>
          Arrastra para girar · Rueda para acercar. Terreno plano y población
          sintética; sin simulación activa.
        </p>
      </aside>
    </main>
  );
}
