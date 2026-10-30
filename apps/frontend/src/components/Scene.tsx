'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CityResponse } from './city-types';
import { createRoadLayer } from './create-road-mesh';
import { createDistrictLayer } from './create-district-layer';
import { createBuildingLayer } from './urban-building-layer';
import { createUrbanDetailLayer } from './urban-detail-layer';
import { createUrbanTextures } from './urban-materials';
import { generateCityLife } from './city-life-model';
import { createCityLifeLayer } from './city-life-layer';
import { CityTraffic } from './city-traffic-model';
import { createCityTrafficLayer } from './city-traffic-layer';
import { createRandomCityProfile } from './random-city-profile';
import { CityGenerationControls } from './city-generation-controls';
import { generateCityServices } from './city-services';
import { FrameMetrics, type FrameMeasurement } from './frame-metrics';
import { AdaptivePixelRatio, saveCachedPixelRatio } from './render-quality';
import { applyCameraMove, isFormFieldEvent } from './camera-move';
import { collectDetailObjects, detailsVisible } from './detail-culling';
import { mountCityAssets, type CityAssetLayer } from './city-assets';
import { CityToolbar } from './city-toolbar';
import { createOrganicCity } from './organic-city-model';
import { createOrganicCityLayer } from './organic-city-layer';
import {
  generateCivicLandmarks,
  createCivicLandmarkLayer,
} from './civic-landmarks';
import { DistrictSimulation, type ComparisonArm } from './district-simulation';
import { createCitizenLayer, createDrainLayer } from './citizen-layer';
import { ComparisonPanel } from './comparison-panel';
import { createStaticPopulation } from './static-population';
import { generateWorld } from './world-model';
import {
  createWorldLayer,
  worldCameraPose,
  type WorldLayerName,
  type WorldCameraView,
} from './world-layer';
import { WorldControls } from './world-controls';
import { createFloodLayer } from './flood-layer';
import { createFloodWeather } from './flood-weather';
import {
  createReliefCity,
  createCityGround,
  drapeSurfaceLayer,
} from './terrain-view';
import {
  hazardPreset,
  type CityScenarioInput,
  type FloodSnapshot,
  type HazardKind,
  type StructuralAssessment,
} from '@simulicity/hazards';
import { createCityAtmosphere, type AtmosphereMood } from './city-atmosphere';
import { createHazardEffects } from './hazard-effects';

const HAZARD_MOODS: Record<HazardKind, AtmosphereMood> = {
  rain: 'storm',
  'river-overflow': 'storm',
  tsunami: 'tsunami',
  earthquake: 'dust',
  'strong-wind': 'wind',
};
const WATER_HAZARDS: readonly HazardKind[] = [
  'rain',
  'river-overflow',
  'tsunami',
];

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';
const civicLabels = {
  hospital: 'Centro de salud',
  school: 'Escuela',
  police: 'Policía',
  firestation: 'Bomberos',
  municipal: 'Municipalidad',
  market: 'Mercado',
  museum: 'Museo',
};

export default function Scene() {
  const mountRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<DistrictSimulation | null>(null);
  const trafficRef = useRef<CityTraffic | null>(null);
  const [measurement, setMeasurement] = useState<FrameMeasurement | null>(null);
  const [trafficCount, setTrafficCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [assetStatus, setAssetStatus] = useState<
    'loading' | 'ready' | 'fallback' | 'procedural'
  >('loading');
  const [comparison, setComparison] = useState<
    DistrictSimulation['comparison'] | null
  >(null);
  const [alarmTime, setAlarmTime] = useState<number | null>(null);
  const [arm, setArm] = useState<ComparisonArm>('before');
  const armRef = useRef<ComparisonArm>('before');
  const [speed, setSpeed] = useState<3 | 30 | 300>(30);
  const speedRef = useRef<3 | 30 | 300>(30);
  const [drainCount, setDrainCount] = useState(0);
  const [hazardKind, setHazardKind] = useState<HazardKind>('rain');
  const [structural, setStructural] = useState<StructuralAssessment | null>(
    null,
  );
  const refreshHazardEffectsRef = useRef<(() => void) | null>(null);
  const [flood, setFlood] = useState<FloodSnapshot | null>(null);
  const [floodError, setFloodError] = useState<string | null>(null);
  const [sourceCity, setSourceCity] = useState<CityResponse | null>(null);
  const [reliefMode, setReliefMode] = useState(true);
  const [layoutMode, setLayoutMode] = useState<'organic' | 'grid'>('organic');
  const [citySeed, setCitySeed] = useState(123);
  const [randomizedCity, setRandomizedCity] = useState(false);
  const city = useMemo(
    () =>
      sourceCity
        ? layoutMode === 'organic'
          ? createOrganicCity(sourceCity, citySeed, {
              relief: reliefMode,
              ...(randomizedCity
                ? { profile: createRandomCityProfile(citySeed) }
                : {}),
            }).city
          : reliefMode
            ? createReliefCity(sourceCity)
            : sourceCity
        : null,
    [sourceCity, reliefMode, layoutMode, citySeed, randomizedCity],
  );
  const [worldSeed, setWorldSeed] = useState(123);
  const cityLife = useMemo(
    () => (city ? generateCityLife(city) : null),
    [city],
  );
  const civicLandmarks = useMemo(
    () => (city ? generateCivicLandmarks(city) : null),
    [city],
  );
  const services = useMemo(
    () =>
      city && civicLandmarks
        ? generateCityServices(city, civicLandmarks)
        : null,
    [city, civicLandmarks],
  );
  const world = useMemo(
    () => (city ? generateWorld(city, worldSeed) : null),
    [city, worldSeed],
  );
  const [worldView, setWorldView] = useState<WorldCameraView>('city');
  const cameraViewRef = useRef<WorldCameraView>('city');
  const focusViewRef = useRef<((view: WorldCameraView) => void) | null>(null);
  const worldLayerRef = useRef<ReturnType<typeof createWorldLayer> | null>(
    null,
  );
  const organicLayerRef = useRef<ReturnType<
    typeof createOrganicCityLayer
  > | null>(null);
  const [worldVisible, setWorldVisible] = useState<
    Record<WorldLayerName, boolean>
  >({ sea: true, lake: true, fields: true, expansion: true });
  const worldVisibleRef = useRef(worldVisible);
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
    if (!mount || !city || !world || !cityLife || !civicLandmarks) return;

    if (mount.querySelector('canvas')) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xcbd5df);
    const extent = Math.max(
      city.config.widthInMeters,
      city.config.heightInMeters,
    );

    const viewExtent = Math.max(
      world.bounds.maxX - world.bounds.minX,
      world.bounds.maxZ - world.bounds.minZ,
    );
    const pose = worldCameraPose(world, cameraViewRef.current);
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      2,
      viewExtent * 10,
    );
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);

    const quality = new AdaptivePixelRatio(window.devicePixelRatio || 1);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(quality.value);
    renderer.shadowMap.enabled = true;
    // Cached shadow map: the sun and the city are static, so shadows render
    // once and are reused until a collapse or effect change invalidates them.
    renderer.shadowMap.autoUpdate = false;
    let shadowDirty = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...pose.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 20;
    controls.maxDistance = viewExtent * 5;
    controls.maxPolarAngle = Math.PI / 2;
    // Free movement: right-drag/two-finger pan travels across the map and
    // zoom lands where the cursor points, instead of a fixed orbit centre.
    controls.enablePan = true;
    controls.panSpeed = 1.2;
    controls.screenSpacePanning = false;
    controls.zoomToCursor = true;
    controls.update();
    const pressedKeys = new Set<string>();
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isFormFieldEvent(event)
      )
        return;
      pressedKeys.add(event.key.toLowerCase());
    };
    const onKeyUp = (event: KeyboardEvent) =>
      pressedKeys.delete(event.key.toLowerCase());
    const onBlur = () => pressedKeys.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    focusViewRef.current = (view) => {
      const next = worldCameraPose(world, view);
      camera.position.set(...next.position);
      controls.target.set(...next.target);
      controls.update();
    };
    const worldLayer = createWorldLayer(world);
    for (const key of Object.keys(worldLayer.layers) as WorldLayerName[])
      worldLayer.layers[key].visible = worldVisibleRef.current[key];
    scene.add(worldLayer.group);
    worldLayerRef.current = worldLayer;

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
    const fallbackBuildings = createBuildingLayer(city);
    scene.add(fallbackBuildings);
    setAssetStatus(city.organic ? 'loading' : 'procedural');
    let assetLayer: CityAssetLayer | null = null;
    const releaseAssets = city.organic
      ? mountCityAssets(
          city,
          scene,
          fallbackBuildings,
          setAssetStatus,
          undefined,
          (layer) => {
            assetLayer = layer;
            shadowDirty = true;
          },
        )
      : () => {};
    const traffic = new CityTraffic(city);
    trafficRef.current = traffic;
    setTrafficCount(traffic.vehicles.length);
    setMeasurement(null);
    const trafficLayer = createCityTrafficLayer(city);
    trafficLayer.update(traffic.vehicles);
    scene.add(trafficLayer.group);
    // Parked props occupy driving lanes; retain them only without dynamic traffic.
    const streetLifeLayer = createCityLifeLayer(
      city,
      traffic.vehicles.length
        ? {
            items: cityLife.items.filter(
              (item) => !['car', 'taxi', 'van', 'bus'].includes(item.kind),
            ),
          }
        : cityLife,
    );
    const civicLayer = createCivicLandmarkLayer(city, civicLandmarks);
    scene.add(streetLifeLayer.group, civicLayer.group);
    const organicLayer = city.organic ? createOrganicCityLayer(city) : null;
    organicLayerRef.current = organicLayer;
    if (organicLayer) {
      const water = organicLayer.group.getObjectByName('organic-water');
      if (water) water.visible = worldVisibleRef.current.lake;
      scene.add(organicLayer.group);
    }
    const textures = createUrbanTextures(false);
    if (textures.asphalt) textures.asphalt.repeat.set(70, 2);
    if (textures.grass) textures.grass.repeat.set(64, 64);

    // Calles
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: textures.asphalt ? 0xffffff : 0x555555,
      roughness: 1,
      ...(textures.asphalt ? { map: textures.asphalt } : {}),
    });
    const bridgeRoadIds = new Set(
      city.organic?.bridges.flatMap((bridge) => bridge.roadIds),
    );
    const roadLayer = createRoadLayer(
      city.roads.filter((road) => !bridgeRoadIds.has(road.id)),
      city.terrain.elevationInMeters,
      roadMaterial,
      city.organic ? (city.district?.roadWidthInMeters ?? 6) : 6,
    );
    scene.add(drapeSurfaceLayer(roadLayer, city));
    scene.add(drapeSurfaceLayer(createDistrictLayer(city), city));
    const urbanDetailLayer = createUrbanDetailLayer(city, textures.concrete);
    scene.add(drapeSurfaceLayer(urbanDetailLayer, city));
    // Distance culling: sub-metre details render only when zoomed in.
    const detailObjects = [
      ...collectDetailObjects(fallbackBuildings),
      ...collectDetailObjects(urbanDetailLayer),
    ];
    let detailsShown = true;

    // Suelo
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: textures.grass ? 0xffffff : 0xa6b09a,
      roughness: 1,
      ...(textures.grass ? { map: textures.grass } : {}),
    });
    const ground = createCityGround(city, groundMaterial);
    scene.add(ground);
    ground.receiveShadow = true;
    const resize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', resize);

    let simulation: DistrictSimulation | null = null;
    let citizenLayer: ReturnType<typeof createCitizenLayer> | null = null;
    let drainLayer: ReturnType<typeof createDrainLayer> | null = null;
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
        const people = createStaticPopulation(city);
        simulation = new DistrictSimulation(
          { ...city, citizens: people },
          {
            evacuationEnabled: true,
            alarmMode: 'automatic',
            autoStart: true,
            hazard: hazardKind,
          },
        );
        simulation.selectArm(armRef.current);
        simulation.setSpeed(30);
        speedRef.current = 30;
        setSpeed(30);
        setRunning(simulation.running);
        floodLayer = createFloodLayer(input, simulation.cells, true);
        citizenLayer = createCitizenLayer(city, people.length);
        drainLayer = createDrainLayer(city, simulation.drains);
        scene.add(citizenLayer.group, drainLayer.group);
        setComparison(simulation.comparison);
        setAlarmTime(simulation.alarmTime);
        setStructural(simulation.structural);
        setDrainCount(simulation.drains.length);
        scene.add(floodLayer.group);
        simulationRef.current = simulation;
        setFlood(simulation.snapshot);
        setFloodError(null);
      } catch {
        setFloodError('No se pudo preparar el evento para esta ciudad.');
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
    const atmosphere = createCityAtmosphere(
      {
        x: city.config.widthInMeters / 2,
        z: city.config.heightInMeters / 2,
      },
      viewExtent,
      HAZARD_MOODS[hazardKind],
    );
    scene.add(atmosphere.group);
    // Efectos propios de la catástrofe (daños, escombros, ola, viento).
    let hazardEffects: ReturnType<typeof createHazardEffects> | null = null;
    const refreshHazardEffects = () => {
      if (hazardEffects) {
        scene.remove(hazardEffects.group);
        hazardEffects.dispose();
        hazardEffects = null;
      }
      if (simulation) {
        hazardEffects = createHazardEffects(
          city,
          hazardKind,
          simulation.structural,
        );
        scene.add(hazardEffects.group);
        shadowDirty = true;
      }
    };
    refreshHazardEffects();
    refreshHazardEffectsRef.current = refreshHazardEffects;
    // Derrumbe animado de los edificios reales: el progreso (0-1) avanza
    // en tiempo real hacia el objetivo que dicta el estado físico.
    const buildingHeightById = new Map(
      city.buildings.map((b) => [b.id, b.heightInMeters]),
    );
    const collapseTargets = new Map<string, number>();
    const collapseProgress = new Map<string, number>();
    const fallbackOriginals = new Map<
      string,
      { y: number; rotationZ: number; scaleY: number }
    >();
    const applyFallbackCollapse = (buildingId: string, progress: number) => {
      for (const name of [buildingId, `foundation:${buildingId}`]) {
        const object = fallbackBuildings.getObjectByName(name);
        if (!object) continue;
        const key = `${name}:collapse`;
        if (!fallbackOriginals.has(key))
          fallbackOriginals.set(key, {
            y: object.position.y,
            rotationZ: object.rotation.z,
            scaleY: object.scale.y,
          });
        const original = fallbackOriginals.get(key)!;
        const height = buildingHeightById.get(buildingId) ?? 6;
        const direction =
          [...buildingId].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 2 ===
          0
            ? 1
            : -1;
        object.position.y = original.y - progress * height * 0.4;
        object.rotation.z = original.rotationZ + progress * 0.14 * direction;
        object.scale.y = original.scaleY * (1 - 0.62 * progress);
      }
    };
    const syncCollapseTargets = () => {
      if (!simulation) return;
      collapseTargets.clear();
      for (const impact of simulation.buildingImpacts) {
        if (impact.condition === 'collapsed')
          collapseTargets.set(impact.buildingId, 1);
        else if (impact.condition === 'damaged' && impact.severity >= 0.85)
          collapseTargets.set(impact.buildingId, 0.18);
      }
      hazardEffects?.update(
        simulation.buildingImpacts,
        simulation.selectedCollapsedBlockedRoadEdgeIds,
      );
      if (hazardKind === 'tsunami' && hazardEffects) {
        // El frente de la ola es el agua más avanzada del solver.
        let front = -20;
        simulation.cells.forEach((cell, index) => {
          if (
            (simulation.snapshot.waterDepthInMeters[index] ?? 0) >= 0.12 &&
            cell.maxX > front
          )
            front = cell.maxX;
        });
        hazardEffects.setWaveFront(
          front,
          simulation.snapshot.maxWaterDepthInMeters,
        );
      }
    };
    let appliedAssetLayer: CityAssetLayer | null = null;
    const animateCollapses = (deltaSeconds: number): boolean => {
      let moved = false;
      // Si los modelos locales terminan de cargar a mitad de un derrumbe,
      // reaplicar el progreso ya alcanzado sobre la capa nueva.
      if (assetLayer !== appliedAssetLayer) {
        appliedAssetLayer = assetLayer;
        if (assetLayer)
          for (const [id, progress] of collapseProgress)
            assetLayer.setBuildingCollapse(id, progress);
      }
      const ids = new Set([
        ...collapseTargets.keys(),
        ...collapseProgress.keys(),
      ]);
      for (const id of ids) {
        const target = collapseTargets.get(id) ?? 0;
        const current = collapseProgress.get(id) ?? 0;
        if (Math.abs(target - current) < 0.002) continue;
        const next =
          current +
          Math.sign(target - current) *
            Math.min(Math.abs(target - current), deltaSeconds / 0.9);
        collapseProgress.set(id, next);
        moved = true;
        applyFallbackCollapse(id, next);
        assetLayer?.setBuildingCollapse(id, next);
        if (next === 0 && target === 0) collapseProgress.delete(id);
      }
      return moved;
    };
    const stormFog = new THREE.Fog(
      hazardKind === 'earthquake'
        ? 0xd8c9a8
        : hazardKind === 'tsunami'
          ? 0xaecdd4
          : 0xb9cdd4,
      viewExtent * 0.55,
      viewExtent * 3.5,
    );
    let stormActive = false;
    let frameId: number;
    let previousTime: number | null = null;
    let displayedSnapshot: FloodSnapshot | null = null;
    let observedAlarm = false;
    const frameMetrics = new FrameMetrics();
    const roadIdByEdge = new Map(
      city.roadGraph?.edges?.map((edge) => [edge.id, edge.roadId]),
    );
    const blockedTrafficRoads = new Set<string>();
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
        setComparison(simulation.comparison);
        setAlarmTime(simulation.alarmTime);
        if (!observedAlarm && simulation.alarmTime !== null) {
          observedAlarm = true;
          simulation.setSpeed(3);
          speedRef.current = 3;
          setSpeed(3);
        }
      }
      if (simulation) {
        if (simulation.alarmTime === null) observedAlarm = false;
        citizenLayer?.update(
          simulation.evacuation,
          simulation.running && !document.hidden ? delta : 0,
          simulation.arm,
        );
        if (drainLayer) drainLayer.group.visible = simulation.arm === 'after';
      }
      if (!document.hidden && simulation?.running) {
        blockedTrafficRoads.clear();
        for (const edgeId of simulation.selectedBlockedRoadEdgeIds) {
          const roadId = roadIdByEdge.get(edgeId);
          if (roadId) blockedTrafficRoads.add(roadId);
        }
        trafficLayer.update(traffic.advance(delta, blockedTrafficRoads));
      }
      if (simulation && simulation.snapshot !== displayedSnapshot) {
        floodLayer?.update(simulation.snapshot);
        displayedSnapshot = simulation.snapshot;
        syncCollapseTargets();
      }
      const collapsesMoved = animateCollapses(document.hidden ? 0 : delta);
      worldLayer.animate(document.hidden ? 0 : delta);
      // Building LOD swaps change casters, so the cached shadow map refreshes.
      if (assetLayer?.update?.(camera.position)) shadowDirty = true;
      organicLayer?.animate(document.hidden ? 0 : delta);
      atmosphere.animate(document.hidden ? 0 : delta);
      const active = simulation?.started ?? false;
      const animateStorm = !!simulation?.running && !document.hidden;
      hazardEffects?.animate(
        document.hidden ? 0 : delta,
        animateStorm && active,
      );
      // La lluvia visible solo acompaña a lluvia y desborde; el tsunami,
      // el terremoto y el viento tienen sus propios efectos.
      const rainy = hazardKind === 'rain' || hazardKind === 'river-overflow';
      weather.animate(animateStorm ? delta : 0, active && rainy, animateStorm);
      if (animateStorm) floodLayer?.animate(delta);
      if (active !== stormActive) {
        stormActive = active;
        if (scene.background instanceof THREE.Color)
          scene.background.set(active ? 0xb9cdd4 : 0xcbd5df);
        scene.fog = active ? stormFog : null;
        dirLight.intensity = active ? 2.3 : 2.5;
        skyLight.intensity = active ? 1.9 : 2;
      }
      applyCameraMove(
        camera,
        controls.target,
        pressedKeys,
        delta,
        viewExtent * 0.45 * (pressedKeys.has('shift') ? 3 : 1),
      );
      const showDetails = detailsVisible(
        camera.position.distanceTo(controls.target),
        viewExtent,
      );
      if (showDetails !== detailsShown) {
        detailsShown = showDetails;
        for (const object of detailObjects) object.visible = showDetails;
      }
      controls.update();
      if (shadowDirty || collapsesMoved) {
        renderer.shadowMap.needsUpdate = true;
        shadowDirty = false;
      }
      const renderStarted = performance.now();
      const recordFrame = () => {
        if (document.hidden) {
          frameMetrics.reset();
          return;
        }
        const next = frameMetrics.sample(
          time,
          performance.now() - renderStarted,
          renderer.info.render.calls,
          renderer.info.render.triangles,
        );
        if (next) {
          setMeasurement(next);
          const changed = quality.evaluate(next.fps);
          if (changed !== null) {
            renderer.setPixelRatio(changed);
            saveCachedPixelRatio(changed);
          }
        }
      };
      // Sacudida breve de cámara al inicio del terremoto (solo visual).
      if (
        hazardKind === 'earthquake' &&
        active &&
        animateStorm &&
        simulation &&
        simulation.snapshot.elapsedTimeInSeconds < 90
      ) {
        const t = performance.now() / 1000;
        const decay = 1 - simulation.snapshot.elapsedTimeInSeconds / 90;
        camera.position.x += Math.sin(t * 31) * 0.35 * decay;
        camera.position.y += Math.sin(t * 43) * 0.22 * decay;
        renderer.render(scene, camera);
        recordFrame();
        camera.position.x -= Math.sin(t * 31) * 0.35 * decay;
        camera.position.y -= Math.sin(t * 43) * 0.22 * decay;
        return;
      }
      renderer.render(scene, camera);
      recordFrame();
    }
    // Transform cache: static layers never recompute matrices per frame.
    // Dynamic roots (people, traffic, water, weather, effects) keep updating.
    scene.updateMatrixWorld(true);
    const dynamicRoots = new Set<THREE.Object3D>([
      trafficLayer.group,
      weather.group,
      atmosphere.group,
      fallbackBuildings,
    ]);
    const hazardGroup = () => hazardEffects?.group;
    for (const root of [
      citizenLayer?.group,
      drainLayer?.group,
      floodLayer?.group,
      hazardGroup(),
    ])
      if (root) dynamicRoots.add(root);
    const freezeStatic = (object: THREE.Object3D) => {
      if (dynamicRoots.has(object)) return;
      object.matrixAutoUpdate = false;
      for (const child of object.children) freezeStatic(child);
    };
    for (const child of [...scene.children]) freezeStatic(child);
    animate(performance.now());

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      releaseAssets();
      focusViewRef.current = null;
      worldLayerRef.current = null;
      organicLayerRef.current = null;
      scene.remove(worldLayer.group);
      worldLayer.dispose();
      scene.remove(weather.group);
      weather.dispose();
      refreshHazardEffectsRef.current = null;
      if (hazardEffects) {
        scene.remove(hazardEffects.group);
        hazardEffects.dispose();
      }
      scene.remove(atmosphere.group);
      atmosphere.dispose();
      scene.remove(streetLifeLayer.group, civicLayer.group);
      streetLifeLayer.dispose();
      civicLayer.dispose();
      scene.remove(trafficLayer.group);
      trafficLayer.dispose();
      trafficRef.current = null;
      if (organicLayer) {
        scene.remove(organicLayer.group);
        organicLayer.dispose();
      }
      simulation?.pause();
      if (citizenLayer) {
        scene.remove(citizenLayer.group);
        citizenLayer.dispose();
      }
      if (drainLayer) {
        scene.remove(drainLayer.group);
        drainLayer.dispose();
      }
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
  }, [city, world, cityLife, civicLandmarks, hazardKind]);

  function applyWorldSeed(seed: number) {
    if (seed === worldSeed) return;
    setRunning(false);
    setFlood(null);
    setComparison(null);
    setAlarmTime(null);
    setWorldSeed(seed);
  }

  function toggleFlood() {
    const simulation = simulationRef.current;
    if (!simulation) return;
    if (simulation.running) simulation.pause();
    else simulation.start();
    setRunning(simulation.running);
    setComparison(simulation.comparison);
    setAlarmTime(simulation.alarmTime);
  }

  function resetFlood() {
    const simulation = simulationRef.current;
    if (!simulation) return;
    simulation.reset();
    trafficRef.current?.reset();
    simulation.setSpeed(30);
    speedRef.current = 30;
    setSpeed(30);
    simulation.start();
    setRunning(simulation.running);
    setFlood(simulation.snapshot);
    setComparison(simulation.comparison);
    setAlarmTime(simulation.alarmTime);
    setStructural(simulation.structural);
    refreshHazardEffectsRef.current?.();
  }

  function applyHazard(kind: HazardKind) {
    if (kind === hazardKind) return;
    setRunning(false);
    setFlood(null);
    setComparison(null);
    setAlarmTime(null);
    setStructural(null);
    setHazardKind(kind);
  }

  function regenerateCity(seed: number, randomProfile = randomizedCity) {
    if (
      seed === citySeed &&
      randomProfile === randomizedCity &&
      layoutMode === 'organic'
    ) {
      resetFlood();
      return;
    }
    setRunning(false);
    setFlood(null);
    setComparison(null);
    setAlarmTime(null);
    setRandomizedCity(randomProfile);
    setLayoutMode('organic');
    setCitySeed(seed);
  }

  function generateRandomCity() {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    const seed = values[0] ?? 0;
    regenerateCity(seed === citySeed ? (seed + 1) >>> 0 : seed, true);
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
      <CityToolbar
        buildings={city.buildings.length}
        people={city.citizens?.length ?? 0}
        seed={city.config.seed ?? 1}
        organic={!!city.organic}
        running={running}
        ready={!!flood && !floodError}
        panelOpen={panelOpen}
        view={worldView}
        elapsedSeconds={flood?.elapsedTimeInSeconds ?? 0}
        assetStatus={assetStatus}
        hazard={hazardKind}
        onHazard={applyHazard}
        onPanelToggle={() => setPanelOpen((open) => !open)}
        onRegenerate={() => regenerateCity((citySeed + 1) >>> 0)}
        onRandom={generateRandomCity}
        onView={(view) => {
          cameraViewRef.current = view;
          setWorldView(view);
          focusViewRef.current?.(view);
        }}
        onToggle={toggleFlood}
        onReset={resetFlood}
      />
      <output
        aria-label="Rendimiento de la ciudad"
        style={{
          position: 'absolute',
          top: 104,
          right: 16,
          padding: '8px 12px',
          borderRadius: 10,
          background: '#f9fcfaf0',
          color: '#20353a',
          font: '12px system-ui',
          pointerEvents: 'none',
        }}
      >
        {measurement ? (
          <>
            {measurement.fps.toFixed(0)} FPS ·{' '}
            {measurement.frameMilliseconds.toFixed(1)} ms/cuadro
            <br />
            CPU render: {measurement.renderMilliseconds.toFixed(1)} ms ·{' '}
            {measurement.drawCalls} draw calls
            <br />
            {measurement.triangles.toLocaleString('es')} triángulos ·{' '}
            {trafficCount} vehículos
          </>
        ) : (
          'Midiendo rendimiento…'
        )}
      </output>
      {panelOpen && (
        <aside
          id="city-settings"
          aria-label="Información del distrito"
          style={{
            position: 'absolute',
            top: 100,
            left: 16,
            width: 300,
            maxWidth: 'calc(100vw - 32px)',
            maxHeight: 'calc(100vh - 190px)',
            overflowY: 'auto',
            padding: 16,
            borderRadius: 12,
            background: 'rgba(255,255,255,0.94)',
            color: '#17252a',
            fontFamily: 'sans-serif',
            boxShadow: '0 4px 24px #0002',
          }}
        >
          <strong>Opciones del simulador</strong>
          <CityGenerationControls
            key={`${citySeed}:${randomizedCity}`}
            seed={citySeed}
            randomized={randomizedCity}
            onGenerate={(seed) => regenerateCity(seed)}
            onRandom={generateRandomCity}
          />
          {world && (
            <WorldControls
              seed={worldSeed}
              width={world.bounds.maxX - world.bounds.minX}
              height={world.bounds.maxZ - world.bounds.minZ}
              fields={world.fields.length}
              visible={worldVisible}
              view={worldView}
              onSeed={applyWorldSeed}
              onGenerate={() => applyWorldSeed((worldSeed + 1) >>> 0)}
              onLayer={(layer, visible) => {
                worldVisibleRef.current = {
                  ...worldVisibleRef.current,
                  [layer]: visible,
                };
                setWorldVisible(worldVisibleRef.current);
                const current = worldLayerRef.current;
                if (current) current.layers[layer].visible = visible;
                if (layer === 'lake') {
                  const water =
                    organicLayerRef.current?.group.getObjectByName(
                      'organic-water',
                    );
                  if (water) water.visible = visible;
                }
              }}
              onView={(view) => {
                cameraViewRef.current = view;
                setWorldView(view);
                focusViewRef.current?.(view);
              }}
            />
          )}
          <p style={{ margin: '8px 0' }}>
            Ciudad: {city.config.widthInMeters} × {city.config.heightInMeters} m
            · {city.buildings.length} edificios · Semilla {city.config.seed}
          </p>
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              alignItems: 'center',
              fontSize: 12,
            }}
          >
            <label>
              Trazado{' '}
              <select
                aria-label="Trazado de ciudad"
                value={layoutMode}
                onChange={(event) => {
                  setRunning(false);
                  setFlood(null);
                  setComparison(null);
                  setAlarmTime(null);
                  setLayoutMode(event.target.value as 'organic' | 'grid');
                }}
              >
                <option value="organic">Orgánico · lago y puente</option>
                <option value="grid">Grilla original</option>
              </select>
            </label>
            <button
              type="button"
              disabled={layoutMode !== 'organic'}
              onClick={() => {
                setRunning(false);
                setFlood(null);
                setComparison(null);
                setAlarmTime(null);
                setCitySeed((seed) => (seed + 1) >>> 0);
              }}
            >
              Generar otra ciudad
            </button>
          </div>
          {city.organic && (
            <p style={{ fontSize: 12 }}>
              Barrios: centro, residencial y comercial · Lago y canal integrados
              · {city.organic.bridges.length} puente conectado a las calles. Las
              zonas urbanizadas siguen las orillas; la grilla de cálculo sigue
              siendo rectangular.
            </p>
          )}
          <p style={{ margin: '8px 0' }}>
            Plazas: {city.district?.parks.length ?? 0} · Refugios:{' '}
            {city.shelters?.length ?? 0}
          </p>
          <small>
            Casas con techo · Departamentos con balcones · Comercios con
            vidriera
          </small>
          <details style={{ marginTop: 10, fontSize: 12 }}>
            <summary>Servicios y movilidad urbana</summary>
            <p>
              {civicLandmarks?.assignments
                .map((item) => civicLabels[item.role])
                .join(' · ') || 'Sin edificios aptos para servicios visuales'}
            </p>
            <p>
              Vehículos en tránsito: {trafficCount} · Estacionados:{' '}
              {trafficCount
                ? 0
                : (cityLife?.items.filter((item) =>
                    ['car', 'taxi', 'van', 'bus'].includes(item.kind),
                  ).length ?? 0)}{' '}
              · Paradas:{' '}
              {cityLife?.items.filter((item) => item.kind === 'bus-stop')
                .length ?? 0}{' '}
              · Semáforos:{' '}
              {cityLife?.items.filter((item) => item.kind === 'traffic-light')
                .length ?? 0}
            </p>
            <p>
              Tránsito cinemático con aceleración, frenado, separación y turnos
              en cruces. Respeta cierres por agua y escombros. No incluye
              impactos de cuerpos rígidos ni colisiones con peatones.
            </p>
            <strong>Acceso sintético por la red vial</strong>
            {services?.roles.map((service) => (
              <p key={service.role}>
                {civicLabels[service.role]}: {service.facilityCount} sede ·{' '}
                {service.reachableBuildingCount}/
                {services.residentialBuildingCount} viviendas conectadas
                {service.meanDistanceInMeters !== null &&
                  ` · recorrido medio ${Math.round(service.meanDistanceInMeters)} m`}
              </p>
            ))}
            <p>
              Accesos estimados al nodo vial más cercano; no se modelan
              entradas, capacidad, despachos ni seguridad durante la catástrofe.
              No es cobertura real de servicios.
            </p>
          </details>
          <p style={{ margin: '8px 0 0', fontSize: 12 }}>
            Arrastra para girar · Arrastra con botón derecho para desplazarte ·
            Rueda para acercar donde apunta el cursor · WASD/flechas para
            moverte, Q/E para bajar/subir, Shift para ir más rápido. Terreno y
            población sintéticos; simulación demostrativa, no predicción real.
          </p>
          <hr style={{ margin: '12px 0', borderColor: '#ddd' }} />
          <strong>Catástrofe: {hazardPreset(hazardKind).label}</strong>
          <p style={{ margin: '8px 0', fontSize: 12, color: '#425466' }}>
            {hazardPreset(hazardKind).description} Cambiar de catástrofe en la
            barra superior reinicia el evento con la misma ciudad.
          </p>
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
              <option value="basin">
                {city.organic
                  ? 'Relieve y cuencas'
                  : 'Relieve con zona baja · demo'}
              </option>
              <option value="flat">
                {city.organic ? 'Llanura con cuencas' : 'Plano · original'}
              </option>
            </select>
          </label>
          <p style={{ margin: '8px 0', fontSize: 12 }}>
            {hazardKind === 'earthquake' &&
              `Magnitud ${hazardPreset(hazardKind).magnitude} · daño estructural y escombros. `}
            {hazardKind === 'strong-wind' &&
              `Rachas de ${hazardPreset(hazardKind).windSpeedKmh} km/h · daño en edificios altos. `}
            {hazardKind === 'tsunami' &&
              `Ola de ${hazardPreset(hazardKind).waveHeightInMeters} m entrando desde el oeste. `}
            {WATER_HAZARDS.includes(hazardKind) &&
              hazardKind !== 'tsunami' &&
              `Agua animada · Lluvia: ${hazardPreset(hazardKind).rainIntensityMmPerHour} mm/h · Drenaje: ${hazardPreset(hazardKind).drainRateMmPerHour} mm/h. `}
            Tiempo acelerado: 1 segundo = {speed / 60} minutos simulados.
          </p>
          <p style={{ fontSize: 12, color: '#425466' }}>
            {city.organic
              ? 'Geografía local con cauce excavado, lago y barrios irregulares. El puente conserva su tablero por encima del agua; las rutas usan su altura.'
              : city.terrainProfile === 'basin'
                ? 'Relieve local sintético con pendiente y depresión central; grilla de 10 m. El agua se acumula primero en zonas bajas.'
                : 'Terreno plano original con edificios como barreras y absorción diferenciada.'}{' '}
            El evento comienza automáticamente. Cambiar el terreno reinicia la
            simulación.
          </p>
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: 10,
            }}
          >
            <label style={{ fontSize: 12 }}>
              Vista{' '}
              <select
                aria-label="Escenario visible"
                value={arm}
                onChange={(event) => {
                  const selected = event.target.value as ComparisonArm;
                  armRef.current = selected;
                  setArm(selected);
                  const simulation = simulationRef.current;
                  if (simulation) {
                    simulation.selectArm(selected);
                    setFlood(simulation.snapshot);
                    setComparison(simulation.comparison);
                    setStructural(simulation.structural);
                    refreshHazardEffectsRef.current?.();
                  }
                }}
              >
                <option value="before">Sin mejora</option>
                <option value="after">Con mejora</option>
              </select>
            </label>
            <label style={{ fontSize: 12 }}>
              Velocidad{' '}
              <select
                aria-label="Velocidad de simulación"
                value={speed}
                onChange={(event) => {
                  const value = Number(event.target.value) as 3 | 30 | 300;
                  speedRef.current = value;
                  setSpeed(value);
                  simulationRef.current?.setSpeed(value);
                }}
              >
                <option value={3}>3× · caminar</option>
                <option value={300}>300× · evento</option>
                <option value={30}>30× · detalle</option>
              </select>
            </label>
          </div>
          <p style={{ fontSize: 12 }}>
            {hazardKind === 'earthquake' &&
              'Mejora: refuerzo sísmico; reduce la severidad del daño estructural.'}
            {hazardKind === 'strong-wind' &&
              'Mejora: techos asegurados; reduce la severidad del daño por viento.'}
            {WATER_HAZARDS.includes(hazardKind) &&
              `Mejora: ${drainCount} sumideros de 0.15 m³/s y absorción adicional de plazas de 60 mm/h en lugar de 15 mm/h.`}
          </p>
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
              {WATER_HAZARDS.includes(hazardKind) && (
                <p>
                  Agua máxima: {(flood.maxWaterDepthInMeters * 100).toFixed(1)}{' '}
                  cm
                </p>
              )}
              {comparison && comparison[arm].damagedBuildings > 0 && (
                <p>
                  Edificios dañados: {comparison[arm].damagedBuildings} ·
                  Derrumbados: {comparison[arm].collapsedBuildings}
                  {structural &&
                    ` · Severidad máxima: ${(structural.maxSeverity * 100).toFixed(0)}%`}
                </p>
              )}
              {comparison && comparison[arm].trapped > 0 && (
                <p>
                  Personas atrapadas en derrumbes: {comparison[arm].trapped} ·
                  Evacuadas: {comparison[arm].evacuated}
                </p>
              )}
              <p>
                Tramos bloqueados:{' '}
                {
                  new Set([
                    ...flood.blockedRoadEdgeIds,
                    ...(simulationRef.current
                      ?.selectedCollapsedBlockedRoadEdgeIds ?? []),
                  ]).size
                }{' '}
                · Edificios expuestos: {flood.exposedBuildingIds.length}
              </p>
            </div>
          )}
          <small>
            Azul: agua · Rojo: tramo bloqueado · Naranja/rojo con rejilla:
            edificio expuesto o dañado · Gris: escombros de derrumbes · Violeta:
            persona atrapada.
          </small>
          <p style={{ fontSize: 12 }}>
            Personas: {city.citizens?.length ?? 0}. La simulación comienza al
            cargar. Al detectar calles bloqueadas o edificios expuestos, la
            alarma activa la evacuación automática hacia los refugios. La alarma
            reduce la velocidad a 3× para observar la caminata. Sin IA
            conectada. Sumideros: cian.
          </p>
          {comparison && (
            <ComparisonPanel
              comparison={comparison}
              alarmTime={alarmTime}
              total={city.citizens?.length ?? 0}
              hazardLabel={hazardPreset(hazardKind).label.toLowerCase()}
              improvementLabel={
                hazardKind === 'earthquake'
                  ? 'cambia el refuerzo sísmico'
                  : hazardKind === 'strong-wind'
                    ? 'cambian los techos asegurados'
                    : 'cambia el drenaje'
              }
            />
          )}
          <p style={{ fontSize: 11 }}>
            Grilla aproximada: barreras por centro de celda, sin escorrentía de
            techos ni seguridad real de refugios.
          </p>
        </aside>
      )}
    </main>
  );
}
