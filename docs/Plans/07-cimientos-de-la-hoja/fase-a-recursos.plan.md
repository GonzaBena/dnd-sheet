# Plan Fase A — Recursos y migración (T-230 … T-234)

Spec: `docs/Specs/07-cimientos-de-la-hoja.spec.md`, sección *1. Recursos* y RF-230 a RF-236.

## 1. Contexto y objetivo

Hoy cada recurso se gestiona a mano y de forma distinta: `wildShape` tiene su contador, `features[].uses` es un string libre, `hitDice` es aparte y los espacios de conjuro solo llegan al nivel 2. Los descansos restauran cada cosa por separado. Esta fase:

- Crea el registro unificado `resources` con regla de reinicio.
- Amplía los espacios de conjuro a los niveles 1–9.
- Migra lo existente sin perder lo gastado.
- Hace que los descansos recorran el registro.
- Corrige el bug `hitDice.dieType`.

Al terminar, un personaje antiguo se abre igual que antes, y un recurso nuevo se gasta y se recupera con un descanso.

## 2. Prerrequisitos verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| `CharacterData` con `spellcasting.slots`, `wildShape`, `features[]`, `hitDice` | `src/scripts/models/character.ts:101-205` |
| Espacios 1–2 | `character.ts:169-172` |
| `recalculateCharacter(char)` | `src/scripts/dnd/calculations.ts:47` |
| `useSpellSlot`, `restoreSpellSlot` | `characterStore.ts:466`, `:480` |
| `shortRest`, `longRest` | `characterStore.ts:608`, `:636` |
| Bug del dado | `src/components/modals/RestModal.astro:108` (`hitDice.dieType`) |
| Valores por defecto | `src/scripts/models/defaultCharacter.ts` |
| Tests existentes de cálculos | `tests/calculations.test.mjs` |

## 3. Decisiones vigentes

- **D1/D2/D4/D11/D12** y **H1-1 a H1-6** (ver README).

Decisiones propias:

- **FA-1** `Resource.id` es estable: `wildShape` para la forma salvaje, `feature:<featureId>` para los migrados de dotes, y `res-<timestamp>-<n>` para los creados a mano. La migración es idempotente por `id` (H1-4).
- **FA-2** Los `features[].uses` solo se migran si el texto coincide con `^\s*(\d+)\s*/\s*(\d+)\s*$` (usados/máximo restantes: `"2/3"` = 2 restantes de 3) o con `^\s*(\d+)\s*$` (solo máximo). Todo lo demás queda como texto y se deja `uses` intacto. **No se borra `uses`** del feature: se conserva como respaldo y se marca el recurso con `source: 'feature:<id>'`.
- **FA-3** `rechargeOn` de lo migrado: `wildShape` → `shortRest`; features → `longRest` salvo que el texto de `uses` o la descripción contenga "descanso corto" / "short rest" (→ `shortRest`).
- **FA-4** Los espacios de nivel 3–9 se agregan con `{ total: 0, used: 0 }`. Se conserva `level1` y `level2` tal cual; la estructura nueva es `slots[n]` para n de 1 a 9 y los accesos antiguos `slots.level1`/`level2` se mantienen como alias hasta que nadie los use (ver T-231).
- **FA-5** El descanso largo reinicia todo lo que el corto reinicia. `turn` y `manual` no se tocan en ningún descanso.
- **FA-6** Los dados de golpe **no** entran al registro en esta fase (los trata H3); `shortRest` y `longRest` mantienen su manejo actual de `hitDice`.

## 4. Modelo de datos

```ts
// src/scripts/models/resource.ts
export type RechargeOn = 'turn' | 'shortRest' | 'longRest' | 'manual';

export interface Resource {
  id: string;
  name: string;
  max: number;
  used: number;               // 0..max
  rechargeOn: RechargeOn;
  source?: string;            // 'wildShape' | 'feature:<id>' | 'custom'
  values?: number[];          // dados guardados (RF-235); longitud <= max
}

export const SPELL_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export interface SlotState { total: number; used: number }
```

Funciones puras en `src/scripts/dnd/resources.ts`:

```ts
export function remaining(r: Resource): number;                                   // max - used, nunca < 0
export function spend(r: Resource, n?: number): Resource;                         // sin pasar de max; devuelve copia
export function recover(r: Resource, n?: number): Resource;                       // sin bajar de 0; devuelve copia
export function resetOn(resources: Resource[], rest: 'short' | 'long'): Resource[];
export function parseUses(text: string | undefined): { remaining: number; max: number } | null;
export function migrateResources(char: CharacterData): boolean;                   // muta char; true si cambió algo
export function migrateSlots(char: CharacterData): boolean;                       // idem
```

Campo nuevo en `CharacterData`: `resources: Resource[]` (default `[]`). `spellcasting.slots` se amplía a `Record<number, SlotState>` con claves 1–9.

## 5. Archivos

**Crear**
- `src/scripts/models/resource.ts`
- `src/scripts/dnd/resources.ts` (puro)
- `tests/resources.test.mjs`

**Modificar**
- `src/scripts/models/character.ts`: campo `resources`; tipo de `slots`.
- `src/scripts/models/defaultCharacter.ts`: `resources: []`, espacios 1–9.
- `src/scripts/dnd/calculations.ts`: llamar a `migrateSlots` y `migrateResources` en `recalculateCharacter`.
- `src/scripts/state/characterStore.ts`: acciones de recursos; `useSpellSlot`/`restoreSpellSlot` por nivel; `shortRest`/`longRest`.
- `src/components/modals/RestModal.astro`: `hitDice.die` (T-234).
- Los componentes que muestran los espacios de conjuro (buscar con `grep -rn "level1\|level2" src`) para que lean `slots[n]`.

## 6. Pasos por tarea

### T-230 — Tipos y valores por defecto (RF-230, RF-232)

1. Crear `resource.ts` con los tipos de la sección 4.
2. En `character.ts`, agregar `resources: Resource[]` y cambiar el tipo de `spellcasting.slots` a `Record<number, SlotState>` (claves 1–9).
3. En `defaultCharacter.ts`, `resources: []` y espacios 1–9 en `{ total: 0, used: 0 }`.
4. Hacer `grep -rn "level1\|level2" src tests` y listar los usos. **No** cambiarlos todavía si el alias de FA-4 los cubre; solo registrarlos para T-232.

### T-231 — Migración (RF-233)

1. `parseUses(text)`: dos expresiones regulares de FA-2. Devuelve `null` si no coincide.
2. `migrateSlots(char)`: si `slots` tiene claves `level1`/`level2`, copiarlas a `slots[1]`/`slots[2]`; completar 3–9 con ceros; devolver `true` solo si algo cambió.
3. `migrateResources(char)`:
   - Si `char.wildShape` existe y no hay un recurso con id `wildShape`, crear `{ id: 'wildShape', name: 'Forma Salvaje', max: usesTotal, used: usesTotal - usesRemaining, rechargeOn: 'shortRest', source: 'wildShape' }`.
   - Por cada `feature` con `uses` parseable y sin recurso `feature:<id>`, crear el recurso (FA-2, FA-3).
   - **No** borrar `wildShape` ni `uses`; seguirán siendo la fuente de la UI vieja hasta que las fases siguientes la reemplacen. Para evitar dos fuentes de verdad, la acción `useResource` de T-232 sincroniza hacia atrás (ver T-232 paso 4).
4. En `recalculateCharacter`, llamar a ambas migraciones al inicio. Es idempotente: una segunda llamada devuelve `false`.

### T-232 — Acciones del store (RF-231, RF-235)

1. `characterStore`: `addResource(partial)`, `updateResource(id, patch)`, `removeResource(id)`, `spendResource(id, n = 1)`, `recoverResource(id, n = 1)`, todas con `saveAndNotify()`.
2. `useSpellSlot(level)` y `restoreSpellSlot(level)` aceptan 1–9 y operan sobre `slots[level]`.
3. `setResourceValues(id, values)` para dados guardados (RF-235): recorta a `max`.
4. Sincronización hacia atrás (FA-2): al gastar o recuperar el recurso `wildShape`, actualizar `wildShape.usesRemaining`; al hacerlo con `feature:<id>`, reescribir `features[i].uses` con el formato `restantes/max`. Anotar con `// DECISION: se mantiene la fuente vieja hasta que la UI migre`.
5. Eventos: reutilizar el mecanismo de notificación del store (no crear uno nuevo).

### T-233 — Descansos (RF-234)

1. `resetOn(resources, 'short' | 'long')` (puro): en `short`, reinicia los de `shortRest`; en `long`, los de `shortRest` y `longRest`. Reiniciar = `used: 0` y, si tiene `values`, limpiar los valores usados (los dados guardados se vuelven a tirar a mano en H1; H3 lo automatiza).
2. En `shortRest(n)` y `longRest()`, reemplazar las restauraciones manuales de `wildShape` y de los `slots` por una llamada a `resetOn`, sin tocar el manejo de `hitDice` (FA-6) ni los PG.
3. El descanso largo sigue reiniciando los espacios de conjuro de todos los niveles (1–9). El corto no, salvo recursos `shortRest` (por ejemplo, los espacios de pacto cuando se modelen así).
4. El registro de la bitácora existente se mantiene; si se recuperó algún recurso, agregar su nombre al texto.

### T-234 — Corregir `dieType` (RF-236)

1. En `RestModal.astro:108`, leer `hitDice.die` en lugar de `hitDice.dieType`.
2. Probar que el modal muestra el dado correcto (d8, d6…).

## 7. Tests

`tests/resources.test.mjs` (importa de `src/scripts/dnd/resources.ts`):

- `parseUses`: `"2/3"` → `{remaining:2, max:3}`; `"3"` → `{remaining:3, max:3}`; `"una vez por turno"` → `null`; `undefined` → `null`.
- `spend`/`recover`: no pasan de `max` ni bajan de 0; devuelven copias (el original no cambia).
- `resetOn`: el corto reinicia solo `shortRest`; el largo reinicia `shortRest` y `longRest`; `turn` y `manual` quedan igual.
- `migrateSlots`: personaje con `level1/level2` termina con 1–9 y conserva lo gastado; segunda llamada devuelve `false`.
- `migrateResources`: personaje con `wildShape` y dos `features` (uno con `"2/3"`, otro con texto libre) produce 2 recursos (no 3); segunda llamada devuelve `false`.
- Regresión en `tests/calculations.test.mjs`: `recalculateCharacter` sobre un personaje viejo no lanza y es estable (aplicarla dos veces da el mismo resultado).

## 8. Verificación

```bash
pnpm test
pnpm build
```

Prueba manual (jugador con un personaje antiguo, en `/campaigns` con `pnpm emulators`):

1. Abrir un personaje con espacios gastados de nivel 1 y 2: siguen igual de gastados.
2. Abrir uno con Forma Salvaje parcialmente usada: el contador sigue igual y aparece el recurso en el registro.
3. Gastar un espacio de nivel 3 en un personaje al que se le dio total 1: se descuenta.
4. Descanso corto: se reinicia Forma Salvaje; los espacios 1–9 no.
5. Descanso largo: se reinician espacios y recursos.
6. Abrir `RestModal`: el dado de golpe mostrado es el del personaje (no `undefined`).

## 9. Fuera de alcance

- UI para crear y editar recursos a mano (la hace la Fase E, junto con el panel).
- Dados de golpe en el registro y las tiradas del descanso (H3).
- Espacios de pacto del brujo como recurso aparte (pregunta abierta de la spec).

## 10. Checklist de cierre

- [ ] T-230 … T-234 marcadas en la spec.
- [ ] `// DECISION:` en la sincronización hacia atrás (FA-2) y en el alias de `slots` (FA-4).
- [ ] `grep -rn "level1\|level2" src` sin usos pendientes, o cada uno justificado.
- [ ] `pnpm test` y `pnpm build` en verde.
