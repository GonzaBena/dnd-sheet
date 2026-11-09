# Plan Fase 0B — Vista de partida y estado de la sesión (T-06 … T-09)

Spec: `docs/Specs/01-dm-panel.spec.md`, sección *Vista de partida y estados de la sesión* y RF-50 a RF-57.

## 1. Contexto y objetivo

Hoy los jugadores solo ven su hoja. Esta fase agrega dos cosas:

1. **Estado de la partida** (`active` / `paused` / `ended`): lo controla el DM y lo hacen cumplir las Security Rules (Firestore y RTDB).
2. **Página `/partida?id=<cid>`** para todos los miembros: grupo, bitácora `party` y banner de estado, con espacios reservados para el mapa (Fase 2) y la iniciativa (Fase 1).

Cubre RF-50, RF-51, RF-52, RF-53 (ya cumplido, se verifica), RF-54, RF-55, RF-56 y RF-57.

## 2. Prerrequisitos verificables

| Debe existir (Fase 0) | Cómo comprobarlo |
| --- | --- |
| `rtdb` en `FirebaseClient` | `grep -n "rtdb" src/scripts/firebase/client.ts` |
| `src/scripts/data/roomService.ts`, con `ensureRoom()` y la sala `/rooms/{roomId}` (`meta.dm`, `members`) | Archivo y `database.rules.json` con el nodo `status` |
| `Campaign.liveRoomId?` | `src/scripts/models/campaign.ts` |
| Helpers `canPlay()` / `canPrepare()` en `firestore.rules`, devolviendo `true` | `grep -n "function canPlay" firestore.rules` |
| `pnpm test:rules` con firestore y database | `package.json` |

Si falta algo, ejecutar antes `fase-0-base-seguridad.plan.md`. El mínimo indispensable para esta fase es T-01, `ensureRoom` y los helpers.

## 3. Decisiones vigentes

- **D1/D2/D4** Servicios en `src/scripts/data/`, tipos en `src/scripts/models/`, componentes `.astro` + `<script>` y eventos `CustomEvent`.
- **D3** Bitácora = `campaigns/{cid}/journal`, que ya tiene `visibility: 'party' | 'dm' | 'player' | 'to_dm'` y la regla `canSee()`. Las entradas existentes **no** se migran: ya tienen su visibilidad, y RF-53 está cumplido.
- **D6** Estados `active | paused | ended`. Si el campo no está, vale `paused`. El valor legado `'completed'` se lee como `ended`.
- **D7** Matriz de permisos (fuente de verdad, de la spec):

| Acción | active | paused | ended |
| --- | --- | --- | --- |
| Todos: ver mapa, tokens, iniciativa, grupo, bitácora `party` | Sí | Sí | Sí |
| Jugador: mover sus tokens | Sí | No | No |
| Jugador: escribir en la partida (bitácora de campaña) | Sí | No | No |
| Dueño: modificar su hoja | Sí | Sí | Sí |
| DM: combate, bitácora, `dm_events`, mover tokens, niebla, PG/inspiración en fichas | Sí | No | No |
| DM: preparar (mapas, tokens, mapa activo, ocultar/revelar, notas) | Sí | Sí | No |
| DM: cambiar estado | Sí | Sí | Solo reabrir (→ `paused`) |

- **D8** La hoja la edita su dueño en cualquier estado. El DM toca `hp`/`inspiration` solo con `active`.
- **D10** En modo local, `/partida` muestra "Requiere iniciar sesión con cuenta".
- **D13** El espejo de estado vive en `/rooms/{roomId}/status` (el `/status/{cid}` de la spec), con `roomId = campaign.liveRoomId`.

Decisiones propias:

- **F0B-1** No hay migración de datos. Las reglas leen `campaign(cid).get('status', 'paused')`. Las campañas que hoy tienen `status: 'active'` (el default actual) **quedan iniciadas**. Las nuevas nacen en `paused`. `// DECISION:` en `campaignStore.createCampaign`.
- **F0B-2** Las líneas de cambio de estado en la bitácora llevan `systemEvent: 'status'`. Las reglas permiten al DM crearlas en cualquier estado, siempre con `visibility == 'party'`. Así se puede registrar "Partida pausada" aunque la bitácora esté bloqueada.
- **F0B-3** Unirse o abandonar la campaña y desvincular fichas **no** se bloquean por estado: son gestión de membresía, no "la partida" (`// DECISION:`).
- **F0B-4** Las reglas no pueden detectar que el DM movió un token en `paused`, porque no pueden iterar el mapa de tokens. En `paused` las reglas sí bloquean cambios del DM a `fogRevealed` y `lastMove`. El movimiento de tokens del DM en pausa se bloquea en la UI (`// DECISION:`). En `ended` el bloqueo es total.

## 4. Modelo de datos

```ts
// src/scripts/models/campaign.ts — reemplazar el tipo de status
export type SessionStatus = 'active' | 'paused' | 'ended';
export interface Campaign {
  // …campos existentes…
  status: SessionStatus;          // antes 'active' | 'paused' | 'completed'
  statusChangedAt?: number;
}

// src/scripts/models/journal.ts — agregar a JournalEntry
systemEvent?: 'status';           // F0B-2
```

RTDB: `/rooms/{roomId}/status = 'active' | 'paused' | 'ended'`. Lo escribe solo el DM; la regla ya existe desde la Fase 0.

## 5. Archivos

**Crear**
- `src/scripts/vtt/sessionStatus.ts`: utilidades puras.
- `src/scripts/data/sessionStatusService.ts`
- `src/components/dm/SessionStatusControls.astro`
- `src/components/party/StatusBanner.astro`
- `src/components/party/PartyView.astro`
- `src/pages/partida.astro`
- `tests/session_status.test.mjs`
- `tests/rules/session_status_rules.test.mjs`

**Modificar**
- `src/scripts/models/campaign.ts` y `journal.ts`.
- `src/scripts/state/campaignStore.ts`:
  - línea ~715: default `'paused'`
  - lectura remota: `normalizeStatus`
  - seeds `LEGACY_TEST_CAMPAIGNS`: se quedan en `'active'`
- `src/components/dm/DmControlGrimoire.astro`: montar los controles y deshabilitar acciones. No mover lo existente.
- `src/components/dm/DmPanelModal.astro`: el badge `#dm-campaign-status-badge` refleja el estado.
- `firestore.rules`: cuerpo de `canPlay`/`canPrepare`, `journal`, `dm_events`, `characters`, `campaigns` update y create.
- `src/pages/index.astro` y `src/pages/campaigns.astro`: link "Ver partida".
- `tests/rules/firestore_rules.test.mjs`: ajustar los casos que crean campañas con `status: 'active'` si la regla de create cambia (F0B-1).

## 6. Pasos por tarea

### T-06 — `status` en campañas y visibilidad de la bitácora
1. Cambiar el tipo (sección 4). Buscar `'completed'` en `src/` y reemplazarlo.
2. En `sessionStatus.ts`:
   - `export function normalizeStatus(raw: unknown): SessionStatus`: `'completed'` → `ended`; un valor desconocido o ausente → `paused`.
   - Usarla donde `campaignStore` arma `Campaign` desde datos remotos o locales.
3. `createCampaign`: `status: data.status || 'paused'` y `statusChangedAt: Date.now()`.
4. Bitácora: no hay que cambiar nada. Verificar con un test de reglas que un jugador no lee una entrada `dm` (ya cubierto en `firestore_rules.test.mjs`; si no, agregar el caso).

### T-07 — Controles del DM
1. `sessionStatus.ts` (puro, testeable):
   - `canTransition(from, to)`: `active↔paused`, `active|paused → ended`, `ended → paused`. Todo lo demás es `false`.
   - `type SessionAction = 'view' | 'movePlayerToken' | 'playerWrite' | 'editOwnSheet' | 'dmPlay' | 'dmPrepare' | 'changeStatus'`.
   - `canPerform(action, role: 'dm' | 'player', status)`: implementa la tabla D7 y es la única fuente que usa la UI.
   - `statusLabel(status)`: "Partida iniciada", "Partida pausada", "Partida terminada".
2. `sessionStatusService.ts`, con `setSessionStatus(cid, next): Promise<void>`:
   1. Valida `canTransition` y que el usuario sea el DM (`campaignStore.isCurrentUserDm(cid)`).
   2. `campaignStore.updateCampaign(cid, { status: next, statusChangedAt: Date.now() })`. Viaja por el diff + batch existente de `cloudSync.writeCampaignChanges`.
   3. `roomId = await ensureRoom(campaign)`, y después `set(ref(rtdb, \`rooms/${roomId}/status\`), next)`.
   4. `journalStore.addEntry({ title: statusLabel(next), content: <fecha y hora local>, tags: ['#Configuración'], sessionNumber: campaign.sessionNumber, campaignId: cid, authorName: campaign.dmName, systemEvent: 'status' })`, con visibilidad `party` (sin `isDmOnly` ni `isPlayerOnly`). Los timestamps de estas líneas dan la duración de cada sesión.
   - Además: `reconcileStatusMirror(campaign)`. Al conectarse el DM, si `/rooms/{roomId}/status` difiere de `normalizeStatus(campaign.status)`, corrige RTDB (Firestore es la fuente de verdad). Engancharlo donde `roomService` reconcilia miembros.
   - Emite `window.dispatchEvent(new CustomEvent('session-status-changed', { detail: { campaignId, status } }))`. También se emite cuando llega un snapshot de campaña con otro estado, desde `campaignStore.applyRemoteCampaigns`.
3. `SessionStatusControls.astro`:
   - Botones Iniciar, Pausar, Terminar y Reabrir, visibles según `canTransition`.
   - Terminar usa `showConfirm` de `src/scripts/ui/notify.ts`, con el texto "Terminar la partida la deja en solo lectura. No se borra nada."
   - Se monta en el banner de `DmControlGrimoire.astro`, al lado de `#grimoire-edit-session-btn`.
4. Deshabilitar en `DmControlGrimoire.astro`, escuchando `session-status-changed`:
   - con `!canPerform('dmPlay', 'dm', status)`: dados (`.grimoire-dice-btn`), hito, descansos, `.hp-btn`, inspiración y el formulario de bitácora.
   - Usar `disabled` + `aria-disabled` y un tooltip "Partida pausada".
   - En `DmPanelModal.astro`: badge `#dm-campaign-status-badge` ("En vivo", "Pausada", "Terminada") y los mismos botones.

### T-08 — Página `/partida`
1. `src/pages/partida.astro`:
   - `BaseLayout` con `<PartyView />`.
   - Sin `getStaticPaths` ni lectura de parámetros en el frontmatter.
2. `PartyView.astro` (`<script>`):
   1. Si `!isFirebaseConfigured()`, muestra el aviso D10.
   2. `await cloudSession.ready()` y `const cid = new URLSearchParams(location.search).get('id')`.
   3. Si `campaignStore.getCampaign(cid)` no existe tras cargar (`hasLoadedCampaigns()`), muestra "No sos miembro de esta partida o no existe". Las reglas ya impiden leerla.
   4. `campaignStore.setActiveCampaign(cid)`: reusa los listeners existentes (`syncCampaignListeners`, `syncJournalListeners`) para los personajes y la bitácora de la campaña.
   5. Secciones:
      - **Grupo**: `campaignStore.getCharactersForCampaign(cid)` con nombre, clase, nivel y PG.
      - **Bitácora**: `journalStore.getPublicCampaignEntries()`, más las `player` y `to_dm` propias si se quieren mostrar como "Mis notas" (RF-53).
      - **Mapa**: `<div id="party-map-slot">` con el texto "Mapa — próximamente" (lo reemplaza la Fase 2).
      - **Iniciativa**: `<div id="party-initiative-slot">` (lo reemplaza la Fase 1).
   6. Refresca con los eventos `campaigns-updated`, `character-updated` y el de cambios del `journalStore`.
3. `StatusBanner.astro`: barra fija arriba con `statusLabel(status)`.
   - Entra con anime.js (`translateY: [-40, 0]`, `opacity`, 220 ms, `easeOutCubic`, igual que `modalAnimations.ts`).
   - Hace un pulso suave en `paused` y se oculta en `active`.
   - Se reutiliza también en `/campaigns`.
4. El DM puede abrir `/partida` y ve lo mismo que un jugador: sin filtros de DM.
5. Links "Ver partida" → `/partida?id=<cid>`:
   - en las tarjetas de `index.astro`, donde se construyen las URLs a `/campaigns` (líneas ~462, 471 y 575)
   - en la cabecera de `campaigns.astro`

### T-09 — Reglas por estado y tests

En `firestore.rules`:

```
function sessionStatus(id) { return campaign(id).get('status', 'paused'); }
function isActive(id) { return sessionStatus(id) == 'active'; }
function isPreparable(id) { return sessionStatus(id) in ['active', 'paused']; }
// dentro de match /campaigns/{campaignId}:
function canPlay() { return isActive(campaignId); }
function canPrepare() { return isPreparable(campaignId); }
```

Cambios por bloque:

- **`campaigns` create**: agregar `(!('status' in request.resource.data) || request.resource.data.status == 'paused')`.
- **`campaigns` update del DM/creador**:
  - Agregar que, si `resource.data.get('status','paused') in ['ended','completed']`, solo cambie `['status','statusChangedAt']` y el nuevo valor sea `paused`.
  - Validar `request.resource.data.get('status','paused') in ['active','paused','ended']`.
  - Las reglas de unirse y abandonar no cambian (F0B-3).
- **`journal`**:
  - create, update y delete exigen `canPlay()`.
  - Excepción de create: `isDm(campaignId) && request.resource.data.get('systemEvent', '') == 'status' && request.resource.data.visibility == 'party'` (F0B-2).
- **`dm_events` create**: `&& canPlay()`.
- **`characters`**: la regla del DM sobre `hp`/`inspiration` agrega `&& isActive(resource.data.campaignId)`. La regla del dueño **no** cambia (D8). La de desvincular tampoco (F0B-3).
- **`maps`** (si ya existe, de la Fase 0):
  - DM con `canPrepare()`.
  - Jugador con `canPlay()`.
  - Además, en `paused` el DM no puede tocar `fogRevealed` ni `lastMove`: `(isActive(campaignId) || !changedKeys().hasAny(['fogRevealed','lastMove']))` (F0B-4).
- **`combat`** usa `canPlay()`; **`notes`** usa `canPrepare()`.
- **RTDB**: no hay cambios. `live` ya exige `status === 'active'`.

Tests unitarios en `tests/session_status.test.mjs`:
- `canTransition`: todos los pares.
- `normalizeStatus`: `'completed'`, `undefined` y `'foo'`.
- `canPerform`: la tabla D7 completa.

Tests de reglas en `tests/rules/session_status_rules.test.mjs`: siembra la campaña con cada estado (`active`, `paused`, `ended` y sin campo).

| Caso | active | paused | ended |
| --- | --- | --- | --- |
| Jugador lee campaña, journal `party` y personajes del grupo | ✓ | ✓ | ✓ |
| Jugador crea entrada `party` en journal | ✓ | ✗ | ✗ |
| Jugador mueve su token (si hay `maps`) | ✓ | ✗ | ✗ |
| Jugador edita su ficha | ✓ | ✓ | ✓ |
| Jugador edita la ficha de otro | ✗ | ✗ | ✗ |
| DM modifica `hp` de una ficha | ✓ | ✗ | ✗ |
| DM crea `dm_events` / entrada `dm` | ✓ | ✗ | ✗ |
| DM crea entrada con `systemEvent: 'status'` (party) | ✓ | ✓ | ✓ |
| DM crea mapa / nota (si existen) | ✓ | ✓ | ✗ |
| DM cambia `weather` de la campaña | ✓ | ✓ | ✗ |
| DM pasa `ended → paused` | — | — | ✓ |
| DM pasa `ended → active` | — | — | ✗ |
| Extraño lee cualquier cosa | ✗ | ✗ | ✗ |

Además:
- Una campaña sin `status` se comporta como `paused`.
- Una campaña con `'completed'` se comporta como `ended`.
- Después de terminar, siguen siendo legibles el mapa, el combate (si existen) y la bitácora.

## 7. Verificación

1. `pnpm test` (incluye `session_status.test.mjs`), `pnpm test:rules` y `pnpm build`.
2. Manual con dos navegadores (emuladores):
   1. El DM crea una campaña: queda en "Pausada" y aparece el banner.
   2. El jugador se une y abre `/partida?id=…`: ve el grupo y la bitácora `party`, pero no las entradas `dm`.
   3. El DM pulsa Iniciar: el banner desaparece en ambos navegadores y aparece la línea "Partida iniciada" con hora.
   4. El DM pulsa Pausar: los botones de dados, descansos y PG quedan deshabilitados. Desde la consola del jugador, un `setDoc` en `journal` es rechazado.
   5. El DM pulsa Terminar: aparece la confirmación y, después, todo queda en solo lectura, también para el DM. Pulsa Reabrir y vuelve a `paused`.
   6. En la UI del emulador, `/rooms/{roomId}/status` coincide con Firestore. Si se cambia a mano en RTDB y se recarga el panel del DM, se corrige solo.

## 8. Fuera de alcance
- Mapa, iniciativa y tokens: solo los espacios reservados.
- Presencia (Fase 5).

## 9. Checklist de cierre
- [ ] T-06 … T-09 marcadas en la spec.
- [ ] `// DECISION:` para F0B-1, F0B-3 y F0B-4.
- [ ] Tests verdes y build estático OK.
