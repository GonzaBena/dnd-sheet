# Plan Fase B — Interfaz Interactiva de Descanso Corto (T-284, T-285)

Spec: `docs/Specs/10-descansos-y-recursos.spec.md`, sección 2; RF-302, RF-303, RF-304, RF-305.

---

## 1. Contexto y Objetivo

En la versión actual de la aplicación, el botón "Realizar Descanso Corto" en `RestModal.astro` y en `VitalsGrid.astro` consume de forma inmediata y fija 1 dado de golpe aplicando un promedio plano, sin dejar elegir la cantidad, sin mostrar la tirada del dado y sin permitir entrada manual para partidas con dados físicos.

Esta fase transforma el descanso corto en un **flujo táctil e interactivo**:
1. El jugador ve sus pools de Dados de Golpe disponibles (desglosados por tipo de dado en multiclase).
2. Puede tirar un dado de golpe a la vez (virtualmente o ingresando el resultado de su tirada física en mesa).
3. La interfaz suma automáticamente el modificador de Constitución y previsualiza la subida de la barra de salud en tiempo real.
4. El jugador puede detenerse en cualquier momento si ya recuperó suficiente salud, evitando malgastar dados.
5. Al presionar "Confirmar Descanso Corto", el store persiste los cambios en una única escritura atómica a Firestore y notifica el resultado.

---

## 2. Prerrequisitos Verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| Fase A completada | `src/scripts/dnd/rests.ts` y tests de `tests/rests.test.mjs` pasando al 100% |
| Modal de descanso base | `src/components/modals/RestModal.astro` |
| VitalsGrid con botones de descanso | `src/components/character/VitalsGrid.astro` (`#rest-short-btn`) |
| Store del personaje | `src/scripts/state/characterStore.ts` |

---

## 3. Decisiones Vigentes

- **FB-1 (Memoria en cliente antes de persistir):** Mientras el jugador tira dados durante el descanso corto, los dados tirados y los PG curados se acumulan en memoria local del modal. No se realizan llamadas a `saveAndNotify()` hasta que el usuario hace clic en "Confirmar Descanso Corto" (respeto de cuota Spark).
- **FB-2 (Tirada física vs. virtual):** El modal incluye una pestaña o conmutador rápido para ingresar el número del dado tirado físicamente en la mesa, sumando el bono de CON de forma automática.
- **FB-3 (Tope de salud inteligente):** Si los PG alcanzan `hp.max`, el botón de tirar dados adicionales se desactiva y se muestra un mensaje indicador ("¡Salud al 100%! No necesitas gastar más dados").
- **FB-4 (Cancelación limpia):** Si el jugador presiona "Cancelar" o cierra el modal con la `(✕)` antes de confirmar, no se gastan dados ni se modifica la salud del personaje.

---

## 4. Cambios en la UI (`RestModal.astro`)

El componente `src/components/modals/RestModal.astro` se reestructura con un diseño en dos vistas o sub-paneles:
1. **Selector inicial:** Elige entre "Descanso Corto (1 hora)" o "Descanso Largo (8 horas)".
2. **Vista activa de Descanso Corto:**
   - **Indicador de Salud:** Barra interactiva de PG con contador numérico y badge de CON (ej. `21/35 PG · CON +3`).
   - **Reserva de Dados:** Lista de botones por cada tipo de dado disponible (ej. `d10 (2 disponibles)`, `d6 (1 disponible)`).
   - **Área de Tirada:**
     - Botón principal de tirar dado (con animación de dado girando o ruleta rápida).
     - Botón / input para ingresar valor de dado físico en mesa.
   - **Registro de tiradas de la sesión:** Lista de tiradas acumuladas (ej. `Tirada #1: d10 sacó 8 + 3 (CON) = 11 PG`).
   - **Botón de acción:** "Confirmar y Descansar" (aplica curación total, resta dados gastados y recarga recursos de descanso corto).

---

## 5. Tareas a Ejecutar

- [ ] **T-284** Rediseñar `src/components/modals/RestModal.astro` para implementar el sub-flujo de Descanso Corto:
  - Selector de pools de dados de golpe disponibles.
  - Generador de tirada virtual (d6/d8/d10/d12) con cálculo de CON (`Math.max(0, roll + conMod)`).
  - Modo alternativo de ingreso de tirada física en mesa.
  - Historial dinámico de dados gastados en la sesión y previsualización interactiva de PG.
  - Bloqueo de tiradas al alcanzar `hp.max` o agotar los dados.
- [ ] **T-285** Integrar el resultado con `characterStore.ts`:
  - Método `characterStore.confirmShortRest(spentDice: SpentHitDie[])` que ejecuta la lógica pura de `rests.ts`.
  - Recarga atómica de recursos `shortRest` y expiración de efectos activos `untilRest: short`.
  - Registro descriptivo en `journalStore` y despacho de evento `short-rest-completed` con el resultado para el modal de resumen.

---

## 6. Criterios de Aceptación de la Fase

1. Al abrir el modal y seleccionar Descanso Corto, se visualizan los dados disponibles y el modificador de Constitución del personaje.
2. Tirar un dado virtual actualiza la salud acumulada sumando CON.
3. Ingresar un resultado de dado físico (ej. 6 en un d8) suma correctamente CON y acumula los PG.
4. Si el personaje alcanza su vida máxima, el modal no permite tirar más dados innecesarios.
5. Al pulsar "Confirmar", se descuentan exactamente los dados usados de la reserva, la salud del personaje se actualiza en Firestore y los recursos de descanso corto (Forma Salvaje, Segundo Aliento) se recargan.
6. Cancelar el modal no produce ningún cambio en el personaje.
