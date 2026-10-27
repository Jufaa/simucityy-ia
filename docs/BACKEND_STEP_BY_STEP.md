# Backend paso a paso: qué hacer y qué debería dar

**Continuar desde aquí:** ya existen los tipos y el generador de calles horizontales y verticales. El siguiente paso es validar la configuración antes de los bucles. Esta guía permite avanzar sin otra sesión de asistencia; no contiene implementaciones terminadas ni afirma que los pasos pendientes funcionen hoy.

La [idea y el estado actual](PROJECT_HANDOFF.md) y el [checklist completo](BACKEND_AI_CHECKLIST.md) complementan esta guía. No trabajar todavía en frontend.

## Cómo usar la guía

1. Completar un paso y comprobar su resultado antes de pasar al siguiente.
2. Escribir primero una prueba del comportamiento, comprobar que falla y después implementar lo mínimo para hacerla pasar.
3. No ejecutar entradas que puedan colgar los bucles actuales: comenzar por el caso seguro indicado en el paso 1.
4. Los pasos 1–2 son el siguiente trabajo recomendado. Los contratos nuevos, ejemplos de edificios y rutas posteriores son **propuestas didácticas ajustables**, no decisiones de producto ya aprobadas ni código existente.
5. Cuando falte una decisión, anotarla y detener esa parte; no inventar resultados ni completar casillas por crear archivos vacíos.

## Paso 0 — Comprobar desde dónde se empieza

**Leer:**

- `apps/backend/src/modules/cities/city.types.ts`
- `apps/backend/src/modules/cities/city-generator.ts`
- `apps/backend/src/test/cities/city-generator.test.ts`

**Ejecutar desde la raíz:**

```bash
pnpm exec vitest run apps/backend/src/test/cities/city-generator.test.ts
```

**Esperado al retomar este punto:** dos pruebas aprobadas. Si el código cambió, investigar la diferencia antes de agregar funciones. La última suite completa observada tuvo 28 pruebas aprobadas; esa cantidad aumentará al agregar casos.

Con ancho 100, alto 100 y separación 50, hoy se generan seis segmentos: tres horizontales y tres verticales. No hay terreno, edificios, grafo de rutas, semilla, integración Meta ni almacenamiento.

## Paso 1 — Rechazar números inválidos

**Modificar:** `city-generator.ts` y su prueba. No cambiar los nombres `widthInMeters`, `heightInMeters` y `streetSpacingInMeters`.

**Hacer:** comprobar los tres valores antes de crear calles. Cada uno debe satisfacer `Number.isFinite(value)` y ser mayor que cero. La regla propuesta es lanzar `RangeError` si alguno no cumple.

### Primera prueba: un caso que no cuelga el código actual

Agregar al archivo de pruebas:

```ts
it('rejects negative city dimensions', () => {
  expect(() =>
    generateCity({
      widthInMeters: -100,
      heightInMeters: 100,
      streetSpacingInMeters: 50,
    }),
  ).toThrow(RangeError);
});
```

**Antes de implementar:** la prueba debería fallar porque actualmente no se lanza ese error. Después, implementar la comprobación general de los tres campos y volver a ejecutar.

**Cuando la protección ya exista**, probar cada campo con los siguientes valores, dejando los otros dos válidos:

| Valor del campo | Resultado esperado                    |
| --------------- | ------------------------------------- |
| `0`             | `RangeError`, sin entrar a los bucles |
| `-1`            | `RangeError`                          |
| `NaN`           | `RangeError`                          |
| `Infinity`      | `RangeError`                          |
| `-Infinity`     | `RangeError`                          |

Con `{ widthInMeters: 100, heightInMeters: 100, streetSpacingInMeters: 50 }` se deben conservar las seis calles originales.

**Terminado cuando:** pasan los rechazos y las dos pruebas originales. No ejecutar separación cero o negativa contra la función sin protección: puede dejar un bucle infinito. Poner un timeout a una prueba síncrona no convierte ese bucle en seguro.

## Paso 2 — Limitar la cantidad de calles

**Problema:** aceptar únicamente números positivos no alcanza. Una separación diminuta puede producir demasiados segmentos.

**Modificar:** generador y pruebas. Estimar la cantidad antes de ejecutar los bucles:

```text
horizontales = floor(heightInMeters / streetSpacingInMeters) + 1
verticales   = floor(widthInMeters / streetSpacingInMeters) + 1
total        = horizontales + verticales
```

**Hacer:** acordar un máximo y rechazar una estimación no finita, insegura o superior a ese máximo. No crear millones de objetos y comprobar el límite al final.

**Ejemplo didáctico, no límite definitivo del producto:** si se adopta un máximo de 1000 calles:

| Ancho / alto / separación | Estimación | Esperado                  |
| ------------------------- | ---------- | ------------------------- |
| `100 / 100 / 50`          | 6          | Aceptar                   |
| `150 / 100 / 50`          | 7          | Aceptar                   |
| `10000 / 10000 / 1`       | 20002      | Rechazar antes de generar |

**Pruebas:** un caso aceptado, uno exactamente en el límite acordado y uno por encima. Documentar el límite real elegido y el error. No modificar silenciosamente el pedido para que entre.

## Paso 3 — Acordar los bordes y conservar la configuración

**Hacer:** decidir y documentar qué pasa cuando una dimensión no es múltiplo de la separación.

**Propuesta inicial:** mantener el comportamiento actual: colocar calles en múltiplos de la separación dentro del área, sin agregar otra calle especial en el borde final.

Ejemplo de ancho 120, alto 100 y separación 50:

- Horizontales en `y = 0, 50, 100`, desde `x = 0` hasta `x = 120`.
- Verticales en `x = 0, 50, 100`, desde `y = 0` hasta `y = 100`.
- Seis segmentos; no existe una vertical adicional en `x = 120`.

Agregar una prueba con esa regla si se acepta. Si se prefiere cerrar siempre el borde, definir esa alternativa y ajustar sus pruebas antes de cambiar el generador.

**También recomendado:** devolver una copia de la configuración, no la misma referencia que recibió la función.

**Prueba de independencia:** generar una ciudad con ancho 100; después cambiar el objeto de entrada a ancho 200. La ciudad ya creada debería seguir registrando ancho 100. La función tampoco debe modificar el objeto de entrada. Esto requiere implementación; hoy `config` todavía se devuelve por referencia.

## Paso 4 — Obtener manzanas entre calles

**Propuesta de archivos:** agregar tipos en `city.types.ts`, un ayudante `block-generator.ts` y su prueba en la carpeta actual de tests de ciudades. Separar la lógica de Fastify; no crear rutas todavía.

**Hacer:** representar cada manzana con un ID y límites rectangulares. Dos valores consecutivos de `x` y dos de `y` delimitan una manzana.

**Entrada de aprendizaje:** ciudad de 100 × 100 con separación 50.

**Salida esperada:** cuatro manzanas:

| ID ilustrativo | Esquina mínima | Esquina máxima |
| -------------- | -------------- | -------------- |
| `block-0-0`    | `(0, 0)`       | `(50, 50)`     |
| `block-1-0`    | `(50, 0)`      | `(100, 50)`    |
| `block-0-1`    | `(0, 50)`      | `(50, 100)`    |
| `block-1-1`    | `(50, 50)`     | `(100, 100)`   |

**Comprobar:** IDs únicos, áreas positivas, manzanas dentro de la ciudad y sin solapamientos de área. Si se aprueba la regla del paso 3, decidir qué hacer con las franjas incompletas del borde; una primera simplificación es no convertirlas en manzanas completas, dejando esa limitación explícita.

## Paso 5 — Agregar edificios simples

**Hacer:** definir un tipo de edificio y un ayudante que use las manzanas. Empezar con un edificio por manzana y alturas constantes; todavía no agregar azar.

**Ejemplo propuesto:** margen de 5 metros respecto de cada lado de la manzana y altura de 10 metros.

| Manzana                 | Límites del edificio   | Altura |
| ----------------------- | ---------------------- | ------ |
| `(0, 0)` a `(50, 50)`   | `(5, 5)` a `(45, 45)`  | 10 m   |
| `(50, 0)` a `(100, 50)` | `(55, 5)` a `(95, 45)` | 10 m   |

Para la ciudad anterior, esperar cuatro edificios. Los valores son sintéticos y didácticos, no alturas medidas ni parámetros finales del producto.

**Pruebas:** cada edificio cabe en su manzana, tiene ID único, superficie positiva y no cruza una línea de calle. Si el margen no deja espacio, devolver un error claro; no generar dimensiones negativas.

Las calles actuales solo tienen una línea central, no ancho vial. Estos márgenes no constituyen todavía un modelo de calzada y vereda. Si se incorpora ancho real de calle, acordar el contrato y ajustar las pruebas geométricas.

## Paso 6 — Representar el terreno inicial

**Hacer:** agregar datos explícitos del terreno. Para aprender, puede comenzar con una superficie plana y elevación constante en metros.

**Ejemplo de contrato propuesto, todavía no implementado:**

```json
{
  "kind": "flat",
  "elevationInMeters": 0
}
```

**Esperado:** cualquier punto válido del área tiene la misma elevación. Comprobar elevación finita y coordenadas dentro de los límites.

No afirmar que ya existe un modelo físico ni un ráster de elevaciones. La cuadrícula, resolución o representación detallada del terreno se acuerda cuando se elija la catástrofe. Si el motor necesita esos datos, implementarlos antes de habilitar ese evento.

## Paso 7 — Agregar variación con semilla

**Requisito previo:** edificios y reglas geométricas funcionan con valores constantes.

**Hacer:** introducir una semilla y una fuente de números pseudoaleatorios reproducible. No usar `Math.random()` directamente para las variaciones que se quieran repetir.

**Primer ejercicio propuesto:** variar solo alturas entre 5 y 15 metros, conservando posiciones y cantidad de edificios.

**Esperado:**

- Misma configuración, semilla y versión del generador: mismo mapa completo.
- Todas las alturas dentro del rango acordado.
- Las variaciones no rompen ninguna regla geométrica.
- Algunas semillas distintas producen alternativas distintas; no exigir que dos semillas diferentes jamás puedan coincidir en una salida pequeña.

No inventar una lista exacta de alturas esperadas antes de elegir el algoritmo pseudoaleatorio. Una vez elegido y probado, conservar un ejemplo conocido como prueba de regresión. Guardar también la versión del generador y la propuesta aceptada.

## Paso 8 — Acordar con el compañero el contrato de Meta

**No modificar unilateralmente el contrato compartido.** El generador actual acepta tres campos; cualquier parámetro futuro debe implementarse y probarse antes de pedírselo a la IA.

**Entradas propuestas para el adaptador:**

```json
{ "mode": "automatic" }
```

```json
{
  "mode": "guided",
  "description": "Una ciudad pequeña con calles regulares"
}
```

**Ejemplo de configuración que hoy sí entiende el generador:**

```json
{
  "widthInMeters": 100,
  "heightInMeters": 100,
  "streetSpacingInMeters": 50
}
```

**Hacer:** validar esa estructura y los mismos límites usados por el generador. Decidir si los contratos necesitan compartirse entre consumidores y recién entonces ubicarlos en `packages/shared`; no mover todos los tipos por anticipado.

**Pruebas sin llamadas reales:** una respuesta válida se acepta; un campo inválido se rechaza; un pedido de río o puentes no se informa como cumplido si esas características no existen todavía. El modo guiado debe explicar esa limitación o solicitar una aclaración.

## Paso 9 — Conectar Meta de verdad

**Responsable propuesto:** el compañero puede avanzar aquí mientras Juan trabaja en el generador, después de acordar el paso 8.

**Antes de escribir llamadas:** confirmar plataforma de la clave, modelo disponible, documentación del servicio, límites y presupuesto. No asumir que cualquier clave de Meta sirve para cualquier API. No compartir la clave en el chat ni guardarla en Git.

**Hacer en `modules/ai`:** configurar el acceso desde el backend, realizar una prueba mínima autorizada y transformar las respuestas en el contrato del paso 8.

**Esperado:** una solicitud automática y otra guiada producen propuestas válidas que pueden entregarse al mismo generador. No generar imágenes como sustituto de los datos ni ejecutar código devuelto por el modelo.

**Casos a probar:** credencial inválida, respuesta mal formada, valores fuera de límites, tiempo agotado, límite del proveedor y presupuesto agotado. Limitar intentos y propuestas; no repetir sin control. Las pruebas habituales deben usar un proveedor simulado, no consumir saldo.

## Paso 10 — Conectar el recorrido a la API

**Requisito previo:** adaptador y generador funcionan por separado y juntos en pruebas. Actualmente la API solo registra `/health`.

**Hacer:** acordar rutas, solicitudes, respuestas y errores; agregar cada ruta cuando su comportamiento exista. No crear un archivo por cada endpoint futuro sin lógica.

**Propuesta de contrato inicial, no rutas ya existentes:**

| Operación              | Entrada                             | Resultado esperado                                |
| ---------------------- | ----------------------------------- | ------------------------------------------------- |
| Solicitar generación   | Modo y descripción opcional         | ID de solicitud y alternativas válidas con ID     |
| Consultar generación   | ID de solicitud                     | Estado real, alternativas o error                 |
| Elegir una alternativa | ID de solicitud e ID de alternativa | ID del escenario elegido y el mismo mapa generado |
| Recuperar escenario    | ID del escenario                    | Mapa, configuración y versión conservados         |

Definir códigos HTTP y ejemplos exactos antes de implementar. Si hay trabajos largos, acordar estados y cómo consultar/cancelar; no agregar una cola o un servicio externo si una primera ejecución acotada no lo necesita.

**Pruebas de API:** pedido válido produce datos validados; pedido inválido no llama al proveedor ni guarda basura; un ID inexistente devuelve un error claro; elegir una alternativa no vuelve a generar otra ciudad. Usar Fastify `inject` para los tests y conservar `/health`.

## Paso 11 — Guardar y recuperar sin perder información

**Decisión previa:** archivos locales o base de datos según lo que se necesite. PostgreSQL no está instalado como parte de esta capacidad ni es obligatorio elegirlo ahora.

**Conservar:** ID, mapa aceptado, configuración, semilla si existe, versión y procedencia sintética. Guardar el resultado aceptado, no depender de que Meta lo vuelva a producir.

**Prueba concreta:**

1. Generar y guardar un mapa.
2. Destruir la instancia del servicio de almacenamiento y crear otra usando la misma ubicación persistente.
3. Recuperar el mapa por ID.
4. Comparar con igualdad profunda: los datos deben ser los mismos.

También probar escritura fallida y archivos/datos inválidos: no informar éxito ni dejar un escenario incompleto como válido. Ejecutar pruebas de almacenamiento en un directorio temporal fuera del repositorio, nunca sobre archivos reales del usuario.

**Primer hito:** automático/guiado → alternativas válidas → seleccionar → guardar → reiniciar → recuperar exactamente el mismo mapa. Todavía sin catástrofes ni frontend.

## Paso 12 — Crear variantes y conexiones viales

**Variantes:** conservar el escenario base y crear otro ID con referencia al original y a los cambios. Esperar que editar una variante no cambie el mapa base.

**Grafo vial, cuando lo necesiten los efectos elegidos:** convertir intersecciones en nodos y tramos entre intersecciones en aristas. Que dos segmentos se crucen visualmente no implica que ya exista una conexión utilizable por un algoritmo de rutas.

**Ejercicio sobre la cuadrícula de 100 × 100 y separación 50:** un grafo no dirigido con nodo en cada cruce tiene nueve nodos y doce aristas entre vecinos. Probar que existe una ruta por tramos válidos y que una arista bloqueada no se utiliza. Si el grafo es dirigido o permite otras conexiones, definir otros resultados antes de implementar.

## Paso 13 — Elegir y construir una primera catástrofe

**No se eligió todavía el fenómeno.** No es posible fijar una respuesta numérica de física sin acordar antes el modelo, unidades, condiciones iniciales y datos necesarios.

**Hacer:** elegir un solo fenómeno y efectos iniciales, identificar datos que faltan, construir el motor separado de Meta/Fastify y fijar ejemplos verificables.

**Si se elige inundación**, ejemplos de reglas que habría que concretar y probar:

- Sin aportes de agua, no aparece agua espontáneamente.
- La profundidad no es negativa y los flujos respetan el balance definido por el modelo.
- Un umbral documentado determina cuándo se bloquea una calle.
- Repetir mapa, evento, versión y semilla aplicable produce las mismas métricas.

Son ejemplos condicionales, no aceptación automática de inundación ni una implementación hidrodinámica existente. Si se elige otro fenómeno, definir sus propias reglas.

**Esperado del backend:** rechazar mapas incompatibles y parámetros inválidos; relacionar cada ejecución con su escenario y evento; devolver resultados calculados por el motor sin modificar el mapa original. Un fallo o cancelación no debe aparecer como ejecución exitosa.

## Paso 14 — Comparar y cerrar la segunda entrega

**Hacer:** ejecutar un caso base y otro con un cambio identificado, usando el mismo mapa y las demás condiciones iguales. Conservar IDs y versiones.

**Esperado:** explicar qué se modificó y calcular las diferencias desde resultados reales. No pedirle a Meta que invente porcentajes de daños o mejoras.

Población y evacuación solo entran si se acuerdan como efectos; no comenzar otro sistema grande por anticipado. La optimización autónoma con IA también queda para después del recorrido básico.

**Segundo hito:** recuperar mapa → elegir evento compatible → simular → guardar/consultar resultados → reproducir y comparar.

## Control al terminar cada paso

```bash
pnpm exec vitest run apps/backend/src/test/cities/city-generator.test.ts
pnpm test
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
```

Agregar al comando enfocado los archivos de prueba nuevos a medida que existan. Esperar pruebas aprobadas, cero errores de lint/tipos/formato y build exitoso. No hay una cantidad fija de tests para los pasos futuros y no se afirma que estos cambios pendientes ya pasen los comandos.

Actualizar ejemplos y documentación cuando cambien los contratos. No marcar una tarea terminada si falta una comprobación necesaria. El asistente no debe hacer commits, staging, push ni llamadas pagas por su cuenta.

**Si se termina el contexto:** abrir otra sesión con [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md), indicar el número de paso alcanzado y pegar la salida de la última prueba. No reiniciar el proyecto ni reemplazar trabajo local que ya exista.
