# Spec: Memoria — cimiento — dnd.gonzabena.com.ar

Nov 9, 2026 · @Gonzalo Benavente

Etapa 2 del [roadmap](../ROADMAP-vtt.md). Ideas I-10, I-24, I-20 e I-11 de [`IDEAS.md`](../IDEAS.md).

## Objetivo y alcance

Que la partida empiece a **recordar sola**. Hoy todo lo que pasa en la mesa queda en la bitácora como texto libre: sirve para leer, pero no para saber que hubo un crítico, que un personaje cayó o que alguien subió de nivel. Esta etapa agrega:

1. Un **registro de eventos tipados** que se genera automáticamente desde las tiradas, el combate y la hoja (I-10).
2. **Sesiones como episodios**, con título opcional (I-24).
3. **Escenas** que se reproducen en todos los dispositivos cuando pasa algo importante (I-20).
4. **Momentos épicos**: un timeline de la campaña y de cada personaje (I-11).

Es la etapa más importante en arquitectura: las Specs 04 (estadísticas, evolución) y 06 (crónica, "Previously on…") se construyen sobre el modelo que se define acá.

**Dentro del alcance (v1)**

- Colección `events` con eventos notables, escrita por el cliente de quien produce el evento.
- Datos estructurados en las tiradas que ya se guardan en la bitácora (sin escrituras extra).
- Colección `sessions` con número, inicio, fin y título opcional, y el flujo "continuar / empezar sesión nueva".
- Motor de escenas con cola, preferencias y respeto por `prefers-reduced-motion`.
- Detección automática de momentos y curaduría del DM.
- Timeline por campaña (en `/partida`) y por personaje (en la hoja).
- **Salvaciones contra la muerte** en la hoja del personaje (sección 5). Son la fuente natural de los eventos `stabilized`, `revived` y `death`.

**Fuera del alcance (v1)**

- Estadísticas y premios de sesión (Spec 04). Esta spec solo deja los datos listos.
- Muerte instantánea por daño masivo: la decide el DM con el botón "Muerto".
- Que los jugadores propongan momentos (v1: solo el DM marca y desmarca).
- Eventos de tiradas secretas: no generan eventos ni escenas.

## Estado actual del repo (punto de partida)

| Tema | Qué hay | Dónde |
| --- | --- | --- |
| Tiradas | Cada tirada crea una entrada de bitácora con `diceRoll: { formula, result, breakdown }`. El crítico y la pifia solo quedan en el texto. Se conoce el valor natural (`res.isCrit`, `res.isFumble`, `physicalVal` en dados físicos) | `src/components/modals/DiceRollerModal.astro:551-700` |
| Canal en vivo | `campaigns/{cid}/dm_events`: tiradas públicas e hitos del DM; solo crea el DM con `canPlay()`; los clientes escuchan una ventana de 45 s | `cloudSync.ts:349`, `firestore.rules:146` |
| Hitos | `NewMilestoneModal` + `MilestoneCelebrationModal`, enviados por `dm_events` (`type: 'milestone'`) | `src/components/modals/` |
| Daño en combate | `applyDamageToCombatant(cid, id, delta)` (DM) | `combatService.ts:370` |
| Subida de nivel | `characterStore` detecta `levelDiff > 0` al cambiar el nivel | `characterStore.ts:167` |
| PG en combate vs. hoja | Independientes: el combatiente copia los PG de la hoja al empezar el combate y después no se sincronizan (Spec 01, F1-3). La hoja solo la escribe su dueño; el DM solo toca `hp`/`inspiration` con la partida activa (D8) | `combatService.buildPlayerCombatants` |
| Salvaciones contra la muerte | No existen en el modelo de personaje | `src/scripts/models/character.ts` |
| Número de sesión | `campaign.sessionNumber`, que el DM edita a mano. Iniciar o reanudar la partida no lo cambia | `DmControlGrimoire.astro:638`, `sessionStatusService.ts` |
| Animaciones | `diceJackpotAnimation.ts`, animaciones de PG y de modales, anime.js | `src/scripts/animations/` |
| Avisos | `alerts.ts` (sonido, vibración), de la Spec 02 | Spec 02, T-63 |

## Stack, restricciones y reglas para el agente

Se mantienen todas las de las Specs 01 y 02 (decisiones D1–D13). Sin dependencias nuevas: animaciones con anime.js y CSS.

Principios propios de esta spec:

- **P1 — Pocos eventos, bien elegidos.** `events` guarda solo lo notable (decenas por sesión, no cientos). El detalle de cada tirada sigue en la bitácora, ahora con datos estructurados.
- **P2 — El evento lo escribe quien lo produce.** La tirada del jugador la registra su cliente; el daño que aplica el DM, el cliente del DM. No hay servidor.
- **P3 — El evento es también la señal en vivo.** Los clientes escuchan los eventos recientes y reproducen la escena. No se escribe nada aparte para avisar.
- **P4 — Editar el recuerdo no es jugar.** Títulos de episodio y curaduría de momentos se pueden editar en cualquier estado de la partida, incluso `ended` (excepción explícita a D7).
- **P5 — Confianza de mesa.** Un jugador podría fabricar un crítico desde la consola, igual que hoy puede cargar cualquier número en un dado físico. Las reglas validan forma y autoría, no la verdad de la tirada.

## 1. Registro de eventos (I-10)

### Tipos de evento

| Tipo | Cuándo | Lo escribe | Escena |
| --- | --- | --- | --- |
| `crit` | d20 natural 20 en una tirada pública | Quien tira | Sí |
| `fumble` | d20 natural 1 en una tirada pública | Quien tira | Sí |
| `down` | Un PJ llega a 0 PG (en combate o en su hoja) | DM (combate) o dueño (hoja) | Sí |
| `defeated` | Un enemigo llega a 0 PG en combate | DM | Corta |
| `death` | Tres fallos en las salvaciones, o el DM lo marca a mano | Dueño (salvaciones) o DM | Sí |
| `stabilized` | Tres éxitos en las salvaciones, o el DM lo estabiliza a mano (Medicina, *Spare the Dying*…) | Dueño (salvaciones) o DM | Sí |
| `revived` | 20 natural en una salvación: recupera 1 PG | Dueño | Sí |
| `level_up` | Un PJ de la campaña sube de nivel | Dueño | Sí |
| `milestone` | El DM registra un hito | DM | Sí (la celebración actual) |
| `combat_start` / `combat_end` | El DM inicia o termina un combate | DM | Corta / no |
| `session_start` | Empieza una sesión nueva (sección 2) | DM | Tarjeta de episodio |

Las tiradas secretas no generan eventos. Un `down` no se repite si el PJ ya estaba en 0.

### Datos estructurados en la bitácora

Las tiradas ya crean una entrada de bitácora. Se amplía `diceRoll` para que la Spec 04 pueda calcular estadísticas sin escrituras nuevas:

```ts
diceRoll?: {
  formula: string; result: number; breakdown?: string;      // existentes
  die?: number;              // 20, 12, 8…
  natural?: number;          // valor del dado antes de modificadores (si es 1 dado)
  kind?: 'attack' | 'damage' | 'save' | 'check' | 'initiative' | 'other';
  isCrit?: boolean; isFumble?: boolean;
  physical?: boolean;
  targetName?: string; targetAc?: number; hit?: boolean;
}
```

`kind` sale del contexto con el que se abre el lanzador (`open-dice-roller`): ataque y daño ya llegan con contexto desde `InitiativeList`; el resto se completa donde se abre el modal o queda en `other`.

## 2. Sesiones como episodios (I-24)

**Botón "Sesión nueva"**

Hoy pasar de `paused` a `active` no distingue "volvemos del descanso" de "nos juntamos otro día". Se agrega un botón **"Sesión nueva"** a los controles de estado del DM:

- **Solo está habilitado con la partida en pausa.** Así nadie puede escribir en la bitácora justo durante el cambio, y ninguna entrada queda en la sesión equivocada (las reglas ya bloquean la bitácora en pausa). Las reglas también exigen la pausa para crear la sesión.
- Abre un diálogo con un campo opcional "Título del episodio" y confirma "Empezar la sesión 8".
- Al confirmar:
  1. Cierra la sesión anterior (`endedAt` = momento de su última pausa).
  2. Suma 1 a `campaign.sessionNumber`.
  3. Crea `sessions/8` con el título, si lo hay, y **sin** `startedAt` todavía.
- La partida **sigue en pausa**. La sesión empieza de verdad cuando el DM toca "Iniciar": en ese momento se completa `startedAt` y se emite `session_start`, que muestra la tarjeta de episodio a todos.

**Recordatorio de las 12 h**

Si el DM toca "Iniciar" y pasaron más de 12 h desde la última pausa sin haber creado una sesión nueva, la app pregunta antes de iniciar:

- **"Sesión nueva e iniciar"**: hace el cambio de sesión (todavía en pausa) y después inicia, en ese orden.
- **"Continuar la sesión 7"**: inicia sin cambiar de sesión.

Pasar de pausa a iniciada en menos de 12 h no pregunta nada (es volver del descanso).

**Título del episodio**

- **Opcional.** Sin título, la tarjeta muestra "Sesión 8". Nada depende de que exista.
- **Editable en cualquier momento** por el DM, incluso con la partida terminada (P4): desde la lista de episodios de `/partida` o desde el panel del DM.

**Compatibilidad**

- El campo manual "Número de sesión" del panel del DM se mantiene como herramienta de corrección (`// DECISION:`).
- Las sesiones anteriores a esta spec no tienen documento: la lista de episodios las muestra como "Sesión N" a partir de los números que aparecen en la bitácora, y el DM puede ponerles título (eso crea el documento).

## 3. Escenas en momentos clave (I-20)

**Motor**

- Escucha los eventos recientes de la campaña activa (ventana de 45 s, como `dm_events`) y reproduce la escena de cada evento nuevo, **una vez** por dispositivo (deduplicado por id).
- El evento propio se reproduce al instante, sin esperar a Firestore.
- **Cola:** nunca dos escenas a la vez. Si se acumulan más de 3, se descartan las cortas.
- Duración máxima de 3 s (la tarjeta de episodio, 5 s). Se saltean con un toque.
- Funciona en la hoja (`/campaigns`, donde también vive el panel del DM) y en `/partida`.

**Catálogo v1**

| Escena | Estilo |
| --- | --- |
| Crítico | Destello dorado, d20 que estalla, "¡CRÍTICO!" + nombre del personaje |
| Pifia | Tono cómico: el dado rebota y se parte |
| Caído | Pantalla que se oscurece en rojo, "Thorin cae" |
| Muerte | Negro y solemne, retrato en escala de grises, nombre y nivel |
| Estabilizado | Pulso de luz, "Thorin resiste" |
| Subida de nivel | Retrato con aura, "Nivel 5" |
| Hito | La celebración actual (`MilestoneCelebrationModal`) |
| Inicio de combate | Corta: "¡Combate!" |
| Enemigo derrotado | Corta: toast animado |
| Episodio | Tarjeta "Episodio 8: La caída de Valdris" o "Sesión 8" |

Los retratos salen de los avatares de personaje (`characterAvatars.ts`).

**Preferencias** (por dispositivo, junto a las de avisos de la Spec 02)

| Preferencia | Por defecto |
| --- | --- |
| Escenas | Todas |
| Opciones | Todas / Solo las importantes (muerte, nivel, hito, episodio) / Ninguna |
| Sonido de escenas | Sigue la preferencia de sonido de la Spec 02 |

Con `prefers-reduced-motion`, las escenas se reemplazan por una versión estática (fundido simple).

**Hitos:** la celebración pasa a dispararse desde el evento `milestone`. `dm_events` deja de enviar hitos nuevos, pero se sigue escuchando para no romper datos viejos (`// DECISION:`).

## 4. Momentos épicos (I-11)

**Detección automática** (función pura `autoHighlight(event, context)`, con tests)

| Evento | ¿Momento automático? |
| --- | --- |
| `death`, `stabilized`, `level_up`, `milestone` | Siempre |
| `down` de un PJ | Siempre |
| `crit` | El primero de cada personaje en la sesión |
| `fumble` | La primera de cada personaje en la sesión |
| `defeated`, `combat_*`, `session_start` | No (pueden marcarse a mano) |

**Curaduría del DM**

- Marca cualquier evento como momento ⭐, con título y nota opcionales ("El nat 20 de Lyra contra el dragón").
- Desmarca un momento automático.
- Al pausar o terminar una sesión, ve "Destacados de la sesión": los momentos y los candidatos (todos los eventos de la sesión), para curar en un minuto. Es opcional y se puede cerrar.

**Timelines**

- **Campaña:** en `/partida`, sección "Momentos", agrupada por episodio (título o "Sesión N"), del más reciente al más antiguo, paginada.
- **Personaje:** en la hoja, pestaña "Recuerdos", con los momentos donde el personaje es protagonista u objetivo.
- Cada momento muestra el ícono del tipo, el título (o uno generado: "Crítico de Lyra contra Dragón rojo"), el episodio y la fecha.

## 5. Salvaciones contra la muerte

**Reglas de 5e que se implementan** (función pura `applyDeathSave`, con tests)

| Tirada (d20) | Efecto |
| --- | --- |
| 10 o más | 1 éxito |
| 2 a 9 | 1 fallo |
| 1 natural | 2 fallos |
| 20 natural | Recupera 1 PG: vuelve en sí y se reinician los contadores |
| 3 éxitos | Estabilizado: sigue en 0 PG, deja de tirar, se reinician los contadores |
| 3 fallos | Muerto |

Recibir daño estando a 0 PG suma un fallo (dos si es un crítico); en v1 eso se marca a mano en los contadores.

**Cuándo está "caído" un personaje**

Como los PG del combate y los de la hoja son independientes (F1-3), un PJ está caído si **cualquiera** de los dos está en 0: sus PG en la hoja, o los de su combatiente en un combate activo. Cuando ninguno de los dos está en 0 (por ejemplo, porque lo curaron), los contadores se reinician solos.

**En la hoja (dueño)**

- Mientras está caído, el panel de vitales muestra las salvaciones: tres casillas de éxito, tres de fallo y el botón **"Tirar salvación"**, que abre el lanzador de dados (digital o físico, como cualquier tirada) con `kind: 'death_save'`.
- El resultado se aplica solo a los contadores. Las casillas también se pueden tocar a mano, para cubrir el daño a 0 PG y las correcciones.
- Si el jugador está caído y es su turno en combate, el aviso de turno de la Spec 02 dice "Estás caído: tirá tu salvación contra la muerte" y ofrece el botón.
- Al llegar a 3 éxitos, 3 fallos o un 20 natural, el cliente del dueño emite `stabilized`, `death` o `revived`.
- Con un 20 natural, el dueño queda con 1 PG en su hoja.

**En el combate (DM)**

- `CombatTracker` muestra los contadores de los PJ caídos (los lee de la hoja, de solo lectura).
- Los botones "Estabilizar" y "Muerto" del DM siguen existiendo como decisión manual (Medicina, *Spare the Dying*, daño masivo). Emiten el evento; el cliente del dueño, al recibir `stabilized` sobre su personaje, reinicia los contadores. El DM no escribe la hoja.
- Cuando llega un `revived` de un PJ cuyo combatiente está en 0, el panel del DM ofrece "Thorin recuperó 1 PG: actualizar el combate" (S: hacerlo automático si el DM está conectado).
- Un PJ muerto queda marcado en la hoja (`deathSaves.dead`) hasta que el dueño o una resurrección lo cambien (botón "Revivir" en la hoja, que reinicia el estado).

## Modelo de datos

```ts
// src/scripts/models/event.ts (nuevo)
export type CampaignEventType =
  | 'crit' | 'fumble' | 'down' | 'defeated' | 'death' | 'stabilized' | 'revived'
  | 'level_up' | 'milestone' | 'combat_start' | 'combat_end' | 'session_start';

export interface EventParty {
  name: string;
  uid?: string;            // dueño, si es un PJ
  characterId?: string;
  combatantId?: string;
}

export interface Highlight {
  source: 'auto' | 'dm';
  title?: string;          // ≤ 120
  note?: string;           // ≤ 500
  by: string;              // uid
  at: number;
}

export interface CampaignEvent {
  id: string;
  type: CampaignEventType;
  at: number;
  session: number;
  round?: number;
  actor?: EventParty;
  target?: EventParty;
  data?: {
    natural?: number; total?: number; label?: string;
    damage?: number; fromLevel?: number; toLevel?: number;
    title?: string; description?: string;
  };
  createdBy: string;       // uid
  highlight: Highlight | null;
  dismissed?: boolean;     // el DM descartó el momento automático
}
```

```ts
// src/scripts/models/session.ts (nuevo)
export interface Session {
  number: number;          // = id del documento, como string
  title?: string;          // ≤ 80, opcional
  startedAt?: number;      // se completa al primer "Iniciar" de la sesión
  endedAt?: number;
  updatedAt: number;
}
```

```ts
// src/scripts/models/character.ts — agregar a Character
deathSaves?: {
  successes: 0 | 1 | 2 | 3;
  failures: 0 | 1 | 2 | 3;
  stable: boolean;         // 3 éxitos o estabilizado por el DM
  dead: boolean;           // 3 fallos o marcado por el DM
};
```

`diceRoll.kind` suma el valor `'death_save'`. Las salvaciones son tiradas públicas: generan entrada de bitácora como cualquier otra.

**Firestore**

- `campaigns/{cid}/events/{eventId}`, con id `ev-${Date.now().toString(36)}${random4}`.
- `campaigns/{cid}/sessions/{n}`.
- `campaigns/{cid}.sessionNumber`: ya existe.

**Índices:** `events` por `at` (ventana en vivo), por `session` + `at` (sesión) y por `highlight.source` + `at` (timeline). El plan define el `firestore.indexes.json`.

**Funciones puras** (con tests)

- `src/scripts/memory/autoHighlight.ts`: `autoHighlight(event, sessionContext)`.
- `src/scripts/memory/eventTitles.ts`: `defaultTitle(event)`, el título generado en español.
- `src/scripts/memory/sessionChoice.ts`: `shouldAskNewSession(lastPauseAt, now, sessionCreatedAfterPause)` (umbral de 12 h).
- `src/scripts/dnd/deathSaves.ts`: `applyDeathSave(state, natural)`, `isDown(sheetHp, combatantHp)` y `resetIfRecovered(state, …)`.
- `src/scripts/memory/sceneQueue.ts`: cola, prioridades y descarte.

## Seguridad y reglas

```
match /events/{eventId} {
  allow read: if signedIn() && isMember(campaignId);

  allow create: if signedIn() && isMember(campaignId)
    && request.resource.data.createdBy == uid()
    && request.resource.data.at is number
    && request.resource.data.session is int
    && validEventShape(request.resource.data)
    && (
      // DM: cualquier tipo, con la partida activa
      (isDm(campaignId) && canPlay())
      // Jugador: solo sus tiradas y su propio PJ
      || (request.resource.data.type in ['crit', 'fumble', 'down', 'stabilized', 'revived', 'death']
          && request.resource.data.actor.uid == uid() && canPlay())
      // Subir de nivel suele pasar entre sesiones: también en pausa
      || (request.resource.data.type == 'level_up'
          && request.resource.data.actor.uid == uid() && canPrepare())
    );

  // Curaduría: solo el DM, solo highlight/dismissed, en cualquier estado (P4)
  allow update: if signedIn() && isDm(campaignId)
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['highlight', 'dismissed']);

  allow delete: if signedIn() && isDm(campaignId) && canPrepare();
}

match /sessions/{n} {
  allow read: if signedIn() && isMember(campaignId);
  // "Sesión nueva" solo con la partida en pausa
  allow create: if signedIn() && isDm(campaignId)
    && campaign(campaignId).data.get('status', 'paused') == 'paused';
  // El título se edita en cualquier estado (P4)
  allow update: if signedIn() && isDm(campaignId)
    && request.resource.data.get('title', '').size() <= 80;
  allow delete: if false;
}
```

Las salvaciones viven en `characters/{id}.deathSaves`: las escribe el dueño, con las reglas actuales de la hoja (D8). No hacen falta reglas nuevas para eso.

`validEventShape`: `type` dentro de la lista, strings con límites (nombres ≤ 80, título ≤ 120, nota ≤ 500), `highlight` nulo o con la forma de `Highlight`, y como máximo un nivel de anidamiento en `data`. Un jugador solo puede crear eventos con `highlight` nulo o `source == 'auto'`.

## Requisitos funcionales

Prioridad: **M** = obligatorio en v1, **S** = deseable.

**Registro de eventos**

| ID | Requisito | Prio |
| --- | --- | --- |
| RF-100 | Una tirada pública de d20 con natural 20 o 1 crea un evento `crit` o `fumble` con actor, objetivo (si hay), natural y total, con dados digitales o físicos. | M |
| RF-101 | Cuando un PJ llega a 0 PG (en combate o en su hoja) se crea `down`; cuando un enemigo llega a 0 en combate, `defeated`. No se duplica si ya estaba en 0. | M |
| RF-102 | El DM puede marcar a mano a un PJ caído como muerto o estabilizado, lo que crea `death` o `stabilized`. | M |
| RF-103 | Subir de nivel un PJ de una campaña crea `level_up` con el nivel anterior y el nuevo, también con la partida en pausa. | M |
| RF-104 | Registrar un hito, iniciar y terminar un combate crean sus eventos. | M |
| RF-105 | Las entradas de bitácora de tiradas guardan los datos estructurados (`die`, `natural`, `kind`, `isCrit`, `isFumble`, `physical`, `targetName`, `hit`). | M |
| RF-106 | Las tiradas secretas no generan eventos. | M |

**Sesiones como episodios**

| ID | Requisito | Prio |
| --- | --- | --- |
| RF-110 | El DM tiene un botón "Sesión nueva", habilitado solo con la partida en pausa (UI y reglas), que cierra la sesión anterior, suma 1 al número de sesión y crea el documento de la nueva, con título opcional. | M |
| RF-111 | Al iniciar la partida en una sesión nueva se completa `startedAt` y se emite `session_start`. | M |
| RF-114 | Si el DM inicia la partida más de 12 h después de la última pausa sin haber creado una sesión nueva, la app pregunta "Sesión nueva e iniciar" o "Continuar"; con menos de 12 h no pregunta. | M |
| RF-112 | El título del episodio es opcional y el DM lo edita en cualquier momento, incluso con la partida terminada. | M |
| RF-113 | Las sesiones previas sin documento aparecen como "Sesión N" y se les puede poner título. | S |

**Escenas**

| ID | Requisito | Prio |
| --- | --- | --- |
| RF-120 | Cada evento con escena la reproduce una vez en todos los dispositivos de la campaña que estén abiertos, en menos de 2 s. | M |
| RF-121 | Las escenas van en cola, duran como máximo 3 s (episodio 5 s) y se saltean con un toque. | M |
| RF-122 | El jugador elige escenas: todas, solo importantes o ninguna; con `prefers-reduced-motion` se usa una versión estática. | M |
| RF-123 | La tarjeta de episodio aparece para todos al empezar una sesión nueva. | M |
| RF-124 | La celebración de hitos se dispara desde el evento `milestone`. | M |
| RF-125 | Las escenas usan el retrato del personaje cuando existe. | S |

**Momentos épicos**

| ID | Requisito | Prio |
| --- | --- | --- |
| RF-130 | Los eventos se marcan como momento automáticamente según `autoHighlight`. | M |
| RF-131 | El DM marca y desmarca momentos, con título y nota opcionales, en cualquier estado de la partida. | M |
| RF-132 | `/partida` muestra el timeline de momentos agrupado por episodio. | M |
| RF-133 | La hoja muestra los momentos del personaje. | M |
| RF-134 | Al pausar o terminar, el DM ve "Destacados de la sesión" para curar (opcional). | S |

**Salvaciones contra la muerte**

| ID | Requisito | Prio |
| --- | --- | --- |
| RF-135 | La hoja guarda las salvaciones contra la muerte (éxitos, fallos, estable, muerto) y las muestra mientras el PJ está caído (PG de la hoja o de su combatiente en 0). | M |
| RF-136 | "Tirar salvación" usa el lanzador (digital o físico) y aplica el resultado según las reglas de 5e (10+, 2–9, 1 natural, 20 natural); las casillas también se editan a mano. | M |
| RF-137 | Tres éxitos, tres fallos o un 20 natural emiten `stabilized`, `death` o `revived`; con 20 natural el PJ queda con 1 PG en la hoja. | M |
| RF-138 | El DM ve los contadores de los PJ caídos en el combate; su "Estabilizar" manual reinicia los contadores en el cliente del dueño. | M |
| RF-139 | El aviso de turno de un PJ caído invita a tirar la salvación; un `revived` ofrece al DM actualizar los PG del combatiente. | S |

## Plan de tareas por fases

```
Fase A (eventos) ──┬──► Fase B (sesiones) ──┐
                   ├──► Fase C (escenas) ───┼──► Fase D (momentos)
                   ├────────────────────────┘
                   └──► Fase E (salvaciones contra la muerte)
```

La Fase C necesita `alerts.ts` (Spec 02, T-63) para el sonido; sin eso, las escenas salen mudas.

### Fase A — Registro de eventos (I-10)

- [ ] T-100 Tipos `event.ts` y `session.ts`; reglas de `events` y `sessions` con tests del emulador (creación por rol, tipo y estado; curaduría; forma) e índices.
- [ ] T-101 `src/scripts/data/eventService.ts`: `emitEvent`, `subscribeRecentEvents(cid, cb)` (ventana de 45 s, un listener por pestaña), `listSessionEvents`, `listHighlights` (paginado), `setHighlight`.
- [ ] T-102 Datos estructurados en `DiceRollerModal` (RF-105) y emisión de `crit` / `fumble` (RF-100, RF-106).
- [ ] T-103 Emisión desde el combate: `down`, `defeated`, `combat_start`, `combat_end`; botones "Muerto" y "Estabilizado" para el DM sobre un PJ en 0 PG (RF-101, RF-102, RF-104).
- [ ] T-104 Emisión desde la hoja: `down` cuando el dueño baja sus PG a 0 y `level_up` (RF-101, RF-103). Hito → `milestone` (RF-104).

### Fase B — Sesiones como episodios (I-24)

- [ ] T-105 Botón "Sesión nueva" en `SessionStatusControls` (solo en pausa) con su diálogo, y `startNewSession(cid, title?)` en un servicio de sesiones; `setSessionStatus` completa `startedAt` y emite `session_start` al iniciar una sesión nueva (RF-110, RF-111).
- [ ] T-105b `sessionChoice.ts` con tests y recordatorio de las 12 h al tocar "Iniciar" (RF-114).
- [ ] T-106 Lista de episodios en `/partida` y edición del título por el DM en cualquier estado; sesiones previas sin documento (RF-112, RF-113).

### Fase C — Escenas (I-20)

- [ ] T-107 `sceneQueue.ts` con tests y `src/scripts/ui/scenes.ts`: overlay, cola, salto con un toque, versión reducida y preferencias (RF-121, RF-122).
- [ ] T-108 Componente global `SceneDirector.astro`, montado en `/campaigns` (hoja y panel del DM) y en `/partida`, conectado a `subscribeRecentEvents` (RF-120).
- [ ] T-109 Catálogo de escenas con anime.js y retratos (RF-125); tarjeta de episodio (RF-123); hito migrado al evento (RF-124).

### Fase D — Momentos épicos (I-11)

- [ ] T-110 `autoHighlight.ts` y `eventTitles.ts` con tests; `emitEvent` aplica `autoHighlight` al crear (RF-130).
- [ ] T-111 Timeline de campaña en `/partida` y "Recuerdos" en la hoja (RF-132, RF-133).
- [ ] T-112 Curaduría del DM: marcar, desmarcar, título y nota; "Destacados de la sesión" al pausar o terminar (RF-131, RF-134).

### Fase E — Salvaciones contra la muerte · depende de la Fase A

- [ ] T-113 `deathSaves.ts` con tests (todas las filas de la tabla de la sección 5, reinicio al recuperar PG, PJ caído por la hoja o por el combate); campo `deathSaves` en el modelo de personaje y en la sincronización (RF-135).
- [ ] T-114 Panel de salvaciones en `VitalsGrid`: casillas editables y "Tirar salvación" con `kind: 'death_save'`; emisión de `stabilized`, `death` y `revived` (RF-136, RF-137).
- [ ] T-115 Contadores de solo lectura en `CombatTracker`; "Estabilizar" del DM reinicia los contadores en el cliente del dueño; oferta de actualizar el combatiente ante un `revived` (RF-138, RF-139).
- [ ] T-116 Integración con el aviso de turno de la Spec 02 para un PJ caído (RF-139).

## Criterios de aceptación, cuotas y pruebas

**Presupuesto de cuota (Spark)** — sesión de 4 h, 1 DM, 5 jugadores, ~200 tiradas.

| Concepto | Escrituras | Lecturas |
| --- | --- | --- |
| Eventos (~20 crít./pifias, ~15 caídos/derrotados, ~10 otros) | ~45 | ~45 × 6 = 270 |
| Datos estructurados en la bitácora | 0 (misma escritura) | 0 |
| Sesiones (inicio, cierre, título) | ~3 | ~20 |
| Timelines (abrir la sección, páginas de 20) | — | ~200 |
| Curaduría del DM | ~10 | ~50 |
| **Extra aproximado por sesión** | **~60** | **~550** |

Muy por debajo de la cuota diaria, sumado a las Specs 01 y 02.

**Criterios de aceptación**

1. Un jugador saca un 20 natural (digital o físico) en un ataque: todos los dispositivos abiertos de la campaña ven la escena de crítico en menos de 2 s, una sola vez.
2. Una tirada secreta con 20 natural no genera evento ni escena.
3. El DM baja a 0 los PG de un PJ en combate: se crea `down`, se ve la escena y aparece como momento en el timeline de la campaña y en la hoja del personaje.
4. Con la partida en pausa, el DM toca "Sesión nueva" sin título y después "Iniciar": todos ven la tarjeta "Sesión N+1". Con la partida iniciada, el botón está deshabilitado y las reglas rechazan crear la sesión.
5. Iniciar la partida al día siguiente sin haber creado una sesión nueva pregunta "Sesión nueva e iniciar" o "Continuar"; reanudar tras un descanso de 20 minutos no pregunta nada.
6. Un PJ caído tira tres salvaciones con 10 o más: queda estabilizado, se emite `stabilized` y todos ven la escena. Con un 20 natural, vuelve con 1 PG.
7. Con la partida terminada, el DM le pone título a un episodio viejo y marca un momento; un jugador no puede hacer ninguna de las dos cosas (tests del emulador).
8. Un jugador no puede crear eventos a nombre de otro ni de tipos reservados al DM (tests del emulador).
9. Después de una sesión, la campaña muestra un timeline con sus momentos sin que nadie los haya escrito a mano.
10. Con "Escenas: ninguna" no se reproduce nada; con `prefers-reduced-motion`, solo la versión estática.
11. `pnpm test`, `pnpm test:rules` y `pnpm build` pasan sin errores.

**Pruebas**

- Unitarias: `autoHighlight` (primer crítico y primera pifia por personaje y sesión, el segundo no; `down` repetido), `defaultTitle`, `shouldAskNewSession` (límite de 12 h), `sceneQueue` (orden, descarte, prioridad), `deathSaves` (cada resultado, acumulación, reinicio).
- Reglas: matriz rol × tipo × estado para `events`; curaduría en `ended`; `sessions` en los tres estados.
- Manual: DM y dos jugadores; una sesión corta con un combate, un crítico, un PJ caído y estabilizado, un hito y una subida de nivel en pausa.

## Decisiones tomadas

Resueltas el 9 nov 2026.

- [x] **Cambio de sesión.** → Botón "Sesión nueva", solo con la partida en pausa, para que nadie escriba en la bitácora durante el cambio.
- [x] **Umbral de 12 h.** → Se mantiene, como recordatorio al iniciar si no se creó una sesión nueva.
- [x] **Salvaciones contra la muerte.** → Entran en esta spec (sección 5, Fase E).
- [x] **Tarjeta sin título.** → Muestra "Sesión N".
- [x] **Críticos y pifias como momento.** → El primer crítico y la primera pifia de cada personaje en cada sesión son momentos automáticos.

## Preguntas abiertas

- [ ] **PG del combate y de la hoja.** Hoy son independientes (F1-3), y eso obliga a que "caído" mire los dos. ¿Conviene, en una spec futura, sincronizarlos (el daño del combate baja los PG de la hoja)?
- [ ] **Momentos propuestos por jugadores.** v1: solo el DM. ¿Querés que los jugadores puedan proponer (y el DM aprueba) más adelante?
