# Spec: Mesa viva — dnd.gonzabena.com.ar

Nov 9, 2026 · @Gonzalo Benavente

Etapa 1 del [roadmap](../ROADMAP.md). Ideas I-02, I-06, I-30 e I-42 de [`IDEAS.md`](../IDEAS.md).

## Objetivo y alcance

Que la app se sienta hecha para la **mesa física**, con el celular de cada jugador al lado:

- el celular avisa cuando te toca;
- el jugador termina su turno desde el celular;
- el DM le susurra algo a un jugador;
- sumarse a la mesa es escanear un QR.

Todo se apoya en lo que ya existe: el combate de la Spec 01, la bitácora y las invitaciones.

**Dentro del alcance (v1)**

- Aviso de turno en el celular del jugador, esté en la hoja o en la vista de partida, y opción de pantalla siempre encendida (I-02).
- Terminar el propio turno desde el celular (I-06).
- Susurros del DM a uno o más jugadores (I-30).
- QR del link de invitación (I-42).

**Fuera del alcance (v1)**

- Pantalla de mesa para tablet o TV (I-01): pasó a futuro.
- Notificaciones push con la app cerrada (FCM y service worker).
- El resto del "modo mesa" (I-03): vista compacta de la hoja.
- Hilos de conversación en los susurros: el jugador responde con el mensaje al DM que ya existe (`to_dm`).

**Usuarios**

| Rol | Qué gana |
| --- | --- |
| Jugador | Sabe cuándo le toca sin estar mirando la pantalla; termina su turno él mismo; recibe susurros; se une escaneando un QR. |
| DM | No tiene que estar pendiente de avanzar cada turno; manda información privada; suma jugadores mostrando un QR. |

## Estado actual del repo (punto de partida)

| Tema | Qué hay | Dónde |
| --- | --- | --- |
| Combate | `campaigns/{cid}/combat/current` con `turnIndex`, `round` y `combatants[]` (`ownerUid`, `characterId`, `hiddenHp`). Solo lo escribe el DM, con `setDoc` del documento completo (F1-4) | `src/scripts/models/combat.ts`, `src/scripts/data/combatService.ts` |
| Avance de turno | `nextTurn()` avanza exactamente un lugar; al pasar el último, vuelve a 0 y suma una ronda | `src/scripts/vtt/initiative.ts:86` |
| Dueño del combatiente | Los PJ reciben `ownerUid = char.userId` al iniciar el combate; los agregados a mano pueden no tenerlo | `combatService.buildPlayerCombatants`, `CombatTracker.astro:1232` |
| "¿Es mi turno?" | Lógica inline en `InitiativeList.astro` (compara `ownerUid`, `characterId` y nombre) | `src/components/party/InitiativeList.astro:246-261` |
| Acciones del jugador en combate | Ataque y daño con `open-dice-roller`; quedan en la bitácora (`#Combate`). El jugador no escribe el combate | `InitiativeList.astro`, `DiceRollerModal.astro` |
| Bitácora | `visibility: 'party' \| 'dm' \| 'player' \| 'to_dm'`, regla `canSee()`; crear exige `canPlay()` | `src/scripts/models/journal.ts`, `firestore.rules:107` |
| Invitación | Código `inviteCode`, documento `invites/{code}`, **link `/?join=CODIGO` ya existe** (botón "Copiar link") | `CampaignRosterModal.astro:392`, `src/pages/index.astro:693` |
| Toasts | Evento `cloud-toast` en `window` | `src/pages/index.astro` |
| Estado de partida | `canPerform(action, role, status)`; en reglas, `canPlay()` y `canPrepare()` | `src/scripts/vtt/sessionStatus.ts`, `firestore.rules:158` |

## Stack, restricciones y reglas para el agente

Se mantienen todas las de la Spec 01 y sus decisiones globales D1–D13 (`docs/Plans/01-dm-panel/README.md`). En resumen:

- Astro estático, sin SSR. Componentes `.astro` + `<script>`, sin framework UI. Comunicación con `CustomEvent` en `window`.
- Firebase (plan Spark) solo a través de `src/scripts/data/`. Tipos en `src/scripts/models/`. Lógica pura en `src/scripts/vtt/` o `src/scripts/utils/`, con tests `node:test`.
- Animaciones con anime.js.
- Decisiones no cubiertas: la opción más simple que respete la cuota, anotada con `// DECISION:`.

**Dependencias nuevas**

- `qrcode-generator` (MIT, sin dependencias). Se carga con `import()` dinámico, solo al abrir el QR.
  - Corre en el navegador: Astro la empaqueta como un `.js` más dentro de `dist/`. Hostinger (hosting web, no VPS) la sirve igual que el resto de los archivos estáticos, sin nada del lado del servidor.
  - Igual se verifica en producción: build, subida y escaneo real del QR (T-61).
- Ninguna otra. Sonido con Web Audio API (sin archivos), vibración con `navigator.vibrate` y pantalla encendida con Wake Lock API.

## 1. Aviso de turno (I-02)

**Comportamiento**

- Funciona en **toda la app** mientras haya una campaña en la nube con un combate activo: en la hoja (`/campaigns`) y en la vista de partida (`/partida`). En la mesa, el jugador suele tener abierta su hoja, no la partida.
- Cuando el turno pasa a un combatiente del jugador:
  1. Banner grande "¡Tu turno, Thorin!" con animación, que se cierra tocándolo o solo a los 6 s.
  2. Vibración (patrón corto-largo), si el dispositivo la soporta y está activada.
  3. Sonido, si está activado.
  4. El título de la pestaña parpadea ("⚔️ ¡Tu turno!") hasta que la pestaña recibe el foco.
  5. Mientras dure el turno queda visible una barra fija "⚔️ Tu turno · Terminar turno" (sección 2).
- Cuando el jugador es **el siguiente**: aviso suave (toast pequeño, sin sonido, vibración corta opcional).
- Cada aviso se dispara **una sola vez** por turno: la clave es `round:turnIndex:combatantId`. Si se recarga la página en medio de su turno, se muestra el banner pero no vibra ni suena de nuevo (la clave se guarda en `sessionStorage`).
- Un jugador con varios combatientes (compañero animal, invocación) recibe el aviso en cada uno, con su nombre.
- El DM no recibe avisos de turno.

**Preferencias** (por dispositivo, en `localStorage`, con `try/catch`)

| Preferencia | Por defecto |
| --- | --- |
| Avisos de turno | Activados |
| Vibración | Activada |
| Sonido | **Activado** (para que quien entra por primera vez vea el potencial de la app) |
| Aviso de "sos el siguiente" | Activado |
| Pantalla siempre encendida | Desactivada |

Se configuran desde un ícono de campana en el header.

**Pantalla siempre encendida** (Wake Lock API): mientras está activada y la partida de la campaña activa está en `active`, el celular no se apaga solo. Se suelta al pausar o terminar la partida y se vuelve a pedir cuando la pestaña recupera la visibilidad (el navegador lo suelta al cambiar de pestaña). Si el navegador no soporta la API, la opción se oculta. Es la única parte del "modo mesa" (I-03) que entra ahora.

**Limitaciones conocidas** (documentarlas en la UI de preferencias)

- iOS Safari no soporta `navigator.vibrate`: el control de vibración se oculta si la API no existe.
- El sonido necesita una interacción previa del usuario (política de autoplay): el `AudioContext` se desbloquea con el primer toque en la página. Aunque el sonido venga activado, si el jugador no tocó nada todavía, el primer aviso puede salir sin sonido.
- Con la pestaña en segundo plano o el celular bloqueado, el aviso depende del navegador. Las push reales quedan fuera de v1.

## 2. Terminar mi turno (I-06)

**Comportamiento**

- Cuando es el turno de un combatiente del jugador y la partida está `active`, aparece el botón **"Terminar turno"**:
  - en la barra fija del aviso de turno (hoja y vista de partida);
  - en la lista de iniciativa de `/partida`, junto al combatiente actual.
- Para evitar toques accidentales: el primer toque cambia el botón a "¿Terminar? Tocá de nuevo" durante 3 s; el segundo toque confirma.
- Al confirmar, el combate avanza al siguiente combatiente (misma lógica que `nextTurn`: +1, o vuelta a 0 y ronda +1). Todos lo ven en vivo y, si el siguiente es otro jugador, le llega su aviso.
- Se agrega a la bitácora una línea `party` con la etiqueta `#Combate`: "Thorin terminó su turno".
- El DM sigue pudiendo avanzar y retroceder el turno como hoy. Si el jugador terminó su turno por error, el DM usa "turno anterior".
- Solo puede terminar el turno el **dueño** del combatiente actual, identificado por `ownerUid`. La detección por `characterId` o por nombre sirve para los avisos, pero no habilita este botón: las reglas solo pueden validar `ownerUid`.

**Escritura y concurrencia**

- El jugador **no** reescribe el documento completo: dentro de una transacción (`runTransaction`), lee `combat/current`, comprueba que el turno actual sigue siendo el que vio (misma clave `round:turnIndex:combatantId`) y escribe solo `turnIndex`, `round` y `updatedAt`. Si el turno cambió mientras tanto, no escribe y avisa "El turno ya avanzó".
- Como ahora escriben dos personas, `advanceTurn` y `previousTurn` del DM también pasan a transacción (escribiendo solo esos tres campos). El resto de las escrituras del DM (PG, condiciones, combatientes) siguen como en F1-4. Así una escritura del DM con datos viejos no puede deshacer el avance de un jugador. Esto actualiza la decisión F1-4 de la Spec 01.

**Combatientes sin dueño**

Los PJ ya reciben `ownerUid` al iniciar el combate. Un compañero animal o una invocación agregados a mano pueden no tenerlo: en ese caso el aviso de turno puede funcionar (por nombre o personaje), pero el botón no aparece. El plan debe verificar que el DM pueda asignar un dueño al agregar o editar un combatiente (`CombatTracker` ya maneja `data-owner`) y completarlo si falta.

## 3. Susurros del DM (I-30)

**Comportamiento**

- El DM elige uno o más jugadores y escribe un mensaje privado ("Vos notás que el posadero tiene un tatuaje de la Mano Roja").
- Se puede enviar desde la bitácora del panel del DM (selector de destinatarios) y desde la lista de jugadores del panel (botón "Susurrar" por jugador).
- El destinatario recibe un aviso (banner + vibración + sonido, mismo sistema que el aviso de turno) con un botón "Leer", que abre el mensaje en un modal.
- El mensaje queda en la bitácora del destinatario, marcado como "🤫 Susurro del DM". Los demás jugadores no lo ven.
- El DM ve en su bitácora a quién se lo mandó y si ya lo leyó (RF-84).
- El jugador responde con el mensaje al DM que ya existe (`to_dm`). No hay hilos en v1.
- **Estados:** se puede susurrar con la partida `active` **y también `paused`** (por ejemplo, para dejarle algo a un jugador entre sesiones, aunque normalmente eso vaya por canales externos). Con la partida `ended`, no: es solo lectura para todos. Es una excepción acotada a la regla general de que la bitácora solo se escribe en `active` (D7).

**Relación con los handouts (Spec 01, RF-41)**

Los handouts son contenido (imagen o texto) para **toda la mesa** en una ventana animada. El susurro es **texto privado** para destinatarios concretos. Cuando se implementen los handouts, pueden reutilizar `recipientUids` para mandar un handout a un jugador concreto.

## 4. Invitación con QR (I-42)

**Comportamiento**

- En la caja de invitación del roster (`CampaignRosterModal`), junto a "Copiar link", un botón "Mostrar QR" abre un modal con el QR del link `/?join=CODIGO`, el código en grande y el link. El DM lo muestra desde su celular o su compu y los jugadores lo escanean.
- **El código sobrevive al login:** si alguien abre `/?join=CODIGO` sin sesión iniciada, el código se guarda en `sessionStorage`, se inicia sesión y después se completa la unión automáticamente. Hoy esto no está verificado: el plan debe comprobarlo y arreglarlo si hace falta.
- Si el código se regenera, el QR abierto se actualiza (o se cierra).

## Modelo de datos

```ts
// src/scripts/models/journal.ts
export type JournalVisibility = 'party' | 'dm' | 'player' | 'to_dm' | 'to_player';

export interface JournalEntry {
  // …campos existentes…
  /** Solo para visibility 'to_player': jugadores que reciben el susurro (1 a 10). */
  recipientUids?: string[];
  /** Solo para 'to_player': quién lo leyó y cuándo. Lo escribe cada destinatario. */
  readBy?: Record<string, number>;   // uid → timestamp
}
```

```ts
// Preferencias locales (no se sincronizan)
// localStorage 'turnAlerts.v1'
interface TurnAlertPrefs {
  enabled: boolean;     // true
  vibrate: boolean;     // true
  sound: boolean;       // true
  nextUp: boolean;      // true
  keepAwake: boolean;   // false
}
```

El documento de combate no cambia de forma. No hay colecciones nuevas en Firestore ni nodos nuevos en RTDB.

**Funciones puras nuevas** (con tests)

```ts
// src/scripts/vtt/initiative.ts
/** Combatientes del jugador: por ownerUid; si no hay, por characterId; el nombre solo como último recurso. */
export function isOwnedBy(c: Combatant, viewer: { uid: string; characterIds: string[]; characterNames: string[] }): boolean;
/** Relación del jugador con el turno actual: es suyo, es el siguiente, o nada. */
export function turnRelation(combat: Combat, viewer: …): { kind: 'mine' | 'next'; combatant: Combatant; key: string } | null;
/** Clave estable de un turno: `${round}:${turnIndex}:${combatantId}`. */
export function turnKey(combat: Combat): string | null;
/** true si el viewer puede terminar el turno actual: solo por ownerUid (es lo que validan las reglas). */
export function canEndTurn(combat: Combat, uid: string): boolean;
```

`InitiativeList.astro` pasa a usar `isOwnedBy`, en lugar de su lógica inline.

## Seguridad y reglas

### Combate: el jugador termina su turno

En `match /combat/{docId}`, además de la regla del DM:

```
// El dueño del combatiente actual puede avanzar exactamente un turno, y nada más.
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

- El jugador no puede tocar combatientes, PG ni condiciones, ni saltear turnos, ni retroceder.
- Si el turno actual no es suyo (por ejemplo, el DM ya avanzó), la escritura se rechaza.
- `combatants[turnIndex]` se indexa en las reglas sin iterar la lista, así que el costo es el de una regla normal.

### Bitácora: susurros

En `match /journal/{entryId}`:

```
function canSee(entry) {
  return …existente…
    || (entry.visibility == 'to_player'
        && (isDm(campaignId) || uid() in entry.recipientUids));
}

function validVisibility(entry) {
  return entry.visibility in ['party', 'dm', 'player', 'to_dm', 'to_player']
    && (entry.visibility != 'dm' || isDm(campaignId))
    && (entry.visibility != 'to_player' || validWhisper(entry));
}

// Solo el DM susurra; destinatarios: 1 a 10, todos miembros de la campaña.
function validWhisper(entry) {
  return isDm(campaignId)
    && entry.recipientUids is list
    && entry.recipientUids.size() >= 1 && entry.recipientUids.size() <= 10
    && entry.recipientUids.hasOnly(campaign(campaignId).data.memberUserIds);
}
```

La regla de `create` suma una alternativa: un susurro también se puede crear en pausa.

```
&& (
  canPlay()
  || (isDm(campaignId) && request.resource.data.get('systemEvent', '') == 'status' && request.resource.data.visibility == 'party')
  || (request.resource.data.visibility == 'to_player' && canPrepare())   // active o paused, no ended
)
```

Regla adicional de `update`: un destinatario puede marcar el susurro como leído, **solo** agregando su propia clave a `readBy`:

```
allow update: if signedIn() && resource.data.visibility == 'to_player'
  && uid() in resource.data.recipientUids
  && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['readBy'])
  && request.resource.data.readBy.diff(resource.data.get('readBy', {})).affectedKeys().hasOnly([uid()]);
```

`readBy` no exige `canPlay()`: leer un mensaje no es jugar (`// DECISION:`).

**Requisitos de seguridad**

- Un jugador no puede avanzar el turno de otro, ni modificar el combate más allá de avanzar un lugar en su propio turno.
- Nadie puede avanzar el turno con la partida en pausa o terminada.
- Un jugador no destinatario no puede leer un susurro, ni con una consulta directa desde la consola.
- Un jugador no puede crear entradas `to_player`.
- Un destinatario no puede modificar nada del susurro salvo su propia marca de lectura.
- Las consultas de la bitácora del jugador deben poder resolverse con las reglas. Firestore exige que la consulta "pruebe" que todos los resultados son legibles: el plan tiene que verificar cómo consulta hoy `cloudSync` la bitácora y, si hace falta, agregar una consulta separada `where('recipientUids', 'array-contains', uid)`.

## Requisitos funcionales

Prioridad: **M** = obligatorio en v1, **S** = deseable.

**Aviso de turno**

| ID | Requisito | Prio |
| --- | --- | --- |
| RF-60 | Cuando el turno pasa a un combatiente del jugador, se muestra un banner animado con el nombre del personaje, en la hoja y en la vista de partida. | M |
| RF-61 | El aviso vibra y suena según las preferencias del dispositivo (ambos activados por defecto); cada turno avisa una sola vez, aunque se recargue la página. | M |
| RF-62 | El jugador recibe un aviso suave cuando es el siguiente en la iniciativa. | S |
| RF-63 | Con la pestaña en segundo plano, el título parpadea hasta recuperar el foco. | S |
| RF-64 | El jugador configura sus preferencias de aviso (activado, vibración, sonido, siguiente, pantalla encendida) desde el header; se guardan por dispositivo. | M |
| RF-65 | La detección de "mi combatiente" usa `ownerUid`, después `characterId` y el nombre solo como último recurso, en una función pura compartida. | M |
| RF-66 | El jugador puede activar "pantalla siempre encendida", que mantiene el celular despierto mientras la partida está `active` y se suelta en pausa o al terminar. | S |

**Terminar mi turno**

| ID | Requisito | Prio |
| --- | --- | --- |
| RF-70 | En su turno y con la partida `active`, el dueño del combatiente ve "Terminar turno" en la barra de turno y en la lista de iniciativa; confirma con un segundo toque. | M |
| RF-71 | Terminar el turno avanza exactamente un lugar (o vuelve al primero y suma una ronda), lo ven todos en vivo y queda una línea `#Combate` en la bitácora. | M |
| RF-72 | Las reglas solo permiten al dueño del combatiente actual avanzar un turno, sin tocar nada más (tests del emulador). | M |
| RF-73 | Avanzar o retroceder turno (DM o jugador) usa transacción; si el turno cambió mientras tanto, la acción no se aplica y se avisa. | M |
| RF-74 | El DM puede asignar un dueño a un combatiente agregado a mano (compañero animal, invocación). | S |

**Susurros**

| ID | Requisito | Prio |
| --- | --- | --- |
| RF-80 | El DM envía un susurro de texto a uno o más jugadores de la campaña (1 a 10), desde la bitácora o desde la lista de jugadores, con la partida `active` o `paused`. | M |
| RF-81 | Solo el DM y los destinatarios pueden leer un susurro; lo hacen cumplir las reglas (tests del emulador). | M |
| RF-82 | El destinatario recibe un aviso con un botón para leerlo, usando el mismo sistema que el aviso de turno. | M |
| RF-83 | El susurro aparece en la bitácora del destinatario con una marca distintiva. | M |
| RF-84 | El DM ve a quién mandó cada susurro y quién lo leyó. | S |

**Invitación con QR**

| ID | Requisito | Prio |
| --- | --- | --- |
| RF-90 | En la caja de invitación, "Mostrar QR" abre un modal con el QR del link `/?join=CODIGO`, el código y el link. | M |
| RF-91 | Abrir el link sin sesión iniciada completa la unión después del login, sin volver a pedir el código. | M |
| RF-92 | Si el código se regenera, el QR abierto no muestra el código viejo. | M |

## Plan de tareas por fases

Orden sugerido: de la más barata a la más grande. La Fase A es independiente; las C y D dependen de la B.

### Fase A — QR de invitación (I-42)

- [ ] T-60 Verificar el flujo `/?join=` sin sesión; si se pierde el código, guardarlo en `sessionStorage` y completarlo tras el login (RF-91).
- [ ] T-61 `pnpm add qrcode-generator`; modal de QR en `CampaignRosterModal` con carga dinámica (RF-90, RF-92). Verificar en producción (Hostinger): build, subida y escaneo real con un celular.

### Fase B — Aviso de turno (I-02)

- [x] T-62 Funciones puras `isOwnedBy`, `turnRelation`, `turnKey` y `canEndTurn` en `initiative.ts`, con tests; `InitiativeList` pasa a usar `isOwnedBy` (RF-65).
- [x] T-63 Servicio `src/scripts/ui/alerts.ts`: banner, vibración, sonido Web Audio y parpadeo del título, con preferencias en `localStorage`. Es reutilizable (lo usan las Fases C y D).
- [x] T-64 Componente global `TurnNotifier.astro`, montado en `/campaigns` (hoja) y en `/partida`: suscripción al combate de la campaña activa (un solo listener por pestaña), avisos deduplicados y barra fija de turno (RF-60 a RF-63).
- [x] T-65 Panel de preferencias en el header (RF-64), con la opción de pantalla siempre encendida (RF-66): `src/scripts/ui/wakeLock.ts`, que escucha `session-status-changed` y `visibilitychange`.

### Fase C — Terminar mi turno (I-06) · depende de T-62 y T-64

- [x] T-66 Regla de `combat/current` para el dueño del turno, con tests del emulador: avanza +1, vuelve a 0 con ronda +1, rechaza turno ajeno, salto de dos, retroceso, cambios en `combatants`, pausa y terminada (RF-72).
- [x] T-67 `combatService.endMyTurn(cid, expectedKey)` con `runTransaction`; `advanceTurn` y `previousTurn` del DM pasan a transacción con escritura parcial; actualizar el comentario de F1-4 (RF-71, RF-73).
- [x] T-68 Botón "Terminar turno" con doble toque en la barra de turno y en `InitiativeList`; línea en la bitácora (RF-70, RF-71).
- [x] T-69 Verificar y, si falta, completar la asignación de dueño a combatientes agregados a mano en `CombatTracker` (RF-74).

### Fase D — Susurros (I-30) · depende de T-63

- [ ] T-80 Modelo (`to_player`, `recipientUids`, `readBy`) y reglas, con tests del emulador para cada caso de la sección *Seguridad*, incluida la creación en pausa (RF-81).
- [ ] T-81 Revisar las consultas de bitácora en `cloudSync` para que el destinatario reciba los susurros sin romper las reglas.
- [ ] T-82 UI del DM: selector de destinatarios en la bitácora y botón "Susurrar" en la lista de jugadores, habilitados en `active` y `paused` (RF-80, RF-84).
- [ ] T-83 UI del jugador: aviso con `alerts.ts`, modal de lectura y marca en la bitácora; escribe `readBy` al abrir (RF-82, RF-83).

```
Fase A ────────────────────────────────────────┐
Fase B (T-62 … T-65) ──┬──► Fase C (T-66 … T-69) ┼──► cierre de la etapa
                       └──► Fase D (T-80 … T-83) ┘
```

## Criterios de aceptación, cuotas y pruebas

**Presupuesto de cuota (Spark)**

Mismo supuesto que la Spec 01: sesión de 4 h, 1 DM, 5 jugadores, 100 cambios de combate por hora.

| Concepto | Escrituras | Lecturas |
| --- | --- | --- |
| Combate leído desde la hoja por los 5 jugadores (cuando no tienen `/partida` abierta) | — | hasta 2.000 |
| Terminar turno: reemplaza avances que antes hacía el DM; la transacción suma una lectura | ~0 extra | ~100 |
| Línea "terminó su turno" en la bitácora (~30 por hora) | ~120 | ~720 |
| Susurros (estimado 20 por sesión × 2 destinatarios) | ~60 (con `readBy`) | ~100 |
| **Extra aproximado por sesión** | **~180** | **~2.900** |

Sumado a la Spec 01 (~560 escrituras y ~3.500 lecturas por sesión), queda muy por debajo de las 20.000 escrituras y 50.000 lecturas diarias. Para no duplicar listeners, `TurnNotifier` e `InitiativeList` comparten la misma suscripción de combate cuando están en la misma página.

**Criterios de aceptación**

1. Con el jugador en su hoja (no en `/partida`), cuando el DM avanza el turno al personaje del jugador, el celular muestra el banner, vibra y suena en menos de 2 s.
2. Recargar la página durante el turno propio no vuelve a vibrar ni a sonar.
3. Un jugador con dos combatientes recibe un aviso por cada uno.
4. Un jugador termina su turno desde el celular; el DM y los demás ven el cambio en vivo y el siguiente jugador recibe su aviso.
5. Si el DM avanza el turno justo mientras el jugador toca "Terminar turno", el combate avanza **un solo** lugar.
6. Un jugador no puede avanzar el turno de otro ni modificar PG o combatientes, ni desde la consola (tests del emulador).
7. Un jugador que no es destinatario no puede leer un susurro, ni con una consulta desde la consola (tests del emulador).
8. El destinatario de un susurro recibe el aviso en menos de 2 s, esté en la hoja o en `/partida`. Un susurro enviado en pausa también llega.
9. Escanear el QR con un celular sin sesión lleva a iniciar sesión y termina con el jugador unido a la campaña, también en producción (Hostinger).
10. `pnpm test`, `pnpm test:rules` y `pnpm build` pasan sin errores.

**Pruebas**

- Unitarias: `isOwnedBy`, `turnRelation`, `turnKey` y `canEndTurn` (incluye cambio de ronda, combatiente borrado, último de la lista con "siguiente" en la ronda nueva, combatiente sin `ownerUid` y empate de nombres).
- Reglas: avance de turno del jugador (casos de T-66); lectura, creación (en `active`, `paused` y `ended`) y `readBy` de `to_player` para DM, destinatario, otro miembro y extraño.
- Manual: DM en la PC y dos jugadores en celulares reales (al menos uno Android, para la vibración).

## Decisiones tomadas

Resueltas el 9 nov 2026.

- [x] **Librería de QR.** → `qrcode-generator`, con carga dinámica. Se verifica en producción en Hostinger (T-61): al ser JS del navegador empaquetado por Astro, no depende del servidor.
- [x] **Sonido por defecto.** → **Activado**, para que quien entra por primera vez vea el potencial de la app.
- [x] **Susurros en pausa.** → Se permiten en `active` y `paused`; en `ended`, no.
- [x] **Terminar mi turno.** → Entra en v1 (sección 2, Fase C).
- [x] **Pantalla de mesa.** → Pasa a futuro; solo se adelanta la pantalla siempre encendida (RF-66).
