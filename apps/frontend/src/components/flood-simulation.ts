import {
  createHazardPulses,
  FloodEngine,
  hazardPreset,
  type FloodEnvironment,
  type CityScenarioInput,
  type HazardKind,
} from '@simulicity/hazards';

/** A synchronous controller: one real second represents five simulated minutes. */
export class FloodSimulation {
  private engine: FloodEngine;
  private accumulatedSeconds = 0;
  running = false;
  started = false;
  snapshot;
  readonly hazard: HazardKind;

  constructor(
    private readonly city: CityScenarioInput,
    private readonly environment: FloodEnvironment = {},
    hazard: HazardKind = 'rain',
  ) {
    this.hazard = hazard;
    this.engine = this.createEngine();
    this.snapshot = this.engine.getSnapshot();
  }

  private createEngine() {
    const preset = hazardPreset(this.hazard);
    const pulses = createHazardPulses(
      this.city,
      this.hazard,
      this.environment.blockedCellIndices ?? [],
    );
    // El pulso inicial no basta: el río sigue aportando caudal durante su
    // hidrográfica y el tsunami llega en un tren de olas por el borde oeste.
    const columns = Math.max(1, this.city.terrainGrid.xCoordinates.length - 1);
    const sustainedInflow =
      this.environment.sustainedInflow ??
      (this.hazard === 'river-overflow' && pulses.length
        ? {
            // Hidrográfica larga: el cauce sigue subiendo durante horas y
            // el agua termina acumulándose sobre los barrios bajos.
            cellIndices: pulses.map((p) => p.row * columns + p.column),
            rateInMetersPerSecond: 0.0002,
            durationInSeconds: 21600,
          }
        : this.hazard === 'tsunami' && pulses.length
          ? {
              // Tren de olas sostenido: sin aporte continuo el frente se
              // diluye por debajo del umbral visible y se atasca en la
              // primera fila de edificios.
              cellIndices: pulses
                .filter((p) => p.column <= 1)
                .map((p) => p.row * columns + p.column),
              rateInMetersPerSecond: 0.0016,
              durationInSeconds: 5400,
            }
          : undefined);
    return new FloodEngine(
      this.city,
      {
        syntheticRelief: 'none',
        rainIntensityMmPerHour: preset.rainIntensityMmPerHour,
        drainRateMmPerHour: preset.drainRateMmPerHour,
        flowTransferRatio: preset.flowTransferRatio,
      },
      pulses,
      sustainedInflow
        ? { ...this.environment, sustainedInflow }
        : this.environment,
    );
  }

  get cells() {
    return this.engine.getCells();
  }

  start() {
    this.started = true;
    this.running = true;
  }

  pause() {
    this.running = false;
  }

  reset() {
    this.pause();
    this.started = false;
    this.accumulatedSeconds = 0;
    this.engine = this.createEngine();
    this.snapshot = this.engine.getSnapshot();
  }

  advance(realSeconds: number): boolean {
    if (!this.running || !Number.isFinite(realSeconds) || realSeconds <= 0)
      return false;
    this.accumulatedSeconds += realSeconds;
    let changed = false;
    while (this.accumulatedSeconds >= 0.2 - 1e-9) {
      this.snapshot = this.engine.step();
      this.accumulatedSeconds = Math.max(0, this.accumulatedSeconds - 0.2);
      changed = true;
    }
    return changed;
  }
}
