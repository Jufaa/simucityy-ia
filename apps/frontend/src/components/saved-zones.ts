import type { RealCitySource } from './real-city-model';

/**
 * Local persistence for imported zones. Zones live in the browser's
 * IndexedDB (never uploaded anywhere): re-opening a saved zone reconverts
 * its stored source locally, so no new Overpass/Nominatim calls are made.
 * When IndexedDB is unavailable (SSR, tests, locked-down browsers) an
 * in-memory store with the same behaviour is used instead.
 */
export interface SavedZone {
  id: string;
  name: string;
  kind: 'osm' | 'plan';
  savedAt: number;
  buildingCount: number;
  roadCount: number;
  infillSyntheticHouses: boolean;
  source: RealCitySource;
}

export type SavedZoneSummary = Omit<SavedZone, 'source'>;

export const MAX_SAVED_ZONES = 8;

const DB_NAME = 'simulicity-zones';
const STORE_NAME = 'zones';

const memoryStore = new Map<string, SavedZone>();

function summarize(zone: SavedZone): SavedZoneSummary {
  return {
    id: zone.id,
    name: zone.name,
    kind: zone.kind,
    savedAt: zone.savedAt,
    buildingCount: zone.buildingCount,
    roadCount: zone.roadCount,
    infillSyntheticHouses: zone.infillSyntheticHouses,
  };
}

function prune(zones: SavedZone[]): SavedZone[] {
  return [...zones]
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_SAVED_ZONES);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbAll(): Promise<SavedZone[]> {
  const db = await openDb();
  try {
    return await idbRequest(
      db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll(),
    );
  } finally {
    db.close();
  }
}

async function idbPut(zone: SavedZone): Promise<void> {
  const db = await openDb();
  try {
    await idbRequest(
      db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(zone),
    );
  } finally {
    db.close();
  }
}

async function idbDelete(id: string): Promise<void> {
  const db = await openDb();
  try {
    await idbRequest(
      db
        .transaction(STORE_NAME, 'readwrite')
        .objectStore(STORE_NAME)
        .delete(id),
    );
  } finally {
    db.close();
  }
}

const hasIndexedDb = () => typeof indexedDB !== 'undefined';

// Monotonic timestamps: several saves can land in the same millisecond and
// "newest first" must still reflect save order.
let lastTimestamp = 0;
function nextTimestamp(): number {
  lastTimestamp = Math.max(Date.now(), lastTimestamp + 1);
  return lastTimestamp;
}

export async function listSavedZones(): Promise<SavedZoneSummary[]> {
  const zones = hasIndexedDb() ? await idbAll() : [...memoryStore.values()];
  return prune(zones).map(summarize);
}

export async function saveSavedZone(
  input: Omit<SavedZone, 'id' | 'savedAt'>,
): Promise<SavedZoneSummary> {
  const zone: SavedZone = {
    ...input,
    id: `zone-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
    savedAt: nextTimestamp(),
    source: structuredClone(input.source),
  };
  if (hasIndexedDb()) {
    await idbPut(zone);
    const all = await idbAll();
    const keep = new Set(prune(all).map((item) => item.id));
    for (const item of all) if (!keep.has(item.id)) await idbDelete(item.id);
  } else {
    memoryStore.set(zone.id, zone);
    const keep = new Set(prune([...memoryStore.values()]).map((z) => z.id));
    for (const id of [...memoryStore.keys()])
      if (!keep.has(id)) memoryStore.delete(id);
  }
  return summarize(zone);
}

export async function getSavedZone(id: string): Promise<SavedZone | null> {
  if (!hasIndexedDb()) return memoryStore.get(id) ?? null;
  const db = await openDb();
  try {
    const zone = await idbRequest(
      db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id),
    );
    return zone ?? null;
  } finally {
    db.close();
  }
}

export async function deleteSavedZone(id: string): Promise<void> {
  if (!hasIndexedDb()) {
    memoryStore.delete(id);
    return;
  }
  await idbDelete(id);
}

/** Test hook: clears the in-memory fallback store. */
export function clearMemoryZones(): void {
  memoryStore.clear();
}
