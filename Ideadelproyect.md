UrbanForge — Guía maestra de desarrollo
Hackathon Meta Global AI Developer 2026 · 26 de octubre de 2026

1. Idea y visión
UrbanForge es una plataforma web para importar una zona real de una ciudad, simular catástrofes y estudiar su impacto sobre edificios, carreteras, habitantes sintéticos y servicios, con un agente de IA que propone intervenciones y ejecuta comparaciones. Ejemplo: un barrio de Miami, una inundación, calles bloqueadas, evacuación hacia refugios y comparación de estrategias. Una simulación experimental no es una predicción científica ni una herramienta certificada de gestión de emergencias.

Flujo del usuario: elegir ciudad y área → importar datos → validar la calidad de los datos → configurar desastre y población → ejecutar simulación → explorar cronología/impactos → pedir recomendaciones a IA → ejecutar variantes con la misma semilla → comparar métricas.

2. Alcance del hackathon (MVP)
Entregar una única zona real de ~500 × 500 m, idealmente en Miami si hay datos topográficos adecuados. Precargar el escenario para evitar fallas de APIs externas durante la demo. Una catástrofe completa: inundación. Visualizar edificios y vías reales, relieve disponible, entre 100 y 300 ciudadanos sintéticos, al menos dos refugios, reglas de evacuación, calles intransitables, métricas y un agente Meta que pruebe 2 o 3 intervenciones. Poder reproducir resultados con una semilla fija.

Fuera del MVP: simulación completa de ciudades, múltiples fenómenos físicos de alta fidelidad, daño estructural preciso, pronóstico meteorológico real, población geolocalizada real, gemelo digital certificado, entrenamiento de IA desde cero, multitudes físicamente realistas y modelo detallado de tráfico.

3. Tecnologías recomendadas
Capa	MVP	Motivo
Web	Next.js, React, TypeScript	Equipo trabaja con stack único
Estilos/UI	Tailwind CSS, Zustand, Recharts	Controles, estado y métricas
Mapa	MapLibre GL JS	Cartografía, polígonos, edificios extruidos, capas
Efectos visuales	MapLibre + Three.js solo si hace falta	Reducir complejidad
Datos	GeoJSON normalizado + JSON versionado	Demo reproducible sin DB obligatoria
Simulación	TypeScript puro + Web Worker	Separar cálculos de render
IA	Meta Model API, modelo Muse Spark elegible	Agente con herramientas controladas
Servidor	Next.js Route Handlers	Proteger API keys y preparar escenarios
Testing	Vitest, Playwright	Pruebas deterministas e interacción
Deploy	Vercel u host equivalente	URL accesible a jueces
Futuro	PostgreSQL/PostGIS, Python para preparación geográfica, motores numéricos	Escalabilidad y análisis espacial
No comenzar con Rust/WASM, Unity, microservicios, Kafka, ni modelos propios entrenados; no son necesarios para validar el MVP.

4. Fuentes geográficas y APIs
Calles, edificios y POI
OpenStreetMap: geometría de calles, edificios, parques, hospitales y puntos de interés; calidad variable por zona. Consultar con Overpass API para prototipos pequeños y respetar límites de uso, atribución y licencia ODbL. Documentación: https://wiki.openstreetmap.org/wiki/Overpass_API
Overpass Turbo: experimentar consultas y exportar GeoJSON: https://overpass-turbo.eu/
MapLibre GL JS: render del mapa: https://maplibre.org/maplibre-gl-js/docs/
OSMnx: opción Python para preparar y simplificar grafos viales fuera de la aplicación: https://osmnx.readthedocs.io/
Altitud/topografía
USGS 3DEP / The National Map, apropiado para EE. UU.: https://www.usgs.gov/3d-elevation-program y https://apps.nationalmap.gov/downloader/
Se necesita un modelo digital del terreno (DTM/DEM), no solo alturas de edificios. Verificar cobertura, resolución, datum vertical, valores nulos y unidades. No confundir DEM con profundidad del agua.
Para inundación costera también se necesitan hipótesis de condiciones de borde, por ejemplo nivel del mar. Sin ellas, no prometer simulación fiel de marejadas.
Validación y población
FEMA National Flood Hazard Layer para contrastar exposición cartográfica, no para inferir automáticamente la evolución temporal del agua: https://www.fema.gov/flood-maps/national-flood-hazard-layer
US Census / ACS para población agregada si hace falta; no contiene trayectorias individuales: https://www.census.gov/data/developers/data-sets.html
NOAA para información meteorológica y costera de referencia (no imprescindible en MVP): https://www.noaa.gov/
Regla de calidad de datos: persistir fuente, fecha de descarga, licencia, resolución, unidades, cobertura y si el atributo es medido, inferido o sintético. Evitar depender de consultas Overpass en directo durante la demostración. No inventar alturas como si fueran oficiales: marcar aproximaciones.

5. Ingesta: de una ciudad real a un mundo simulable
Definir bbox pequeño; descargar datos OSM y DEM; registrar atribuciones.
Transformar coordenadas WGS84 a un sistema métrico local adecuado (UTM o proyección local); no aplicar distancias en metros directamente sobre lat/lon.
Limpiar polígonos de edificios y líneas de calles, deduplicar nodos, resolver intersecciones.
Convertir calles a grafo de nodos y aristas, con longitud, capacidad aproximada, accesibilidad, estado y elevación.
Reamostrar terreno en cuadrícula de celdas, por ejemplo 5–10 m según resolución real de datos.
Asociar edificios a celdas y puntos de acceso al grafo.
Crear refugios y poblar agentes sintéticos mediante una semilla aleatoria.
Generar paquete versionado /scenarios/miami-demo/{metadata,terrain,roads,buildings,agents}.json.
Si la cartografía o el relieve de Miami elegido presenta vacíos, elegir otro barrio/ciudad con mejor cobertura antes que fabricar datos silenciosamente.

6. Modelo compartido
type Vec2 = { x: number; y: number }; // coordenadas métricas locales
interface RoadEdge { id: string; from: string; to: string; lengthM: number; capacity: number; status: 'open'|'flooded'|'blocked' }
interface Building { id: string; polygon: Vec2[]; groundElevationM: number; heightM?: number; syntheticHeight: boolean }
interface Shelter { id: string; nodeId: string; capacity: number; occupancy: number; active: boolean }
type CitizenStatus = 'normal'|'alerted'|'preparing'|'evacuating'|'sheltering'|'stranded'|'safe';
interface Citizen { id: string; position: Vec2; homeBuildingId: string; mobilityFactor: number; reactionDelayS: number; status: CitizenStatus; routeNodeIds: string[] }
interface FloodConfig { durationS: number; rainfallMmH: number; initialWaterDepthM: number; timeStepS: number }
interface Scenario { id: string; version: number; seed: number; terrain: number[][]; roads: RoadEdge[]; buildings: Building[]; shelters: Shelter[]; citizens: Citizen[]; flood: FloodConfig }
Todos los módulos usan los mismos tipos y medidas. Nunca permitir que la IA modifique directamente objetos sin validar.

7. Motor de inundación: enfoque honesto
Opción MVP recomendada: modelo de propagación superficial simplificado de celdas con nivel de agua surfaceElevation = terrainElevation + waterDepth, lluvia como aporte, pérdidas opcionales por drenaje e intercambio de agua entre celdas vecinas según diferencias de nivel, limitado por volúmenes disponibles. Mantener profundidad no negativa y verificar conservación aproximada de masa (con entradas y salidas registradas). Establecer paso temporal estable y evitar oscilaciones numéricas. No afirmar que esto resuelve ecuaciones hidrodinámicas completas.

Algoritmo por tick: añadir lluvia → calcular flujos por vecindad utilizando valores del estado anterior → actualizar simultáneamente profundidades → identificar vías con profundidad superior al umbral configurable → calcular exposición de edificios → publicar métricas y fotograma. Una zona baja puede acumular agua; pendiente y conexiones cambian la propagación.

Progresión futura: estudiar ecuaciones de aguas someras (2D shallow water), solvers hidrológicos/hidráulicos como HEC-RAS 2D o LISFLOOD-FP para validación o ejecución offline, con especialistas. Lectura: https://www.hec.usace.army.mil/software/hec-ras/ ; https://www.bristol.ac.uk/geography/research/hydrology/models/lisflood/

Para edificios, MVP debe hablar de exposición por profundidad, no de destrucción estructural calculada. Si se aplican umbrales de daño, señalarlos como heurísticos de demostración.

8. Población: simulación basada en agentes
La ciudad real no entrega posiciones ni decisiones individuales. Generar habitantes sintéticos con hogar, movilidad, demora de reacción, acceso a rutas, destino/refugio y estado. El comportamiento emerge de reglas explicitadas, no de IA llamada por persona.

Secuencia: estado normal → alerta → demora/preparación → búsqueda de refugio disponible → cálculo A* de camino transitable → desplazamiento → nueva ruta ante bloqueo → refugio seguro o condición stranded si no hay camino.

Las velocidades, demoras y diferencias entre personas son parámetros de escenario, no porcentajes que deban presentarse como datos reales sin fuente. Evitar supuestos injustificados sobre “pánico”. Para familias y asistencia especial, incorporar reglas adicionales después de tener movilidad básica.

Referencias: JuPedSim https://www.jupedsim.org/ ; GAMA https://gama-platform.org/ ; SUMO https://sumo.dlr.de/docs/ ; Mesa https://mesa.readthedocs.io/

9. Grafo, evacuación y métricas
Calles: grafo dirigido o no dirigido según reglas de circulación.
Camino al refugio: A*/Dijkstra con coste ajustado por longitud y exposición; nunca cruzar aristas bloqueadas.
Capacidad: refugios con cupos y reservas para evitar sobreasignación.
Tráfico: en MVP simplificar a agentes peatonales o penalizaciones de congestión; evitar fingir un sistema vial calibrado.
Métricas: porcentaje que llegó a zona segura, tiempo medio y percentil 90 de evacuación, número de aislados, edificios expuestos por bandas de profundidad, km de vías inaccesibles, ocupación de refugios y coste supuesto de medidas.
Comparación justa: misma semilla, mismo evento, misma población y mismas condiciones iniciales salvo la intervención.
10. La IA de Meta: qué hace y qué NO hace
No hace falta entrenar un modelo desde cero. Usar un modelo Meta habilitado para hackathon como Muse Spark mediante Meta Model API y tool calling. Su labor será observar métricas, proponer hipótesis, ejecutar herramientas del simulador y comparar resultados. No es un sustituto del cálculo físico.

Herramientas sugeridas (inputs tipados con Zod):

getScenarioSummary(scenarioId)
getSimulationMetrics(runId)
listCriticalLocations(runId)
proposeShelter(nodeId, capacity)
changeAlertDelay(seconds)
closeRoad(edgeId)
runSimulation(scenarioId, intervention, seed)
compareRuns(baselineRunId, candidateRunId)
Flujo agente: leer escenario → consultar baseline → elegir intervención limitada por presupuesto → validar con Zod y reglas → ejecutar simulación → medir efecto → probar alternativa → explicar resultados con números que devuelve el motor, nunca inventados. Establecer máximo de corridas y timeout. Proteger API key exclusivamente del lado servidor.

Por qué es fuerte para el hackathon: el agente toma acciones verificables y mejora o descarta hipótesis según métricas reproducibles. La guía oficial pondera 25 % el uso de herramientas Meta. Considerar Muse Spark Open si resulta viable y cumple las condiciones específicas del evento; corroborar modelo exacto, elegibilidad y cuota en la consola/documentación del hackathon.

11. Arquitectura web y backend
Browser (Next.js + MapLibre + UI)
    ├── Map layers / 3D overlays
    ├── Zustand UI state + charts
    └── Simulation Worker (deterministic TS engine)
           ├── FloodGrid
           ├── RoadGraph + A*
           ├── Citizens FSM
           ├── Metrics
           └── Snapshot/Replay
Next.js Server
    ├── GET /api/scenarios/:id        (paquete preparado)
    ├── POST /api/scenarios/import     (opcional: limitado/caché)
    └── POST /api/ai/plan              (Meta API y orquestación)
Para herramientas IA que necesitan muchas corridas, decidir temprano si el agente coordina simulaciones a través del navegador (cliente ejecuta y devuelve métricas firmadas solo como demo) o si el servidor utiliza el mismo paquete simulation-core en Node y corre simulaciones sin render. Recomendación: motor puro TypeScript compartido, implementaciones en Worker y Node. Esto evita que la IA dependa de una pestaña abierta para ejecutar herramientas.

Versionar todo escenario; usar identificadores de corridas. Límites de tamaño en payloads, rate limiting de IA, restricciones de coordenadas, control de costes y logs de llamadas a herramientas. Si se incorpora importación libre de URLs, evitar SSRF mediante allowlist y descargas controladas. Evitar secretos en cliente.

12. Estructura del repositorio
urbanforge/
├── apps/web/
│   ├── app/{page.tsx,simulator/page.tsx,api/ai/plan/route.ts}
│   ├── components/{MapCanvas,SimulationControls,MetricsPanel,AIPlanner}
│   └── workers/simulation.worker.ts
├── packages/
│   ├── shared/         # tipos + Zod + contratos
│   ├── geo-import/     # normalización y transformaciones
│   ├── simulation-core/# reloj, estado, PRNG, snapshots
│   ├── hazards/        # flood grid
│   ├── agents/         # FSM, reacción y movimiento
│   ├── routing/        # grafo, A*, obstáculos
│   ├── metrics/        # agregados por corrida
│   └── ai-agent/       # herramientas, límites, prompts
├── scenarios/miami-demo/
├── tests/
└── README.md
13. APIs / contratos sugeridos
GET /api/scenarios/miami-demo: metadata, geometría, escala, fecha y fuentes.
POST /api/simulation/run: scenarioId, seed, config, interventions; ejecuta en Node si corresponde, devuelve runId, metrics, snapshots/resumen.
POST /api/ai/plan: objetivo cuantificado, restricciones, baselineRunId; devuelve proposals, referencias a corridas, diferencias de métricas y justificación.
GET /api/simulation/runs/:id: resultado versionado y reproducible.
Para MVP es válido realizar /simulation/run en Worker y no crear endpoint; acordarlo entre integrantes para no duplicar lógica.

14. Diseño de UI y demo
Pantalla central: mapa 3D del barrio con capas de agua, edificios afectados y ciudadanos representados por puntos/instancias. Barra lateral de configuración de desastre, tiempo y refugios; controles Play/Pause/Reset/Velocidad; panel de KPIs; caja de instrucciones al agente y comparación lado a lado baseline/intervención. Selección de un ciudadano muestra estado y ruta; selección de edificio muestra elevación, profundidad de agua y categoría de exposición. Leyenda de colores accesible y unidades explícitas.

Guion de demo (3 minutos): cargar barrio real → activar lluvias → mostrar agua y evacuaciones → señalar calle cerrada y población aislada → pedir al agente reducir aislados sin superar presupuesto → agente ejecuta propuestas → comparar resultado, explicar cambios y mostrar reproducibilidad. Preparar fallback de corridas precalculadas auténticas si la API falla en vivo.

15. Tests / criterios de aceptación
Sin lluvia ni aportes externos, la cantidad de agua no aumenta espontáneamente.
Profundidad de agua nunca negativa; registrar balance de volúmenes.
Calle inundada supera un umbral definido y deja de ser transitable.
Un agente no atraviesa una calle bloqueada.
Refugio lleno no acepta más ciudadanos.
Agente sin camino queda aislado y se contabiliza.
Mismo escenario + mismos parámetros + misma semilla producen las mismas métricas.
Intervención aplicada se puede reproducir e inspeccionar.
Métricas del agente IA coinciden exactamente con el resultado devuelto por el motor.
Escenario importado conserva atribuciones, coordenadas y unidades.
Interfaz mantiene fluidez mientras el Worker calcula.
16. Equipo de cuatro: responsabilidades
Integrante A — Geo/datos: selección del barrio, Overpass/OSM, DEM, proyección, preparación de GeoJSON y grafo; entrega escenario validado.

Integrante B — Catástrofe: cuadrícula, paso temporal, lluvia, propagación, umbrales y tests de conservación.

Integrante C — Población: estado de agentes, A*, refugios, rutas dinámicas, métricas y determinismo.

Integrante D — Web/IA/integración: MapLibre, controles, snapshots, dashboard, servidor Meta API, herramientas, deploy y demo. Todos participan en integración y revisiones. Integrar desde el primer día con tipos y contrato acordados.

17. Cronograma propuesto
26 oct (preparación): definir alcance, zona candidata, arquitectura, contrato de datos, permisos de datasets y tareas. Respetar regla de trabajo nuevo durante la ventana del evento.

27 oct: repo, tipos compartidos, UI/mapa base, importación de geometría y primer endpoint Meta.

28 oct: escenario versionado, malla de relieve, grafo vial y primer motor de inundación.

29 oct: simulación con calles anegadas, edificios expuestos, 100–300 agentes que caminan.

30 oct: evacuaciones completas, refugios, rutas alternativas y métricas; integrar modelo y herramientas.

31 oct – 1 nov: agente realiza corridas comparativas; pulir render, observabilidad y pruebas.

2 nov: estabilizar escenario, tests, experiencia de juez, límites de IA, costes.

3 nov: grabar demo de 3 minutos, README, atribuciones, plan B para APIs.

4 nov: publicar repositorio y demo, entregar antes de las 9:00 PM ET según guía del evento (comprobar conversión local y eventuales actualizaciones).

18. Restricciones del hackathon que afectan diseño
Según la guía del participante proporcionada, el proyecto debe utilizar modelos Meta; equipo máximo 4; repositorio público; trabajo nuevo construido durante el evento claramente identificado; video demo de tres minutos. Evaluación: Impacto 30 %, herramientas Meta 25 %, profundidad técnica 20 %, demo 25 %. Fecha límite indicada: 4 de noviembre de 2026 a las 9:00 PM Eastern Time. Revisar siempre anuncios posteriores y reglas oficiales antes de enviar.

19. Riesgos y mitigaciones
Relieve incorrecto/ausente: validar terreno antes de seleccionar el barrio; tener segunda zona candidata.
La inundación parece artificial: documentar supuestos, testear flujo y balance; no vender como predicción.
Datos OSM incompletos: usar geometría base real y marcar atributos inferidos.
Demasiados sistemas: una inundación completa, no cinco desastres superficiales.
Falta de fluidez: Worker, muestrear snapshots, renderizar agentes por lotes.
IA alucina métricas: solo cifras de herramientas; tipos estrictos y auditoría.
Costes/API: créditos, límites, rate limits, caché y fallback de corridas reales precalculadas.
Datos/licencias: atribuir proveedores, revisar términos de tiles y datasets; no asumir permiso universal.
No hay validación científica: mostrar etiqueta «experimental» y no usar para decisiones reales de emergencia.
20. Lecturas y recursos principales
MapLibre GL JS — https://maplibre.org/maplibre-gl-js/docs/
Overpass API — https://wiki.openstreetmap.org/wiki/Overpass_API
OpenStreetMap copyright/licencia — https://www.openstreetmap.org/copyright
USGS 3DEP — https://www.usgs.gov/3d-elevation-program
USGS The National Map — https://apps.nationalmap.gov/downloader/
FEMA Flood Maps — https://www.fema.gov/flood-maps
JuPedSim — https://www.jupedsim.org/
SUMO — https://sumo.dlr.de/docs/
GAMA Platform — https://gama-platform.org/
Mesa ABM — https://mesa.readthedocs.io/
HEC-RAS — https://www.hec.usace.army.mil/software/hec-ras/
Meta cookbook (ejemplos, validar versión vigente) — https://github.com/meta-models/meta-model-cookbook
Guía específica del Meta Global AI Developer Hackathon compartida en esta conversación (referencia normativa principal).
21. Primera definición para empezar a programar
Primera historia de usuario: «Como usuario, puedo abrir un barrio real, elegir lluvia intensa, iniciar la simulación y observar el agua, las calles bloqueadas y los primeros ciudadanos buscando refugios». Definición de terminado: escenario precargado con atribuciones, cuadro de controles, worker determinista, al menos una calle bloqueada por simulación, agentes recalculando rutas y métricas visibles.

Principio rector: la ciudad procede de datos geográficos; la catástrofe evoluciona según reglas de simulación; los habitantes son agentes sintéticos; la IA prueba acciones verificables; la visualización muestra los resultados sin inventarlos.