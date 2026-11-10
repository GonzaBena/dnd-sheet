# Plan Fase C — Terminar mi turno (T-66 … T-69)

Spec: `docs/Specs/02-mesa-viva.spec.md`, sección *2. Terminar mi turno*, sección *Seguridad y reglas* (combate) y RF-70 a RF-74.

## 1. Contexto y objetivo

Hoy el combate (`campaigns/{cid}/combat/current`) lo escribe **solo el DM**: el jugador tira dados que quedan en la bitácora, pero no puede avanzar el turno. Esta fase permite que el **dueño del combatiente actual** termine su turno desde el celular:

- Una regla nueva permite al jugador avanzar **exactamente un lugar**, sin tocar nada más.
- El avance del jugador y el del DM pasan a transacción con escritura parcial, para que no se pisen.
- Botón "Terminar turno" con doble toque en la barra de turno (Fase B) y en la lista de iniciativa.

## 2. Prerrequisitos verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| `turnKey`, `peekNext`, `canEndTurn` en `initiative.ts` | Fase B, T-62: `grep -n "export function canEndTurn" src/scripts/vtt/initiative.ts` |
| `TurnNotifier.astro` con la barra de turno y `#turn-bar-actions` | Fase B, T-64 |
| `alerts.ts` (`showBanner`) | Fase B, T-63 |
| Regla actual de combate (solo DM) | `grep -n "match /combat" firestore.rules` |
| `advanceTurn` / `previousTurn` con `saveCombat` (setDoc completo) | `combatService.ts:399-418` |
| `nextTurn` avanza exactamente uno (o vuelve a 0 con ronda +1) | `initiative.ts:86` |
| Los PJ reciben `ownerUid` al iniciar el combate | `combatService.buildPlayerCombatants` y `CombatTracker.astro:1232` |

Si falta algo de la Fase B, ejecutarla antes.

## 3. Decisiones vigentes

- **D1/D4/D7/D11/D12** (ver README). Terminar turno es "jugar": solo con `active`.
- **M3** Mensajes al usuario con `alerts.ts`.
- **M4** Turno con `runTransaction` y escritura parcial.

Decisiones propias:

- **FC-1** El botón aparece solo si `canEndTurn(combat, uid)` (por `ownerUid`). La detección por `characterId` o por nombre sirve para los avisos, no para esto: las reglas no pueden validarla.
- **FC-2** Doble toque: el primer toque cambia el texto a "¿Terminar? Tocá de nuevo" durante 3 s; el segundo confirma. Sin modal, para que sea rápido en la mesa.
- **FC-3** La transacción compara `turnKey` del documento leído con la clave que vio el jugador. Si no coinciden, no escribe y muestra "El turno ya avanzó".
- **FC-4** El DM también escribe el turno con transacción y escritura parcial (`tx.update` de `turnIndex`, `round`, `updatedAt`). El resto de las escrituras del DM siguen con `saveCombat` (F1-4). Actualizar el comentario `DECISION (F1-4)` en `saveCombat` para decir que el turno es la excepción.
- **FC-5** La línea de bitácora la escribe el jugador **después** de que la transacción confirma: `party`, tag `#Combate`, título "{nombre} terminó su turno", `sessionNumber` de la campaña.

## 4. Modelo de datos

El documento de combate no cambia de forma. Solo cambia **quién** puede escribir `turnIndex`, `round` y `updatedAt`.

```ts
// combatService.ts — nuevas o modificadas
export async function endMyTurn(cid: string, expectedKey: string): Promise<'ok' | 'stale' | 'forbidden'>;
export async function advanceTurn(cid: string): Promise<void>;   // ahora con transacción
export async function previousTurn(cid: string): Promise<void>;  // ahora con transacción
```

## 5. Archivos

**Crear**
- `tests/rules/combat_turn_rules.test.mjs`

**Modificar**
- `firestore.rules`: regla de avance de turno del jugador.
- `src/scripts/data/combatService.ts`: `endMyTurn`, `advanceTurn` y `previousTurn` con transacción; comentario F1-4.
- `src/components/party/TurnNotifier.astro`: botón en `#turn-bar-actions`.
- `src/components/party/InitiativeList.astro`: botón junto al combatiente actual.
- `src/components/dm/CombatTracker.astro`: asignar dueño a combatientes agregados a mano (T-69, si falta).

## 6. Pasos por tarea

### T-66 — Regla y tests (RF-72)

En `match /combat/{docId}`, **agregar** (sin tocar la regla del DM):

```
allow update: if signedIn() && isMember(campaignId) && canPlay()
  && docId == 'current'
  && resource.data.active == true
  && resource.data.combatants[resource.data.turnIndex].ownerUid == uid()
  && request.resource.data.diff(resource.data).affectedKeys()
       .hasOnly(['turnIndex', 'round', 'updatedAt'])
  && (
    (request.resource.data.turnIndex == resource.data.turnIndex + 1
      && request.resource.data.round == resource.data.round)
    || (resource.data.turnIndex == resource.data.combatants.size() - 1
      && request.resource.data.turnIndex == 0
      && request.resource.data.round == resource.data.round + 1)
  );
```

Notas:
- Si el combatiente actual no tiene `ownerUid`, el acceso al campo hace que la regla evalúe a `false` (no lanza error para el cliente: se rechaza la escritura). Cubrirlo con un test.
- La regla del DM sigue igual: el DM puede escribir el documento completo.

Tests (`tests/rules/combat_turn_rules.test.mjs`), con un combate de 3 combatientes (jugador A con `ownerUid`, jugador B, goblin sin dueño):

| Caso | Esperado |
| --- | --- |
| A, en su turno (índice 0), avanza a 1 | ✅ |
| A, en su turno siendo el último, vuelve a 0 con ronda +1 | ✅ |
| A, en su turno, vuelve a 0 **sin** sumar ronda | ❌ |
| A avanza de 0 a 2 (salta uno) | ❌ |
| A retrocede | ❌ |
| A avanza y además cambia `combatants` (PG) | ❌ |
| A avanza cuando el turno es de B | ❌ |
| A avanza cuando el turno es del goblin (sin `ownerUid`) | ❌ |
| A avanza con la partida `paused` o `ended` | ❌ |
| A avanza con `active: false` (combate terminado) | ❌ |
| Extraño (no miembro) avanza | ❌ |
| DM escribe el documento completo con la partida `active` | ✅ (regla existente) |

### T-67 — Transacciones (RF-71, RF-73)

1. `endMyTurn(cid, expectedKey)`:
   ```ts
   await fs.runTransaction(db, async (tx) => {
     const snap = await tx.get(ref);
     const combat = snap.data() as Combat | undefined;
     if (!combat || turnKey(combat) !== expectedKey) return 'stale';
     if (!canEndTurn(combat, uid)) return 'forbidden';
     const next = peekNext(combat)!;
     tx.update(ref, { turnIndex: next.index, round: next.round, updatedAt: Date.now() });
     return 'ok';
   });
   ```
   Si devuelve `ok`, escribir la línea de bitácora (FC-5).
2. `advanceTurn(cid)` y `previousTurn(cid)` del DM: misma estructura, sin comparar la clave, con `peekNext` o la lógica de `prevTurn` y `tx.update` de los tres campos. Mantener el chequeo `checkCanPlay(cid)` previo.
3. Modo local (sin Firebase): `endMyTurn` no aplica (M5). `advanceTurn` y `previousTurn` locales siguen como hoy.
4. Actualizar el comentario `DECISION (F1-4)` de `saveCombat`.

### T-68 — Botón "Terminar turno" (RF-70, RF-71)

1. Componente de botón reutilizable (función `mountEndTurnButton(container, { cid, getKey })` en `src/scripts/ui/endTurnButton.ts`) con el doble toque de FC-2.
2. Al confirmar: deshabilitar, llamar a `endMyTurn(cid, key)` y según el resultado:
   - `ok`: nada más (la barra se oculta sola cuando llega el snapshot).
   - `stale`: `showBanner({ title: 'El turno ya avanzó', tone: 'next', timeoutMs: 2500 })`.
   - `forbidden` o error: banner de error y volver a habilitar.
3. Montarlo en `#turn-bar-actions` de `TurnNotifier`, visible solo si `canEndTurn(combat, uid)` y `canPerform('playerWrite', 'player', status)` (solo `active`).
4. En `InitiativeList.astro`, el mismo botón junto al combatiente actual, con las mismas condiciones.

### T-69 — Dueño de combatientes agregados a mano (RF-74, S)

1. Verificar el formulario de "agregar combatiente" del `CombatTracker`: hoy los PJ toman el dueño de `data-owner`, pero los combatientes manuales (compañero animal, invocación) no tienen selector.
2. Si falta: un `<select>` opcional "Controlado por", con "Nadie (DM)" y los jugadores de la campaña (`memberUserIds` con su nombre). Al editar un combatiente existente, el mismo selector.
3. Guardar `ownerUid` en el combatiente. Con eso, el aviso de turno (Fase B) y el botón funcionan para ese combatiente.

## 7. Tests

- **Reglas:** tabla de T-66.
- **Unitarios:** `peekNext` y `canEndTurn` ya se prueban en la Fase B. Agregar un caso de `turnKey` antes y después de un avance (las claves difieren).

## 8. Verificación

1. `pnpm test`, `pnpm test:rules` y `pnpm build`.
2. Manual (DM en la PC, dos jugadores en celulares, partida `active`):
   1. Turno de A: A ve "Terminar turno" en la barra; toca una vez ("¿Terminar? Tocá de nuevo"), espera 3 s y vuelve al texto normal.
   2. A toca dos veces: el turno pasa a B, todos lo ven en vivo, B recibe su aviso y en la bitácora aparece "A terminó su turno".
   3. A es el último de la ronda: al terminar, la ronda sube y el turno vuelve al primero.
   4. Concurrencia: el DM y A tocan "siguiente" y "terminar" casi a la vez → el combate avanza **un solo** lugar; uno de los dos ve "El turno ya avanzó".
   5. Pausar la partida: el botón desaparece y, desde la consola, `endMyTurn` falla.
   6. Un compañero animal con dueño asignado (T-69): su dueño ve el botón en ese turno.
   7. El DM retrocede con "turno anterior" después de que A terminó por error.

## 9. Fuera de alcance

- Acciones del turno más ricas (acción, acción adicional, movimiento).
- Que el jugador retroceda el turno.

## 10. Checklist de cierre

- [x] T-66 … T-69 marcadas en la spec.
- [x] `// DECISION:` para FC-1, FC-3 y FC-4 (y comentario F1-4 actualizado).
- [x] Tests de reglas verdes, incluidos los rechazos.
- [x] Build estático OK.
