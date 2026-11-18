# Plan Fase C — Descanso Largo, Dados Guardados y Resumen Interactivo (T-286 … T-288)

Spec: `docs/Specs/10-descansos-y-recursos.spec.md`, secciones 3, 4 y 5; RF-306, RF-307, RF-308, RF-309, RF-310, RF-312.

---

## 1. Contexto y Objetivo

El descanso largo (8 horas) restaura al aventurero por completo. Sin embargo, en el estado previo del sistema, completar un descanso largo era una acción opaca que modificaba números sin ofrecer retroalimentación clara de qué cambió ni dar soporte a personajes multiclase para elegir qué dados de golpe recuperar. Además, dotes y rasgos icónicos de 5e como **Portento (Portent)** del Mago de Adivinación (que exige tirar 2 o 3 dados d20 en cada descanso largo y guardarlos) no estaban implementados de forma interactiva.

Esta fase implementa:
1. El **flujo guiado de Descanso Largo** en `RestModal.astro` con desglose previo y selector de recuperación multiclase de dados de golpe.
2. La tirada automática o manual de **dados guardados (Portento)** al culminar el descanso largo.
3. El **widget interactivo de Dados de Portento** en la hoja de personaje para inspeccionar los valores disponibles y gastarlos en sustitución de tiradas.
4. El nuevo modal de **Resumen Interactivo del Descanso (`RestSummaryModal.astro`)**, que desglosa de manera visual y táctica todo lo recuperado y los efectos expirados.

---

## 2. Prerrequisitos Verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| Fase A y Fase B completadas | `src/scripts/dnd/rests.ts`, `RestModal.astro` interactivo |
| Estructuras de resultados | `src/scripts/models/rest.ts` (`LongRestResult`) |
| Recursos con `values` y `dieType` | `src/scripts/models/resource.ts` |
| Sección de recursos en la hoja | `src/components/character/ResourcesSection.astro` |

---

## 3. Decisiones Vigentes

- **FC-1 (Previsualización de Descanso Largo):** Antes de confirmar el descanso largo, el modal muestra explícitamente qué facultades y cuántos PG se recuperarán.
- **FC-2 (Asignación multiclase de Dados de Golpe):** El sistema calcula la cuota máxima permitida `Math.max(1, Math.floor(char.hitDice.total / 2))` y preselecciona los dados mayores. Si el jugador desea cambiar la asignación (ej. prefiere recuperar 1d8 en lugar de 1d10), botones `+` y `-` le permiten redistribuir la cuota sin superar el límite de reglas.
- **FC-3 (Generación de Portento):** Si el personaje tiene un recurso con `dieType: 'd20'` y `rechargeOn: 'longRest'`, el descanso largo genera las tiradas para el nuevo día y las guarda en `resource.values`.
- **FC-4 (Resumen Táctico de Reposo):** Tanto el descanso corto como el descanso largo culminan desplegando `RestSummaryModal.astro`, ofreciendo al jugador certeza absoluta de su nuevo estado de combate.

---

## 4. Archivos a Crear y Modificar

**Crear:**
- `src/components/modals/RestSummaryModal.astro`: Modal de resumen post-descanso con diseño temático oscuro y acentos dorados.

**Modificar:**
- `src/components/modals/RestModal.astro`: Integrar vista de descanso largo con selector multiclase y trigger de Portento.
- `src/scripts/state/characterStore.ts`: Método `confirmLongRest(options)` que devuelve `LongRestResult` y persiste en una sola escritura.
- `src/components/character/ResourcesSection.astro`: Renderizar chips de dados guardados con valor numérico y botón de gasto táctico.

---

## 5. Tareas a Ejecutar

- [ ] **T-286** Implementar en `RestModal.astro` el panel de Descanso Largo:
  - Muestra recuperación al 100% de PG y reinicio de espacios de conjuro 1–9.
  - Indicador de Dados de Golpe a recuperar con asignación sugerida y controles `+`/`-` para personajes multiclase.
  - Sección de tirada de Portento si el personaje cuenta con dicho rasgo.
- [ ] **T-287** Crear `src/components/modals/RestSummaryModal.astro`:
  - Recibe los datos del resultado (`ShortRestResult` o `LongRestResult`).
  - Tarjetas visuales de: Salud recuperada, Dados de Golpe, Espacios de conjuro, Recursos recargados, Efectos expirados y Nuevos dados guardados.
  - Botón de cierre primario "Continuar la Aventura".
  - Registro sincronizado en `journalStore` de la campaña.
- [ ] **T-288** Implementar en `ResourcesSection.astro` la visualización y acción de Dados Guardados:
  - Muestra dados como badges táctiles con su valor (ej. `[16]`, `[4]`).
  - Botón de acción para utilizar el dado, restándolo de `values` y registrando el uso en la bitácora.

---

## 6. Criterios de Aceptación de la Fase

1. Un personaje con 5/30 PG que confirma Descanso Largo pasa a 30/30 PG y sus espacios de conjuro gastados quedan en 0.
2. Un personaje multiclase con 3d10 (1 disponible) y 3d6 (0 disponibles) tiene cuota de recuperar 3 dados; puede asignar recuperar 2d10 y 1d6 o 1d10 y 2d6 libremente.
3. Si el personaje tiene el rasgo de Portento, se generan y muestran sus 2 (o 3) tiradas de d20 para el día.
4. Al culminar el descanso, se abre automáticamente el modal de Resumen Interactivo con todos los detalles ordenados.
5. El jugador puede gastar un dado de Portento desde la ficha y su valor se descuenta de los disponibles.
