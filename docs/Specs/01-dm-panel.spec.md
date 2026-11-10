# Spec: VTT y panel de DM — dnd.gonzabena.com.ar

Nov 8, 2026 · @Gonzalo Benavente

## Objetivo y alcance

Agregar al panel del DM un módulo de combate (iniciativa) y un mapa táctico en tiempo real con tokens arrastrables, sin servidor propio y dentro de la free tier de Firebase.

**Dentro del alcance (v1)**

- Tracker de iniciativa y combate: orden de turnos, HP, condiciones, rondas.
- Mapa táctico: imagen de fondo, grilla, zoom y pan.
- Tokens: crear, mover (con snap a la grilla), ocultar y mostrar, con permisos por jugador.
- Sincronización en vivo entre DM y jugadores, con movimiento fluido mientras se arrastra.
- Niebla de guerra simple, controlada por el DM.
- Notas privadas del DM.

**Fuera del alcance (v1)**

- Iluminación dinámica y línea de visión.
- Hojas de personaje completas (ya existe gestión básica de jugadores).

**Usuarios**

| Rol | Qué puede hacer |
| --- | --- |
| DM | Todo: crear mapas, tokens, niebla, iniciativa, notas privadas. |
| Jugador | Ver el mapa revelado y mover únicamente sus propios tokens. |

## Vista de partida y estados de la sesión

Los jugadores hoy solo ven su hoja de personaje. Se agrega una vista de la partida para todos los miembros, y un estado de la partida que el DM controla y que las reglas de seguridad hacen cumplir.

**Vista de partida (ruta nueva)**

- Una sola página estática, por ejemplo `/partida?id=<campaignId>`, que lee el ID en el cliente y se carga como isla `client:only`. No se generan páginas por campaña en build.
- Muestra solo lo que un jugador puede ver: mapa activo, orden de iniciativa, compañeros del grupo, bitácora con visibilidad `party` y handouts.
- Convive con el panel del DM (solo DM) y con la hoja de personaje (solo su dueño). El DM también puede abrir la vista de partida para ver lo que ven los jugadores.
- Esconder la ruta no es seguridad: lo que impide el acceso son las reglas de Firestore y RTDB.

**Estados de la partida**

| Estado | Significado |
| --- | --- |
| `active` (iniciada) | Se está jugando. |
| `paused` (pausada) | No se está jugando; la partida se puede leer pero no modificar. Es el estado inicial de una partida recién creada. |
| `ended` (terminada) | La partida concluyó pero se conserva como registro. Solo lectura para todos. |

**Quién puede hacer qué en cada estado**

| Acción | Iniciada | Pausada | Terminada |
| --- | --- | --- | --- |
| Todos: ver mapa activo, tokens, iniciativa, grupo y bitácora `party` | Sí | Sí | Sí |
| Jugador: mover sus propios tokens | Sí | No | No |
| Jugador: modificar su hoja de personaje (solo su dueño) | Sí | Sí | Sí |
| DM: manejar combate, bitácora, mover cualquier token, niebla | Sí | No | No |
| DM: preparar contenido (mapas nuevos, tokens, notas privadas) | Sí | Sí | No |
| DM: cambiar el estado | Sí | Sí | Solo reabrir (vuelve a pausada) |

**Modelo de datos**

```ts
// campaigns/{cid}: agregar
interface CampaignStatusFields {
  status: 'active' | 'paused' | 'ended';   // por defecto 'paused'
  statusChangedAt: number;
}

// campaigns/{cid}/log/{entryId}: agregar
interface LogEntryVisibility {
  visibility: 'dm' | 'party';              // las entradas existentes migran a 'dm'
}

// RTDB: espejo del estado, lo escribe el DM junto con Firestore
// /status/{cid} = 'active' | 'paused' | 'ended'
```

**Cómo se hace cumplir**

1. En Firestore, las reglas leen `campaigns/{cid}` con `get()` y rechazan escrituras de jugadores cuando `status != 'active'`, y las del DM sobre combate, bitácora y movimiento de tokens cuando `status != 'active'`. Cada `get()` cuenta como una lectura, un costo aceptable a este volumen.
2. Las reglas de RTDB no pueden consultar Firestore: por eso el espejo `/status/{cid}`. La escritura de `live/...` solo se permite si ese nodo vale `active`.
3. El DM cambia el estado con una escritura en Firestore y otra en RTDB; la fuente de verdad es Firestore, y si el espejo no coincide, la UI lo corrige al conectarse.
4. Cada cambio de estado agrega una línea a la bitácora con fecha y hora (`party`), lo que da de paso la duración de cada sesión.
5. La UI refleja el estado: banner animado ("Partida pausada" o "Partida terminada") y controles de edición deshabilitados. Eso es solo ayuda visual; la garantía son las reglas.
6. Pasar a `ended` pide confirmación al DM, y nada se borra automáticamente en ningún estado.

## Stack, restricciones y reglas para el agente

**Stack existente (no cambiar)**

- Astro + TypeScript, salida **estática** (`output: 'static'`). Prohibido usar SSR, endpoints de servidor o adaptadores.
- anime.js para animaciones de UI.
- Firebase plan Spark (gratis): Auth, Firestore y Realtime Database, todo desde el navegador con el SDK modular.

**Dependencias nuevas permitidas**

- `konva` para el canvas del mapa (carga solo en cliente).
- Ninguna otra librería de estado o de UI sin consultarlo antes.

**Reglas para el agente**

1. Trabajar por fases (ver *Plan de tareas*) y no empezar una fase sin cerrar la anterior y sin que pasen todos los test.
2. El mapa es una isla de Astro con `client:only`. Nunca importar Konva ni el SDK de Firebase en código que corra en build.
3. Todo acceso a Firebase pasa por una capa `src/lib/` (ej. `firebase.ts`, `mapService.ts`, `liveService.ts`). Los componentes UI no llaman al SDK directo.
4. Tipar todo en TypeScript estricto; los modelos de datos viven en `src/types/`.
5. Animaciones de UI con anime.js; la animación de tokens remotos puede usar anime.js actualizando `node.x()/y()` de Konva en `onUpdate`.
6. Ante una decisión no cubierta por esta spec, elegir la opción más simple que respete la cuota gratuita, permita futura expansión de la idea y dejarla anotada en un comentario `// DECISION:`.
7. No mover ni renombrar el código existente del panel del DM (dados, jugadores, descansos, bitácora) salvo para integrarlo.

## Arquitectura en tiempo real

El movimiento en vivo va por Realtime Database (RTDB) y lo persistente va por Firestore, porque la cuota gratuita de Firestore (aprox. 20.000 escrituras y 50.000 lecturas por día) no aguanta eventos de arrastre.

```
Navegador (Astro + isla Konva, client:only)
   │
   ├─ Auth anónimo / Google ──► uid
   │
   ├─ ARRASTRE EN VIVO ──► RTDB  /live/{campaignId}/{mapId}/{tokenId} = {x, y, by}
   │       throttle ~50 ms, se borra al soltar
   │
   └─ ESTADO FINAL ─────► Firestore  campaigns/{cid}/maps/{mid}  (tokens en 1 documento)
           1 escritura al soltar
```

| Dato | Dónde | Cuándo se escribe |
| --- | --- | --- |
| Posición mientras se arrastra | RTDB `live/...` | Cada \~50 ms, solo durante el arrastre |
| Posición final del token | Firestore, documento del mapa | Una vez al soltar (con snap a la grilla) |
| Presencia y cursores (opcional) | RTDB `presence/...` | Al conectar y desconectar (`onDisconnect`) |
| Iniciativa y combate | Firestore, documento `combat` | En cada cambio de turno, HP o condición |
| Niebla revelada | Firestore, documento del mapa | Una vez al terminar de dibujar |
| Niebla oculta y notas del DM | Firestore, documento `dmOnly` | Solo el DM lo lee y escribe |

**Reglas de sincronización**

1. Al conectarse, el cliente carga un snapshot completo (`onSnapshot` del documento del mapa) y después aplica solo cambios.
2. Si existe un valor `live` para un token, se muestra esa posición; si no, la de Firestore.
3. Al soltar: escribir en Firestore, y recién después borrar el nodo `live` (evita parpadeo).
4. Las posiciones se guardan en **unidades del mapa** (celdas o píxeles de la imagen original), nunca en píxeles de pantalla.
5. Conflictos: gana la última escritura. Solo el dueño de un token (o el DM) puede moverlo, así que no hace falta CRDT.
6. Un solo `onSnapshot` por mapa activo y uno por documento `combat`; cerrar los listeners al cambiar de mapa.

## Modelo de datos

Las colecciones existentes (campañas, personajes, bitácora) se mantienen. Se agregan las rutas de abajo; los tipos van en `src/types/`.

**Firestore**

```ts
// campaigns/{cid}  (ya existe) -> asegurar estos campos
interface Campaign {
  dmUid: string;                 // uid del DM
  memberUids: string[];          // uids de los jugadores (para las reglas)
  activeMapId?: string;          // mapa que ven los jugadores
}

// campaigns/{cid}/maps/{mid}
interface MapDoc {
  name: string;
  imageUrl: string;              // URL externa (ver Preguntas abiertas)
  imageWidth: number;            // px de la imagen original
  imageHeight: number;
  grid: { size: number; offsetX: number; offsetY: number; visible: boolean };
  tokens: Record<string, Token>; // TODOS los tokens en un solo documento
  fogRevealed: FogShape[];       // zonas ya reveladas (visibles para jugadores)
  updatedAt: number;
}

interface Token {
  name: string;
  x: number; y: number;          // en unidades de imagen original
  size: 1 | 2 | 3 | 4;           // celdas por lado
  imageUrl?: string;
  color?: string;
  ownerUid: string | null;       // null = lo controla solo el DM
  characterId?: string;          // enlace a un personaje existente
  // no hay campo 'hidden': los tokens ocultos viven en dmOnly.secretTokens
}

type FogShape = { kind: 'rect'; x: number; y: number; w: number; h: number }
               | { kind: 'poly'; points: number[] };

// campaigns/{cid}/maps/{mid}/private/dmOnly   (solo DM)
interface DmOnly { secretTokens: Record<string, Token> } // al revelar, el DM lo mueve a MapDoc.tokens

// campaigns/{cid}/combat/current
interface Combat {
  active: boolean;
  round: number;
  turnIndex: number;
  combatants: Combatant[];       // ordenados por iniciativa descendente
}
interface Combatant {
  id: string; name: string; initiative: number;
  hp: number; maxHp: number; ac?: number;
  conditions: string[];          // 'poisoned', 'stunned', ...
  tokenId?: string;              // enlace al token del mapa
  isPlayer: boolean; hiddenHp: boolean;
}

// campaigns/{cid}/notes/{noteId}  (solo DM)
interface DmNote { title: string; body: string; updatedAt: number }
```

**Realtime Database**

```ts
// /live/{cid}/{mid}/{tokenId} = { x: number, y: number, by: string }   // by = uid
// /presence/{cid}/{uid}       = { name: string, online: boolean, lastSeen: number }
```

**Decisiones de modelo**

- Los tokens viven en un solo documento por mapa para que cada movimiento final cueste 1 escritura y 1 lectura por cliente conectado.
- Límite a vigilar: 1 MiB por documento y \~1 escritura por segundo sostenida por documento. Con 100 tokens por mapa sobra.
- Lo que los jugadores no deben ver (niebla oculta, tokens secretos, notas) nunca va en el documento del mapa, porque cualquier cosa que llegue al navegador del jugador es visible.

## Seguridad y reglas

Sin servidor, las Security Rules son la única autoridad: la UI del cliente nunca cuenta como control de acceso. Hay que escribir las reglas antes de exponer el mapa a jugadores y probarlas con el emulador.

Las escrituras de jugadores solo se permiten con la partida en estado `active`; ver la sección *Vista de partida y estados de la sesión*, que se suma a todas las reglas de abajo.

**Autenticación**

- Firebase Auth (anónimo o Google). Cada persona tiene un `uid` estable.
- El DM es `campaign.dmUid`; los jugadores están en `campaign.memberUids`.

**Reglas de Firestore (resumen de intención, el agente las escribe)**

| Ruta | Lectura | Escritura |
| --- | --- | --- |
| `campaigns/{cid}` | DM y miembros | Solo DM |
| `campaigns/{cid}/maps/{mid}` | DM y miembros | DM: todo. Jugador: solo puede cambiar `x` e `y` de tokens donde `ownerUid == request.auth.uid` |
| `campaigns/{cid}/maps/{mid}/private/**` | Solo DM | Solo DM |
| `campaigns/{cid}/combat/current` | DM y miembros | Solo DM |
| `campaigns/{cid}/notes/**` | Solo DM | Solo DM |

**Reglas de Realtime Database**

| Ruta | Lectura | Escritura |
| --- | --- | --- |
| `live/{cid}/{mid}/{tokenId}` | DM y miembros de la campaña | DM, o jugador dueño del token; el valor debe ser `{x, y, by}` con números y `by == auth.uid` |
| `presence/{cid}/{uid}` | DM y miembros | Solo el propio `uid` |

**Requisitos**

1. La regla de movimiento de jugador debe validar con `diff().affectedKeys()` que solo cambian `x` e `y` del token propio.
2. Las reglas de RTDB no pueden consultar Firestore; por eso la lista de miembros se duplica en `/members/{cid}/{uid}: true` (lo mantiene el DM) para poder validar acceso.
3. Escribir tests de reglas con el emulador de Firebase: un jugador no puede mover tokens ajenos, no puede leer `private/**` ni `notes/**`, y un extraño sin membresía no lee nada.
4. Limitar tamaño de strings y número de tokens por mapa en las reglas (por ejemplo, máximo 200).

## Requisitos funcionales

Cada requisito tiene un ID para referenciarlo en tareas y commits. Prioridad: **M** = obligatorio en v1, **S** = deseable.

**Combate e iniciativa**

| ID | Requisito | Prio |
| --- | --- | --- |
| RF-01 | El DM inicia un combate y agrega combatientes (jugadores de la campaña y monstruos manuales) con su iniciativa. | M |
| RF-02 | La lista se ordena por iniciativa descendente y marca el turno actual; botón "siguiente turno" avanza y suma ronda al volver al inicio. | M |
| RF-03 | El DM edita HP, HP máximo, CA y condiciones de cada combatiente; puede duplicar un monstruo ("Goblin 1, 2, 3") y se son independientes entre si. | M |
| RF-04 | Los jugadores ven el orden de turnos y su propio HP; el HP de monstruos con `hiddenHp` no se muestra. | M |
| RF-05 | Un combatiente puede enlazarse a un token del mapa; al llegar su turno, el token se resalta con animación. | S |

**Mapa**

| ID | Requisito | Prio |
| --- | --- | --- |
| RF-10 | El DM sube o enlaza una imagen de mapa, define el tamaño de la grilla y su desplazamiento, y puede mostrarla u ocultarla. | M |
| RF-11 | Zoom con rueda y pan arrastrando el fondo, también en pantalla táctil (pellizco). | M |
| RF-12 | El DM elige qué mapa es el activo; los jugadores cambian de mapa automáticamente, con transición animada. | M |
| RF-13 | Regla de medición: arrastrar una línea muestra la distancia en celdas y en pies. | S |
| RF-14 | Ping en el mapa: clic largo muestra un círculo animado visible para todos. | S |

**Tokens**

| ID | Requisito | Prio |
| --- | --- | --- |
| RF-20 | El DM crea tokens con nombre, tamaño (1 a 4 celdas), color o imagen, y dueño opcional. | M |
| RF-21 | Un token se arrastra con el mouse o el dedo y, al soltar, se ajusta a la grilla. | M |
| RF-22 | Mientras alguien arrastra, el resto ve el movimiento en vivo (RTDB); remotos se animan suavemente hacia la nueva posición. | M |
| RF-23 | Un jugador solo mueve sus tokens; el DM mueve cualquiera. Un intento de mover un token ajeno no hace nada. | M |
| RF-24 | El DM puede ocultar un token (pasa a `secretTokens`) y revelarlo (vuelve a `tokens`). | M |
| RF-25 | Elegir un token muestra su nombre y, si está enlazado, su HP y condiciones. | S |

**Niebla de guerra**

| ID | Requisito | Prio |
| --- | --- | --- |
| RF-30 | Por defecto el mapa está cubierto para los jugadores; el DM revela rectángulos (y luego polígonos) y puede volver a cubrir. | M |
| RF-31 | Para el DM la niebla se ve semitransparente; para jugadores es opaca. | M |

**Panel del DM (extras)**

| ID | Requisito | Prio |
| --- | --- | --- |
| RF-40 | Notas privadas del DM con título y texto, solo visibles para él. | M |
| RF-41 | Enviar un "handout" (imagen o texto) a los jugadores que lo ven en una ventana animada. | S |
| RF-42 | Presencia: se ve quién está conectado a la sesión. | S |
| RF-43 | Cada acción relevante (combate iniciado, token revelado, descanso) agrega una línea a la bitácora existente. | S |

**Vista de partida y estado de la sesión**

| ID | Requisito | Prio |
| --- | --- | --- |
| RF-50 | El DM cambia el estado de la partida entre iniciada, pausada y terminada, y puede reabrir una terminada (vuelve a pausada). Terminar pide confirmación. | M |
| RF-51 | Cada cambio de estado agrega una línea a la bitácora con fecha y hora. | M |
| RF-52 | Existe una ruta de partida para todos los miembros, con mapa activo, iniciativa, grupo y bitácora `party`. | M |
| RF-53 | Cada entrada de bitácora tiene visibilidad `dm` o `party`o `player` ; los jugadores solo ven las `party`o `player`(que serian las privadas del usuario) | M |
| RF-54 | En pausada, los jugadores pueden ver todo lo que ven normalmente (mapa, bitácora, etc.) pero no mover tokens ni modificar nada de la partida. | M |
| RF-55 | En terminada, la partida es solo lectura para todos, incluido el DM, hasta que se reabre. Los registros se conservan y no se borran solos. | M |
| RF-56 | La hoja de personaje solo la modifica su dueño, en cualquier estado. | M |
| RF-57 | La interfaz muestra un banner animado con el estado actual y deshabilita los controles que no corresponden. | S |

## Plan de tareas por fases

Orden pensado para tener algo usable en cada fase. Cada fase termina con un build estático exitoso (`astro build`) y sus criterios de aceptación cumplidos.

### Fase 0 — Base y seguridad

- [x] T-01 Habilitar Realtime Database en el proyecto Firebase existente (el mismo de Firestore) y exportar `rtdb` desde `src/lib/firebase.ts`.
- [x] T-02 Agregar Auth (anónimo o Google) y exponer `uid` actual.
- [x] T-03 Asegurar en `campaigns/{cid}` los campos `dmUid` y `memberUids` (migrar campañas existentes).
- [x] T-04 Escribir reglas de Firestore y RTDB según la sección *Seguridad*, con tests en el emulador.
- [x] T-05 Definir los tipos de `src/types/` (`MapDoc`, `Token`, `Combat`, `Combatant`, `DmNote`).

### Fase 0B — Vista de partida y estado de la sesión

- [x] T-06 Agregar `status` a las campañas (por defecto `paused`, migrar las existentes) y `visibility` a las entradas de bitácora (las existentes migran a `dm`).
- [x] T-07 Controles del DM para iniciar, pausar, terminar (con confirmación) y reabrir; cada cambio escribe en Firestore, en el espejo `/status/{cid}` de RTDB y en la bitácora.
- [x] T-08 Página `/partida?id=...` (isla `client:only`) con grupo, bitácora `party` y banner animado del estado; el mapa y la iniciativa quedan como espacios reservados hasta sus fases.
- [x] T-09 Reglas y tests del emulador para cada combinación de estado y rol, según la matriz de la sección *Vista de partida y estados de la sesión*; incluir que la hoja de personaje solo la modifica su dueño.

### Fase 1 — Iniciativa y combate (sin canvas)

Es la parte más usada por un DM y valida el flujo en vivo con la menor complejidad.

- [x] T-10 `combatService.ts`: suscripción a `combat/current` y funciones para agregar, editar y quitar combatientes.
- [x] T-11 UI del DM: lista ordenada, turno actual resaltado, HP y condiciones editables, botón siguiente turno.
- [x] T-12 Vista de jugador: orden de turnos y propio HP (RF-04).
- [x] T-13 Animación anime.js al cambiar de turno y al bajar el HP.
- [x] T-14 Registrar en la bitácora el inicio y fin del combate.

### Fase 2 — Mapa estático

- [x] T-20 Isla `MapStage.astro` con `client:only` y componente Konva (capas: fondo, grilla, tokens, niebla).
- [x] T-21 Subida o enlace de imagen, y configuración de grilla (tamaño, desplazamiento, visible).
- [x] T-22 Zoom y pan, incluido táctil.
- [x] T-23 `mapService.ts`: crear, listar y activar mapas; `onSnapshot` del mapa activo.
- [x] T-24 Cambio de mapa para jugadores con transición.

### Fase 3 — Tokens con sincronización en vivo

- [x] T-30 Crear, editar y borrar tokens (RF-20).
- [x] T-31 Arrastre local con snap a la grilla al soltar (RF-21).
- [x] T-32 `liveService.ts`: publicar posición en RTDB con throttle de 50 ms y limpiar con `onDisconnect`.
- [x] T-33 Recibir posiciones `live` de otros y animar el token remoto hasta la nueva posición (RF-22).
- [x] T-34 Al soltar: escritura única en Firestore y borrado del nodo `live`, en ese orden.
- [x] T-35 Permisos en cliente (UX) coherentes con las reglas (RF-23).
- [x] T-36 Prueba con dos navegadores y tres jugadores simulados.

### Fase 4 — Niebla y tokens ocultos

- [x] T-40 Herramienta de revelar y cubrir rectángulos (RF-30).
- [x] T-41 Render diferenciado DM y jugador (RF-31).
- [x] T-42 Mover tokens entre `tokens` y `dmOnly.secretTokens` (RF-24).
- [x] T-43 Verificar con reglas que un jugador no puede leer `private/**`.

### Fase 5 — Extras

- [x] T-50 Notas privadas del DM (RF-40).
- [x] T-51 Presencia y ping (RF-42, RF-14).
- [x] T-52 Handouts (RF-41). El DM elige los destinatarios (todos o jugadores concretos).
- [x] T-53 Regla de medición (RF-13).
- [x] T-54 Polígonos en la niebla. Resuelto con el pincel de niebla (no se implementó la herramienta de polígono).
- [x] T-55 Enlazar combatientes con tokens (RF-05, RF-25).
- [x] RF-43 Bitácora automática: token revelado y llegada a un mapa nuevo (solo con la partida `active`); combate y descansos ya registraban.

## Criterios de aceptación, cuotas y pruebas

**Presupuesto de cuota (Spark)**

Supuesto de diseño: sesión de 4 horas, 1 DM y 5 jugadores, 40 movimientos finales de tokens por hora y 100 cambios de combate por hora.

| Concepto | Escrituras Firestore | Lecturas Firestore |
| --- | --- | --- |
| Movimientos finales (4 h) | 160 | 160 × 6 clientes = 960 |
| Cambios de combate (4 h) | 400 | 400 × 6 clientes = 2.400 |
| Cargas iniciales de mapa y campaña | — | \~100 |
| **Total aproximado por sesión** | **\~560** | **\~3.500** |

Con eso se puede jugar varias sesiones por día dentro de las 20.000 escrituras y 50.000 lecturas diarias. El arrastre en vivo no consume Firestore.

**Criterios de aceptación**

1. Con dos navegadores abiertos, al arrastrar un token en uno, el otro lo ve moverse con menos de 300 ms de retraso percibido.
2. Recargar la página mantiene mapa, tokens, niebla y combate tal como estaban.
3. Un jugador no puede mover un token ajeno, ni siquiera editando el código desde la consola; las reglas lo rechazan (verificado con tests del emulador).
4. Un jugador no puede leer tokens ocultos, notas del DM ni `private/**` (verificado con tests).
5. Cerrar la pestaña durante un arrastre no deja nodos `live` colgados (`onDisconnect`).
6. `astro build` termina sin errores y el sitio resultante funciona servido como archivos estáticos.
7. En un celular de gama media, el mapa con 50 tokens mantiene un arrastre fluido (sin cuelgues visibles).
8. Una sesión simulada de 4 horas no supera el 25 % de la cuota diaria de Firestore.

**Criterios del estado de la partida**

- Con la partida pausada, un jugador no puede mover un token ni escribir en la partida, ni siquiera editando el código desde la consola (verificado con tests del emulador).
- Con la partida terminada, tampoco puede hacerlo el DM, hasta que la reabre.
- Un jugador puede modificar su propia hoja en los tres estados y no puede modificar la de otro.
- Un jugador no ve entradas de bitácora con visibilidad `dm`.
- Después de terminar una partida, mapa, tokens, combate y bitácora siguen consultables.

**Pruebas**

- Tests de reglas de Firestore y RTDB con el emulador (obligatorio antes de cerrar Fase 0 y Fase 3).
- Tests unitarios de utilidades puras: snap a grilla, conversión de coordenadas, orden de iniciativa, avance de turno y ronda.
- Prueba manual con dos navegadores (DM y jugador) por cada fase.

## Preguntas abiertas

Decisiones que conviene cerrar antes de que el agente llegue a la fase correspondiente. Resueltas el 8 nov 2026; los planes por fase están en `docs/Plans/01-dm-panel/`.

- [x] **Imágenes de mapas (Fase 2).** Firebase Storage ahora puede exigir el plan Blaze (de pago) para buckets nuevos: verificarlo en la consola. Alternativas gratuitas: Cloudinary, Cloudflare R2, o imágenes en `public/` para mapas fijos. ¿Cuál preferís?
  → **URL externa `https://`** pegada por el DM, sin almacenamiento propio.
- [x] **Login (Fase 0).** ¿Auth anónimo (entran con un link o código de campaña) o Google? Anónimo es más fácil para jugadores, pero pierden su identidad si borran los datos del navegador.
  → **Se mantiene lo existente**: Google + email/contraseña (`src/scripts/firebase/authService.ts`).
- [x] **Jugadores ya existentes.** ¿Los personajes actuales tienen un `uid` asociado o hay que vincular cada jugador a su personaje?
  → Ya tienen `characters/{id}.userId` (uid del dueño); no hace falta vincular.
- [x] **Monstruos (Fase 1).** ¿Solo carga manual o también usar la API abierta de D&D 5e para traer estadísticas?
  → **Solo carga manual** en v1.
- [x] **Alcance de la niebla.** ¿Alcanzan los rectángulos en v1 o querés polígonos desde el principio?
  → **Rectángulos en v1**; polígonos en Fase 5 (T-54).
- [x] **Unidades de distancia.** ¿5 pies por celda o metros (1,5 m)?
  → **5 ft por celda**.
- [ ] **Hosting.** Confirmar dónde se despliega (Firebase Hosting, Netlify u otro) para ajustar las reglas de dominio autorizado en Auth.
- [x] **DM en pausada.** Asumí que el DM puede preparar contenido (mapas nuevos, tokens, notas privadas) pero no manejar combate ni bitácora. ¿O pausada es solo lectura también para el DM?
  → **Confirmado**: en pausada el DM prepara contenido (mapas, tokens, ocultar/revelar, notas) pero no maneja combate, bitácora, movimiento ni niebla.
- [x] **Hoja de personaje y panel del DM.** La hoja solo la modifica su dueño, pero el panel del DM ya gestiona nombre, raza y nivel de los miembros. ¿Son los mismos datos? Si lo son, ¿el DM sigue pudiendo editarlos desde el panel?
  → La hoja la modifica **solo su dueño**. Excepción: el DM conserva `hp` e `inspiration` (descansos y botones de PG del panel), solo con la partida `active`.
- [x] **Hoja en partida terminada.** Según lo pedido, el dueño puede editar su hoja siempre, también en `ended`. ¿Querés congelarla para conservar el registro?
  → **No se congela**: el dueño la edita en cualquier estado.
