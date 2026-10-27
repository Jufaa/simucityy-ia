import type { CityScenarioInput, FloodConfig } from './types.js';

export const DEFAULT_FLOOD_CONFIG: FloodConfig = {
  timeStepInSeconds: 60, // 1 minuto por tick
  rainIntensityMmPerHour: 120, // Tormenta severa: 120 mm/h = 0.002 m por minuto
  drainRateMmPerHour: 15, // Drenaje pluvial básico: 15 mm/h
  flowTransferRatio: 0.5,
  roadFloodedThresholdInMeters: 0.15, // 15 cm bloquea el paso vehicular/peatonal seguro
  buildingExposedThresholdInMeters: 0.2, // 20 cm expone planta baja de edificio
  syntheticRelief: 'central-basin',
  syntheticReliefAmplitudeInMeters: 1.5,
};

/**
 * Genera un CityScenarioInput de prueba con la misma estructura que scenarios/demo-city.json
 * (por defecto 21x21 muestras -> 20x20 celdas en un distrito de 500x500m).
 */
export function createDemoCompatibleScenario(
  widthInMeters = 500,
  heightInMeters = 500,
  cellSizeInMeters = 25,
): CityScenarioInput {
  const xCoordinates: number[] = [];
  for (let x = 0; x <= widthInMeters; x += cellSizeInMeters) {
    xCoordinates.push(x);
  }
  if (xCoordinates[xCoordinates.length - 1] !== widthInMeters) {
    xCoordinates.push(widthInMeters);
  }

  const yCoordinates: number[] = [];
  for (let y = 0; y <= heightInMeters; y += cellSizeInMeters) {
    yCoordinates.push(y);
  }
  if (yCoordinates[yCoordinates.length - 1] !== heightInMeters) {
    yCoordinates.push(heightInMeters);
  }

  const elevationsInMeters = yCoordinates.map(() =>
    xCoordinates.map(() => 0),
  );

  const centerX = widthInMeters / 2;
  const centerY = heightInMeters / 2;

  return {
    terrain: { kind: 'flat', elevationInMeters: 0 },
    terrainGrid: {
      xCoordinates,
      yCoordinates,
      elevationsInMeters,
      source: 'synthetic',
    },
    roadGraph: {
      nodes: [
        { id: 'node-west', x: 0, y: centerY },
        { id: 'node-center', x: centerX, y: centerY },
        { id: 'node-east', x: widthInMeters, y: centerY },
      ],
      edges: [
        {
          id: 'edge-west-center',
          roadId: 'road-main',
          from: 'node-west',
          to: 'node-center',
          lengthInMeters: centerX,
          bidirectional: true,
        },
        {
          id: 'edge-center-east',
          roadId: 'road-main',
          from: 'node-center',
          to: 'node-east',
          lengthInMeters: widthInMeters - centerX,
          bidirectional: true,
        },
      ],
    },
    buildings: [
      {
        id: 'bldg-center-low',
        minCorner: { x: centerX - 20, y: centerY - 20 },
        maxCorner: { x: centerX + 20, y: centerY + 20 },
        heightInMeters: 18,
      },
      {
        id: 'bldg-corner-high',
        minCorner: { x: 10, y: 10 },
        maxCorner: { x: 40, y: 40 },
        heightInMeters: 12,
      },
    ],
  };
}