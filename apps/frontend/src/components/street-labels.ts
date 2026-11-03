import * as THREE from 'three';
import type { CityResponse, Road } from './city-types';
import { sampleTerrainHeight } from './terrain-view';

export interface StreetLabelPlacement {
  name: string;
  x: number;
  y: number;
  segmentLengthInMeters: number;
}

const MAX_STREET_LABELS = 24;
const MIN_SEGMENT_IN_METERS = 50;

/**
 * One label per distinct street name, placed on its longest segment.
 * Names only exist on fresh real imports; the preloaded district source
 * carries none, so it yields no labels.
 */
export function streetLabelPlacements(
  roads: readonly Road[],
): StreetLabelPlacement[] {
  const longestByName = new Map<string, StreetLabelPlacement>();
  for (const road of roads) {
    const name = road.name?.trim();
    if (!name) continue;
    const length = Math.hypot(
      road.end.x - road.start.x,
      road.end.y - road.start.y,
    );
    if (length < MIN_SEGMENT_IN_METERS) continue;
    const current = longestByName.get(name);
    if (current && current.segmentLengthInMeters >= length) continue;
    longestByName.set(name, {
      name,
      x: (road.start.x + road.end.x) / 2,
      y: (road.start.y + road.end.y) / 2,
      segmentLengthInMeters: length,
    });
  }
  return [...longestByName.values()]
    .sort((a, b) => b.segmentLengthInMeters - a.segmentLengthInMeters)
    .slice(0, MAX_STREET_LABELS);
}

/** Floating map-style street name sprites for real imported districts. */
export function createStreetLabelLayer(city: CityResponse) {
  const group = new THREE.Group();
  group.name = 'street-labels';
  const textures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];
  if (typeof document !== 'undefined') {
    for (const placement of streetLabelPlacements(city.roads)) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 80;
      const context = canvas.getContext('2d');
      if (!context) continue;
      context.fillStyle = 'rgba(255,255,255,0.88)';
      context.beginPath();
      context.roundRect(6, 10, 500, 60, 30);
      context.fill();
      context.fillStyle = '#20353a';
      context.font = 'bold 40px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(placement.name, 256, 42, 470);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      textures.push(texture);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      });
      materials.push(material);
      const sprite = new THREE.Sprite(material);
      const widthInMeters = Math.min(
        64,
        Math.max(20, placement.name.length * 3.4),
      );
      sprite.scale.set(widthInMeters, widthInMeters * (80 / 512), 1);
      sprite.position.set(
        placement.x,
        sampleTerrainHeight(city, placement.x, placement.y) + 16,
        placement.y,
      );
      sprite.name = `road-label-${placement.name}`;
      group.add(sprite);
    }
  }
  return {
    group,
    dispose() {
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
}
