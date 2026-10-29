import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { CityResponse } from './city-types';
import { buildingBaseHeight } from './terrain-view';
import {
  createCivicLandmarkLayer,
  generateCivicLandmarks,
} from './civic-landmarks';

function city(): CityResponse {
  return {
    config: {
      widthInMeters: 150,
      heightInMeters: 100,
      streetSpacingInMeters: 30,
    },
    terrain: { kind: 'flat', elevationInMeters: 2 },
    roads: [],
    blocks: [],
    buildings: Array.from({ length: 12 }, (_, i) => ({
      id: `building-${i}`,
      minCorner: { x: 5 + (i % 6) * 24, y: 5 + Math.floor(i / 6) * 40 },
      maxCorner: { x: 17 + (i % 6) * 24, y: 19 + Math.floor(i / 6) * 40 },
      heightInMeters: 8,
      use: 'commercial',
      architecture: {
        style: 'shop',
        floors: 2,
        roof: 'flat',
        roofRiseInMeters: 0.4,
        facade: 'sand',
        entranceSide: 'north',
        balconyDepthInMeters: 0,
      },
    })),
  };
}

describe('civic landmarks', () => {
  it('assigns six unique identities deterministically without mutating the source', () => {
    const source = city();
    const before = structuredClone(source);
    const model = generateCivicLandmarks(source);
    expect(model.assignments.map((item) => item.role)).toEqual([
      'hospital',
      'school',
      'police',
      'firestation',
      'municipal',
      'market',
    ]);
    expect(new Set(model.assignments.map((item) => item.buildingId)).size).toBe(
      6,
    );
    expect(
      generateCivicLandmarks({
        ...source,
        buildings: [...source.buildings].reverse(),
      }),
    ).toEqual(model);
    expect(source).toEqual(before);
  });

  it.each([false, true])(
    'keeps every rooftop prop within the original roof and city, relief=%s',
    (relief) => {
      const source = city();
      if (relief)
        source.terrainGrid = {
          source: 'synthetic',
          xCoordinates: [0, 150],
          yCoordinates: [0, 100],
          elevationsInMeters: [
            [1, 4],
            [3, 6],
          ],
        };
      const layer = createCivicLandmarkLayer(
        source,
        generateCivicLandmarks(source),
      );
      layer.group.updateMatrixWorld(true);
      for (const root of layer.group.children) {
        const building = source.buildings.find(
          (item) => item.id === root.userData.buildingId,
        )!;
        const bounds = new THREE.Box3().setFromObject(root);
        const roof =
          buildingBaseHeight(source, building) +
          building.heightInMeters -
          (building.architecture?.roofRiseInMeters ?? 0);
        expect(bounds.min.x).toBeGreaterThanOrEqual(building.minCorner.x);
        expect(bounds.max.x).toBeLessThanOrEqual(building.maxCorner.x);
        expect(bounds.min.z).toBeGreaterThanOrEqual(building.minCorner.y);
        expect(bounds.max.z).toBeLessThanOrEqual(building.maxCorner.y);
        expect(bounds.min.y).toBeCloseTo(roof, 5);
      }
      layer.dispose();
    },
  );

  it('handles sparse, legacy, small, gabled and out-of-bounds buildings honestly', () => {
    const source = city();
    expect(
      generateCivicLandmarks({ ...source, buildings: [] }).assignments,
    ).toEqual([]);
    source.buildings = source.buildings.slice(0, 1);
    delete source.buildings[0]!.architecture;
    expect(generateCivicLandmarks(source).assignments).toHaveLength(1);
    source.buildings[0]!.architecture = {
      ...city().buildings[0]!.architecture!,
      roof: 'gable',
    };
    expect(generateCivicLandmarks(source).assignments).toHaveLength(0);
    delete source.buildings[0]!.architecture;
    source.buildings[0]!.maxCorner.x = 6;
    expect(generateCivicLandmarks(source).assignments).toHaveLength(0);
    source.buildings[0]!.minCorner.x = -5;
    expect(generateCivicLandmarks(source).assignments).toHaveLength(0);
  });

  it('renders silhouettes without a DOM and disposes shared resources exactly once', () => {
    const source = city();
    const layer = createCivicLandmarkLayer(
      source,
      generateCivicLandmarks(source),
    );
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    layer.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material])
        materials.add(material);
    });
    expect(
      layer.group.getObjectByName('hospital:cross-horizontal'),
    ).toBeDefined();
    expect(geometries.size).toBeLessThan(5);
    const spies = [...geometries, ...materials].map((resource) =>
      vi.spyOn(resource, 'dispose'),
    );
    layer.dispose();
    layer.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(layer.group.children).toHaveLength(0);
  });
  it('owns and disposes optional label textures without depending on a browser renderer', () => {
    const context = { fillRect: vi.fn(), fillText: vi.fn() };
    vi.stubGlobal('document', {
      createElement: () => ({ getContext: () => context }),
    });
    try {
      const source = city();
      const layer = createCivicLandmarkLayer(
        source,
        generateCivicLandmarks(source),
      );
      const textures = new Set<THREE.Texture>();
      layer.group.traverse((object) => {
        if (
          object instanceof THREE.Mesh &&
          object.material instanceof THREE.MeshStandardMaterial &&
          object.material.map
        )
          textures.add(object.material.map);
      });
      expect(textures.size).toBe(6);
      const spies = [...textures].map((texture) =>
        vi.spyOn(texture, 'dispose'),
      );
      layer.dispose();
      layer.dispose();
      for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
