# Plan Fase 4 — Niebla de guerra y tokens ocultos (T-40 … T-43)

Spec: `docs/Specs/01-dm-panel.spec.md`, RF-24, RF-30 y RF-31, *Decisiones de modelo* y criterio de aceptación 4.

## 1. Contexto y objetivo

- **Niebla de guerra simple, controlada por el DM.** Para los jugadores el mapa empieza cubierto y opaco. El DM revela y vuelve a cubrir rectángulos, y para él la niebla se ve semitransparente.
- **Tokens ocultos.** El DM puede ocultar un token: pasa del documento del mapa (que leen todos) a `maps/{mid}/private/dmOnly.secretTokens` (que solo lee el DM). Al revelarlo, vuelve al mapa.

Principio de la spec: lo que el jugador no debe ver nunca va en el documento del mapa.

## 2. Prerrequisitos verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| `MapDoc.fogRevealed: FogShape[]` y `DmOnly { secretTokens }` | `src/scripts/models/map.ts` |
| Regla `match /maps/{mapId}/private/{docId}`, solo DM | `firestore.rules` |
| `validMap()` con `fogRevealed.size() <= 500` | `firestore.rules` |
| Estado de partida: `isActive(cid)` en las reglas y `canPerform()` en `sessionStatus.ts` | Fase 0B |
| En las reglas, el DM en `paused` no toca `fogRevealed` (F0B-4) | `grep -n "fogRevealed" firestore.rules` |
| `MapStageController` con `fogLayer`, `renderTokens`, `mapService` (`subscribeMap`, `addToken`, `removeToken`, `reconcileTokenOwners`) y la sala RTDB con `tokenOwners` | Fases 2 y 3 |

Si falta la regla de `private/**` o el límite de niebla, agregarlos con sus tests en esta fase.

## 3. Decisiones vigentes

- **D1/D2/D4** Servicios en `src/scripts/data/`, tipos en `src/scripts/models/`, `.astro` + `<script>` y Konva con `import()` dinámico.
- **D7**:
  - Niebla: solo con la partida `active`.
  - Ocultar y revelar tokens cuenta como *preparar*: `active` y `paused`.
  - En `ended`, nada.
- **D9** Niebla con rectángulos en v1. Los polígonos son la Fase 5 (T-54), pero el tipo `FogShape` ya los admite.
- **D13** Sala RTDB `/rooms/{roomId}`. Los tokens ocultos no tienen entrada en `tokenOwners`.

Decisiones propias:

- **F4-1** `FogShape` lleva `op?: 'cover'`. Las formas se aplican **en orden**: sin `op` revelan, con `op: 'cover'` vuelven a cubrir. Así se puede "volver a cubrir" una parte sin restar geometría (`// DECISION:`). El campo sigue llamándose `fogRevealed` por compatibilidad con la spec.
- **F4-2** Botones globales:
  - "Cubrir todo" escribe `fogRevealed = []`.
  - "Revelar todo" escribe `[{ kind:'rect', x:0, y:0, w:imageWidth, h:imageHeight }]`.
  - Al llegar a 450 formas se avisa al DM que conviene "Cubrir todo" y rehacer, porque la regla corta en 500.
- **F4-3** El DM tiene **un segundo** `onSnapshot`, sobre `private/dmOnly` del mapa abierto. Los jugadores no lo tienen, porque las reglas se lo negarían. Es la única excepción a "un listener por mapa" y se justifica porque los datos secretos no pueden ir en el documento del mapa.
- **F4-4** Los tokens *visibles* que quedan bajo la niebla se ven tapados en la UI, pero sus datos llegan al navegador del jugador. Para esconder de verdad un token hay que **ocultarlo** (RF-24). Esto se documenta en la ayuda del DM.
- **F4-5** Ocultar y revelar se hacen con `writeBatch` (2 escrituras atómicas): nunca queda un token duplicado ni perdido.

## 4. Modelo de datos

```ts
// map.ts
export type FogShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; op?: 'cover' }
  | { kind: 'poly'; points: number[]; op?: 'cover' };   // poly: Fase 5
export interface DmOnly { secretTokens: Record<string, Token> }
```

- `campaigns/{cid}/maps/{mid}.fogRevealed`: en coordenadas de imagen original, con un máximo de 500 formas.
- `campaigns/{cid}/maps/{mid}/private/dmOnly`: solo el DM.

## 5. Archivos

**Crear**
- `src/scripts/vtt/fog.ts`: lógica pura.
- `src/components/dm/FogTools.astro`: barra de herramientas del DM.
- `tests/fog.test.mjs`
- `tests/rules/fog_secret_rules.test.mjs`

**Modificar**
- `src/scripts/data/mapService.ts`: `addFogShape`, `setFog`, `subscribeDmOnly`, `hideToken` y `revealToken`.
- `src/scripts/vtt/mapStage.ts`: render de la niebla, herramienta de rectángulo y render de los tokens secretos.
- `src/components/map/MapStage.astro`: conectar todo lo anterior.
- `src/components/dm/TokenEditor.astro`: botón "Ocultar" / "Revelar".
- `firestore.rules`: solo si falta algo de la sección 2.

**Reutilizar**
- `screenToMap` de `geometry.ts`
- `canPerform`
- `journalStore.addEntry`: para RF-43 "token revelado", si se quiere adelantar; si no, queda para la Fase 5.

## 6. Pasos por tarea

### Utilidades puras (`fog.ts`)

- `normalizeRect(x1, y1, x2, y2)`: devuelve `{x, y, w, h}` con ancho y alto positivos.
- `clampRectToImage(r, w, h)`.
- `isTinyRect(r, minPx = 4)`: descarta los clics accidentales.
- `appendFog(list, shape, max = 500)`: devuelve `{ list, warn: boolean, rejected: boolean }`.
- `fogOps(list)`: transforma la lista en las operaciones de dibujo en orden (`'reveal' | 'cover'`). Es testeable sin canvas.

### T-40 — Revelar y cubrir rectángulos (solo DM)

- **`FogTools.astro`**, toggle de herramienta (Ninguna, Revelar, Cubrir) y los botones "Cubrir todo" y "Revelar todo" (F4-2).
  - Deshabilitado si `!canPerform('dmPlay','dm',status)`, porque la niebla solo se permite con la partida `active`.
- **En `mapStage.ts`, con una herramienta activa**:
  1. `stage.draggable(false)`.
  2. Con `pointerdown`, `pointermove` y `pointerup` se dibuja un rectángulo de vista previa (borde punteado) en una capa auxiliar `toolLayer`.
  3. Al soltar, `normalizeRect` → `clampRectToImage`. Si no es diminuto, se emite `'fog-shape' { shape }`.
  4. Al desactivar la herramienta, se restaura el pan.
- **`mapService.addFogShape(cid, mid, current, shape)`**: `updateDoc(mapRef, { fogRevealed: appendFog(current, shape).list, updatedAt })`. Es **una sola escritura por rectángulo**, al terminar de dibujar.
- **`setFog(cid, mid, list)`**: para "Cubrir todo" y "Revelar todo".
- **Mientras la escritura viaja**, la forma se aplica localmente (optimista). Si falla, el siguiente snapshot la corrige.

### T-41 — Render diferente para el DM y el jugador

`fogLayer` (`listening: false`) contiene un único `Konva.Shape`, cuyo `sceneFunc(ctx)` hace:
1. `fillStyle = '#05070a'`; `fillRect(0, 0, imageWidth, imageHeight)`.
2. Para cada operación de `fogOps(list)`:
   - `reveal`: `globalCompositeOperation = 'destination-out'` y pinta la forma.
   - `cover`: `'source-over'` y pinta la forma con el color de la niebla.
3. Restablece `globalCompositeOperation = 'source-over'`.

Detalles:
- La capa tiene su propio canvas, así que `destination-out` no afecta al fondo.
- **Jugador**: `fogLayer.opacity(1)` (RF-31).
- **DM**: `fogLayer.opacity(0.5)`, más un toggle "Ver como jugador" que la pone en 1.
- Orden de capas: fondo, grilla, tokens, niebla. La niebla tapa los tokens, y eso es lo esperado (F4-4).
- Hay que redibujar solo `fogLayer` cuando cambia `fogRevealed`.
- La vista previa de la herramienta se dibuja en `toolLayer`, por encima de la niebla.

### T-42 — Ocultar y revelar tokens (RF-24)

En `mapService.ts`:

- **`subscribeDmOnly(cid, mid, cb)`**: `onSnapshot` de `private/dmOnly` (solo DM, F4-3). Si el documento no existe, devuelve `{ secretTokens: {} }`.
- **`hideToken(cid, mid, tid, token)`**: `writeBatch`:
  - `update(mapRef, { [\`tokens.${tid}\`]: deleteField(), updatedAt })`
  - `set(dmOnlyRef, { secretTokens: { [tid]: token } }, { merge: true })`
  - Después: `remove(rooms/{roomId}/tokenOwners/{mid}/{tid})` y `remove(live/{mid}/{tid})`.
- **`revealToken(cid, mid, tid, token)`**: `writeBatch`:
  - `update(mapRef, { [\`tokens.${tid}\`]: token, updatedAt })`
  - `update(dmOnlyRef, { [\`secretTokens.${tid}\`]: deleteField() })`
  - Después: si tiene dueño, `set(tokenOwners/…, ownerUid)`.
- **Crear un token directamente oculto**: checkbox "Crear oculto" en `TokenEditor`, que escribe solo en `dmOnly`.
- **Render en el DM**: los `secretTokens` se dibujan en `tokenLayer` con `opacity(0.45)`, un icono de ojo tachado y borde punteado.
  - El DM los puede arrastrar. Su posición se guarda en `dmOnly`, nunca en el mapa ni en `live`, para que el jugador no reciba posiciones de un token secreto.
  - `// DECISION:` en esta fase no hay vista en vivo de los tokens secretos.
- **Render en el jugador**: no existen.
- Habilitado en `active` y `paused` (`canPerform('dmPrepare', …)`).

### T-43 — Verificar con reglas que el jugador no lee `private/**`

`tests/rules/fog_secret_rules.test.mjs` (ver sección 7).

## 7. Tests

**`tests/fog.test.mjs`**:
- `normalizeRect` con arrastre hacia la izquierda y hacia arriba.
- `clampRectToImage`.
- `isTinyRect`.
- `appendFog`: aviso a las 450 formas y rechazo a las 500.
- `fogOps`: respeta el orden y `op`.

**`tests/rules/fog_secret_rules.test.mjs`**:
- **Lecturas**:
  - El jugador no puede `getDoc` de `maps/{mid}/private/dmOnly` ni hacer `getDocs` de `maps/{mid}/private` (criterio 4).
  - El DM sí puede leerlo y escribirlo.
- **Escrituras de niebla**:
  - El jugador no puede escribir `fogRevealed`.
  - El DM escribe `fogRevealed` en `active`, pero no en `paused` ni en `ended`.
  - Falla con 501 formas.
- **Ocultar y revelar**:
  - El DM oculta un token con el batch en `active` y en `paused`, pero no en `ended`.
  - Tras ocultarlo, el jugador lee el mapa y `tokens[tid]` no existe.
  - Tras revelarlo, el jugador lo ve.
- **RTDB**: el jugador no puede escribir `live` de un token oculto, porque no está en `tokenOwners`.

## 8. Verificación

1. `pnpm test`, `pnpm test:rules` y `pnpm build`.
2. Manual, con el DM y el jugador y la partida `active`:
   1. Mapa nuevo: el jugador lo ve totalmente negro. El DM lo ve con la niebla semitransparente.
   2. El DM revela un rectángulo: el jugador ve esa zona al instante, con una sola escritura en Firestore.
   3. El DM cubre una parte de esa zona: el jugador deja de verla. Recargar mantiene el estado (criterio 2).
   4. El DM oculta un token: desaparece del jugador.
   5. En la consola del jugador, el snapshot del mapa no contiene ese token, y leer `private/dmOnly` devuelve `PERMISSION_DENIED`.
   6. El DM revela el token: aparece para el jugador, que puede moverlo si es el dueño.
   7. Pausar: las herramientas de niebla quedan deshabilitadas, pero ocultar y revelar siguen activos.
   8. Terminar: todo queda deshabilitado.
3. Probar "Cubrir todo" y "Revelar todo".
4. Con 50 tokens y 100 formas de niebla, el arrastre sigue fluido. La niebla no se redibuja durante el arrastre de un token.

## 9. Fuera de alcance
- Polígonos (T-54, Fase 5).
- Iluminación dinámica y línea de visión (fuera de la v1).
- Vista en vivo del arrastre de tokens secretos.

## 10. Checklist de cierre
- [ ] T-40 … T-43 marcadas en la spec.
- [ ] `// DECISION:` para F4-1, F4-3 y F4-4.
- [ ] Tests verdes y build estático OK.
