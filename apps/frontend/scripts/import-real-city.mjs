#!/usr/bin/env node
/**
 * Downloads a real district (OpenStreetMap ways + Terrarium DEM tiles) and
 * writes a compact RealCitySource JSON consumed by
 * src/components/real-city-model.ts. Runs offline afterwards: the app never
 * calls these services at runtime.
 *
 * Usage:
 *   node scripts/import-real-city.mjs [--bbox south,west,north,east]
 *     [--name "Eixample, Barcelona"] [--out src/data/eixample-source.json]
 *     [--cell 20] [--overpass https://overpass-api.de/api/interpreter]
 *
 * Sources: © OpenStreetMap contributors (ODbL); elevation tiles are the
 * Mapzen Terrarium tiles on AWS Terrain Tiles (data: SRTM, GMTED and other
 * public DEMs). Keep the attribution in the generated metadata.
 */
import { inflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Buffer } from 'node:buffer';
import { setTimeout as delay } from 'node:timers';
import { URLSearchParams } from 'node:url';

const { fetch, AbortSignal } = globalThis;

const args = process.argv.slice(2);
function arg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}
const bboxText = arg('bbox', '41.391,2.158,41.400,2.170');
const [south, west, north, east] = bboxText.split(',').map(Number);
if (
  ![south, west, north, east].every(Number.isFinite) ||
  north <= south ||
  east <= west
) {
  console.error('Invalid --bbox south,west,north,east');
  process.exit(1);
}
const name = arg('name', 'Eixample, Barcelona');
const out = arg('out', 'src/data/eixample-source.json');
const cell = Number(arg('cell', '20'));
const overpassEndpoints = [
  arg('overpass', 'https://overpass-api.de/api/interpreter'),
  'https://overpass.kumi.systems/api/interpreter',
];

// Same equirectangular approximation as real-city-model.ts (converter validates).
const centerLat = ((south + north) / 2) * (Math.PI / 180);
const metersPerDegreeLat =
  111132.92 -
  559.82 * Math.cos(2 * centerLat) +
  1.175 * Math.cos(4 * centerLat);
const metersPerDegreeLon =
  111412.84 * Math.cos(centerLat) - 93.5 * Math.cos(3 * centerLat);
const width = (east - west) * metersPerDegreeLon;
const height = (north - south) * metersPerDegreeLat;
function axis(length) {
  // Rounded to 0.1 m when written out; drop duplicates collapsed by rounding.
  const values = [];
  for (let i = 0; i < Math.ceil(length / cell) + 1; i++) {
    const value = Math.min(i * cell, length);
    if (
      !values.length ||
      Math.round(value * 10) / 10 >
        Math.round(values[values.length - 1] * 10) / 10
    )
      values.push(value);
  }
  return values;
}
const xs = axis(width);
const ys = axis(height);

// ---------- Overpass ----------
const query = `[out:json][timeout:120];
(
  way["highway"](${south},${west},${north},${east});
  way["building"](${south},${west},${north},${east});
  way["leisure"~"^(park|garden)$"](${south},${west},${north},${east});
  way["landuse"~"^(grass|meadow|recreation_ground|village_green)$"](${south},${west},${north},${east});
  relation["building"](${south},${west},${north},${east});
  relation["leisure"~"^(park|garden)$"](${south},${west},${north},${east});
  relation["landuse"~"^(grass|meadow|recreation_ground|village_green)$"](${south},${west},${north},${east});
);
out geom;`;

async function fetchOverpass() {
  let lastError;
  for (const endpoint of overpassEndpoints) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`Overpass ${endpoint} (attempt ${attempt})...`);
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'User-Agent': 'simulicity-ia/0.1 (real-city import; local demo)',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(150000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        lastError = error;
        console.warn(`  failed: ${error.message}`);
        await new Promise((resolve) => delay(resolve, attempt * 5000));
      }
    }
  }
  throw lastError ?? new Error('Overpass unavailable');
}

// ---------- Terrarium DEM (PNG tiles) ----------
function decodePng(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50) throw new Error('Not a PNG');
  let offset = 8;
  let meta;
  let palette;
  const idat = [];
  while (offset < bytes.length) {
    const length =
      (bytes[offset] * 2 ** 24 +
        bytes[offset + 1] * 2 ** 16 +
        bytes[offset + 2] * 2 ** 8 +
        bytes[offset + 3]) >>>
      0;
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    const data = bytes.slice(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      const view = new DataView(data.buffer, data.byteOffset);
      meta = {
        width: view.getUint32(0),
        height: view.getUint32(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'PLTE') palette = data;
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  if (!meta || meta.bitDepth !== 8 || meta.interlace !== 0)
    throw new Error(`Unsupported PNG ${JSON.stringify(meta)}`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[meta.colorType];
  if (!channels)
    throw new Error(`Unsupported PNG color type ${meta.colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = meta.width * channels;
  const pixels = new Uint8Array(meta.height * stride);
  let source = 0;
  for (let y = 0; y < meta.height; y++) {
    const filter = raw[source++];
    const rowStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[source++];
      const left = x >= channels ? pixels[rowStart + x - channels] : 0;
      const up = y > 0 ? pixels[rowStart - stride + x] : 0;
      const upLeft =
        y > 0 && x >= channels ? pixels[rowStart - stride + x - channels] : 0;
      let delta = 0;
      if (filter === 1) delta = left;
      else if (filter === 2) delta = up;
      else if (filter === 3) delta = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        delta = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      } else if (filter !== 0)
        throw new Error(`Unsupported PNG filter ${filter}`);
      pixels[rowStart + x] = (value + delta) & 0xff;
    }
  }
  return {
    width: meta.width,
    height: meta.height,
    rgb(x, y) {
      const index = (y * meta.width + x) * channels;
      if (meta.colorType === 3) {
        const p = pixels[index] * 3;
        return [palette[p], palette[p + 1], palette[p + 2]];
      }
      if (meta.colorType === 0) {
        const gray = pixels[index];
        return [gray, gray, gray];
      }
      return [pixels[index], pixels[index + 1], pixels[index + 2]];
    },
  };
}

const zoom = 15;
const tileScale = 256 * 2 ** zoom;
const tiles = new Map();
async function terrariumPixel(globalX, globalY) {
  const tileX = Math.floor(globalX / 256);
  const tileY = Math.floor(globalY / 256);
  const key = `${tileX},${tileY}`;
  if (!tiles.has(key)) {
    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${tileX}/${tileY}.png`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'simulicity-ia/0.1 (real-city import)' },
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok)
      throw new Error(`Terrarium tile ${key}: HTTP ${response.status}`);
    tiles.set(key, decodePng(await response.arrayBuffer()));
    console.log(`Terrarium tile ${key} loaded`);
  }
  const image = tiles.get(key);
  const [r, g, b] = image.rgb(globalX - tileX * 256, globalY - tileY * 256);
  return r * 256 + g + b / 256 - 32768;
}

function elevationAt(lat, lon) {
  const px = ((lon + 180) / 360) * tileScale;
  const py =
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180),
      ) /
        Math.PI) /
      2) *
    tileScale;
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const fx = px - x0;
  const fy = py - y0;
  return Promise.all([
    terrariumPixel(x0, y0),
    terrariumPixel(x0 + 1, y0),
    terrariumPixel(x0, y0 + 1),
    terrariumPixel(x0 + 1, y0 + 1),
  ]).then(
    ([a, b, c, d]) =>
      a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy,
  );
}

// ---------- Run ----------
const osm = await fetchOverpass();
const TAG_WHITELIST = [
  'highway',
  'building',
  'building:levels',
  'height',
  'leisure',
  'landuse',
  'amenity',
];
const roundPoint = (point) => ({
  lat: Math.round(point.lat * 1e7) / 1e7,
  lon: Math.round(point.lon * 1e7) / 1e7,
});
const pickTags = (tags) =>
  Object.fromEntries(
    Object.entries(tags ?? {}).filter(([key]) => TAG_WHITELIST.includes(key)),
  );
const elements = (osm.elements ?? []).flatMap((element) => {
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
            geometry: member.geometry.map(roundPoint),
          })),
      },
    ];
  return [];
});
if (!elements.length || !elements.some((element) => element.tags.highway))
  throw new Error('Overpass returned no usable ways (tags missing?).');
console.log(`OSM ways kept: ${elements.length}`);

const elevationsInMeters = [];
for (const y of ys) {
  const row = [];
  for (const x of xs) {
    const lat = south + y / metersPerDegreeLat;
    const lon = west + x / metersPerDegreeLon;
    row.push(Math.round((await elevationAt(lat, lon)) * 10) / 10);
  }
  elevationsInMeters.push(row);
}
const flat = elevationsInMeters.flat();
console.log(
  `DEM ${xs.length}x${ys.length} grid, elevation ${Math.min(...flat)}..${Math.max(...flat)} m, ${tiles.size} tiles`,
);

const source = {
  name,
  bbox: { south, west, north, east },
  ...(osm.osm3s?.timestamp_osm_base
    ? { osmTimestamp: osm.osm3s.timestamp_osm_base }
    : {}),
  elements,
  dem: {
    source: 'terrarium-tiles-z15',
    xCoordinates: xs.map((v) => Math.round(v * 10) / 10),
    yCoordinates: ys.map((v) => Math.round(v * 10) / 10),
    elevationsInMeters,
  },
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(source)}\n`);
console.log(
  `Wrote ${out}: ${width.toFixed(0)} x ${height.toFixed(0)} m, ${elements.length} ways.`,
);
console.log(
  'Attribution: © OpenStreetMap contributors (ODbL); Terrarium DEM tiles.',
);
