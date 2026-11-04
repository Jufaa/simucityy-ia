'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  sameCityGeneration,
  type CityGenerationMode,
} from './city-generation-preset';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CityResponse } from './city-types';
import { createRoadLayer } from './create-road-mesh';
import { createDistrictLayer } from './create-district-layer';
import {
  attachBuildingCollapse,
  createBuildingLayer,
} from './urban-building-layer';
import { createUrbanDetailLayer } from './urban-detail-layer';
import { createUrbanTextures } from './urban-materials';
import { generateCityLife } from './city-life-model';
import { createCityLifeLayer } from './city-life-layer';
import { createStreetLabelLayer } from './street-labels';
import { LoadingScreen } from './loading-screen';
import { BeforeAfterSlider } from './before-after-slider';
import {
  simulationProgress,
  shouldFinishSimulation,
} from './simulation-launch';
import { FinalSummary } from './final-summary';
import { buildEventLog, type EventSample } from './event-log';
import { recommendImprovements } from './recommendation';
import {
  deleteSavedScenario,
  loadSavedScenarios,
  saveScenario,
  type SavedScenario,
} from './saved-scenarios';
import { CityTraffic } from './city-traffic-model';
import { createCityTrafficLayer } from './city-traffic-layer';
import {
  createRandomCityProfile,
  type RandomCityProfile,
} from './random-city-profile';
import { requestAiCityPlan, type AiCityPlanResult } from './ai-city';
import { requestEmergencyReport, requestInterventions } from './ai-agent';
import { requestCitizenVoice, type CitizenVoiceResult } from './citizen-voice';
import { resilienceGrade, resilienceScore, buildShareText } from './resilience';
import { buildAlertMessages } from './alerts';
import {
  CitizenVoicePanel,
  NewsTicker,
  ShareResultButton,
  WhatsAppPanel,
} from './extras-panel';
import { pickAutoDrainPoints } from './auto-drains';
import { AgentPanel, type AgentHistoryEntry } from './ai-panels';
import { CityStartScreen } from './city-start-screen';
import { CityGenerationControls } from './city-generation-controls';
import { generateCityServices } from './city-services';
import { FrameMetrics, type FrameMeasurement } from './frame-metrics';
import {
  AdaptivePixelRatio,
  loadCachedPixelRatio,
  saveCachedPixelRatio,
} from './render-quality';
import { applyCameraMove, isFormFieldEvent } from './camera-move';
import { collapseDurationSeconds, collapseEase } from './collapse-animation';
import { collectDetailObjects, detailsVisible } from './detail-culling';
import { mountCityAssets, type CityAssetLayer } from './city-assets';
import { CityToolbar } from './city-toolbar';
import { createOrganicCity } from './organic-city-model';
import { createRealCity, type RealCitySource } from './real-city-model';
import { RealCityImporter } from './real-city-importer';
import { RealCityImportScreen } from './real-city-import-screen';
import {
  simField,
  simGhostButton,
  simGlassPanel,
  simPrimaryButton,
  simTheme,
} from './ui-theme';
import { HAZARD_LABELS } from './hazard-selector';
import { LanguageContext, pick, type AppLanguage } from './language';
import eixampleSourceJson from '../data/eixample-source.json';

const eixampleSource = eixampleSourceJson as unknown as RealCitySource;
import { createOrganicCityLayer } from './organic-city-layer';
import {
  generateCivicLandmarks,
  createCivicLandmarkLayer,
} from './civic-landmarks';
import { DistrictSimulation, type ComparisonArm } from './district-simulation';
import { createCitizenLayer, createDrainLayer } from './citizen-layer';
import { ComparisonPanel } from './comparison-panel';
import { buildImpactNarrative, buildImpactSummary } from './impact-summary';
import { ImpactPanel } from './impact-panel';
import { buildDemoSteps, type DemoStep } from './demo-tour';
import { DemoTourPanel } from './demo-tour-panel';
import { buildReport, downloadReport } from './report';
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
  createTerrainSkirt,
  drapeSurfaceLayer,
  sampleTerrainHeight,
} from './terrain-view';
import {
  EARTHQUAKE_MAGNITUDE_LIMITS,
  TSUNAMI_WAVE_HEIGHT_LIMITS_IN_METERS,
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
const civicLabels: Record<string, { en: string; es: string }> = {
  hospital: { en: 'Health center', es: 'Centro de salud' },
  school: { en: 'School', es: 'Escuela' },
  police: { en: 'Police', es: 'Policía' },
  firestation: { en: 'Fire station', es: 'Bomberos' },
  municipal: { en: 'City hall', es: 'Municipalidad' },
  market: { en: 'Market', es: 'Mercado' },
  museum: { en: 'Museum', es: 'Museo' },
};

/** Ray-casting point-in-polygon for footprint picking (presentation only). */
function pointInPolygon(
  point: { x: number; y: number },
  polygon: readonly { x: number; y: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!,
      b = polygon[j]!;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

export default function Scene() {
  const mountRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<DistrictSimulation | null>(null);
  const trafficRef = useRef<CityTraffic | null>(null);
  const [measurement, setMeasurement] = useState<FrameMeasurement | null>(null);
  const [trafficCount, setTrafficCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [demoStep, setDemoStep] = useState<number | null>(null);
  const [importCardOpen, setImportCardOpen] = useState(false);
  const [assetStatus, setAssetStatus] = useState<
    'loading' | 'ready' | 'fallback' | 'procedural'
  >('loading');
  const [comparison, setComparison] = useState<
    DistrictSimulation['comparison'] | null
  >(null);
  const [alarmTime, setAlarmTime] = useState<number | null>(null);
  const [arm, setArm] = useState<ComparisonArm>('before');
  const armRef = useRef<ComparisonArm>('before');
  const [, setSpeed] = useState<3 | 30 | 300>(30);
  const speedRef = useRef<3 | 30 | 300>(30);
  // Multiplicador de tiempo visible (×1…×64) sobre el ritmo base.
  const [timeScale, setTimeScale] = useState<1 | 2 | 4 | 8 | 16 | 32 | 64>(1);
  const timeScaleRef = useRef<1 | 2 | 4 | 8 | 16 | 32 | 64>(1);
  const [hazardKind, setHazardKind] = useState<HazardKind>('rain');
  const [structural, setStructural] = useState<StructuralAssessment | null>(
    null,
  );
  const refreshHazardEffectsRef = useRef<(() => void) | null>(null);
  const [flood, setFlood] = useState<FloodSnapshot | null>(null);
  const [floodError, setFloodError] = useState<string | null>(null);
  const [sourceCity, setSourceCity] = useState<CityResponse | null>(null);
  const [reliefMode, setReliefMode] = useState(true);
  const [layoutMode, setLayoutMode] = useState<
    'organic' | 'grid' | 'real' | 'imported'
  >('organic');
  const [importedCity, setImportedCity] = useState<CityResponse | null>(null);
  const [citySeed, setCitySeed] = useState(123);
  const [randomizedCity, setRandomizedCity] = useState(false);
  const [cityMode, setCityMode] = useState<CityGenerationMode>('district');
  const [aiProfile, setAiProfile] = useState<RandomCityProfile | null>(null);
  const [, setAiPlan] = useState<AiCityPlanResult | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentIteration, setAgentIteration] = useState(0);
  const [agentDone, setAgentDone] = useState(false);
  const [agentHistory, setAgentHistory] = useState<AgentHistoryEntry[]>([]);
  const [screen, setScreen] = useState<'create' | 'import' | 'sim'>('create');
  const started = screen === 'sim';
  const [language, setLanguage] = useState<AppLanguage>('en');
  const tx = (en: string, es: string) => pick(language, en, es);
  const [mayorBusy, setMayorBusy] = useState(false);
  const agentIterationRef = useRef(0);
  const [citizenBusy, setCitizenBusy] = useState(false);
  const [citizenAnswer, setCitizenAnswer] = useState<
    (CitizenVoiceResult & { citizenId: string }) | null
  >(null);
  // Preloaded real district (OSM + DEM), converted locally; no live API calls.
  const realCity = useMemo(
    () => (layoutMode === 'real' ? createRealCity(eixampleSource).city : null),
    [layoutMode],
  );
  const city = useMemo(
    () =>
      !started
        ? null
        : ((layoutMode === 'imported' ? importedCity : null) ??
          realCity ??
          (sourceCity
            ? layoutMode === 'organic'
              ? createOrganicCity(sourceCity, citySeed, {
                  relief: reliefMode,
                  mode: cityMode,
                  ...(aiProfile
                    ? { profile: aiProfile }
                    : randomizedCity
                      ? { profile: createRandomCityProfile(citySeed) }
                      : {}),
                }).city
              : reliefMode
                ? createReliefCity(sourceCity)
                : sourceCity
            : null)),
    [
      importedCity,
      realCity,
      sourceCity,
      reliefMode,
      layoutMode,
      citySeed,
      randomizedCity,
      aiProfile,
      cityMode,
      started,
    ],
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
  const captureViewRef = useRef<(() => string | null) | null>(null);
  const [beforeImage, setBeforeImage] = useState<string | null>(null);
  const [afterImage, setAfterImage] = useState<string | null>(null);
  const [wipePercent, setWipePercent] = useState(50);
  const [durationMinutes, setDurationMinutes] = useState<number>(5);
  const [rainIntensity, setRainIntensity] = useState<number>(
    hazardPreset('rain').rainIntensityMmPerHour,
  );
  const rainIntensityRef = useRef(rainIntensity);
  rainIntensityRef.current = rainIntensity;
  const [waveHeightInMeters, setWaveHeightInMeters] = useState<number>(
    hazardPreset('tsunami').waveHeightInMeters ?? 2.2,
  );
  const waveHeightRef = useRef(waveHeightInMeters);
  agentIterationRef.current = agentIteration;
  waveHeightRef.current = waveHeightInMeters;
  const [earthquakeMagnitude, setEarthquakeMagnitude] = useState<number>(
    hazardPreset('earthquake').magnitude ?? 6.8,
  );
  const earthquakeMagnitudeRef = useRef(earthquakeMagnitude);
  earthquakeMagnitudeRef.current = earthquakeMagnitude;
  const [userDrains, setUserDrains] = useState<{ x: number; y: number }[]>([]);
  const [hazardMeasure, setHazardMeasure] = useState(true);
  const hazardMeasureRef = useRef(true);
  const userDrainsRef = useRef(userDrains);
  userDrainsRef.current = userDrains;
  const [drainMode, setDrainMode] = useState(false);
  const drainModeRef = useRef(false);
  const [eventSamples, setEventSamples] = useState<EventSample[]>([]);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>(() =>
    loadSavedScenarios(),
  );
  const [showFinalSummary, setShowFinalSummary] = useState(false);
  const worldLayerRef = useRef<ReturnType<typeof createWorldLayer> | null>(
    null,
  );
  const organicLayerRef = useRef<ReturnType<
    typeof createOrganicCityLayer
  > | null>(null);
  const [worldVisible, setWorldVisible] = useState<
    Record<WorldLayerName, boolean>
  >({ sea: true, lake: true });
  const worldVisibleRef = useRef(worldVisible);
  const [error, setError] = useState<string | null>(null);

  // 1. Pedir la ciudad al backend (recien cuando el usuario eligio
  // como crearla; la pantalla inicial no genera ni renderiza nada)
  useEffect(() => {
    // An imported zone is already a complete city: do not request the
    // synthetic source city behind it.
    if (!started || sourceCity || importedCity) return;
    let cancelled = false;

    (async () => {
      try {
        const requestCity = (populationCount?: number) =>
          fetch(`${API_URL}/api/v1/cities/generate`, {
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
                ...(populationCount ? { populationCount } : {}),
              },
              terrain: { kind: 'flat', elevationInMeters: 25 },
              minBuildingHeightInMeters: 4,
              maxBuildingHeightInMeters: 40,
            }),
          });
        let res = await requestCity(600);
        // An older backend caps population at 300 and rejects the larger
        // request; fall back to its default instead of failing the load.
        if (res.status === 400) res = await requestCity();
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
  }, [started, sourceCity, importedCity]);

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

    // Real districts are the heavy scenes: start one step cheaper and let
    // the adaptive controller earn resolution back when frames are fast.
    const quality = new AdaptivePixelRatio(
      window.devicePixelRatio || 1,
      city.real ? 1 : loadCachedPixelRatio(window.devicePixelRatio || 1),
    );
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
    // Map clicks: place drains while that mode is on, otherwise inspect
    // the building under the cursor. Drags (camera moves) are ignored.
    const raycaster = new THREE.Raycaster();
    const drainMarkers = new THREE.Group();
    drainMarkers.name = 'user-drain-markers';
    scene.add(drainMarkers);
    for (const point of userDrainsRef.current) {
      const marker = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.2, 3, 12),
        new THREE.MeshStandardMaterial({ color: 0x1d7fd4, roughness: 0.6 }),
      );
      marker.position.set(
        point.x,
        sampleTerrainHeight(city, point.x, point.y) + 1.5,
        point.y,
      );
      drainMarkers.add(marker);
    }
    let downAt: { x: number; y: number } | null = null;
    renderer.domElement.addEventListener('pointerdown', (event) => {
      downAt = { x: event.clientX, y: event.clientY };
    });
    renderer.domElement.addEventListener('pointerup', (event) => {
      if (!downAt) return;
      const moved = Math.hypot(
        event.clientX - downAt.x,
        event.clientY - downAt.y,
      );
      downAt = null;
      if (moved > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(ground, false)[0];
      if (!hit) return;
      const point = { x: hit.point.x, y: hit.point.z };
      if (drainModeRef.current) {
        const next = [...userDrainsRef.current, point].slice(-12);
        setUserDrains(next);
        simulationRef.current?.applyExtraDrains(next);
        const marker = new THREE.Mesh(
          new THREE.CylinderGeometry(2.2, 2.2, 3, 12),
          new THREE.MeshStandardMaterial({ color: 0x1d7fd4, roughness: 0.6 }),
        );
        marker.position.set(point.x, hit.point.y + 1.5, point.y);
        drainMarkers.add(marker);
        return;
      }
      const building = city.buildings.find((candidate) =>
        candidate.footprint
          ? pointInPolygon(point, candidate.footprint)
          : point.x >= candidate.minCorner.x &&
            point.x <= candidate.maxCorner.x &&
            point.y >= candidate.minCorner.y &&
            point.y <= candidate.maxCorner.y,
      );
      setInspectedId(building?.id ?? null);
    });
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
    captureViewRef.current = () => {
      try {
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL('image/png');
      } catch {
        return null;
      }
    };
    // Snapshot the dry city once, before the event develops.
    const beforeTimer = setTimeout(() => {
      const shot = captureViewRef.current?.();
      if (shot) setBeforeImage(shot);
    }, 900);
    // Real imported zones keep their own geography: the synthetic sea,
    // lake and fields would float the district over an unrelated coast.
    const worldLayer = city.real ? null : createWorldLayer(world);
    if (worldLayer) {
      for (const key of Object.keys(worldLayer.layers) as WorldLayerName[])
        worldLayer.layers[key].visible = worldVisibleRef.current[key];
      scene.add(worldLayer.group);
      worldLayerRef.current = worldLayer;
    }

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
    // Large districts pay the shadow pass over ~1 km; a 1024 map keeps
    // the frame fluid there, small districts keep 2048 detail.
    const shadowMapSize = extent > 700 ? 1024 : 2048;
    dirLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
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
    const streetLabelLayer = city.real ? createStreetLabelLayer(city) : null;
    if (streetLabelLayer) scene.add(streetLabelLayer.group);
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
      // Draped roads sit centimetres over the DEM ground; polygon offset
      // keeps the two near-coplanar surfaces from z-fighting into shards.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      ...(textures.asphalt ? { map: textures.asphalt } : {}),
    });
    const bridgeRoadIds = new Set(
      city.organic?.bridges.flatMap((bridge) => bridge.roadIds),
    );
    // Real imported zones carry no sidewalk blocks: the road layer grows
    // its own concrete sidewalks and crosswalks instead.
    const sidewalkMaterial = city.real
      ? new THREE.MeshStandardMaterial({
          color: textures.concrete ? 0xffffff : 0xc1c5c7,
          roughness: 1,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
          ...(textures.concrete ? { map: textures.concrete } : {}),
        })
      : undefined;
    const roadLayer = createRoadLayer(
      city.roads.filter((road) => !bridgeRoadIds.has(road.id)),
      city.terrain.elevationInMeters,
      roadMaterial,
      city.organic ? (city.district?.roadWidthInMeters ?? 6) : 6,
      sidewalkMaterial,
      // Crosswalks must never land inside a building footprint.
      city.real ? city.buildings : [],
    );
    const drapedRoadLayer = drapeSurfaceLayer(roadLayer, city);
    scene.add(drapedRoadLayer);
    scene.add(drapeSurfaceLayer(createDistrictLayer(city), city));
    const urbanDetailLayer = createUrbanDetailLayer(city, textures.concrete);
    scene.add(drapeSurfaceLayer(urbanDetailLayer, city));
    // Distance culling: sub-metre details render only when zoomed in.
    const detailObjects = [
      ...collectDetailObjects(fallbackBuildings),
      ...collectDetailObjects(urbanDetailLayer),
      ...collectDetailObjects(drapedRoadLayer),
    ];
    let detailsShown = true;

    // Suelo
    // Imported districts are paved city fabric: grass there read as
    // green patches between streets. Parks keep their own green boxes
    // above this base; synthetic cities keep the grass ground.
    // Clone before tiling: the shared concrete texture also dresses park
    // paths at repeat 1, and must not inherit the ground's 96x tiling.
    const groundTexture = city.real
      ? textures.concrete?.clone()
      : textures.grass;
    if (groundTexture && city.real) {
      groundTexture.repeat.set(96, 96);
      groundTexture.needsUpdate = true;
    }
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: groundTexture ? 0xffffff : city.real ? 0xb9bcba : 0xa6b09a,
      roughness: 1,
      ...(groundTexture ? { map: groundTexture } : {}),
    });
    const ground = createCityGround(city, groundMaterial);
    scene.add(ground);
    ground.receiveShadow = true;
    if (city.real) {
      // Maqueta base exactly the size of the imported square: it gives the
      // district a clean plinth edge without generating anything outside it.
      const elevations = city.terrainGrid
        ? city.terrainGrid.elevationsInMeters.flat()
        : [city.terrain.elevationInMeters];
      const minElevation = Math.min(...elevations);
      const plinth = new THREE.Mesh(
        new THREE.BoxGeometry(
          city.config.widthInMeters,
          3,
          city.config.heightInMeters,
        ),
        new THREE.MeshStandardMaterial({ color: 0x8f979b, roughness: 1 }),
      );
      plinth.name = 'real-base-plinth';
      plinth.position.set(
        city.config.widthInMeters / 2,
        minElevation - 1.55,
        city.config.heightInMeters / 2,
      );
      scene.add(plinth);
      // Close the sides: the DEM terrain is a thin sheet whose edges sit
      // above the flat plinth wherever the ground slopes, leaving a visible
      // air gap from street level. The skirt walls it down to the base.
      const skirt = createTerrainSkirt(
        city,
        minElevation - 3.05,
        new THREE.MeshStandardMaterial({ color: 0x7d8589, roughness: 1 }),
      );
      if (skirt) scene.add(skirt);
    }
    const resize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', resize);

    let simulation: DistrictSimulation | null = null;
    let lastSampleSeconds = -1;
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
            // The user starts the event from the launch panel; nothing
            // runs on its own when a city loads.
            autoStart: false,
            hazard: hazardKind,
            ...(hazardKind === 'rain' || hazardKind === 'river-overflow'
              ? { rainIntensityMmPerHour: rainIntensityRef.current }
              : {}),
            ...(hazardKind === 'tsunami'
              ? { waveHeightInMeters: waveHeightRef.current }
              : {}),
            ...(hazardKind === 'earthquake'
              ? { earthquakeMagnitude: earthquakeMagnitudeRef.current }
              : {}),
            extraDrains: userDrainsRef.current,
            earlyWarning: hazardKind === 'tsunami' && hazardMeasureRef.current,
            reinforcement: hazardMeasureRef.current,
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
    // The procedural layer renders through instanced buckets and footprint
    // groups, not the named marker groups: collapse must drive those.
    const fallbackCollapse = attachBuildingCollapse(fallbackBuildings, city);
    const applyFallbackCollapse = (buildingId: string, progress: number) => {
      fallbackCollapse(buildingId, progress);
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
        // Perfil del frente por fila del solver: los edificios (celdas
        // bloqueadas) frenan unas filas más que otras y la ola se dobla.
        const byRow = new Map<
          number,
          { z: number; front: number; depth: number; speed: number }
        >();
        simulation.cells.forEach((cell, index) => {
          const depth = simulation.snapshot.waterDepthInMeters[index] ?? 0;
          if (depth < 0.06) return;
          const speed =
            simulation.snapshot.flowSpeedInMetersPerSecond?.[index] ?? 0;
          const current = byRow.get(cell.row);
          if (!current)
            byRow.set(cell.row, {
              z: (cell.minY + cell.maxY) / 2,
              front: cell.maxX,
              depth,
              speed,
            });
          else {
            current.front = Math.max(current.front, cell.maxX);
            current.depth = Math.max(current.depth, depth);
            current.speed = Math.max(current.speed, speed);
          }
        });
        hazardEffects.setWaveProfile(
          [...byRow.values()]
            .sort((a, b) => a.z - b.z)
            .map((row) => ({
              zInMeters: row.z,
              frontXInMeters: row.front,
              depthInMeters: row.depth,
              speedInMetersPerSecond: row.speed,
            })),
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
            assetLayer.setBuildingCollapse(id, collapseEase(progress));
      }
      const ids = new Set([
        ...collapseTargets.keys(),
        ...collapseProgress.keys(),
      ]);
      for (const id of ids) {
        const target = collapseTargets.get(id) ?? 0;
        const current = collapseProgress.get(id) ?? 0;
        if (Math.abs(target - current) < 0.002) continue;
        // Derrumbe progresivo: dura según la altura del edificio y sigue la
        // curva de collapse-animation (agrietamiento lento, caída acelerada).
        const duration = collapseDurationSeconds(
          buildingHeightById.get(id) ?? 8,
        );
        const next =
          current +
          Math.sign(target - current) *
            Math.min(Math.abs(target - current), deltaSeconds / duration);
        collapseProgress.set(id, next);
        moved = true;
        const eased = target > current ? collapseEase(next) : next;
        applyFallbackCollapse(id, eased);
        assetLayer?.setBuildingCollapse(id, eased);
        if (next === 0 && target === 0) collapseProgress.delete(id);
      }
      return moved;
    };
    // Subtle distance haze in clear weather; storm fog replaces it while
    // a simulation is running, exactly as before.
    const clearFog = new THREE.Fog(0xcbd5df, viewExtent * 1.4, viewExtent * 5);
    scene.fog = clearFog;
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
      // Spiral-of-death guard: the visible time multiplier (x1..x64)
      // stacks on the simulation speed (3x/30x/300x), so an uncapped
      // x64 frame would try to advance hundreds of simulated seconds
      // at once (flood + evacuation of every citizen, both arms) and
      // tank the frame rate. Cap the work per frame; at extreme
      // multipliers simulated time simply flows as fast as stays fluid.
      const simulationDelta = Math.min(delta * timeScaleRef.current, 0.5);
      if (!document.hidden && simulation?.advance(simulationDelta)) {
        setFlood(simulation.snapshot);
        setComparison(simulation.comparison);
        const snap = simulation.snapshot;
        if (
          snap.elapsedTimeInSeconds - lastSampleSeconds >= 30 ||
          (snap.elapsedTimeInSeconds > 0 && lastSampleSeconds < 0)
        ) {
          lastSampleSeconds = snap.elapsedTimeInSeconds;
          const sample: EventSample = {
            elapsedSeconds: snap.elapsedTimeInSeconds,
            maxWaterDepthInMeters: snap.maxWaterDepthInMeters,
            blockedRoads: simulation.selectedBlockedRoadEdgeIds.length,
            exposedBuildings: snap.exposedBuildingIds.length,
            evacuated: simulation.evacuation.evacuatedCount,
            trapped: simulation.evacuation.trappedCount,
            totalCitizens: simulation.evacuation.citizens.length,
          };
          setEventSamples((previous) => [...previous.slice(-40), sample]);
        }
        setAlarmTime(simulation.alarmTime);
        if (!observedAlarm && simulation.alarmTime !== null) {
          // Antes la alarma forzaba el ritmo base a 3× y la catástrofe
          // tardaba minutos reales en verse; el ritmo lo manda el usuario.
          observedAlarm = true;
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
        trafficLayer.update(
          traffic.advance(simulationDelta, blockedTrafficRoads),
        );
      }
      if (simulation && simulation.snapshot !== displayedSnapshot) {
        floodLayer?.update(simulation.snapshot);
        displayedSnapshot = simulation.snapshot;
        syncCollapseTargets();
      }
      const collapsesMoved = animateCollapses(document.hidden ? 0 : delta);
      worldLayer?.animate(document.hidden ? 0 : delta);
      organicLayer?.animate(document.hidden ? 0 : delta);
      atmosphere.animate(document.hidden ? 0 : delta);
      // Street labels drift gently; moving the whole group is one
      // transform per frame regardless of how many labels exist.
      if (streetLabelLayer)
        streetLabelLayer.group.position.y =
          Math.sin(performance.now() / 1400) * 0.6;
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
        scene.fog = active ? stormFog : clearFog;
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
      clearTimeout(beforeTimer);
      cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      releaseAssets();
      focusViewRef.current = null;
      worldLayerRef.current = null;
      organicLayerRef.current = null;
      if (worldLayer) {
        scene.remove(worldLayer.group);
        worldLayer.dispose();
      }
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
      if (streetLabelLayer) {
        scene.remove(streetLabelLayer.group);
        streetLabelLayer.dispose();
      }
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
    setEventSamples([]);
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
    setRainIntensity(hazardPreset(kind).rainIntensityMmPerHour);
    setWaveHeightInMeters(hazardPreset('tsunami').waveHeightInMeters ?? 2.2);
    waveHeightRef.current = hazardPreset('tsunami').waveHeightInMeters ?? 2.2;
    setEarthquakeMagnitude(hazardPreset('earthquake').magnitude ?? 6.8);
    earthquakeMagnitudeRef.current =
      hazardPreset('earthquake').magnitude ?? 6.8;
    setHazardMeasure(true);
    hazardMeasureRef.current = true;
    setEventSamples([]);
    setRunning(false);
    setFlood(null);
    setComparison(null);
    setAlarmTime(null);
    setStructural(null);
    setHazardKind(kind);
  }

  function regenerateCity(
    seed: number,
    randomProfile = randomizedCity,
    mode = cityMode,
  ) {
    if (
      sameCityGeneration(
        { seed, randomized: randomProfile, layout: 'organic', mode },
        {
          seed: citySeed,
          randomized: randomizedCity,
          layout: layoutMode,
          mode: cityMode,
        },
      )
    ) {
      resetFlood();
      return;
    }
    setRunning(false);
    setFlood(null);
    setComparison(null);
    setAlarmTime(null);
    setAiProfile(null);
    setAiPlan(null);
    setAgentIteration(0);
    setAgentDone(false);
    setAgentHistory([]);
    setRandomizedCity(randomProfile);
    setCityMode(mode);
    setLayoutMode('organic');
    setCitySeed(seed);
  }

  async function planAiCity(description: string): Promise<AiCityPlanResult> {
    setAiBusy(true);
    try {
      return await requestAiCityPlan(
        description.trim() ? description : null,
        (citySeed + 1) >>> 0,
      );
    } finally {
      setAiBusy(false);
    }
  }

  function applyAiPlan(plan: AiCityPlanResult) {
    setRunning(false);
    setFlood(null);
    setComparison(null);
    setAlarmTime(null);
    setAgentIteration(0);
    setAgentDone(false);
    setAgentHistory([]);
    setAiPlan(plan);
    setAiProfile(plan.profile);
    setRandomizedCity(true);
    setCityMode(plan.mode);
    setLayoutMode('organic');
    setCitySeed(plan.seed);
  }

  /**
   * One agent iteration against the freshest measured comparison.
   * Returns true when the loop should stop (model done or cap reached).
   */
  async function agentStep(): Promise<boolean> {
    const simulation = simulationRef.current;
    if (!simulation || !city?.terrainGrid) return true;
    const measured = simulation.comparison;
    const iteration = agentIterationRef.current + 1;
    const plan = await requestInterventions({
      hazardKind,
      objective:
        'Reducir edificios expuestos, personas atrapadas y agua maxima',
      iteration,
      before: {
        evacuated: measured.before.evacuated,
        trapped: measured.before.trapped,
        exposedBuildings: measured.before.exposedBuildings,
        blockedRoadsPeak: measured.before.peakBlocked,
        maxWaterDepthInMeters: measured.before.peakDepth,
      },
      after: {
        evacuated: measured.after.evacuated,
        trapped: measured.after.trapped,
        exposedBuildings: measured.after.exposedBuildings,
        blockedRoadsPeak: measured.after.peakBlocked,
        maxWaterDepthInMeters: measured.after.peakDepth,
      },
      vulnerableExposed,
      vulnerableTotal: vulnerableBuildings.length,
      shelterOccupancy,
      shelterCapacity,
      currentDrains: userDrains.length,
    });
    setAgentHistory((history) => [
      ...history,
      {
        iteration,
        drains: plan.drains,
        source: plan.source,
        rationale: plan.rationale,
      },
    ]);
    setAgentIteration(iteration);
    agentIterationRef.current = iteration;
    if (plan.done || iteration >= 3) {
      setAgentDone(true);
      return true;
    }
    const points = pickAutoDrainPoints(city.terrainGrid, plan.drains, 30);
    setUserDrains(points);
    simulation.applyExtraDrains(points);
    simulation.applyMeasure({
      earlyWarning: plan.earlyWarning,
      reinforcement: plan.reinforcement,
    });
    setRunning(false);
    setFlood(simulation.snapshot);
    setComparison(simulation.comparison);
    setAlarmTime(simulation.alarmTime);
    setStructural(simulation.structural);
    return false;
  }

  async function runAgentIteration() {
    if (agentBusy) return;
    setAgentBusy(true);
    try {
      await agentStep();
    } finally {
      setAgentBusy(false);
    }
  }

  /** Autonomous mayor: iterate, fast-forward the event, measure again. */
  async function runMayorAgent() {
    if (mayorBusy || agentBusy) return;
    setMayorBusy(true);
    setAgentBusy(true);
    try {
      for (let round = 0; round < 3; round += 1) {
        const done = await agentStep();
        const simulation = simulationRef.current;
        if (done || !simulation) break;
        simulation.start();
        simulation.advance(20);
        simulation.pause();
        setRunning(false);
        setFlood(simulation.snapshot);
        setComparison(simulation.comparison);
        setAlarmTime(simulation.alarmTime);
        setStructural(simulation.structural);
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    } finally {
      setAgentBusy(false);
      setMayorBusy(false);
    }
  }

  async function askCitizen(citizenId: string) {
    const simulation = simulationRef.current;
    const citizen = simulation?.evacuation.citizens.find(
      (item) => item.id === citizenId,
    );
    if (!citizen) return;
    setCitizenBusy(true);
    try {
      const answer = await requestCitizenVoice({
        status: citizen.status,
        hazardKind,
        shelterAssigned: citizen.shelterId !== null,
        elapsedMinutes: (flood?.elapsedTimeInSeconds ?? 0) / 60,
      });
      setCitizenAnswer({ ...answer, citizenId });
    } finally {
      setCitizenBusy(false);
    }
  }

  function applyImportedCity(next: CityResponse) {
    cameraViewRef.current = 'city';
    setWorldView('city');
    setRunning(false);
    setFlood(null);
    setComparison(null);
    setAlarmTime(null);
    setStructural(null);
    setImportedCity(next);
    setLayoutMode('imported');
  }

  useEffect(() => {
    drainModeRef.current = drainMode;
  }, [drainMode]);

  function generateRandomCity() {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    const seed = values[0] ?? 0;
    regenerateCity(seed === citySeed ? (seed + 1) >>> 0 : seed, true);
  }

  useEffect(() => {
    if (
      flood &&
      shouldFinishSimulation(
        flood.elapsedTimeInSeconds,
        durationMinutes,
        running,
      )
    )
      finishSimulation();
  }, [flood?.elapsedTimeInSeconds, durationMinutes, running]);

  const startScreen = (
    <CityStartScreen
      onLanguageChange={setLanguage}
      aiBusy={aiBusy}
      onAiChat={planAiCity}
      onBuildAi={(plan) => {
        applyAiPlan(plan);
        setScreen('sim');
      }}
      onRandom={() => {
        generateRandomCity();
        setScreen('sim');
      }}
      onImportZone={() => {
        // Full-screen importer step: entering it must not request,
        // generate or render the synthetic city behind it.
        setPanelOpen(false);
        setImportCardOpen(false);
        setScreen('import');
      }}
      onSeed={(seed) => {
        regenerateCity(seed, true);
        setScreen('sim');
      }}
    />
  );

  if (screen === 'create')
    return (
      <LanguageContext.Provider value={language}>
        <main style={{ position: 'relative', width: '100vw', height: '100vh' }}>
          {startScreen}
        </main>
      </LanguageContext.Provider>
    );
  if (screen === 'import')
    return (
      <LanguageContext.Provider value={language}>
        <RealCityImportScreen
          onLanguageChange={setLanguage}
          onBack={() => setScreen('create')}
          onImported={(next) => {
            applyImportedCity(next);
            setImportCardOpen(false);
            setScreen('sim');
          }}
        />
      </LanguageContext.Provider>
    );
  if (error) {
    return (
      <div style={{ padding: 20, color: 'salmon', fontFamily: 'monospace' }}>
        {tx('Failed to load the city:', 'Error al cargar la ciudad:')} {error}
      </div>
    );
  }
  if (!city)
    return (
      <LanguageContext.Provider value={language}>
        <LoadingScreen
          message={tx('Generating city…', 'Generando la ciudad…')}
        />
      </LanguageContext.Provider>
    );
  const zoneLabel = city?.real
    ? city.real.name
    : city?.organic
      ? 'Ciudad orgánica sintética'
      : 'Ciudad sintética';
  const impactSummary =
    city && flood
      ? buildImpactSummary({
          elapsedSeconds: flood.elapsedTimeInSeconds,
          maxWaterDepthInMeters: flood.maxWaterDepthInMeters,
          blockedRoads: new Set([
            ...flood.blockedRoadEdgeIds,
            ...(simulationRef.current?.selectedCollapsedBlockedRoadEdgeIds ??
              []),
          ]).size,
          exposedBuildings: flood.exposedBuildingIds.length,
          totalBuildings: city.buildings.length,
          evacuated: comparison?.[arm].evacuated ?? 0,
          totalCitizens: city.citizens?.length ?? 0,
          damagedBuildings: comparison?.[arm].damagedBuildings ?? 0,
          collapsedBuildings: comparison?.[arm].collapsedBuildings ?? 0,
          trapped: comparison?.[arm].trapped ?? 0,
        })
      : null;
  const impactNarrative = impactSummary
    ? buildImpactNarrative(
        impactSummary,
        hazardPreset(hazardKind).label.toLowerCase(),
      )
    : [];
  const shelterSnapshot = simulationRef.current?.evacuation.shelters ?? [];
  const shelterCapacity = shelterSnapshot.reduce(
    (sum, s) => sum + s.capacity,
    0,
  );
  const shelterOccupancy = shelterSnapshot.reduce(
    (sum, s) => sum + s.occupancy,
    0,
  );
  const vulnerableBuildings = city
    ? city.buildings.filter((building) => building.vulnerable)
    : [];
  const vulnerableExposed = flood
    ? vulnerableBuildings.filter((building) =>
        flood.exposedBuildingIds.includes(building.id),
      ).length
    : 0;
  const recommendationLines =
    comparison && city
      ? recommendImprovements({
          before: {
            evacuated: comparison.before.evacuated,
            trapped: comparison.before.trapped,
            exposedBuildings: comparison.before.exposedBuildings,
            blockedRoadsPeak: comparison.before.peakBlocked,
            maxWaterDepthInMeters: comparison.before.peakDepth,
          },
          after: {
            evacuated: comparison.after.evacuated,
            trapped: comparison.after.trapped,
            exposedBuildings: comparison.after.exposedBuildings,
            blockedRoadsPeak: comparison.after.peakBlocked,
            maxWaterDepthInMeters: comparison.after.peakDepth,
          },
          vulnerableExposed,
          vulnerableTotal: vulnerableBuildings.length,
          shelterOccupancy,
          shelterCapacity,
        })
      : [];
  const scoreOf = (
    metrics: DistrictSimulation['comparison']['before'],
  ): number =>
    resilienceScore({
      totalPeople: city.citizens?.length ?? 0,
      evacuated: metrics.evacuated,
      trapped: metrics.trapped,
      stranded: metrics.stranded,
      exposedBuildings: metrics.exposedBuildings,
      totalBuildings: city.buildings.length,
      blockedRoadsPeak: metrics.peakBlocked,
      maxWaterDepthInMeters: metrics.peakDepth,
    });
  const scoreBefore = comparison ? scoreOf(comparison.before) : null;
  const scoreAfter = comparison ? scoreOf(comparison.after) : null;
  const timelineEvents = buildEventLog(eventSamples, language);
  const inspectedBuilding = inspectedId
    ? (city?.buildings.find((building) => building.id === inspectedId) ?? null)
    : null;
  const demoSteps = city
    ? buildDemoSteps({
        zoneLabel,
        buildings: city.buildings.length,
        citizens: city.citizens?.length ?? 0,
        hazardLabel: HAZARD_LABELS[hazardKind][language].toLowerCase(),
      })
    : [];
  const applyDemoStep = (index: number) => {
    const step: DemoStep | undefined = demoSteps[index];
    if (!step) return;
    setDemoStep(index);
    cameraViewRef.current = step.view;
    setWorldView(step.view);
    focusViewRef.current?.(step.view);
    setSpeed(step.speed);
    simulationRef.current?.setSpeed(step.speed);
    // The guided demo drives the event itself; nothing waits for a
    // separate manual start while it is narrating.
    if (
      step.speed > 0 &&
      simulationRef.current &&
      !simulationRef.current.running
    ) {
      simulationRef.current.start();
      setRunning(true);
    }
  };
  const finishSimulation = () => {
    const simulation = simulationRef.current;
    if (simulation?.running) simulation.pause();
    setRunning(false);
    setShowFinalSummary(true);
  };

  const restartSimulation = () => {
    const simulation = simulationRef.current;
    if (!simulation) return;
    simulation.reset();
    setEventSamples([]);
    trafficRef.current?.reset();
    setRunning(false);
    setShowFinalSummary(false);
    setAfterImage(null);
    setFlood(simulation.snapshot);
    setComparison(simulation.comparison);
    setAlarmTime(simulation.alarmTime);
    setStructural(simulation.structural);
    refreshHazardEffectsRef.current?.();
  };

  const emergencyReportLines = async (): Promise<string[]> => {
    if (!comparison) return [];
    const result = await requestEmergencyReport({
      zoneLabel,
      hazardLabel: hazardPreset(hazardKind).label,
      score: scoreAfter ?? 0,
      evacuated: comparison.after.evacuated,
      totalPeople: city.citizens?.length ?? 0,
      trapped: comparison.after.trapped,
      exposedBuildings: comparison.after.exposedBuildings,
      damagedBuildings: comparison.after.damagedBuildings,
      maxWaterDepthInMeters: comparison.after.peakDepth,
      recommendations: recommendationLines,
    });
    return [
      `Informe de emergencia (${result.source === 'meta' ? 'Meta AI' : 'Sin IA, local'}):`,
      result.report,
    ];
  };

  const downloadCurrentReport = async () => {
    if (!impactSummary) return;
    downloadReport(
      buildReport({
        zoneLabel,
        hazardLabel: hazardPreset(hazardKind).label,
        summary: impactSummary,
        narrative: [...impactNarrative, ...(await emergencyReportLines())],
        comparisonLines: comparison
          ? [
              `Evacuadas: ${comparison.before.evacuated} → ${comparison.after.evacuated}`,
              `Edificios expuestos: ${comparison.before.exposedBuildings} → ${comparison.after.exposedBuildings}`,
              `Tramos bloqueados (pico): ${comparison.before.peakBlocked} → ${comparison.after.peakBlocked}`,
              `Resiliencia: ${scoreBefore}/100 → ${scoreAfter}/100`,
            ]
          : [],
      }),
      'simulicity-reporte.txt',
    );
  };

  return (
    <LanguageContext.Provider value={language}>
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
          waveHeightInMeters={waveHeightInMeters}
          earthquakeMagnitude={earthquakeMagnitude}
          timeScale={timeScale}
          onTimeScale={(scale) => {
            timeScaleRef.current = scale;
            setTimeScale(scale);
          }}
          onPanelToggle={() => {
            setImportCardOpen(false);
            setPanelOpen((open) => !open);
          }}
          onImportZone={() => {
            setPanelOpen(false);
            setImportCardOpen(true);
          }}
          onRandom={generateRandomCity}
          onView={(view) => {
            cameraViewRef.current = view;
            setWorldView(view);
            focusViewRef.current?.(view);
          }}
          onToggle={toggleFlood}
          onReset={resetFlood}
          onLanguageChange={setLanguage}
        />
        <button
          type="button"
          onClick={() => {
            setPanelOpen(true);
            applyDemoStep(0);
          }}
          style={{
            position: 'absolute',
            top: 104,
            left: 16,
            padding: '10px 14px',
            borderRadius: 10,
            border: 0,
            background: simTheme.primaryBackground,
            color: 'white',
            font: '600 14px system-ui',
            cursor: 'pointer',
            boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
          }}
        >
          {tx('Guided demo', 'Demo guiada')}
        </button>
        <button
          type="button"
          onClick={() => {
            setRunning(false);
            setFlood(null);
            setComparison(null);
            setAlarmTime(null);
            setStructural(null);
            setImportedCity(null);
            setHazardKind('rain');
            cameraViewRef.current = 'city';
            setWorldView('city');
            setLayoutMode('real');
          }}
          style={{
            position: 'absolute',
            top: 152,
            left: 16,
            padding: '10px 14px',
            borderRadius: 10,
            background: simTheme.panel,
            border: `1px solid ${simTheme.border}`,
            backdropFilter: 'blur(12px)',
            color: simTheme.ink,
            font: '600 14px system-ui',
            cursor: 'pointer',
            boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
          }}
        >
          {tx('Real Example + rain', 'Example real + lluvia')}
        </button>
        <button
          type="button"
          onClick={() => setScreen('create')}
          style={{
            position: 'absolute',
            top: 200,
            left: 16,
            padding: '10px 14px',
            borderRadius: 10,
            background: simTheme.panel,
            border: `1px solid ${simTheme.border}`,
            backdropFilter: 'blur(12px)',
            color: simTheme.ink,
            font: '600 14px system-ui',
            cursor: 'pointer',
            boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
          }}
        >
          {tx('Create another city', 'Crear otra ciudad')}
        </button>
        <output
          aria-label={tx('City performance', 'Rendimiento de la ciudad')}
          style={{
            position: 'absolute',
            top: 104,
            right: 16,
            padding: '8px 12px',
            borderRadius: 10,
            background: simTheme.panel,
            border: `1px solid ${simTheme.border}`,
            backdropFilter: 'blur(12px)',
            color: simTheme.ink,
            font: '12px system-ui',
            pointerEvents: 'none',
          }}
        >
          {measurement ? (
            <>
              {measurement.fps.toFixed(0)} FPS ·{' '}
              {measurement.frameMilliseconds.toFixed(1)}{' '}
              {tx('ms/frame', 'ms/cuadro')}
              <br />
              CPU render: {measurement.renderMilliseconds.toFixed(1)} ms ·{' '}
              {measurement.drawCalls} draw calls
              <br />
              {measurement.triangles.toLocaleString(
                language === 'en' ? 'en-US' : 'es-AR',
              )}{' '}
              {tx('triangles', 'triángulos')} · {trafficCount}{' '}
              {tx('vehicles', 'vehículos')}
            </>
          ) : (
            tx('Measuring performance…', 'Midiendo rendimiento…')
          )}
        </output>
        {flood && timelineEvents.length > 0 && (
          <NewsTicker
            headline={timelineEvents[timelineEvents.length - 1]?.text ?? ''}
            detail={`${tx('Evacuated', 'Evacuados')} ${comparison?.[arm].evacuated ?? 0}/${city.citizens?.length ?? 0} · ${tx('Resilience', 'Resiliencia')} ${scoreAfter ?? '—'}/100`}
          />
        )}
        {flood && !floodError && (
          <aside
            aria-label={tx(
              'Configure and run the simulation',
              'Configurar y lanzar la simulación',
            )}
            style={{
              position: 'absolute',
              top: 168,
              right: 16,
              width: 248,
              maxHeight: 'calc(100vh - 250px)',
              overflowY: 'auto',
              padding: 14,
              borderRadius: 16,
              background: simTheme.panelStrong,
              border: `1px solid ${simTheme.border}`,
              backdropFilter: 'blur(12px)',
              color: simTheme.ink,
              fontFamily: 'system-ui, sans-serif',
              boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
              zIndex: 5,
            }}
          >
            <strong style={{ fontSize: 14, color: '#fff' }}>
              {tx('Simulation', 'Simulación')}
            </strong>
            <p
              style={{ fontSize: 11, margin: '6px 0 0', color: simTheme.muted }}
            >
              {tx(
                'The hazard is chosen in the top bar and the speed with the ×1…×64 buttons below; this panel only holds settings for this run.',
                'La catástrofe se elige en la barra superior y la velocidad con los botones ×1…×64 de abajo; acá queda solo lo propio de esta corrida.',
              )}
            </p>
            {(hazardKind === 'rain' || hazardKind === 'river-overflow') && (
              <label style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
                {tx('Rain intensity', 'Intensidad de lluvia')}: {rainIntensity}{' '}
                mm/h
                <input
                  aria-label="Intensidad de lluvia"
                  type="range"
                  min={20}
                  max={200}
                  step={5}
                  value={rainIntensity}
                  disabled={!!simulationRef.current?.started}
                  onChange={(event) => {
                    setRainIntensity(Number(event.target.value));
                    rainIntensityRef.current = Number(event.target.value);
                    if (!simulationRef.current?.started)
                      simulationRef.current?.applyRainIntensity(
                        Number(event.target.value),
                      );
                  }}
                  style={{
                    width: '100%',
                    marginTop: 3,
                    accentColor: simTheme.accent,
                  }}
                />
                {simulationRef.current?.started
                  ? tx(
                      'Set it before starting (or on restart).',
                      'Se ajusta antes de iniciar (o al reiniciar).',
                    )
                  : tx(
                      'Applies when the simulation starts.',
                      'Aplica al iniciar la simulación.',
                    )}
              </label>
            )}
            {hazardKind === 'tsunami' && (
              <label style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
                {tx('Wave height', 'Altura de la ola')}: {waveHeightInMeters} m
                <input
                  aria-label="Altura de la ola del tsunami"
                  type="range"
                  min={TSUNAMI_WAVE_HEIGHT_LIMITS_IN_METERS.min}
                  max={TSUNAMI_WAVE_HEIGHT_LIMITS_IN_METERS.max}
                  step={0.5}
                  value={waveHeightInMeters}
                  disabled={!!simulationRef.current?.started}
                  onChange={(event) => {
                    setWaveHeightInMeters(Number(event.target.value));
                    waveHeightRef.current = Number(event.target.value);
                    if (!simulationRef.current?.started)
                      simulationRef.current?.applyWaveHeightInMeters(
                        Number(event.target.value),
                      );
                  }}
                  style={{
                    width: '100%',
                    marginTop: 3,
                    accentColor: simTheme.accent,
                  }}
                />
                {tx(
                  'Most tsunamis arrive under 3 m; Japan 2011 reached about 10 m at the coast. Maximum offered: 20 m.',
                  'La mayoría de los tsunamis llega con menos de 3 m; Japón 2011 rondó los 10 m en la costa. Máximo ofrecido: 20 m.',
                )}
                {simulationRef.current?.started
                  ? tx(
                      ' Set it before starting (or on restart).',
                      ' Se ajusta antes de iniciar (o al reiniciar).',
                    )
                  : ''}
              </label>
            )}
            {hazardKind === 'earthquake' && (
              <label style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
                {tx('Magnitude', 'Magnitud')}: {earthquakeMagnitude.toFixed(1)}
                <input
                  aria-label="Magnitud del terremoto"
                  type="range"
                  min={EARTHQUAKE_MAGNITUDE_LIMITS.min}
                  max={EARTHQUAKE_MAGNITUDE_LIMITS.max}
                  step={0.1}
                  value={earthquakeMagnitude}
                  disabled={!!simulationRef.current?.started}
                  onChange={(event) => {
                    setEarthquakeMagnitude(Number(event.target.value));
                    earthquakeMagnitudeRef.current = Number(event.target.value);
                    if (!simulationRef.current?.started)
                      simulationRef.current?.applyEarthquakeMagnitude(
                        Number(event.target.value),
                      );
                  }}
                  style={{
                    width: '100%',
                    marginTop: 3,
                    accentColor: simTheme.accent,
                  }}
                />
                {tx(
                  'Damage starts near 5; the largest recorded is 9.5 (Chile, 1960) and the scale does not go beyond that.',
                  'El daño empieza cerca de 5; el mayor registrado es 9,5 (Chile, 1960) y la escala no pasa de ahí.',
                )}
                {simulationRef.current?.started
                  ? tx(
                      ' Set it before starting (or on restart).',
                      ' Se ajusta antes de iniciar (o al reiniciar).',
                    )
                  : ''}
              </label>
            )}
            <label style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
              {tx(
                'How long to simulate? Enter the simulated minutes you want; leave it empty and it will not end on its own — you stop it with “Finish and view summary”.',
                '¿Cuánto tiempo simular? Escribí los minutos del mundo simulado que quieras; si lo dejás vacío, no termina sola y la cortás vos con “Terminar y ver resumen”.',
              )}
              <input
                aria-label="Duración de la simulación en minutos"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                placeholder={tx('No limit', 'Sin límite')}
                value={durationMinutes > 0 ? durationMinutes : ''}
                onChange={(event) => {
                  const raw = event.target.value;
                  if (raw === '') {
                    setDurationMinutes(0);
                    return;
                  }
                  const value = Number(raw);
                  if (Number.isFinite(value) && value >= 0)
                    setDurationMinutes(Math.floor(value));
                }}
                style={{
                  width: '100%',
                  marginTop: 3,
                  padding: '6px 8px',
                  ...simField,
                }}
              />
            </label>
            <label style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
              {tx('Improvement comparison', 'Comparación de la mejora')}
              <select
                aria-label="Comparación de la mejora"
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
                style={{
                  width: '100%',
                  marginTop: 3,
                  padding: '6px 8px',
                  ...simField,
                }}
              >
                <option value="before">
                  {tx(
                    'No improvement · original city',
                    'Sin mejora · ciudad original',
                  )}
                </option>
                <option value="after">
                  {tx(
                    'With improvement · protected city',
                    'Con mejora · ciudad protegida',
                  )}
                </option>
              </select>
              <span
                style={{
                  display: 'block',
                  marginTop: 4,
                  fontSize: 11,
                  color: simTheme.muted,
                }}
              >
                {tx(
                  'The same hazard runs twice: with the city untouched and with the improvement on (drains in rain, early warning in tsunami, reinforcement in earthquake/wind). This only switches which version you are viewing, to compare damage.',
                  'La misma catástrofe se corre dos veces: sin tocar la ciudad y con la mejora activada (drenajes en lluvia, alerta en tsunami, refuerzo en terremoto/viento). Esto solo cambia cuál de las dos versiones estás mirando, para comparar el daño.',
                )}
              </span>
            </label>
            <div
              aria-label="Progreso de la simulación"
              style={{
                height: 8,
                borderRadius: 4,
                background: 'rgba(233,242,240,0.14)',
                marginTop: 12,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.round(simulationProgress(flood.elapsedTimeInSeconds, durationMinutes) * 100)}%`,
                  background: simTheme.accent,
                  transition: 'width 0.3s',
                }}
              />
            </div>
            <p
              style={{ fontSize: 11, margin: '5px 0 0', color: simTheme.muted }}
            >
              {durationMinutes > 0
                ? `${Math.floor(flood.elapsedTimeInSeconds / 60)} / ${durationMinutes} min`
                : `${Math.floor(flood.elapsedTimeInSeconds / 60)} min · ${tx('no limit', 'sin límite')}`}{' '}
              ·{' '}
              {running
                ? tx('Running', 'En marcha')
                : simulationRef.current?.started
                  ? tx('Paused', 'En pausa')
                  : tx('Ready to start', 'Lista para iniciar')}
            </p>
            {(hazardKind === 'rain' || hazardKind === 'river-overflow') && (
              <>
                <button
                  type="button"
                  onClick={() => setDrainMode((mode) => !mode)}
                  style={{
                    width: '100%',
                    marginTop: 10,
                    padding: '9px 12px',
                    borderRadius: 10,
                    border: drainMode
                      ? `1px solid ${simTheme.accent}`
                      : `1px solid ${simTheme.border}`,
                    background: drainMode
                      ? 'rgba(45,212,191,0.16)'
                      : simTheme.fieldBackground,
                    color: simTheme.ink,
                    font: '600 13px system-ui',
                    cursor: 'pointer',
                  }}
                >
                  {drainMode
                    ? tx(
                        'Tap the map to add drains…',
                        'Tocá el mapa para sumar drenajes…',
                      )
                    : `${tx('Place drains', 'Colocar drenajes')} (${userDrains.length})`}
                </button>
                {userDrains.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setUserDrains([]);
                      simulationRef.current?.applyExtraDrains([]);
                    }}
                    style={{
                      width: '100%',
                      marginTop: 6,
                      padding: '7px 10px',
                      borderRadius: 10,
                      border: `1px solid ${simTheme.border}`,
                      background: simTheme.fieldBackground,
                      color: simTheme.ink,
                      font: '600 12px system-ui',
                      cursor: 'pointer',
                    }}
                  >
                    {tx('Remove placed drains', 'Quitar drenajes colocados')}
                  </button>
                )}
              </>
            )}
            {(hazardKind === 'tsunami' ||
              hazardKind === 'earthquake' ||
              hazardKind === 'strong-wind') && (
              <button
                type="button"
                onClick={() => {
                  const next = !hazardMeasure;
                  setHazardMeasure(next);
                  hazardMeasureRef.current = next;
                  simulationRef.current?.applyMeasure({
                    earlyWarning: hazardKind === 'tsunami' && next,
                    reinforcement: next,
                  });
                }}
                style={{
                  width: '100%',
                  marginTop: 10,
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: hazardMeasure
                    ? `1px solid ${simTheme.accent}`
                    : `1px solid ${simTheme.border}`,
                  background: hazardMeasure
                    ? 'rgba(45,212,191,0.16)'
                    : simTheme.fieldBackground,
                  color: simTheme.ink,
                  font: '600 13px system-ui',
                  cursor: 'pointer',
                }}
              >
                {hazardKind === 'tsunami'
                  ? hazardMeasure
                    ? tx(
                        'Early warning on (improvement)',
                        'Alerta temprana activada (mejora)',
                      )
                    : tx('Activate early warning', 'Activar alerta temprana')
                  : hazardKind === 'earthquake'
                    ? hazardMeasure
                      ? tx(
                          'Structural reinforcement on (improvement)',
                          'Refuerzo estructural activado (mejora)',
                        )
                      : tx(
                          'Activate structural reinforcement',
                          'Activar refuerzo estructural',
                        )
                    : hazardMeasure
                      ? tx(
                          'Facade protection on (improvement)',
                          'Protección de fachadas activada (mejora)',
                        )
                      : tx(
                          'Activate facade protection',
                          'Activar protección de fachadas',
                        )}
              </button>
            )}
            {timelineEvents.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <strong style={{ fontSize: 12, color: '#fff' }}>
                  {tx('Timeline', 'Línea de tiempo')}
                </strong>
                <ul
                  style={{
                    margin: '6px 0 0',
                    paddingLeft: 16,
                    fontSize: 11,
                    color: simTheme.muted,
                  }}
                >
                  {timelineEvents.map((event) => (
                    <li key={event.text}>{event.text}</li>
                  ))}
                </ul>
              </div>
            )}
            {savedScenarios.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <strong style={{ fontSize: 12, color: '#fff' }}>
                  {tx('Saved scenarios', 'Escenarios guardados')}
                </strong>
                <ul
                  style={{
                    margin: '6px 0 0',
                    paddingLeft: 16,
                    fontSize: 11,
                    color: simTheme.muted,
                  }}
                >
                  {[...savedScenarios]
                    .sort(
                      (a, b) =>
                        (b.resilienceScore ?? -1) - (a.resilienceScore ?? -1),
                    )
                    .map((scenario) => (
                      <li key={scenario.id}>
                        {scenario.name}
                        {scenario.resilienceScore !== undefined
                          ? ` · ${scenario.resilienceScore}/100`
                          : ''}{' '}
                        <button
                          type="button"
                          aria-label={`Borrar ${scenario.name}`}
                          onClick={() =>
                            setSavedScenarios(deleteSavedScenario(scenario.id))
                          }
                          style={{
                            border: 0,
                            background: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          {tx('Delete', 'Eliminar')}
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            {floodError && <p role="alert">{floodError}</p>}
            {flood && (
              <div role="status" aria-live="off" style={{ fontSize: 13 }}>
                <p>
                  {running
                    ? tx('Running', 'En marcha')
                    : simulationRef.current?.started
                      ? tx('Paused', 'En pausa')
                      : tx('Ready to start', 'Lista para iniciar')}{' '}
                  · {Math.floor(flood.elapsedTimeInSeconds / 60)}{' '}
                  {tx('simulated min', 'min simulados')}
                </p>
                {WATER_HAZARDS.includes(hazardKind) && (
                  <p>
                    {tx('Max water', 'Agua máxima')}:{' '}
                    {(flood.maxWaterDepthInMeters * 100).toFixed(1)} cm
                  </p>
                )}
                {comparison && comparison[arm].damagedBuildings > 0 && (
                  <p>
                    {tx('Damaged buildings', 'Edificios dañados')}:{' '}
                    {comparison[arm].damagedBuildings} ·{' '}
                    {tx('Collapsed', 'Derrumbados')}:{' '}
                    {comparison[arm].collapsedBuildings}
                    {structural &&
                      tx(
                        ` · Max severity: ${(structural.maxSeverity * 100).toFixed(0)}%`,
                        ` · Severidad máxima: ${(structural.maxSeverity * 100).toFixed(0)}%`,
                      )}
                  </p>
                )}
                {comparison && comparison[arm].trapped > 0 && (
                  <p>
                    {tx(
                      'People trapped in collapses',
                      'Personas atrapadas en derrumbes',
                    )}
                    : {comparison[arm].trapped} · {tx('Evacuated', 'Evacuadas')}
                    : {comparison[arm].evacuated}
                  </p>
                )}
                <p>
                  {tx('Blocked segments', 'Tramos bloqueados')}:{' '}
                  {
                    new Set([
                      ...flood.blockedRoadEdgeIds,
                      ...(simulationRef.current
                        ?.selectedCollapsedBlockedRoadEdgeIds ?? []),
                    ]).size
                  }{' '}
                  · {tx('Exposed buildings', 'Edificios expuestos')}:{' '}
                  {flood.exposedBuildingIds.length}
                </p>
              </div>
            )}
            <small>
              {tx(
                'Blue: water · Red: blocked segment · Orange/red with grid: exposed or damaged building · Grey: collapse debris · Violet: trapped person.',
                'Azul: agua · Rojo: tramo bloqueado · Naranja/rojo con rejilla: edificio expuesto o dañado · Gris: escombros de derrumbes · Violeta: persona atrapada.',
              )}
            </small>
            <p style={{ fontSize: 12 }}>
              {tx(
                `People: ${city.citizens?.length ?? 0}. The simulation starts on load. When blocked streets or exposed buildings are detected, the alarm triggers automatic evacuation to shelters. The alarm slows the pace to 3× to watch the walk. No AI connected. Drains: cyan.`,
                `Personas: ${city.citizens?.length ?? 0}. La simulación comienza al cargar. Al detectar calles bloqueadas o edificios expuestos, la alarma activa la evacuación automática hacia los refugios. La alarma reduce la velocidad a 3× para observar la caminata. Sin IA conectada. Sumideros: cian.`,
              )}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => applyDemoStep(0)}
                style={simPrimaryButton}
              >
                {tx('Guided demo', 'Demo guiada')}
              </button>
              <button
                type="button"
                disabled={!impactSummary}
                onClick={downloadCurrentReport}
                style={simGhostButton}
              >
                {tx('Download report', 'Descargar reporte')}
              </button>
            </div>
            {demoStep !== null && (
              <DemoTourPanel
                steps={demoSteps}
                step={demoStep}
                onStep={applyDemoStep}
                onExit={() => setDemoStep(null)}
              />
            )}
            {impactSummary && (
              <ImpactPanel
                summary={impactSummary}
                narrative={impactNarrative}
              />
            )}
            {comparison && (
              <ComparisonPanel
                comparison={comparison}
                alarmTime={alarmTime}
                total={city.citizens?.length ?? 0}
                hazardLabel={HAZARD_LABELS[hazardKind][language].toLowerCase()}
                improvementLabel={
                  hazardKind === 'earthquake'
                    ? tx(
                        'the seismic reinforcement changes',
                        'cambia el refuerzo sísmico',
                      )
                    : hazardKind === 'strong-wind'
                      ? tx(
                          'the secured roofs change',
                          'cambian los techos asegurados',
                        )
                      : tx('the drainage changes', 'cambia el drenaje')
                }
              />
            )}
            {comparison && scoreAfter !== null && (
              <p style={{ fontSize: 12.5, marginTop: 10 }}>
                {tx('Measured resilience', 'Resiliencia medida')}:{' '}
                <strong>{scoreBefore}/100</strong>{' '}
                {tx('without improvement', 'sin mejora')} →{' '}
                <strong>{scoreAfter}/100</strong>{' '}
                {tx('with improvement', 'con mejora')} (
                {resilienceGrade(scoreAfter)})
              </p>
            )}
            {comparison && (
              <ShareResultButton
                shareText={buildShareText({
                  zoneLabel,
                  hazardLabel:
                    HAZARD_LABELS[hazardKind][language].toLowerCase(),
                  score: scoreAfter ?? 0,
                  evacuated: comparison.after.evacuated,
                  total: city.citizens?.length ?? 0,
                  ...(hazardKind === 'tsunami' ? { waveHeightInMeters } : {}),
                })}
              />
            )}
            <WhatsAppPanel
              messages={buildAlertMessages({
                hazardLabel: HAZARD_LABELS[hazardKind][language].toLowerCase(),
                alarmMinutes: alarmTime === null ? null : alarmTime / 60,
                evacuated: comparison?.[arm].evacuated ?? 0,
                total: city.citizens?.length ?? 0,
                trapped: comparison?.[arm].trapped ?? 0,
                score: scoreAfter,
              })}
            />
            {beforeImage && (
              <div style={{ marginTop: 10 }}>
                <strong style={{ fontSize: 13 }}>
                  {tx(
                    'Before / after (real photos of the scene)',
                    'Antes / después (fotos reales de la escena)',
                  )}
                </strong>
                <BeforeAfterSlider
                  beforeImage={beforeImage}
                  afterImage={afterImage}
                  wipePercent={wipePercent}
                  onWipeChange={setWipePercent}
                  onCaptureAfter={() => {
                    const shot = captureViewRef.current?.();
                    if (shot) setAfterImage(shot);
                  }}
                />
              </div>
            )}
            <p style={{ fontSize: 11 }}>
              {tx(
                'Approximate grid: barriers by cell center, no roof runoff or real shelter safety.',
                'Grilla aproximada: barreras por centro de celda, sin escorrentía de techos ni seguridad real de refugios.',
              )}
            </p>
            <CitizenVoicePanel
              citizens={
                simulationRef.current?.evacuation.citizens.map((citizen) => ({
                  id: citizen.id,
                  status: citizen.status,
                })) ?? []
              }
              busy={citizenBusy}
              answer={citizenAnswer}
              onAsk={askCitizen}
            />
            <details style={{ marginTop: 12, fontSize: 12 }}>
              <summary>
                {tx('City information', 'Información de la ciudad')}
              </summary>
              <p style={{ margin: '8px 0' }}>
                {tx('City', 'Ciudad')}: {city.config.widthInMeters} ×{' '}
                {city.config.heightInMeters} m · {city.buildings.length}{' '}
                {tx('buildings', 'edificios')} · {tx('Seed', 'Semilla')}{' '}
                {city.config.seed}
              </p>
              {city.organic && (
                <p style={{ fontSize: 12 }}>
                  {tx(
                    `Neighborhoods: downtown, residential and commercial · Integrated lake and channel · ${city.organic.bridges.length} bridge connected to the streets. Built-up areas follow the shores; the calculation grid stays rectangular.`,
                    `Barrios: centro, residencial y comercial · Lago y canal integrados · ${city.organic.bridges.length} puente conectado a las calles. Las zonas urbanizadas siguen las orillas; la grilla de cálculo sigue siendo rectangular.`,
                  )}
                </p>
              )}
              {city.real && (
                <p style={{ fontSize: 12 }}>
                  {tx('Real zone', 'Zona real')}: {city.real.name} ·{' '}
                  {city.buildings.length} {tx('buildings and', 'edificios y')}{' '}
                  {city.roads.length}{' '}
                  {tx(
                    'real street segments on',
                    'tramos de calle reales sobre',
                  )}{' '}
                  {city.real.demSource === 'plan-flat-elevation-0'
                    ? tx(
                        'flat terrain at elevation 0 (plan without elevation)',
                        'terreno plano a cota 0 (plano sin relieve)',
                      )
                    : `DEM ${tx('of', 'de')} ${city.real.demCellSizeInMeters} m`}
                  . {tx('Source heights', 'Alturas de la fuente')}:{' '}
                  {city.real.measuredBuildingHeights}{' '}
                  {tx('measured and', 'medidas y')}{' '}
                  {city.real.estimatedBuildingHeights}{' '}
                  {tx(
                    'estimated (marked as inferred, not official).',
                    'estimadas (marcadas como inferidas, no oficiales).',
                  )}
                  {city.real.syntheticBuildings > 0 &&
                    tx(
                      ` Plus ${city.real.syntheticBuildings} synthetic infill houses (not real).`,
                      ` Más ${city.real.syntheticBuildings} casas sintéticas de relleno (no reales).`,
                    )}{' '}
                  {tx(
                    'Synthetic population and shelters on the real network.',
                    'Población y refugios sintéticos sobre la red real.',
                  )}{' '}
                  {city.real.attribution}.{' '}
                  {tx(
                    'Experimental simulation, not a real flood forecast.',
                    'Simulación experimental, no pronóstico de inundación real.',
                  )}
                </p>
              )}
              <p style={{ margin: '8px 0' }}>
                {tx('Parks', 'Plazas')}: {city.district?.parks.length ?? 0} ·{' '}
                {tx('Shelters', 'Refugios')}: {city.shelters?.length ?? 0}
              </p>
              <small>
                {tx(
                  'Houses with roofs · Apartments with balconies · Shops with storefronts',
                  'Casas con techo · Departamentos con balcones · Comercios con vidriera',
                )}
              </small>
              <details style={{ marginTop: 10, fontSize: 12 }}>
                <summary>
                  {tx(
                    'Urban services and mobility',
                    'Servicios y movilidad urbana',
                  )}
                </summary>
                <p>
                  {civicLandmarks?.assignments
                    .map(
                      (item) => civicLabels[item.role]?.[language] ?? item.role,
                    )
                    .join(' · ') ||
                    tx(
                      'No buildings suitable for visual services',
                      'Sin edificios aptos para servicios visuales',
                    )}
                </p>
                <p>
                  {tx('Vehicles in transit', 'Vehículos en tránsito')}:{' '}
                  {trafficCount} · {tx('Parked', 'Estacionados')}:{' '}
                  {trafficCount
                    ? 0
                    : (cityLife?.items.filter((item) =>
                        ['car', 'taxi', 'van', 'bus'].includes(item.kind),
                      ).length ?? 0)}{' '}
                  · {tx('Stops', 'Paradas')}:{' '}
                  {cityLife?.items.filter((item) => item.kind === 'bus-stop')
                    .length ?? 0}{' '}
                  · {tx('Traffic lights', 'Semáforos')}:{' '}
                  {cityLife?.items.filter(
                    (item) => item.kind === 'traffic-light',
                  ).length ?? 0}
                </p>
                <p>
                  {tx(
                    'Kinematic traffic with acceleration, braking, spacing and turns at crossings. It respects closures from water and debris. It does not include rigid-body impacts or collisions with pedestrians.',
                    'Tránsito cinemático con aceleración, frenado, separación y turnos en cruces. Respeta cierres por agua y escombros. No incluye impactos de cuerpos rígidos ni colisiones con peatones.',
                  )}
                </p>
                <strong>
                  {tx(
                    'Synthetic access via the road network',
                    'Acceso sintético por la red vial',
                  )}
                </strong>
                {services?.roles.map((service) => (
                  <p key={service.role}>
                    {civicLabels[service.role]?.[language] ?? service.role}:{' '}
                    {service.facilityCount} {tx('site', 'sede')} ·{' '}
                    {service.reachableBuildingCount}/
                    {services.residentialBuildingCount}{' '}
                    {tx('connected homes', 'viviendas conectadas')}
                    {service.meanDistanceInMeters !== null &&
                      tx(
                        ` · average trip ${Math.round(service.meanDistanceInMeters)} m`,
                        ` · recorrido medio ${Math.round(service.meanDistanceInMeters)} m`,
                      )}
                  </p>
                ))}
                <p>
                  {tx(
                    'Access estimated to the nearest road node; entrances, capacity, dispatch or safety during the disaster are not modeled. This is not real service coverage.',
                    'Accesos estimados al nodo vial más cercano; no se modelan entradas, capacidad, despachos ni seguridad durante la catástrofe. No es cobertura real de servicios.',
                  )}
                </p>
              </details>
              <p style={{ fontSize: 12, color: simTheme.muted }}>
                {city.real
                  ? tx(
                      'Imported real relief (Terrarium DEM resampled to 20 m) and OpenStreetMap streets/buildings converted to the simulation graph. Footprints are approximated with rotated rectangles that contain them.',
                      'Relieve real importado (DEM Terrarium remuestreado a 20 m) y calles/edificios de OpenStreetMap convertidos al grafo de simulación. Las huellas se aproximan con rectángulos rotados que las contienen.',
                    )
                  : city.organic
                    ? tx(
                        'Local geography with an excavated channel, lake and irregular neighborhoods. The bridge keeps its deck above the water; routes use its height.',
                        'Geografía local con cauce excavado, lago y barrios irregulares. El puente conserva su tablero por encima del agua; las rutas usan su altura.',
                      )
                    : city.terrainProfile === 'basin'
                      ? tx(
                          'Synthetic local relief with slope and a central depression; 10 m grid. Water collects in low areas first.',
                          'Relieve local sintético con pendiente y depresión central; grilla de 10 m. El agua se acumula primero en zonas bajas.',
                        )
                      : tx(
                          'Original flat terrain with buildings as barriers and differentiated absorption.',
                          'Terreno plano original con edificios como barreras y absorción diferenciada.',
                        )}{' '}
                {tx(
                  'The event starts automatically. Changing the terrain restarts the simulation.',
                  'El evento comienza automáticamente. Cambiar el terreno reinicia la simulación.',
                )}
              </p>
            </details>
            <button
              type="button"
              onClick={() => {
                setShowFinalSummary(false);
                toggleFlood();
              }}
              style={{
                width: '100%',
                marginTop: 10,
                padding: '11px 14px',
                borderRadius: 10,
                border: 0,
                background: running ? '#b45309' : simTheme.primaryBackground,
                color: '#fff',
                font: '700 14px system-ui',
                cursor: 'pointer',
              }}
            >
              {running
                ? tx('Pause', 'Pausar')
                : simulationRef.current?.started
                  ? tx('Resume simulation', 'Reanudar simulación')
                  : tx('Start simulation', 'Iniciar simulación')}
            </button>
            {simulationRef.current?.started && !running && (
              <button
                type="button"
                onClick={finishSimulation}
                style={{
                  width: '100%',
                  marginTop: 7,
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: `1px solid ${simTheme.border}`,
                  background: simTheme.fieldBackground,
                  color: simTheme.ink,
                  font: '600 13px system-ui',
                  cursor: 'pointer',
                }}
              >
                {tx('Finish and view summary', 'Terminar y ver resumen')}
              </button>
            )}
            {simulationRef.current?.started && (
              <button
                type="button"
                onClick={restartSimulation}
                style={{
                  width: '100%',
                  marginTop: 7,
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: `1px solid ${simTheme.border}`,
                  background: simTheme.fieldBackground,
                  color: simTheme.ink,
                  font: '600 13px system-ui',
                  cursor: 'pointer',
                }}
              >
                {tx('Restart', 'Reiniciar')}
              </button>
            )}
          </aside>
        )}
        {importCardOpen && (
          <aside
            aria-label="Importar zona real o plano"
            style={{
              position: 'absolute',
              top: 100,
              left: 16,
              width: 400,
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: 'calc(100vh - 190px)',
              overflowY: 'auto',
              padding: 16,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.96)',
              color: '#17252a',
              fontFamily: 'sans-serif',
              boxShadow: '0 4px 24px #0002',
              zIndex: 5,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <strong>Importar zona real o plano</strong>
              <button
                type="button"
                onClick={() => setImportCardOpen(false)}
                style={{
                  border: '1px solid #b6c4c9',
                  borderRadius: 8,
                  background: '#fff',
                  padding: '5px 10px',
                  cursor: 'pointer',
                  font: 'inherit',
                  fontWeight: 600,
                }}
              >
                Cerrar
              </button>
            </div>
            <RealCityImporter
              onImported={(next) => {
                applyImportedCity(next);
                setImportCardOpen(false);
              }}
            />
          </aside>
        )}
        {panelOpen && (
          <aside
            id="city-settings"
            aria-label={tx('District information', 'Información del distrito')}
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
              ...simGlassPanel,
              background: simTheme.panelStrong,
            }}
          >
            <strong>
              {tx('Simulator settings', 'Opciones del simulador')}
            </strong>
            <p
              style={{ fontSize: 11, margin: '6px 0 0', color: simTheme.muted }}
            >
              {tx(
                'Only city, layout, terrain, surroundings and agent configuration. Simulation results live in the Simulation panel on the right.',
                'Solo configuración de ciudad, trazado, terreno, entorno y agente. Los resultados de la simulación están en el panel Simulación de la derecha.',
              )}
            </p>
            <CityGenerationControls
              key={`${citySeed}:${randomizedCity}:${cityMode}`}
              seed={citySeed}
              randomized={randomizedCity}
              mode={cityMode}
              onModeChange={(mode) =>
                regenerateCity(citySeed, randomizedCity, mode)
              }
              onGenerate={(seed) => regenerateCity(seed)}
              onRandom={generateRandomCity}
            />
            <AgentPanel
              busy={agentBusy}
              iteration={agentIteration}
              done={agentDone}
              history={agentHistory}
              disabledReason={
                comparison
                  ? null
                  : tx(
                      'Start and run the simulation to measure metrics first.',
                      'Iniciá y corré la simulación para medir métricas primero.',
                    )
              }
              onRun={runAgentIteration}
              mayorBusy={mayorBusy}
              onMayor={runMayorAgent}
            />
            {world && !city.real && (
              <WorldControls
                seed={worldSeed}
                width={world.bounds.maxX - world.bounds.minX}
                height={world.bounds.maxZ - world.bounds.minZ}
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
                {tx('Layout', 'Trazado')}{' '}
                <select
                  style={simField}
                  aria-label={tx('City layout', 'Trazado de ciudad')}
                  value={layoutMode}
                  onChange={(event) => {
                    setRunning(false);
                    setFlood(null);
                    setComparison(null);
                    setAlarmTime(null);
                    setLayoutMode(
                      event.target.value as
                        'organic' | 'grid' | 'real' | 'imported',
                    );
                  }}
                >
                  <option value="organic">
                    {tx(
                      'Organic · lake and bridge',
                      'Orgánico · lago y puente',
                    )}
                  </option>
                  <option value="grid">
                    {tx('Original grid', 'Grilla original')}
                  </option>
                  <option value="real">
                    {tx(
                      'Real district · Example (OSM)',
                      'Barrio real · Example (OSM)',
                    )}
                  </option>
                  <option value="imported" disabled={!importedCity}>
                    {tx('Imported zone', 'Zona importada')}
                    {importedCity?.real ? ` · ${importedCity.real.name}` : ''}
                  </option>
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
                style={simGhostButton}
              >
                {tx('Generate another city', 'Generar otra ciudad')}
              </button>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 12 }}>
              {tx(
                'Drag to rotate · Right-drag to pan · Scroll to zoom where the cursor points · WASD/arrow keys to move, Q/E to go down/up, Shift to go faster. Synthetic terrain and population; demonstration simulation, not a real prediction.',
                'Arrastra para girar · Arrastra con botón derecho para desplazarte · Rueda para acercar donde apunta el cursor · WASD/flechas para moverte, Q/E para bajar/subir, Shift para ir más rápido. Terreno y población sintéticos; simulación demostrativa, no predicción real.',
              )}
            </p>
            <label style={{ display: 'block', margin: '8px 0', fontSize: 13 }}>
              {tx('Terrain', 'Terreno')}{' '}
              <select
                style={simField}
                aria-label={tx('Terrain type', 'Tipo de terreno')}
                value={reliefMode ? 'basin' : 'flat'}
                disabled={!!city.real || !sourceCity?.terrainGrid}
                onChange={(event) => {
                  setRunning(false);
                  setFlood(null);
                  setReliefMode(event.target.value === 'basin');
                }}
              >
                <option value="basin">
                  {city.organic
                    ? tx('Relief and basins', 'Relieve y cuencas')
                    : tx(
                        'Relief with low area · demo',
                        'Relieve con zona baja · demo',
                      )}
                </option>
                <option value="flat">
                  {city.organic
                    ? tx('Plain with basins', 'Llanura con cuencas')
                    : tx('Flat · original', 'Plano · original')}
                </option>
              </select>
            </label>
          </aside>
        )}
        {inspectedBuilding && (
          <aside
            aria-label="Edificio inspeccionado"
            style={{
              position: 'absolute',
              bottom: 16,
              left: 16,
              width: 260,
              padding: 14,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.96)',
              color: '#17252a',
              fontFamily: 'system-ui, sans-serif',
              boxShadow: '0 4px 24px #0002',
              zIndex: 5,
              fontSize: 13,
            }}
          >
            <strong>Edificio inspeccionado</strong>
            <button
              type="button"
              aria-label="Cerrar inspector"
              onClick={() => setInspectedId(null)}
              style={{
                float: 'right',
                border: 0,
                background: 'none',
                cursor: 'pointer',
              }}
            >
              Cerrar
            </button>
            <p style={{ margin: '8px 0 0' }}>
              Uso:{' '}
              {inspectedBuilding.use === 'commercial'
                ? 'Comercial'
                : 'Residencial'}
              {inspectedBuilding.vulnerable
                ? ` · Vulnerable (${inspectedBuilding.vulnerable === 'school' ? 'escuela' : inspectedBuilding.vulnerable === 'hospital' ? 'hospital' : 'residencia de mayores'})`
                : ''}
            </p>
            <p style={{ margin: '4px 0 0' }}>
              Altura: {inspectedBuilding.heightInMeters.toFixed(0)} m · Personas
              en casa:{' '}
              {city?.citizens?.filter(
                (c) => c.homeBuildingId === inspectedBuilding.id,
              ).length ?? 0}
            </p>
            <p style={{ margin: '4px 0 0' }}>
              Estado:{' '}
              {flood?.exposedBuildingIds.includes(inspectedBuilding.id)
                ? 'Expuesto al agua'
                : 'Sin exposición por ahora'}
            </p>
          </aside>
        )}
        {showFinalSummary && impactSummary && (
          <FinalSummary
            title={`${hazardPreset(hazardKind).label} ${tx('in', 'en')} ${zoneLabel}`}
            input={{
              elapsedSeconds: flood?.elapsedTimeInSeconds ?? 0,
              evacuated: comparison?.[arm].evacuated ?? 0,
              totalCitizens: city.citizens?.length ?? 0,
              trapped: comparison?.[arm].trapped ?? 0,
              exposedBuildings: impactSummary.exposedBuildings,
              damagedBuildings: comparison?.[arm].damagedBuildings ?? 0,
              collapsedBuildings: comparison?.[arm].collapsedBuildings ?? 0,
              totalBuildings: city.buildings.length,
              blockedRoads: impactSummary.blockedRoads,
              maxWaterDepthInMeters: impactSummary.maxWaterDepthInMeters,
              withoutShelter: Math.max(
                0,
                (city.citizens?.length ?? 0) -
                  (comparison?.[arm].evacuated ?? 0) -
                  (comparison?.[arm].trapped ?? 0),
              ),
              shelterOccupancy,
              shelterCapacity,
              vulnerableExposed,
              vulnerableTotal: vulnerableBuildings.length,
            }}
            narrative={[...impactNarrative, ...recommendationLines]}
            onSaveScenario={() => {
              setSavedScenarios(
                saveScenario({
                  id: `scenario-${Date.now()}`,
                  name: `${hazardPreset(hazardKind).label} en ${zoneLabel}`,
                  hazard: hazardKind,
                  zoneLabel,
                  durationInMinutes: durationMinutes,
                  rainIntensityMmPerHour:
                    hazardKind === 'rain' || hazardKind === 'river-overflow'
                      ? rainIntensity
                      : null,
                  drains: userDrains,
                  createdAt: new Date().toISOString(),
                  resultLine: impactNarrative[0] ?? '',
                  resilienceScore: scoreAfter ?? undefined,
                }),
              );
            }}
            onDownloadReport={downloadCurrentReport}
            onRestart={restartSimulation}
            onClose={() => setShowFinalSummary(false)}
          />
        )}
      </main>
    </LanguageContext.Provider>
  );
}
