# Desarrollar Simulicity IA en equipo

**Primero acuerden la idea y la maqueta; después desarrollen en paralelo con contratos compartidos.** Esta es la lista de tareas asignables para un proyecto al ritmo del equipo, no un calendario de hackathon. Una casilla sin marcar representa trabajo futuro, no una función implementada ni permiso para publicar nada.

## Inicio rápido

1. Completen la columna de responsables; una persona puede asumir varias áreas.
2. Completen **P1–P4** juntos antes de implementar una nueva interfaz funcional.
3. Acuerden **C1–C3** para que backend y frontend trabajen por separado con los mismos datos de prueba.
4. Entreguen la primera versión utilizable de **M1** y luego elijan el siguiente hito.

Consulten las [opciones y restricciones de APIs](API_CATALOG.md), la [arquitectura](ARCHITECTURE.md) y la [guía de configuración](../README.md). La idea original, `Ideadelproyect.md`, es material local aportado por el usuario y puede no existir en una copia recién clonada. Las fechas del evento, el tamaño del equipo, el modelo y los endpoints sugeridos allí no son obligaciones actuales.

## Definición del producto por acordar

**Idea:** una aplicación web para cargar un barrio pequeño, configurar una inundación experimental, observar sus efectos sobre calles, edificios y evacuación de población sintética, y comparar intervenciones con las mismas condiciones iniciales. Un asistente de IA opcional puede usar herramientas del simulador para proponer y probar cambios; no calcula la física ni inventa métricas.

**Flujo principal:** elegir una zona preparada → revisar la calidad de los datos → configurar lluvia y escenario → ejecutar/pausar/reiniciar → inspeccionar impactos y evacuación → aplicar un cambio → comparar ejecuciones reproducibles.

**Alcance inicial propuesto, no una decisión definitiva:** una zona preparada, un modelo de inundación, una población sintética acotada y refugios. Un conjunto de datos de prueba con terreno sintético, claramente identificado, puede desbloquear el desarrollo; no demuestra el comportamiento de un barrio real. La zona real se elige después de revisar los datos, no solo porque la guía original mencione Miami.

**No se promete:** predicción científica, asesoramiento certificado para emergencias, destrucción estructural realista, seguimiento de personas reales, tráfico urbano calibrado ni múltiples catástrofes de alta fidelidad. El equipo puede cambiar el alcance de forma explícita, en lugar de acumular estas funciones sin decidirlo.

### Qué se conserva

La base mínima contiene únicamente infraestructura; las funciones de producto se construirán después de acordarlas:

- [x] Frontend Next.js vacío, con React, TypeScript, Tailwind y carpetas organizativas.
- [x] API Fastify con `/health`, configuración, CORS, errores y registros básicos.
- [x] Proxy de salud de Next hacia Fastify y contrato de salud en `packages/shared`.
- [x] Pruebas de la base, scripts de desarrollo/compilación, formato, lint y CI.

Se retiraron demos, rutas de producto sin implementar, modelos anticipados, motor, utilidades geográficas, preparación de IA/base de datos y dependencias visuales sin uso. No hay mapa configurado, Prisma ni contenedor de base de datos. La página neutra no es la nueva maqueta.

Los módulos de dominio que aparecen abajo son **ubicaciones propuestas para trabajo futuro**, no carpetas o capacidades existentes. Crear cada módulo y sus dependencias cuando su primera necesidad esté acordada. La idea y este checklist se conservan para decidir conscientemente qué construir.

## Tablero de responsables

Escriban el nombre de una persona responsable y de quien revisará antes de empezar cada tarea. Son áreas de trabajo, no una cantidad obligatoria de integrantes. Si son menos personas, combinen áreas; si son más, dividan tareas acotadas en lugar de asignar el mismo archivo a varias personas.

| Área                                | Responsable | Revisor     | Límite principal de edición                                                          |
| ----------------------------------- | ----------- | ----------- | ------------------------------------------------------------------------------------ |
| Producto / UX                       | Por asignar | Por asignar | Decisiones de producto, flujos y referencia de la maqueta                            |
| Contratos compartidos / integración | Por asignar | Por asignar | `packages/shared`, datos de prueba acordados y cambios de interfaces                 |
| Geografía / datos                   | Por asignar | Por asignar | `packages/geo`, archivos de escenarios aprobados                                     |
| Simulación / evacuación             | Por asignar | Por asignar | `packages/simulation-core`; coordinar cambios del motor y del mundo                  |
| Backend                             | Por asignar | Por asignar | `apps/backend`, posteriormente `packages/database` si se necesita                    |
| Frontend / 3D                       | Por asignar | Por asignar | `apps/frontend`; separar la presentación del estado de simulación                    |
| IA                                  | Por asignar | Por asignar | `packages/ai-planner`, conexión de proveedores y herramientas coordinada con backend |
| Calidad / integración               | Por asignar | Por asignar | Pruebas de aceptación entre áreas y datos de prueba reproducibles                    |

Cada tarea corresponde al responsable de su área. Si cruza límites, identifiquen al responsable colaborador antes de editar. En particular, backend e IA no deben reescribir por separado el mismo módulo de API, y geografía, simulación y frontend no deben crear tipos compartidos incompatibles.

## 1. Idea y maqueta — acordar antes de implementar funciones

- [ ] **P1 — Definir el caso de uso real.** Responsable: Producto / UX. Depende de: nada. Decidir quién lo usa, qué pregunta quiere responder, primera zona, catástrofe, escala aproximada y qué se pospone explícitamente. **Terminado cuando:** exista una definición breve acordada, con un ejemplo concreto y un resultado medible; las decisiones pendientes sigan identificadas.
- [ ] **P2 — Explicar el recorrido del usuario y las reglas.** Responsable: Producto / UX con responsables de dominio. Depende de: P1. Describir cada acción, datos necesarios, resultado esperado y significado de las métricas; distinguir datos observados, inferidos y sintéticos. **Terminado cuando:** el equipo pueda recorrer cargar → ejecutar → inspeccionar → comparar sin adivinar qué hace un botón.
- [ ] **P3 — Crear esquemas de pantalla anotados y una maqueta navegable.** Responsable: Producto / UX con Frontend. Depende de: P2. Incluir selección de zona/calidad de datos, configuración del escenario, mapa/capas, reproducción, inspección de objetos, resultados/comparación y un futuro panel opcional de IA. Contemplar estados inicial, cargando, vacío, datos inválidos, mapa/API no disponible y ejecución fallida; pantallas angostas, teclado, leyendas accesibles y unidades visibles. **Terminado cuando:** se enlace la maqueta y todo valor de ejemplo se identifique como ilustrativo, no como resultado simulado.
- [ ] **P4 — Revisar y aprobar la primera entrega funcional.** Responsable: Producto / UX; revisan todas las áreas. Depende de: P3. Probar el recorrido con compañeros, quitar pantallas innecesarias, acordar criterios de aceptación y registrar decisiones. **Terminado cuando:** haya una maqueta/versión aprobada y una lista clara de funciones incluidas y pospuestas. No reconstruir automáticamente el panel anterior.

## 2. Contratos compartidos — acuerdo para trabajar en paralelo

- [ ] **C1 — Acordar contratos del escenario y del mundo.** Responsable: Contratos compartidos con Geografía y Simulación. Depende de: P2. Definir deliberadamente los primeros esquemas de dominio en `packages/shared`: IDs, versiones de esquema/escenario, semilla, terreno/cuadrícula, calles/grafo, edificios, ciudadanos, refugios, parámetros de catástrofe y procedencia. Definir unidades, conversión de coordenadas, datum vertical, valores desconocidos y límites de tamaño. **Terminado cuando:** los datos de prueba válidos e inválidos se acepten o rechacen como corresponde; sin duplicar tipos de dominio por aplicación.
- [ ] **C2 — Acordar contratos de ejecución y resultados.** Responsable: Contratos compartidos con Backend y Frontend. Depende de: P4, C1. Especificar IDs/estados de ejecución, configuración/intervenciones, contenido de instantáneas, definiciones de métricas, formato de errores, cancelación y mensajes del Worker. Decidir qué se ejecuta en navegador y qué en Node. **Terminado cuando:** los ejemplos de solicitudes, resultados y errores describan el mismo comportamiento para todos los consumidores; los cambios de versión se revisen con las áreas afectadas.
- [ ] **C3 — Fijar un conjunto pequeño de datos de integración.** Responsable: Contratos compartidos / integración. Depende de: C2. Entregar un escenario mínimo con instantáneas/resultados esperados deterministas y casos de carga/error de interfaz identificados como simulados. **Terminado cuando:** frontend pueda desarrollar con datos válidos según el contrato mientras backend implementa ese mismo contrato; los ejemplos nunca se presenten como resultados en vivo.

**El trabajo paralelo empieza aquí:** después de P4 y C3, backend y frontend pueden avanzar al mismo tiempo. Geografía y simulación usan el contrato de escenario acordado. IA puede implementar pruebas con un proveedor ficticio, pero no afirmar resultados reales hasta que existan el motor y las herramientas. No esperar a terminar todo el backend para empezar el frontend aprobado.

## 3. Geografía y datos

- [ ] **G1 — Elegir la zona y los proveedores.** Responsable: Geografía / datos. Depende de: P1, C1. Revisar cobertura antes de elegir; registrar el área delimitada y una zona alternativa. Usar la [lista de evaluación de proveedores](API_CATALOG.md#lista-de-verificación-para-adoptar-un-proveedor). **Terminado cuando:** una zona pequeña aprobada tenga una decisión sobre licencias/acceso y vacíos conocidos; los proveedores opcionales queden seleccionados o pospuestos, no todos como obligatorios.
- [ ] **G2 — Preparar geometría con atribución.** Responsable: Geografía / datos. Depende de: G1. Extraer calles, edificios y puntos de interés de OSM en una zona acotada; normalizar geometría, reparar/eliminar duplicados cuando corresponda y guardar datos de prueba versionados. No consultar Overpass en cada carga o ejecución. **Terminado cuando:** la preparación reproducible produzca geometría validada con fuente, fecha de descarga, licencia y etiquetas de observado/derivado/sintético.
- [ ] **G3 — Preparar terreno utilizable.** Responsable: Geografía / datos. Depende de: G1, C1. Revisar resolución real, cobertura, NoData, datum y unidades; elegir proyección métrica local y cuadrícula. No atribuir más detalle a datos gruesos por interpolarlos. **Terminado cuando:** el terreno aprobado se convierta al escenario sin sustituir silenciosamente valores faltantes y se distinga de las teselas visuales y las alturas de edificios.
- [ ] **G4 — Construir el escenario conectado.** Responsable: Geografía / datos con Simulación. Depende de: G2, G3. Construir nodos/aristas de calles con longitudes métricas y reglas de acceso, conectar edificios/refugios e identificar componentes desconectados. **Terminado cuando:** los archivos versionados se carguen mediante C1 con supuestos explícitos y una muestra pequeña de calles/terreno que se pueda inspeccionar.

## 4. Simulación y evacuación

- [ ] **S1 — Cargar un mundo con entidades.** Responsable: Simulación. Depende de: C3; usar los datos sintéticos hasta que exista G4. Implementar el ciclo de vida inicial del motor, la semilla y el límite de instantáneas. **Terminado cuando:** reiniciar reconstruya el mismo mundo y avanzar pasos nunca modifique el escenario de entrada ni una instantánea entregada anteriormente.
- [ ] **S2 — Implementar la inundación experimental.** Responsable: Simulación. Depende de: S1. Definir aportes de lluvia, profundidad inicial, supuestos de drenaje/contorno, paso temporal estable y transferencias simultáneas entre celdas vecinas limitadas por el agua disponible. **Terminado cuando:** las profundidades no sean negativas y las pruebas demuestren que no se crea agua sin explicación, con balance de volúmenes, entradas/salidas y tolerancia documentada.
- [ ] **S3 — Calcular impactos sobre calles y edificios.** Responsable: Simulación. Depende de: S2 y datos de prueba de calles. Relacionar profundidad con un umbral documentado de bloqueo y bandas de exposición de edificios. **Terminado cuando:** al menos una calle quede intransitable por profundidad calculada y un edificio inspeccionado muestre exposición, no daño estructural sin respaldo.
- [ ] **S4 — Agregar ciudadanos sintéticos y rutas hacia refugios.** Responsable: Simulación / evacuación. Depende de: S1 y contratos de calles/refugios; integrar S3 cuando esté listo. Definir hogares con semilla, movilidad/reacción, estados, búsqueda de caminos, recálculo de rutas y reservas de refugios. **Terminado cuando:** los ciudadanos no atraviesen calles bloqueadas, los refugios no superen su capacidad y quienes no tengan camino se contabilicen como aislados.
- [ ] **S5 — Calcular resultados comparables.** Responsable: Simulación con Calidad. Depende de: S2–S4. Definir conteos de población segura/aislada, estadísticas de tiempos de evacuación, edificios expuestos, longitud de calles intransitables y ocupación de refugios; tratar explícitamente casos con cero entidades o sin terminar. **Terminado cuando:** el mismo escenario, versión, semilla y pasos temporales reproduzcan resultados; las comparaciones mantengan iguales las condiciones iniciales salvo la intervención registrada.

## 5. Backend

- [ ] **B1 — Implementar acceso a escenarios.** Responsable: Backend. Depende de: C3; el paquete real llega desde G4. Mantener Fastify como API de dominio y usar un único esquema de rutas versionadas acordado. **Terminado cuando:** listado, detalle y errores de carga devuelvan datos válidos según el esquema; IDs inválidos y solicitudes rechazadas no cambien el estado guardado. Agregar rutas solo cuando exista su comportamiento; no registrar marcadores de funciones futuras.
- [ ] **B2 — Implementar la orquestación de ejecuciones.** Responsable: Backend con Simulación. Depende de: C2, S1; completar con S5. Llamar al mismo motor TypeScript puro del adaptador de navegador, no implementar otra física. Definir tamaño acotado de ejecución, estados, cancelación, tiempo límite y comportamiento ante fallos. **Terminado cuando:** las ejecuciones reales tengan IDs/resultados y el trabajo cancelado o fallido no se informe como exitoso; el comportamiento existente de API siga probado.
- [ ] **B3 — Elegir el alcance de guardado y reproducción.** Responsable: Backend con Producto. Depende de: C2. Decidir si JSON local versionado alcanza inicialmente o si se necesita persistencia en la aplicación; la base mínima no incluye base de datos ni una herramienta de persistencia elegida. **Terminado cuando:** guardar/cargar tenga una prueba de ida y vuelta, trazabilidad de ejecución/configuración/versión y retención explícita; las migraciones de base de datos sean una tarea separada y revisada solo si se eligen.
- [ ] **B4 — Validar y limitar el trabajo externo.** Responsable: Backend con Geografía e IA. Depende de: proveedores elegidos y B1/B2 según corresponda. Aplicar límites de tamaño/coordenadas, descargas seguras, tiempos límite, caché, cancelación y presupuestos de costos/tasa. Mantener claves en servidor y errores sin información sensible. **Terminado cuando:** las pruebas de rechazo/fallo conserven el estado previo; ninguna herramienta pueda ejecutar código arbitrario del modelo ni descargar URLs arbitrarias.
- [ ] **B5 — Documentar la entrega a otras áreas.** Responsable: Backend. Depende de: B1–B4 según se entreguen. Documentar ejemplos actuales de solicitudes, resultados y errores, y comandos locales junto a su implementación. **Terminado cuando:** frontend e IA puedan probar la interfaz pública con los datos compartidos; las operaciones no implementadas no se registren como rutas disponibles.

El proxy de salud conservado en Next no es otro backend de simulación. El alojamiento público y la autenticación no forman parte de este reinicio; una futura decisión de servicio público requiere trabajo específico de seguridad y operación antes de exponerlo.

## 6. Frontend y 3D

- [ ] **F1 — Implementar la estructura visual aprobada.** Responsable: Frontend. Depende de: P4, C3. Reconstruir componentes reutilizables y estado exclusivo de interfaz en las carpetas conservadas. Usar datos de prueba compartidos durante el desarrollo de backend. **Terminado cuando:** funcionen el recorrido aprobado, teclado/navegación, pantallas angostas y estados inicial/vacío/error sin presentar datos ficticios como reales.
- [ ] **F2 — Reincorporar la visualización geográfica.** Responsable: Frontend / 3D. Depende de: F1, C1; G4 para capas del escenario real. Crear la configuración de mapa para el proveedor elegido, atribución y tratamiento de mapa no disponible. Agregar edificios y terreno solo cuando existan esos datos. **Terminado cuando:** las capas identifiquen su procedencia y coincidan con el escenario; el mapa base nunca se trate como un mundo importado.
- [ ] **F3 — Conectar la reproducción sin bloquear la interfaz.** Responsable: Frontend con Simulación. Depende de: F1, C2, S1; resultados de inundación de S2/S3. Agregar comunicación con Worker, iniciar/pausar/reiniciar, velocidad, muestreo de instantáneas y tratamiento de mensajes obsoletos/cancelación. **Terminado cuando:** los controles actúen sobre el motor real, reiniciar sea reproducible y la interfaz siga respondiendo durante los cálculos.
- [ ] **F4 — Mostrar impactos calculados e inspección.** Responsable: Frontend. Depende de: F2/F3 y S3–S5 según se entreguen. Representar agua, calles bloqueadas, ciudadanos sintéticos, ocupación de refugios, leyendas, unidades y detalles del objeto seleccionado. **Terminado cuando:** los valores visibles coincidan con las instantáneas/resultados recibidos y distingan desconocido, no disponible y cero.
- [ ] **F5 — Construir reproducción y comparación.** Responsable: Frontend con Backend. Depende de: F4, S5 y comportamiento elegido en B3. Mostrar entradas del caso base/intervención y diferencias de métricas, con futuros resultados de IA vinculados a ejecuciones reales. **Terminado cuando:** un compañero pueda reproducir una comparación e inspeccionar qué cambió; las maquetas y datos de prueba no puedan confundirse con evidencia guardada de simulación.

Empezar con capas de MapLibre y marcadores simples para agentes. Los modelos y efectos de Three.js son mejoras opcionales después de una entrega útil, no un requisito de simulación ni un motivo para rehacer la arquitectura.

## 7. IA

- [ ] **A1 — Evaluar acceso al proveedor.** Responsable: IA. Depende de: P1 y alcance de IA elegido. Verificar documentación vigente, acceso de la cuenta, soporte de modelos/herramientas, titularidad de claves, cuotas y presupuesto. Meta es un candidato, no un requisito permanente automático. **Terminado cuando:** se registre un proveedor elegido o su postergación explícita; ningún secreto llegue a variables del navegador ni al repositorio.
- [ ] **A2 — Implementar herramientas controladas.** Responsable: IA con Backend. Depende de: C2/C3; la ejecución real depende de B1/B2 y S5. Definir esquemas de herramientas permitidas solo para las operaciones acordadas para resúmenes, métricas, variantes, intervenciones, ejecuciones y comparaciones. **Terminado cuando:** se validen argumentos/resultados, se apliquen presupuestos acumulados y cancelación, y se rechacen modificaciones no autorizadas sin alterar el estado previo.
- [ ] **A3 — Comparar alternativas acotadas.** Responsable: IA. Depende de: A1, A2 y resultados reales de simulación. Registrar caso base, objetivo, restricciones, intervención propuesta y trazabilidad de ejecuciones; solicitar aprobación del usuario para las modificaciones acordadas. **Terminado cuando:** el agente pueda mejorar o descartar una hipótesis usando cifras devueltas por herramientas y condiciones iniciales fijas, sin inventar puntuaciones ni reemplazar la física.
- [ ] **A4 — Probar fallos y explicaciones.** Responsable: IA con Calidad. Depende de: A2/A3. Cubrir proveedor no disponible, llamadas inválidas, tiempo agotado, presupuesto agotado y ausencia de mejora. **Terminado cuando:** el usuario reciba un estado honesto con referencias inspeccionables a ejecuciones; las pruebas puedan usar un proveedor ficticio y la interfaz distinga claramente el comportamiento ficticio/sin conexión del proveedor real.

## 8. Calidad, integración y trabajo en equipo

- [ ] **Q1 — Verificar la configuración local y los responsables.** Responsable: Calidad / integración; participa todo el equipo. Depende de: nada. Seguir el README sin credenciales de base de datos ni IA para la base; asignar responsables/revisores y coordinar cambios de esquemas compartidos y archivo de dependencias bloqueadas. **Terminado cuando:** cada integrante pueda ejecutar sus pruebas y sepa quién revisa su área.
- [ ] **Q2 — Establecer datos de prueba y pruebas de regresión.** Responsable: Calidad con cada responsable funcional. Depende de: C3; ampliar con cada función. Cubrir semillas deterministas, balance/profundidad de agua, caminos bloqueados, capacidad de refugios, conteos de aislados, reproducción y conservación de fuentes/unidades. Agregar pruebas que fallen antes de cambiar comportamiento determinista. **Terminado cuando:** las pruebas usen interfaces públicas, incluyan los efectos de entradas rechazadas y distingan fallos previos conocidos de nuevas regresiones.
- [ ] **Q3 — Demostrar el recorrido integrado del usuario.** Responsable: Calidad / integración. Depende de: funciones del hito elegido. Agregar pruebas de interacción en navegador cuando se acuerden las herramientas, más verificaciones manuales de mapa/WebGL. Probar teselas/API/proveedor faltantes, datos inválidos, cancelación, tareas lentas y accesibilidad. **Terminado cuando:** la evidencia de aceptación incluya salida/estado reales, no solo una compilación exitosa o una captura atractiva.
- [ ] **Q4 — Cerrar cada unidad de trabajo con evidencia real.** Responsable: responsable de esa función; verifica el revisor. Depende de: esa unidad. Ejecutar pruebas enfocadas y verificaciones aplicables del repositorio, actualizar documentación/ejemplos y registrar verificaciones omitidas o no disponibles. **Terminado cuando:** la unidad tenga cambios coherentes, una entrega comprensible para otro integrante y ningún cambio ajeno de dependencias/contratos. Integrar ramas, hacer push o crear PRs siguen siendo decisiones explícitas del dueño del repositorio.

## Hitos, no fechas límite

| Hito                               | Resultado requerido                                                | Condición para avanzar                                                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 — Producto acordado             | P1–P4, C1–C3, Q1                                                   | Un integrante puede explicar el alcance y recorrer la maqueta aprobada; los contratos/datos de prueba permiten trabajo paralelo                                                             |
| M1 — Primera inundación utilizable | S1–S3, F1–F3, tareas mínimas de G/B según necesidad                | Cargar un escenario pequeño identificado → cambiar lluvia → ejecutar/pausar/reiniciar → ver agua calculada, una calle bloqueada y métricas reales; repetir entradas y reproducir resultados |
| M2 — Evacuación y comparación      | G4 para geografía real, S4/S5, F4/F5, comportamiento elegido de B3 | Inspeccionar procedencia de datos reales y agentes sintéticos; comparar una intervención registrada sin cambiar condiciones iniciales ajenas                                                |
| M3 — IA opcional útil              | A1–A4 y herramientas reales del backend                            | Las alternativas acotadas son auditables y cada explicación numérica coincide con ejecuciones reales                                                                                        |

Usar datos sintéticos en M1 si preparar terreno real bloquearía el motor; identificar esa limitación. El comportamiento sobre una zona real es una condición separada de M2, no algo demostrado por resultados sintéticos. Mantener la base de backend/API disponible mientras se reconstruye el frontend; esta tabla no exige implementar todas las tareas B antes de cualquier tarea F.

### Pendientes opcionales — elegir solo cuando aporten valor

- [ ] Búsqueda de ciudades mediante consultas enviadas/geocodificación, configuraciones basadas en clima o capas de referencia de inundación/población: elegir un proveedor por necesidad del catálogo de APIs.
- [ ] Modelos avanzados de Three.js, partículas o efectos de agua: justificar costo de GPU/mantenimiento y mantener la simulación independiente de la visualización.
- [ ] Otras catástrofes, regiones mayores, tráfico calibrado, motores numéricos avanzados o validación científica: acordar primero alcance y conocimientos necesarios.
- [ ] Alojamiento compartido, autenticación, colaboración y despliegue: definir usuarios, privacidad de datos, gastos, acceso y responsables operativos antes de publicar.

## Plantilla de entrega de tareas

Copiar al gestor de tareas elegido por el equipo; este documento no crea incidencias externas ni cuentas.

```text
ID / título:
Responsable / revisor:
Depende de:
Alcance y límite exacto de edición:
Versión de esquema compartido / datos de prueba:
Entregable y criterios observables de finalización:
Verificaciones y resultados observados:
Limitaciones conocidas / siguiente entrega:
```

**Próxima acción:** asignar responsables en el tablero y completar P1. No empezar recreando la interfaz retirada ni registrándose en todas las APIs.
