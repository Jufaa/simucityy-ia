'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CityResponse } from './city-types';
import { createRoadMesh } from './create-road-mesh';
import { createDistrictLayer } from './create-district-layer';
import { createBuildingLayer } from './urban-building-layer';
import { createUrbanDetailLayer } from './urban-detail-layer';
import { createUrbanTextures } from './urban-materials';
import { FloodSimulation } from './flood-simulation';
import { createFloodLayer } from './flood-layer';
import { createFloodWeather } from './flood-weather';
import {
  createReliefCity,
  createTerrainGeometry,
  drapeSurfaceLayer,
} from './terrain-view';
import type { CityScenarioInput, FloodSnapshot } from '@simulicity/hazards';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

export default function Scene() {
  const mountRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<FloodSimulation | null>(null);
  const [running, setRunning] = useState(false);
  const [flood, setFlood] = useState<FloodSnapshot | null>(null);
  const [floodError, setFloodError] = useState<string | null>(null);
  const [sourceCity, setSourceCity] = useState<CityResponse | null>(null);
  const [reliefMode, setReliefMode] = useState(true);
  const city = useMemo(
    () =>
      sourceCity
        ? reliefMode
          ? createReliefCity(sourceCity)
          : sourceCity
        : null,
    [sourceCity, reliefMode],
  );
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
        if (!cancelled) setSourceCity(data);
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
    const skyLight = new THREE.HemisphereLight(0xe4f2ff, 0x8c8869, 2);
    scene.add(skyLight);

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
    for (const mesh of roadMeshes) scene.add(drapeSurfaceLayer(mesh, city));
    scene.add(drapeSurfaceLayer(createDistrictLayer(city), city));
    scene.add(
      drapeSurfaceLayer(createUrbanDetailLayer(city, textures.concrete), city),
    );

    // Suelo
    const groundGeometry =
      city.terrainProfile === 'basin'
        ? createTerrainGeometry(city)
        : new THREE.PlaneGeometry(
            city.config.widthInMeters,
            city.config.heightInMeters,
          );
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: textures.grass ? 0xffffff : 0xa6b09a,
      roughness: 1,
      ...(textures.grass ? { map: textures.grass } : {}),
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    if (city.terrainProfile !== 'basin') {
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(
        city.config.widthInMeters / 2,
        city.terrain.elevationInMeters,
        city.config.heightInMeters / 2,
      );
    }
    scene.add(ground);
    ground.receiveShadow = true;
    const resize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', resize);

    let simulation: FloodSimulation | null = null;
    let floodLayer: ReturnType<typeof createFloodLayer> | null = null;
    if (city.terrainGrid && city.roadGraph?.edges) {
      try {
        const input: CityScenarioInput = {
          terrain: city.terrain,
          terrainGrid: city.terrainGrid,
          roadGraph: {
            nodes: city.roadGraph.nodes,
            edges: city.roadGraph.edges,
          },
          buildings: city.buildings,
        };
        simulation = new FloodSimulation(input);
        floodLayer = createFloodLayer(input, simulation.cells);
        scene.add(floodLayer.group);
        simulationRef.current = simulation;
        setFlood(simulation.snapshot);
        setFloodError(null);
      } catch {
        setFloodError('No se pudo preparar la inundación para esta ciudad.');
      }
    } else {
      setFloodError(
        'La ciudad no incluye los datos de terreno y calles para simular.',
      );
    }
    const weather = createFloodWeather(
      city.config,
      city.terrain.elevationInMeters,
      city.buildings.reduce(
        (height, building) => Math.max(height, building.heightInMeters),
        0,
      ),
    );
    scene.add(weather.group);
    const stormFog = new THREE.Fog(0x647789, extent * 0.7, extent * 3.5);
    let stormActive = false;
    let frameId: number;
    let previousTime: number | null = null;
    let displayedSnapshot: FloodSnapshot | null = null;
    function animate(time: number) {
      frameId = requestAnimationFrame(animate);
      // Hidden tabs do not accumulate catch-up work; cap a slow frame to 0.25s.
      const delta =
        previousTime === null
          ? 0
          : Math.min((time - previousTime) / 1000, 0.25);
      previousTime = time;
      if (!document.hidden && simulation?.advance(delta)) {
        setFlood(simulation.snapshot);
      }
      if (simulation && simulation.snapshot !== displayedSnapshot) {
        floodLayer?.update(simulation.snapshot);
        displayedSnapshot = simulation.snapshot;
      }
      const active = simulation?.started ?? false;
      const animateStorm = !!simulation?.running && !document.hidden;
      weather.animate(animateStorm ? delta : 0, active, animateStorm);
      if (animateStorm) floodLayer?.animate(delta);
      if (active !== stormActive) {
        stormActive = active;
        if (scene.background instanceof THREE.Color)
          scene.background.set(active ? 0x52677e : 0xcbd5df);
        scene.fog = active ? stormFog : null;
        dirLight.intensity = active ? 1.5 : 2.5;
        skyLight.intensity = active ? 1.4 : 2;
      }
      controls.update();
      renderer.render(scene, camera);
    }
    animate(performance.now());

    return () => {
      cancelAnimationFrame(frameId);
      scene.remove(weather.group);
      weather.dispose();
      simulation?.pause();
      simulationRef.current = null;
      if (floodLayer) {
        scene.remove(floodLayer.group);
        floodLayer.dispose();
      }
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

  function toggleFlood() {
    const simulation = simulationRef.current;
    if (!simulation) return;
    if (simulation.running) simulation.pause();
    else simulation.start();
    setRunning(simulation.running);
  }

  function resetFlood() {
    const simulation = simulationRef.current;
    if (!simulation) return;
    simulation.reset();
    setRunning(false);
    setFlood(simulation.snapshot);
  }

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
          maxWidth: 'min(340px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
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
          Arrastra para girar · Rueda para acercar. Terreno y población
          sintéticos; simulación demostrativa, no predicción real.
        </p>
        <hr style={{ margin: '12px 0', borderColor: '#ddd' }} />
        <strong>Inundación por lluvia</strong>
        <label style={{ display: 'block', margin: '8px 0', fontSize: 13 }}>
          Terreno{' '}
          <select
            aria-label="Tipo de terreno"
            value={reliefMode ? 'basin' : 'flat'}
            disabled={!sourceCity?.terrainGrid}
            onChange={(event) => {
              setRunning(false);
              setFlood(null);
              setReliefMode(event.target.value === 'basin');
            }}
          >
            <option value="basin">Relieve con zona baja · demo</option>
            <option value="flat">Plano · original</option>
          </select>
        </label>
        <p style={{ margin: '8px 0', fontSize: 12 }}>
          Lluvia visible y agua animada · Lluvia: 120 mm/h · Drenaje: 15 mm/h.
          Tiempo acelerado: 1 segundo = 5 minutos simulados.
        </p>
        <p style={{ fontSize: 12, color: '#425466' }}>
          {city.terrainProfile === 'basin'
            ? 'Relieve local sintético con pendiente y depresión central; grilla de 10 m. El agua se acumula primero en zonas bajas.'
            : 'Terreno plano: el agua sube uniformemente y alcanza 15 cm en unos 17 segundos reales.'}{' '}
          Selecciona Iniciar para ver la lluvia. Cambiar el terreno reinicia la
          simulación.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            disabled={!flood || !!floodError}
            onClick={toggleFlood}
            style={{
              padding: '8px 12px',
              background: '#125d88',
              color: 'white',
              border: 0,
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            {running
              ? 'Pausar'
              : simulationRef.current?.started
                ? 'Continuar'
                : 'Iniciar inundación'}
          </button>
          <button
            type="button"
            disabled={!flood || !!floodError}
            onClick={resetFlood}
            style={{
              padding: '8px 12px',
              border: '1px solid #8498a8',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Reiniciar
          </button>
        </div>
        {floodError && <p role="alert">{floodError}</p>}
        {flood && (
          <div role="status" aria-live="off" style={{ fontSize: 13 }}>
            <p>
              {running
                ? 'En marcha'
                : simulationRef.current?.started
                  ? 'En pausa'
                  : 'Lista para iniciar'}{' '}
              · {Math.floor(flood.elapsedTimeInSeconds / 60)} min simulados
            </p>
            <p>
              Agua máxima: {(flood.maxWaterDepthInMeters * 100).toFixed(1)} cm
            </p>
            <p>
              Tramos bloqueados: {flood.blockedRoadEdgeIds.length} · Edificios
              expuestos: {flood.exposedBuildingIds.length}
            </p>
          </div>
        )}
        <small>
          Azul: agua · Rojo: tramo bloqueado (15 cm) · Naranja: edificio
          expuesto (20 cm).
        </small>
      </aside>
    </main>
  );
}
