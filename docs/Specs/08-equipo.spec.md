# Spec: Equipo — dnd.gonzabena.com.ar

Nov 10, 2026 · @Gonzalo Benavente

Etapa H2 del [roadmap](../ROADMAP.md). Depende de H1 ([Spec 07](07-cimientos-de-la-hoja.spec.md)).

## Objetivo y alcance

Que **lo que el personaje lleva puesto afecte a sus números**: la CA se calcula a partir de la armadura, el escudo, la clase y los efectos; las armas son datos estructurados; y la hoja avisa cuando el equipo no es compatible con las competencias del personaje.

Al cerrarla, equipar una armadura pesada a un mago muestra un aviso con sus penalizaciones, y la CA queda desglosada y correcta.

**Dentro del alcance (v1)**

- **Slots de equipo** y **sintonización** (máx. 3), vinculados al inventario.
- **Armaduras** estructuradas: categoría, CA base, tope de DES, requisito de FUE, desventaja en Sigilo.
- **Competencias** del personaje (cargadas a mano) y **compatibilidad** del equipo: avisa y aplica penalizaciones, no bloquea.
- **CA derivada** con desglose y elección de la mejor fórmula (armadura, Defensa sin Armadura, Armadura de Mago, escudo, efectos).
- **Armas estructuradas**: dado de daño, tipo, propiedades, alcance y bono mágico.
- `collectModifiers` pasa a incluir los `effects` de los objetos equipados.

**Fuera del alcance (v1)**

- Ventaja y desventaja calculadas en las tiradas, con su explicación (H4). H2 solo **declara** las penalizaciones y las muestra como aviso.
- Selector de modificadores al atacar y consumo de "1 vez por turno" (H4).
- Maestrías de arma aplicadas en combate (H4); se conserva `mastery` tal como está.
- Inventario con peso, capacidad de carga y cargas (idea suelta).
- Tiempos de ponerse y quitarse la armadura (se agregan después de H2).
- Multiclase: el personaje tiene una sola clase; la lista de competencias es plana, así que sumar las de otra clase será agregarlas a mano.
- Derivar competencias de la clase o la raza desde el SRD.
- El DM equipando o quitando objetos en la hoja de un jugador.
- Efectos estructurados para todo el SRD: solo los de armaduras, escudos y unos pocos objetos mágicos de ejemplo.

**Usuarios**

| Rol | Qué gana |
| --- | --- |
| Jugador | Equipa y desequipa sin recalcular la CA a mano; ve de dónde sale cada punto; recibe un aviso claro si lleva algo que no sabe usar. |
| DM | Ve una CA coherente en la iniciativa y puede pedir el desglose cuando discute un impacto. No edita el equipo del jugador. |

## Estado actual del repo (punto de partida)

| Tema | Qué hay | Dónde |
| --- | --- | --- |
| CA | `armorClass: number` y `armorNote: string` manuales; `recalculateCharacter` no los toca | `src/scripts/models/character.ts` (~139-140), `src/scripts/dnd/calculations.ts:47` |
| CA en pantalla | Se muestra con `char.armorClass` y `char.armorNote`; se edita con un input numérico | `VitalsGrid.astro:50-52,200-208`, `EditCharacterModal.astro:183,266,396` |
| Otros lectores de CA | Iniciativa, personajes demo y forma salvaje (`ac` de la forma activa) | `InitiativeList.astro:272`, `campaignStore.ts:138-271`, `WildShapePanel.astro:123-184` |
| Inventario | `InventoryItem` con `category: 'potion'\|'gear'\|'treasure'\|'weapon'`; sin `armor`, sin equipado ni slot | `character.ts` (~58-72) |
| Armas | `AttackAction` con `damage`, `damageDice?`, `ability?`, `proficient?`, `attackBonusMod?`, `tags`, `mastery?`; separado del inventario | `character.ts:17` |
| Sintonización | `attunedItems: {name, description, icon}[]` libre, sin límite ni vínculo con el inventario | `characterStore.updateAttunedItems` (`:712`), `EditAttunedModal.astro` |
| Slots | No existen | — |
| Competencias | El personaje no guarda competencias de armadura ni de arma; solo `className`, `race` y `skills[]` | `character.ts` |
| Datos SRD | `equipment.json`: `armor_class {base, dex_bonus, max_bonus}`, `str_minimum`, `stealth_disadvantage`, `weapon_category`, `damage`, `properties`, `range`; `classes.json`: `proficiencies[]` | `public/data/srd/{2014,2024}/` |
| Catálogo | `CatalogEntry` con `meta` libre y `effects?`; `srdToEntry` y `toCatalogEntry` adaptan el SRD | `src/scripts/models/catalog.ts`, `src/scripts/dnd/catalog.ts:32,100` |
| Motor de efectos | `collectModifiers(char, target)` coincide por igualdad o prefijo con punto, solo mira `activeEffects` y no evalúa `when` | `src/scripts/dnd/effects.ts:70` |
| Target `ac` | Solo aparece en placeholders (`ac add 2`); ningún código lo lee | `CustomEntryFields.astro:38`, `EditFeaturesModal.astro:191` |
| Modal de objeto | Lógica pura `detailView.ts` y UI `ItemDetailModal.astro`; el compendio ya filtra por categoría `armor` | `src/scripts/dnd/detailView.ts`, `CompendiumModal.astro` |
| Reglas del personaje | El dueño crea y actualiza; el DM solo escribe `hp`, `inspiration` y `updatedAt` | `firestore.rules:282-318` |

## Stack, restricciones y reglas para el agente

Se mantienen las de las specs anteriores y sus decisiones D1–D13 (`docs/Plans/01-dm-panel/README.md`) y las de la Spec 07:

- Astro estático, sin SSR. Componentes `.astro` + `<script>`, sin framework UI. Comunicación con `CustomEvent` en `window`.
- Firebase (plan Spark) solo a través de `src/scripts/data/`. Tipos en `src/scripts/models/`. Lógica pura en `src/scripts/dnd/`, con tests `node:test` en `tests/*.test.mjs` (sin `enum`: Node importa los `.ts` directo).
- Decisiones no cubiertas: la opción más simple que respete la cuota, anotada con `// DECISION:`.
- Las incompatibilidades **avisan, no bloquean** (regla 3 del roadmap). Toda penalización se puede descartar a mano.
- Todo el equipo vive en el documento del personaje: no se crean colecciones nuevas.

**Dependencias nuevas:** ninguna.

## 1. Slots de equipo y sintonización

Un **slot** es un lugar del cuerpo donde se lleva un objeto: cabeza, cuerpo, guantes, cuello, anillo 1, anillo 2, botas, capa, mano principal, mano secundaria y **escudo**.

- `InventoryItem` gana `equipped?: boolean`, `slot?: EquipSlot` y `attuned?: boolean`. Un objeto sin `slot` se lleva en la mochila.
- Un slot admite **un objeto**. Equipar otro en el mismo slot desequipa el anterior y lo avisa.
- El **escudo** tiene su propio slot. Un arma a dos manos (`hands: 2`) ocupa la mano principal y bloquea la secundaria y el escudo; el escudo y un arma en la mano secundaria no pueden convivir (solo hay dos manos). Si no cabe, se avisa y se desequipa lo que sobra.
- La **sintonización** se marca sobre el objeto del inventario y admite **máximo 3**. Al intentar un cuarto se bloquea con el mensaje de las reglas (es la única restricción dura, porque es una regla de conteo, no una incompatibilidad).
- Un objeto marcado `requiresAttunement` que se equipa sin sintonizar **no aplica sus efectos** y lo indica.
- **Migración:** `attunedItems` se convierte en objetos del inventario con `attuned: true` (se crea el objeto si no existe por nombre) y el campo se deja vacío. Si había más de 3, se conservan los 3 primeros y el resto queda en el inventario sin sintonizar. Se hace una sola vez, al abrir el personaje.
- `EditAttunedModal` pasa a mostrar los objetos sintonizables del inventario y el contador `n/3`.

## 2. Armaduras

Una **armadura** es un objeto de categoría `armor` con datos estructurados.

- Campos: `armor { category: 'light'|'medium'|'heavy'|'shield', baseAc, dexCap?: number | null, strMin?: number, stealthDisadv?: boolean }`. `dexCap` es `null` o ausente en armadura ligera (sin tope) y `0` en pesada.
- `InventoryItem.category` suma el valor `armor`. Los objetos existentes no cambian.
- El **escudo** es un objeto `armor` de categoría `shield` que va en su propio slot (`shield`) y suma su bono a la CA.
- Los datos salen de `equipment.json` (`armor_class`, `str_minimum`, `stealth_disadvantage`, `equipment_categories`) a través de `srdToEntry`, que los guarda en `meta`; al agregarlos al inventario se copian al campo `armor`.
- Las armaduras propias se crean con los mismos campos (`CustomEntryFields`).
- Una armadura mágica (+1, +2) suma `bonus` a su `baseAc` y puede traer `effects` (por ejemplo `ac add 1`).
- Si la armadura exige **FUE mínima** y el personaje no la alcanza, se aplica la penalización de reglas (−10 pies de velocidad) y se avisa.
- Si tiene **desventaja en Sigilo**, se declara como modificador `skill.stealth disadvantage` mientras esté equipada (lo evaluará H4; H2 lo muestra en el desglose).

## 3. Competencias y compatibilidad

El personaje tiene `proficiencies { armor: string[], weapons: string[] }` (por ejemplo `light`, `medium`, `heavy`, `shield`; `simple`, `martial` y nombres concretos).

- Se **cargan a mano**: el jugador marca las competencias que tiene (clase, raza, dotes) en una lista de casillas. No se derivan del SRD en H2.
- Por defecto la lista está **vacía** y la hoja lo indica con un mensaje ("Cargá tus competencias para que los avisos sean fiables"), para que no parezca que todo el equipo es incompatible sin explicación.
- Al ser una lista plana, agregar las de otra clase (multiclase futura) es tildar más casillas.
- **Compatibilidad de armadura**: si equipa una armadura o escudo sin competencia, la hoja muestra un aviso y declara las penalizaciones de reglas: desventaja en tiradas de ataque, salvaciones y pruebas de característica con FUE o DES, y **no puede lanzar conjuros**.
- **Compatibilidad de arma**: sin competencia, no se suma el bono de competencia al ataque.
- El aviso nombra el objeto, la competencia que falta y las penalizaciones, y tiene un botón **"Ignorar"** (el DM puede decidir otra cosa). Ignorar se guarda por objeto.
- H2 **no** aplica ventaja/desventaja a las tiradas: las deja declaradas como modificadores para que H4 las lea.

## 4. CA derivada y desglose

La CA deja de ser un número manual y pasa a ser el **mejor resultado entre las fórmulas aplicables**, más los bonos.

- Fórmulas: **armadura equipada** (`baseAc + DES` con `dexCap`), **sin armadura** (`10 + DES`), **Defensa sin Armadura** del Bárbaro (`10 + DES + CON`) y del Monje (`10 + DES + SAB`), **Armadura de Mago** (`13 + DES`, solo si el efecto activo está presente).
- Después se suman el **escudo**, los bonos de los objetos equipados y sintonizados y los `modifiers` con target `ac` de los efectos activos.
- Un modificador `ac set` (por ejemplo una forma salvaje o un hechizo) **reemplaza** la fórmula y se muestra como tal.
- Función pura `computeAc(char) → { total, formula, parts[] }`, donde cada `part` tiene etiqueta y valor (`Armadura de cuero +1`, `Destreza +2`, `Escudo +2`, `Anillo de Protección +1`). Vive en `src/scripts/dnd/ac.ts`.
- `collectModifiers(char, target)` se amplía para incluir los `effects` de los objetos equipados (y sintonizados cuando lo requieran), además de `activeEffects`. El resto de su contrato no cambia.
- **Override manual:** el campo `armorClass` se mantiene como override: si el jugador lo escribe, manda y la hoja muestra que es manual, con un botón para volver al cálculo. `armorNote` pasa a ser una nota libre.
- Los lectores existentes (`VitalsGrid`, `InitiativeList`, `WildShapePanel`) leen la CA a través de una función única `getArmorClass(char)`; la forma salvaje activa sigue teniendo prioridad.
- En la hoja, tocar la CA abre el **desglose** con las partes y los avisos de compatibilidad.

## 5. Armas estructuradas

- Un objeto de categoría `weapon` gana `weapon { category: 'simple'|'martial', damageDice, damageType, properties: string[], range?: {normal, long}, versatileDice?, magicBonus? }`.
- Los datos salen de `equipment.json` (`weapon_category`, `damage`, `properties`, `range`) y de `weapon-properties.json`.
- `AttackAction` se enlaza al objeto con `itemId?`: al equipar un arma se ofrece crear o actualizar su acción de ataque con el dado, la característica (FUE, DES si es sutil o a distancia) y el bono mágico ya cargados.
- Las acciones de ataque existentes, sin `itemId`, siguen funcionando igual.
- El **bono mágico** suma al ataque y al daño. El bono de competencia depende de la compatibilidad (sección 3).
- No se evalúan propiedades en combate (alcance, recarga, pesada): se guardan y se muestran. Las usa H4 y H6.

## Modelo de datos

Todo dentro de `characters/{id}`; sin colecciones nuevas.

```ts
type EquipSlot = 'head'|'body'|'gloves'|'neck'|'ring1'|'ring2'|'boots'|'cloak'|'mainHand'|'offHand'|'shield';

interface ArmorData {
  category: 'light'|'medium'|'heavy'|'shield';
  baseAc: number;
  dexCap?: number | null;
  strMin?: number;
  stealthDisadv?: boolean;
  bonus?: number;
}

interface WeaponData {
  category: 'simple'|'martial';
  damageDice: string;
  damageType: string;
  properties: string[];
  range?: { normal: number; long: number };
  versatileDice?: string;
  magicBonus?: number;
}

// InventoryItem (campos nuevos, todos opcionales)
//   category: ... | 'armor'
//   equipped?, slot?, hands?, attuned?, requiresAttunement?
//   armor?: ArmorData, weapon?: WeaponData
//   ignoreWarnings?: boolean

// CharacterData (campos nuevos)
//   proficiencies?: { armor: string[]; weapons: string[] }
//   armorClass: number    // pasa a ser override manual; ausente = derivada
//   attunedItems          // se migra al inventario y queda vacío
```

## Seguridad y reglas

- Los campos nuevos los escribe solo el dueño. El DM sigue escribiendo únicamente `hp`, `inspiration` y `updatedAt`, así que **no hace falta cambiar `firestore.rules`**.
- Se agrega un test de reglas que confirme que el DM no puede escribir `inventory`, `proficiencies` ni `armorClass`.
- Los textos propios (nombres, notas) pasan por el saneamiento ya usado en la Spec 07 (`sanitizeImageUrl`, sin HTML).

## Presupuesto de cuota (Spark)

- Equipar, desequipar, sintonizar y editar competencias son **una escritura** al documento del personaje, igual que cualquier otra edición de la hoja.
- La CA se **calcula en el cliente** al leer el personaje: no se guarda el resultado, así que no hay escrituras extra al cambiar de equipo. Solo el override manual se persiste.
- La migración de `attunedItems` y de competencias corre una vez por personaje, al abrirlo, y se guarda en una escritura.
- El DM ve la CA calculada con los datos que ya recibe del personaje; no hay lecturas nuevas.

## Requisitos funcionales

IDs a partir de RF-260 (la Spec 07 llega hasta RF-258).

| ID | Requisito | Prioridad |
| --- | --- | --- |
| RF-260 | Once slots de equipo (incluido el escudo) y `equipped`/`slot` en `InventoryItem`; un objeto por slot | M |
| RF-261 | Manos: arma a dos manos bloquea mano secundaria y escudo; escudo y arma secundaria no conviven; aviso al exceder | M |
| RF-262 | Sintonización sobre objetos del inventario con tope de 3 | M |
| RF-263 | Migración única de `attunedItems` al inventario | M |
| RF-264 | Objeto que requiere sintonización no aplica efectos sin sintonizar | M |
| RF-265 | Categoría `armor` con `ArmorData` y alta desde catálogo SRD y propia | M |
| RF-266 | Escudo como objeto `armor` en su propio slot | M |
| RF-267 | FUE mínima: aviso y −10 pies de velocidad | S |
| RF-268 | Desventaja en Sigilo declarada como modificador mientras esté equipada | S |
| RF-269 | `proficiencies` cargadas a mano, vacías por defecto con mensaje | M |
| RF-270 | Aviso de compatibilidad de armadura y escudo con sus penalizaciones | M |
| RF-271 | Aviso de arma sin competencia y bono de competencia omitido | M |
| RF-272 | Botón "Ignorar" por objeto, guardado | S |
| RF-273 | `computeAc(char)` con fórmulas: armadura, sin armadura, Defensa sin Armadura y Armadura de Mago | M |
| RF-274 | Suma de escudo, bonos de objetos y modificadores `ac` de efectos | M |
| RF-275 | `ac set` reemplaza la fórmula; override manual con vuelta al cálculo | M |
| RF-276 | `collectModifiers` incluye los `effects` de objetos equipados | M |
| RF-277 | `getArmorClass(char)` único y lectores migrados; la forma salvaje prevalece | M |
| RF-278 | Desglose de la CA con partes y avisos | M |
| RF-279 | `WeaponData` y alta desde catálogo SRD y propia | M |
| RF-280 | Acción de ataque enlazada al arma (`itemId`) con dado, característica y bono mágico | S |
| RF-281 | Modal de objeto muestra armadura, arma, slot y estado de sintonización | S |
| RF-282 | Tests de reglas: el DM no escribe equipo, competencias ni CA | M |

## Plan de tareas por fase

IDs a partir de T-252 (la Spec 07 llega hasta T-251). Se ejecuta una fase a la vez, cerrando cada una con tests verdes.

**Fase A — Modelo, slots y sintonización**
- [x] T-252 Tipos `EquipSlot`, `ArmorData`, `WeaponData` y campos nuevos en `InventoryItem` y `CharacterData` (RF-260)
- [x] T-253 Lógica pura de equipar/desequipar, manos y tope de sintonización, con tests (RF-261, RF-262)
- [x] T-254 Migración de `attunedItems` al inventario con tests (RF-263)
- [x] T-255 UI de equipo en la mochila y `EditAttunedModal` con contador `n/3` (RF-260, RF-262, RF-264)

**Fase B — Armaduras y armas en el catálogo** (depende de la Fase A)
- [x] T-256 `srdToEntry` y alta de armaduras con `ArmorData`, y escudos (RF-265, RF-266)
- [x] T-257 `srdToEntry` y alta de armas con `WeaponData` (RF-279)
- [x] T-258 Campos de armadura y arma en `CustomEntryFields` (RF-265, RF-279)
- [x] T-259 Modal de objeto con datos de armadura, arma y slot (RF-281)

**Fase C — Competencias y compatibilidad** (depende de la Fase B)
- [x] T-260 Campo `proficiencies` y UI de casillas para cargarlas a mano (RF-269)
- [x] T-261 Evaluador de compatibilidad con penalizaciones declaradas, con tests (RF-270, RF-271, RF-267, RF-268)
- [x] T-262 Aviso en la hoja y botón "Ignorar" (RF-270, RF-272)

**Fase D — CA derivada** (depende de la Fase C)
- [x] T-263 `computeAc` con fórmulas y partes, con tests (RF-273, RF-274, RF-275)
- [x] T-264 `collectModifiers` incluye efectos de objetos equipados, con tests (RF-264, RF-276)
- [x] T-265 `getArmorClass` y migración de lectores, incluida la forma salvaje (RF-277)
- [x] T-266 Desglose de la CA en la hoja y override manual (RF-275, RF-278)

**Fase E — Armas en acción y cierre** (depende de las Fases B y D)
- [ ] T-267 Enlace entre `AttackAction` y el arma equipada (RF-280)
- [ ] T-268 Tests de reglas del DM (RF-282)
- [ ] T-269 Prueba manual con DM y jugador y cierre de la etapa

## Criterios de aceptación, cuotas y pruebas

1. Se equipa una armadura de cuero y un escudo y la CA pasa de 10+DES a la fórmula correcta, con desglose.
2. A un mago se le equipa una armadura pesada: aparece el aviso con las penalizaciones y la CA queda desglosada y correcta. "Ignorar" lo oculta y persiste tras recargar.
3. Un bárbaro sin armadura calcula `10 + DES + CON`; con armadura media, usa la mejor fórmula.
4. Un cuarto objeto sintonizado se rechaza; un objeto que requiere sintonización no aplica efectos hasta sintonizar.
5. Un personaje antiguo con `attunedItems` abre sin perder objetos; los tres primeros quedan sintonizados en el inventario.
6. Un arma equipada ofrece su acción de ataque con dado, característica y bono mágico; las acciones antiguas siguen igual.
7. El DM ve la CA correcta en la iniciativa y no puede escribir equipo, competencias ni CA (test de reglas).
8. Equipar, desequipar y sintonizar no generan más de una escritura al documento por acción.
9. `pnpm test` y `pnpm test:rules` en verde.

## Decisiones tomadas

- [x] Las competencias se cargan a mano por ahora; no se derivan del SRD. (Resuelta el 10/11)
- [x] El escudo tiene un slot propio. (Resuelta el 10/11)
- [x] Multiclase fuera de H2: no existe aún; la lista plana de competencias lo admitirá. (Resuelta el 10/11)
- [x] El tiempo de ponerse y quitarse la armadura se agrega después de H2. (Resuelta el 10/11)
- [x] La sintonización se vincula al inventario y `attunedItems` se migra, con tope de 3. (Resuelta el 10/11)
- [x] La CA se calcula en el cliente y no se guarda; solo persiste el override manual.
- [x] Las incompatibilidades avisan y declaran penalizaciones; el tope de 3 sintonizaciones es la única restricción dura.
- [x] H2 declara ventaja y desventaja como modificadores, pero no las aplica a las tiradas (H4).

## Preguntas abiertas

Ninguna por ahora.
