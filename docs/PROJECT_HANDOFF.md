# Simulicity IA: idea, estado y próximos pasos

**Punto de continuación — 27 de octubre de 2026.** El proyecto busca generar ciudades sintéticas pequeñas con ayuda de Meta y, después, simular una catástrofe sobre el mapa elegido. Hoy existe la infraestructura y un primer generador de calles; todavía no existe un simulador completo.

Este documento permite retomar en otra sesión. El [checklist de backend e IA](BACKEND_AI_CHECKLIST.md) contiene el desglose por tareas. Los pasos futuros no están implementados ni autorizados automáticamente por aparecer aquí.

Para avanzar sin asistencia, usar la [guía práctica paso a paso](BACKEND_STEP_BY_STEP.md): cada paso indica qué modificar, entradas de ejemplo, resultados esperados y comprobaciones. Empezar por su paso 1, validación de configuración.

## 1. La idea acordada

Crear una ciudad pequeña y sencilla desde cero, inspirada en características de lugares reales, no una copia exacta de una ciudad existente.

Dos modos utilizan el mismo generador:

- **Automático:** el usuario solicita una ciudad y Meta decide sus características dentro de los límites admitidos.
- **Guiado:** el usuario describe lo que quiere y Meta convierte ese texto en características admitidas.

Ejemplo guiado: «Una ciudad pequeña, con un río en el centro, dos puentes y edificios bajos».

Las características no requieren que el usuario complete controles manuales: las decide la IA o las interpreta del texto. Ningún modo debe prometer elementos que el generador todavía no soporte.

**Recorrido deseado:** pedir ciudad → generar propuestas → construir y validar sus mapas → elegir uno → guardarlo → elegir una catástrofe compatible → configurar el evento → simular → consultar y comparar resultados.

## 2. Qué hace cada parte

| Parte                | Responsabilidad                                                       |
| -------------------- | --------------------------------------------------------------------- |
| Meta                 | Interpretar el pedido y proponer características estructuradas        |
| Generador procedural | Convertir parámetros en terreno, calles y edificios mediante reglas   |
| Backend              | Validar, coordinar solicitudes, conservar mapas y exponer operaciones |
| Motor de simulación  | Calcular el evento, sus efectos y las métricas                        |

**La IA no sustituye al generador ni a la física.** Una imagen bonita no contiene por sí sola los datos necesarios para simular. Las métricas deben salir del motor, no de una respuesta inventada por el modelo.

La reproducción exacta de lugares reales, el frontend y la optimización autónoma de intervenciones quedan fuera del trabajo actual. Tampoco se promete predicción científica ni asesoramiento real para emergencias.

## 3. Decisiones tomadas y pendientes

### Acordado

- Ciudad sintética pequeña, sencilla e inspirada en lugares reales.
- Modo automático y modo guiado por texto.
- Meta como proveedor de IA previsto.
- Construir primero backend, generación e IA, sin trabajar todavía en frontend.
- Primera prueba técnica: cuadrícula de calles horizontales y verticales.
- Mantener separados mapa, catástrofe y ejecución para reutilizar el mismo lugar.

### Todavía por decidir

- Tamaño máximo, cantidad máxima de entidades y características iniciales admitidas.
- Qué tipos de terreno, edificios, agua y puentes soportará la primera entrega.
- Servicio exacto de Meta que emitió la clave, modelo habilitado y presupuesto.
- Cantidad máxima de propuestas por solicitud.
- Qué guardar y si inicialmente bastan archivos o hace falta una base de datos.
- Primera catástrofe y efectos que se calcularán. Inundación es una idea anterior, no una decisión vigente confirmada.
- Población y evacuación: incorporarlas solo si se aprueban como parte de esos efectos.

No fijar todas estas decisiones por adelantado: resolver cada una antes de implementar la parte que depende de ella.

## 4. Código que existe hoy

| Ubicación                                             | Estado                                              |
| ----------------------------------------------------- | --------------------------------------------------- |
| `apps/backend`                                        | Fastify, configuración, CORS, errores y `/health`   |
| `packages/shared`                                     | Solo contrato de salud con Zod y su tipo TypeScript |
| `apps/backend/src/modules/cities/city.types.ts`       | Tipos iniciales del generador                       |
| `apps/backend/src/modules/cities/city-generator.ts`   | Generación de calles horizontales y verticales      |
| `apps/backend/src/test/cities/city-generator.test.ts` | Dos pruebas del generador                           |

Los nombres de paquetes siguen siendo `@simulicity/api` y `@simulicity/web`, aunque las carpetas se llamen `backend` y `frontend`. `shared` es una biblioteca interna, no otro servidor. Las carpetas con `.gitkeep` son organización vacía, no funciones implementadas.

### Contrato inicial del generador

- `CityConfig`: `widthInMeters`, `heightInMeters`, `streetSpacingInMeters`.
- `Point`: `x`, `y`, en metros locales; no son latitud/longitud.
- `Road`: `id`, `start`, `end`.
- `City`: `config`, `roads`.

Con esta entrada de prueba:

```ts
generateCity({
  widthInMeters: 100,
  heightInMeters: 100,
  streetSpacingInMeters: 50,
});
```

El generador devuelve tres calles horizontales en `y = 0, 50, 100` y tres verticales en `x = 0, 50, 100`: **seis segmentos en total**. Los valores son de prueba, no el tamaño definitivo del producto.

Los IDs actuales son `horizontal-${y}` y `vertical-${x}`. Primero aparecen las horizontales y después las verticales. No hay aleatoriedad y todavía no se necesita una semilla para esta cuadrícula.

### Lo que este código todavía no resuelve

- No valida entradas. Una separación cero o negativa puede dejar un bucle sin terminar; tamaños o cantidades enormes también pueden agotar recursos. No conectarlo a entradas externas antes de resolverlo.
- No genera terreno, parcelas, edificios, agua ni puentes.
- Las calles son segmentos completos; todavía no existe un grafo vial con nodos en las intersecciones para calcular rutas.
- Si una dimensión no es múltiplo de la separación, no se añade automáticamente una calle en el borde final. Esa regla está por decidir y probar.
- `config` se devuelve por referencia. No asumir que el resultado sea una instantánea independiente si alguien modifica ese objeto después.
- No existen rutas de generación, almacenamiento de mapas, llamadas a Meta ni motor de catástrofes.

## 5. Próximos pasos en orden

### A. Hacer seguro el generador actual — empezar aquí

- [ ] Definir una regla de validación para dimensiones y separación: números finitos y positivos.
- [ ] Acordar un límite de trabajo: dimensiones máximas y/o cantidad máxima de calles. Una separación diminuta no debe generar millones de segmentos.
- [ ] Escribir pruebas de rechazo antes de agregar la validación. No ejecutar directamente pruebas que puedan colgar el proceso con el bucle actual sin protección.
- [ ] Rechazar entradas inválidas antes de comenzar los bucles y mantener verdes las dos pruebas existentes.
- [ ] Decidir el comportamiento de dimensiones no divisibles por la separación y de la configuración devuelta por referencia; agregar pruebas antes de cambiarlo.

### B. Pasar de calles a una ciudad mínima — C3 y G1 del checklist

- [ ] Acordar y representar parcelas o manzanas entre las calles.
- [ ] Definir edificios simples con posición, huella y altura; generar pocos y comprobar que no invadan las calles.
- [ ] Representar el terreno inicial y su elevación. Una cuadrícula de calles no equivale a un terreno plano representado como datos.
- [ ] Agregar únicamente las características aprobadas; río, puentes y relieve variable son ampliaciones, no capacidades actuales.
- [ ] Preparar un ejemplo pequeño de mapa válido e inválido con pruebas.

### C. Introducir variaciones reproducibles — G2–G4

- [ ] Agregar una semilla cuando aparezca aleatoriedad; no añadir un campo que todavía se ignore.
- [ ] Usar un generador aleatorio controlado por esa semilla, no llamadas libres a `Math.random()`.
- [ ] Conservar configuración, semilla, versión del generador y resultado aceptado.
- [ ] Probar repetición de resultados y que las variantes respeten límites y reglas espaciales.

### D. Integrar Meta — M1–M5

- [ ] Confirmar plataforma de la clave y modelo disponible sin compartir secretos.
- [ ] Acordar con quien hace el generador la estructura de parámetros que aceptará: usar los nombres reales, no duplicar contratos incompatibles.
- [ ] Preparar una conexión mínima desde el backend; realizar llamadas reales solo con autorización y límites de consumo acordados.
- [ ] Implementar automático y guiado con el mismo formato de salida validable.
- [ ] Validar la respuesta de Meta antes de llamar al generador; rechazar características no soportadas sin afirmar que se cumplieron.
- [ ] Limitar tamaño del pedido, propuestas, intentos, tiempo y costo; probar fallos sin reintentos infinitos.
- [ ] Probar el adaptador con respuestas simuladas para no depender de llamadas pagas en los tests habituales.

**No se necesita que Meta responda igual a la misma pregunta.** Lo reproducible es el mapa construido desde una propuesta aceptada y guardada, no la conversación con el modelo.

### E. API y guardado — B1–B4

- [ ] Solicitar generación y consultar estado, errores y alternativas válidas.
- [ ] Seleccionar por ID una propuesta ya generada, sin regenerarla al elegirla.
- [ ] Elegir almacenamiento y probar guardar → reiniciar servicio → recuperar el mismo mapa.
- [ ] Conservar originales al crear variantes y registrar qué cambió.

**Primer hito de producto:** un pedido automático o guiado produce alternativas válidas; se elige una, se guarda y se recupera después de reiniciar. Todo comprobable sin frontend ni catástrofe todavía.

### F. Primera catástrofe y resultados — S1–S5

- [ ] Elegir el fenómeno, los efectos iniciales y los datos necesarios.
- [ ] Comprobar compatibilidad con el mapa y validar parámetros antes de ejecutar.
- [ ] Implementar un motor separado de Fastify y Meta, con límites de trabajo y resultados honestos.
- [ ] Conservar mapa original, evento, versión y parámetros de cada ejecución.
- [ ] Probar reproducción y comparación controlada de resultados calculados.

**Segundo hito:** recuperar mapa → elegir evento compatible → simular → consultar resultados → repetir o comparar sin cambiar condiciones iniciales ajenas al experimento.

En cada paso: prueba que falla → implementación mínima → prueba que pasa → revisión y documentación. No crear interfaces, paquetes, dependencias o endpoints vacíos solo para anticipar etapas futuras.

## 6. División propuesta entre dos personas

| Persona   | Trabajo propuesto                                                                             | Punto de coordinación                               |
| --------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Juan      | Tipos, generador, validación y pruebas en `modules/cities`                                    | Qué parámetros admite realmente el generador        |
| Compañero | Confirmar servicio/modelo Meta, adaptador, pedidos y validación de respuestas en `modules/ai` | Producir el mismo contrato que consume el generador |

Es una propuesta de reparto, no una asignación confirmada. Acordar los datos de conexión antes de trabajar separados. El compañero no debe construir un segundo generador ni modificar unilateralmente los tipos. La clave permanece en el backend y fuera de Git y de los logs.

## 7. Pruebas y comandos para retomar

Desde la raíz del repositorio:

```bash
git status --short
pnpm exec vitest run apps/backend/src/test/cities/city-generator.test.ts
pnpm test
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
```

Última verificación del cambio de calles verticales en esta sesión:

- Pruebas enfocadas: **2 aprobadas**.
- Suite completa: **28 aprobadas**.
- ESLint y Prettier sobre generador y su prueba: aprobados.
- TypeScript del backend: aprobado.
- Comparación con la versión anterior: horizontales, IDs, orden y configuración conservados; entrada no modificada.

El build completo y los controles globales de lint/tipos/formato no se volvieron a ejecutar después de agregar las verticales; no confundir esas comprobaciones anteriores de la base con evidencia nueva del generador. Este MD no agrega una nueva ejecución de pruebas de código.

## 8. Estado de Git y forma de trabajar

Al preparar este documento, la rama era `main`, con cambios locales en `city.types.ts` y archivos nuevos del generador y sus pruebas. No asumir que están guardados en un commit o publicados. Revisar el estado real antes de continuar; no borrar ni reemplazar trabajo local.

El usuario quiere escribir y entender el código con ayuda paso a paso. Solo pidió implementación directa para las calles verticales. No interpretar ese pedido puntual como autorización para implementar todas las etapas siguientes. El asistente no debe hacer commits, staging, push ni publicar por su cuenta.

La dirección actual es sintética y centrada en Meta. `Ideadelproyect.md` y el [checklist general anterior](TEAM_CHECKLIST.md) contienen ideas de importar barrios reales y otros alcances: son antecedentes, no requisitos automáticos. La [arquitectura](ARCHITECTURE.md) y el README describen la base, pero pueden necesitar una actualización posterior cuando el generador se convierta en una capacidad integrada.

## 9. Texto para abrir otra sesión

> Estoy construyendo Simulicity IA. Lee `docs/PROJECT_HANDOFF.md`, `docs/BACKEND_AI_CHECKLIST.md` y el código actual antes de recomendar cambios. Queremos ciudades sintéticas pequeñas inspiradas en lugares reales, con Meta y dos modos: automático y guiado por texto. Hoy `generateCity` genera calles horizontales y verticales; falta validar configuración, después agregar edificios/terreno y conectar Meta. No trabajar en frontend. Quiero implementarlo yo con explicación paso a paso; no escribir funciones ni hacer operaciones de Git sin que lo pida. Primero revisa el estado local y ayúdame a definir las pruebas para validar tamaños y separación antes de entrar en los bucles. No pedir ni mostrar la API key.
