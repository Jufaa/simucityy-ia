import {
  projectedExtentInMeters,
  type OsmElementInput,
  type OsmWayInput,
  type RealCitySource,
} from './real-city-model';
import { latLonToWorldPixels, type LatLon } from './map-projection';

/**
 * Browser-side acquisition for user-chosen real zones. All sources are free
 * and CORS-enabled (verified): Nominatim search, Overpass geometry and
 * Terrarium DEM tiles. Nothing is persisted; the caller keeps the converted
 * city in memory. The pure helpers (GeoJSON parsing, bbox filtering, DEM
 * grid assembly) are unit-tested offline.
 */

export type Bbox = RealCitySource['bbox'];

export interface PlaceResult {
  displayName: string;
  lat: number;
  lon: number;
}

const USER_AGENT_HINT = 'simulicity-ia real-city import';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const TAG_WHITELIST = [
  'highway',
  'building',
  'building:levels',
  'building:part',
  'min_height',
  'height',
  'leisure',
  'landuse',
  'amenity',
  'tourism',
  'historic',
];

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=' +
    encodeURIComponent(query);
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok)
    throw new Error(`El buscador de lugares devolvió HTTP ${response.status}.`);
  const data = (await response.json()) as {
    display_name: string;
    lat: string;
    lon: string;
  }[];
  return data
    .map((item) => ({
      displayName: item.display_name,
      lat: Number.parseFloat(item.lat),
      lon: Number.parseFloat(item.lon),
    }))
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon));
}

// ---------- DEM ----------

/** Regular DEM grid over a bbox from a synchronous elevation sampler. */
export function buildDemGrid(
  bbox: Bbox,
  cellSizeInMeters: number,
  sampler: (lat: number, lon: number) => number,
  source: string,
): RealCitySource['dem'] {
  const { widthInMeters: width, heightInMeters: height } =
    projectedExtentInMeters(bbox);
  const metersPerDegreeLat = height / (bbox.north - bbox.south);
  const metersPerDegreeLon = width / (bbox.east - bbox.west);
  const axis = (length: number) => {
    // Round to 0.1 m and drop collapsed duplicates: when the length is a
    // near-exact multiple of the cell size, the clipped final interval can
    // round onto the previous coordinate and break strict monotonicity.
    const values: number[] = [];
    const steps = Math.ceil(length / cellSizeInMeters) + 1;
    for (let i = 0; i < steps; i++) {
      const rounded =
        Math.round(Math.min(i * cellSizeInMeters, length) * 10) / 10;
      if (!values.length || rounded > values[values.length - 1]!)
        values.push(rounded);
    }
    return values;
  };
  const xCoordinates = axis(width);
  const yCoordinates = axis(height);
  return {
    source,
    xCoordinates,
    yCoordinates,
    elevationsInMeters: yCoordinates.map((y) =>
      xCoordinates.map(
        (x) =>
          Math.round(
            sampler(
              bbox.south + y / metersPerDegreeLat,
              bbox.west + x / metersPerDegreeLon,
            ) * 10,
          ) / 10,
      ),
    ),
  };
}

export function flatDemGrid(bbox: Bbox, cellSizeInMeters: number) {
  return buildDemGrid(bbox, cellSizeInMeters, () => 0, 'plan-flat-elevation-0');
}

const TERRARIUM_ZOOM = 15;

/** Loads the Terrarium tiles covering a bbox and returns an elevation sampler. */
export async function loadTerrariumElevationSampler(
  bbox: Bbox,
): Promise<(lat: number, lon: number) => number> {
  const northWest = latLonToWorldPixels(
    { lat: bbox.north, lon: bbox.west },
    TERRARIUM_ZOOM,
  );
  const southEast = latLonToWorldPixels(
    { lat: bbox.south, lon: bbox.east },
    TERRARIUM_ZOOM,
  );
  const tileMinX = Math.floor(northWest.x / 256);
  const tileMaxX = Math.floor(southEast.x / 256);
  const tileMinY = Math.floor(northWest.y / 256);
  const tileMaxY = Math.floor(southEast.y / 256);
  const tiles = new Map<string, Uint8ClampedArray>();
  const loads: Promise<void>[] = [];
  for (let tileX = tileMinX; tileX <= tileMaxX; tileX++)
    for (let tileY = tileMinY; tileY <= tileMaxY; tileY++) {
      const key = `${tileX},${tileY}`;
      loads.push(
        (async () => {
          const image = new Image();
          image.crossOrigin = 'anonymous';
          image.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${TERRARIUM_ZOOM}/${tileX}/${tileY}.png`;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 256;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (!context) throw new Error('Canvas 2D no disponible para el DEM.');
          context.drawImage(image, 0, 0);
          tiles.set(key, context.getImageData(0, 0, 256, 256).data);
        })(),
      );
    }
  await Promise.all(loads);
  const pixelAt = (globalX: number, globalY: number): number => {
    const tileX = Math.floor(globalX / 256);
    const tileY = Math.floor(globalY / 256);
    const data = tiles.get(`${tileX},${tileY}`);
    if (!data) return 0;
    const localX = Math.max(0, Math.min(255, globalX - tileX * 256));
    const localY = Math.max(0, Math.min(255, globalY - tileY * 256));
    const index = (localY * 256 + localX) * 4;
    return (
      data[index]! * 256 + data[index + 1]! + data[index + 2]! / 256 - 32768
    );
  };
  return (lat: number, lon: number) => {
    const { x, y } = latLonToWorldPixels({ lat, lon }, TERRARIUM_ZOOM);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const a = pixelAt(x0, y0);
    const b = pixelAt(x0 + 1, y0);
    const c = pixelAt(x0, y0 + 1);
    const d = pixelAt(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

// ---------- OSM download ----------

export async function fetchOsmSource(
  bbox: Bbox,
  name: string,
  onStage?: (stage: string) => void,
): Promise<RealCitySource> {
  const query = `[out:json][timeout:120];
(
  way["highway"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  way["building"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  way["building:part"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  way["leisure"="stadium"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  way["amenity"~"^(hospital|clinic)$"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  way["leisure"~"^(park|garden)$"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  way["landuse"~"^(grass|meadow|recreation_ground|village_green)$"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  relation["building"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  relation["leisure"~"^(park|garden)$"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  relation["landuse"~"^(grass|meadow|recreation_ground|village_green)$"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
);
out geom;`;
  type OverpassResponse = {
    elements?: {
      type: string;
      id: number;
      tags?: Record<string, string>;
      geometry?: { lat: number; lon: number }[];
      members?: {
        type: string;
        role?: string;
        geometry?: { lat: number; lon: number }[];
      }[];
    }[];
    osm3s?: { timestamp_osm_base?: string };
  };
  let osm: OverpassResponse | null = null;
  let lastError: unknown = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    if (osm) break;
    for (let attempt = 1; attempt <= 2 && !osm; attempt++) {
      try {
        onStage?.(
          `Descargando calles y edificios de OpenStreetMap (intento ${attempt})…`,
        );
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Client-Hint': USER_AGENT_HINT,
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(150000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        osm = (await response.json()) as OverpassResponse;
      } catch (error) {
        lastError = error;
      }
    }
  }
  if (!osm)
    throw new Error(
      `No se pudo descargar la zona desde OpenStreetMap (${lastError instanceof Error ? lastError.message : 'sin respuesta'}). Probá de nuevo en unos segundos.`,
    );
  const roundPoint = (point: { lat: number; lon: number }) => ({
    lat: Math.round(point.lat * 1e7) / 1e7,
    lon: Math.round(point.lon * 1e7) / 1e7,
  });
  const pickTags = (tags: Record<string, string> | undefined) =>
    Object.fromEntries(
      Object.entries(tags ?? {}).filter(([key]) => TAG_WHITELIST.includes(key)),
    );
  const elements: OsmElementInput[] = (osm.elements ?? []).flatMap(
    (element): OsmElementInput[] => {
      if (element.type === 'way' && Array.isArray(element.geometry))
        return [
          {
            type: 'way',
            id: element.id,
            tags: pickTags(element.tags),
            geometry: element.geometry.map(roundPoint),
          },
        ];
      if (element.type === 'relation' && Array.isArray(element.members))
        return [
          {
            type: 'relation',
            id: element.id,
            tags: pickTags(element.tags),
            members: element.members
              .filter((member) => member.type === 'way' && member.geometry)
              .map((member) => ({
                type: 'way',
                role: member.role ?? '',
                geometry: member.geometry!.map(roundPoint),
              })),
          },
        ];
      return [];
    },
  );
  if (!elements.some((element) => element.tags?.highway))
    throw new Error('La zona elegida no devolvió calles utilizables.');
  onStage?.('Descargando el relieve (DEM)…');
  const sampler = await loadTerrariumElevationSampler(bbox);
  return {
    name,
    bbox,
    ...(osm.osm3s?.timestamp_osm_base
      ? { osmTimestamp: osm.osm3s.timestamp_osm_base }
      : {}),
    elements,
    dem: buildDemGrid(bbox, 20, sampler, 'terrarium-tiles-z15'),
  };
}

// ---------- Uploaded plans (GeoJSON) ----------

export interface ParsedPlan {
  elements: OsmWayInput[];
  bounds: Bbox;
  featureCount: number;
  skippedCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function positionToLatLon(position: unknown): LatLon | null {
  if (!Array.isArray(position) || position.length < 2) return null;
  const [lon, lat] = position as [unknown, unknown];
  if (
    typeof lon !== 'number' ||
    typeof lat !== 'number' ||
    !Number.isFinite(lon) ||
    !Number.isFinite(lat) ||
    Math.abs(lon) > 180 ||
    Math.abs(lat) > 85
  )
    return null;
  return { lat, lon };
}

function tagsFromProperties(
  properties: Record<string, unknown>,
): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const key of TAG_WHITELIST) {
    const value = properties[key];
    if (typeof value === 'string' || typeof value === 'number')
      tags[key] = String(value);
  }
  const kind = String(properties.kind ?? properties.type ?? '').toLowerCase();
  if (!tags.building && ['building', 'edificio'].includes(kind))
    tags.building = 'yes';
  if (!tags.building && ['church', 'iglesia', 'temple'].includes(kind))
    tags.building = 'church';
  if (!tags.leisure && ['stadium', 'estadio'].includes(kind))
    tags.leisure = 'stadium';
  if (!tags.amenity && kind === 'hospital') tags.amenity = 'hospital';
  if (!tags.highway && ['road', 'street', 'calle'].includes(kind))
    tags.highway = 'residential';
  if (!tags.leisure && ['park', 'parque'].includes(kind)) tags.leisure = 'park';
  if (!tags['building:levels'] && typeof properties.levels === 'number')
    tags['building:levels'] = String(properties.levels);
  if (!tags.height && typeof properties.heightInMeters === 'number')
    tags.height = String(properties.heightInMeters);
  return tags;
}

/**
 * Converts an uploaded GeoJSON plan (WGS84 lon/lat coordinates) into the
 * converter's way list. Polygons become buildings/parks, lines become roads.
 * Local-coordinate CAD drawings must be georeferenced before upload; see
 * docs/REAL_CITY.md for the expected format.
 */
export function elementsFromGeoJson(input: unknown): ParsedPlan {
  if (!isRecord(input))
    throw new Error('El plano debe ser un GeoJSON (FeatureCollection).');
  const features: unknown[] =
    input.type === 'FeatureCollection' && Array.isArray(input.features)
      ? input.features
      : input.type === 'Feature'
        ? [input]
        : [];
  if (!features.length) throw new Error('El GeoJSON no contiene features.');
  if (features.length > 50000)
    throw new Error('El plano supera el máximo de 50000 features.');
  const elements: OsmWayInput[] = [];
  let skipped = 0;
  let south = Infinity,
    west = Infinity,
    north = -Infinity,
    east = -Infinity;
  const extend = (point: LatLon) => {
    south = Math.min(south, point.lat);
    north = Math.max(north, point.lat);
    west = Math.min(west, point.lon);
    east = Math.max(east, point.lon);
  };
  let nextId = 1;
  for (const feature of features) {
    if (!isRecord(feature) || !isRecord(feature.geometry)) {
      skipped++;
      continue;
    }
    const properties = isRecord(feature.properties) ? feature.properties : {};
    const tags = tagsFromProperties(properties);
    const geometry = feature.geometry;
    const addWay = (points: LatLon[]) => {
      if (points.length < 2) {
        skipped++;
        return;
      }
      points.forEach(extend);
      elements.push({
        type: 'way',
        id: nextId++,
        tags,
        geometry: points.map((p) => ({ lat: p.lat, lon: p.lon })),
      });
    };
    const ring = (coordinates: unknown): LatLon[] =>
      Array.isArray(coordinates)
        ? coordinates
            .map(positionToLatLon)
            .filter((p): p is LatLon => p !== null)
        : [];
    if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
      const outer = ring(geometry.coordinates[0]);
      if (outer.length >= 3) addWay(outer);
      else skipped++;
    } else if (
      geometry.type === 'MultiPolygon' &&
      Array.isArray(geometry.coordinates)
    ) {
      for (const polygon of geometry.coordinates) {
        const outer = ring(Array.isArray(polygon) ? polygon[0] : undefined);
        if (outer.length >= 3) addWay(outer);
        else skipped++;
      }
    } else if (
      geometry.type === 'LineString' &&
      Array.isArray(geometry.coordinates)
    ) {
      addWay(ring(geometry.coordinates));
    } else if (
      geometry.type === 'MultiLineString' &&
      Array.isArray(geometry.coordinates)
    ) {
      for (const line of geometry.coordinates) addWay(ring(line));
    } else {
      skipped++;
    }
  }
  if (!elements.length || !Number.isFinite(south))
    throw new Error(
      'No se encontraron polígonos ni líneas válidos en WGS84 (lon/lat). Si tu plano está en coordenadas locales, georreferencialo antes de subirlo.',
    );
  return {
    elements,
    bounds: { south, west, north, east },
    featureCount: features.length,
    skippedCount: skipped,
  };
}

/** Buildings/parks stay only when their ring centre falls inside the selection; roads are clipped later by the converter. */
export function filterElementsToBbox(
  elements: OsmWayInput[],
  bbox: Bbox,
): OsmWayInput[] {
  const inside = (point: { lat: number; lon: number }) =>
    point.lat >= bbox.south &&
    point.lat <= bbox.north &&
    point.lon >= bbox.west &&
    point.lon <= bbox.east;
  return elements.filter((element) => {
    if (element.tags?.highway) return true;
    const geometry = element.geometry ?? [];
    if (!geometry.length) return false;
    const centre = {
      lat: geometry.reduce((sum, p) => sum + p.lat, 0) / geometry.length,
      lon: geometry.reduce((sum, p) => sum + p.lon, 0) / geometry.length,
    };
    return inside(centre);
  });
}

export async function sourceFromPlan(
  plan: ParsedPlan,
  bbox: Bbox,
  name: string,
  useRealDem: boolean,
  onStage?: (stage: string) => void,
): Promise<RealCitySource> {
  const elements = filterElementsToBbox(plan.elements, bbox);
  if (!elements.some((element) => element.tags?.building))
    throw new Error('La zona recortada del plano no contiene edificios.');
  if (!elements.some((element) => element.tags?.highway))
    throw new Error('La zona recortada del plano no contiene calles.');
  let dem: RealCitySource['dem'];
  if (useRealDem) {
    try {
      onStage?.('Descargando el relieve (DEM)…');
      const sampler = await loadTerrariumElevationSampler(bbox);
      dem = buildDemGrid(bbox, 20, sampler, 'terrarium-tiles-z15');
    } catch {
      onStage?.('Sin relieve disponible: se usa terreno plano a cota 0.');
      dem = flatDemGrid(bbox, 20);
    }
  } else {
    dem = flatDemGrid(bbox, 20);
  }
  return { name, bbox, elements, dem };
}
