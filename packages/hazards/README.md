# `@simulicity/hazards` — Motor Celular de Inundación

Módulo puro en TypeScript que simula acumulación pluvial, escorrentía superficial en grilla 2D y exposición de infraestructura urbana (vías y edificios) para `simulation-core`.

## Supuestos del Modelo

1. **Discretización en Grilla (Autómata Celular 2D):** El terreno se representa mediante una matriz regular `width × height` compatible con el relieve de `simulation-core`.
2. **Actualización Simultánea (Doble Buffer):** En cada tick se aplica lluvia uniforme (`rainRatePerTick`), pérdida por absorción/drenaje (`drainRatePerTick`) y transferencia hacia los 4 vecinos ortogonales proporcional al desnivel de la superficie libre ($H = z + w$).
3. **Conservación de Masa:** El flujo saliente total de una celda está acotado tanto por el volumen disponible en la celda como por el punto de equilibrio hidrostático local, garantizando $w \ge 0$ y balance de masa cerrado.
4. **Umbrales de Impacto:**
   - Una celda de tipo `road` pasa a estado inundado cuando `waterDepth >= roadFloodedThreshold`.
   - Una celda de tipo `building` pasa a estado expuesto cuando `waterDepth >= buildingExposedThreshold`.

## Limitaciones Importantes

- **Modelo demostrativo, NO hidrodinámico real:** Este motor utiliza relajación celular discreta y **no resuelve las ecuaciones de aguas someras (Shallow-Water Equations / Saint-Venant)** ni conserva cantidad de movimiento (inercia/velocidad del fluido).
- **Sin predicción meteorológica ni hidrológica real:** Los parámetros por defecto son sintéticos con fines de visualización y toma de decisiones en el entorno de simulación.
- **Sin daño estructural físico:** La exposición de edificios indica superación de cota de agua, sin modelar presiones hidrostáticas ni colapso estructural.

## Entorno opcional: obstáculos y drenaje local

`createFloodEnvironment(scenario, options)` transforma edificios, áreas permeables
y sumideros en índices y tasas por celda. Pasá su resultado como cuarto argumento:

```typescript
const environment = createFloodEnvironment(scenario, {
  obstacles: true,
  permeableAreas: parks,
  infiltrationRateMmPerHour: 15,
  drains: [
    {
      id: 'drain-1',
      position: { x: 25, y: 25 },
      capacityInCubicMetersPerSecond: 0.15,
    },
  ],
});
const engine = new FloodEngine(scenario, config, [], environment);
```

- **Edificios:** se bloquea una celda si su centro cae dentro de una huella. No
  recibe lluvia, drenaje ni transferencias; un pulso inicial positivo allí se
  rechaza. La lluvia sobre techos queda fuera del volumen modelado: no se simula
  su escorrentía. La exposición se calcula en celdas abiertas contiguas, no en el
  interior seco. El criterio por centro evita bloquear todos los corredores
  viales por una simple intersección en una grilla gruesa.
- **Áreas permeables:** la infiltración adicional se pondera por la superficie
  de intersección; las contribuciones superpuestas se suman con cobertura total
  limitada al área de la celda. La tasa se suma al drenaje uniforme configurado.
- **Sumideros:** su capacidad en m³/s se convierte a mm/h usando el área real de
  la celda. Una posición sobre un borde interno pertenece a la celda siguiente;
  el borde máximo pertenece a la última. Se ignoran dentro de celdas bloqueadas.
  La extracción efectiva siempre se limita al agua disponible y se incluye en
  el balance de volumen, sin reservas negativas.
- **Compatibilidad:** omitir el cuarto argumento conserva los resultados y la
  forma del snapshot anterior. Los datos del escenario y del entorno no cambian;
  los índices y tasas se copian al construir el motor. Se rechazan índices fuera
  de rango, tasas negativas/no finitas y coordenadas inválidas.

Estos obstáculos y capacidades son aproximaciones de demostración en celdas
gruesas: no representan tuberías, reflujo, capacidad de una red real ni garantías
de seguridad. No usar como orientación para emergencias.

## Puentes y agua permanente: exposición opcional

El cuarto argumento también acepta cotas absolutas, en metros, para evaluar
calles elevadas y agua permanente sin modificar el escenario:

```typescript
const engine = new FloodEngine(scenario, config, [], {
  roadDeckElevationsInMeters: { 'bridge-edge': 3 },
  permanentWaterSurfaceElevationsInMeters: { 42: 1.5 },
});
```

- `roadDeckElevationsInMeters` usa IDs de tramos existentes. Para cada celda
  muestreada, la profundidad sobre el tablero es
  `max(0, max(terreno efectivo + profundidad dinámica, superficie permanente) - tablero)`.
  El terreno efectivo incluye el relieve sintético configurado. El agua bajo el
  tablero no bloquea el puente; el desbordamiento sí lo bloquea al alcanzar el
  umbral vial existente. Máximo y media usan estas mismas profundidades.
- `permanentWaterSurfaceElevationsInMeters` usa índices de celdas
  `row * columns + column`. Una entrada identifica una celda con agua permanente;
  sin entrada no hay superficie permanente. Las calles sin tablero usan su cota
  de terreno efectivo como referencia. Sin ninguna cota aplicable se conserva
  exactamente la profundidad vial anterior.
- Las cotas se copian al construir el motor. Se aceptan cero y valores negativos;
  se rechazan cotas no finitas, IDs desconocidos e índices no enteros o fuera de
  rango.

El agua permanente afecta **solo la exposición vial**: no agrega agua al solver,
no altera lluvia, drenaje, balance de volumen ni exposición de edificios. No
representa un lago/río acoplado hidrodinámicamente ni eleva el lecho del cauce.
