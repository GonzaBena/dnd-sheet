# Plan Fase A — Modelo, slots y sintonización (T-252 … T-255)

Spec: `docs/Specs/08-equipo.spec.md`, sección *1. Slots de equipo y sintonización* y RF-260 a RF-264.

## 1. Contexto y objetivo

Hoy el inventario no sabe qué está puesto: no hay `equipped`, ni slots, y `attunedItems` es una lista libre sin límite. Esta fase agrega el **modelo** (tipos de equipo, armadura y arma), la **lógica de equipar** y la **sintonización con tope de 3**, y migra `attunedItems` al inventario.

Al terminar, el jugador equipa un objeto en un slot, sintoniza hasta 3 y los personajes antiguos abren sin perder nada.

## 2. Prerrequisitos verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| H1 cerrada | T-251 marcada en la Spec 07; `pnpm test` en verde |
| `recalculateCharacter` con migraciones idempotentes | `src/scripts/dnd/calculations.ts:48` (`migrateSlots`, `migrateResources`) |
| `InventoryItem` con `source`, `custom`, `effects?` | `src/scripts/models/character.ts` |
| `attunedItems` y su modal | `characterStore.updateAttunedItems`, `src/components/modals/EditAttunedModal.astro` |
| Mochila | `src/components/character/BackpackGrid.astro` |

## 3. Decisiones vigentes

- **D1/D2/D4/D11/D12** y **H1-1 a H1-6**, **H2-1 a H2-8** (ver README).

Decisiones propias:

- **FA-1** Slots: `head`, `body`, `gloves`, `neck`, `ring1`, `ring2`, `boots`, `cloak`, `mainHand`, `offHand`, `shield`. Un objeto ocupa un slot; un slot, un objeto.
- **FA-2** Un arma a dos manos (`hands: 2`) ocupa `mainHand` y bloquea `offHand` y `shield`. `shield` y un arma en `offHand` no conviven. Cuando algo no cabe, se **desequipa lo anterior** y se devuelve la lista de lo desequipado para avisar (no se bloquea).
- **FA-3** La sintonización es la **única restricción dura**: al intentar un cuarto objeto, la función devuelve error y no cambia nada.
- **FA-4** `equipItem` y `attuneItem` son funciones puras que devuelven `{ inventory, unequipped, error? }`; el store aplica el resultado y guarda una sola vez (una escritura por acción).
- **FA-5** Un objeto con `requiresAttunement` equipado pero sin `attuned` **no aporta efectos**. Esa decisión se consume en la Fase D (`collectModifiers`); aquí solo se guarda el dato.
- **FA-6** Migración de `attunedItems`: por cada entrada, buscar un objeto del inventario con el mismo `name` (sin distinguir mayúsculas); si existe, marcarlo `attuned`; si no, crearlo (`category: 'gear'`, con `description` e `icon` de la entrada). Máximo 3; el resto queda en el inventario sin sintonizar. Al final, `attunedItems = []`. Idempotente porque deja de haber entradas.

## 4. Modelo de datos

En `src/scripts/models/character.ts`:

```ts
export type EquipSlot =
  | 'head' | 'body' | 'gloves' | 'neck' | 'ring1' | 'ring2'
  | 'boots' | 'cloak' | 'mainHand' | 'offHand' | 'shield';

export interface ArmorData {
  category: 'light' | 'medium' | 'heavy' | 'shield';
  baseAc: number;
  dexCap?: number | null;   // null/ausente = sin tope; 0 = sin DES
  strMin?: number;
  stealthDisadv?: boolean;
  bonus?: number;           // armadura mágica +1, +2…
}

export interface WeaponData {
  category: 'simple' | 'martial';
  damageDice: string;
  damageType: string;
  properties: string[];
  range?: { normal: number; long: number };
  versatileDice?: string;
  magicBonus?: number;
}

// InventoryItem: category suma 'armor'; campos nuevos opcionales:
//   equipped?: boolean; slot?: EquipSlot; hands?: 1 | 2;
//   attuned?: boolean; requiresAttunement?: boolean;
//   armor?: ArmorData; weapon?: WeaponData; ignoreWarnings?: boolean;
```

Contratos en `src/scripts/dnd/equipment.ts` (puro):

```ts
export const MAX_ATTUNED = 3;
export const EQUIP_SLOTS: EquipSlot[];

export interface EquipResult { inventory: InventoryItem[]; unequipped: InventoryItem[]; error?: string }

export function equipItem(inv: InventoryItem[], itemId: string, slot: EquipSlot): EquipResult;
export function unequipItem(inv: InventoryItem[], itemId: string): InventoryItem[];
export function attuneItem(inv: InventoryItem[], itemId: string): EquipResult;      // error si ya hay 3
export function unattuneItem(inv: InventoryItem[], itemId: string): InventoryItem[];
export function equippedItems(inv: InventoryItem[]): InventoryItem[];
export function migrateAttuned(char: CharacterData): void;                          // FA-6, idempotente
```

## 5. Archivos

**Crear**
- `src/scripts/dnd/equipment.ts` (puro)
- `tests/equipment.test.mjs`

**Modificar**
- `src/scripts/models/character.ts`: tipos de la sección 4.
- `src/scripts/dnd/calculations.ts`: llamar `migrateAttuned(char)` dentro de `recalculateCharacter`.
- `src/scripts/state/characterStore.ts`: `equipItem`, `unequipItem`, `attuneItem`, `unattuneItem` (llaman las funciones puras y `saveAndNotify()`).
- `src/components/character/BackpackGrid.astro`: botón y selector de slot para equipar; marca visual de equipado y sintonizado.
- `src/components/modals/EditAttunedModal.astro`: lista de objetos sintonizables del inventario con contador `n/3`.

## 6. Pasos por tarea

### T-252 — Tipos (RF-260)

1. Agregar `EquipSlot`, `ArmorData`, `WeaponData` y los campos nuevos de `InventoryItem` (sección 4). `category` suma `'armor'`.
2. Verificar que ningún `switch` sobre `category` queda sin cubrir el valor nuevo (búsqueda en `src/`).
3. No hay valores por defecto: todos los campos son opcionales y los objetos viejos son válidos.

### T-253 — Lógica de equipar y sintonizar (RF-261, RF-262)

1. Escribir **primero** los tests de la sección 7.
2. `equipItem`: valida que el slot sea válido para el objeto (armadura `body`; escudo `shield`; arma `mainHand`/`offHand`; el resto por `slot` elegido). Aplica FA-2 y devuelve `unequipped`.
3. `attuneItem`: cuenta los `attuned`; si ya son `MAX_ATTUNED`, devuelve `error` con el texto de las reglas ("Solo puedes estar sintonizado con 3 objetos") y no cambia el inventario.
4. `unequipItem` no quita la sintonización (se puede estar sintonizado sin llevarlo puesto).

### T-254 — Migración de `attunedItems` (RF-263)

1. `migrateAttuned` según FA-6; llamarla desde `recalculateCharacter`, después de las migraciones de la Fase A de la Spec 07.
2. Si no hay `attunedItems` o está vacío, no hace nada.

### T-255 — UI (RF-260, RF-262, RF-264)

1. Mochila: cada objeto equipable muestra "Equipar" con selector de slot (solo los compatibles); si ya está puesto, "Quitar". Marca visible de equipado y de sintonizado.
2. Al equipar con `unequipped` no vacío, mostrar un aviso ("Se quitó X para equipar Y").
3. `EditAttunedModal`: lista de objetos con `requiresAttunement` o ya sintonizados, interruptor por objeto y contador `n/3`. Al rechazar el cuarto, mostrar el error.
4. Un objeto con `requiresAttunement` equipado y sin sintonizar muestra una insignia "Sin sintonizar: no aplica efectos" (RF-264; el efecto real llega en la Fase D).
5. Todo texto de usuario con `textContent`.

## 7. Tests

`tests/equipment.test.mjs`:

- `equipItem` en un slot libre equipa y no desequipa nada; en uno ocupado desequipa el anterior y lo devuelve.
- Arma a dos manos con escudo puesto: queda sin escudo y lo devuelve en `unequipped`.
- Escudo con arma en `offHand`: se desequipa el arma.
- Dos anillos en `ring1` y `ring2` conviven; un tercero en `ring1` reemplaza al primero.
- `attuneItem`: tres pasan; el cuarto devuelve `error` y deja el inventario igual.
- `unequipItem` conserva `attuned`.
- `migrateAttuned`: entradas con y sin objeto equivalente; más de 3 entradas; segunda ejecución sin cambios; personaje sin `attunedItems`.

## 8. Verificación

```bash
pnpm test
pnpm build
```

Prueba manual (con `pnpm emulators`, personaje antiguo con `attunedItems`):

1. Abrir el personaje: los objetos sintonizados aparecen en el inventario con la marca y `attunedItems` queda vacío; recargar no cambia nada.
2. Equipar un casco, dos anillos y unas botas: cada uno en su slot.
3. Intentar sintonizar un cuarto objeto: aviso y sin cambios.
4. Equipar un arma a dos manos con escudo puesto: aviso de que se quitó el escudo.
5. Cada acción genera una sola escritura al documento del personaje.

## 9. Fuera de alcance

- Datos de armadura y arma en el catálogo (Fase B).
- Efectos de los objetos equipados sobre la CA (Fase D).
- Competencias y avisos de compatibilidad (Fase C).

## 10. Checklist de cierre

- [ ] T-252 … T-255 marcadas en la spec.
- [ ] `// DECISION:` en FA-2 (desequipar lo que no cabe) y FA-6 (migración).
- [ ] Ningún `innerHTML` con texto de usuario.
- [ ] `pnpm test` y `pnpm build` en verde.
