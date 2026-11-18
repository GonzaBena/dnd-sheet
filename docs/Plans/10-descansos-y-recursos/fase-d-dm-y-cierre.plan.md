# Plan Fase D — Sincronización DM, Verificación y Cierre (T-289, T-290)

Spec: `docs/Specs/10-descansos-y-recursos.spec.md`, sección 6; RF-311, RNF-300, RNF-301, RNF-302, RNF-303.

---

## 1. Contexto y Objetivo

En partidas compartidas con Dungeon Master (`/partida` y `/campaigns`), el DM cuenta con botones para ordenar descansos de grupo desde su Grimorio de Control (`DmControlGrimoire.astro`). En el sistema previo, el descanso corto decretado por el DM reiniciaba recursos pero no le permitía al jugador decidir cuántos Dados de Golpe gastar para curarse.

Esta fase final:
1. Adapta el listener en tiempo real de descansos grupales (`src/scripts/state/groupRestSync.ts`).
2. Conecta la recepción de descanso largo para ejecutar el proceso guiado y abrir el modal de resumen en los clientes de los jugadores.
3. Conecta la recepción de descanso corto para recargar recursos de fondo y desplegar un diálogo/banner invitando al jugador a tirar sus Dados de Golpe interactivos.
4. Verifica que las reglas de seguridad de Firestore (`firestore.rules`) protejan `hitDice` de escrituras no autorizadas.
5. Ejecuta la suite de verificación integral: tests unitarios (`pnpm test`), compilación estática (`astro build`) y prueba manual guiada para el cierre formal de la etapa H3.

---

## 2. Prerrequisitos Verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| Fases A, B y C completadas | Lógica pura en `rests.ts`, `RestModal.astro` y `RestSummaryModal.astro` operativos |
| Grimorio de Control del DM | `src/components/dm/DmControlGrimoire.astro` (`#grimoire-short-rest-btn`, `#grimoire-long-rest-btn`) |
| Emisor y receptor de eventos de grupo | `src/scripts/state/groupRestSync.ts` |

---

## 3. Decisiones Vigentes

- **FD-1 (Descanso corto no invasivo):** El DM no puede decidir cuántos dados de golpe gasta un jugador. Por ello, el descanso corto grupal recarga los recursos `shortRest` automáticamente y le presenta un prompt visual al jugador para que tire sus dados si lo desea.
- **FD-2 (Descanso largo grupal automático):** Al recibir la orden de descanso largo del DM, la ficha del jugador ejecuta la restauración al 100% de PG, espacios de conjuro y recuperación de dados, abriendo el `RestSummaryModal` con el título "El Dungeon Master decretó un Descanso Largo".
- **FD-3 (Reglas de Firestore inviolables):** El DM no puede modificar `hitDice` directamente; los jugadores son los únicos autorizados a modificar sus reservas de dados y recursos personales.

---

## 4. Tareas a Ejecutar

- [ ] **T-289** Adaptar `src/scripts/state/groupRestSync.ts`:
  - En descanso largo grupal (`rest === 'long'`): ejecutar `confirmLongRest()` y desplegar `RestSummaryModal`.
  - En descanso corto grupal (`rest === 'short'`): ejecutar recarga de recursos `shortRest`, expirar efectos y lanzar diálogo/aviso interactivo que ofrece abrir el selector de Dados de Golpe.
- [ ] **T-290** Verificación Integral y Cierre:
  - Añadir test de seguridad en `tests/rules/` confirmando que un usuario no puede modificar `hitDice` de otro jugador.
  - Ejecutar suite completa de tests (`pnpm test`).
  - Ejecutar compilación estática completa (`pnpm build`).
  - Prueba manual con dos navegadores/ventanas (DM en una, Jugador en otra) comprobando descanso corto con dados de golpe, descanso largo con Portento y descanso grupal.
  - Marcar las tareas de la Spec 10 y actualizar el roadmap.

---

## 5. Criterios de Aceptación de la Fase

1. Cuando el DM pulsa "Descanso Largo Grupal", el jugador conectado recibe el evento, su salud pasa al 100%, sus espacios se recargan y aparece el modal de resumen.
2. Cuando el DM pulsa "Descanso Corto Grupal", los recursos de descanso corto del jugador se recargan y aparece la invitación para gastar Dados de Golpe.
3. El jugador puede abrir el modal, tirar sus dados y confirmar su curación.
4. Las reglas de Firestore rechazan cualquier intento de escritura externa sobre `hitDice`.
5. `pnpm test` y `pnpm build` pasan al 100% en verde.
