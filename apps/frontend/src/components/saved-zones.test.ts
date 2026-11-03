import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearMemoryZones,
  deleteSavedZone,
  getSavedZone,
  listSavedZones,
  saveSavedZone,
  MAX_SAVED_ZONES,
  type SavedZone,
} from './saved-zones';
import type { RealCitySource } from './real-city-model';

const source = (name: string): RealCitySource => ({
  name,
  bbox: { south: 41.39, west: 2.16, north: 41.4, east: 2.17 },
  elements: [],
  dem: {
    source: 'test',
    xCoordinates: [0, 100],
    yCoordinates: [0, 100],
    elevationsInMeters: [
      [10, 10],
      [10, 10],
    ],
  },
});

const input = (name: string): Omit<SavedZone, 'id' | 'savedAt'> => ({
  name,
  kind: 'plan',
  buildingCount: 120,
  roadCount: 40,
  infillSyntheticHouses: false,
  source: source(name),
});

describe('saved zones (in-memory fallback without IndexedDB)', () => {
  beforeEach(() => clearMemoryZones());

  it('saves, lists newest first without sources, loads and deletes', async () => {
    const first = await saveSavedZone(input('Primera'));
    const second = await saveSavedZone(input('Segunda'));
    const list = await listSavedZones();
    expect(list.map((zone) => zone.name)).toEqual(['Segunda', 'Primera']);
    expect(list[0]).not.toHaveProperty('source');
    expect(list[0]!.buildingCount).toBe(120);
    const loaded = await getSavedZone(first.id);
    expect(loaded?.source.name).toBe('Primera');
    await deleteSavedZone(second.id);
    expect((await listSavedZones()).map((zone) => zone.name)).toEqual([
      'Primera',
    ]);
    expect(await getSavedZone(second.id)).toBeNull();
  });

  it('keeps at most the newest zones and stores an immutable copy', async () => {
    const original = input('Mutable');
    const saved = await saveSavedZone(original);
    original.source.name = 'Cambiada';
    expect((await getSavedZone(saved.id))?.source.name).toBe('Mutable');
    for (let i = 0; i < MAX_SAVED_ZONES + 3; i++)
      await saveSavedZone(input(`Zona ${i}`));
    const list = await listSavedZones();
    expect(list).toHaveLength(MAX_SAVED_ZONES);
    expect(list[0]!.name).toBe(`Zona ${MAX_SAVED_ZONES + 2}`);
  });
});
