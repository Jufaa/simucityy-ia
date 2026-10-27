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
