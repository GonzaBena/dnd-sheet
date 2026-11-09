# Plan Fase D — Susurros del DM (T-80 … T-83)

Spec: `docs/Specs/02-mesa-viva.spec.md`, sección *3. Susurros del DM*, sección *Seguridad y reglas* (bitácora) y RF-80 a RF-84.

## 1. Contexto y objetivo

Hoy existe el camino jugador → DM (`visibility: 'to_dm'`). Falta el inverso: que el DM le escriba a uno o más jugadores algo que solo ellos ven. Esta fase agrega la visibilidad `to_player` con destinatarios, sus reglas, las consultas para recibirlos y la UI de los dos lados, con aviso en el celular del destinatario y marca de leído.

## 2. Prerrequisitos verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| `alerts.ts` (`showBanner`, `buzz`, `chime`) | Fase B, T-63 |
| Visibilidad derivada de banderas | `journalStore.ts:25` (`getEntryVisibility`) y `:33` (`withVisibility`): `isDmOnly`, `isForDm`, `isPlayerOnly` |
| Escritura de bitácora | `cloudSync.ts` `writeJournalEntry` (~571): ajusta la visibilidad según el rol y hace `setDoc` |
| Lectura de bitácora | `cloudSync.ts` `syncJournalListeners` (~384): una consulta por visibilidad (`party`, `player`, `dm`, `to_dm`) |
| Reglas de bitácora | `firestore.rules:107` (`canSee`, `validVisibility`, `create`, `update`, `delete`) |
| Índices | `firestore.indexes.json` (`journal`: `visibility+timestamp` y `visibility+authorUid+timestamp`) |
| Composer del DM | `DmControlGrimoire.astro` (~690-715): título, texto y casilla "privado" → `journalStore.log(..., { visibility })` |
| Lista de jugadores del DM | `DmControlGrimoire.astro`: `#grimoire-players-grid` |
| Bitácora del jugador | `JournalModal.astro` (renderiza la marca "📨 Para el DM" en ~255) |
| Helper `canPrepare()` en reglas | `firestore.rules:159` |

## 3. Decisiones vigentes

- **D1/D3/D4/D11/D12** (ver README).
- **D7** con una excepción acotada: los susurros se crean en `active` **y** `paused`; en `ended`, no.
- **M3** Avisos con `alerts.ts`.

Decisiones propias:

- **FD-1** Bandera nueva `isWhisper` en `JournalEntry`, igual que las existentes: `getEntryVisibility` devuelve `'to_player'` si `isWhisper` (antes que las demás comprobaciones) y `withVisibility` la setea. Así se sigue el patrón actual y no se rompe la lectura de datos viejos.
- **FD-2** En `writeJournalEntry`: si la visibilidad es `to_player` y el autor **no** es el DM, se degrada a `player` (igual que hoy pasa con `dm`). Sin campaña, también se degrada a `player`.
- **FD-3** La marca de leído se escribe con `updateDoc` sobre la ruta `readBy.{uid}` (no con `setDoc` del documento entero), para que la regla de `affectedKeys` la acepte.
- **FD-4** El aviso de susurro nuevo solo se dispara para entradas `to_player` que llegan como `added` en el snapshot, que no sean del propio usuario, que tengan `timestamp` de menos de 10 minutos y que no tengan `readBy[uid]`. Al cargar la página, los susurros no leídos se muestran como contador en la bitácora, sin banner.
- **FD-5** El texto del susurro va en `content`; el título por defecto es "Susurro del DM" (editable).

## 4. Modelo de datos

```ts
// src/scripts/models/journal.ts
export type JournalVisibility = 'party' | 'dm' | 'player' | 'to_dm' | 'to_player';

export interface JournalEntry {
  // …existentes…
  isWhisper?: boolean;                 // FD-1
  recipientUids?: string[];            // 1 a 10, miembros de la campaña
  recipientNames?: string[];           // solo para mostrar ("Para Thorin y Lyra")
  readBy?: Record<string, number>;     // uid → timestamp
}
```

`firestore.indexes.json`, agregar:

```json
{
  "collectionGroup": "journal",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "visibility", "order": "ASCENDING" },
    { "fieldPath": "recipientUids", "arrayConfig": "CONTAINS" },
    { "fieldPath": "timestamp", "order": "DESCENDING" }
  ]
}
```

(La consulta del DM, `visibility == 'to_player'` + `orderBy timestamp`, usa el índice `visibility+timestamp` que ya existe.)

## 5. Archivos

**Crear**
- `src/components/dm/WhisperComposer.astro` (modal de susurro)
- `src/components/journal/WhisperViewer.astro` (modal de lectura)
- `tests/rules/whisper_rules.test.mjs`
- `tests/journal_visibility.test.mjs` (si no existe uno equivalente)

**Modificar**
- `src/scripts/models/journal.ts`
- `src/scripts/state/journalStore.ts`: `getEntryVisibility`, `withVisibility`, `log` (aceptar `recipientUids`/`recipientNames`), `markWhisperRead(entryId)`.
- `src/scripts/data/cloudSync.ts`: `writeJournalEntry` (FD-2, limpiar `isWhisper` antes de guardar como hace con las otras banderas), `syncJournalListeners` (consultas nuevas), `markWhisperRead` (FD-3), detección de susurros nuevos (FD-4).
- `firestore.rules`, `firestore.indexes.json`.
- `src/components/dm/DmControlGrimoire.astro`: selector de destinatarios en el composer, botón "Susurrar" por jugador, marca de leído.
- `src/components/journal/JournalModal.astro`: marca "🤫 Susurro del DM" y estado no leído.
- `src/pages/campaigns.astro` y `src/pages/partida.astro`: montar `WhisperViewer`.

## 6. Pasos por tarea

### T-80 — Modelo y reglas (RF-81)

1. Tipos de la sección 4 y `getEntryVisibility`/`withVisibility` (FD-1), con un test unitario de ida y vuelta para las cinco visibilidades.
2. Reglas en `match /journal/{entryId}`:
   ```
   function canSee(entry) {
     return …existente…
       || (entry.visibility == 'to_player'
           && (isDm(campaignId) || uid() in entry.recipientUids));
   }
   function validWhisper(entry) {
     return isDm(campaignId)
       && entry.recipientUids is list
       && entry.recipientUids.size() >= 1 && entry.recipientUids.size() <= 10
       && entry.recipientUids.hasOnly(campaign(campaignId).data.memberUserIds);
   }
   function validVisibility(entry) {
     return entry.visibility in ['party', 'dm', 'player', 'to_dm', 'to_player']
       && (entry.visibility != 'dm' || isDm(campaignId))
       && (entry.visibility != 'to_player' || validWhisper(entry));
   }
   ```
   En `allow create`, sumar la alternativa:
   ```
   || (request.resource.data.visibility == 'to_player' && canPrepare())
   ```
   Y una regla de `update` nueva, separada de la existente:
   ```
   allow update: if signedIn() && resource.data.visibility == 'to_player'
     && uid() in resource.data.recipientUids
     && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['readBy'])
     && request.resource.data.readBy.diff(resource.data.get('readBy', {})).affectedKeys().hasOnly([uid()]);
   ```
3. Revisar la regla de `delete` actual: el DM debe poder borrar sus susurros (es autor); un destinatario **no** puede borrarlos.

Tests (`tests/rules/whisper_rules.test.mjs`), con DM, jugador A (destinatario), jugador B (miembro, no destinatario) y un extraño:

| Caso | Esperado |
| --- | --- |
| DM crea `to_player` para A en `active` | ✅ |
| DM crea `to_player` para A en `paused` | ✅ |
| DM crea `to_player` para A en `ended` | ❌ |
| DM crea `to_player` con 0 destinatarios, con 11, o con un uid que no es miembro | ❌ |
| A crea una entrada `to_player` | ❌ |
| A lee el susurro; B lo lee; el extraño lo lee | ✅ / ❌ / ❌ |
| Consulta de A `where(visibility=='to_player') + where(recipientUids array-contains A)` | ✅ |
| Consulta de B sin filtrar por destinatario | ❌ (la consulta entera se rechaza) |
| A agrega `readBy.A` | ✅ |
| A agrega `readBy.B`, o cambia el `content` | ❌ |
| B agrega `readBy.B` | ❌ |
| A borra el susurro | ❌ |
| DM borra el susurro en `active` | ✅ |

### T-81 — Consultas en `cloudSync` (lectura)

En `syncJournalListeners`, agregar un scope `to_player`:

- **DM:** `where('visibility', '==', 'to_player'), orderBy('timestamp', 'desc'), limit(JOURNAL_LIMIT)`.
- **Jugador:** `where('visibility', '==', 'to_player'), where('recipientUids', 'array-contains', uid), orderBy('timestamp', 'desc'), limit(JOURNAL_LIMIT)`.

Y limpiar el scope al cambiar de campaña, como los demás (`journalStore.applyRemoteEntries('to_player', null)`). Desplegar el índice nuevo (`firebase deploy --only firestore:indexes`) y comprobarlo en el emulador.

### T-82 — UI del DM (RF-80, RF-84)

1. `WhisperComposer.astro`: modal con
   - destinatarios: chips seleccionables con los jugadores de la campaña (nombre del personaje y del jugador), de 1 a 10;
   - título opcional (por defecto "Susurro del DM") y texto;
   - botón "Susurrar" (ícono `record_voice_over`), deshabilitado si `!canPerform` para la acción de susurro en el estado actual (usar `canPerform('dmPrepare', 'dm', status)`, que ya permite `active` y `paused` y bloquea `ended`).
   - Al enviar: `journalStore.log(título, texto, ['#Susurro'], undefined, { visibility: 'to_player', authorName, recipientUids, recipientNames })`.
2. Se abre:
   - desde un botón "Susurro" junto al composer actual de la bitácora del grimorio;
   - desde un botón "Susurrar" en cada tarjeta de `#grimoire-players-grid`, con ese jugador preseleccionado.
3. En la bitácora del DM, cada susurro muestra "🤫 Para Thorin, Lyra" y, por destinatario, "✓ leído" si existe `readBy[uid]` (RF-84).

### T-83 — UI del jugador (RF-82, RF-83)

1. **Aviso (FD-4):** al detectar un susurro nuevo, `showBanner({ title: 'El DM te susurra algo', tone: 'whisper', timeoutMs: 0, actions: [{ label: 'Leer', onClick: () => openWhisper(id) }] })`, `buzz('whisper')` y `chime('whisper')`. Respeta `prefs.enabled`.
2. **`WhisperViewer.astro`:** modal con el título, el texto y la hora. Al abrirlo, llama a `markWhisperRead(id)` (FD-3) si no estaba leído. Botón "Responder al DM", que abre `JournalModal` con la casilla "Para el DM" ya marcada.
3. **Bitácora (`JournalModal`):** las entradas `to_player` llevan la marca "🤫 Susurro del DM" (violeta, como "📨 Para el DM") y un punto si no están leídas. Tocarlas abre el `WhisperViewer`.
4. Contador de susurros no leídos en el botón de la bitácora (`QuickJournalFab`), si es simple.

## 7. Tests

- **Reglas:** tabla de T-80.
- **Unitarios (`tests/journal_visibility.test.mjs`):** `getEntryVisibility(withVisibility(e, v)) === v` para las cinco visibilidades; una entrada vieja sin `isWhisper` sigue leyéndose igual.

## 8. Verificación

1. `pnpm test`, `pnpm test:rules` y `pnpm build`.
2. Manual (DM en la PC; jugadores A y B en celulares; partida `active`):
   1. El DM susurra a A desde la tarjeta de A: el celular de A muestra el banner violeta, vibra y suena; B no recibe nada.
   2. A toca "Leer": ve el mensaje; en la bitácora del DM aparece "✓ leído" para A.
   3. El DM susurra a A y B a la vez: los dos lo reciben.
   4. A responde con "Responder al DM": el DM lo ve como mensaje `to_dm`.
   5. Pausar la partida y susurrar: llega igual. Terminar la partida: el botón "Susurrar" se deshabilita.
   6. Recargar el celular de A: no vuelve el banner; el susurro sigue en su bitácora.
   7. Desde la consola de B, intentar leer el susurro de A: la consulta se rechaza.

## 9. Fuera de alcance

- Hilos de conversación (el jugador responde con `to_dm`).
- Susurros con imagen (lo cubrirán los handouts de la Spec 01, reutilizando `recipientUids`).
- Susurros entre jugadores.

## 10. Checklist de cierre

- [ ] T-80 … T-83 marcadas en la spec.
- [ ] `// DECISION:` para FD-1, FD-2, FD-3 y FD-4.
- [ ] Índice nuevo desplegado.
- [ ] Tests de reglas verdes, incluidos los rechazos.
- [ ] Build estático OK.
