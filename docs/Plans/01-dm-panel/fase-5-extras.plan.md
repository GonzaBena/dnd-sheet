# Plan Fase 5 — Extras (T-50 … T-55 + RF-43)

Spec: `docs/Specs/01-dm-panel.spec.md`, RF-05, RF-13, RF-14, RF-25 y RF-40 a RF-43.

## 1. Contexto y objetivo

Funciones deseables, la mayoría de prioridad **S** (RF-40 es **M**). Cada subsección es **independiente**: tiene sus propios prerrequisitos, pasos, tests y verificación, y se puede ejecutar en cualquier orden. Orden sugerido:
1. T-50 Notas
2. T-55 Combatiente ↔ token
3. T-53 Regla de medición
4. T-51 Presencia y ping
5. T-52 Handouts
6. T-54 Polígonos
7. RF-43 Bitácora

## 2. Decisiones vigentes (todas las subsecciones)

- **D1** Firebase solo pasa por `src/scripts/data/` y obtiene el SDK con `getFirebase()` de `src/scripts/firebase/client.ts`. Konva se carga con `import()` dinámico.
- **D2/D4** Tipos en `src/scripts/models/`, componentes `.astro` + `<script>` y eventos `CustomEvent` en `window`.
- **D3** `dmId`, `memberUserIds`, bitácora `campaigns/{cid}/journal` con `visibility: 'party' | 'dm' | 'player' | 'to_dm'`.
- **D7** En `active` se puede jugar y preparar. En `paused` solo preparar (notas, handouts preparados). En `ended`, solo lectura. Para la UI, usar `canPerform(action, role, status)` de `src/scripts/vtt/sessionStatus.ts`.
- **D9** 5 ft por celda.
- **D11** Tests con `pnpm test` / `pnpm test:rules`.
- **D12** Las decisiones no cubiertas por la spec se anotan con `// DECISION:`.
- **D13** RTDB bajo `/rooms/{roomId}` (`roomId = campaign.liveRoomId`), con los helpers de reglas `<DM>` = `root.child('rooms/'+$room+'/meta/dm').val() === auth.uid` y `<miembro>` = `root.child('rooms/'+$room+'/members/'+auth.uid).exists()`.

Verificación común a todas: `pnpm test`, `pnpm test:rules`, `pnpm build`, y una prueba manual con el DM en `/campaigns` y el jugador en `/partida?id=<cid>`.

---

## T-50 — Notas privadas del DM (RF-40, M)

**Prerrequisitos.**
- Tipo `DmNote` en `src/scripts/models/dmNote.ts`. Si falta, crearlo: `{ id; title; body; updatedAt }`.
- Regla `match /notes/{noteId}`: solo el DM, con `canPrepare()`. Si falta, agregarla:
  - `allow read, delete: if isDm(campaignId)`
  - `allow create, update: if isDm(campaignId) && canPrepare() && title.size() <= 120 && body.size() <= 20000`

**Archivos.**
- Crear `src/scripts/data/notesService.ts`, `src/components/dm/DmNotes.astro` y `tests/rules/notes_rules.test.mjs`.
- Montar `DmNotes` en `DmControlGrimoire.astro` como sección nueva.

**Pasos.**
1. `notesService`:
   - `subscribeNotes(cid, cb)`: `onSnapshot` de la colección, ordenado por `updatedAt desc`.
   - `createNote(cid, { title, body })`.
   - `updateNote(cid, id, patch)`.
   - `deleteNote(cid, id)`.
2. UI:
   - Lista de títulos y editor (título + `textarea`).
   - Autoguardado con *debounce* de 1,5 s y al perder el foco. Para la cuota: 1 escritura por pausa de edición, no por tecla.
   - Botón borrar con `showConfirm`.
   - En `ended`, solo lectura.
3. Las notas no se muestran nunca en `/partida`, tampoco cuando la abre el DM.

**Tests.**
- Un jugador no lee, ni lista, ni escribe notas.
- Un extraño no lee.
- El DM crea en `paused` y no en `ended`.
- Falla con `body` de más de 20.000 caracteres.

**Verificación.** El DM crea, edita y borra una nota, y la nota sigue ahí al recargar. Desde la consola del jugador, `getDocs(collection(db,'campaigns',cid,'notes'))` devuelve `PERMISSION_DENIED`.

---

## T-51a — Presencia (RF-42, S)

**Prerrequisitos.**
- `rtdb` en `getFirebase()`.
- `ensureRoom()` en `src/scripts/data/roomService.ts`, y que la campaña tenga `liveRoomId`.
- Regla RTDB `rooms/$room/presence/$uid`: escribe solo el propio uid, si es miembro o DM, y la validación `{ name, online, lastSeen }`. Si falta, agregarla como en la Fase 0.

**Archivos.** Crear `src/scripts/data/presenceService.ts` y `src/components/party/PresenceList.astro`. Montar `PresenceList` en `/partida` y en el grimoire del DM.

**Pasos.**
1. `joinPresence(roomId, uid, name)`:
   - Escucha `.info/connected`.
   - En cada conexión: `onDisconnect(ref).update({ online: false, lastSeen: serverTimestamp() })` y después `set(ref, { name, online: true, lastSeen: serverTimestamp() })`.
   - Devuelve `leave()`, que se llama en `pagehide`.
2. `subscribePresence(roomId, cb)` con `onValue` del nodo `presence`.
3. UI: avatares o nombres con un punto verde (`online`) o gris ("visto hace X min"). El punto se anima con anime.js al entrar alguien.

**Tests (RTDB).**
- El usuario escribe su propia presencia.
- No puede escribir la de otro.
- Un extraño no lee.

**Verificación.** Abrir y cerrar la pestaña del jugador: el DM lo ve pasar de conectado a desconectado en unos segundos.

## T-51b — Ping en el mapa (RF-14, S)

**Prerrequisitos.**
- Isla del mapa: `MapStageController` en `src/scripts/vtt/mapStage.ts`, con evento de clic en coordenadas de imagen (Fase 2).
- `ensureRoom()`.
- Partida `active`: el ping cuenta como jugar.

**Reglas RTDB nuevas** (`database.rules.json`, dentro de `rooms/$room`):
```jsonc
"pings": { ".read": "<miembro o DM>", "$mid": { "$pid": {
  ".write": "auth != null && (<miembro> || <DM>) && ((!newData.exists() && data.child('by').val() === auth.uid) || (!data.exists() && root.child('rooms/'+$room+'/status').val() === 'active'))",
  ".validate": "!newData.exists() || (newData.hasChildren(['x','y','by','at']) && newData.child('x').isNumber() && newData.child('y').isNumber() && newData.child('by').val() === auth.uid && newData.child('at').isNumber())"
} } }
```

**Archivos.** Crear `src/scripts/data/pingService.ts`. Modificar `mapStage.ts` y `MapStage.astro`.

**Pasos.**
1. Detectar el clic largo en `mapStage.ts`: `pointerdown` sin moverse más de 6 px durante 500 ms. Se cancela si empieza un arrastre o un pellizco.
2. `sendPing(roomId, mid, x, y, uid)`:
   - `push()` + `onDisconnect().remove()`.
   - `setTimeout(remove, 3000)`.
3. `subscribePings(roomId, mid, cb)` con `onChildAdded`: dibuja un círculo en una capa `fxLayer`. Con anime.js se anima `{ r: 0→60, opacity: 1→0 }` en 1,2 s, repetido 2 veces, del color del usuario, y después se destruye.
4. Limitar a 1 ping por segundo y por usuario en el cliente.

**Tests (RTDB).**
- El miembro pinguea en `active` y no en `paused`.
- No puede borrar el ping de otro.
- Falla si `by` no es el propio uid.

**Verificación.** Con un clic largo en el navegador A, el círculo aparece en los dos navegadores y el nodo desaparece del emulador a los 3 s.

---

## T-52 — Handouts (RF-41, S)

**Prerrequisitos.**
- Página `/partida` (`src/components/party/PartyView.astro`).
- `openModal` / `closeModal` de `src/scripts/animations/modalAnimations.ts`.
- `canPlay()` / `canPrepare()` en `firestore.rules`.

**Modelo.** `src/scripts/models/handout.ts`:
```ts
export interface Handout { id: string; kind: 'image' | 'text'; title: string; body?: string; imageUrl?: string; sentAt: number | null; createdAt: number }
```
Ruta: `campaigns/{cid}/handouts/{hid}`.

**Reglas.**
- `read`: los miembros, si `sentAt != null`, o el DM.
- `create, update, delete`: el DM.
  - Crear o editar un borrador requiere `canPrepare()`.
  - Poner `sentAt` requiere `canPlay()`.
- Validación:
  - `title` de 120 caracteres como máximo y `body` de 5000.
  - `imageUrl` `https://` de 2048 caracteres como máximo.
- `// DECISION:` el DM prepara borradores con `sentAt: null`; los jugadores no los leen hasta que se envían.

**Archivos.** Crear `src/scripts/data/handoutService.ts`, `src/components/dm/HandoutManager.astro`, `src/components/party/HandoutViewer.astro` y `tests/rules/handout_rules.test.mjs`.

**Pasos.**
1. Servicio:
   - `createHandout`, `sendHandout(id)` (que pone `sentAt = Date.now()`) y `deleteHandout`.
   - `subscribeHandouts(cid, isDm, cb)`. Los jugadores usan `where('sentAt','!=',null)`, que puede requerir un índice en `firestore.indexes.json`.
2. Jugador:
   - Cuando llega un handout con `sentAt` mayor que el último visto (guardado en `localStorage`, con `try/catch`), lo abre en un modal animado con `openModal`.
   - Una sección "Handouts" en `/partida` lista los recibidos.
3. Las imágenes van por URL (D9), sin subida de archivos.

**Tests.**
- El jugador no lee un borrador y sí uno enviado.
- El jugador no crea handouts.
- El DM envía en `active` y no en `paused`.
- El DM crea un borrador en `paused`.

**Verificación.** El DM envía un handout de imagen y en el jugador se abre el modal sin recargar.

---

## T-53 — Regla de medición (RF-13, S)

**Prerrequisitos.** `MapStageController` con `toolLayer` o capa auxiliar, `geometry.ts` (`screenToMap`) y `MapDoc.grid` (Fase 2).

**Archivos.** Crear `src/scripts/vtt/measure.ts` y `tests/measure.test.mjs`. Modificar `mapStage.ts` y agregar el botón "Regla" en la barra flotante del mapa (DM y jugadores).

**Pasos.**
1. `measureCells(a, b, grid)`:
   - Convierte los puntos a celdas: `floor((p - offset) / size)`.
   - Distancia Chebyshev `max(|dx|, |dy|)`, es decir, la regla 5/5/5 de 5e: cada diagonal cuenta 5 ft (`// DECISION:`).
   - Devuelve `{ cells, feet: cells * 5 }`.
2. Herramienta:
   - Con la regla activa, se desactiva el pan.
   - Al arrastrar se dibuja un `Konva.Arrow` y una etiqueta "N celdas · M ft" que sigue al puntero.
   - Al soltar desaparece.
3. Es local: no se sincroniza ni escribe nada (cuota cero).

**Tests.** Las distancias horizontal, vertical, diagonal y mixta, y con offset de grilla.

**Verificación.** Medir 6 casillas en diagonal: muestra "6 celdas · 30 ft".

---

## T-54 — Polígonos en la niebla (S)

**Prerrequisitos.**
- Niebla con rectángulos funcionando (Fase 4):
  - `FogShape` con `kind: 'poly'` y `op?: 'cover'`.
  - `fogOps()` en `src/scripts/vtt/fog.ts`.
  - `mapService.addFogShape`.
  - `FogTools.astro`.
  - La regla de `fogRevealed`, con 500 formas como máximo y solo en `active`.

**Archivos.** Modificar `fog.ts`, `mapStage.ts` y `FogTools.astro`. Agregar casos a `tests/fog.test.mjs`.

**Pasos.**
1. Herramienta "Polígono" (revelar o cubrir):
   - Cada clic agrega un vértice, con vista previa de las líneas.
   - Doble clic, o clic sobre el primer vértice, cierra el polígono.
   - `Esc` cancela.
   - En pantalla táctil, el botón "Cerrar polígono" reemplaza el doble clic.
2. `simplifyPolygon(points, minDist = 4)` quita los vértices casi duplicados. Hacen falta al menos 3 vértices.
3. Render: en `sceneFunc` se agrega el caso `poly`, con `beginPath`, `moveTo`/`lineTo`, `closePath` y `fill`, con la misma lógica de composición que los rectángulos.
4. Regla: no hay cambios. `points` es parte de `fogRevealed`. Opcionalmente, limitar `points.size() <= 200` no se puede iterar en las reglas, así que el límite se valida en el cliente (`// DECISION:`).

**Tests.** `simplifyPolygon`. `fogOps` con mezcla de rectángulos y polígonos.

**Verificación.** Revelar una sala irregular con un polígono: el jugador ve solo esa forma.

---

## T-55 — Combatiente ↔ token (RF-05, RF-25, S)

**Prerrequisitos.**
- Combate (Fase 1):
  - `Combatant.tokenId?` en `src/scripts/models/combat.ts`.
  - `combatService.subscribeCombat` y `updateCombatant`.
  - `visibleHp()` en `src/scripts/vtt/initiative.ts`.
- Mapa con tokens (Fase 3): `mapStage.renderTokens` y la selección de tokens.

**Archivos.**
- Modificar `CombatTracker.astro` (selector de token), `mapStage.ts` y `MapStage.astro`.
- Crear `src/components/map/TokenInfoCard.astro`.

**Pasos.**
1. Enlace:
   - En cada fila del `CombatTracker` (DM), un select "Token" con los tokens del mapa activo. Llama a `updateCombatant(..., { tokenId })`.
   - Al agregar combatientes jugadores, se autoenlaza el token cuyo `characterId` coincida.
2. **Resaltado de turno (RF-05)**:
   - `MapStage` se suscribe a `subscribeCombat` (un solo listener por pestaña: reutilizar el de `InitiativeList` o el de `CombatTracker` con un evento `combat-updated` en `window`, `// DECISION:`).
   - Cuando cambia `turnIndex`, el token enlazado hace un pulso: anillo `Konva.Circle` con anime.js sobre `{ scale, opacity }` en loop mientras dura el turno.
   - El pulso se detiene al cambiar de turno.
3. **Tarjeta del token (RF-25)**:
   - Al tocar o hacer clic sobre un token sin arrastrarlo, aparece `TokenInfoCard` junto al token, con su nombre.
   - Si el token está enlazado a un combatiente, la tarjeta muestra PG (según `visibleHp`; si devuelve `null`, no se muestran) y chips de condiciones.
   - Se cierra al tocar fuera o con `Esc`.

**Tests.** Unitario `findCombatantByToken(combat, tokenId)` y la integración de `visibleHp`, en `tests/initiative.test.mjs`.

**Verificación.**
- Con un combate y tokens enlazados, "Siguiente turno" hace latir el token correcto en las dos pantallas.
- El jugador toca un goblin oculto y ve su nombre y sus condiciones, pero no sus PG.

---

## RF-43 — Acciones relevantes en la bitácora (S)

**Prerrequisitos.**
- `journalStore.addEntry` en `src/scripts/state/journalStore.ts`.
- Regla de `journal` con `canPlay()` (Fase 0B).
- Servicios que disparan acciones relevantes:
  - `combatService` (Fase 1; ya registra inicio y fin).
  - `mapService.revealToken` (Fase 4).
  - Descansos en `DmControlGrimoire.astro` (`#grimoire-short-rest-btn`, `#grimoire-long-rest-btn`).

**Pasos.**
1. Helper `logPartyEvent(cid, title, content, tags)` en `src/scripts/data/partyLog.ts`. Llama a `journalStore.addEntry` con visibilidad `party`.
   - Solo escribe si `canPerform('dmPlay','dm',status)`.
   - En `paused` no escribe y no falla (`// DECISION:`).
2. Llamarlo desde:
   - `revealToken`, con el texto "Aparece {nombre}".
   - Los handlers existentes de descanso corto y largo, si todavía no generan una entrada `party`. **No duplicar**: primero revisar lo que ya registran los handlers actuales.
   - El cambio de mapa activo, con el texto "El grupo llega a {mapa}".

**Tests.** Unitario de `logPartyEvent` con el `journalStore` en modo local: no escribe si el estado no es `active`.

**Verificación.** Revelar un token y hacer un descanso largo: las dos líneas aparecen en la bitácora `party` de `/partida`.

---

## 3. Checklist de cierre de la fase
- [ ] T-50 … T-55 marcadas en la spec, y RF-43 anotado.
- [ ] Reglas nuevas (`notes`, `pings`, `handouts`) con tests verdes.
- [ ] Todos los `// DECISION:` anotados.
- [ ] `pnpm build` OK.
