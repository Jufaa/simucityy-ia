export interface SavedScenario {
  id: string;
  name: string;
  hazard: string;
  zoneLabel: string;
  durationInMinutes: number;
  rainIntensityMmPerHour: number | null;
  drains: readonly { x: number; y: number }[];
  createdAt: string;
  resultLine: string;
}

const KEY = 'simulicity-saved-scenarios-v1';

/** Parses stored scenarios, ignoring malformed entries instead of throwing. */
export function parseSavedScenarios(raw: string | null): SavedScenario[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedScenario =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as SavedScenario).id === 'string' &&
        typeof (item as SavedScenario).name === 'string',
    );
  } catch {
    return [];
  }
}

export function loadSavedScenarios(): SavedScenario[] {
  try {
    return parseSavedScenarios(localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

export function saveScenario(scenario: SavedScenario): SavedScenario[] {
  const next = [
    scenario,
    ...loadSavedScenarios().filter((s) => s.id !== scenario.id),
  ].slice(0, 12);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full/blocked: the in-memory list still reflects the save.
  }
  return next;
}

export function deleteSavedScenario(id: string): SavedScenario[] {
  const next = loadSavedScenarios().filter((s) => s.id !== id);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // See saveScenario.
  }
  return next;
}
