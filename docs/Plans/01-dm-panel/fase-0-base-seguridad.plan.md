# Plan Fase 0 — Base y seguridad (T-01 … T-05)

Spec: `docs/Specs/01-dm-panel.spec.md`, secciones *Arquitectura en tiempo real*, *Modelo de datos* y *Seguridad y reglas*.

## 1. Contexto y objetivo

Preparar la base del VTT antes de exponer nada a jugadores. Hay que agregar Realtime Database (RTDB) al cliente Firebase existente, definir los tipos nuevos y escribir las Security Rules de Firestore y RTDB para mapas, tokens, combate y notas, con tests en el emulador. En esta fase no se construye UI. Es la única fase sin prerrequisitos.

Al terminar:
- `getFirebase()` devuelve `rtdb`.
- Existen los tipos `MapDoc`, `Token`, `Combat`, `Combatant` y `DmNote`.
- Existen las reglas, con tests verdes que prueban que un jugador no mueve tokens ajenos y que un extraño no lee nada.

## 2. Prerrequisitos verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| `getFirebase()` en `src/scripts/firebase/client.ts`, que devuelve `{ app, auth, db }` | `grep -n "export function getFirebase" src/scripts/firebase/client.ts` |
| Auth Google + email | `src/scripts/firebase/authService.ts` exporta `signInWithGoogle`, `signInWithEmail` y `onAuthChange` |
| `cloudSession` | `src/scripts/data/cloudSync.ts:600`, con `export const cloudSession` |
| Reglas Firestore actuales con los helpers `isMember`, `isDm`, `campaign()` y `changedKeys()` | `firestore.rules` |
| Tests de reglas | `tests/rules/firestore_rules.test.mjs`, script `test:rules` en `package.json` |

## 3. Decisiones vigentes

- **D1** Servicios en `src/scripts/data/`, con `getFirebase()`. La UI no importa `firebase/*`.
- **D2** Tipos en `src/scripts/models/`.
- **D3** Campos reales: `dmId`, `memberUserIds`, `creatorId`. Bitácora en `campaigns/{cid}/journal`. Donde la spec dice `dmUid`/`memberUids`, se lee así.
- **D5** Auth existente (Google + email). T-02 es solo verificación.
- **D11** Tests: `pnpm test` y `pnpm test:rules`.
- **D12** Las decisiones no cubiertas por la spec se anotan con `// DECISION:`.
- **D13** RTDB bajo `/rooms/{roomId}`, con un `roomId` aleatorio en `campaigns/{cid}.liveRoomId`. Las reglas de RTDB no pueden leer Firestore y los ids de campaña (`slug-xxxx`, ver `campaignStore.createCampaign`) se pueden adivinar, así que un id secreto evita que un extraño reclame la sala antes que el DM.

Decisiones propias de esta fase:

- **F0-1** Movimiento de un jugador: las reglas no pueden extraer "cuál" token cambió de `affectedKeys()`. Por eso el cliente escribe, junto a la posición, `lastMove: { tokenId, by, at }`, y la regla valida contra `lastMove.tokenId` (`// DECISION:` en `mapService`, Fase 3).
- **F0-2** El gating por estado de la partida (`active`/`paused`/`ended`) **no** entra en esta fase: lo agrega la Fase 0B. Las reglas de esta fase se escriben con un helper `canPlay(cid)` que por ahora devuelve `true`, para que 0B solo cambie su cuerpo.
- **F0-3** Límites: 200 tokens por mapa, 50 combatientes, strings de nombre de 80 caracteres como máximo, URLs de 2048, cuerpo de nota de 20.000.

## 4. Modelo de datos de la fase

`src/scripts/models/map.ts` (nuevo):

```ts
export interface GridConfig { size: number; offsetX: number; offsetY: number; visible: boolean }

export interface Token {
  name: string;
  x: number; y: number;          // unidades de la imagen original (px de imagen)
  size: 1 | 2 | 3 | 4;           // celdas por lado
  imageUrl?: string;
  color?: string;
  ownerUid: string | null;       // null = solo DM
  characterId?: string;
}

export type FogShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; op?: 'cover' }
  | { kind: 'poly'; points: number[]; op?: 'cover' };

export interface LastMove { tokenId: string; by: string; at: number }

export interface MapDoc {
  id: string;                    // = id del documento (no se guarda; se agrega al leer)
  name: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  grid: GridConfig;
  tokens: Record<string, Token>;
  fogRevealed: FogShape[];
  lastMove?: LastMove;
  updatedAt: number;
}

export interface DmOnly { secretTokens: Record<string, Token> }
```

`src/scripts/models/combat.ts` (nuevo):

```ts
export interface Combatant {
  id: string; name: string; initiative: number;
  hp: number; maxHp: number; ac?: number;
  conditions: string[];
  tokenId?: string;
  isPlayer: boolean; hiddenHp: boolean;
  ownerUid?: string;             // jugador dueño (para "su propio HP", RF-04)
  characterId?: string;
}
export interface Combat { active: boolean; round: number; turnIndex: number; combatants: Combatant[]; updatedAt: number }
```

`src/scripts/models/dmNote.ts` (nuevo): `export interface DmNote { id: string; title: string; body: string; updatedAt: number }`.

En `src/scripts/models/campaign.ts`, agregar a `Campaign`: `activeMapId?: string; liveRoomId?: string;`.

**Rutas Firestore nuevas:**
- `campaigns/{cid}/maps/{mid}`
- `campaigns/{cid}/maps/{mid}/private/dmOnly`
- `campaigns/{cid}/combat/current`
- `campaigns/{cid}/notes/{noteId}`

**RTDB:**

```
/rooms/{roomId}/meta                     = { dm: uid, cid: string }
/rooms/{roomId}/members/{uid}            = true
/rooms/{roomId}/status                   = 'active' | 'paused' | 'ended'   (lo usa la Fase 0B)
/rooms/{roomId}/tokenOwners/{mid}/{tid}  = uid
/rooms/{roomId}/live/{mid}/{tid}         = { x: number, y: number, by: uid }
/rooms/{roomId}/presence/{uid}           = { name: string, online: boolean, lastSeen: number }
```

## 5. Archivos

**Crear**
- `src/scripts/models/map.ts`, `combat.ts`, `dmNote.ts`
- `src/scripts/data/roomService.ts`: espejo RTDB de la sala
- `database.rules.json`
- `tests/rules/vtt_firestore.test.mjs` y `tests/rules/rtdb_rules.test.mjs`

**Modificar**
- `src/scripts/firebase/client.ts`: `rtdb` en `FirebaseClient`.
- `.env.example`: `PUBLIC_FIREBASE_DATABASE_URL`.
- `firebase.json`: sección `database` y emulador `database` en el puerto 9000.
- `package.json`: scripts `test:rules` y `emulators`.
- `firestore.rules`: bloques nuevos dentro de `match /campaigns/{campaignId}`.
- `src/scripts/models/campaign.ts`.
- `src/scripts/data/cloudSync.ts`: solo el hook para reconciliar la sala (T-03).
- `README.md`: variable de entorno nueva y habilitar RTDB en la consola.

## 6. Pasos por tarea

### T-01 — RTDB en el cliente
1. En `client.ts`:
   - Agregar `rtdb: Database` (`import type { Database } from 'firebase/database'`) a `FirebaseClient`.
   - Dentro del `async` existente: `const { getDatabase, connectDatabaseEmulator } = await import('firebase/database')`.
   - `const rtdb = getDatabase(app, env.PUBLIC_FIREBASE_DATABASE_URL || undefined)`.
2. En el bloque `useEmulators`: `connectDatabaseEmulator(rtdb, host, 9000)`.
3. En `firebaseConfig`, agregar `databaseURL: env.PUBLIC_FIREBASE_DATABASE_URL || ''`. Con emuladores alcanza con `http://127.0.0.1:9000?ns=demo-dnd-sheet-default-rtdb`; documentarlo en `.env.example`.
4. En `firebase.json`:
   - `"database": { "rules": "database.rules.json" }`
   - `"emulators": { …, "database": { "port": 9000 } }`
5. En `package.json`:
   - `test:rules`: `firebase emulators:exec --only firestore,database --project demo-dnd-sheet "node --test tests/rules/*.test.mjs"`
   - `emulators`: `--only auth,firestore,database`
6. En `README.md`: habilitar Realtime Database en la consola de Firebase (mismo proyecto, región por defecto) y copiar su URL a `PUBLIC_FIREBASE_DATABASE_URL`.

### T-02 — Auth y uid (verificación)
- Confirmar que `cloudSession.ready()` resuelve con el usuario logueado y que, después, `userStore.getCurrentUser().id === auth.currentUser.uid`.
- Agregar `export function getCurrentUid(): string | null` a `cloudSync.ts` (devuelve el `uid` privado de `CloudSession`), para que los servicios nuevos no dependan de `userStore`. Solo si no existe ya un equivalente.
- No se agregan métodos de login.

### T-03 — Campos de campaña y sala RTDB
`dmId` y `memberUserIds` ya existen y no hay nada que migrar en Firestore. Lo nuevo es la sala RTDB.

En `roomService.ts`:
- `ensureRoom(campaign: Campaign): Promise<string>`. Solo la ejecuta el DM.
  1. Si `campaign.liveRoomId` existe y `/rooms/{id}/meta/dm` es su uid, devuelve el id.
  2. Si no, genera un id con `push(ref(rtdb, 'rooms')).key`.
  3. Escribe primero `meta = { dm: uid, cid }` en RTDB.
  4. Después hace `campaignStore.updateCampaign(cid, { liveRoomId })`. Así queda en Firestore por el flujo existente de diff + batch.
- `syncRoomMembers(roomId, memberUserIds)`: `update()` multi-path que pone `true` a los que faltan y `null` a los que ya no están.
- Se llama desde un listener nuevo en `cloudSync` (o un `window.addEventListener('campaigns-updated', …)` en `roomService`). Se ejecuta cuando el usuario actual es el DM de la campaña activa (`campaignStore.isCurrentUserDm(cid)`), y es idempotente.
- `// DECISION:` si el jugador se une con código mientras el DM está desconectado, entra a la sala recién cuando el DM abre la app. Es aceptable: sin el DM no hay partida `active`.

### T-04 — Reglas

**Firestore**: dentro de `match /campaigns/{campaignId}`:

```
function canPlay() { return true; }              // F0-2: la Fase 0B lo reemplaza
function canPrepare() { return true; }           // F0-2

match /maps/{mapId} {
  allow read: if signedIn() && isMember(campaignId);
  allow create, delete: if signedIn() && isDm(campaignId) && canPrepare() && validMap(request.resource.data);
  // DM: todo
  allow update: if signedIn() && isDm(campaignId) && canPrepare() && validMap(request.resource.data);
  // Jugador: solo x/y de su token, identificado por lastMove (F0-1)
  allow update: if signedIn() && isMember(campaignId) && canPlay()
    && changedKeys().hasOnly(['tokens', 'lastMove', 'updatedAt'])
    && request.resource.data.lastMove.by == uid()
    && request.resource.data.tokens.diff(resource.data.tokens).affectedKeys()
         .hasOnly([request.resource.data.lastMove.tokenId])
    && resource.data.tokens[request.resource.data.lastMove.tokenId].ownerUid == uid()
    && request.resource.data.tokens[request.resource.data.lastMove.tokenId]
         .diff(resource.data.tokens[request.resource.data.lastMove.tokenId]).affectedKeys().hasOnly(['x', 'y'])
    && request.resource.data.tokens[request.resource.data.lastMove.tokenId].x is number
    && request.resource.data.tokens[request.resource.data.lastMove.tokenId].y is number;

  match /private/{docId} {
    allow read, write: if signedIn() && isDm(campaignId);
  }
}

match /combat/{docId} {
  allow read: if signedIn() && isMember(campaignId);
  allow write: if signedIn() && isDm(campaignId) && canPlay()
    && docId == 'current'
    && request.resource.data.combatants.size() <= 50;
}

match /notes/{noteId} {
  allow read, write: if signedIn() && isDm(campaignId) && canPrepare()
    && request.resource.data.title.size() <= 120
    && request.resource.data.body.size() <= 20000;
  // delete y read sin validar request.resource: separar allow read / allow delete / allow create, update
}
```

- `validMap(d)` exige:
  - `d.tokens.size() <= 200`
  - `d.name is string && d.name.size() <= 80`
  - `d.imageUrl is string && d.imageUrl.size() <= 2048`
  - `d.fogRevealed is list && d.fogRevealed.size() <= 500`
- La validación profunda de cada token no se puede iterar. Se valida el token tocado (vía `lastMove` cuando aplica) y se confía en el DM (`// DECISION:`).
- Cuidado: en `notes`, `read` y `delete` no tienen `request.resource`; separarlos de `create, update`.

**RTDB** (`database.rules.json`):

```jsonc
{
  "rules": {
    "rooms": {
      "$room": {
        // DM = meta.dm ; miembro = members/{uid}
        "meta": {
          ".read": "auth != null && (data.child('dm').val() === auth.uid || root.child('rooms/' + $room + '/members/' + auth.uid).exists())",
          // Se crea una sola vez, por quien queda como DM; el DM puede borrar la sala.
          ".write": "auth != null && ((!data.exists() && newData.child('dm').val() === auth.uid) || data.child('dm').val() === auth.uid)",
          ".validate": "!newData.exists() || (newData.hasChildren(['dm','cid']) && newData.child('cid').isString() && newData.child('cid').val().length <= 128)"
        },
        "members": {
          ".read": "<miembro o DM>",
          "$uid": { ".write": "<DM>", ".validate": "newData.val() === true" }
        },
        "status": {
          ".read": "<miembro o DM>", ".write": "<DM>",
          ".validate": "newData.isString() && newData.val().matches(/^(active|paused|ended)$/)"
        },
        "tokenOwners": {
          ".read": "<miembro o DM>",
          "$mid": { "$tid": { ".write": "<DM>", ".validate": "newData.isString()" } }
        },
        "live": {
          ".read": "<miembro o DM>",
          "$mid": { "$tid": {
            // Borrar: quien lo escribió o el DM, en cualquier estado (evita nodos colgados al pausar).
            // Escribir: partida active y (DM o dueño del token).
            ".write": "auth != null && ((!newData.exists() && (data.child('by').val() === auth.uid || <DM>)) || (root.child('rooms/' + $room + '/status').val() === 'active' && (<DM> || (<miembro> && root.child('rooms/' + $room + '/tokenOwners/' + $mid + '/' + $tid).val() === auth.uid))))",
            ".validate": "newData.hasChildren(['x','y','by']) && newData.child('x').isNumber() && newData.child('y').isNumber() && newData.child('by').val() === auth.uid",
            "$other": { ".validate": "$other === 'x' || $other === 'y' || $other === 'by'" }
          } }
        },
        "presence": {
          ".read": "<miembro o DM>",
          "$uid": {
            ".write": "auth != null && auth.uid === $uid && <miembro o DM>",
            ".validate": "!newData.exists() || (newData.hasChildren(['name','online','lastSeen']) && newData.child('name').isString() && newData.child('name').val().length <= 80 && newData.child('online').isBoolean() && newData.child('lastSeen').isNumber())"
          }
        }
      }
    }
  }
}
```

- `<DM>` = `root.child('rooms/' + $room + '/meta/dm').val() === auth.uid`.
- `<miembro>` = `root.child('rooms/' + $room + '/members/' + auth.uid).exists()`.
- RTDB no admite macros: hay que expandirlas a mano y dejar un comentario arriba del archivo explicándolas. JSON no admite comentarios: documentarlo en un `README` corto o en la cabecera de `tests/rules/rtdb_rules.test.mjs`.
- La regla de `live` exige `status === 'active'`. Hasta que la Fase 0B escriba `status`, los tests de esta fase lo siembran con `withSecurityRulesDisabled`.

### T-05 — Tipos
- Crear los archivos de la sección 4.
- Exportar solo `interface`/`type`: nada de `enum` (D11).
- `pnpm build` debe pasar.

## 7. Tests

**`tests/rules/vtt_firestore.test.mjs`**: mismo patrón que `tests/rules/firestore_rules.test.mjs`. Usa `initializeTestEnvironment` con `firestore.rules`, los usuarios `uid-dm`, `uid-player`, `uid-other` y `uid-stranger`, y siembra con `withSecurityRulesDisabled`.

Mapa sembrado con los tokens `t-player` (`ownerUid: 'uid-player'`), `t-other` (`ownerUid: 'uid-other'`) y `t-dm` (`ownerUid: null`).

- `assertSucceeds`:
  - El jugador mueve `x`/`y` de `t-player`, con `lastMove.tokenId = 't-player'`.
  - El DM edita cualquier campo.
  - El miembro lee el mapa y `combat/current`.
- `assertFails`:
  - El jugador mueve `t-other`.
  - El jugador mueve `t-player` pero con `lastMove.tokenId = 't-other'`.
  - El jugador cambia `name`, `size` u `ownerUid` de su token.
  - El jugador toca dos tokens en una sola escritura.
  - El jugador escribe sin `lastMove`.
  - El jugador cambia `fogRevealed`.
  - El jugador lee `maps/{mid}/private/dmOnly`.
  - El jugador lee o escribe `notes/*`.
  - El jugador escribe `combat/current`.
  - Un extraño lee el mapa, `combat` o `notes`.
  - El DM crea un mapa con 201 tokens.

**`tests/rules/rtdb_rules.test.mjs`**: `initializeTestEnvironment({ database: { rules: readFileSync('database.rules.json','utf8'), host: '127.0.0.1', port: 9000 } })`, con `ref`, `set` y `remove` de `firebase/database`. Sala sembrada con `meta.dm = uid-dm`, `members` con `uid-player`/`uid-other`, `status = 'active'` y `tokenOwners/m1/t-player = uid-player`.

- `assertSucceeds`:
  - El jugador escribe `live/m1/t-player = { x, y, by: uid-player }`.
  - El jugador borra su propio nodo `live`.
  - El DM escribe `live` de cualquier token.
  - El miembro lee `live`.
  - El usuario escribe su propia `presence`.
- `assertFails`:
  - El jugador escribe `live/m1/t-other`.
  - El jugador escribe con `by != auth.uid`.
  - El jugador escribe con un campo extra o con `x` string.
  - Un extraño lee `live`.
  - Un extraño crea `meta` de una sala existente.
  - El jugador escribe en `members` o en `tokenOwners`.
  - El jugador escribe la `presence` de otro.
  - Con `status = 'paused'`, el jugador escribe en `live`.

## 8. Verificación

1. `pnpm test`: los tests existentes siguen verdes.
2. `pnpm test:rules`: pasan los tests viejos y los nuevos de Firestore y RTDB.
3. `pnpm build` sin errores. `grep -r "firebase/database" dist/` no tiene que encontrar imports en el HTML; el SDK queda solo en chunks JS de cliente.
4. Manual:
   - Con `pnpm emulators` y `pnpm dev`, el DM abre `/campaigns?campaign=<id>`.
   - En la UI del emulador (`localhost:4000`) aparecen `/rooms/{roomId}/meta` y `members`, y `liveRoomId` en el documento de la campaña.

## 9. Fuera de alcance
- UI de mapa, combate o estado de la partida.
- Gating por estado: solo queda el hook `canPlay()`/`canPrepare()`.

## 10. Checklist de cierre
- [x] T-01 … T-05 marcadas en la spec.
- [x] `// DECISION:` en `roomService.ts` (D13, alta tardía de miembros) y en `firestore.rules` (F0-1).
- [x] Tests verdes y build estático OK.
