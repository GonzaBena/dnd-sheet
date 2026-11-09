# Plan Fase 1 — Iniciativa y combate (T-10 … T-14)

Spec: `docs/Specs/01-dm-panel.spec.md`, RF-01 a RF-04 y sección *Arquitectura en tiempo real* (fila "Iniciativa y combate").

## 1. Contexto y objetivo

Es la parte que un DM más usa y valida el flujo en vivo sin canvas.

- El DM inicia un combate, agrega jugadores y monstruos con su iniciativa, ordena los turnos, avanza el turno y la ronda, y edita PG, CA y condiciones.
- Los jugadores ven el orden y su propio PG en `/partida`.
- Todo vive en un único documento `campaigns/{cid}/combat/current`, con un solo `onSnapshot` por cliente.

RF-05 (enlace con tokens) queda para la Fase 5.

## 2. Prerrequisitos verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| Tipos `Combat` y `Combatant` (con `ownerUid?` y `characterId?`) | `src/scripts/models/combat.ts` |
| Regla `match /combat/{docId}`: lectura para miembros, escritura para el DM con `canPlay()` y `combatants.size() <= 50` | `grep -n "match /combat" firestore.rules` |
| Estado de partida: `canPlay()` = `status == 'active'`, `canPerform()` en `src/scripts/vtt/sessionStatus.ts` y evento `session-status-changed` | Fase 0B |
| Página `/partida` con `#party-initiative-slot` | `src/components/party/PartyView.astro` |

Si falta `combat.ts`, crearlo con el modelo de la sección 4. Si falta la regla, agregarla tal cual y sumar sus tests. Si falta la Fase 0B, ejecutarla antes: la escritura del combate depende del estado.

## 3. Decisiones vigentes

- **D1/D2/D4** Servicio en `src/scripts/data/`, tipos en `src/scripts/models/`, componentes `.astro` + `<script>` y eventos `CustomEvent`.
- **D3** Bitácora = `campaigns/{cid}/journal`.
- **D7** El combate solo se modifica con la partida `active`. En `paused` y `ended` se ve pero no se edita.
- **D9** Monstruos con carga manual (no se usa la API de D&D 5e).
- **D11** Tests con `node:test`; las utilidades puras se importan como `.ts`.

Decisiones propias:

- **F1-1** `hiddenHp` se aplica **solo en la UI**: el documento `combat/current` lo leen todos los miembros, así que un jugador técnico podría ver los PG desde la consola. Se acepta en v1 (`// DECISION:` en `combatService.ts`). Si en el futuro hace falta secreto real, se puede mover `hp`/`maxHp` de los monstruos a `combat/private` (solo DM).
- **F1-2** El orden se guarda ya ordenado (iniciativa desc). Empates: gana el jugador sobre el monstruo; si siguen empatados, se ordena por nombre. `turnIndex` apunta al combatiente actual. Si se inserta o borra un combatiente antes del actual, se corrige `turnIndex` para que el turno no "salte".
- **F1-3** Los PG de un combatiente jugador se copian de la ficha al agregarlo (`character.hp.current`/`max`) y después son independientes. En v1 no se sincronizan con la hoja, para no escribir dos documentos por cada golpe.
- **F1-4** Cada escritura es un `setDoc` del documento completo (sin transacciones). Si gana la última escritura no hay problema, porque solo escribe el DM.

## 4. Modelo de datos

```ts
// src/scripts/models/combat.ts
export interface Combatant {
  id: string;            // aleatorio, independiente entre duplicados
  name: string;
  initiative: number;
  hp: number; maxHp: number; ac?: number;
  conditions: string[];  // claves: 'poisoned', 'stunned', …
  tokenId?: string;      // Fase 5
  isPlayer: boolean;
  hiddenHp: boolean;     // por defecto true en monstruos, false en jugadores
  ownerUid?: string;     // jugador dueño; permite "su propio HP"
  characterId?: string;
}
export interface Combat {
  active: boolean; round: number; turnIndex: number;
  combatants: Combatant[];   // ordenados (F1-2)
  updatedAt: number;
}
```

Las condiciones se toman de una lista fija en `src/scripts/vtt/conditions.ts`, con las 15 condiciones de 5e (clave en inglés y etiqueta en español). Las etiquetas pueden salir de `dndTranslations.ts` si ya existe una equivalente.

## 5. Archivos

**Crear**
- `src/scripts/vtt/initiative.ts`: lógica pura.
- `src/scripts/vtt/conditions.ts`
- `src/scripts/data/combatService.ts`
- `src/components/dm/CombatTracker.astro`
- `src/components/party/InitiativeList.astro`
- `tests/initiative.test.mjs`
- `tests/rules/combat_rules.test.mjs`, si la Fase 0 no cubrió los casos de combate.

**Modificar**
- `src/components/dm/DmControlGrimoire.astro`: montar `<CombatTracker />` como sección nueva, sin mover dados, jugadores, descansos ni bitácora.
- `src/components/party/PartyView.astro`: reemplazar `#party-initiative-slot` por `<InitiativeList />`.

**Reutilizar**
- `animateHpBar` de `src/scripts/animations/hpAnimations.ts`
- `showForm` / `showConfirm` de `src/scripts/ui/notify.ts`
- `journalStore.addEntry` / `log`
- `campaignStore.getCharactersForCampaign`
- `canPerform` de `sessionStatus.ts`

## 6. Pasos por tarea

### Utilidades puras (`initiative.ts`)

Todas devuelven un `Combat` nuevo, sin mutar el recibido:

- `sortCombatants(list)`: aplica F1-2.
- `insertCombatant(combat, c)`: inserta en orden y ajusta `turnIndex`.
- `removeCombatant(combat, id)`: ajusta `turnIndex`. Si queda vacío, `turnIndex = 0`.
- `nextTurn(combat)`: avanza el turno; al pasar del último vuelve a 0 y hace `round + 1`.
- `prevTurn(combat)`: opcional; deshace el avance.
- `duplicateCombatant(combat, id, count)`. Ejemplo: "Goblin" pasa a "Goblin 1", "Goblin 2", "Goblin 3".
  - Si el original no tenía número, se renombra a "Goblin 1".
  - Los nuevos toman el siguiente número libre.
  - Cada copia tiene `id` nuevo, `conditions` copiadas por valor y misma iniciativa, y son independientes (RF-03).
- `applyDamage(c, delta)`: limita el resultado entre `0` y `maxHp`.
- `visibleHp(c, viewer: { uid: string; isDm: boolean })`:
  - devuelve `{ hp, maxHp }` si es el DM, si es su propio combatiente (`c.ownerUid === viewer.uid`) o si `!c.hiddenHp`;
  - en otro caso devuelve `null` (RF-04).

### T-10 — `combatService.ts`

- `subscribeCombat(cid, cb: (c: Combat | null) => void): () => void`: un solo `onSnapshot` sobre `doc(db,'campaigns',cid,'combat','current')`. Devuelve la función para cancelar la suscripción y se cierra al cambiar de campaña.
- `startCombat(cid, combatants)`: escribe `{ active: true, round: 1, turnIndex: 0, combatants: sortCombatants(…) }`.
- `endCombat(cid)`: escribe `active: false` y mantiene la lista como registro.
- `saveCombat(cid, combat)`: `setDoc` con `updatedAt: Date.now()` (F1-4). Las demás funciones (`addCombatant`, `updateCombatant`, `removeCombatant`, `advanceTurn`, `duplicate`) son wrappers que aplican la utilidad pura sobre el último snapshot y llaman a `saveCombat`.
- `buildPlayerCombatants(cid)`: arma un combatiente por cada ficha de `campaignStore.getCharactersForCampaign(cid)`, con `isPlayer: true`, `ownerUid: char.userId`, `characterId`, PG copiados (F1-3), `ac: char.armorClass` y `hiddenHp: false`. La iniciativa se completa en el formulario.
- Antes de escribir se valida `canPerform('dmPlay','dm',status)`. Si no se cumple, no escribe y muestra el aviso "Partida pausada". Es solo ayuda de UI: la garantía son las reglas.

### T-11 — UI del DM (`CombatTracker.astro`)

- **Encabezado**: ronda actual, botón "Iniciar combate" (abre un formulario con los jugadores precargados para cargar la iniciativa) y botón "Terminar".
- **Lista ordenada**: el turno actual se resalta con borde ámbar (`amber-glow`). Cada fila muestra nombre, iniciativa editable, PG `actual/máx` con botones ±1/±5 y un campo de daño, CA y chips de condiciones (toggle desde un popover con la lista de `conditions.ts`). También tiene el toggle `hiddenHp`, y los botones duplicar (pide la cantidad) y quitar.
- **Agregar monstruo**: `showForm` con nombre, iniciativa, PG máx, CA y cantidad (si es mayor que 1, usa `duplicateCombatant`).
- **Botón "Siguiente turno"**: grande, también sirve en mobile.
- **Estilos**: los mismos del grimoire (`bg-[#121721]`, `border-[#222f42]`) y grid de una columna en mobile.
- **Estado de la partida**: escucha `session-status-changed` y deshabilita los controles si `!canPerform('dmPlay', …)`.

### T-12 — Vista del jugador (`InitiativeList.astro`)

- Usa `subscribeCombat(cid)`.
- Muestra el orden con el turno actual resaltado y la ronda, y los PG según `visibleHp` (RF-04). Si es `null`, muestra "—" o un estado cualitativo ("Herido", si se quiere usar después; en v1 solo "—").
- Su propio combatiente aparece destacado.
- Sin combate activo, muestra "Sin combate en curso".

### T-13 — Animaciones (anime.js)

- **Cambio de turno**: la fila nueva hace un pulso (`scale: [1, 1.03, 1]`, `boxShadow` ámbar, 400 ms) y `scrollIntoView({ block: 'nearest' })`.
- **Baja de PG**: `animateHpBar(bar, number, from, to, max)` existente. Hace falta guardar el valor previo por `id` para animar desde ahí.
- **PG en 0**: la fila se atenúa (`opacity: 0.5`).

### T-14 — Bitácora

En `startCombat` y en `endCombat` se llama a `journalStore.addEntry` con visibilidad `party`, el tag `#Combate` y:
- al iniciar, el título "Comienza el combate" y el contenido con la lista de combatientes, sin PG de los monstruos ocultos;
- al terminar, "Fin del combate (N rondas)".

La regla de `journal` exige `canPlay()`, y la partida está `active` porque el combate también lo exige.

## 7. Tests

**`tests/initiative.test.mjs`**:
- El orden y los empates (F1-2).
- `nextTurn`: avanza y, al dar la vuelta, suma la ronda.
- Insertar y quitar antes, en y después del turno actual mantiene al combatiente actual.
- `duplicateCombatant`: nombres 1, 2, 3, ids distintos, y modificar uno no altera los otros.
- `applyDamage` respeta los límites.
- `visibleHp`: DM, dueño, otro jugador, y monstruo oculto y visible.

**Reglas** (si no existen):
- El miembro lee `combat/current` y el extraño no.
- El jugador no escribe.
- El DM escribe en `active` y no en `paused` ni en `ended`.
- Falla con 51 combatientes.
- Falla un `docId` distinto de `current`.

## 8. Verificación

1. `pnpm test`, `pnpm test:rules` y `pnpm build`.
2. Manual (DM en `/campaigns`, jugador en `/partida`, partida `active`):
   1. Iniciar un combate con 2 jugadores y un "Goblin" ×3: aparecen "Goblin 1/2/3" ordenados.
   2. "Siguiente turno" hasta dar la vuelta: la ronda pasa a 2 y el jugador lo ve al instante, con el pulso.
   3. Bajar PG a un goblin: la barra se anima en el DM, y el jugador no ve sus PG (`hiddenHp`) pero sí los suyos propios.
   4. Recargar las dos pestañas: el combate sigue igual (criterio de aceptación 2).
   5. Pausar la partida: los controles quedan deshabilitados, y desde la consola del DM `setDoc` en `combat/current` falla.
   6. La bitácora `party` muestra "Comienza el combate" y "Fin del combate".
3. Cuota: unas 100 escrituras por hora. Comprobar en la UI del emulador que no hay listeners duplicados (un solo `onSnapshot` en `combat/current` por pestaña).

## 9. Fuera de alcance
- Enlace con tokens y resaltado en el mapa (RF-05, Fase 5).
- API de monstruos.
- Sincronizar los PG con la ficha.

## 10. Checklist de cierre
- [ ] T-10 … T-14 marcadas en la spec.
- [ ] `// DECISION:` para F1-1, F1-2 y F1-3.
- [ ] Tests verdes y build estático OK.
