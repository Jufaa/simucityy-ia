# Backend e IA: ciudades sintéticas y catástrofes

**Objetivo:** generar una ciudad pequeña y sencilla desde cero, inspirada en características de lugares reales, elegir una propuesta y después seleccionar una catástrofe para simularla.

Este checklist contiene trabajo futuro de backend, IA, generación y simulación. No incluye tareas de frontend ni autoriza implementar todo de una vez. Cada casilla se completa con su resultado comprobado, no por crear carpetas o interfaces vacías.

Para implementar cada parte con ejemplos y resultados esperados, seguir la [guía práctica paso a paso](BACKEND_STEP_BY_STEP.md).

## Punto de partida

- [x] Backend Fastify en `apps/backend` con `/health`, configuración, CORS y errores básicos.
- [x] Contrato de salud con Zod en `packages/shared`.
- [x] Herramientas y pruebas de la base configuradas.
- [x] Tipos iniciales y generador de calles horizontales/verticales, con dos pruebas enfocadas.

El generador actual solo produce una cuadrícula de segmentos de calles: todavía no valida entradas ni genera terreno o edificios. No existen una ciudad completa, integración con Meta, almacenamiento de escenarios ni motor de catástrofes. La API key no equivale a una integración funcionando. El [estado de continuación](PROJECT_HANDOFF.md) detalla el código, las limitaciones y el siguiente paso recomendado.

## Experiencia acordada

| Modo       | Entrada                                            | Responsabilidad de la IA                                                       |
| ---------- | -------------------------------------------------- | ------------------------------------------------------------------------------ |
| Automático | Solicitar una ciudad sin describir características | Elegir características dentro de los límites admitidos y proponer alternativas |
| Guiado     | Describir la ciudad deseada en texto               | Interpretar lo solicitado y convertirlo en características admitidas           |

Ejemplo guiado: «Una ciudad pequeña, con un río en el centro, dos puentes y edificios bajos».

Las características no requieren controles manuales: las elige la IA o las obtiene del pedido. Ambos modos utilizan el mismo generador y las mismas validaciones. «Generar libremente» no significa permitir tamaño ilimitado ni elementos que el sistema todavía no soporte.

**Recorrido:** solicitud → propuesta estructurada de Meta → generación → validación → alternativas válidas → selección y guardado → elección de catástrofe → simulación y resultados.

La IA propone; el generador construye los datos del mapa; el backend organiza y valida; el motor calcula los efectos. Una imagen generada no sustituye al mapa simulable.

## 1. Acordar el alcance inicial

- [ ] **D1 — Delimitar la ciudad pequeña.** Acordar área, máximo de entidades y complejidad inicial. Las dimensiones exactas siguen pendientes; establecer límites después de una prueba pequeña de rendimiento.
- [ ] **D2 — Elegir las características iniciales admitidas.** Definir qué podrá variar la IA: terreno, calles, edificios y, si se aprueban, agua o puentes. No prometer características todavía no implementadas.
- [ ] **D3 — Definir las referencias reales.** Elegir tipologías y ejemplos de inspiración, sin presentar la ciudad sintética como una reproducción exacta. Importar una ciudad real completa no es un requisito inicial.

**Salida:** una descripción breve de qué ciudad puede generar la primera versión y qué queda fuera.

## 2. Definir el contrato de generación y del mapa

- [ ] **C1 — Definir la solicitud común.** Incluir modo automático/guiado, descripción cuando corresponda y límites del sistema. Acordar qué hacer ante pedidos ambiguos o fuera de alcance.
- [ ] **C2 — Definir la propuesta de IA.** Describir características y parámetros mediante datos estructurados; no permitir que el modelo envíe código para ejecutar.
- [ ] **C3 — Definir el mapa simulable.** Acordar límites espaciales, coordenadas y unidades, terreno, calles/conexiones, edificios y elementos opcionales aprobados. Agregar contratos compartidos solo cuando tengan consumidores reales.
- [ ] **C4 — Separar mapa, evento y ejecución.** Identificar cada mapa y su versión; la catástrofe y sus parámetros se eligen después. Ejecutar o cambiar un evento no debe regenerar ni modificar el mapa original.

**Salida:** ejemplos pequeños válidos e inválidos, con pruebas de aceptación del contrato. Empezar por el ejemplo antes de crear muchos modelos anticipados.

## 3. Construir el generador procedural

- [ ] **G1 — Generar una primera ciudad desde parámetros conocidos.** Construir datos de terreno, calles y edificios sin necesitar todavía una llamada a Meta. Esto prueba que el generador funciona por sí mismo.

  Estado parcial: cuadrícula de calles implementada y probada. Validación, terreno y edificios pendientes; G1 todavía no está completo.

- [ ] **G2 — Incorporar las variaciones aprobadas.** Agregar cada característica con sus reglas y pruebas; no intentar todos los tipos de ciudad simultáneamente.
- [ ] **G3 — Comprobar coherencia.** Validar posiciones y geometrías, conexiones viales y cruces de agua si existen. Señalar sectores aislados y limitaciones; no corregir o eliminar silenciosamente características solicitadas.
- [ ] **G4 — Hacer reproducible el mapa.** Conservar parámetros, semilla y versión del generador. Probar que esas mismas entradas reconstruyan el mismo resultado y guardar el mapa generado para recuperarlo sin volver a consultar a la IA.

**Salida:** un mapa válido, reproducible y utilizable desde pruebas, sin depender de una visualización.

## 4. Integrar Meta como proveedor de IA

- [ ] **M1 — Confirmar el servicio y modelo disponibles.** Identificar la plataforma de Meta que emitió la clave y el acceso real de la cuenta. Meta ya es el proveedor previsto; no hace falta abrir una comparación genérica de proveedores.
- [ ] **M2 — Configurar una conexión mínima desde el backend.** Mantener la clave fuera del código, los logs y Git. Probar una llamada con el servicio/modelo confirmados y autorización para usar la cuenta; no registrar secretos.
- [ ] **M3 — Implementar ambos modos.** En automático, Meta elige características dentro de los límites; en guiado, interpreta el pedido. Responder con la misma estructura C2 y fijar una cantidad máxima pequeña de propuestas por solicitud.
- [ ] **M4 — Validar antes de generar.** Rechazar respuestas mal formadas, valores fuera de rango y características no soportadas. Si el pedido no puede cumplirse, devolver una explicación o solicitar aclaración, sin afirmar que se cumplió.
- [ ] **M5 — Controlar consumo y fallos.** Limitar longitud del pedido, cantidad de propuestas/intentos, tiempo de espera y presupuesto. Probar claves no válidas, límites del proveedor y respuestas incompletas sin repetir llamadas indefinidamente.

**Salida:** pedidos automáticos y guiados producen propuestas verificables que el generador puede convertir en mapas válidos.

**Reproducibilidad:** no se exige que Meta responda igual al repetir una pregunta. Se conserva la propuesta aceptada y se reproduce el mapa desde sus datos, semilla y versión.

## 5. Exponer y guardar el recorrido desde la API

- [ ] **B1 — Solicitar generación y consultar su estado.** Acordar contratos de solicitudes, identificadores, estados, resultados y errores. Distinguir propuesta de IA, mapa generado y solicitud fallida; no informar éxito antes de validar el resultado.
- [ ] **B2 — Consultar alternativas y elegir una.** Devolver mapas válidos con ID y resumen de sus características. Seleccionar por ID sin otra llamada que regenere o cambie el mapa elegido.
- [ ] **B3 — Acordar y probar el almacenamiento.** Definir qué conservar de las propuestas, mapas y configuración. Elegir archivos o base de datos según la necesidad; comprobar que guardar y recuperar mantiene el mismo contenido después de reiniciar el servicio.
- [ ] **B4 — Crear variantes sin perder el original.** Relacionar cada variante con su mapa base y los cambios solicitados. No sobrescribir una ciudad al generar otra propuesta.

**Primera entrega completa:** solicitar → generar alternativas válidas → elegir → guardar → reiniciar el servicio → recuperar el mismo mapa. Debe probarse sin frontend y sin simular todavía una catástrofe.

## 6. Agregar la primera catástrofe

- [ ] **S1 — Elegir un fenómeno y sus efectos iniciales.** La primera catástrofe todavía está por acordar. Definir los datos que necesita, sus parámetros y las limitaciones del modelo; adaptar el contrato y generador si falta información.
- [ ] **S2 — Validar compatibilidad y parámetros.** Ofrecer únicamente fenómenos implementados y compatibles con el mapa. Rechazar datos insuficientes sin inventarlos ni alterar el mapa.
- [ ] **S3 — Construir y conectar un único motor.** Separar cálculos de la API y de Meta. Limitar el trabajo y representar cancelación/fallo cuando corresponda; la IA no calcula ni inventa daños o métricas.
- [ ] **S4 — Guardar resultados reproducibles.** Vincular cada ejecución al mapa/versiones, parámetros del evento y semilla que corresponda. Verificar que una ejecución no modifique las condiciones iniciales.
- [ ] **S5 — Comparar condiciones controladas.** Repetir un evento o variar un parámetro sobre el mismo mapa; identificar qué cambió y mostrar únicamente diferencias calculadas por el motor.

**Segunda entrega completa:** recuperar mapa → elegir catástrofe compatible → configurar → ejecutar → consultar resultados → repetir o comparar con cambios identificados.

## 7. Cerrar cada tarea con pruebas y documentación

- [ ] **Q1 — Probar el contrato y sus rechazos.** Cubrir entradas válidas, inválidas y fuera de alcance mediante la interfaz pública de cada entrega, sin guardar datos parciales como exitosos.
- [ ] **Q2 — Probar IA y generador por separado.** Usar respuestas controladas de Meta en pruebas automatizadas; las pruebas habituales no deben depender de llamadas pagas. Mantener una comprobación real de integración separada.
- [ ] **Q3 — Documentar cada operación disponible.** Incluir ejemplos de entrada, respuesta y errores, límites y forma de ejecutarla localmente. No registrar rutas vacías para funciones futuras.
- [ ] **Q4 — Ejecutar las comprobaciones del repositorio.** Conservar las pruebas de salud existentes y verificar formato, lint, tipos, tests y build. Registrar cualquier comprobación pendiente o fallida.

## Qué no construir todavía

Frontend, mapas meramente ilustrativos como sustituto del escenario, ciudades enormes, reproducción exacta de lugares reales, varias catástrofes simultáneas, predicción científica certificada, usuarios/login, despliegue público y agente que optimice intervenciones automáticamente. Son decisiones posteriores, no requisitos de esta primera entrega.

La población y evacuación se incorporan solo si se acuerdan como efectos de S1; no son una obligación anticipada del generador de ciudades.

## Cómo empezar

1. Resolver **D1–D2** con un alcance pequeño y escribir el primer ejemplo de **C1–C3**.
2. Validar ese ejemplo y construir **G1** con parámetros conocidos y una semilla.
3. Confirmar el servicio/modelo de Meta en **M1** mientras se prepara el generador; después conectar ambos mediante C2.
4. Completar la primera entrega de **B1–B3** antes de empezar el motor de catástrofes.

Este documento recoge la dirección de ciudades sintéticas y Meta acordada en la conversación. La [arquitectura actual](ARCHITECTURE.md) describe código existente; el [checklist general anterior](TEAM_CHECKLIST.md) incluye otras líneas de producto que no deben asumirse como requisitos de este alcance. La guía de [backend](../apps/backend/README.md) documenta la API disponible hoy.
