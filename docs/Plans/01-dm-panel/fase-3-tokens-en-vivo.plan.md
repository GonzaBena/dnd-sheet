# Plan Fase 3 — Tokens con sincronización en vivo (T-30 … T-36)

Spec: `docs/Specs/01-dm-panel.spec.md`, RF-20 a RF-23, *Arquitectura en tiempo real* y criterios de aceptación 1, 3, 5 y 7.

## 1. Contexto y objetivo

Tokens en el mapa:

- El DM los crea, los edita y los borra.
- Se arrastran con el mouse o con el dedo y se ajustan a la grilla al soltar.
- Mientras alguien arrastra, los demás ven el movimiento en vivo por RTDB, con un throttle de unos 50 ms y animación suave.
- Al soltar se hace **una sola** escritura en Firestore y después se borra el nodo `live`.
- Un jugador solo puede mover sus propios tokens, y esto lo hacen cumplir las reglas.

## 2. Prerrequisitos verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| `rtdb` en `getFirebase()` | `src/scripts/firebase/client.ts` |
| Sala RTDB `/rooms/{roomId}` (`meta.dm`, `members`, `status`, `tokenOwners`, `live`), con `ensureRoom()` y `campaign.liveRoomId` | `src/scripts/data/roomService.ts` y `database.rules.json` |
| Regla de movimiento de jugador con `lastMove` en `match /maps/{mapId}` | `grep -n "lastMove" firestore.rules` |
| Estado: `canPlay()` en las reglas, `canPerform()` en `sessionStatus.ts` y el espejo `rooms/{roomId}/status` | Fase 0B |
| `MapStageController` con `tokenLayer`, `mapService` (`subscribeMap`, `watchActiveMap`) y `geometry.ts` (`snapToGrid`) | Fase 2 |
| Tipos `Token`, `LastMove` y `MapDoc.tokens` | `src/scripts/models/map.ts` |

Si falta algo de la Fase 0, 0B o 2, ejecutar esos planes antes. Sin la regla `lastMove` y la regla RTDB de `live`, los tests de seguridad de esta fase no pueden pasar.

## 3. Decisiones vigentes

- **D1** Firebase solo pasa por `src/scripts/data/` (`mapService.ts` y `liveService.ts`). Konva se carga con `import()` dinámico en el `<script>`.
- **D2/D4** Tipos en `src/scripts/models/`, componentes `.astro` + `<script>`.
- **D7** Mover tokens, tanto el jugador como el DM, solo con `active`. Crear, editar y borrar tokens es *preparar*: se permite en `active` y en `paused`.
- **D13** El `/live/{cid}/{mid}/{tid}` de la spec es `/rooms/{roomId}/live/{mid}/{tid} = { x, y, by }`. El dueño se valida contra `/rooms/{roomId}/tokenOwners/{mid}/{tid}`, que mantiene el DM.
- **F0-1** El jugador escribe `lastMove: { tokenId, by, at }` en la misma escritura que la posición, porque la regla lo exige.
- **F0B-4** En `paused` la UI impide que el DM mueva tokens; las reglas lo bloquean de forma parcial (`lastMove`).

Decisiones propias:

- **F3-1** Posiciones en píxeles de la imagen original. La esquina superior izquierda del token es `(x, y)` y su tamaño en píxeles es `size * grid.size`.
- **F3-2** El DM también escribe `lastMove` al mover. Así el bloqueo de `paused` de F0B-4 aplica a sus movimientos legítimos.
- **F3-3** Los ids de token son `tok-${Date.now().toString(36)}${random4}`.
- **F3-4** `onDisconnect().remove()` se registra **al empezar** cada arrastre, sobre el nodo `live` de ese token. Al soltar se cancela con `onDisconnect().cancel()` después de borrar el nodo.
- **F3-5** Si una posición `live` queda sin actualizar por más de 5 s (por ejemplo, un cliente colgado), se ignora y se muestra la de Firestore. Para eso, `live` guarda solo `{x, y, by}` (la regla no admite más campos) y el receptor usa la hora local de recepción.

## 4. Modelo de datos

```ts
// map.ts (Fase 0)
export interface Token {
  name: string; x: number; y: number; size: 1 | 2 | 3 | 4;
  imageUrl?: string; color?: string;
  ownerUid: string | null; characterId?: string;
}
export interface LastMove { tokenId: string; by: string; at: number }
```

- **Firestore:** `campaigns/{cid}/maps/{mid}.tokens[tid]`, con un máximo de 200 tokens por mapa (regla `validMap`).
- **RTDB:**
  - `/rooms/{roomId}/live/{mid}/{tid} = { x, y, by }`, solo durante el arrastre.
  - `/rooms/{roomId}/tokenOwners/{mid}/{tid} = uid`, solo para los tokens con dueño.

## 5. Archivos

**Crear**
- `src/scripts/data/liveService.ts`
- `src/scripts/utils/throttle.ts`
- `src/scripts/vtt/tokens.ts`: lógica pura.
- `src/components/dm/TokenEditor.astro`: formulario de creación y edición.
- `scripts/simulate-players.mjs`
- `tests/tokens.test.mjs`
- `tests/throttle.test.mjs`
- `tests/rules/tokens_live_rules.test.mjs`, si las Fases 0 y 0B no cubrieron estos casos.

**Modificar**
- `src/scripts/data/mapService.ts`: CRUD de tokens y `commitTokenMove`.
- `src/scripts/vtt/mapStage.ts`: render y arrastre de tokens, y aplicación de posiciones `live`.
- `src/components/map/MapStage.astro`: conecta el controlador con `mapService` y `liveService`.
- `src/components/dm/DmControlGrimoire.astro`: montar `<TokenEditor />` en la sección Mapa.
- `package.json`: script `simulate` (opcional).

**Reutilizar**
- `snapToGrid` de `geometry.ts`
- `canPerform` de `sessionStatus.ts`
- `ensureRoom`
- `campaignStore.getCharactersForCampaign` y `getCampaignMembers`: para elegir dueño o personaje.
- `showForm` / `showConfirm`

## 6. Pasos por tarea

### Utilidades puras (`tokens.ts`, `throttle.ts`)

- `canMoveToken(token, viewer: { uid, isDm }, status)`. Devuelve `true` si:
  - `status === 'active'`, y
  - el viewer es DM, o `token.ownerUid === uid`.

  Es la misma condición que las reglas.
- `tokenPixelSize(token, grid)`.
- `snapTokenPosition(pos, token, grid)`: delega en `snapToGrid` y además encierra la posición dentro de la imagen.
- `resolveTokenPosition(token, live?: { x, y, receivedAt }, now)`: si hay `live` y tiene menos de 5 s, gana `live`; si no, la posición de Firestore (regla de sincronización 2 y F3-5).
- `newTokenId()`.
- `throttle(fn, ms)`: hace *leading* y *trailing*, y además `flush()` y `cancel()`.

### T-30 — CRUD de tokens (solo DM)

En `mapService.ts`:

- `addToken(cid, mid, token)`:
  1. `updateDoc(mapRef, { [\`tokens.${id}\`]: token, updatedAt })`.
  2. Si `token.ownerUid` existe, `set(rooms/{roomId}/tokenOwners/{mid}/{id}, ownerUid)`.
- `updateToken(cid, mid, id, patch)`: aplica el patch con field paths (`tokens.${id}.name`, …). Si cambia el dueño, actualiza `tokenOwners` (o lo borra si pasa a `null`).
- `removeToken(cid, mid, id)`: `deleteField()` sobre `tokens.${id}` y `remove()` de `tokenOwners` y `live` de ese token.
- `reconcileTokenOwners(cid, mid, map)`: lo ejecuta el DM al abrir el mapa. Deja `tokenOwners/{mid}` igual a los dueños de `map.tokens`.

`TokenEditor.astro`:
- Campos: nombre, tamaño (1 a 4), color (paleta de 8 colores) o URL de imagen https, dueño (select con los miembros más "Solo DM") y personaje (opcional; si se elige, se toman su nombre y su `avatarUrl`).
- Para crear, el DM elige "Nuevo token" y toca el mapa. El token se coloca con snap en el punto tocado (evento `'map-click'` del controlador).
- Al seleccionar un token, el editor se abre con sus datos y permite borrarlo, con confirmación.
- Deshabilitado si `!canPerform('dmPrepare', …)`.

### T-31 — Arrastre local con snap

En `mapStage.ts`, `renderTokens(tokens, viewer, status)`:

- Cada token es un `Konva.Group` con `id = tid`, que contiene:
  - un círculo o rectángulo redondeado con color, o un `Konva.Image` con caché por URL;
  - la etiqueta del nombre.
- Configuración:
  - `perfectDrawEnabled(false)`
  - `shadowForStrokeEnabled(false)`
  - `draggable(canMoveToken(...))`
- Diff por id: crear, actualizar o destruir solo lo que cambió, sin re-renderizar todo, para mantener 50 tokens fluidos (criterio 7).
- Eventos:
  - `dragstart`: `cancelBubble = true` para no mover el stage, sube el token arriba (`moveToTop`) y emite `'token-drag-start'`.
  - `dragmove`: emite `'token-drag-move' { tid, x, y }` en coordenadas de imagen. El grupo ya vive en coordenadas de imagen porque el stage tiene la escala.
  - `dragend`:
    1. `snapTokenPosition`.
    2. Anima con `node.to({ x, y, duration: 0.08 })` o con anime.js.
    3. Emite `'token-drag-end' { tid, x, y }`.
- Mientras se arrastra, se usa `tokenLayer.batchDraw()`. Las capas de fondo y grilla no se redibujan.

### T-32 — `liveService.ts`

- `createLivePublisher(roomId, mid, tid, uid)`. Devuelve `{ start(), move(x, y), end() }`:
  - `start()`: `onDisconnect(ref).remove()` (F3-4).
  - `move`: `throttle(set(ref, { x, y, by: uid }), 50)`.
  - `end()`: `move.cancel()`, `remove(ref)` y `onDisconnect(ref).cancel()`.
- `subscribeLive(roomId, mid, uid, cb: (tid, pos | null) => void): () => void`. Usa `onChildAdded`, `onChildChanged` y `onChildRemoved` sobre `rooms/{roomId}/live/{mid}` e **ignora** los nodos con `by === uid`.
- Se cierra al cambiar de mapa, junto con `subscribeMap`.

### T-33 — Tokens remotos animados

Por cada `(tid, pos)` remoto:

1. Si el token se está arrastrando localmente, se ignora.
2. Si no, `anime.remove(state)` y anime.js tweenea `state = { x, y }` hacia `pos` en 90 ms (`easeOutQuad`). En `update`, `node.position(state)` y `tokenLayer.batchDraw()`.
3. Cuando llega `pos === null` (nodo borrado), se deja que el snapshot de Firestore fije la posición final. Si el snapshot ya llegó, se anima hacia `resolveTokenPosition` sin `live`.

El objetivo es menos de 300 ms de retraso percibido (criterio 1): 50 ms de throttle + la red de RTDB + 90 ms de animación.

### T-34 — Al soltar: Firestore primero, después `live`

`MapStage.astro`, al recibir `'token-drag-end'`:

1. `await mapService.commitTokenMove(cid, mid, tid, x, y)`, que hace:
   ```
   updateDoc(mapRef, {
     [`tokens.${tid}.x`]: x, [`tokens.${tid}.y`]: y,
     lastMove: { tokenId: tid, by: uid, at: Date.now() },
     updatedAt: Date.now(),
   })
   ```
   Para un jugador, la regla solo deja cambiar `tokens`, `lastMove` y `updatedAt`.
2. Recién después, `publisher.end()`, que borra `live`. Este orden evita el parpadeo: el receptor ya tiene la posición final cuando desaparece la de `live`.
3. Si la escritura falla (reglas, red), el token vuelve a su posición de Firestore con animación y aparece el aviso "No se pudo mover el token".

### T-35 — Permisos de UX coherentes con las reglas

- `draggable` solo si `canMoveToken`. Si no, intentar arrastrar no hace nada (RF-23), sin mensajes que molesten.
- Cursor `grab` solo en los tokens movibles. El borde de "mi token" se resalta.
- Al llegar `session-status-changed`, se recalcula `draggable` en todos los tokens. Si alguien estaba arrastrando cuando se pausa, se cancela el arrastre (`stopDrag()`) y el token vuelve a su posición.

### T-36 — Prueba con dos navegadores y tres jugadores simulados

`scripts/simulate-players.mjs` (Node, contra los emuladores):

1. Con `firebase/auth`, crea o inicia sesión de `sim-1…3` (email y contraseña) en el emulador de Auth.
2. Con `firebase/firestore` y `firebase/database`, se conecta a los emuladores (`connectFirestoreEmulator`, `connectDatabaseEmulator`).
3. Requiere `--campaign <cid> --map <mid>`. El DM tiene que haber sumado antes a esos usuarios como miembros y creado un token para cada uno. El script imprime los uids para que el DM los asigne.
4. Cada jugador simulado "arrastra" su token en círculos: escribe `live` cada 50 ms durante 2 s y después hace `commitTokenMove` + `remove(live)`. Repite cada 5 s.
5. Con `--rogue`, además intenta mover un token ajeno y loguea el `PERMISSION_DENIED` esperado.

Si se agrega el script, en `package.json`: `"simulate": "node scripts/simulate-players.mjs"`.

## 7. Tests

**Unitarios**:
- `tests/tokens.test.mjs`:
  - `canMoveToken`: DM, dueño, ajeno, y los estados `paused` y `ended`.
  - `snapTokenPosition` con tamaños 1 a 4 y en los bordes.
  - `resolveTokenPosition`: `live` reciente, `live` vencido y sin `live`.
  - `newTokenId` es único.
- `tests/throttle.test.mjs`: *leading*, *trailing*, `flush` y `cancel`, con `mock.timers` de `node:test`.

**Reglas**, completando lo que no cubrieron las Fases 0 y 0B:
- **Firestore**:
  - El jugador mueve su token en `active` y no puede en `paused`.
  - El jugador no puede mover un token ajeno ni editando el código: se prueba con un `updateDoc` directo con `lastMove` falso o cambiando dos tokens a la vez (criterio 3).
  - El jugador no puede cambiar `name`, `size`, `ownerUid` ni `color`.
  - El jugador no puede agregar ni borrar tokens.
  - El DM en `paused` no puede escribir `lastMove`.
- **RTDB**:
  - Escribe `live` el dueño del token o el DM, solo con `active`.
  - Falla si `by` no coincide con el uid.
  - Falla con campos extra.
  - Borrar el propio nodo funciona también en `paused`, para que no queden colgados.

## 8. Verificación

1. `pnpm test`, `pnpm test:rules` y `pnpm build`.
2. Manual con dos navegadores, el DM en `/campaigns` y el jugador en `/partida`, con la partida `active`:
   1. El DM crea 3 tokens: uno del jugador, uno de otro jugador y uno "Solo DM".
   2. El jugador arrastra su token: el DM lo ve moverse fluido, con menos de 300 ms de retraso (criterio 1). Al soltar, el token se ajusta a la grilla en las dos pantallas.
   3. El jugador intenta arrastrar el token ajeno: no se mueve.
   4. Desde la consola del jugador, un `updateDoc` sobre el token ajeno devuelve `PERMISSION_DENIED`.
   5. Cerrar la pestaña del jugador **a mitad de un arrastre**: en la UI del emulador desaparece `rooms/{roomId}/live/{mid}/{tid}` (criterio 5).
   6. Recargar: los tokens quedan donde se soltaron (criterio 2).
   7. Pausar: el jugador no puede arrastrar, y si estaba arrastrando, el token vuelve.
   8. `pnpm simulate --campaign … --map …`: tres tokens moviéndose a la vez, sin errores en la consola del DM.
3. Performance (criterio 7):
   - Crear 50 tokens (botón temporal de DM o el script) y arrastrar en un celular de gama media, o con un throttle de CPU ×4 en DevTools.
   - Sin cuelgues visibles: en el panel *Performance* los frames de `dragmove` tienen que quedar por debajo de 16 ms.
4. Cuota: cada movimiento final es 1 escritura en Firestore. Confirmar en la UI del emulador que el arrastre no genera escrituras en Firestore.

## 9. Fuera de alcance
- Tokens ocultos y niebla (Fase 4).
- Tooltip con PG y condiciones, y enlace con el combate (Fase 5).
- Presencia (Fase 5).

## 10. Checklist de cierre
- [x] T-30 … T-36 marcadas en la spec.
- [x] `// DECISION:` para F3-2, F3-4 y F3-5.
- [x] Tests de reglas de Firestore y RTDB verdes. Son obligatorios para cerrar esta fase, según la spec.
- [x] Build estático OK.
