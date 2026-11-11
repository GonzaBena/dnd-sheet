# Spec: Cimientos de la hoja — dnd.gonzabena.com.ar

Nov 10, 2026 · @Gonzalo Benavente

Etapa H1 del [roadmap](../ROADMAP.md). Parte de [`NOTAS.notas.md`](../NOTAS.notas.md).

## Objetivo y alcance

Que la hoja de personaje tenga **un lugar donde vivan los efectos y los recursos**, y que objetos, hechizos y dotes sean datos estructurados que se puedan abrir en un modal común. Es la base de las etapas H2 a H7: armaduras, descansos, combate, reacciones y alcance cuelgan de estos modelos.

Al cerrarla, el jugador puede agregar un objeto propio y uno del catálogo, abrirlos en un modal genérico, y ver aparecer y expirar un efecto con duración en un panel.

**Dentro del alcance (v1)**

- Registro unificado de **recursos** con regla de reinicio, y espacios de conjuro de nivel 1 a 9.
- Migración de `wildShape`, `features[].uses` y los espacios 1–2 al registro nuevo.
- Registro de **efectos activos** con duración, modificadores y expiración por ronda o descanso.
- **Catálogo base + entradas propias** de objetos, hechizos y dotes, con el mismo esquema.
- **Modal genérico de objeto** y **modal genérico de hechizo**.
- Panel **"Efectos activos"** en la hoja.

**Fuera del alcance (v1)**

- Que los modificadores cambien números: CA derivada y armaduras (H2), ventaja y desventaja (H4). H1 los guarda y expone `collectModifiers`, pero nadie los lee todavía.
- Dados de golpe con tiradas en el descanso (H3).
- Validación de conjuros y componentes, concentración completa (H4).
- El DM aplicando o quitando efectos en la hoja de un jugador, y las reacciones (H5).
- Catálogo editable por campaña, o una biblioteca de entradas propias compartida entre personajes.
- Cargar efectos estructurados a todo el SRD: el catálogo trae texto y, a lo sumo, unos pocos efectos de ejemplo.

**Usuarios**

| Rol | Qué gana |
| --- | --- |
| Jugador | Sabe qué efectos tiene activos y cuánto duran; lleva la cuenta de sus recursos sin escribirla a mano; abre cualquier objeto o hechizo en una ficha clara; crea los suyos propios. |
| DM | Ve la misma ficha de objeto y hechizo en los handouts y el botín. Aún no aplica efectos a los jugadores (H5). |

## Estado actual del repo (punto de partida)

| Tema | Qué hay | Dónde |
| --- | --- | --- |
| Personaje | `CharacterData` en un documento `characters/{id}`; subtipos `AttackAction`, `SpellItem`, `InventoryItem`, `WildShapeForm` | `src/scripts/models/character.ts:101-205` |
| Recursos | Sin registro. `wildShape` tiene `usesTotal/usesRemaining`; `features[].uses` es un string libre; `hitDice` aparte | `character.ts`, `characterStore.ts` |
| Espacios de conjuro | Solo `level1` y `level2`, con `{total, used}` | `character.ts:169-172`, `characterStore.ts:466,480` |
| Descansos | `shortRest(n)` y `longRest()` restauran cada recurso a mano y escriben en la bitácora | `characterStore.ts:608,636` |
| Bug conocido | `RestModal` lee `hitDice.dieType` y el campo se llama `die` | `RestModal.astro:108` |
| Cálculos | `recalculateCharacter(char)` normaliza y calcula; la CA es un número manual; no hay ventaja ni desventaja | `src/scripts/dnd/calculations.ts:47` |
| Catálogo SRD | JSON por edición (`spells`, `equipment`, `magic-items`, `feats`, `classes`), solo texto, con caché en IndexedDB | `public/data/srd/{2014,2024}/`, `src/scripts/api/srdCacheManager.ts` |
| Modales de alta | `AddItemModal`, `AddSpellModal`, `AddWeaponModal`, `EditFeaturesModal`, `EditAttunedModal`; navegador `CompendiumModal` | `src/components/modals/` |
| Sobre de pergamino | `showParchment({title, sender, message, imageUrl, items[]…})` | `src/scripts/ui/parchmentModal.ts:53` |
| Condiciones | `DND_CONDITIONS` (15) solo para combatientes; el personaje no las tiene | `src/scripts/vtt/conditions.ts:11` |
| Reglas del personaje | El dueño crea y actualiza; el DM solo escribe `hp`, `inspiration` y `updatedAt`. No se valida la forma de los campos | `firestore.rules:282-318` |
| Combate | Documento `combat/current` con `turnIndex` y `round`, escrito solo por el DM | `src/scripts/data/combatService.ts` |

## Stack, restricciones y reglas para el agente

Se mantienen las de las specs anteriores y sus decisiones D1–D13 (`docs/Plans/01-dm-panel/README.md`):

- Astro estático, sin SSR. Componentes `.astro` + `<script>`, sin framework UI. Comunicación con `CustomEvent` en `window`.
- Firebase (plan Spark) solo a través de `src/scripts/data/`. Tipos en `src/scripts/models/`. Lógica pura en `src/scripts/dnd/` o `src/scripts/utils/`, con tests `node:test` (sin `enum`: Node importa los `.ts` directo).
- Decisiones no cubiertas: la opción más simple que respete la cuota, anotada con `// DECISION:`.
- Las incompatibilidades **avisan, no bloquean** (regla 3 del roadmap).

**Dependencias nuevas:** ninguna.

## 1. Recursos

Un **recurso** es todo lo que se gasta y se recupera: Inspiración Bárdica, Furia, Forma Salvaje, usos de una dote, dados guardados del mago. Cada uno tiene nombre, máximo, usados y una regla de reinicio: cada turno, descanso corto, descanso largo o manual.

- El jugador crea, edita, gasta, recupera y borra recursos.
- Los espacios de conjuro pasan a cubrir los niveles 1 a 9, con la misma forma `{total, used}`.
- Un recurso puede guardar **valores concretos** (por ejemplo los dos dados que el mago tira en el descanso largo), además del contador.
- Los descansos dejan de restaurar cada cosa a mano: recorren el registro y reinician lo que corresponde. La mecánica de tirar dados de golpe queda para H3.
- **Migración:** al abrir un personaje antiguo, `wildShape` y los `features[].uses` con formato reconocible (`"2/2"`, `"3"`) pasan a recursos, y los espacios 1–2 se amplían a 1–9, sin perder lo ya gastado. Lo que no se reconoce queda como texto.

## 2. Efectos activos

Un **efecto activo** es algo que está pasando ahora en el personaje: un hechizo en curso, el beneficio de un objeto, una dote activada, una condición impuesta.

- Cada efecto tiene nombre, origen (hechizo, objeto, dote, DM o propio), **duración**, una lista de **modificadores** y, opcionalmente, un recurso vinculado.
- Duraciones: **N rondas**, hasta un descanso (corto o largo), concentración, hasta que se use, o indefinida.
- Los efectos por rondas se descuentan solos cuando avanza la ronda del combate. Como el DM no escribe el documento del jugador, **el propio cliente del jugador** detecta el cambio de ronda y descuenta; una marca `lastRound` evita descontar dos veces.
- Los descansos quitan los efectos "hasta el descanso" que corresponden.
- Un **modificador** dice a qué afecta (`target`), qué hace (`add`, `set`, `advantage`, `disadvantage`, `resistance`) y, opcionalmente, una condición (`when`) que H4 sabrá evaluar. En H1 se guardan; `collectModifiers(char, target)` los reúne para que H2 y H4 los lean.
- Si se aplica un efecto de **concentración** con otro activo, la hoja avisa y ofrece reemplazarlo. La salvación al recibir daño queda para H4.

## 3. Catálogo base y entradas propias

Objetos, hechizos y dotes tienen un **esquema común** (`CatalogEntry`): tipo, origen, nombre, descripción, imagen opcional, datos propios del tipo y efectos opcionales.

- El **catálogo base** es el SRD que ya está en `public/data/srd/`. Un adaptador lo convierte al esquema común. No trae efectos estructurados: solo texto.
- Las **entradas propias** las crea el jugador a mano y se guardan **dentro del personaje**, con `source: 'custom'`. No hay colecciones nuevas.
- Las entradas propias llevan una insignia visible.
- Las dotes ganan un **tipo** (`passive`, `conditional`, `active`, `reaction`) y un recurso opcional. Los efectos estructurados son opcionales: sin ellos, la dote es solo texto, como hoy.
- Objetos y hechizos pueden tener **imagen** (URL).

## 4. Modales genéricos

- **Modal de objeto:** imagen arriba a la izquierda; a su lado, título, rareza, tipo y peso; debajo, descripción, propiedades (daño, CA, alcance), efectos que aplica y requisitos o sintonización; al pie, los botones de acción.
- **Modal de hechizo:** igual, con nivel, escuela, tiempo de lanzamiento, alcance, componentes, duración, concentración, ritual y escalado a niveles superiores. El botón de lanzar muestra el selector de espacio, sin validar todavía (eso es H4).
- Se abren desde el inventario, el compendio y la hoja, y el mismo componente sirve para el botín y los handouts.
- Lo que muestran sale de los mismos datos que usa el motor, así la descripción y el comportamiento no se desincronizan.

## 5. Panel de efectos activos

Una franja o columna de la hoja con un chip por efecto activo: nombre, origen, duración restante (por ejemplo "2 rondas" o "hasta descanso largo") y un botón para terminarlo. Si no hay efectos, queda oculto. Desde un hechizo o dote, un botón "Aplicar efecto" lo agrega con la duración correcta.

## Modelo de datos

Todo vive en `characters/{id}` como campos de primer nivel nuevos. Las reglas actuales no validan la forma, así que no cambian.

```ts
// models/resource.ts
export type RechargeOn = 'turn' | 'shortRest' | 'longRest' | 'manual';
export interface Resource {
  id: string; name: string;
  max: number; used: number;
  rechargeOn: RechargeOn;
  source?: string;           // 'feature:<id>' | 'wildShape' | 'custom'
  values?: number[];         // dados guardados
}

// models/effect.ts
export type EffectDuration =
  | { kind: 'rounds'; remaining: number }
  | { kind: 'untilRest'; rest: 'short' | 'long' }
  | { kind: 'concentration' }
  | { kind: 'untilUsed' }
  | { kind: 'indefinite' };
export interface Modifier {
  target: string;            // 'ac', 'attack', 'save.dex', 'skill.stealth', 'speed', …
  op: 'add' | 'set' | 'advantage' | 'disadvantage' | 'resistance';
  value?: number | string;
  when?: string;             // lo evalúa H4
}
export interface ActiveEffect {
  id: string; name: string;
  sourceType: 'spell' | 'item' | 'feat' | 'dm' | 'custom';
  sourceId?: string;
  duration: EffectDuration;
  modifiers: Modifier[];
  resourceId?: string;
  appliedAt: number;
}

// models/catalog.ts
export interface CatalogEntry {
  id: string; kind: 'item' | 'spell' | 'feat';
  source: 'srd' | 'custom';
  name: string; description: string; imageUrl?: string;
  meta: Record<string, unknown>;
  effects?: Modifier[];
}
```

Campos nuevos del personaje: `resources: Resource[]`, `activeEffects: ActiveEffect[]` y `effectsLastRound?: { campaignId: string; round: number }`. `spellcasting.slots` pasa a `Record<1..9, {total, used}>`.

## Seguridad y reglas

- **Requisitos de seguridad**
  - Solo el dueño escribe `resources`, `activeEffects` y `effectsLastRound`. El DM sigue limitado a `hp`, `inspiration` y `updatedAt` (RF-256, test del emulador).
  - No se crean colecciones ni reglas nuevas.
  - Las URL de imagen se tratan como datos: se muestran en un `<img>`, nunca se insertan como HTML. Los textos de descripción se escapan al renderizar.

## Presupuesto de cuota (Spark)

Todo va al mismo documento del personaje y con el debounce que ya existe (`cloudSync.ts:545`).

| Concepto | Escrituras | Lecturas |
| --- | --- | --- |
| Gastar o recuperar un recurso | 1 por cambio, agrupadas por debounce | 0 |
| Aplicar o terminar un efecto | 1 por cambio | 0 |
| Descontar rondas | 1 por jugador y por ronda con efectos por rondas | 0 (ya escucha el combate) |
| Descanso | 1 por jugador | 0 |

Supuesto: 5 jugadores, 4 h de sesión, unas 30 rondas, 2 efectos por rondas por jugador en promedio: del orden de 150 escrituras extra por sesión, despreciable frente a las 20.000 diarias.

## Requisitos funcionales

Prioridad: **M** = obligatorio en v1, **S** = deseable.

**Recursos**

| ID | Requisito | Prio |
| --- | --- | --- |
| RF-230 | Cada personaje tiene un registro de recursos con nombre, máximo, usados y regla de reinicio. | M |
| RF-231 | El jugador puede crear, editar, gastar, recuperar y borrar recursos. | M |
| RF-232 | Los espacios de conjuro cubren los niveles 1 a 9. | M |
| RF-233 | Al abrir un personaje antiguo, `wildShape`, los usos reconocibles de `features[]` y los espacios 1–2 se migran sin perder lo gastado. | M |
| RF-234 | Los descansos reinician los recursos según su regla (`shortRest`, `longRest`); el descanso largo cubre también el corto. | M |
| RF-235 | Un recurso puede guardar valores concretos (dados guardados). | S |
| RF-236 | `RestModal` lee el campo correcto del dado de golpe (`die`). | M |

**Efectos activos**

| ID | Requisito | Prio |
| --- | --- | --- |
| RF-237 | Cada personaje tiene un registro de efectos activos. | M |
| RF-238 | Un efecto tiene duración: N rondas, hasta un descanso, concentración, hasta usarse o indefinida. | M |
| RF-239 | Cuando avanza la ronda del combate, el cliente del jugador descuenta las rondas de sus efectos, una sola vez por ronda. | M |
| RF-240 | Un descanso quita los efectos "hasta el descanso" que corresponden. | M |
| RF-241 | El jugador puede terminar un efecto a mano en cualquier momento. | M |
| RF-242 | `collectModifiers(char, target)` reúne los modificadores de los efectos activos. | M |
| RF-243 | Al aplicar un efecto de concentración con otro activo, la hoja avisa y ofrece reemplazarlo. | S |
| RF-244 | Un efecto puede vincularse a un recurso y gastarlo al aplicarse. | S |

**Catálogo**

| ID | Requisito | Prio |
| --- | --- | --- |
| RF-245 | Un adaptador convierte las entradas del SRD (conjuros, equipo, objetos mágicos, dotes) al esquema común. | M |
| RF-246 | El jugador puede crear objetos, hechizos y dotes propios, guardados en su personaje con `source: 'custom'`. | M |
| RF-247 | Las entradas propias muestran una insignia. | M |
| RF-248 | Objetos y hechizos aceptan una imagen por URL. | S |
| RF-249 | Las dotes tienen tipo (`passive`, `conditional`, `active`, `reaction`) y recurso opcional. | M |
| RF-250 | Los efectos estructurados de una entrada son opcionales; sin ellos funciona como texto. | M |

**Modales y panel**

| ID | Requisito | Prio |
| --- | --- | --- |
| RF-251 | Un modal genérico de objeto muestra imagen, título, descripción, propiedades, efectos y acciones. | M |
| RF-252 | Un modal genérico de hechizo muestra los datos del conjuro y permite lanzar eligiendo espacio, sin validar. | M |
| RF-253 | Ambos modales se abren desde el inventario, el compendio y la hoja. | M |
| RF-254 | Desde un hechizo o dote se puede aplicar su efecto con un botón. | S |
| RF-255 | El estilo de los modales es coherente con el sobre de pergamino, y se reutilizan en botín y handouts. | S |
| RF-256 | Solo el dueño escribe los campos nuevos; el DM sigue limitado (test del emulador). | M |
| RF-257 | El panel de efectos muestra nombre, origen, duración restante y botón para terminar; queda oculto sin efectos. | M |
| RF-258 | Todas las escrituras van al documento del personaje, con el debounce existente. | M |

El rango 259 queda libre. La Spec 08 arranca en 260.

## Plan de tareas por fases

Orden: A → B → C → D → E. Las Fases B y C son independientes entre sí tras la A. Planes detallados en [`docs/Plans/07-cimientos-de-la-hoja/`](../Plans/07-cimientos-de-la-hoja/README.md).

### Fase A — Recursos y migración · sin dependencias
- [x] T-230 Tipos `Resource` y espacios 1–9; valores por defecto (RF-230, RF-232)
- [x] T-231 Migración en `recalculateCharacter` (RF-233)
- [x] T-232 Acciones de recursos y espacios 1–9 en `characterStore` (RF-231, RF-235)
- [x] T-233 Los descansos recorren el registro (RF-234)
- [x] T-234 Corregir `hitDice.dieType` en `RestModal` (RF-236)

### Fase B — Motor de efectos · depende de la Fase A
- [x] T-235 Tipos de efecto y campo `activeEffects` (RF-237, RF-238)
- [x] T-236 `effects.ts`: funciones puras (RF-241, RF-242)
- [x] T-237 Acciones de efectos en `characterStore` y expiración por descanso (RF-240)
- [x] T-238 Descuento de rondas al avanzar el combate (RF-239)
- [x] T-239 Tests de efectos y migraciones

### Fase C — Catálogo y entradas propias · depende de la Fase A
- [x] T-240 `CatalogEntry` y adaptadores del SRD (RF-245)
- [x] T-241 Alta de entradas propias con insignia (RF-246, RF-247)
- [x] T-242 Tipo y recurso en las dotes (RF-249, RF-250)
- [x] T-243 Imagen en objetos y hechizos (RF-248)
- [x] T-244 Test de reglas del emulador (RF-256)

### Fase D — Modales genéricos · depende de la Fase C
- [x] T-245 `ItemDetailModal` (RF-251)
- [x] T-246 `SpellDetailModal` (RF-252)
- [x] T-247 Montaje en inventario, compendio y hoja; reuso en botín y handouts (RF-253, RF-255)
- [x] T-248 Tests de la lógica de presentación

### Fase E — Panel de efectos y cierre · depende de las Fases B y D
- [x] T-249 `ActiveEffectsPanel` (RF-257)
- [x] T-250 Aplicar un efecto desde un hechizo o dote (RF-243, RF-244, RF-254)
- [x] T-251 Pasada de cierre y criterios de aceptación (RF-258)

```
Fase A ──┬──► Fase B ──────────────┐
         │                         ├──► Fase E ──► cierre
         └──► Fase C ──► Fase D ───┘
```

## Criterios de aceptación, cuotas y pruebas

1. Un personaje antiguo se abre sin perder usos gastados, `wildShape` ni espacios de conjuro.
2. Se crea un recurso que se reinicia en descanso corto, se gasta, y el descanso lo recupera.
3. Se aplican espacios de conjuro de nivel 3 a 9 y se gastan y recuperan.
4. Se agrega un objeto propio y uno del SRD; ambos se abren en el modal con imagen y datos, y el propio muestra la insignia.
5. Se agrega un hechizo propio y uno del SRD; ambos se abren en el modal de hechizo.
6. Se aplica un efecto de 2 rondas; al avanzar el combate dos rondas, expira; no se descuenta dos veces si se recarga la página.
7. Se aplica un efecto "hasta descanso largo"; un descanso corto no lo quita y uno largo sí.
8. Al aplicar un segundo efecto de concentración, la hoja avisa.
9. El DM no puede escribir `resources` ni `activeEffects` (emulador).
10. `pnpm test`, `pnpm test:rules` y `pnpm build` en verde.

## Decisiones tomadas

Resueltas el 10 nov 2026.

- [x] **Dónde viven las entradas propias.** → Dentro del personaje, con `source: 'custom'`. Sin colecciones nuevas ni cambios de reglas.
- [x] **¿El DM aplica efectos en H1?** → No. Solo el jugador. No se amplía el `hasOnly` del DM; queda para H5.
- [x] **Alcance de la migración de recursos.** → Registro unificado, espacios 1–9, y migración de `wildShape` y `features[].uses`.
- [x] **Quién descuenta las rondas.** → El cliente del jugador al detectar el cambio de ronda, con una marca `effectsLastRound` para no descontar dos veces.
- [x] **Incompatibilidades.** → Avisan, no bloquean.
- [x] **Rangos de IDs.** → RF-230…259 y T-230…251 para esta spec.

## Preguntas abiertas

- [ ] **Efectos de ejemplo en el catálogo.** ¿Se cargan a mano unos pocos efectos estructurados en H1 (Bendición, Escudo de Fe, Furia) para probar el panel, o el catálogo queda sin efectos hasta H4?
- [ ] **Hechizos propios y niveles superiores a 2.** El modal de hechizo en H1 muestra el escalado pero no calcula el daño por nivel de espacio: ¿basta con el texto, o se agrega un campo estructurado ya en H1?
- [ ] **Espacios de conjuro "de pacto".** El brujo recupera en descanso corto y no tiene la misma forma que el resto. ¿Se modela como un recurso aparte con `rechargeOn: 'shortRest'`? Propuesta: sí.
